import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';

let server: Server;
const port = 3009;
const testSecret = 'test-webhook-secret';
const testCronSecret = 'test-cron-secret';

let supabaseAdmin: any;
let telegramRouter: any;
let originalFrom: any;

before(async () => {
  // Set up env variables mock BEFORE importing
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.TELEGRAM_WEBHOOK_SECRET = testSecret;
  process.env.CRON_SECRET = testCronSecret;
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
    assert.equal(insertedDocuments[0].workspace_id, 'main-space');
    assert.equal(answerCallbackText, 'In Dokument umgewandelt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram URL Ingestion (B3)', async () => {
  const insertedIdeas: any[] = [];
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    
    // Scraper fetch mock
    if (urlStr.includes('nextjs.org')) {
      return new Response(`
        <html>
          <head>
            <title>Next.js by Vercel</title>
            <meta name="description" content="The React Framework for the Web">
          </head>
          <body>Hello</body>
        </html>
      `);
    }

    if (urlStr.includes('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"title":"Next.js React Framework","summary":"Next.js is a React framework by Vercel."}' } }]
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
        update_id: 9001,
        message: {
          chat: { id: 123 },
          from: { id: 123, username: 'tester' },
          text: 'Schau dir mal https://nextjs.org an'
        }
      })
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);

    // Assert idea was created from URL
    assert.equal(insertedIdeas.length, 1);
    assert.equal(insertedIdeas[0].title, 'Next.js React Framework');
    assert.equal(insertedIdeas[0].inspiration_url, 'https://nextjs.org');
    assert.equal(insertedIdeas[0].pain_points, 'Next.js is a React framework by Vercel.');
    
    // Assert confirmation was sent with source link
    assert.ok(sentMessages.some(m => m.text.includes('Lese Website')));
    assert.ok(sentMessages.some(m => m.text.includes('Next.js React Framework') && m.text.includes('https://nextjs.org')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram Image Ingestion (B4)', async () => {
  const insertedIdeas: any[] = [];
  const insertedAssets: any[] = [];
  const sentMessages: any[] = [];
  let storageUploadCalled = false;
  let signedUrlCalled = false;

  const originalStorage = supabaseAdmin.storage;
  // Mock Storage operations
  supabaseAdmin.storage = {
    from: (bucket: string): any => {
      assert.equal(bucket, 'course-media');
      return {
        upload: async (path: string, body: any, options: any) => {
          storageUploadCalled = true;
          return { data: {}, error: null };
        },
        createSignedUrl: async (path: string, expires: number) => {
          signedUrlCalled = true;
          return { data: { signedUrl: 'https://mock.supabase.co/signed/file.jpg' }, error: null };
        }
      };
    }
  } as any;

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

    if (table === 'assets') {
      return {
        insert: async (row: any) => {
          insertedAssets.push(row);
          return { error: null };
        }
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

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    
    // Telegram getFile metadata mock
    if (urlStr.includes('/getFile')) {
      return new Response(JSON.stringify({
        ok: true,
        result: { file_path: 'photos/photo.jpg' }
      }));
    }

    // Telegram file content mock
    if (urlStr.includes('/file/bot') && urlStr.includes('photos/photo.jpg')) {
      return new Response('dummy-photo-bytes-content');
    }

    // Mistral Vision completions API
    if (urlStr.includes('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'TITLE: Whiteboard Skizze\nDies ist eine handschriftliche Notiz zum Creator OS Launch.' } }]
      }));
    }

    // Telegram sendMessage mock
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
        update_id: 10001,
        message: {
          chat: { id: 123 },
          from: { id: 123, username: 'tester' },
          photo: [
            { file_id: 'ph-low-res', file_size: 100 },
            { file_id: 'ph-high-res', file_size: 500 }
          ],
          caption: 'Das ist mein Launch-Plan'
        }
      })
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);

    // Verify storage interactions
    assert.ok(storageUploadCalled);
    assert.ok(signedUrlCalled);

    // Verify Asset was inserted
    assert.equal(insertedAssets.length, 1);
    assert.equal(insertedAssets[0].title, 'Whiteboard Skizze');
    assert.equal(insertedAssets[0].url, 'https://mock.supabase.co/signed/file.jpg');
    assert.equal(insertedAssets[0].asset_kind, 'image');
    assert.equal(insertedAssets[0].caption, 'Dies ist eine handschriftliche Notiz zum Creator OS Launch.');

    // Verify Idea referencing the Asset was inserted
    assert.equal(insertedIdeas.length, 1);
    assert.equal(insertedIdeas[0].title, 'Asset: Whiteboard Skizze');
    assert.ok(insertedIdeas[0].pain_points.includes('Dies ist eine handschriftliche Notiz zum Creator OS Launch.'));
    assert.ok(insertedIdeas[0].pain_points.includes('https://mock.supabase.co/signed/file.jpg'));
    
    // Verify Telegram user message confirmations
    assert.ok(sentMessages.some(m => m.text.includes('Lade Datei')));
    assert.ok(sentMessages.some(m => m.text.includes('Analysiere Bild mit AI')));
    assert.ok(sentMessages.some(m => m.text.includes('Asset erfasst in Main Space') && m.text.includes('Whiteboard Skizze')));
  } finally {
    supabaseAdmin.storage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});

test('Telegram Evening Reflection Cron (B5)', async () => {
  const sentMessages: any[] = [];

  supabaseAdmin.from = (table: string): any => {
    if (table === 'telegram_links') {
      return {
        select: () => ({
          not: async () => {
            return { data: [{ owner_id: 'test-user', telegram_chat_id: 123 }], error: null };
          }
        })
      };
    }

    if (table === 'pipeline_cards') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              order: () => ({
                limit: async () => {
                  return { data: [{ title: 'Creator OS Launch' }], error: null };
                }
              })
            })
          })
        })
      };
    }

    if (table === 'goals') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: async () => {
                return { data: [{ title: '10k Subscribers' }], error: null };
              }
            })
          })
        })
      };
    }

    return originalFrom.call(supabaseAdmin, table);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, options?: any) => {
    const urlStr = url.toString();
    if (urlStr.includes('/sendMessage')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true }));
    }
    return originalFetch(url, options);
  };

  try {
    const res = await fetch(`http://localhost:${port}/api/v1/telegram/reflection?secret=${testCronSecret}`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.sent, 1);

    // Verify reflection prompt content
    assert.ok(sentMessages.length > 0);
    assert.ok(sentMessages[0].text.includes('Time for reflection'));
    assert.ok(sentMessages[0].text.includes('Creator OS Launch'));
    assert.ok(sentMessages[0].text.includes('10k Subscribers'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram Journal Command (B5)', async () => {
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
        update_id: 11001,
        message: {
          chat: { id: 123 },
          from: { id: 123, username: 'tester' },
          text: '/journal Heute lief das Coding super.'
        }
      })
    });

    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.ok, true);

    // Verify journal document was inserted
    assert.equal(insertedDocuments.length, 1);
    assert.ok(insertedDocuments[0].title.startsWith('Journal - '));
    assert.equal(insertedDocuments[0].body, 'Heute lief das Coding super.');
    assert.equal(insertedDocuments[0].workspace_id, 'main-space');

    // Verify Telegram confirmation message
    assert.ok(sentMessages.some(m => m.text.includes('Journal-Eintrag gespeichert') && m.text.includes('Main Space')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
