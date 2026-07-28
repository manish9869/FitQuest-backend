import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../config/env.js';

let _client = null;

// Service-role client — bypasses RLS entirely. Authorization for every
// request is enforced in this backend's code (auth.js + tablePolicies.js)
// BEFORE this client is ever touched, not by RLS. This client must never be
// reachable from anywhere except this backend process.
//
// We never use Supabase Realtime, but supabase-js still constructs a
// RealtimeClient synchronously inside createClient() and it throws on
// Node < 22 without a WebSocket implementation supplied — hence `ws` as a
// plain dependency here, not because this backend opens realtime channels.
export function getSupabaseAdmin() {
    if (_client) return _client;

    _client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        realtime: {
            transport: WebSocket,
        },
    });

    return _client;
}
