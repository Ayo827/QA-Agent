import fg from "fast-glob";
import { readFiles } from "./baseAgent.js";
import type { AgentContext } from "./types.js";

const ALWAYS_IGNORED = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/*.min.js",
  "**/*.map",
];

export interface SelectFilesOptions {
  /** Max number of files returned across all patterns. */
  limit?: number;
  /** Max bytes read from each file. */
  maxBytes?: number;
}

/**
 * Finds files by glob (patterns are tried in order, so earlier patterns win the limit) and reads
 * them through the sandboxed reader, so secret files and path escapes are still refused.
 */
export async function selectFiles(
  ctx: AgentContext,
  patterns: string[],
  options: SelectFilesOptions = {},
): Promise<{ path: string; content: string }[]> {
  const limit = options.limit ?? 12;
  const ignore = ctx.repoProfile.hasTypeScript ? [...ALWAYS_IGNORED, "**/lib/**"] : ALWAYS_IGNORED;
  const chosen: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (chosen.length >= limit) break;
    const matches = await fg(pattern, { cwd: ctx.repoProfile.rootPath, ignore, onlyFiles: true, dot: false });
    for (const match of matches.sort()) {
      if (seen.has(match)) continue;
      seen.add(match);
      chosen.push(match);
      if (chosen.length >= limit) break;
    }
  }

  const files = await readFiles(ctx, chosen);
  const maxBytes = options.maxBytes;
  return maxBytes ? files.map((f) => ({ ...f, content: f.content.slice(0, maxBytes) })) : files;
}
