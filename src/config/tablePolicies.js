// ── Table access policies ────────────────────────────────────────────────────
// This is the server-side authorization boundary that replaces "trust the
// client" — the frontend used to talk to Supabase directly with the anon key,
// which meant every table (including user_profiles.role/plan/total_xp) was
// writable by any authenticated browser tab. Now the browser only talks to
// this backend, and every request is checked against the policy below before
// touching Supabase (via the service-role key, in dataController.js).
//
// Per table:
//   read/create/update/delete:
//     'own'   — non-admins are scoped to rows where `ownerField` = their own
//               email; admins are unrestricted (bypass row-scoping entirely).
//     'admin' — only an admin may perform this operation, on any row.
//     'public'— any authenticated user may perform this (read-only catalogs).
//     'none'  — nobody may perform this via the generic proxy (not used yet,
//               reserved for tables that should only ever be touched by a
//               dedicated endpoint).
//   ownerField — column used to scope 'own' access. Always 'user_email' here,
//     matching how the rest of the app already queries these tables.
//   denyFields — fields a non-admin may NEVER set via create/update, even on
//     their own row, on top of the always-denied system fields (id,
//     created_at, updated_at, and the ownerField itself, which is forced
//     server-side rather than trusted from the client).
//   forceOnCreate — fields forced to a fixed value on non-admin create,
//     regardless of what the client sends (e.g. chat_messages.sender).
//
// Adding a new table/data source later (e.g. a future Fitbit/Google Fit sync)
// is a config edit here, not new endpoint code.

const ALWAYS_DENIED = ['id', 'created_at', 'updated_at'];

export const TABLE_POLICIES = {
    achievements: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    admin_notes: { read: 'admin', create: 'admin', update: 'admin', delete: 'admin' },
    admin_tasks: { read: 'admin', create: 'admin', update: 'admin', delete: 'admin' },
    // read: 'public' — MessageNotifier (global dashboard shell, runs for every
    // logged-in user) reads active rules client-side to decide which
    // notification banners to show. No sensitive data on this table (just
    // rule name/trigger/action config); write access stays admin-only.
    automations: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },

    body_progress: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },

    challenges: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },

    chat_messages: {
        read: 'own', create: 'own', update: 'admin', delete: 'admin',
        ownerField: 'user_email',
        denyFields: ['sender'],
        forceOnCreate: { sender: 'user' },
    },

    coach_plans: { read: 'own', create: 'admin', update: 'admin', delete: 'admin', ownerField: 'user_email' },
    exercises: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    feature_flags: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    food_items: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },

    grocery_lists: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    meal_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    sleep_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    step_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    supplement_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    user_supplements: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    water_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    weight_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },
    workout_logs: { read: 'own', create: 'own', update: 'own', delete: 'own', ownerField: 'user_email' },

    missions: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    programs: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    recipes: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    workout_plans: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
    workout_templates: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },

    user_feature_overrides: { read: 'own', create: 'admin', update: 'admin', delete: 'admin', ownerField: 'user_email' },

    // Onboarding creates this row itself ("create: own"), but the sensitive
    // gamification/authorization fields are denied even on their own row —
    // those can only be set by an admin (role/plan) or the dedicated
    // gamification endpoints (total_xp/achievements/streak fields). This is
    // the fix for the reviewed admin-role-escalation hole.
    user_profiles: {
        read: 'own', create: 'own', update: 'own', delete: 'admin',
        ownerField: 'user_email',
        denyFields: [
            'role', 'plan', 'total_xp', 'achievements',
            'login_streak', 'longest_streak', 'last_login_date',
            'last_mission_sync_date', 'last_mission_xp',
        ],
    },
};

export function getTablePolicy(table) {
    return TABLE_POLICIES[table] || null;
}

export function isKnownTable(table) {
    return Object.prototype.hasOwnProperty.call(TABLE_POLICIES, table);
}

export function stripDeniedFields(table, payload, { isAdmin }) {
    if (isAdmin) return { ...payload };
    const policy = getTablePolicy(table);
    const denied = new Set([...ALWAYS_DENIED, ...(policy?.ownerField ? [policy.ownerField] : []), ...(policy?.denyFields || [])]);
    const clean = {};
    for (const [key, value] of Object.entries(payload || {})) {
        if (!denied.has(key)) clean[key] = value;
    }
    return clean;
}
