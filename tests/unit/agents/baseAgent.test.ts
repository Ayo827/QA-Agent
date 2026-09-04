import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractJson, makeSandboxedReader } from "../../../src/core/agents/baseAgent.js";
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
