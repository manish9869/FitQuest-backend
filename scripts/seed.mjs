// Dev utility — populates the catalog/reference tables (achievements,
// missions, challenges, exercises, recipes, food_items, workout_plans,
// workout_templates, programs) with sample data. Safe to re-run against an
// empty project; will insert duplicates if rows already exist (no
// upsert/conflict handling — this is a one-shot seeder, not a migration).
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
});

const achievements = [
    { achievement_id: 'first_login', name: 'First Step', description: 'Logged in for the first time', icon: 'Sparkles', color: 'emerald', xp_reward: 10, category: 'consistency', threshold: 1, sort_order: 0 },
    { achievement_id: 'streak_3', name: '3-Day Streak', description: 'Logged in 3 days in a row', icon: 'Flame', color: 'orange', xp_reward: 25, category: 'streak', threshold: 3, sort_order: 1 },
    { achievement_id: 'streak_7', name: 'Week Warrior', description: 'Logged in 7 days in a row', icon: 'Flame', color: 'orange', xp_reward: 75, category: 'streak', threshold: 7, sort_order: 2 },
    { achievement_id: 'streak_14', name: 'Fortnight Fighter', description: 'Logged in 14 days in a row', icon: 'Flame', color: 'red', xp_reward: 150, category: 'streak', threshold: 14, sort_order: 3 },
    { achievement_id: 'streak_30', name: 'Unstoppable', description: 'Logged in 30 days in a row', icon: 'Flame', color: 'red', xp_reward: 400, category: 'streak', threshold: 30, sort_order: 4 },
    { achievement_id: 'consistency_500', name: 'Rising Star', description: 'Earned 500 total XP', icon: 'Star', color: 'yellow', xp_reward: 50, category: 'consistency', threshold: 500, sort_order: 5 },
    { achievement_id: 'consistency_1000', name: 'XP Machine', description: 'Earned 1000 total XP', icon: 'Trophy', color: 'yellow', xp_reward: 100, category: 'consistency', threshold: 1000, sort_order: 6 },
    { achievement_id: 'consistency_5000', name: 'Legend', description: 'Earned 5000 total XP', icon: 'Crown', color: 'purple', xp_reward: 300, category: 'consistency', threshold: 5000, sort_order: 7 },
];

const missions = [
    { mission_id: 'hit_water_goal', label: 'Hydrate', description: 'Drink at least 2000ml of water', icon: 'Droplets', xp_reward: 15, color_hex: '#3b82f6', metric: 'water_ml', target_value: 2000, is_bonus: false, sort_order: 0 },
    { mission_id: 'log_protein', label: 'Protein Target', description: 'Hit 90% of your protein goal', icon: 'Utensils', xp_reward: 15, color_hex: '#22c55e', metric: 'protein_g', target_pct_of_goal: 0.9, is_bonus: false, sort_order: 1 },
    { mission_id: 'hit_step_goal', label: 'Step It Up', description: 'Reach 10,000 steps', icon: 'Footprints', xp_reward: 20, color_hex: '#f97316', metric: 'steps', target_value: 10000, is_bonus: false, sort_order: 2 },
    { mission_id: 'log_workout', label: 'Get Moving', description: 'Log a workout today', icon: 'Dumbbell', xp_reward: 25, color_hex: '#a855f7', metric: 'workout_done', is_bonus: false, sort_order: 3 },
    { mission_id: 'log_sleep', label: 'Rest Up', description: 'Sleep at least 7 hours', icon: 'Moon', xp_reward: 15, color_hex: '#6366f1', metric: 'sleep_hours', target_value: 7, is_bonus: false, sort_order: 4 },
    { mission_id: 'log_calories', label: 'Track Your Food', description: 'Log at least one meal', icon: 'Flame', xp_reward: 10, color_hex: '#eab308', metric: 'calories_logged', is_bonus: false, sort_order: 5 },
    { mission_id: 'streak_bonus', label: 'Streak Bonus', description: '7+ day login streak', icon: 'Flame', xp_reward: 30, color_hex: '#ef4444', target_value: 7, is_bonus: true, sort_order: 10 },
    { mission_id: 'hydration_hero', label: 'Hydration Hero', description: 'Drink 3000ml+ in one day', icon: 'Droplets', xp_reward: 20, color_hex: '#0ea5e9', target_value: 3000, is_bonus: true, sort_order: 11 },
    { mission_id: 'step_legend', label: 'Step Legend', description: 'Hit 15,000+ steps in one day', icon: 'Footprints', xp_reward: 25, color_hex: '#f97316', target_value: 15000, is_bonus: true, sort_order: 12 },
];

const challenges = [
    { name: '10K Steps Challenge', type: 'steps', duration_days: 7, description: 'Hit 10,000 steps for 7 days', reward_badge: '🏆 Step Champion', prize: '🎖️ 200 XP', is_active: true },
    { name: 'Hydration Challenge', type: 'water', duration_days: 7, description: 'Hit your water goal for 7 days', reward_badge: '💧 Hydration Master', prize: '🎖️ 150 XP', is_active: true },
    { name: '14-Day Streak', type: 'streak', duration_days: 14, description: 'Maintain a 14-day login streak', reward_badge: '🔥 Consistency King', prize: '🎖️ 300 XP', is_active: true },
    { name: 'Workout Warrior', type: 'workout', duration_days: 7, description: 'Log a workout 7 different days', reward_badge: '💪 Warrior Badge', prize: '🎖️ 250 XP', is_active: true },
];

const exercises = [
    { name: 'Barbell Bench Press', muscle_group: 'chest', difficulty: 'intermediate', equipment: 'barbell', category: 'strength', instructions: 'Lie on a flat bench, lower the bar to your chest, press up.', common_mistakes: 'Bouncing the bar off the chest, flaring elbows too wide.', tips: 'Keep shoulder blades retracted and feet flat on the floor.' },
    { name: 'Pull-Up', muscle_group: 'back', difficulty: 'intermediate', equipment: 'bodyweight', category: 'strength', instructions: 'Hang from a bar, pull your chin over the bar, lower with control.', common_mistakes: 'Using momentum/kipping when trying to build strength.', tips: 'Squeeze your shoulder blades together at the top.' },
    { name: 'Overhead Press', muscle_group: 'shoulders', difficulty: 'intermediate', equipment: 'barbell', category: 'strength', instructions: 'Press the bar from shoulder height straight overhead.', common_mistakes: 'Arching the lower back excessively.', tips: 'Brace your core like you\'re about to be punched.' },
    { name: 'Dumbbell Bicep Curl', muscle_group: 'arms', difficulty: 'beginner', equipment: 'dumbbells', category: 'strength', instructions: 'Curl the dumbbells up towards your shoulders, lower slowly.', common_mistakes: 'Swinging the weight using momentum.', tips: 'Keep elbows pinned to your sides throughout.' },
    { name: 'Plank', muscle_group: 'core', difficulty: 'beginner', equipment: 'bodyweight', category: 'mobility', instructions: 'Hold a straight-body position on forearms and toes.', common_mistakes: 'Letting the hips sag or pike up.', tips: 'Squeeze glutes and brace your abs like taking a punch.' },
    { name: 'Barbell Back Squat', muscle_group: 'legs', difficulty: 'intermediate', equipment: 'barbell', category: 'strength', instructions: 'Bar on upper back, squat down until thighs are parallel, drive back up.', common_mistakes: 'Knees caving inward, heels lifting off the floor.', tips: 'Keep chest up and drive through mid-foot.' },
    { name: 'Hip Thrust', muscle_group: 'glutes', difficulty: 'beginner', equipment: 'barbell', category: 'strength', instructions: 'Shoulders on a bench, drive hips up with a barbell across your hips.', common_mistakes: 'Hyperextending the lower back at the top.', tips: 'Tuck your chin and squeeze glutes hard at lockout.' },
    { name: 'Burpees', muscle_group: 'full_body', difficulty: 'intermediate', equipment: 'bodyweight', category: 'hiit', instructions: 'Squat, kick back to a plank, push-up, jump feet in, jump up.', common_mistakes: 'Sagging hips during the plank/push-up phase.', tips: 'Keep a steady pace you can sustain for the full set.' },
    { name: 'Jump Rope', muscle_group: 'cardio', difficulty: 'beginner', equipment: 'none', category: 'cardio', instructions: 'Jump continuously, rotating the rope with your wrists.', common_mistakes: 'Jumping too high, using arms/shoulders instead of wrists.', tips: 'Stay on the balls of your feet, small controlled hops.' },
    { name: 'Kettlebell Swing', muscle_group: 'full_body', difficulty: 'intermediate', equipment: 'kettlebell', category: 'strength', instructions: 'Hinge at the hips and swing the kettlebell to shoulder height using hip drive.', common_mistakes: 'Squatting the movement instead of hinging.', tips: 'Think "snap your hips" rather than lifting with your arms.' },
];

const recipes = [
    { name: 'Grilled Chicken & Rice Bowl', meal_category: 'lunch', difficulty: 'easy', cooking_time_min: 25, servings: 2, calories: 520, protein: 45, carbs: 55, fats: 12, ingredients: ['chicken breast', 'jasmine rice', 'broccoli', 'olive oil', 'garlic'], instructions: ['Season and grill chicken breast.', 'Cook rice.', 'Steam broccoli.', 'Combine and serve.'], tags: ['high_protein', 'meal_prep'], is_published: true },
    { name: 'Overnight Oats', meal_category: 'breakfast', difficulty: 'easy', cooking_time_min: 5, servings: 1, calories: 380, protein: 18, carbs: 52, fats: 10, ingredients: ['rolled oats', 'greek yogurt', 'almond milk', 'chia seeds', 'berries'], instructions: ['Mix all ingredients in a jar.', 'Refrigerate overnight.', 'Top with berries before eating.'], tags: ['vegetarian', 'meal_prep'], is_published: true },
    { name: 'Salmon & Asparagus', meal_category: 'dinner', difficulty: 'medium', cooking_time_min: 30, servings: 2, calories: 460, protein: 38, carbs: 12, fats: 26, ingredients: ['salmon fillet', 'asparagus', 'lemon', 'butter', 'garlic'], instructions: ['Season salmon and asparagus.', 'Bake at 400°F for 15 minutes.', 'Finish with lemon and butter.'], tags: ['keto', 'high_protein'], is_published: true },
    { name: 'Protein Smoothie', meal_category: 'snack', difficulty: 'easy', cooking_time_min: 5, servings: 1, calories: 290, protein: 30, carbs: 30, fats: 6, ingredients: ['whey protein', 'banana', 'almond milk', 'peanut butter', 'ice'], instructions: ['Blend all ingredients until smooth.'], tags: ['high_protein', 'quick'], is_published: true },
    { name: 'Turkey Chili', meal_category: 'dinner', difficulty: 'medium', cooking_time_min: 45, servings: 4, calories: 410, protein: 35, carbs: 38, fats: 12, ingredients: ['ground turkey', 'kidney beans', 'tomatoes', 'onion', 'chili spices'], instructions: ['Brown turkey with onion.', 'Add beans, tomatoes and spices.', 'Simmer 30 minutes.'], tags: ['meal_prep', 'high_protein'], is_published: true },
    { name: 'Pre-Workout Banana Toast', meal_category: 'pre_workout', difficulty: 'easy', cooking_time_min: 5, servings: 1, calories: 260, protein: 8, carbs: 45, fats: 6, ingredients: ['whole wheat toast', 'banana', 'honey', 'cinnamon'], instructions: ['Toast the bread.', 'Top with sliced banana, honey, and cinnamon.'], tags: ['quick', 'pre_workout'], is_published: true },
];

const foodItems = [
    { name: 'Chicken Breast (raw)', category: 'protein', calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fats_per_100g: 3.6, serving_size_g: 100, serving_label: '100g', is_verified: true, is_popular: true },
    { name: 'White Rice (cooked)', category: 'carbs', calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fats_per_100g: 0.3, serving_size_g: 100, serving_label: '100g', is_verified: true, is_popular: true },
    { name: 'Broccoli', category: 'vegetables', calories_per_100g: 34, protein_per_100g: 2.8, carbs_per_100g: 7, fats_per_100g: 0.4, serving_size_g: 100, serving_label: '100g', is_verified: true, is_popular: false },
    { name: 'Banana', category: 'fruits', calories_per_100g: 89, protein_per_100g: 1.1, carbs_per_100g: 23, fats_per_100g: 0.3, serving_size_g: 118, serving_label: '1 medium', is_verified: true, is_popular: true },
    { name: 'Greek Yogurt (plain)', category: 'dairy', calories_per_100g: 59, protein_per_100g: 10, carbs_per_100g: 3.6, fats_per_100g: 0.4, serving_size_g: 170, serving_label: '1 cup', is_verified: true, is_popular: true },
    { name: 'Rolled Oats', category: 'grains', calories_per_100g: 389, protein_per_100g: 17, carbs_per_100g: 66, fats_per_100g: 7, serving_size_g: 40, serving_label: '1/2 cup dry', is_verified: true, is_popular: true },
    { name: 'Almond Milk (unsweetened)', category: 'beverages', calories_per_100g: 13, protein_per_100g: 0.5, carbs_per_100g: 0.6, fats_per_100g: 1.1, serving_size_g: 240, serving_label: '1 cup', is_verified: true, is_popular: false },
    { name: 'Whey Protein Powder', category: 'supplements', calories_per_100g: 400, protein_per_100g: 80, carbs_per_100g: 8, fats_per_100g: 6, serving_size_g: 30, serving_label: '1 scoop', is_verified: true, is_popular: true },
];

const workoutPlans = [
    {
        name: 'Fat Loss Fundamentals', description: 'A 4-week full-body plan combining strength and HIIT to maximize calorie burn.',
        category: 'fat_loss', difficulty: 'beginner', duration_weeks: 4, days_per_week: 4, estimated_calories: 350, is_published: true,
        exercises: [
            { exercise_id: null, exercise_name: 'Barbell Back Squat', sets: 3, reps: 12, rest_sec: 60, order: 1 },
            { exercise_id: null, exercise_name: 'Burpees', sets: 3, reps: 15, rest_sec: 45, order: 2 },
            { exercise_id: null, exercise_name: 'Kettlebell Swing', sets: 3, reps: 20, rest_sec: 45, order: 3 },
        ],
    },
    {
        name: 'Push Pull Legs — Muscle Builder', description: 'A 6-week hypertrophy-focused split for building size and strength.',
        category: 'muscle_building', difficulty: 'intermediate', duration_weeks: 6, days_per_week: 6, estimated_calories: 400, is_published: true,
        exercises: [
            { exercise_id: null, exercise_name: 'Barbell Bench Press', sets: 4, reps: 8, rest_sec: 90, order: 1 },
            { exercise_id: null, exercise_name: 'Pull-Up', sets: 4, reps: 8, rest_sec: 90, order: 2 },
            { exercise_id: null, exercise_name: 'Overhead Press', sets: 3, reps: 10, rest_sec: 75, order: 3 },
        ],
    },
    {
        name: '15-Minute Home HIIT', description: 'No equipment needed — a fast, intense full-body session for busy days.',
        category: 'home_workout', difficulty: 'beginner', duration_weeks: 1, days_per_week: 5, estimated_calories: 220, is_published: true,
        exercises: [
            { exercise_id: null, exercise_name: 'Burpees', sets: 4, reps: 10, rest_sec: 30, order: 1 },
            { exercise_id: null, exercise_name: 'Plank', sets: 4, reps: 1, rest_sec: 30, order: 2 },
            { exercise_id: null, exercise_name: 'Jump Rope', sets: 4, reps: 1, rest_sec: 30, order: 3 },
        ],
    },
];

const workoutTemplates = [
    { name: 'Quick Strength Session', workout_type: 'strength', default_duration_min: 45, cal_per_min: 7, intensity: 'moderate', emoji: '🏋️', is_active: true, sort_order: 0 },
    { name: 'Cardio Blast', workout_type: 'cardio', default_duration_min: 30, cal_per_min: 10, intensity: 'high', emoji: '🏃', is_active: true, sort_order: 1 },
    { name: 'HIIT Circuit', workout_type: 'hiit', default_duration_min: 20, cal_per_min: 12, intensity: 'extreme', emoji: '🔥', is_active: true, sort_order: 2 },
    { name: 'Yoga Flow', workout_type: 'yoga', default_duration_min: 40, cal_per_min: 3, intensity: 'low', emoji: '🧘', is_active: true, sort_order: 3 },
    { name: 'Mobility & Stretch', workout_type: 'flexibility', default_duration_min: 15, cal_per_min: 2, intensity: 'low', emoji: '🤸', is_active: true, sort_order: 4 },
];

const programs = [
    { name: '12-Week Fat Loss Transformation', description: 'A complete nutrition + training system to lose fat sustainably.', target_audience: 'Beginners to intermediate', duration_weeks: 12, difficulty: 'beginner', category: 'fat_loss', included_features: ['meal_plans', 'workout_plans', 'coach_support'], price: 149, original_price: 199, is_featured: true, is_published: true, required_plan: 'basic' },
    { name: 'Elite Muscle Building', description: 'Advanced hypertrophy program with weekly coach check-ins.', target_audience: 'Intermediate to advanced lifters', duration_weeks: 16, difficulty: 'advanced', category: 'muscle_gain', included_features: ['workout_plans', 'coach_support', 'video_form_checks'], price: 249, original_price: 299, is_featured: true, is_published: true, required_plan: 'elite' },
    { name: 'Home Workout Starter', description: 'No-equipment program to build a consistent training habit.', target_audience: 'Complete beginners', duration_weeks: 6, difficulty: 'beginner', category: 'home_workout', included_features: ['workout_plans'], price: 0, original_price: 49, is_featured: false, is_published: true, required_plan: 'free' },
];

async function seed(table, rows) {
    const { data, error } = await supabase.from(table).insert(rows).select('id');
    if (error) {
        console.log(`${table}: ERROR - ${error.message}`);
        return 0;
    }
    console.log(`${table}: inserted ${data.length}`);
    return data.length;
}

async function main() {
    await seed('achievements', achievements);
    await seed('missions', missions);
    await seed('challenges', challenges);
    await seed('exercises', exercises);
    await seed('recipes', recipes);
    await seed('food_items', foodItems);
    await seed('workout_plans', workoutPlans);
    await seed('workout_templates', workoutTemplates);
    await seed('programs', programs);
    console.log('done');
}

main();
