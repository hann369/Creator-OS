// Active workspace scope = the currently open project's id. Set once by the
// gateway (main.tsx) before the WorkspaceProvider subtree mounts; the subtree is
// keyed by project id so every hook/context re-reads this on a project switch.
//
// The singleton entityStore (not remounted) reads getActiveWorkspaceId() at call
// time, so it too is always scoped to the current project.

const DEFAULT_WORKSPACE_ID = 'main-space';

let _activeWorkspaceId = DEFAULT_WORKSPACE_ID;

const listeners = new Set<() => void>();

/**
 * Notified whenever the active project actually changes. Module-level stores
 * outlive the keyed WorkspaceProvider remount, so they need this to drop the
 * previous project's rows and reload.
 */
export function subscribeWorkspaceChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setActiveWorkspaceId(id: string): void {
  const next = id || DEFAULT_WORKSPACE_ID;
  if (next === _activeWorkspaceId) return;
  _activeWorkspaceId = next;
  listeners.forEach((l) => l());
}

export function getActiveWorkspaceId(): string {
  return _activeWorkspaceId;
}

/** The default project ('main-space') owns all pre-existing data + the demo seeds. */
export function isDefaultWorkspace(): boolean {
  return _activeWorkspaceId === DEFAULT_WORKSPACE_ID;
}

/**
 * Namespace a localStorage key by the active workspace. The default project keeps
 * the legacy (un-suffixed) key so existing local data stays intact; other projects
 * get an isolated key.
 */
export function scopedKey(base: string): string {
  return _activeWorkspaceId === DEFAULT_WORKSPACE_ID ? base : `${base}:${_activeWorkspaceId}`;
}
