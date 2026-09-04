import fs from "node:fs/promises";
import path from "node:path";

const CI_MARKERS = [".github/workflows", ".gitlab-ci.yml", ".circleci/config.yml", "azure-pipelines.yml"];

export async function detectCI(rootPath: string): Promise<boolean> {
  for (const marker of CI_MARKERS) {
    try {
      const stat = await fs.stat(path.join(rootPath, marker));
      if (marker.endsWith("/workflows")) {
        if (stat.isDirectory()) {
          const entries = await fs.readdir(path.join(rootPath, marker));
          if (entries.length > 0) return true;
        }
      } else {
        return true;
      }
    } catch {
      // marker not present, keep checking
    }
  }
  return false;
}
