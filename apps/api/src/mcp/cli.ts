import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import type { AuthenticatedUser } from '../auth.js';
import { createMcpServer } from './server.js';

// Setup environment from process.env
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceKey && !anonKey)) {
  console.error('Error: SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY must be set in your environment.');
  process.exit(1);
}

// In local mode, using the service role key is the most robust way because it bypasses RLS
// constraints for the local superuser. We scope queries to the USER_ID where necessary (e.g. search_library).
const dbKey = serviceKey || anonKey!;
const db = createClient(supabaseUrl, dbKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const userId = process.env.USER_ID || '1906f76f-a35c-4c13-8cf4-0b6298fdbf18'; // default to user Hannes

const user: AuthenticatedUser = {
  userId,
  email: 'local-cli@creator-os.internal',
  db
};

const server = createMcpServer(user);
const transport = new StdioServerTransport();

await server.connect(transport);
console.error('Creator OS MCP Server running on stdio');
