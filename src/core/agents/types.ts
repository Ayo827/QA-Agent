import type { QAConfig } from "../../config/schema.js";
import type { Finding } from "../evidence/types.js";
import type { CommandResult } from "../tool-runner/types.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import type { AIProvider } from "../provider/types.js";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface AgentContext {
  repoProfile: RepoProfile;
  toolResults: CommandResult[];
  priorFindings: Finding[];
  provider: AIProvider;
  config: QAConfig;
  /**
   * The only way agents may touch the target repo's filesystem. Resolves relativePath against
   * repoProfile.rootPath, refuses to leave that root, refuses any path matching
   * repoProfile.secretFilesDetected, and caps read size. Returns undefined if the file doesn't
   * exist, isn't readable as text, or is refused.
   */
  readFile(relativePath: string, maxBytes?: number): Promise<string | undefined>;
  logger: Logger;
}

export type AgentStatus = "completed" | "blocked" | "failed";

export interface AgentArtifact {
  /** Relative path under the run's proposals/ directory, e.g. "tests/utils/validatePhone.proposed.test.js". */
  path: string;
  description: string;
  content: string;
}

export interface AgentResult {
  agentName: string;
  status: AgentStatus;
  findings: Finding[];
  summary: string;
  blockedReason?: string;
  artifacts?: AgentArtifact[];
}

export interface QAAgent {
  readonly name: string;
  readonly description: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}
