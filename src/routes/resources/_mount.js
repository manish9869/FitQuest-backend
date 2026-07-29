import { listRows, getRow, createRow, updateRow, deleteRow, upsertRow } from '../../controllers/dataController.js';
import { requireAuth } from '../../middleware/auth.js';

// Binds one shared CRUD handler set to one fixed (table, path) pair. The
// handlers still read req.params.table — this just forces that value from
// the route registration itself instead of a client-suppliable URL segment,
// so there is no longer any wildcard ":table" a request can control. All
// authorization (tablePolicies.js) is unchanged; only how the handlers are
// reached changes.
function withTable(table, handler) {
    return (req, res, next) => {
        req.params.table = table;
        return handler(req, res, next);
    };
}

// requireAuth is applied per-route (not via router.use at the top of each
// domain file) because every domain router below is mounted at the same
// '/api' prefix in app.js — a path-less router.use(requireAuth) would fire
// for every /api/* request that reaches that router, not just the ones it
// owns, so an authenticated request handled by the 9th router would
// needlessly re-verify the session against Supabase 9 times on its way
// through. Scoping requireAuth to each exact registered path avoids that.
export function mountResource(router, resourcePath, table) {
    router.get(`/${resourcePath}`, requireAuth, withTable(table, listRows));
    router.get(`/${resourcePath}/:id`, requireAuth, withTable(table, getRow));
    router.post(`/${resourcePath}/upsert`, requireAuth, withTable(table, upsertRow));
    router.post(`/${resourcePath}`, requireAuth, withTable(table, createRow));
    router.patch(`/${resourcePath}/:id`, requireAuth, withTable(table, updateRow));
    router.delete(`/${resourcePath}/:id`, requireAuth, withTable(table, deleteRow));
}
