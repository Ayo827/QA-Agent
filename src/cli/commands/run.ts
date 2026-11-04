import { Command } from "commander";
import { hasRegression } from "../../core/compare/compare.js";
import { shouldFailRun, type QARunResult } from "../../core/orchestrator/runContext.js";
import { isVerified, SEVERITY_ORDER, type Finding, type Severity } from "../../core/evidence/types.js";
import { executeRun, loadConfigFor, reportExpectedError, resolveReportFor } from "../shared.js";
import { logger } from "../ui/logger.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run the full QA lifecycle against the configured (or given) target repo")
    .argument("[targetPath]", "Override target repo path for this run only")
    .option("--config <path>", "Path to qa.config.json")
    .option("--baseline <ref>", 'Compare against an earlier report: "latest", a run directory, or a report.json')
    .option("--fail-on-regression", "Exit non-zero if the run adds a medium+ finding or makes one worse (needs --baseline)", false)
    .action(async (targetPath: string | undefined, opts) => {
      try {
        const config = await loadConfigFor({ config: opts.config, targetPath });
        // Resolve the baseline first: once this run writes its report, "latest" would mean itself.
        const baselinePath = opts.baseline ? await resolveReportFor(config, opts.baseline) : undefined;
        const { result, written } = await executeRun(config, { baselinePath });
        finish(result, written.reportMdPath, Boolean(opts.failOnRegression));
      } catch (err) {
        reportExpectedError(err);
      }
    });
}

/** Shared by `run` and `rerun`: print the summary and set the exit code. */
export function finish(result: QARunResult, reportPath: string, failOnRegression: boolean): void {
  printSummary(result.findings, reportPath);
  if (result.comparison) {
    const c = result.comparison;
    logger.info(
      `  Since baseline: ${c.resolved.length} resolved, ${c.introduced.length} new, ${c.changedSeverity.length} changed severity, ${c.persisting.length} unchanged`,
    );
  }
  if (shouldFailRun(result)) process.exitCode = 1;
  if (failOnRegression) {
    if (!result.comparison) {
      logger.warn("--fail-on-regression needs --baseline; no comparison was made.");
    } else if (hasRegression(result.comparison)) {
      logger.error("Regression against the baseline.");
      process.exitCode = 1;
    }
  }
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
