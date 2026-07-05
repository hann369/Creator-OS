// ─────────────────────────────────────────────────────────────────────────────
// Tiny dependency-free reactive store (Roadmap Phase B).
//
// The frontend today fragments state across ~8 hooks, each with its own
// useState + fetch + localStorage mirror — so the same entity type can hold two
// diverging copies (e.g. useGoals() in GoalsView vs in the sidebar). This is the
// single-store primitive those hooks collapse onto: one module-level store per
// entity type, shared by every view.
//
// This file is FRAMEWORK-FREE (no React import) so the store logic is unit
// testable in plain Node. The React binding lives in ./useStore.
// ─────────────────────────────────────────────────────────────────────────────

export interface Store<T> {
  getState: () => T;
  setState: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (next) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
