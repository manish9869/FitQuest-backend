import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';

function daysAgo(n) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

// evaluateTrigger — ported from automationEngine.js, with the reviewed
// `missed_workouts` bug fixed: the original looped exactly `trigger_value`
// days and required ALL of them missed, making it mathematically identical
// to `inactivity`. Here the lookback window is decoupled from the threshold
// (2x the threshold, minimum 7 days) so it actually means "missed N out of a
// wider window," not "missed every single day."
function evaluateTrigger(rule, snapshot) {
    const val = Number(rule.trigger_value) || 0;

    switch (rule.trigger) {
        case 'missed_workouts': {
            const threshold = val || 3;
            const window = Math.max(threshold * 2, 7);
            let missed = 0;
            for (let i = 1; i <= window; i++) {
                const d = daysAgo(i);
                if (!snapshot.recentWorkouts.some((w) => w.date === d)) missed++;
            }
            return missed >= threshold;
        }
        case 'low_water':
            return snapshot.todayWater < val;
        case 'streak_milestone':
            return snapshot.loginStreak === val;
        case 'inactivity': {
            const days = val || 3;
            const cutoff = daysAgo(days);
            return !snapshot.recentWorkouts.some((w) => w.date >= cutoff);
        }
        case 'low_calories':
            return snapshot.todayCalories < val;
        default:
            return false;
    }
}

async function executeAction(supabase, rule, userEmail, userName, todayStr) {
    switch (rule.action) {
        case 'send_reminder':
        case 'send_message': {
            const { data: existing } = await supabase.from('chat_messages').select('*').eq('user_email', userEmail).eq('sender', 'admin');
            const alreadySent = (existing || []).some((m) => m.text === rule.action_value && (m.sent_at || '').startsWith(todayStr));
            if (!alreadySent) {
                await supabase.from('chat_messages').insert([{
                    user_email: userEmail, sender: 'admin', text: rule.action_value, read: false, sent_at: new Date().toISOString(),
                }]);
            }
            break;
        }
        // 'unlock_badge' is handled by the caller (runAutomationsForUser),
        // which already has the user's id needed for the atomic RPC.
        case 'notify_trainer': {
            await supabase.from('chat_messages').insert([{
                user_email: userEmail, sender: 'admin', text: `⚠️ Trainer Alert for ${userName}: ${rule.action_value}`, read: false, sent_at: new Date().toISOString(),
            }]);
            break;
        }
        default:
            break;
    }
}

// runAutomationsForUser — replaces automationEngine.runAutomations. Derives
// its own snapshot from the log tables instead of trusting one from the
// client, and moves "already ran today" dedup from localStorage to the
// automation_runs table (unique on rule_id+user_email+run_date) — claimed
// BEFORE the action executes so a race can't fire the same rule twice.
export async function runAutomationsForUser({ userEmail, userName, clientDate }) {
    const supabase = getSupabaseAdmin();
    const today = clientDate || new Date().toISOString().slice(0, 10);

    const { data: rules } = await supabase.from('automations').select('*').eq('is_active', true);
    if (!rules?.length) return { ran: [] };

    const [{ data: profile }, { data: recentWorkouts }, { data: todayWaterLogs }, { data: todayMeals }] = await Promise.all([
        supabase.from('user_profiles').select('login_streak').eq('user_email', userEmail).maybeSingle(),
        supabase.from('workout_logs').select('date').eq('user_email', userEmail).gte('date', daysAgo(60)),
        supabase.from('water_logs').select('amount_ml').eq('user_email', userEmail).eq('date', today),
        supabase.from('meal_logs').select('calories').eq('user_email', userEmail).eq('date', today),
    ]);

    const snapshot = {
        recentWorkouts: recentWorkouts || [],
        todayWater: (todayWaterLogs || []).reduce((s, w) => s + (w.amount_ml || 0), 0),
        todayCalories: (todayMeals || []).reduce((s, m) => s + (m.calories || 0), 0),
        loginStreak: profile?.login_streak || 0,
    };

    const ran = [];
    for (const rule of rules) {
        if (!evaluateTrigger(rule, snapshot)) continue;

        // Claim the "ran today" slot first — insert fails with a unique-
        // violation if another request already claimed it, so the action
        // below can never double-fire under a race.
        const { error: claimErr } = await supabase.from('automation_runs').insert([
            { rule_id: rule.id, user_email: userEmail, run_date: today },
        ]);
        if (claimErr) continue; // already ran today (unique constraint) or claim failed — skip

        if (rule.action === 'unlock_badge') {
            await supabase.rpc('unlock_achievements', { p_user_email: userEmail, p_candidates: [{ id: rule.action_value, xp: 0 }] });
        } else {
            await executeAction(supabase, rule, userEmail, userName, today);
        }

        await supabase.from('automations').update({ run_count: (rule.run_count || 0) + 1 }).eq('id', rule.id);
        ran.push(rule.id);
    }

    return { ran };
}
