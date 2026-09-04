import fs from "node:fs/promises";
import path from "node:path";
import { allDeps, type PackageJson } from "./packageJson.js";

const ESLINT_CONFIG_FILES = [".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc", "eslint.config.js", "eslint.config.mjs"];
const PRETTIER_CONFIG_FILES = [".prettierrc", ".prettierrc.js", ".prettierrc.json", ".prettierrc.cjs", "prettier.config.js"];

async function anyFileExists(rootPath: string, files: string[]): Promise<boolean> {
  for (const file of files) {
    try {
      await fs.access(path.join(rootPath, file));
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

export async function detectEslintPrettier(
  rootPath: string,
  pkg: PackageJson | undefined,
): Promise<{ hasESLint: boolean; hasPrettier: boolean }> {
  const deps = allDeps(pkg);
  const hasESLint = "eslint" in deps || (await anyFileExists(rootPath, ESLINT_CONFIG_FILES));
  const hasPrettier = "prettier" in deps || (await anyFileExists(rootPath, PRETTIER_CONFIG_FILES));
  return { hasESLint, hasPrettier };
}
