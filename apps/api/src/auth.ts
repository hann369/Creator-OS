import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IncomingMessage } from 'http';
import { supabaseAdmin } from './supabase.js';

// Bearer-token auth, shared by the REST controllers and the MCP resource server.

const supabaseUrl = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export function bearerToken(req: Pick<IncomingMessage, 'headers'>): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization ?? ''));
  return match ? match[1].trim() : null;
}

/** Validate a token and return its user id, or null. */
export async function resolveOwner(req: Pick<IncomingMessage, 'headers'>): Promise<{ ownerId: string } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { ownerId: data.user.id };
}

// ─── User-scoped access (MCP) ────────────────────────────────────────────────
//
// The REST controllers query through `supabaseAdmin`, which uses the service-role
// key and bypasses RLS — they compensate with explicit `owner_id` filters. The
// MCP connector must not: it is exposed to anyone with a Creator OS account, so a
// forgotten filter would be a cross-tenant leak rather than a missing row (the
// makeGraphRepository owner_id bug is the cautionary tale). Its queries run
// through a client carrying the caller's own JWT, which makes the existing
// `auth.uid() = owner_id` policies (migrations 0008 / 0016) the enforcement point.

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  /** Supabase client acting as this user — reads obey RLS. */
  db: SupabaseClient;
}

export function userScopedClient(token: string): SupabaseClient {
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is not set — cannot build a user-scoped Supabase client');
  }
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve a bearer token to a user with an RLS-scoped client. Null for any invalid token. */
export async function authenticate(token: string | null): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { userId: data.user.id, email: data.user.email ?? undefined, db: userScopedClient(token) };
}
