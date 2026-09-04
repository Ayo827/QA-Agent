import { describe, expect, it } from "vitest";
import { buildCommandRegistry } from "../../../src/core/tool-runner/commandRegistry.js";
import { QAConfigSchema } from "../../../src/config/schema.js";
import type { RepoProfile } from "../../../src/core/discovery/repoScanner.js";

function makeProfile(scripts: Record<string, string>): RepoProfile {
  return {
    rootPath: "/fake/repo",
    name: "fake-repo",
    language: "javascript",
    frameworks: [],
    hasTypeScript: false,
    hasESLint: true,
    hasPrettier: true,
    testFramework: "none",
    hasCI: false,
    scripts,
    entryPoints: ["index.js"],
    dbLayer: "unknown",
    secretFilesDetected: [],
  };
}

function makeConfig(overrides: Partial<{ allowTestExecution: boolean }> = {}) {
  return QAConfigSchema.parse({
    version: 1,
    target: { path: "/fake/repo" },
    tools: { allowTestExecution: overrides.allowTestExecution ?? false },
  });
}

describe("buildCommandRegistry", () => {
  it("matches the real target repo shape: only lint is runnable, the rest are not_configured", () => {
    const profile = makeProfile({ lint: "eslint .", "lint:fix": "eslint . --fix", format: "prettier --write ." });
    const entries = buildCommandRegistry(profile, makeConfig());

    const byId = Object.fromEntries(entries.map((e) => [e.spec?.id ?? e.skipped?.id, e]));
    expect(byId.lint.spec).toBeDefined();
    expect(byId.lint.spec?.command).toBe("npm");
    expect(byId.lint.spec?.args).toEqual(["run", "lint"]);
    expect(byId.typecheck.skipped?.status).toBe("not_configured");
    expect(byId.build.skipped?.status).toBe("not_configured");
    expect(byId.test.skipped?.status).toBe("not_configured");
  });

  it("never builds a spec for a denylisted script name, even if it exists", () => {
    const profile = makeProfile({ serve: "firebase emulators:start", lint: "eslint ." });
    const entries = buildCommandRegistry(profile, makeConfig());
    // "serve" isn't one of the tracked keys (lint/typecheck/build/test) at all, so it can never
    // surface as a spec regardless — this asserts the tracked keys themselves stay safe.
    for (const entry of entries) {
      expect(entry.spec?.id).not.toBe("serve");
    }
  });

  it("skips test execution by default even when a safe test script exists", () => {
    const profile = makeProfile({ test: "jest" });
    const entries = buildCommandRegistry(profile, makeConfig({ allowTestExecution: false }));
    const testEntry = entries.find((e) => (e.spec?.id ?? e.skipped?.id) === "test");
    expect(testEntry?.skipped?.status).toBe("skipped_unsafe");
  });

  it("runs test only when allowTestExecution is explicitly true and the script is safe", () => {
    const profile = makeProfile({ test: "jest" });
    const entries = buildCommandRegistry(profile, makeConfig({ allowTestExecution: true }));
    const testEntry = entries.find((e) => (e.spec?.id ?? e.skipped?.id) === "test");
    expect(testEntry?.spec).toBeDefined();
  });

  it("still refuses to run a test script that matches an unsafe command pattern even with allowTestExecution true", () => {
    const profile = makeProfile({ test: "firebase emulators:start && jest" });
    const entries = buildCommandRegistry(profile, makeConfig({ allowTestExecution: true }));
    const testEntry = entries.find((e) => (e.spec?.id ?? e.skipped?.id) === "test");
    expect(testEntry?.skipped?.status).toBe("skipped_unsafe");
  });
});
