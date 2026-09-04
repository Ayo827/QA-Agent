import type { QAConfig } from "../../config/schema.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import type { RegistryEntry } from "../tool-runner/commandRegistry.js";
import type { QAAgent } from "../agents/types.js";

export interface QAPlugin {
  readonly name: string;
  readonly version: string;
  onRepoDiscovered?(profile: RepoProfile): void | Promise<void>;
  /**
   * Contributes tool-runner entries (real commands to run, or synthesized not_configured/
   * skipped_unsafe records) for this repo. Returning RegistryEntry (not bare CommandSpec) lets a
   * plugin express "this doesn't apply here" as explicitly as "here's what to run" — the same
   * contract the built-in lint/test plugin itself uses, proving there's no special-cased path.
   */
  provideCommands?(profile: RepoProfile, config: QAConfig): RegistryEntry[];
  provideAgents?(): QAAgent[];
}
