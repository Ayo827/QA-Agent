import { allDeps, type PackageJson } from "./packageJson.js";

export type TestFramework = "jest" | "mocha" | "vitest" | "none";

const FRAMEWORK_DEP_NAMES: { framework: TestFramework; depNames: string[] }[] = [
  { framework: "jest", depNames: ["jest"] },
  { framework: "vitest", depNames: ["vitest"] },
  { framework: "mocha", depNames: ["mocha"] },
];

/**
 * Reports anything other than "none" only if BOTH a test-framework devDependency AND an actual
 * "test" script are present — a stray framework dependency with no test script is reported as
 * "none" (with the caller free to separately note the unused dependency), never upgraded silently.
 */
export async function detectTestFramework(
  _rootPath: string,
  pkg: PackageJson | undefined,
): Promise<TestFramework> {
  const deps = allDeps(pkg);
  const hasTestScript = Boolean(pkg?.scripts?.test);
  if (!hasTestScript) return "none";

  for (const { framework, depNames } of FRAMEWORK_DEP_NAMES) {
    if (depNames.some((dep) => dep in deps)) return framework;
  }
  return "none";
}
