import fs from "node:fs/promises";
import path from "node:path";

export interface PackageJson {
  name?: string;
  main?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function readPackageJson(rootPath: string): Promise<PackageJson | undefined> {
  try {
    const raw = await fs.readFile(path.join(rootPath, "package.json"), "utf-8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return undefined;
  }
}

export function allDeps(pkg: PackageJson | undefined): Record<string, string> {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}
