import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { execa } from "execa";
import { gitApplyCheck, patchTouchesOnly, proposeFixes } from "../../../src/core/fix/fixAgent.js";
import { writeFixes } from "../../../src/core/fix/fixWriter.js";
import { noopLogger } from "../../../src/core/agents/baseAgent.js";
import { FakeProvider, makeFinding, sampleRepoRoot } from "../../helpers.js";

const PATCH = `--- a/index.js
+++ b/index.js
@@ -4,1 +4,1 @@
-app.get("/ping", (req, res) => res.send("pong"));
+app.get("/ping", (req, res) => res.status(200).send("pong"));
`;

const reply = (o: object) => JSON.stringify(o);
const readFile = async (p: string) => (p === "index.js" ? 'const app = 1;\n' : undefined);
const applies = async () => ({ check: "applies" as const });

const base = {
  rootPath: sampleRepoRoot,
  readFile,
  maxTokens: 1000,
  logger: noopLogger(),
  checkPatch: applies,
};

describe("patchTouchesOnly", () => {
  it("accepts a patch for a file the model was shown", () => {
    expect(patchTouchesOnly(PATCH, ["index.js"])).toEqual({ ok: true });
  });

  it("rejects a file the model was not shown", () => {
    const r = patchTouchesOnly(PATCH, ["other.js"]);
    expect(r.ok).toBe(false);
  });

  it("rejects paths that leave the repository", () => {
    const r = patchTouchesOnly("--- a/../x.js\n+++ b/../x.js\n@@ -1 +1 @@\n-a\n+b\n", ["../x.js"]);
    expect(r).toMatchObject({ ok: false });
  });

  it("rejects file creation and deletion", () => {
    expect(patchTouchesOnly("--- /dev/null\n+++ b/index.js\n@@ -0,0 +1 @@\n+x\n", ["index.js"])).toMatchObject({ ok: false });
    expect(patchTouchesOnly("--- a/index.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n", ["index.js"])).toMatchObject({ ok: false });
  });

  it("rejects a patch with no file header", () => {
    expect(patchTouchesOnly("not a diff", ["index.js"])).toMatchObject({ ok: false });
  });
});

describe("proposeFixes", () => {
  it("returns a patch when the model offers a valid one", async () => {
    const provider = new FakeProvider([reply({ canFix: true, reason: "r", description: "adds status", patch: PATCH })]);
    const result = await proposeFixes({ ...base, provider, findings: [makeFinding()] });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ check: "applies", files: ["index.js"], key: "test-agent::a-finding" });
    expect(provider.calls[0]?.messages[0]?.content).toContain("--- FILE: index.js ---");
  });

  it("skips findings with no cited source file without calling the model", async () => {
    const provider = new FakeProvider([]);
    const result = await proposeFixes({
      ...base,
      provider,
      findings: [makeFinding({ evidence: [{ type: "ai_inference", confidence: "low", rationale: "hunch" }] })],
    });
    expect(provider.calls).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/no source file/);
  });

  it("skips when the cited file cannot be read", async () => {
    const provider = new FakeProvider([]);
    const result = await proposeFixes({
      ...base,
      provider,
      findings: [makeFinding({ evidence: [{ type: "static_analysis", filePath: ".env", excerpt: "x" }] })],
    });
    expect(result.skipped[0]?.reason).toMatch(/could not be read/);
  });

  it("records the model's refusal as a skip", async () => {
    const provider = new FakeProvider([reply({ canFix: false, reason: "needs a design decision" })]);
    const result = await proposeFixes({ ...base, provider, findings: [makeFinding()] });
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe("needs a design decision");
  });

  it("rejects a patch that edits a file it was not shown", async () => {
    const stray = PATCH.replace(/index\.js/g, "secrets.js");
    const provider = new FakeProvider([reply({ canFix: true, reason: "r", description: "d", patch: stray })]);
    const result = await proposeFixes({ ...base, provider, findings: [makeFinding()] });
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/patch rejected/);
  });

  it("skips an unusable model response instead of throwing", async () => {
    const provider = new FakeProvider(["not json at all"]);
    const result = await proposeFixes({ ...base, provider, findings: [makeFinding()] });
    expect(result.skipped[0]?.reason).toMatch(/could not be used/);
  });

  it("honours min severity, max count and the id filter, most severe first", async () => {
    const provider = new FakeProvider([reply({ canFix: false, reason: "no" })]);
    const findings = [
      makeFinding({ id: "low-one", severity: "low" }),
      makeFinding({ id: "med-one", severity: "medium" }),
      makeFinding({ id: "crit-one", severity: "critical" }),
    ];
    await proposeFixes({ ...base, provider, findings, minSeverity: "medium", maxFindings: 1 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.messages[0]?.content).toContain("crit-one");

    const only = new FakeProvider([reply({ canFix: false, reason: "no" })]);
    await proposeFixes({ ...base, provider: only, findings, minSeverity: "info", onlyIds: ["low-one"] });
    expect(only.calls).toHaveLength(1);
  });
});

describe("gitApplyCheck", () => {
  it("reports a patch that does not match the file, without changing anything", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-fix-"));
    await fs.writeFile(path.join(dir, "index.js"), "console.log('hi');\n");
    const bad = "--- a/index.js\n+++ b/index.js\n@@ -1 +1 @@\n-something else\n+x\n";
    const result = await gitApplyCheck(dir, bad);
    expect(result.check).toBe("does_not_apply");
    expect(await fs.readFile(path.join(dir, "index.js"), "utf-8")).toBe("console.log('hi');\n");
  });

  it("accepts a matching patch", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-fix-"));
    await fs.writeFile(path.join(dir, "index.js"), "console.log('hi');\n");
    const good = "--- a/index.js\n+++ b/index.js\n@@ -1 +1 @@\n-console.log('hi');\n+console.log('hello');\n";
    const gitOk = await execa("git", ["--version"]).then(() => true, () => false);
    if (!gitOk) return;
    expect((await gitApplyCheck(dir, good)).check).toBe("applies");
    expect(await fs.readFile(path.join(dir, "index.js"), "utf-8")).toBe("console.log('hi');\n");
  });
});

describe("writeFixes", () => {
  it("writes patches and an index under the report directory only", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-fixout-"));
    const written = await writeFixes(
      {
        proposals: [
          {
            key: "test-agent::a-finding",
            finding: { id: "a-finding", agent: "test-agent", severity: "medium", title: "A finding" },
            files: ["index.js"],
            description: "adds status",
            reason: "r",
            patch: PATCH,
            check: "applies",
          },
        ],
        skipped: [{ key: "x::y", finding: { id: "y", agent: "x", severity: "low", title: "Y" }, reason: "nope" }],
      },
      dir,
    );
    expect(written.patchPaths[0]).toBe(path.join(dir, "fixes", "test-agent_a-finding.patch"));
    expect(await fs.readFile(written.indexPath, "utf-8")).toContain("Nothing was applied");
    expect(await fs.readFile(written.indexPath, "utf-8")).toContain("nope");
  });
});
