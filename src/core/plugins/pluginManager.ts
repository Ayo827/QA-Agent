import type { QAConfig } from "../../config/schema.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import type { RegistryEntry } from "../tool-runner/commandRegistry.js";
import type { QAAgent } from "../agents/types.js";
import { lintTestPlugin } from "./builtin/lintTestPlugin.js";
import { loadExternalPlugins } from "./externalLoader.js";
import type { QAPlugin } from "./types.js";

export class PluginManager {
  constructor(private readonly plugins: QAPlugin[] = [lintTestPlugin]) {}

  /** The built-in lint/test plugin plus every plugin named in config.plugins. */
  static async fromConfig(config: QAConfig, baseDir?: string): Promise<PluginManager> {
    const external = await loadExternalPlugins(config.plugins, baseDir);
    return new PluginManager([lintTestPlugin, ...external]);
  }

  get pluginNames(): string[] {
    return this.plugins.map((p) => p.name);
  }

  async notifyRepoDiscovered(profile: RepoProfile): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onRepoDiscovered?.(profile);
    }
  }

  collectCommandEntries(profile: RepoProfile, config: QAConfig): RegistryEntry[] {
    return this.plugins.flatMap((plugin) => plugin.provideCommands?.(profile, config) ?? []);
  }

  collectAgents(): QAAgent[] {
    return this.plugins.flatMap((plugin) => plugin.provideAgents?.() ?? []);
  }
}
