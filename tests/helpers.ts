import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentContext } from "../src/core/agents/types.js";
import { makeSandboxedReader, noopLogger } from "../src/core/agents/baseAgent.js";
import type { RepoProfile } from "../src/core/discovery/repoScanner.js";
import type { Finding } from "../src/core/evidence/types.js";
import type { AICompletionOptions, AIProvider } from "../src/core/provider/types.js";
import { QAConfigSchema } from "../src/config/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const sampleRepoRoot = path.resolve(here, "fixtures/sample-repo");

export function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    rootPath: sampleRepoRoot,
    name: "sample-repo",
    language: "javascript",
    frameworks: [],
    hasTypeScript: false,
    hasESLint: true,
    hasPrettier: false,
    testFramework: "none",
    hasCI: false,
    scripts: {},
    entryPoints: ["index.js"],
    dbLayer: "unknown",
    secretFilesDetected: [],
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "a-finding",
    agent: "test-agent",
    severity: "medium",
    title: "A finding",
    description: "Something is off",
    evidence: [{ type: "static_analysis", filePath: "index.js", excerpt: "app.get" }],
    ...overrides,
  };
}

/** A provider that returns canned replies in order and records what it was asked. */
export class FakeProvider implements AIProvider {
  readonly name = "fake";
  readonly calls: AICompletionOptions[] = [];
  constructor(private readonly replies: string[]) {}

  async complete(options: AICompletionOptions) {
    this.calls.push(options);
    const text = this.replies[Math.min(this.calls.length - 1, this.replies.length - 1)] ?? "{}";
    return { text, model: "fake", stopReason: "end_turn", usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

export function makeContext(provider: AIProvider, profile: RepoProfile = makeProfile()): AgentContext {
  return {
    repoProfile: profile,
    toolResults: [],
    priorFindings: [],
    provider,
    config: QAConfigSchema.parse({ version: 1, target: { path: profile.rootPath } }),
    readFile: makeSandboxedReader(profile),
    logger: noopLogger(),
  };
}
