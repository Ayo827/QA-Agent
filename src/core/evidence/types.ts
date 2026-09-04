export type Severity = "info" | "low" | "medium" | "high" | "critical";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export type EvidenceSource =
  | { type: "tool_execution"; commandId: string; exitCode: number | null; excerpt: string }
  | { type: "static_analysis"; filePath: string; lineRange?: [number, number]; excerpt: string }
  | { type: "ai_inference"; confidence: "low" | "medium" | "high"; rationale: string };

export interface Finding {
  id: string;
  agent: string;
  severity: Severity;
  title: string;
  description: string;
  evidence: EvidenceSource[];
  recommendation?: string;
}

/**
 * A Finding is "verified" iff at least one evidence entry is tool_execution or static_analysis.
 * Findings whose evidence is entirely ai_inference render with an explicit unverified badge in
 * reports and must never be phrased as settled fact.
 */
export function isVerified(finding: Finding): boolean {
  return finding.evidence.some((e) => e.type === "tool_execution" || e.type === "static_analysis");
}

export function compareBySeverity(a: Finding, b: Finding): number {
  return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
}
