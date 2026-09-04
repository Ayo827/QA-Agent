import type { QAConfig } from "../../config/schema.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import type { CommandResult } from "../tool-runner/types.js";
import type { AgentResult } from "../agents/types.js";
import { isVerified, SEVERITY_ORDER, type Finding, type Severity } from "../evidence/types.js";

export interface QARunResult {
  profile: RepoProfile;
  toolResults: CommandResult[];
  agentResults: AgentResult[];
  findings: Finding[];
  generatedAt: string;
  config: QAConfig;
}

/**
 * Non-zero exit only if a VERIFIED finding meets/exceeds config.run.failOn — an unverified AI
 * hunch never fails a CI gate.
 */
export function shouldFailRun(result: QARunResult): boolean {
  if (result.config.run.failOn === "never") return false;
  const threshold = SEVERITY_ORDER.indexOf(result.config.run.failOn as Severity);
  return result.findings.some((f) => isVerified(f) && SEVERITY_ORDER.indexOf(f.severity) <= threshold);
}
