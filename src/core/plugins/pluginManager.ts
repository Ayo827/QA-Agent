import type { QAConfig } from "../../config/schema.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import type { RegistryEntry } from "../tool-runner/commandRegistry.js";
import type { QAAgent } from "../agents/types.js";
import { lintTestPlugin } from "./builtin/lintTestPlugin.js";
import type { QAPlugin } from "./types.js";

export class PluginManager {
  constructor(private readonly plugins: QAPlugin[] = [lintTestPlugin]) {}

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
