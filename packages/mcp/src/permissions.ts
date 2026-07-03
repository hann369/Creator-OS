export type MCPPermissionScope =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'internet:connect'
  | 'system:clipboard'
  | 'user:notifications'
  | 'user:calendar'
  | 'user:email'
  | 'social:post';

export interface MCPManifest {
  id: string;
  name: string;
  version: string;
  requiredPermissions: MCPPermissionScope[];
  signature: string; // Cryptographic verification key
}

export class MCPPermissionChecker {
  private allowedScopes = new Map<string, Set<MCPPermissionScope>>();

  // Register user decision for plugin permissions
  grantPermission(pluginId: string, scope: MCPPermissionScope): void {
    const scopes = this.allowedScopes.get(pluginId) || new Set<MCPPermissionScope>();
    scopes.add(scope);
    this.allowedScopes.set(pluginId, scopes);
  }

  revokePermission(pluginId: string, scope: MCPPermissionScope): void {
    const scopes = this.allowedScopes.get(pluginId);
    if (scopes) {
      scopes.delete(scope);
    }
  }

  // Check if target action scope is authorized for pluginId
  hasPermission(pluginId: string, scope: MCPPermissionScope): boolean {
    const scopes = this.allowedScopes.get(pluginId);
    return scopes ? scopes.has(scope) : false;
  }
}
