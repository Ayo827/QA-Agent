import path from "node:path";
import { readPackageJson, type PackageJson } from "./detectors/packageJson.js";
import { detectTypeScript } from "./detectors/typescript.js";
import { detectEslintPrettier } from "./detectors/eslintPrettier.js";
import { detectTestFramework, type TestFramework } from "./detectors/testFramework.js";
import { detectFrameworks } from "./detectors/frameworks.js";
import { detectDatabaseLayer, type DatabaseLayer } from "./detectors/database.js";
import { detectSecretFiles, type SecretFileHit } from "./detectors/secrets.js";
import { detectCI } from "./detectors/ci.js";

export interface RepoProfile {
  rootPath: string;
  name: string;
  language: "javascript" | "typescript" | "mixed" | "unknown";
  nodeVersion?: string;
  frameworks: string[];
  hasTypeScript: boolean;
  hasESLint: boolean;
  hasPrettier: boolean;
  testFramework: TestFramework;
  hasCI: boolean;
  scripts: Record<string, string>;
  entryPoints: string[];
  dbLayer: DatabaseLayer;
  secretFilesDetected: SecretFileHit[];
}

export type { SecretFileHit } from "./detectors/secrets.js";
export type { TestFramework } from "./detectors/testFramework.js";
export type { DatabaseLayer } from "./detectors/database.js";

function inferEntryPoints(pkg: PackageJson | undefined): string[] {
  const entries = new Set<string>();
  if (pkg?.main) entries.add(pkg.main);
  entries.add("index.js");
  entries.add("index.ts");
  return [...entries];
}

function inferLanguage(hasTypeScript: boolean, pkg: PackageJson | undefined): RepoProfile["language"] {
  if (hasTypeScript) return "typescript";
  if (pkg) return "javascript";
  return "unknown";
}

export async function scanRepo(rootPath: string): Promise<RepoProfile> {
  const absoluteRoot = path.resolve(rootPath);
  const pkg = await readPackageJson(absoluteRoot);
  const hasTypeScript = await detectTypeScript(absoluteRoot, pkg);
  const { hasESLint, hasPrettier } = await detectEslintPrettier(absoluteRoot, pkg);
  const testFramework = await detectTestFramework(absoluteRoot, pkg);
  const frameworks = await detectFrameworks(absoluteRoot, pkg);
  const dbLayer = await detectDatabaseLayer(absoluteRoot, pkg);
  const secretFilesDetected = await detectSecretFiles(absoluteRoot);
  const hasCI = await detectCI(absoluteRoot);

  return {
    rootPath: absoluteRoot,
    name: pkg?.name ?? path.basename(absoluteRoot),
    language: inferLanguage(hasTypeScript, pkg),
    nodeVersion: pkg?.engines?.node,
    frameworks,
    hasTypeScript,
    hasESLint,
    hasPrettier,
    testFramework,
    hasCI,
    scripts: pkg?.scripts ?? {},
    entryPoints: inferEntryPoints(pkg),
    dbLayer,
    secretFilesDetected,
  };
}
