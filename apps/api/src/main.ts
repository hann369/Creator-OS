import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { authRouter } from './controllers/auth.js';
import { workspaceRouter } from './controllers/workspace.js';
import { brandDnaRouter } from './controllers/brandDna.js';
import { reasoningRouter } from './controllers/reasoning.js';
import { socialRouter } from './controllers/social.js';
import { ThinkingWebSocketController } from './controllers/thinking.js';

const app = express();
app.use(express.json());

// Set up HTTP REST endpoints
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/workspaces', workspaceRouter);
app.use('/api/v1/brand-dna', brandDnaRouter);
app.use('/api/v1/reasoning', reasoningRouter);
app.use('/api/v1/social', socialRouter);

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

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Pronoia API Server running at http://localhost:${PORT}`);
  });
}

export default app;
