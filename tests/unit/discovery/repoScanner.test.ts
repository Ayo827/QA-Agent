import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../../src/core/discovery/repoScanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleRepoRoot = path.resolve(__dirname, "../../fixtures/sample-repo");

describe("scanRepo (against tests/fixtures/sample-repo, shaped like the real target repo)", () => {
  it("detects express mounted inside a Firebase Cloud Function via the onRequest( heuristic", async () => {
    const profile = await scanRepo(sampleRepoRoot);
    expect(profile.frameworks).toContain("express");
    expect(profile.frameworks).toContain("firebase-functions");
    expect(profile.frameworks).toContain("express-in-cloud-function");
  });

  it("reports no test framework when there is no test script, regardless of scripts present", async () => {
    const profile = await scanRepo(sampleRepoRoot);
    expect(profile.testFramework).toBe("none");
  });

  it("detects firestore-admin-sdk as the database layer from the firebase-admin dependency", async () => {
    const profile = await scanRepo(sampleRepoRoot);
    expect(profile.dbLayer).toBe("firestore-admin-sdk");
  });

  it("detects the fixture .env file by filename pattern", async () => {
    const profile = await scanRepo(sampleRepoRoot);
    const envHit = profile.secretFilesDetected.find((h) => h.relativePath === ".env");
    expect(envHit).toBeDefined();
    expect(envHit?.reason).toBe("env-file");
  });

  it("plain javascript, no CI configured", async () => {
    const profile = await scanRepo(sampleRepoRoot);
    expect(profile.hasTypeScript).toBe(false);
    expect(profile.language).toBe("javascript");
    expect(profile.hasCI).toBe(false);
  });
});
