import { PluginManifest } from './manifest.js';

export interface PluginLifecycleContext {
  workspaceId: string;
  apiEndpoint: string;
  token: string;
}

export interface PronoiaPlugin {
  manifest: PluginManifest;
  onInstall(context: PluginLifecycleContext): Promise<void>;
  onEnable(context: PluginLifecycleContext): Promise<void>;
  onDisable(context: PluginLifecycleContext): Promise<void>;
  onUninstall(context: PluginLifecycleContext): Promise<void>;
}

export abstract class BasePronoiaPlugin implements PronoiaPlugin {
  abstract manifest: PluginManifest;

  async onInstall(context: PluginLifecycleContext): Promise<void> {
    console.log(`Plugin [${this.manifest.name}] installed in workspace: ${context.workspaceId}`);
  }

  async onEnable(context: PluginLifecycleContext): Promise<void> {
    console.log(`Plugin [${this.manifest.name}] enabled`);
  }

  async onDisable(context: PluginLifecycleContext): Promise<void> {
    console.log(`Plugin [${this.manifest.name}] disabled`);
  }

  async onUninstall(context: PluginLifecycleContext): Promise<void> {
    console.log(`Plugin [${this.manifest.name}] uninstalled`);
  }
}
