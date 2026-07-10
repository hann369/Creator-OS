import { supabase } from '../lib/supabase.js';
import type { Repository, Row } from './repository.js';

// The browser adapter behind the Repository port: the anon supabase-js client,
// reading and writing the existing per-type tables under RLS.
//
// This is the ONLY file in the store layer that knows Supabase exists.

export const supabaseRepository: Repository = {
  async list(table, workspaceId) {
    const query = supabase.from(table).select('*');
    const { data, error } = await (workspaceId ? query.eq('workspace_id', workspaceId) : query);
    // A missing table or a dropped connection must reject, not return [] — an
    // empty resolve would let the caller wipe its offline mirror.
    if (error) throw error;
    if (!data) throw new Error(`Repository.list: ${table} returned no data`);
    return data as Row[];
  },

  async upsert(table, row) {
    const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
    if (error) throw error;
  },

  async remove(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  },
};
