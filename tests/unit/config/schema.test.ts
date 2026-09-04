import { describe, expect, it } from "vitest";
import { QAConfigSchema } from "../../../src/config/schema.js";
import { buildDefaultConfig } from "../../../src/config/defaults.js";

describe("QAConfigSchema", () => {
  it("applies defaults for a minimal valid config", () => {
    const result = QAConfigSchema.parse({ version: 1, target: { path: "/some/repo" } });
    expect(result.ai.model).toBe("claude-opus-4-8");
    expect(result.ai.apiKeyEnv).toBe("ANTHROPIC_API_KEY");
    expect(result.tools.allowTestExecution).toBe(false);
    expect(result.run.agents).toContain("security-auditor");
  });

  it("rejects a missing target.path", () => {
    const result = QAConfigSchema.safeParse({ version: 1, target: {} });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown agent name", () => {
    const result = QAConfigSchema.safeParse({
      version: 1,
      target: { path: "/some/repo" },
      run: { agents: ["not-a-real-agent"] },
    });
    expect(result.success).toBe(false);
  });
});

describe("buildDefaultConfig", () => {
  it("resolves the target path to an absolute path and derives a display name", () => {
    const config = buildDefaultConfig({ targetPath: "." });
    expect(config.target.path).not.toBe(".");
    expect(config.target.name).toBeTruthy();
  });

  it("honors an explicit agent subset", () => {
    const config = buildDefaultConfig({ targetPath: ".", agents: ["security-auditor"] });
    expect(config.run.agents).toEqual(["security-auditor"]);
  });
});
