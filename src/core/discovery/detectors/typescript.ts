import fs from "node:fs/promises";
import path from "node:path";
import { allDeps, type PackageJson } from "./packageJson.js";

export async function detectTypeScript(rootPath: string, pkg: PackageJson | undefined): Promise<boolean> {
  if ("typescript" in allDeps(pkg)) return true;
  try {
    await fs.access(path.join(rootPath, "tsconfig.json"));
    return true;
  } catch {
    return false;
  }
}
