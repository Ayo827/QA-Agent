import { ArchitectureReviewerAgent } from "./architectureReviewer.js";
import { BackendReviewerAgent } from "./backendReviewer.js";
import { SecurityAuditorAgent } from "./securityAuditor.js";
import { TestGenerationAgent } from "./testGenerationAgent.js";
import type { AgentName } from "../../config/schema.js";
import type { QAAgent } from "./types.js";

/** Fixed, dependency-aware canonical order: architecture context first, then backend detail,
 * then security (benefits from both), then test generation last (benefits from everything). */
export const CANONICAL_AGENT_ORDER: AgentName[] = [
  "architecture-reviewer",
  "backend-reviewer",
  "security-auditor",
  "test-generation",
];

export function createAgentRegistry(): Map<AgentName, QAAgent> {
  return new Map<AgentName, QAAgent>([
    ["architecture-reviewer", new ArchitectureReviewerAgent()],
    ["backend-reviewer", new BackendReviewerAgent()],
    ["security-auditor", new SecurityAuditorAgent()],
    ["test-generation", new TestGenerationAgent()],
  ]);
}

export function resolveEnabledAgents(enabled: AgentName[], registry: Map<AgentName, QAAgent>): QAAgent[] {
  const enabledSet = new Set(enabled);
  return CANONICAL_AGENT_ORDER.filter((name) => enabledSet.has(name))
    .map((name) => registry.get(name))
    .filter((agent): agent is QAAgent => Boolean(agent));
}
