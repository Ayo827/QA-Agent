import path from "node:path";
import { z } from "zod";
import { execa } from "execa";
import { describeError, extractJson } from "../agents/baseAgent.js";
import { FIX_AGENT_PROMPT } from "../../prompts/fixAgent.js";
import { fingerprint } from "../compare/compare.js";
import { SEVERITY_ORDER, type Finding, type Severity } from "../evidence/types.js";
import type { AIProvider } from "../provider/types.js";
import type { Logger } from "../agents/types.js";

export type PatchCheck = "applies" | "does_not_apply" | "unchecked";

export interface FixProposal {
  key: string;
  finding: Pick<Finding, "id" | "agent" | "severity" | "title">;
  files: string[];
  description: string;
  reason: string;
  patch: string;
  check: PatchCheck;
  checkOutput?: string;
}

export interface FixSkip {
  key: string;
  finding: Pick<Finding, "id" | "agent" | "severity" | "title">;
  reason: string;
}

export interface FixResult {
  proposals: FixProposal[];
  skipped: FixSkip[];
}

const FixOutputSchema = z.object({
  canFix: z.boolean(),
  reason: z.string(),
  description: z.string().default(""),
  patch: z.string().default(""),
});

export interface ProposeFixesOptions {
  findings: Finding[];
  provider: AIProvider;
  rootPath: string;
  readFile: (relativePath: string, maxBytes?: number) => Promise<string | undefined>;
  maxTokens: number;
  logger: Logger;
  minSeverity?: Severity;
  /** Cap on findings sent to the model (most severe first). */
  maxFindings?: number;
  /** When set, only findings with these ids are considered. */
  onlyIds?: string[];
  /** Overridable for tests. */
  checkPatch?: (rootPath: string, patch: string) => Promise<{ check: PatchCheck; output?: string }>;
}

const brief = (f: Finding) => ({ id: f.id, agent: f.agent, severity: f.severity, title: f.title });

/** Paths named by `+++ b/<path>` headers. /dev/null (file creation or deletion) is reported as-is. */
export function extractPatchPaths(patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const match = /^\+\+\+ (?:b\/)?(.+?)(?:\t.*)?$/.exec(line);
    if (match?.[1]) paths.add(match[1]);
  }
  return [...paths];
}

/** Only files the model was shown may be changed: no new files, no deletions, nothing outside the root. */
export function patchTouchesOnly(patch: string, allowed: string[]): { ok: true } | { ok: false; reason: string } {
  const touched = extractPatchPaths(patch);
  if (touched.length === 0) return { ok: false, reason: "the patch has no `+++` file header" };
  if (/^--- \/dev\/null/m.test(patch) || touched.includes("/dev/null")) {
    return { ok: false, reason: "the patch creates or deletes a file" };
  }
  const allowedSet = new Set(allowed.map((p) => path.posix.normalize(p.replace(/\\/g, "/"))));
  for (const file of touched) {
    const normalized = path.posix.normalize(file);
    if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
      return { ok: false, reason: `the patch targets a path outside the repository (${file})` };
    }
    if (!allowedSet.has(normalized)) return { ok: false, reason: `the patch changes ${file}, which was not shown to the model` };
  }
  return { ok: true };
}

/**
 * Read-only check: `git apply --check` never modifies the target. Whitespace is ignored in context
 * so CRLF checkouts don't reject an LF patch; apply with the same flag.
 */
export async function gitApplyCheck(rootPath: string, patch: string): Promise<{ check: PatchCheck; output?: string }> {
  const body = patch.endsWith("\n") ? patch : `${patch}\n`;
  try {
    await execa("git", ["apply", "--check", "--ignore-whitespace", "-"], { cwd: rootPath, input: body });
    return { check: "applies" };
  } catch (err) {
    const e = err as { stderr?: string; code?: string; message?: string };
    if (e.code === "ENOENT") return { check: "unchecked", output: "git is not installed, so the patch was not checked" };
    return { check: "does_not_apply", output: (e.stderr || e.message || "git apply --check failed").trim() };
  }
}

export async function proposeFixes(options: ProposeFixesOptions): Promise<FixResult> {
  const min = SEVERITY_ORDER.indexOf(options.minSeverity ?? "medium");
  const check = options.checkPatch ?? gitApplyCheck;
  const proposals: FixProposal[] = [];
  const skipped: FixSkip[] = [];

  const candidates = options.findings
    .filter((f) => SEVERITY_ORDER.indexOf(f.severity) <= min)
    .filter((f) => !options.onlyIds || options.onlyIds.includes(f.id))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    .slice(0, options.maxFindings ?? 10);

  for (const finding of candidates) {
    const key = fingerprint(finding);
    const filePaths = [
      ...new Set(
        finding.evidence.flatMap((e) => (e.type === "static_analysis" ? [e.filePath] : [])),
      ),
    ];
    if (filePaths.length === 0) {
      skipped.push({ key, finding: brief(finding), reason: "no source file is cited in its evidence, so there is nothing to patch" });
      continue;
    }

    const files: { path: string; content: string }[] = [];
    for (const filePath of filePaths) {
      const content = await options.readFile(filePath, 60_000);
      if (content !== undefined) files.push({ path: filePath.replace(/\\/g, "/"), content });
    }
    if (files.length === 0) {
      skipped.push({ key, finding: brief(finding), reason: "the cited file(s) could not be read (missing, outside the repo, or a protected secret file)" });
      continue;
    }

    options.logger.info(`Proposing a fix for ${finding.agent}/${finding.id}...`);
    const userPrompt = `## Finding
${JSON.stringify({ id: finding.id, severity: finding.severity, title: finding.title, description: finding.description, recommendation: finding.recommendation, evidence: finding.evidence }, null, 2)}

## Source file(s)
${files.map((f) => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n")}

Respond with the JSON object now.`;

    let output: z.infer<typeof FixOutputSchema>;
    try {
      const response = await options.provider.complete({
        system: FIX_AGENT_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: options.maxTokens,
      });
      output = FixOutputSchema.parse(extractJson(response.text));
    } catch (err) {
      skipped.push({ key, finding: brief(finding), reason: `the model response could not be used (${describeError(err)})` });
      continue;
    }

    if (!output.canFix || output.patch.trim() === "") {
      skipped.push({ key, finding: brief(finding), reason: output.reason || "the model judged this not safely fixable from the file alone" });
      continue;
    }

    const scope = patchTouchesOnly(output.patch, files.map((f) => f.path));
    if (!scope.ok) {
      skipped.push({ key, finding: brief(finding), reason: `patch rejected: ${scope.reason}` });
      continue;
    }

    const checked = await check(options.rootPath, output.patch);
    proposals.push({
      key,
      finding: brief(finding),
      files: files.map((f) => f.path),
      description: output.description,
      reason: output.reason,
      patch: output.patch.endsWith("\n") ? output.patch : `${output.patch}\n`,
      check: checked.check,
      checkOutput: checked.output,
    });
  }

  return { proposals, skipped };
}
