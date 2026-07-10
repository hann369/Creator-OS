import { createStore } from '../store/createStore.js';

const DEFAULT_WORKSPACE_ID = 'main-space';

export const workspaceStore = createStore<string>(DEFAULT_WORKSPACE_ID);

/**
 * Notified whenever the active project actually changes. Module-level stores
 * outlive the keyed WorkspaceProvider remount, so they need this to drop the
 * previous project's rows and reload.
 */
export function subscribeWorkspaceChange(listener: () => void): () => void {
  return workspaceStore.subscribe(listener);
}

export function setActiveWorkspaceId(id: string): void {
  const next = id || DEFAULT_WORKSPACE_ID;
  workspaceStore.setState(next);
}

export function getActiveWorkspaceId(): string {
  return workspaceStore.getState();
}

/** The default project ('main-space') owns all pre-existing data + the demo seeds. */
export function isDefaultWorkspace(): boolean {
  return workspaceStore.getState() === DEFAULT_WORKSPACE_ID;
}

/**
 * Namespace a localStorage key by the active workspace. The default project keeps
 * the legacy (un-suffixed) key so existing local data stays intact; other projects
 * get an isolated key.
 */
export function scopedKey(base: string): string {
  const activeId = workspaceStore.getState();
  return activeId === DEFAULT_WORKSPACE_ID ? base : `${base}:${activeId}`;
}
