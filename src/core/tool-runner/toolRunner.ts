import { execa } from "execa";
import type { CommandResult, CommandSpec } from "./types.js";

/** Env vars stripped from spawned child processes so target-repo tooling can't read qa-agent's own secrets. */
const STRIPPED_ENV_KEYS = ["ANTHROPIC_API_KEY"];

export class ToolRunner {
  async run(spec: CommandSpec): Promise<CommandResult> {
    const startedAt = new Date();
    const childEnv = { ...process.env };
    for (const key of STRIPPED_ENV_KEYS) delete childEnv[key];

    const result = await execa(spec.command, spec.args, {
      cwd: spec.cwd,
      timeout: spec.timeoutMs,
      reject: false,
      env: childEnv,
      // Array-form args only — never a shell string — since script names originate in a
      // repo we don't control.
      shell: false,
    });

    const durationMs = Date.now() - startedAt.getTime();
    const status: CommandResult["status"] = result.timedOut
      ? "timeout"
      : result.exitCode === 0
        ? "success"
        : "failure";

    return {
      id: spec.id,
      label: spec.label,
      status,
      exitCode: result.exitCode ?? null,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      durationMs,
      startedAt: startedAt.toISOString(),
    };
  }

  async runAll(specs: CommandSpec[]): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const spec of specs) {
      results.push(await this.run(spec));
    }
    return results;
  }
}
