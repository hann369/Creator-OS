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
  process.env.MISTRAL_API_KEY = 'mock-mistral-key';

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

test('Telegram Voice Memo Transcription (B1)', async () => {
  const processedUpdates = new Set<number>();
  const insertedIdeas: any[] = [];
  const sentMessages: any[] = [];

  // Mock supabaseAdmin.from
  supabaseAdmin.from = (table: string): any => {
    if (table === 'processed_telegram_updates') {
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              return { data: null, error: null };
            }
          })
        }),
        insert: async (row: any) => {
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

    return originalFrom.call(supabaseAdmin, table);
  };

  // Mock globalThis.fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    if (urlStr.includes('/getFile')) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice_file.ogg' } }));
    }
    if (urlStr.includes('/file/bot')) {
      return new Response(new Uint8Array([1, 2, 3]));
    }
    if (urlStr.includes('/audio/transcriptions')) {
      return new Response(JSON.stringify({ text: 'This is my transcribed voice idea!' }));
    }
    if (urlStr.includes('/sendMessage')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true }));
    }
    return originalFetch(url, options);
  };

  try {
    const res = await fetch(`http://localhost:${port}/api/v1/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testSecret
      },
      body: JSON.stringify({
        update_id: 5001,
        message: {
          chat: { id: 123 },
          from: { id: 123, username: 'tester' },
          voice: {
            file_id: 'voice-file-id-123',
            mime_type: 'audio/ogg'
          }
        }
      })
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);

    // Assert idea was inserted with the transcribed text
    assert.equal(insertedIdeas.length, 1);
    assert.equal(insertedIdeas[0].title, 'This is my transcribed voice idea!');
    
    // Assert status and transcript messages were sent back to user
    assert.ok(sentMessages.some(m => m.text.includes('Transkribiere')));
    assert.ok(sentMessages.some(m => m.text.includes('Transkript') && m.text.includes('This is my transcribed voice idea!')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram Instant Recall (B2)', async () => {
  const sentMessages: any[] = [];

  // Mock supabaseAdmin.from
  supabaseAdmin.from = (table: string): any => {
    if (table === 'processed_telegram_updates') {
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              return { data: null, error: null };
            }
          })
        }),
        insert: async (row: any) => {
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
        })
      };
    }

    if (table === 'ideas') {
      return {
        select: () => ({
          eq: () => ({
            or: () => ({
              limit: async () => {
                return {
                  data: [{ title: 'SEO strategies', pain_points: 'high competition', packaging_questions: 'what works?' }],
                  error: null
                };
              }
            })
          })
        })
      };
    }

    if (table === 'documents') {
      return {
        select: () => ({
          eq: () => ({
            or: () => ({
              limit: async () => {
                return {
                  data: [{ title: 'SEO Checklist', body: '1. Keywords' }],
                  error: null
                };
              }
            })
          })
        })
      };
    }

    return originalFrom.call(supabaseAdmin, table);
  };

  // Mock globalThis.fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    if (urlStr.includes('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Hier ist eine Zusammenfassung über deine SEO-Ideen.' } }]
      }));
    }
    if (urlStr.includes('/sendMessage')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true }));
    }
    return originalFetch(url, options);
  };

  try {
    const res = await fetch(`http://localhost:${port}/api/v1/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testSecret
      },
      body: JSON.stringify({
        update_id: 6001,
        message: {
          chat: { id: 123 },
          from: { id: 123, username: 'tester' },
          text: '/recall SEO'
        }
      })
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);

    // Assert status and summary messages were sent back to user
    assert.ok(sentMessages.some(m => m.text.includes('Suche in deinem Gehirn')));
    assert.ok(sentMessages.some(m => m.text.includes('Hier ist eine Zusammenfassung über deine SEO-Ideen.')));
    assert.ok(sentMessages.some(m => m.text.includes('Gefundene Quellen') && m.text.includes('SEO strategies') && m.text.includes('SEO Checklist')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram Direct Command /doc (B2 extension)', async () => {
  const insertedDocuments: any[] = [];
  const sentMessages: any[] = [];

  supabaseAdmin.from = (table: string): any => {
    if (table === 'processed_telegram_updates') {
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              return { data: null, error: null };
            }
          })
        }),
        insert: async (row: any) => {
          return { error: null };
        }
      };
    }

    if (table === 'telegram_links') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              return { data: { owner_id: 'test-user', linked_at: new Date().toISOString(), active_project_id: 'main-space' }, error: null };
            }
          })
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

    if (table === 'documents') {
      return {
        insert: async (row: any) => {
          insertedDocuments.push(row);
          return { error: null };
        }
      };
    }

    return originalFrom.call(supabaseAdmin, table);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    if (urlStr.includes('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Mock Title' } }]
      }));
    }
    if (urlStr.includes('/sendMessage')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true }));
    }
    return originalFetch(url, options);
  };

  try {
    const res = await fetch(`http://localhost:${port}/api/v1/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testSecret
      },
      body: JSON.stringify({
        update_id: 7001,
        message: {
          chat: { id: 123 },
          from: { id: 123, username: 'tester' },
          text: '/doc Dies ist eine wichtige Projektskizze'
        }
      })
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);

    // Assert document was created
    assert.equal(insertedDocuments.length, 1);
    assert.equal(insertedDocuments[0].body, 'Dies ist eine wichtige Projektskizze');
    assert.equal(insertedDocuments[0].title, 'Mock Title');
    
    // Assert confirmation was sent
    assert.ok(sentMessages.some(m => m.text.includes('Dokument gespeichert') && m.text.includes('Main Space')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram Toggle Idea to Document Callback (B2 extension)', async () => {
  let deletedIdeaId = '';
  const insertedDocuments: any[] = [];
  let answerCallbackText = '';

  supabaseAdmin.from = (table: string): any => {
    if (table === 'processed_telegram_updates') {
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              return { data: null, error: null };
            }
          })
        }),
        insert: async (row: any) => {
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
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              return { data: { title: 'Mein urspruenglicher Text' }, error: null };
            }
          })
        }),
        delete: () => ({
          eq: async (col: string, val: any) => {
            deletedIdeaId = val;
            return { error: null };
          }
        })
      };
    }

    if (table === 'documents') {
      return {
        insert: async (row: any) => {
          insertedDocuments.push(row);
          return { error: null };
        }
      };
    }

    return originalFrom.call(supabaseAdmin, table);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    if (urlStr.includes('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Umgewandelter Titel' } }]
      }));
    }
    if (urlStr.includes('/answerCallbackQuery')) {
      const body = JSON.parse(options.body);
      answerCallbackText = body.text;
      return new Response(JSON.stringify({ ok: true }));
    }
    if (urlStr.includes('/editMessageText')) {
      return new Response(JSON.stringify({ ok: true }));
    }
    return originalFetch(url, options);
  };

  try {
    const res = await fetch(`http://localhost:${port}/api/v1/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': testSecret
      },
      body: JSON.stringify({
        update_id: 8001,
        callback_query: {
          id: 'cb-123',
          from: { id: 123 },
          message: {
            message_id: 999,
            chat: { id: 123 }
          },
          data: 'todoc:idea-1234:main-space'
        }
      })
    });

    assert.equal(res.status, 200);
    
    // Assert old idea was deleted
    assert.equal(deletedIdeaId, 'idea-1234');
    
    // Assert new document was created
    assert.equal(insertedDocuments.length, 1);
    assert.equal(insertedDocuments[0].body, 'Mein urspruenglicher Text');
    assert.equal(insertedDocuments[0].title, 'Umgewandelter Titel');
    assert.equal(insertedDocuments[0].project_id, 'main-space');
    assert.equal(answerCallbackText, 'In Dokument umgewandelt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
