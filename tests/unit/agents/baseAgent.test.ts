import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractJson, makeSandboxedReader, normalizeAgentJson } from "../../../src/core/agents/baseAgent.js";
import type { RepoProfile } from "../../../src/core/discovery/repoScanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleRepoRoot = path.resolve(__dirname, "../../fixtures/sample-repo");

function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
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

describe("makeSandboxedReader", () => {
  it("reads a real file inside the repo root", async () => {
    const readFile = makeSandboxedReader(makeProfile());
    const content = await readFile("index.js");
    expect(content).toContain("onRequest");
  });

  it("returns undefined for a path that escapes the repo root via ..", async () => {
    const readFile = makeSandboxedReader(makeProfile());
    const content = await readFile("../../../package.json");
    expect(content).toBeUndefined();
  });

  it("returns undefined for a file flagged as a detected secret file", async () => {
    const readFile = makeSandboxedReader(
      makeProfile({ secretFilesDetected: [{ relativePath: ".env", reason: "env-file", gitTracked: false }] }),
    );
    const content = await readFile(".env");
    expect(content).toBeUndefined();
  });

  it("returns undefined for a nonexistent file", async () => {
    const readFile = makeSandboxedReader(makeProfile());
    const content = await readFile("does-not-exist.js");
    expect(content).toBeUndefined();
  });
});

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts JSON from surrounding prose/markdown fences", () => {
    const text = 'Here is the result:\n```json\n{"a":1,"b":[1,2]}\n```\nHope that helps.';
    expect(extractJson(text)).toEqual({ a: 1, b: [1, 2] });
  });
});

describe("normalizeAgentJson", () => {
  const wrap = (evidence: unknown[]) => ({ summary: "s", findings: [{ id: "x", evidence }] });
  const first = (o: unknown) => ((o as { findings: { evidence: Record<string, unknown>[] }[] }).findings[0] as { evidence: Record<string, unknown>[] }).evidence[0] as Record<string, unknown>;

  it("turns a string lineRange into a tuple", () => {
    expect(first(normalizeAgentJson(wrap([{ type: "static_analysis", lineRange: "10-20" }]))).lineRange).toEqual([10, 20]);
    expect(first(normalizeAgentJson(wrap([{ type: "static_analysis", lineRange: "L7" }]))).lineRange).toEqual([7, 7]);
  });

  it("drops a lineRange it cannot read rather than failing the whole review", () => {
    expect("lineRange" in first(normalizeAgentJson(wrap([{ type: "static_analysis", lineRange: "somewhere" }])))).toBe(false);
  });

  it("fills a missing ai_inference rationale from excerpt", () => {
    const e = first(normalizeAgentJson(wrap([{ type: "ai_inference", excerpt: "because" }])));
    expect(e.rationale).toBe("because");
    expect(e.confidence).toBe("low");
  });

  it("leaves other input alone", () => {
    expect(normalizeAgentJson("text")).toBe("text");
    expect(normalizeAgentJson({ summary: "s" })).toEqual({ summary: "s" });
  });
});
