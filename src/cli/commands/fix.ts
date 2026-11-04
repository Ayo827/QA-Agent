import { Command } from "commander";
import path from "node:path";
import { makeSandboxedReader } from "../../core/agents/baseAgent.js";
import { loadReport } from "../../core/compare/reportLoader.js";
import { scanRepo } from "../../core/discovery/repoScanner.js";
import { SEVERITY_ORDER, type Severity } from "../../core/evidence/types.js";
import { proposeFixes } from "../../core/fix/fixAgent.js";
import { writeFixes } from "../../core/fix/fixWriter.js";
import { AnthropicProvider } from "../../core/provider/anthropicProvider.js";
import { loadConfigFor, reportExpectedError, resolveReportFor, toAgentLogger } from "../shared.js";
import { logger } from "../ui/logger.js";

export function registerFixCommand(program: Command): void {
  program
    .command("fix")
    .description("Propose patches for findings in a report. Nothing is applied to the target repo.")
    .argument("[ref]", '"latest" (default), a run directory, or a report.json')
    .option("--config <path>", "Path to qa.config.json")
    .option("--min-severity <severity>", `Lowest severity to attempt (${SEVERITY_ORDER.join("|")})`, "medium")
    .option("--max <n>", "Most findings to attempt, most severe first", "10")
    .option("--only <ids>", "Comma-separated finding ids to attempt")
    .action(async (ref: string | undefined, opts) => {
      try {
        if (!SEVERITY_ORDER.includes(opts.minSeverity)) {
          logger.error(`Unknown severity "${opts.minSeverity}". Use one of: ${SEVERITY_ORDER.join(", ")}`);
          process.exitCode = 1;
          return;
        }
        const max = Number.parseInt(opts.max, 10);
        if (!Number.isInteger(max) || max < 1) {
          logger.error(`--max must be a positive whole number, got "${opts.max}".`);
          process.exitCode = 1;
          return;
        }

        const config = await loadConfigFor({ config: opts.config });
        const reportJson = await resolveReportFor(config, ref);
        const report = await loadReport(reportJson);
        const provider = AnthropicProvider.fromConfig(config);
        const profile = await scanRepo(config.target.path);

        logger.heading(`Proposing fixes from ${reportJson}`);
        const result = await proposeFixes({
          findings: report.findings,
          provider,
          rootPath: profile.rootPath,
          readFile: makeSandboxedReader(profile),
          maxTokens: config.ai.maxOutputTokens,
          logger: toAgentLogger(),
          minSeverity: opts.minSeverity as Severity,
          maxFindings: max,
          onlyIds: opts.only ? String(opts.only).split(",").map((s: string) => s.trim()) : undefined,
        });

        const written = await writeFixes(result, path.dirname(reportJson));
        const clean = result.proposals.filter((p) => p.check === "applies").length;
        logger.heading("Summary");
        logger.info(`  ${result.proposals.length} patch(es) proposed (${clean} apply cleanly), ${result.skipped.length} finding(s) without a patch`);
        logger.success(`Review ${written.indexPath}`);
        logger.dim("Nothing was changed in the target repo. After applying a patch, run \"qa rerun\".");
      } catch (err) {
        reportExpectedError(err);
      }
    });
}
