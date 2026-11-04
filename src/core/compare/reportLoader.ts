import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { QARunResult } from "../orchestrator/runContext.js";

export class ReportLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportLoadError";
  }
}

const StoredReportSchema = z
  .object({
    generatedAt: z.string(),
    profile: z.object({ name: z.string(), rootPath: z.string() }).passthrough(),
    findings: z.array(z.object({ id: z.string(), agent: z.string(), severity: z.string() }).passthrough()),
    agentResults: z.array(z.unknown()),
    toolResults: z.array(z.unknown()),
    config: z.object({}).passthrough(),
  })
  .passthrough();

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Turns a user reference into a report.json path. Accepts a report.json file, a run directory
 * containing one, a target directory (newest run wins), or "latest" with outputDir/targetName.
 */
export async function resolveReportPath(
  ref: string,
  options: { outputDir: string; targetName: string },
): Promise<string> {
  const candidates: string[] = [];
  if (ref === "latest") {
    candidates.push(path.join(options.outputDir, options.targetName));
  } else {
    candidates.push(path.resolve(ref));
    // A bare run folder name, as listed under the output directory.
    candidates.push(path.join(options.outputDir, options.targetName, ref));
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
    if (await isFile(path.join(candidate, "report.json"))) return path.join(candidate, "report.json");

    let entries: string[] = [];
    try {
      entries = await fs.readdir(candidate);
    } catch {
      continue;
    }
    for (const entry of entries.sort().reverse()) {
      const nested = path.join(candidate, entry, "report.json");
      if (await isFile(nested)) return nested;
    }
  }
  throw new ReportLoadError(
    ref === "latest"
      ? `No previous report found under ${path.join(options.outputDir, options.targetName)}. Run "qa run" first.`
      : `No report.json found at ${path.resolve(ref)}.`,
  );
}

export async function loadReport(reportJsonPath: string): Promise<QARunResult> {
  let raw: string;
  try {
    raw = await fs.readFile(reportJsonPath, "utf-8");
  } catch {
    throw new ReportLoadError(`Could not read ${reportJsonPath}.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ReportLoadError(`${reportJsonPath} is not valid JSON.`);
  }
  const parsed = StoredReportSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new ReportLoadError(`${reportJsonPath} is not a qa-agent report (${details}).`);
  }
  return json as QARunResult;
}
