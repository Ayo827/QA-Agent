import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSecretScan } from "../../../src/core/agents/secretScanner.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-agent-secret-scan-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("runSecretScan", () => {
  it("flags a hardcoded AWS access key ID", async () => {
    await fs.writeFile(path.join(tmpDir, "config.js"), 'const key = "AKIAABCDEFGHIJKLMNOP";');
    const findings = await runSecretScan(tmpDir, []);
    expect(findings.some((f) => f.id.includes("aws-access-key-id"))).toBe(true);
  });

  it("flags a hardcoded jwt.sign secret", async () => {
    await fs.writeFile(path.join(tmpDir, "auth.js"), 'jwt.sign(payload, "super-secret-value-123");');
    const findings = await runSecretScan(tmpDir, []);
    expect(findings.some((f) => f.id.includes("hardcoded-jwt-secret"))).toBe(true);
  });

  it("every finding carries tool_execution evidence, never ai_inference", async () => {
    await fs.writeFile(path.join(tmpDir, "config.js"), 'const key = "AKIAABCDEFGHIJKLMNOP";');
    const findings = await runSecretScan(tmpDir, []);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.evidence.every((e) => e.type === "tool_execution")).toBe(true);
    }
  });

  it("does not flag clean, ordinary source code", async () => {
    await fs.writeFile(path.join(tmpDir, "utils.js"), "function add(a, b) { return a + b; }\nmodule.exports = { add };");
    const findings = await runSecretScan(tmpDir, []);
    expect(findings).toHaveLength(0);
  });

  it("excludes explicitly-excluded relative paths (files handled by filename-only detection)", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), 'AWS_KEY=AKIAABCDEFGHIJKLMNOP\n');
    const findings = await runSecretScan(tmpDir, [".env"]);
    expect(findings).toHaveLength(0);
  });
});

describe("runSecretScan false positives", () => {
  it("ignores a PEM header that only appears in a comment", async () => {
    await fs.writeFile(path.join(tmpDir, "check.js"), '// v2 holds "-----BEGIN PRIVATE KEY-----" as its header\n/*\n * -----BEGIN PRIVATE KEY-----\n */\n');
    expect(await runSecretScan(tmpDir, [])).toEqual([]);
  });

  it("still flags a PEM header in code, even after a comment that names it", async () => {
    await fs.writeFile(path.join(tmpDir, "k.js"), '// -----BEGIN PRIVATE KEY-----\nconst k = "-----BEGIN PRIVATE KEY-----";\n');
    const findings = await runSecretScan(tmpDir, []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("critical");
    expect(findings[0]?.evidence[0]).toMatchObject({ excerpt: expect.stringContaining("k.js:2") });
  });

  it("downgrades a hardcoded jwt secret in a test file to low", async () => {
    await fs.mkdir(path.join(tmpDir, "__tests__"));
    await fs.writeFile(path.join(tmpDir, "__tests__", "auth.test.js"), 'jwt.sign(payload, "throwaway-secret");');
    const findings = await runSecretScan(tmpDir, []);
    expect(findings[0]?.severity).toBe("low");
  });
});
