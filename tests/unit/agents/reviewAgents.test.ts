import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeManifest } from "../../../src/core/agents/dependencyChecks.js";
import { DependencyAuditorAgent } from "../../../src/core/agents/dependencyAuditor.js";
import { selectFiles } from "../../../src/core/agents/fileSelector.js";
import { CANONICAL_AGENT_ORDER, createAgentRegistry, resolveEnabledAgents } from "../../../src/core/agents/registry.js";
import { ApiContractReviewerAgent } from "../../../src/core/agents/apiContractReviewer.js";
import { AGENT_NAMES } from "../../../src/config/schema.js";
import { FakeProvider, makeContext, makeProfile } from "../../helpers.js";

const okReply = JSON.stringify({
  summary: "looked fine",
  findings: [
    {
      id: "sample",
      severity: "low",
      title: "Sample",
      description: "d",
      evidence: [{ type: "ai_inference", confidence: "low", rationale: "r" }],
    },
  ],
});

describe("registry", () => {
  it("has an agent for every configured name, in dependency order with test-generation last", () => {
    const registry = createAgentRegistry();
    expect([...registry.keys()].sort()).toEqual([...AGENT_NAMES].sort());
    expect([...CANONICAL_AGENT_ORDER].sort()).toEqual([...AGENT_NAMES].sort());
    expect(CANONICAL_AGENT_ORDER.at(-1)).toBe("test-generation");
    expect(CANONICAL_AGENT_ORDER.indexOf("architecture-reviewer")).toBe(0);
  });

  it("returns only enabled agents, in canonical order regardless of config order", () => {
    const agents = resolveEnabledAgents(["security-auditor", "api-contract-reviewer"], createAgentRegistry());
    expect(agents.map((a) => a.name)).toEqual(["api-contract-reviewer", "security-auditor"]);
  });
});

describe("analyzeManifest", () => {
  it("is quiet for a healthy manifest", () => {
    expect(
      analyzeManifest({ engines: { node: "22" }, dependencies: { express: "^5.1.0" } }, ["package-lock.json"]),
    ).toEqual([]);
  });

  it("flags a missing lockfile, loose versions, git sources, missing engines and dev tools in dependencies", () => {
    const ids = analyzeManifest(
      {
        dependencies: { express: "*", lodash: "latest", mine: "git+https://example.com/x.git", jest: "^29.0.0" },
        devDependencies: { eslint: "*" },
      },
      [],
    ).map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "deps-no-lockfile",
        "deps-unbounded-version-dependencies",
        "deps-unbounded-version-devDependencies",
        "deps-remote-source-dependencies",
        "deps-no-engines-node",
        "deps-dev-tools-in-runtime",
      ]),
    );
  });

  it("rates a wildcard runtime dependency higher than a wildcard dev dependency", () => {
    const findings = analyzeManifest({ engines: { node: "22" }, dependencies: { a: "*" }, devDependencies: { b: "*" } }, ["package-lock.json"]);
    const sev = (id: string) => findings.find((f) => f.id === id)?.severity;
    expect(sev("deps-unbounded-version-dependencies")).toBe("high");
    expect(sev("deps-unbounded-version-devDependencies")).toBe("medium");
  });

  it("flags several lockfiles", () => {
    const ids = analyzeManifest({ engines: { node: "22" } }, ["package-lock.json", "yarn.lock"]).map((f) => f.id);
    expect(ids).toContain("deps-multiple-lockfiles");
  });

  it("only produces verified (static_analysis) findings", () => {
    for (const f of analyzeManifest({}, [])) {
      expect(f.evidence.every((e) => e.type === "static_analysis")).toBe(true);
    }
  });
});

describe("selectFiles", () => {
  async function makeRepo() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-sel-"));
    await fs.mkdir(path.join(dir, "routes"));
    await fs.mkdir(path.join(dir, "node_modules/x"), { recursive: true });
    await fs.mkdir(path.join(dir, "lib"));
    await fs.writeFile(path.join(dir, "routes/a.js"), "a");
    await fs.writeFile(path.join(dir, "routes/b.js"), "b");
    await fs.writeFile(path.join(dir, "routes/a.test.js"), "t");
    await fs.writeFile(path.join(dir, "node_modules/x/index.js"), "n");
    await fs.writeFile(path.join(dir, "lib/compiled.js"), "c");
    await fs.writeFile(path.join(dir, "index.js"), "i");
    return dir;
  }

  it("skips node_modules and tests, honours pattern order and the limit", async () => {
    const dir = await makeRepo();
    const ctx = makeContext(new FakeProvider([]), makeProfile({ rootPath: dir }));
    const files = await selectFiles(ctx, ["routes/*.js", "index.js"], { limit: 3 });
    expect(files.map((f) => f.path)).toEqual(["routes/a.js", "routes/b.js", "index.js"]);
    const limited = await selectFiles(ctx, ["routes/*.js", "index.js"], { limit: 1 });
    expect(limited.map((f) => f.path)).toEqual(["routes/a.js"]);
  });

  it("skips lib/ only for TypeScript repos", async () => {
    const dir = await makeRepo();
    const js = await selectFiles(makeContext(new FakeProvider([]), makeProfile({ rootPath: dir })), ["lib/*.js"]);
    const ts = await selectFiles(
      makeContext(new FakeProvider([]), makeProfile({ rootPath: dir, hasTypeScript: true })),
      ["lib/*.js"],
    );
    expect(js).toHaveLength(1);
    expect(ts).toHaveLength(0);
  });

  it("never returns a flagged secret file", async () => {
    const dir = await makeRepo();
    const profile = makeProfile({
      rootPath: dir,
      secretFilesDetected: [{ relativePath: "index.js", reason: "env-file", gitTracked: false }],
    });
    expect(await selectFiles(makeContext(new FakeProvider([]), profile), ["index.js"])).toEqual([]);
  });
});

describe("ReviewAgent", () => {
  it("sends sampled files and tags findings with the agent name", async () => {
    const provider = new FakeProvider([okReply]);
    const result = await new ApiContractReviewerAgent().run(makeContext(provider));
    expect(result.status).toBe("completed");
    expect(result.findings[0]?.agent).toBe("api-contract-reviewer");
    expect(provider.calls[0]?.messages[0]?.content).toContain("--- index.js ---");
    expect(provider.calls[0]?.system).toContain("API Contract Reviewer");
  });

  it("dependency auditor keeps its deterministic findings even when the model fails", async () => {
    const provider = new FakeProvider(["garbage", "still garbage"]);
    const result = await new DependencyAuditorAgent().run(makeContext(provider));
    expect(result.status).toBe("failed");
    // sample-repo has no lockfile.
    expect(result.findings.map((f) => f.id)).toContain("deps-no-lockfile");
    expect(result.summary).toMatch(/deterministic finding/);
  });

  it("dependency auditor puts deterministic findings ahead of the model's", async () => {
    const provider = new FakeProvider([okReply]);
    const result = await new DependencyAuditorAgent().run(makeContext(provider));
    expect(result.status).toBe("completed");
    expect(result.findings.at(-1)?.id).toBe("sample");
    expect(provider.calls[0]?.messages[0]?.content).toContain("deps-no-lockfile");
  });
});
