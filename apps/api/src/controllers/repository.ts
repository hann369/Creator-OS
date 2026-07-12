import { Router, type Request, type Response } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { repositoryTablePolicy } from './repositoryPolicy.js';

export const repositoryRouter = Router();

async function getAuthUser(req: Request) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// GET /api/v1/repository/:table
repositoryRouter.get('/:table', async (req: Request, res: Response) => {
  const table = req.params.table;
  // Allowlist first — cheap input validation, and the table is unreachable
  // whether or not the caller is authenticated.
  if (!repositoryTablePolicy(table)) {
    return res.status(400).json({ error: `Table '${table}' is not exposed through the repository API` });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : undefined;

  try {
    let query = supabaseAdmin.from(table).select('*').eq('owner_id', user.id);
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/repository/:table
repositoryRouter.post('/:table', async (req: Request, res: Response) => {
  const table = req.params.table;
  const policy = repositoryTablePolicy(table);
  if (!policy) {
    return res.status(400).json({ error: `Table '${table}' is not exposed through the repository API` });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const row = req.body;

  try {
    const rowWithOwner: Record<string, unknown> = {
      ...row,
      owner_id: user.id,
    };
    // Only stamp updated_at on tables that actually have the column.
    if (policy.stampUpdatedAt) {
      rowWithOwner.updated_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin.from(table).upsert(rowWithOwner, { onConflict: 'id' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/repository/:table/:id
repositoryRouter.delete('/:table/:id', async (req: Request, res: Response) => {
  const { table, id } = req.params;
  if (!repositoryTablePolicy(table)) {
    return res.status(400).json({ error: `Table '${table}' is not exposed through the repository API` });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { error } = await supabaseAdmin.from(table).delete().eq('id', id).eq('owner_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});
