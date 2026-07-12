import { supabase } from '../lib/supabase.js';
import type { Repository } from './repository.js';

// The entity tables whose reads and writes go through the server API instead of
// the browser anon client (Roadmap Phase C). The API stamps owner_id server-side
// with the service role, so persistence no longer depends on the browser's RLS
// context. This list MUST stay a subset of the server allowlist in
// apps/api/src/controllers/repositoryPolicy.ts — a table the server does not
// expose returns 400, which the collection treats as "offline" and falls back to
// its local mirror. Anything not listed here keeps talking to Supabase directly.
export const API_ROUTED_TABLES = [
  'goals', 'documents', 'assets', 'people', 'moodboards', 'courses',
  'brand_identities', 'pipeline_cards', 'world_nodes', 'world_edges',
  'relationships', 'ideas', 'ideation_creators',
] as const;

export const apiRepository: Repository = {
  async list(table, workspaceId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const url = new URL(`/api/v1/repository/${table}`, window.location.origin);
    if (workspaceId) {
      url.searchParams.set('workspaceId', workspaceId);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`apiRepository.list failed: ${res.status}`);
    }
    return res.json();
  },

  async upsert(table, row) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`/api/v1/repository/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(row)
    });
    if (!res.ok) {
      throw new Error(`apiRepository.upsert failed: ${res.status}`);
    }
  },

  async remove(table, id) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`/api/v1/repository/${table}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`apiRepository.remove failed: ${res.status}`);
    }
  }
};
