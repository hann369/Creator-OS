import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { authRouter } from './controllers/auth.js';
import { workspaceRouter } from './controllers/workspace.js';
import { brandDnaRouter } from './controllers/brandDna.js';
import { reasoningRouter } from './controllers/reasoning.js';
import { socialRouter } from './controllers/social.js';
import { telegramRouter } from './controllers/telegram.js';
import { libraryRouter } from './controllers/library.js';
import { coursesRouter, stripeWebhookHandler } from './controllers/courses.js';
import { mcpRouter } from './controllers/mcp.js';
import { ThinkingWebSocketController } from './controllers/thinking.js';
import { repositoryRouter } from './controllers/repository.js';

const app = express();

// Stripe webhook needs the RAW request body for signature verification, so it is
// registered BEFORE the JSON body parser.
app.post('/api/v1/stripe/webhook', express.raw({ type: '*/*' }), stripeWebhookHandler);

app.use(express.json());

// Set up HTTP REST endpoints
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/workspaces', workspaceRouter);
app.use('/api/v1/brand-dna', brandDnaRouter);
app.use('/api/v1/reasoning', reasoningRouter);
app.use('/api/v1/social', socialRouter);
app.use('/api/v1/telegram', telegramRouter);
app.use('/api/v1/library', libraryRouter);
app.use('/api/v1/courses', coursesRouter);
app.use('/api/v1/repository', repositoryRouter);

// The Claude connector. Mounted at the root — its paths (/mcp and
// /.well-known/oauth-protected-resource) are fixed by the MCP spec and RFC 9728,
// so they cannot live under /api/v1. It needs the parsed JSON body above.
app.use(mcpRouter);

const server = createServer(app);

// Set up WebSocket servers for realtime communication
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  ThinkingWebSocketController.handleConnection(ws);
});

server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  if (url === '/ws/v1/thinking') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

import { bootstrapQueue } from './queues/ingestionQueue.js';

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Pronoia API Server running at http://localhost:${PORT}`);
    void bootstrapQueue();
  });
}

export default app;
