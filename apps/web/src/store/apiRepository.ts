import { supabase } from '../lib/supabase.js';
import type { Repository } from './repository.js';

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
