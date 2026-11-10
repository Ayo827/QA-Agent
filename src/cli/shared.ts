import path from "node:path";
import { ConfigError, loadConfig } from "../config/loader.js";
import type { QAConfig } from "../config/schema.js";
import type { Logger as AgentLogger } from "../core/agents/types.js";
import { createAgentRegistry } from "../core/agents/registry.js";
import { compareFindings } from "../core/compare/compare.js";
import { loadReport, ReportLoadError, resolveReportPath } from "../core/compare/reportLoader.js";
import { readPackageJson } from "../core/discovery/detectors/packageJson.js";
import { scanRepo } from "../core/discovery/repoScanner.js";
import { LeadAgentOrchestrator } from "../core/orchestrator/leadAgent.js";
import type { QARunResult } from "../core/orchestrator/runContext.js";
import { PluginLoadError } from "../core/plugins/externalLoader.js";
import { PluginManager } from "../core/plugins/pluginManager.js";
import { AnthropicProvider } from "../core/provider/anthropicProvider.js";
import { writeReport, type WriteReportResult } from "../core/reports/writer.js";
import { ToolRunner } from "../core/tool-runner/toolRunner.js";
import { logger } from "./ui/logger.js";

export function toAgentLogger(): AgentLogger {
  return {
    info: (m) => logger.dim(m),
    warn: (m) => logger.warn(m),
    error: (m) => logger.error(m),
  };
}

/** Prints a friendly message for the errors a command is expected to hit, rethrows anything else. */
export function reportExpectedError(err: unknown): void {
  if (err instanceof ConfigError) {
    logger.error([err.message, ...(err.details ?? [])].join("\n"));
  } else if (err instanceof ReportLoadError || err instanceof PluginLoadError) {
    logger.error(err.message);
  } else if (err instanceof Error && err.name === "MissingApiKeyError") {
    logger.error(err.message);
  } else {
    throw err;
  }
  process.exitCode = 1;
}

export async function loadConfigFor(opts: { config?: string; targetPath?: string }): Promise<QAConfig> {
  return loadConfig({ configPath: opts.config, targetPathOverride: opts.targetPath });
}

export function outputDirOf(config: QAConfig): string {
  return path.resolve(process.cwd(), config.output.dir);
}

/** Resolves a report reference ("latest", a run dir, or a report.json) for this config's target. */
export async function resolveReportFor(config: QAConfig, ref: string | undefined): Promise<string> {
  // The writer files reports under the scanned package name, falling back to the folder name.
  const pkg = await readPackageJson(config.target.path);
  return resolveReportPath(ref ?? "latest", {
    outputDir: outputDirOf(config),
    targetName: pkg?.name ?? path.basename(config.target.path),
  });
}

export interface ExecuteRunOptions {
  /** Path to a report.json to compare this run against. Must be resolved before the run starts. */
  baselinePath?: string;
}

export async function executeRun(
  config: QAConfig,
  options: ExecuteRunOptions = {},
): Promise<{ result: QARunResult; written: WriteReportResult }> {
  const provider = AnthropicProvider.fromConfig(config);
  const pluginManager = await PluginManager.fromConfig(config);

  logger.heading(`Scanning ${config.target.path}...`);
  const profile = await scanRepo(config.target.path);
  logger.dim(
    `Detected: ${profile.language}, frameworks: ${profile.frameworks.join(", ") || "(none)"}, test framework: ${profile.testFramework}`,
  );
  if (config.plugins.length > 0) logger.dim(`Plugins: ${pluginManager.pluginNames.join(", ")}`);

  const orchestrator = new LeadAgentOrchestrator(createAgentRegistry(), new ToolRunner(), pluginManager, toAgentLogger());

  logger.heading("Running QA pipeline...");
  const result = await orchestrator.run(config, profile, provider);

  if (options.baselinePath) {
    const baseline = await loadReport(options.baselinePath);
    result.comparison = compareFindings(baseline.findings, result.findings, {
      baselineGeneratedAt: baseline.generatedAt,
      baselinePath: options.baselinePath,
    });
  }

  logger.heading("Writing report...");
  const written = await writeReport(result, outputDirOf(config));
  return { result, written };
}
