import fs from "node:fs/promises";
import path from "node:path";
import { allDeps, type PackageJson } from "./packageJson.js";

const FRAMEWORK_DEP_MARKERS: { name: string; depNames: string[] }[] = [
  { name: "express", depNames: ["express"] },
  { name: "firebase-functions", depNames: ["firebase-functions"] },
  { name: "firebase-admin", depNames: ["firebase-admin"] },
  { name: "nestjs", depNames: ["@nestjs/core"] },
  { name: "fastify", depNames: ["fastify"] },
  { name: "koa", depNames: ["koa"] },
  { name: "next", depNames: ["next"] },
];

async function readEntryFileText(rootPath: string, entry: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(rootPath, entry), "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Dependency-name heuristics, plus a light static grep of index.js/index.ts for
 * `onRequest(`/`onCall(` — this is what distinguishes "Express mounted inside a Cloud Function"
 * from a standalone Express server, which dependency names alone can't tell apart.
 */
export async function detectFrameworks(rootPath: string, pkg: PackageJson | undefined): Promise<string[]> {
  const deps = allDeps(pkg);
  const frameworks = FRAMEWORK_DEP_MARKERS.filter(({ depNames }) => depNames.some((dep) => dep in deps)).map(
    ({ name }) => name,
  );

  const entryText =
    (await readEntryFileText(rootPath, "index.js")) ?? (await readEntryFileText(rootPath, "index.ts"));
  if (entryText && frameworks.includes("firebase-functions") && frameworks.includes("express")) {
    if (/\bonRequest\s*\(/.test(entryText)) {
      frameworks.push("express-in-cloud-function");
    }
  }
  if (entryText && /\bonCall\s*\(/.test(entryText)) {
    frameworks.push("firebase-callable-function");
  }

  return frameworks;
}
