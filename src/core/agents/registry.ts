import { ArchitectureReviewerAgent } from "./architectureReviewer.js";
import { BackendReviewerAgent } from "./backendReviewer.js";
import { ApiContractReviewerAgent } from "./apiContractReviewer.js";
import { DataLayerReviewerAgent } from "./dataLayerReviewer.js";
import { DependencyAuditorAgent } from "./dependencyAuditor.js";
import { PerformanceReviewerAgent } from "./performanceReviewer.js";
import { SecurityAuditorAgent } from "./securityAuditor.js";
import { TestGenerationAgent } from "./testGenerationAgent.js";
import type { AgentName } from "../../config/schema.js";
import type { QAAgent } from "./types.js";

/** Fixed, dependency-aware canonical order: architecture context first, then backend detail,
 * then the API/data/dependency/performance specialists, then security (benefits from all of them), then test generation last (benefits from everything). */
export const CANONICAL_AGENT_ORDER: AgentName[] = [
  "architecture-reviewer",
  "backend-reviewer",
  "api-contract-reviewer",
  "data-layer-reviewer",
  "dependency-auditor",
  "performance-reviewer",
  "security-auditor",
  "test-generation",
];

export function createAgentRegistry(): Map<AgentName, QAAgent> {
  return new Map<AgentName, QAAgent>([
    ["architecture-reviewer", new ArchitectureReviewerAgent()],
    ["backend-reviewer", new BackendReviewerAgent()],
    ["api-contract-reviewer", new ApiContractReviewerAgent()],
    ["data-layer-reviewer", new DataLayerReviewerAgent()],
    ["dependency-auditor", new DependencyAuditorAgent()],
    ["performance-reviewer", new PerformanceReviewerAgent()],
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
