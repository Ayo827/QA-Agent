import { allDeps, type PackageJson } from "./packageJson.js";

export type DatabaseLayer = "firestore-admin-sdk" | "prisma" | "sequelize" | "mongoose" | "typeorm" | "drizzle" | "unknown" | "none";

const DB_DEP_MARKERS: { layer: DatabaseLayer; depNames: string[] }[] = [
  { layer: "prisma", depNames: ["@prisma/client", "prisma"] },
  { layer: "typeorm", depNames: ["typeorm"] },
  { layer: "drizzle", depNames: ["drizzle-orm"] },
  { layer: "sequelize", depNames: ["sequelize"] },
  { layer: "mongoose", depNames: ["mongoose"] },
  { layer: "firestore-admin-sdk", depNames: ["firebase-admin"] },
];

export async function detectDatabaseLayer(_rootPath: string, pkg: PackageJson | undefined): Promise<DatabaseLayer> {
  const deps = allDeps(pkg);
  for (const { layer, depNames } of DB_DEP_MARKERS) {
    if (depNames.some((dep) => dep in deps)) return layer;
  }
  return pkg ? "none" : "unknown";
}
