import type { QAConfig } from "../../../config/schema.js";
import type { RepoProfile } from "../../discovery/repoScanner.js";
import { buildCommandRegistry, type RegistryEntry } from "../../tool-runner/commandRegistry.js";
import type { QAPlugin } from "../types.js";

/**
 * Expresses the core lint/build/typecheck/test integration as a plugin rather than special-cased
 * orchestrator logic, proving the plugin seam is real: removing this plugin from the manager's
 * list makes the orchestrator run zero baseline commands.
 */
export const lintTestPlugin: QAPlugin = {
  name: "builtin-lint-test",
  version: "0.1.0",
  provideCommands(profile: RepoProfile, config: QAConfig): RegistryEntry[] {
    return buildCommandRegistry(profile, config);
  },
};
