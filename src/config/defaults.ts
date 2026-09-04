import path from "node:path";
import { QAConfigSchema, type QAConfig, type AgentName } from "./schema.js";

export interface BuildDefaultConfigOptions {
  targetPath: string;
  name?: string;
  model?: string;
  agents?: AgentName[];
  outputDir?: string;
}

/** Builds a fully-populated, schema-valid QAConfig from minimal `qa init` inputs. */
export function buildDefaultConfig(options: BuildDefaultConfigOptions): QAConfig {
  const resolvedTargetPath = path.resolve(options.targetPath);
  return QAConfigSchema.parse({
    version: 1,
    target: {
      path: resolvedTargetPath,
      name: options.name ?? path.basename(resolvedTargetPath),
    },
    ai: {
      ...(options.model ? { model: options.model } : {}),
    },
    run: {
      ...(options.agents ? { agents: options.agents } : {}),
    },
    output: {
      ...(options.outputDir ? { dir: options.outputDir } : {}),
    },
  });
}
