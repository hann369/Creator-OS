import { WebSocket } from 'ws';
import { globalEventBus } from '@pronoia/shared';

export class ThinkingWebSocketController {
  static handleConnection(ws: WebSocket): void {
    console.log('WS: Client connected to /ws/v1/thinking');

    // Subscribe to wildcard event bus to stream AI highlights reactively
    const unsubscribe = globalEventBus.subscribeAll(async (event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: 'thinking_insight',
          timestamp: new Date(),
          data: {
            id: event.id,
            type: event.eventType,
            insight: `Event sourced trigger: ${event.eventType} has been cataloged in historical memory.`
          }
        }));
      }
    });

    ws.on('message', (message: string) => {
      console.log('WS: Received message:', message.toString());
    });

    ws.on('close', () => {
      console.log('WS: Client disconnected');
      unsubscribe();
    });
  }
}
