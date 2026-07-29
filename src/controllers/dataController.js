import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { getTablePolicy, isKnownTable, stripDeniedFields } from '../config/tablePolicies.js';

function isOpAllowed(policy, op, isAdmin) {
    const rule = policy[op];
    if (!rule || rule === 'none') return false;
    if (isAdmin) return true;
    if (rule === 'admin') return false;
    return true; // 'own' or 'public' — row scoping / field stripping happens separately
}

function policyError(res, message = 'Not allowed.') {
    return res.status(403).json({ error: message });
}

// ── GET /api/data/:table ──────────────────────────────────────────────────────
// Query params: orderBy, ascending ('true'/'false'), plus any column=value
// filter (comma-separated value => IN filter, matching entities.js's array-
// value filter() semantics). Non-admins on an 'own' table are ALWAYS forced
// to their own rows regardless of what filter params they send.
export async function listRows(req, res, next) {
    try {
        const { table } = req.params;
        if (!isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });
        const policy = getTablePolicy(table);
        if (!isOpAllowed(policy, 'read', req.isAdmin)) return policyError(res);

        const { orderBy = 'created_at', ascending = 'false', ...rawFilters } = req.query;
        const supabase = getSupabaseAdmin();
        let query = supabase.from(table).select('*');

        if (policy.read === 'own' && !req.isAdmin) {
            query = query.eq(policy.ownerField, req.user.email);
        }

        for (const [col, rawVal] of Object.entries(rawFilters)) {
            if (policy.read === 'own' && !req.isAdmin && col === policy.ownerField) continue;
            const val = String(rawVal);
            query = val.includes(',') ? query.in(col, val.split(',')) : query.eq(col, val);
        }

        query = query.order(orderBy, { ascending: ascending === 'true' });

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
}

// ── GET /api/data/:table/:id ──────────────────────────────────────────────────
export async function getRow(req, res, next) {
    try {
        const { table, id } = req.params;
        if (!isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });
        const policy = getTablePolicy(table);
        if (!isOpAllowed(policy, 'read', req.isAdmin)) return policyError(res);

        const supabase = getSupabaseAdmin();
        let query = supabase.from(table).select('*').eq('id', id);
        if (policy.read === 'own' && !req.isAdmin) query = query.eq(policy.ownerField, req.user.email);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Not found.' });
        res.json(data);
    } catch (err) {
        next(err);
    }
}

// ── POST /api/data/:table ─────────────────────────────────────────────────────
export async function createRow(req, res, next) {
    try {
        const { table } = req.params;
        if (!isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });
        const policy = getTablePolicy(table);
        if (!isOpAllowed(policy, 'create', req.isAdmin)) return policyError(res);

        const payload = stripDeniedFields(table, req.body, { isAdmin: req.isAdmin });

        if (!req.isAdmin) {
            if (policy.ownerField) payload[policy.ownerField] = req.user.email; // forced, never trusted from client
            if (policy.forceOnCreate) Object.assign(payload, policy.forceOnCreate);
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from(table).insert([payload]).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        next(err);
    }
}

// ── PATCH /api/data/:table/:id ─────────────────────────────────────────────────
export async function updateRow(req, res, next) {
    try {
        const { table, id } = req.params;
        if (!isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });
        const policy = getTablePolicy(table);
        if (!isOpAllowed(policy, 'update', req.isAdmin)) return policyError(res);

        const payload = stripDeniedFields(table, req.body, { isAdmin: req.isAdmin });

        const supabase = getSupabaseAdmin();
        let query = supabase.from(table).update(payload).eq('id', id);
        // Scoping this to the caller's own row is what stops a user updating
        // someone else's row by guessing/reusing an id — 0 rows match if the
        // id belongs to another user, so this comes back 404, not leaked data.
        if (policy.update === 'own' && !req.isAdmin) query = query.eq(policy.ownerField, req.user.email);

        const { data, error } = await query.select().maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Not found or not yours.' });
        res.json(data);
    } catch (err) {
        next(err);
    }
}

// ── DELETE /api/data/:table/:id ────────────────────────────────────────────────
export async function deleteRow(req, res, next) {
    try {
        const { table, id } = req.params;
        if (!isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });
        const policy = getTablePolicy(table);
        if (!isOpAllowed(policy, 'delete', req.isAdmin)) return policyError(res);

        const supabase = getSupabaseAdmin();
        let query = supabase.from(table).delete().eq('id', id);
        if (policy.delete === 'own' && !req.isAdmin) query = query.eq(policy.ownerField, req.user.email);

        const { error } = await query;
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

// ── POST /api/data/:table/upsert ──────────────────────────────────────────────
export async function upsertRow(req, res, next) {
    try {
        const { table } = req.params;
        if (!isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });
        const policy = getTablePolicy(table);
        const canCreate = isOpAllowed(policy, 'create', req.isAdmin);
        const canUpdate = isOpAllowed(policy, 'update', req.isAdmin);
        if (!canCreate && !canUpdate) return policyError(res);

        const { payload, onConflict = 'id' } = req.body || {};

        // Forcing ownerField into the payload is only safe when the conflict
        // target IS the ownerField (e.g. upsert-by-user_email) — the upsert
        // can then only ever touch a row that already matches the caller's
        // own email. If onConflict were something else (e.g. 'id') on an
        // 'own' table, a non-admin could upsert with someone else's row id
        // and this same forced field would silently reassign that existing
        // row's ownership to themselves (Postgres's ON CONFLICT DO UPDATE
        // matches and overwrites the existing row, not just their own).
        if (!req.isAdmin && policy.ownerField && onConflict !== policy.ownerField) {
            return policyError(res, `Upsert on this resource must use onConflict: '${policy.ownerField}'.`);
        }

        const clean = stripDeniedFields(table, payload, { isAdmin: req.isAdmin });
        if (!req.isAdmin && policy.ownerField) clean[policy.ownerField] = req.user.email;

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from(table).upsert([clean], { onConflict }).select().single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
}
