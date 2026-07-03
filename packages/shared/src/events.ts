import { EventEmitter } from 'events';
import { WorkspaceEvent } from '@pronoia/domain';

export type EventCallback<T extends WorkspaceEvent['eventType']> = (
  event: Extract<WorkspaceEvent, { eventType: T }>
) => void | Promise<void>;

export class ApplicationEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase limit for concurrent handlers
    this.emitter.setMaxListeners(100);
  }

  // Publish event to the bus
  publish<T extends WorkspaceEvent['eventType']>(
    event: Extract<WorkspaceEvent, { eventType: T }>
  ): void {
    this.emitter.emit(event.eventType, event);
    this.emitter.emit('*', event); // Wildcard subscription
  }

  // Subscribe to specific event type
  subscribe<T extends WorkspaceEvent['eventType']>(
    eventType: T,
    callback: EventCallback<T>
  ): () => void {
    const wrappedCallback = (event: any) => {
      try {
        const result = callback(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`Error in async event handler for ${eventType}:`, error);
          });
        }
      } catch (error) {
        console.error(`Error in sync event handler for ${eventType}:`, error);
      }
    };

    this.emitter.on(eventType, wrappedCallback);

    // Return unsubscribe function
    return () => {
      this.emitter.off(eventType, wrappedCallback);
    };
  }

  // Subscribe to all events (wildcard)
  subscribeAll(callback: (event: WorkspaceEvent) => void | Promise<void>): () => void {
    const wrappedCallback = (event: any) => {
      try {
        const result = callback(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error('Error in async wildcard event handler:', error);
          });
        }
      } catch (error) {
        console.error('Error in sync wildcard event handler:', error);
      }
    };

    this.emitter.on('*', wrappedCallback);

    return () => {
      this.emitter.off('*', wrappedCallback);
    };
  }
}

// Global instance export
export const globalEventBus = new ApplicationEventBus();
