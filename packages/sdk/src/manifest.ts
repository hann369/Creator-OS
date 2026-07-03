export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author: string;
  permissions: string[];
  entryPoint: string;
  signature: string; // SHA-256 manifest authentication code
  dependencies?: Record<string, string>;
}

export class ManifestValidator {
  // Validate manifest structure integrity and permissions allowlist
  static validate(manifest: PluginManifest): boolean {
    if (!manifest.id || !manifest.name || !manifest.version || !manifest.entryPoint) {
      return false;
    }

    // Verify package naming pattern (e.g. 'com.author.plugin-name')
    const idPattern = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
    if (!idPattern.test(manifest.id)) {
      console.warn(`Manifest validation failed: ID [${manifest.id}] violates namespaces rules`);
      return false;
    }

    return true;
  }
}
