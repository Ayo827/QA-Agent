import { Command } from "commander";
import path from "node:path";
import { ConfigError, loadConfig } from "../../config/loader.js";
import { AnthropicProvider } from "../../core/provider/anthropicProvider.js";
import { scanRepo } from "../../core/discovery/repoScanner.js";
import { createAgentRegistry } from "../../core/agents/registry.js";
import { LeadAgentOrchestrator } from "../../core/orchestrator/leadAgent.js";
import { shouldFailRun } from "../../core/orchestrator/runContext.js";
import { ToolRunner } from "../../core/tool-runner/toolRunner.js";
import { PluginManager } from "../../core/plugins/pluginManager.js";
import { writeReport } from "../../core/reports/writer.js";
import { isVerified, SEVERITY_ORDER, type Finding, type Severity } from "../../core/evidence/types.js";
import { logger } from "../ui/logger.js";
import type { Logger as AgentLogger } from "../../core/agents/types.js";

function toAgentLogger(): AgentLogger {
  return {
    info: (m) => logger.dim(m),
    warn: (m) => logger.warn(m),
    error: (m) => logger.error(m),
  };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run the full QA lifecycle against the configured (or given) target repo")
    .argument("[targetPath]", "Override target repo path for this run only")
    .option("--config <path>", "Path to qa.config.json")
    .action(async (targetPath: string | undefined, opts) => {
      let config;
      try {
        config = await loadConfig({ configPath: opts.config, targetPathOverride: targetPath });
      } catch (err) {
        logger.error(err instanceof ConfigError ? [err.message, ...(err.details ?? [])].join("\n") : String(err));
        process.exitCode = 1;
        return;
      }

      let provider: AnthropicProvider;
      try {
        provider = AnthropicProvider.fromConfig(config);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }

      logger.heading(`Scanning ${config.target.path}...`);
      const profile = await scanRepo(config.target.path);
      logger.dim(`Detected: ${profile.language}, frameworks: ${profile.frameworks.join(", ") || "(none)"}, test framework: ${profile.testFramework}`);

      const orchestrator = new LeadAgentOrchestrator(
        createAgentRegistry(),
        new ToolRunner(),
        new PluginManager(),
        toAgentLogger(),
      );

      logger.heading("Running QA pipeline...");
      const result = await orchestrator.run(config, profile, provider);

      logger.heading("Writing report...");
      const written = await writeReport(result, path.resolve(process.cwd(), config.output.dir));

      printSummary(result.findings, written.reportMdPath);

      if (shouldFailRun(result)) {
        process.exitCode = 1;
      }
    });
}

function printSummary(findings: Finding[], reportPath: string): void {
  logger.heading("Summary");
  const bySeverity = new Map<Severity, number>();
  for (const f of findings) bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);
  for (const severity of SEVERITY_ORDER) {
    const count = bySeverity.get(severity) ?? 0;
    if (count > 0) logger.info(`  ${severity}: ${count}`);
  }
  const verifiedCount = findings.filter(isVerified).length;
  logger.info(`  Total findings: ${findings.length} (${verifiedCount} verified, ${findings.length - verifiedCount} AI inference)`);
  logger.success(`Report written to ${reportPath}`);
}
