export type WorkspaceMode = 'morning' | 'focus' | 'explore' | 'create' | 'reflect';

export class ModeManager {
  private currentMode: WorkspaceMode = 'morning';
  private subscribers: ((mode: WorkspaceMode) => void)[] = [];

  getMode(): WorkspaceMode {
    return this.currentMode;
  }

  setMode(mode: WorkspaceMode): void {
    console.log(`[ModeManager] Mode transition: ${this.currentMode} -> ${mode}`);
    this.currentMode = mode;
    this.subscribers.forEach((fn) => fn(mode));
  }

  subscribe(fn: (mode: WorkspaceMode) => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== fn);
    };
  }
}

export const globalModeManager = new ModeManager();
