import fs from "node:fs/promises";
import { getDefaultConfigFilePath } from "./loader.js";
import type { QAConfig } from "./schema.js";

/** Writes qa.config.json into the qa-agent working directory (never into the target repo). */
export async function writeConfig(config: QAConfig, cwd: string = process.cwd()): Promise<string> {
  const configFilePath = getDefaultConfigFilePath(cwd);
  await fs.writeFile(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return configFilePath;
}
