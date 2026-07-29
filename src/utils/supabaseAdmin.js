import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../config/env.js';

let _client = null;

const clientOptions = {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
    // We never use Supabase Realtime, but supabase-js still constructs a
    // RealtimeClient synchronously inside createClient() and it throws on
    // Node < 22 without a WebSocket implementation supplied — hence `ws` as
    // a plain dependency here, not because this backend opens realtime
    // channels.
    realtime: {
        transport: WebSocket,
    },
};

// Service-role SINGLETON client — reused across every request in this
// process for plain data operations (.from(), .storage, .auth.getUser(token)
// with an explicit token, .auth.admin.*). All of those are stateless: they
// never change what identity this client authenticates as. Authorization for
// every request is enforced in this backend's code (tablePolicies.js) before
// this client is ever touched, not by RLS.
//
// NEVER call auth.signUp / auth.signInWithPassword / auth.refreshSession (or
// anything else that calls the SDK's internal setSession()) on this client —
// supabase-js client instances are stateful: once a session is established,
// the client silently switches its Authorization header from the API key to
// that session's access token for every subsequent request, for the
// lifetime of the client. Since this client is a shared singleton, doing
// that would make it authenticate as whichever user last signed in/up,
// for every OTHER request in the process until the next such call — a
// cross-request identity bug, not just a one-off failure. Use
// createAuthClient() below for any of those operations instead.
export function getSupabaseAdmin() {
    if (_client) return _client;
    _client = createClient(config.supabase.url, config.supabase.serviceRoleKey, clientOptions);
    return _client;
}

// Fresh, throwaway client for auth operations that mutate session state
// (signUp, signInWithPassword, refreshSession). Never cached, never reused —
// each call gets its own instance so the session mutation is contained to
// that one operation and discarded afterward, instead of leaking into the
// shared getSupabaseAdmin() singleton.
export function createAuthClient() {
    return createClient(config.supabase.url, config.supabase.serviceRoleKey, clientOptions);
}
