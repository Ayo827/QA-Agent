import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareFindings, hasRegression } from "../../../src/core/compare/compare.js";
import { loadReport, ReportLoadError, resolveReportPath } from "../../../src/core/compare/reportLoader.js";
import { makeFinding } from "../../helpers.js";

const meta = { baselineGeneratedAt: "2026-01-01T00:00:00Z" };

describe("compareFindings", () => {
  it("sorts findings into resolved, introduced, persisting and changed", () => {
    const baseline = [
      makeFinding({ id: "gone", title: "Hardcoded credentials" }),
      makeFinding({ id: "same", title: "Missing rate limiting" }),
      makeFinding({ id: "worse", severity: "low", title: "Verbose error messages" }),
    ];
    const current = [
      makeFinding({ id: "same", title: "Missing rate limiting" }),
      makeFinding({ id: "worse", severity: "high", title: "Verbose error messages" }),
      makeFinding({ id: "fresh", title: "Unvalidated redirect target" }),
    ];
    const c = compareFindings(baseline, current, meta);
    expect(c.resolved.map((f) => f.id)).toEqual(["gone"]);
    expect(c.introduced.map((f) => f.id)).toEqual(["fresh"]);
    expect(c.persisting.map((f) => f.id)).toEqual(["same"]);
    expect(c.changedSeverity).toMatchObject([{ from: "low", to: "high" }]);
  });

  it("treats the same id from a different agent as a different finding", () => {
    const c = compareFindings([makeFinding({ agent: "a" })], [makeFinding({ agent: "b" })], meta);
    expect(c.resolved).toHaveLength(1);
    expect(c.introduced).toHaveLength(1);
  });
});

describe("hasRegression", () => {
  it("ignores a new finding backed only by AI inference", () => {
    const hunch = makeFinding({ severity: "high", evidence: [{ type: "ai_inference", confidence: "low", rationale: "r" }] });
    expect(hasRegression(compareFindings([], [hunch], meta))).toBe(false);
  });

  it("flags a new medium finding but not a new low one", () => {
    expect(hasRegression(compareFindings([], [makeFinding({ severity: "medium" })], meta))).toBe(true);
    expect(hasRegression(compareFindings([], [makeFinding({ severity: "low" })], meta))).toBe(false);
  });

  it("flags a finding that got more severe, not one that got less severe", () => {
    const worse = compareFindings([makeFinding({ severity: "low" })], [makeFinding({ severity: "high" })], meta);
    const better = compareFindings([makeFinding({ severity: "high" })], [makeFinding({ severity: "low" })], meta);
    expect(hasRegression(worse)).toBe(true);
    expect(hasRegression(better)).toBe(false);
  });
});

describe("report loading", () => {
  async function makeReportsDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-reports-"));
    const report = (generatedAt: string) =>
      JSON.stringify({
        generatedAt,
        profile: { name: "svc", rootPath: "/x" },
        findings: [],
        agentResults: [],
        toolResults: [],
        config: {},
      });
    for (const stamp of ["2026-01-01T00-00-00-000Z", "2026-02-01T00-00-00-000Z"]) {
      await fs.mkdir(path.join(dir, "svc", stamp), { recursive: true });
      await fs.writeFile(path.join(dir, "svc", stamp, "report.json"), report(stamp));
    }
    return dir;
  }

  it('resolves "latest" to the newest run', async () => {
    const dir = await makeReportsDir();
    const found = await resolveReportPath("latest", { outputDir: dir, targetName: "svc" });
    expect(found).toContain("2026-02-01");
    expect((await loadReport(found)).generatedAt).toBe("2026-02-01T00-00-00-000Z");
  });

  it("accepts a run directory", async () => {
    const dir = await makeReportsDir();
    const found = await resolveReportPath(path.join(dir, "svc", "2026-01-01T00-00-00-000Z"), {
      outputDir: dir,
      targetName: "svc",
    });
    expect(found).toContain("2026-01-01");
  });

  it("explains when there is nothing to compare against", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-empty-"));
    await expect(resolveReportPath("latest", { outputDir: dir, targetName: "svc" })).rejects.toThrow(/Run "qa run" first/);
  });

  it("rejects a file that is not a qa-agent report", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-bad-"));
    const file = path.join(dir, "report.json");
    await fs.writeFile(file, JSON.stringify({ hello: "world" }));
    await expect(loadReport(file)).rejects.toBeInstanceOf(ReportLoadError);
  });
});

describe("compareFindings with re-worded ids", () => {
  it("pairs the same issue across runs when the model renames the id", () => {
    const c = compareFindings(
      [makeFinding({ id: "unbounded-reads-partner-oversight", title: "Partner oversight reads all partner bookings into memory" })],
      [makeFinding({ id: "unbounded-reads-partners-overview", title: "Partners overview reads all partner bookings into memory" })],
      meta,
    );
    expect(c.resolved).toHaveLength(0);
    expect(c.introduced).toHaveLength(0);
    expect(c.persisting).toHaveLength(1);
  });

  it("does not pair unrelated findings, or findings from different agents", () => {
    const unrelated = compareFindings(
      [makeFinding({ id: "a", title: "CORS fallback is permissive" })],
      [makeFinding({ id: "b", title: "Analytics reads whole collections" })],
      meta,
    );
    expect(unrelated.resolved).toHaveLength(1);
    expect(unrelated.introduced).toHaveLength(1);

    const otherAgent = compareFindings(
      [makeFinding({ id: "a", agent: "x", title: "Analytics reads whole collections" })],
      [makeFinding({ id: "b", agent: "y", title: "Analytics reads whole collections" })],
      meta,
    );
    expect(otherAgent.introduced).toHaveLength(1);
  });

  it("uses each baseline finding only once", () => {
    const c = compareFindings(
      [makeFinding({ id: "a", title: "Analytics reads whole collections" })],
      [
        makeFinding({ id: "b", title: "Analytics reads whole collections" }),
        makeFinding({ id: "c", title: "Analytics reads whole collections twice" }),
      ],
      meta,
    );
    expect(c.persisting).toHaveLength(1);
    expect(c.introduced).toHaveLength(1);
  });
});
