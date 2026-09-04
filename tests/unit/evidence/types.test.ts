import { describe, expect, it } from "vitest";
import { compareBySeverity, isVerified, type Finding } from "../../../src/core/evidence/types.js";

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: "test-finding",
    agent: "test-agent",
    severity: "medium",
    title: "Test finding",
    description: "A test finding",
    evidence: [{ type: "ai_inference", confidence: "medium", rationale: "because" }],
    ...overrides,
  };
}

describe("isVerified", () => {
  it("is false for a finding backed only by ai_inference", () => {
    expect(isVerified(makeFinding({}))).toBe(false);
  });

  it("is true when at least one evidence entry is tool_execution", () => {
    const finding = makeFinding({
      evidence: [{ type: "tool_execution", commandId: "lint", exitCode: 0, excerpt: "0 problems" }],
    });
    expect(isVerified(finding)).toBe(true);
  });

  it("is true when at least one evidence entry is static_analysis", () => {
    const finding = makeFinding({
      evidence: [{ type: "static_analysis", filePath: "index.js", excerpt: "app.use(cors())" }],
    });
    expect(isVerified(finding)).toBe(true);
  });

  it("is true when mixed with an unverified entry, as long as one verified entry exists", () => {
    const finding = makeFinding({
      evidence: [
        { type: "ai_inference", confidence: "low", rationale: "guess" },
        { type: "tool_execution", commandId: "lint", exitCode: 1, excerpt: "1 error" },
      ],
    });
    expect(isVerified(finding)).toBe(true);
  });
});

describe("compareBySeverity", () => {
  it("orders critical before high before medium before low before info", () => {
    const findings = [
      makeFinding({ severity: "info" }),
      makeFinding({ severity: "critical" }),
      makeFinding({ severity: "low" }),
      makeFinding({ severity: "high" }),
      makeFinding({ severity: "medium" }),
    ];
    const sorted = [...findings].sort(compareBySeverity).map((f) => f.severity);
    expect(sorted).toEqual(["critical", "high", "medium", "low", "info"]);
  });
});
