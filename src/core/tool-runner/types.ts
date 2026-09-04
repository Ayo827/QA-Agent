export interface CommandSpec {
  /** Stable identifier, e.g. "lint" | "typecheck" | "build" | "test". */
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export type CommandStatus = "success" | "failure" | "timeout" | "not_configured" | "skipped_unsafe";

export interface CommandResult {
  id: string;
  label: string;
  status: CommandStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  startedAt: string;
  /** Populated for not_configured / skipped_unsafe — the human-readable reason nothing ran. */
  reason?: string;
}
