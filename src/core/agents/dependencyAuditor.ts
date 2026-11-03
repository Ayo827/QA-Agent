import fs from "node:fs/promises";
import path from "node:path";
import { DEPENDENCY_AUDITOR_PROMPT } from "../../prompts/dependencyAuditor.js";
import { analyzeManifest, type PackageManifest } from "./dependencyChecks.js";
import { ReviewAgent } from "./reviewAgent.js";

const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export class DependencyAuditorAgent extends ReviewAgent {
  constructor() {
    super({
      name: "dependency-auditor",
      description: "Deterministic manifest checks plus AI review of the dependency set.",
      prompt: DEPENDENCY_AUDITOR_PROMPT,
      patterns: ["package.json"],
      fileLimit: 1,
      async deterministic(ctx) {
        const raw = await ctx.readFile("package.json");
        if (raw === undefined) return [];
        let manifest: PackageManifest;
        try {
          manifest = JSON.parse(raw) as PackageManifest;
        } catch {
          return [];
        }
        const lockfiles: string[] = [];
        for (const name of LOCKFILES) {
          if (await exists(path.join(ctx.repoProfile.rootPath, name))) lockfiles.push(name);
        }
        return analyzeManifest(manifest, lockfiles);
      },
    });
  }
}
