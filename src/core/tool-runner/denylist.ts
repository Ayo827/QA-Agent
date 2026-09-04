/**
 * npm script names that must NEVER be auto-executed, regardless of config, because they start
 * long-running processes, touch live infrastructure, or deploy. Checked before any CommandSpec
 * is built — independent of commandRegistry logic, so a config or registry bug can't bypass it.
 */
export const UNSAFE_SCRIPT_NAMES: ReadonlySet<string> = new Set([
  "serve",
  "start",
  "shell",
  "deploy",
  "logs",
  "dev",
  "emulators",
  "emulate",
]);

/** Substrings in a script's *command body* that mark it unsafe even under a differently-named key. */
export const UNSAFE_COMMAND_PATTERNS: RegExp[] = [
  /firebase\s+(deploy|emulators:start|functions:shell|functions:log)/i,
  /\bnodemon\b/i,
  /\bfirebase\s+serve\b/i,
];

export function isUnsafeScript(scriptName: string, scriptBody: string): boolean {
  if (UNSAFE_SCRIPT_NAMES.has(scriptName.toLowerCase())) return true;
  return UNSAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(scriptBody));
}
