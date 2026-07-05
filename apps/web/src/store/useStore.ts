import { useSyncExternalStore } from 'react';
import type { Store } from './createStore.js';

// React binding for the framework-free store. Snapshots are referentially stable
// between mutations (arrays are replaced immutably), so a whole-state selection
// is safe and never loops.
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
