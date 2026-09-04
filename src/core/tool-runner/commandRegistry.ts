import type { QAConfig } from "../../config/schema.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import { isUnsafeScript } from "./denylist.js";
import type { CommandResult, CommandSpec } from "./types.js";

const TRACKED_SCRIPT_KEYS = ["lint", "typecheck", "build", "test"] as const;
type TrackedScriptKey = (typeof TRACKED_SCRIPT_KEYS)[number];

const LABELS: Record<TrackedScriptKey, string> = {
  lint: "Lint",
  typecheck: "Type check",
  build: "Build",
  test: "Test",
};

export interface RegistryEntry {
  spec?: CommandSpec;
  /** Present (and spec absent) when the script is skipped — becomes a not_configured/skipped_unsafe CommandResult. */
  skipped?: { id: string; label: string; status: "not_configured" | "skipped_unsafe"; reason: string };
}

/**
 * Builds the safe, real CommandSpecs to run against a target repo, plus a synthesized
 * "skipped" record for every tracked script key that isn't runnable — so the report always shows
 * exactly one row per key, never silently omitting build/typecheck/test when they don't apply.
 */
export function buildCommandRegistry(profile: RepoProfile, config: QAConfig): RegistryEntry[] {
  const packageManagerRunner = config.tools.packageManager === "npm" ? "npm" : config.tools.packageManager;

  return TRACKED_SCRIPT_KEYS.map((key) => {
    const scriptBody = profile.scripts[key];
    const label = LABELS[key];

    if (!scriptBody) {
      return {
        skipped: { id: key, label, status: "not_configured", reason: `No "${key}" script defined in package.json` },
      };
    }

    if (isUnsafeScript(key, scriptBody)) {
      return {
        skipped: { id: key, label, status: "skipped_unsafe", reason: `"${key}" script matches the unsafe-command denylist` },
      };
    }

    if (key === "test" && !config.tools.allowTestExecution) {
      return {
        skipped: {
          id: key,
          label,
          status: "skipped_unsafe",
          reason: "test execution disabled by config (tools.allowTestExecution=false)",
        },
      };
    }

    return {
      spec: {
        id: key,
        label,
        command: packageManagerRunner,
        args: ["run", key],
        cwd: profile.rootPath,
        timeoutMs: config.tools.timeoutMs,
      },
    };
  });
}

export function skippedEntryToCommandResult(entry: NonNullable<RegistryEntry["skipped"]>): CommandResult {
  return {
    id: entry.id,
    label: entry.label,
    status: entry.status,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: 0,
    startedAt: new Date().toISOString(),
    reason: entry.reason,
  };
}
