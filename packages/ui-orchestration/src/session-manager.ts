export interface ActiveSession {
  id: string;
  startedAt: Date;
  activeProjectName: string;
  activeGoalTitle: string;
  focusMinutes: number;
}

export class SessionManager {
  private currentSession: ActiveSession | null = null;
  private subscribers: ((session: ActiveSession | null) => void)[] = [];

  startSession(projectName: string, goalTitle: string): void {
    console.log(`[SessionManager] Starting active session for project: ${projectName}`);
    this.currentSession = {
      id: crypto.randomUUID(),
      startedAt: new Date(),
      activeProjectName: projectName,
      activeGoalTitle: goalTitle,
      focusMinutes: 0
    };
    this.notify();
  }

  endSession(): ActiveSession | null {
    const session = this.currentSession;
    if (session) {
      console.log(`[SessionManager] Ending session: ${session.id}`);
      this.currentSession = null;
      this.notify();
    }
    return session;
  }

  getSession(): ActiveSession | null {
    return this.currentSession;
  }

  incrementFocusTime(minutes: number): void {
    if (this.currentSession) {
      this.currentSession.focusMinutes += minutes;
      this.notify();
    }
  }

  subscribe(fn: (session: ActiveSession | null) => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== fn);
    };
  }

  private notify(): void {
    this.subscribers.forEach((fn) => fn(this.currentSession));
  }
}

export const globalSessionManager = new SessionManager();
