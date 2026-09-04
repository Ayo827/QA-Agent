import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Finding, Severity } from "../evidence/types.js";
import { composeSystemPrompt } from "../provider/promptCache.js";
import type { AgentContext, AgentResult, Logger } from "./types.js";
import type { RepoProfile } from "../discovery/repoScanner.js";

const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

const EvidenceSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tool_execution"),
    commandId: z.string(),
    exitCode: z.number().nullable(),
    excerpt: z.string(),
  }),
  z.object({
    type: z.literal("static_analysis"),
    filePath: z.string(),
    lineRange: z.tuple([z.number(), z.number()]).optional(),
    excerpt: z.string(),
  }),
  z.object({
    type: z.literal("ai_inference"),
    confidence: z.enum(["low", "medium", "high"]),
    rationale: z.string(),
  }),
]);

const FindingSchema = z.object({
  id: z.string(),
  severity: SeveritySchema,
  title: z.string(),
  description: z.string(),
  evidence: z.array(EvidenceSourceSchema).min(1),
  recommendation: z.string().optional(),
});

export const AgentOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const BASE_HOUSE_PROMPT = `You are a specialist QA agent inside an automated pipeline that audits real backend repositories.

Hard rules, no exceptions:
1. You will be given ground-truth data: repository facts (already verified by static scanning) and, where relevant, real tool execution output (lint/build/test results). Treat these as fact.
2. Every finding you report must include at least one evidence entry. Evidence has exactly three types:
   - "tool_execution": you are restating a real command result you were given (commandId, exitCode, excerpt) — never invent a command result you were not given.
   - "static_analysis": you are quoting an excerpt from a real file you were given (filePath, optional lineRange, excerpt) — the excerpt must be text that actually appears in what you were shown.
   - "ai_inference": your own reasoning/opinion not directly backed by a quoted excerpt or tool output. Always include an honest confidence ("low"|"medium"|"high") and phrase the finding tentatively ("appears to", "may", "could") — never as settled fact.
3. Never claim a tool "passed" or "failed" unless you were given that exact CommandResult. If a script is reported as not_configured, that means it does not exist — say so plainly; do not describe it as passing, failing, or skipped-for-unknown-reasons.
4. Only comment on files/facts you were actually shown. If you only saw a subset of the codebase, say "based on the files reviewed" rather than making repo-wide claims.
5. Respond with ONLY a single JSON object matching this shape (no markdown fences, no prose outside the JSON):
{
  "summary": string,
  "findings": [
    {
      "id": string,             // stable kebab-case slug
      "severity": "info"|"low"|"medium"|"high"|"critical",
      "title": string,
      "description": string,
      "evidence": [ ...at least one EvidenceSource as described above... ],
      "recommendation": string  // optional
    }
  ]
}`;

/** Resolves a path against repoProfile.rootPath, refusing to leave it or touch a flagged secret file. */
export function makeSandboxedReader(profile: RepoProfile): AgentContext["readFile"] {
  return async (relativePath: string, maxBytes = 20_000) => {
    const resolved = path.resolve(profile.rootPath, relativePath);
    const normalizedRoot = path.normalize(profile.rootPath + path.sep);
    if (!path.normalize(resolved + path.sep).startsWith(normalizedRoot) && resolved !== profile.rootPath) {
      return undefined;
    }
    const relativeNormalized = path.normalize(relativePath);
    const isFlaggedSecret = profile.secretFilesDetected.some(
      (hit) => path.normalize(hit.relativePath) === relativeNormalized,
    );
    if (isFlaggedSecret) return undefined;

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) return undefined;
      const buffer = await fs.readFile(resolved);
      return buffer.subarray(0, maxBytes).toString("utf-8");
    } catch {
      return undefined;
    }
  };
}

export interface RunSingleShotOptions {
  agentName: string;
  agentPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

/**
 * Shared single-shot call pattern used by all Phase 2 agents: compose system prompt, call the
 * provider, parse+validate the JSON contract, with one repair retry on a schema/parse failure.
 */
export async function runSingleShotAgent(ctx: AgentContext, options: RunSingleShotOptions): Promise<AgentResult> {
  const system = composeSystemPrompt(BASE_HOUSE_PROMPT, options.agentPrompt);
  const maxTokens = options.maxTokens ?? ctx.config.ai.maxOutputTokens;

  const attempt = async (userPrompt: string): Promise<AgentOutput> => {
    const response = await ctx.provider.complete({
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens,
    });
    const parsed = extractJson(response.text);
    return AgentOutputSchema.parse(parsed);
  };

  try {
    let output: AgentOutput;
    try {
      output = await attempt(options.userPrompt);
    } catch (firstErr) {
      ctx.logger.warn(
        `${options.agentName}: response did not match the expected JSON schema, retrying once (${describeError(firstErr)})`,
      );
      const repairPrompt = `${options.userPrompt}\n\nYour previous response did not match the required JSON schema: ${describeError(firstErr)}. Return ONLY the corrected JSON object.`;
      output = await attempt(repairPrompt);
    }

    const findings: Finding[] = output.findings.map((f) => ({
      ...f,
      agent: options.agentName,
      severity: f.severity as Severity,
    }));

    return { agentName: options.agentName, status: "completed", findings, summary: output.summary };
  } catch (err) {
    return {
      agentName: options.agentName,
      status: "failed",
      findings: [],
      summary: `Agent failed: ${describeError(err)}`,
    };
  }
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(candidate);
}

export function describeError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

export function noopLogger(): Logger {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

export function summarizeRepoProfile(profile: RepoProfile): string {
  return JSON.stringify(
    {
      name: profile.name,
      rootPath: profile.rootPath,
      language: profile.language,
      nodeVersion: profile.nodeVersion,
      frameworks: profile.frameworks,
      hasTypeScript: profile.hasTypeScript,
      hasESLint: profile.hasESLint,
      hasPrettier: profile.hasPrettier,
      testFramework: profile.testFramework,
      hasCI: profile.hasCI,
      scripts: profile.scripts,
      dbLayer: profile.dbLayer,
      secretFilesDetected: profile.secretFilesDetected,
    },
    null,
    2,
  );
}

export function summarizeToolResults(results: import("../tool-runner/types.js").CommandResult[]): string {
  return JSON.stringify(
    results.map((r) => ({
      id: r.id,
      status: r.status,
      exitCode: r.exitCode,
      reason: r.reason,
      stdoutExcerpt: r.stdout.slice(0, 1500),
      stderrExcerpt: r.stderr.slice(0, 1500),
    })),
    null,
    2,
  );
}

export function summarizePriorFindings(findings: Finding[]): string {
  if (findings.length === 0) return "(none yet)";
  return findings.map((f) => `- [${f.agent}/${f.severity}] ${f.title}`).join("\n");
}

/** Reads a list of candidate files and returns only those that resolved to real content. */
export async function readFiles(
  ctx: AgentContext,
  relativePaths: string[],
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  for (const relativePath of relativePaths) {
    const content = await ctx.readFile(relativePath);
    if (content !== undefined) out.push({ path: relativePath, content });
  }
  return out;
}

export function formatFileExcerpts(files: { path: string; content: string }[]): string {
  if (files.length === 0) return "(no files could be read)";
  return files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
}
