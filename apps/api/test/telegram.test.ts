import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';

let server: Server;
const port = 3009;
const testSecret = 'test-webhook-secret';

let supabaseAdmin: any;
let telegramRouter: any;
let originalFrom: any;

before(async () => {
  // Set up env variables mock BEFORE importing
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.TELEGRAM_WEBHOOK_SECRET = testSecret;
  process.env.TELEGRAM_BOT_TOKEN = '123456:mock-token';

  const supabaseMod = await import('../dist/supabase.js');
  const telegramMod = await import('../dist/controllers/telegram.js');

  supabaseAdmin = supabaseMod.supabaseAdmin;
  telegramRouter = telegramMod.telegramRouter;
  originalFrom = supabaseAdmin.from;

  const app = express();
  app.use(express.json());
  app.use('/api/v1/telegram', telegramRouter);
  server = app.listen(port);
});

after(() => {
  server.close();
  // Restore original supabaseAdmin.from
  if (supabaseAdmin && originalFrom) {
    supabaseAdmin.from = originalFrom;
  }
});

test('Telegram Webhook Idempotency (A3)', async () => {
  const processedUpdates = new Set<number>();
  const insertedIdeas: any[] = [];

  // Mock supabaseAdmin.from
  supabaseAdmin.from = (table: string): any => {
    if (table === 'processed_telegram_updates') {
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              if (processedUpdates.has(val)) {
                return { data: { update_id: val }, error: null };
              }
              return { data: null, error: null };
            }
          })
        }),
        insert: async (row: any) => {
          if (processedUpdates.has(row.update_id)) {
            return { error: { code: '23505', message: 'duplicate key' } };
          }
          processedUpdates.add(row.update_id);
          return { error: null };
        }
      };
    }

    if (table === 'telegram_links') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              return { data: { owner_id: 'test-user', linked_at: new Date().toISOString() }, error: null };
            }
          })
        }),
        update: () => ({
          eq: async () => {
            return { error: null };
          }
        })
      };
    }

    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => {
              return { data: [{ id: 'main-space', name: 'Main Space' }], error: null };
            }
          })
        })
      };
    }

    if (table === 'ideas') {
      return {
        insert: async (row: any) => {
          insertedIdeas.push(row);
          return { error: null };
        }
      };
    }

    // Fallback to original
    return originalFrom.call(supabaseAdmin, table);
  };

  // 1. Send first request
  const res1 = await fetch(`http://localhost:${port}/api/v1/telegram/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': testSecret
    },
    body: JSON.stringify({
      update_id: 4242,
      message: {
        chat: { id: 123 },
        from: { id: 123, username: 'tester' },
        text: 'This is a test idea'
      }
    })
  });

  assert.equal(res1.status, 200);
  const data1: any = await res1.json();
  assert.equal(data1.ok, true);
  assert.equal(insertedIdeas.length, 1);
  assert.equal(insertedIdeas[0].title, 'This is a test idea');
  assert.ok(processedUpdates.has(4242));

  // 2. Send duplicate request (same update_id)
  const res2 = await fetch(`http://localhost:${port}/api/v1/telegram/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': testSecret
    },
    body: JSON.stringify({
      update_id: 4242,
      message: {
        chat: { id: 123 },
        from: { id: 123, username: 'tester' },
        text: 'This is a test idea'
      }
    })
  });

  assert.equal(res2.status, 200);
  const data2: any = await res2.json();
  assert.equal(data2.ok, true);
  assert.equal(data2.ignored, true);
  // Ensure no duplicate idea was inserted
  assert.equal(insertedIdeas.length, 1);
});
