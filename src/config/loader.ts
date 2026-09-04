import fs from "node:fs/promises";
import path from "node:path";
import { QAConfigSchema, type QAConfig } from "./schema.js";

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export const DEFAULT_CONFIG_FILENAME = "qa.config.json";

export interface LoadConfigOptions {
  /** Explicit --config path, or a directory/file to resolve qa.config.json from. Defaults to cwd. */
  configPath?: string;
  cwd?: string;
  /** Overrides target.path for this invocation only (e.g. `qa run <path>`); never persisted. */
  targetPathOverride?: string;
}

function resolveConfigFilePath(options: LoadConfigOptions): string {
  const cwd = options.cwd ?? process.cwd();
  if (options.configPath) {
    return path.isAbsolute(options.configPath)
      ? options.configPath
      : path.resolve(cwd, options.configPath);
  }
  return path.resolve(cwd, DEFAULT_CONFIG_FILENAME);
}

/** Loads, parses, and validates the QA config. Throws ConfigError with human-readable details on failure. */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<QAConfig> {
  const configFilePath = resolveConfigFilePath(options);

  let raw: string;
  try {
    raw = await fs.readFile(configFilePath, "utf-8");
  } catch {
    throw new ConfigError(
      `No config file found at ${configFilePath}. Run "qa init" first, or pass --config <path>.`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Config file at ${configFilePath} is not valid JSON: ${(err as Error).message}`);
  }

  if (options.targetPathOverride) {
    const merged = parsedJson as Record<string, unknown>;
    merged.target = {
      ...(typeof merged.target === "object" && merged.target !== null ? merged.target : {}),
      path: path.resolve(options.targetPathOverride),
    };
  }

  const result = QAConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new ConfigError(`Config file at ${configFilePath} failed validation:`, details);
  }

  const config = result.data;
  await assertTargetIsValidProject(config.target.path);
  return config;
}

/** Filesystem check, independent of schema validation: target.path must exist and contain a package.json. */
export async function assertTargetIsValidProject(targetPath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch {
    throw new ConfigError(`Target repo path does not exist: ${targetPath}`);
  }
  if (!stat.isDirectory()) {
    throw new ConfigError(`Target repo path is not a directory: ${targetPath}`);
  }
  const packageJsonPath = path.join(targetPath, "package.json");
  try {
    await fs.access(packageJsonPath);
  } catch {
    throw new ConfigError(
      `Target repo at ${targetPath} has no package.json. Point target.path at the actual Node project root ` +
        `(e.g. a nested "functions/" directory for Firebase-style projects).`,
    );
  }
}

export function getDefaultConfigFilePath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, DEFAULT_CONFIG_FILENAME);
}
