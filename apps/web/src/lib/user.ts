import type { User } from '@supabase/supabase-js';

// Derive a friendly display name / avatar initial from the signed-in Supabase
// user, so the UI stops hardcoding a single person ("Hannes"). Falls back through
// user_metadata → the email's local part → a neutral default.

export function displayName(user: User | null): string {
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const fromMeta = (meta?.full_name || meta?.name)?.trim();
  if (fromMeta) return fromMeta;

  const email = user?.email;
  if (email) {
    const first = email.split('@')[0].split(/[._-]/)[0];
    if (first) return first.charAt(0).toUpperCase() + first.slice(1);
  }
  return 'there';
}

/** Single uppercase initial for the avatar chip. */
export function userInitial(user: User | null): string {
  const name = displayName(user);
  const source = name === 'there' ? (user?.email ?? '?') : name;
  return source.charAt(0).toUpperCase();
}
