import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';

// Ported from the frontend's shared/lib/fitnessUtils.js — same formulas,
// just invoked with fixed defaults here instead of user-entered stats.
function calculateBMR(weight, height, age) {
    return 10 * weight + 6.25 * height - 5 * age + 5;
}
function calculateTDEE(bmr, activityLevel) {
    const multipliers = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725, extremely_active: 1.9 };
    return Math.round(bmr * (multipliers[activityLevel] || 1.55));
}
function calculateCalorieTarget(tdee, goal) {
    const adjustments = { fat_loss: -500, muscle_gain: 300, strength: 200, general_fitness: 0, athletic_performance: 400 };
    return Math.round(tdee + (adjustments[goal] || 0));
}
function calculateMacros(calories, goal) {
    const ratios = {
        fat_loss: { protein: 0.35, carbs: 0.35, fat: 0.30 },
        muscle_gain: { protein: 0.30, carbs: 0.45, fat: 0.25 },
        strength: { protein: 0.30, carbs: 0.40, fat: 0.30 },
        general_fitness: { protein: 0.25, carbs: 0.45, fat: 0.30 },
        athletic_performance: { protein: 0.25, carbs: 0.50, fat: 0.25 },
    };
    const r = ratios[goal] || ratios.general_fitness;
    return {
        protein: Math.round((calories * r.protein) / 4),
        carbs: Math.round((calories * r.carbs) / 4),
        fat: Math.round((calories * r.fat) / 9),
    };
}

// Generic starting point — same defaults the old onboarding wizard's first
// step pre-filled (age 25, 175cm, 80kg, moderate activity, fat-loss goal).
// The user can refine all of this later via Profile/Settings; the point is
// that login never blocks on a wizard.
const DEFAULTS = {
    age: 25, height_cm: 175, weight_kg: 80, target_weight_kg: 70,
    fitness_goal: 'fat_loss', activity_level: 'moderately_active',
    sleep_hours: 7, workout_frequency: 4,
};

// ── ensureProfile ─────────────────────────────────────────────────────────────
// Called after every successful login/signup/OAuth callback. Replaces the
// old Onboarding.jsx, which was the only place a UserProfile row ever got
// created — that gated every new signup behind a 5-step wizard before the
// dashboard would even load. Now a default profile exists the instant a
// user is authenticated; nothing in the app has to wait on it.
export async function ensureProfile(user) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_email', user.email)
        .maybeSingle();

    if (existing) return existing;

    const bmr = calculateBMR(DEFAULTS.weight_kg, DEFAULTS.height_cm, DEFAULTS.age);
    const tdee = calculateTDEE(bmr, DEFAULTS.activity_level);
    const calorieTarget = calculateCalorieTarget(tdee, DEFAULTS.fitness_goal);
    const macros = calculateMacros(calorieTarget, DEFAULTS.fitness_goal);

    const { data, error } = await supabase
        .from('user_profiles')
        .insert([{
            id: user.id,
            user_email: user.email,
            ...DEFAULTS,
            daily_calorie_target: calorieTarget,
            protein_target: macros.protein,
            carb_target: macros.carbs,
            fat_target: macros.fat,
            water_goal_ml: Math.round(DEFAULTS.weight_kg * 35),
            step_goal: 10000,
            onboarding_complete: true,
            achievements: ['first_login'],
        }])
        .select('id')
        .single();

    if (error) throw error;
    return data;
}
