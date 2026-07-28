import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';

const XP_STREAK_DAY = 15;
const XP_PERFECT_DAY = 50;
const CHALLENGE_XP = { steps: 200, water: 150, streak: 300, workout: 250, weightloss: 400 };

function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

// clientDate is the user's own local "today" (the frontend already computes
// this correctly via date-fns local formatting) — we accept it so a user's
// calendar day is respected, but bound it to within 1 day of the server's own
// UTC date so a client can't arbitrarily backdate/replay awards.
export function resolveClientDate(clientDate) {
    const serverToday = todayUTC();
    if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return serverToday;
    const diffDays = Math.abs((new Date(clientDate) - new Date(serverToday)) / 86400000);
    return diffDays <= 1 ? clientDate : serverToday;
}

// ── Login streak ──────────────────────────────────────────────────────────────
// Replaces xpEngine.updateLoginStreak. The actual read-modify-write happens
// atomically inside the sync_login_streak SQL function (sql/001) — this just
// resolves the date and calls it, so two concurrent calls (e.g. AuthContext's
// SIGNED_IN handler and DashboardHome's mount effect firing close together)
// can't clobber each other the way the old client-side version could.
//
// Keyed by user_email rather than the Supabase auth user id: every table in
// this app (user_profiles included) is already queried and joined by
// user_email everywhere else in the codebase, and nothing confirms
// user_profiles carries a column tying it back to auth.users.id — email is
// the one identifier proven to exist and be unique per user.
export async function updateLoginStreak(userEmail, clientDate) {
    const supabase = getSupabaseAdmin();
    const date = resolveClientDate(clientDate);
    const { data, error } = await supabase.rpc('sync_login_streak', {
        p_user_email: userEmail,
        p_client_date: date,
        p_xp_amount: XP_STREAK_DAY,
    });
    if (error) throw error;
    return data; // { streak_updated, new_streak, xp_awarded }
}

// ── Mission / bonus rules — ported verbatim from DailyMissions.jsx ──────────
function checkMission(mission, data) {
    switch (mission.metric) {
        case 'water_ml':
            return data.water >= (mission.target_value || 2000);
        case 'protein_g': {
            const target = mission.target_pct_of_goal
                ? data.proteinTarget * mission.target_pct_of_goal
                : (mission.target_value || 0);
            if (!target) return false;
            return data.protein > 0 && data.protein >= target;
        }
        case 'steps':
            return data.steps >= (mission.target_value || 10000);
        case 'workout_done':
            return data.worked_out;
        case 'sleep_hours':
            return data.sleep >= (mission.target_value || 7);
        case 'calories_logged':
            return data.calories > 0;
        default:
            return false;
    }
}

function checkBonus(bonus, data, allDone, profile) {
    if (bonus.metric && bonus.metric !== 'workout_done') return checkMission(bonus, data);
    switch (bonus.mission_id) {
        case 'streak_bonus':
            return (profile?.login_streak || 0) >= (bonus.target_value || 7);
        case 'perfect_day':
            return allDone;
        case 'hydration_hero':
            return data.water >= (bonus.target_value || 3000);
        case 'step_legend':
            return data.steps >= (bonus.target_value || 15000);
        default:
            if (bonus.metric) return checkMission(bonus, data);
            if (bonus.category === 'streak') return (profile?.login_streak || 0) >= (bonus.target_value || 7);
            return false;
    }
}

// checkChallenge, FIXED: the original client version counted qualifying days
// / workout days across the user's ENTIRE history with no lower bound, so a
// brand-new challenge could read as instantly complete from history that
// predates it. Every qualifying-day count here is bounded to
// `date >= challenge.start_date` (falling back to created_at if a challenge
// somehow has no start_date).
function challengeStart(challenge) {
    return (challenge.start_date || (challenge.created_at || '').slice(0, 10) || '1970-01-01');
}

function checkChallenge(challenge, logs) {
    const { type, duration_days } = challenge;
    const required = Number(duration_days) || 7;
    const start = challengeStart(challenge);

    switch (type) {
        case 'steps': {
            const map = {};
            for (const s of logs.stepLogs) {
                if (s.date < start) continue;
                map[s.date] = (map[s.date] || 0) + (s.steps || 0);
            }
            return Object.values(map).filter((v) => v >= 10000).length >= required;
        }
        case 'water': {
            const map = {};
            for (const w of logs.waterLogs) {
                if (w.date < start) continue;
                map[w.date] = (map[w.date] || 0) + (w.amount_ml || 0);
            }
            return Object.values(map).filter((v) => v >= 2000).length >= required;
        }
        case 'streak':
            return (logs.profile?.login_streak || 0) >= required;
        case 'workout': {
            const days = new Set(logs.workoutLogs.filter((w) => w.date >= start).map((w) => w.date));
            return days.size >= required;
        }
        case 'weightloss': {
            const relevant = logs.weightLogs.filter((w) => w.date >= start).sort((a, b) => (a.date < b.date ? -1 : 1));
            if (relevant.length < 2) return false;
            return (relevant[0].weight_kg - relevant[relevant.length - 1].weight_kg) >= 1;
        }
        default:
            return false;
    }
}

// ── Daily mission/bonus/challenge sync ───────────────────────────────────────
// Replaces xpEngine.syncMissionXP AND DailyMissions.jsx's inline duplicate of
// the same logic. Unlike both of those, this derives every fact itself from
// the log tables — the client no longer gets to hand the backend a
// pre-computed XP number to trust.
export async function syncDailyProgress(userEmail, clientDate) {
    const supabase = getSupabaseAdmin();
    const date = resolveClientDate(clientDate);

    const [
        { data: profile }, { data: meals }, { data: waterLogs }, { data: stepLogsToday },
        { data: workoutsToday }, { data: sleepLogs }, { data: allMissions }, { data: challenges },
        { data: allStepLogs }, { data: allWaterLogs }, { data: allWorkoutLogs }, { data: allWeightLogs },
    ] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_email', userEmail).maybeSingle(),
        supabase.from('meal_logs').select('calories,protein').eq('user_email', userEmail).eq('date', date),
        supabase.from('water_logs').select('amount_ml').eq('user_email', userEmail).eq('date', date),
        supabase.from('step_logs').select('steps').eq('user_email', userEmail).eq('date', date),
        supabase.from('workout_logs').select('id').eq('user_email', userEmail).eq('date', date),
        supabase.from('sleep_logs').select('hours').eq('user_email', userEmail).eq('date', date),
        supabase.from('missions').select('*').eq('is_active', true),
        supabase.from('challenges').select('*').eq('is_active', true),
        supabase.from('step_logs').select('date,steps').eq('user_email', userEmail),
        supabase.from('water_logs').select('date,amount_ml').eq('user_email', userEmail),
        supabase.from('workout_logs').select('date').eq('user_email', userEmail),
        supabase.from('weight_logs').select('date,weight_kg').eq('user_email', userEmail),
    ]);

    const data = {
        calories: (meals || []).reduce((s, m) => s + (m.calories || 0), 0),
        protein: (meals || []).reduce((s, m) => s + (m.protein || 0), 0),
        proteinTarget: profile?.protein_target || 150,
        water: (waterLogs || []).reduce((s, w) => s + (w.amount_ml || 0), 0),
        steps: (stepLogsToday || []).reduce((s, s2) => s + (s2.steps || 0), 0),
        worked_out: (workoutsToday || []).length > 0,
        sleep: (sleepLogs || []).reduce((s, sl) => s + (sl.hours || 0), 0),
    };

    const regularMissions = (allMissions || []).filter((m) => !m.is_bonus);
    const bonusMissions = (allMissions || []).filter((m) => m.is_bonus);

    const completedMissions = regularMissions.filter((m) => checkMission(m, data));
    const allDone = completedMissions.length === regularMissions.length && regularMissions.length > 0;
    const totalMissionXP = completedMissions.reduce((s, m) => s + (m.xp_reward || 0), 0);

    const completedBonuses = bonusMissions.filter((b) => checkBonus(b, data, allDone, profile));
    const bonusXP = completedBonuses.reduce((s, b) => s + (b.xp_reward || 0), 0) + (allDone ? XP_PERFECT_DAY : 0);

    const syncXP = totalMissionXP + bonusXP;

    const logs = {
        profile,
        stepLogs: allStepLogs || [],
        waterLogs: allWaterLogs || [],
        workoutLogs: allWorkoutLogs || [],
        weightLogs: allWeightLogs || [],
    };
    const completedChallenges = (challenges || []).filter((ch) => checkChallenge(ch, logs));
    const earned = new Set(profile?.achievements || []);
    const newChallengeCandidates = completedChallenges
        .filter((ch) => !earned.has(`challenge_${ch.id}`))
        .map((ch) => ({ id: `challenge_${ch.id}`, xp: CHALLENGE_XP[ch.type] || 0 }));

    const results = { missionXpAwarded: 0, challengeXpAwarded: 0, newlyCompletedChallengeIds: [] };

    if (syncXP > 0) {
        const { data: syncResult, error: syncErr } = await supabase.rpc('sync_daily_xp', {
            p_user_email: userEmail, p_date: date, p_total_today: syncXP,
        });
        if (syncErr) throw syncErr;
        results.missionXpAwarded = syncResult?.xp_awarded || 0;
    }

    if (newChallengeCandidates.length > 0) {
        const { data: unlockResult, error: unlockErr } = await supabase.rpc('unlock_achievements', {
            p_user_email: userEmail, p_candidates: newChallengeCandidates,
        });
        if (unlockErr) throw unlockErr;
        results.challengeXpAwarded = unlockResult?.xp_awarded || 0;
        results.newlyCompletedChallengeIds = (unlockResult?.new_achievement_ids || []).map((id) => id.replace('challenge_', ''));
    }

    return results;
}

// ── Achievement catalog unlock ────────────────────────────────────────────────
// Replaces xpEngine.checkAchievements + awardXP. Fixes the reviewed
// `.includes('3')` substring bug: an explicit numeric `threshold` column on
// the achievements row wins if set; otherwise we fall back to the trailing
// number in achievement_id (e.g. "streak_30" -> 30) via regex, which is
// unambiguous (unlike substring matching, "30" never matches inside "3").
function resolveThreshold(ach) {
    if (ach.threshold != null) return Number(ach.threshold);
    if (ach.achievement_id === 'first_login') return 1;
    const match = /(\d+)/.exec(ach.achievement_id || '');
    return match ? Number(match[0]) : null;
}

export async function checkAndUnlockAchievements(userEmail) {
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_email', userEmail).maybeSingle();
    const { data: catalog } = await supabase.from('achievements').select('*').eq('is_active', true);

    const earned = new Set(profile?.achievements || []);
    const streak = profile?.login_streak || 0;
    const xp = profile?.total_xp || 0;

    const candidates = [];
    for (const ach of catalog || []) {
        if (earned.has(ach.achievement_id)) continue;
        const threshold = resolveThreshold(ach);
        if (threshold == null) continue;
        let unlocked = false;
        if (ach.category === 'streak') unlocked = streak >= threshold;
        else if (ach.category === 'consistency') unlocked = xp >= threshold;
        if (unlocked) candidates.push({ id: ach.achievement_id, xp: ach.xp_reward || 0 });
    }

    if (candidates.length === 0) return { newlyUnlocked: [], xpAwarded: 0 };

    const { data: result, error } = await supabase.rpc('unlock_achievements', {
        p_user_email: userEmail, p_candidates: candidates,
    });
    if (error) throw error;
    return { newlyUnlocked: result?.new_achievement_ids || [], xpAwarded: result?.xp_awarded || 0 };
}
