import { Command } from "commander";
import { compareFindings, hasRegression } from "../../core/compare/compare.js";
import { loadReport } from "../../core/compare/reportLoader.js";
import { loadConfigFor, reportExpectedError, resolveReportFor } from "../shared.js";
import { logger } from "../ui/logger.js";

export function registerCompareCommand(program: Command): void {
  program
    .command("compare")
    .description("Compare two existing reports without running anything")
    .argument("<baseline>", 'Older report: "latest", a run directory, or a report.json')
    .argument("[current]", "Newer report (defaults to latest)", "latest")
    .option("--config <path>", "Path to qa.config.json")
    .option("--fail-on-regression", "Exit non-zero if the newer report adds a medium+ finding or makes one worse", false)
    .action(async (baselineRef: string, currentRef: string, opts) => {
      try {
        const config = await loadConfigFor({ config: opts.config });
        const baselinePath = await resolveReportFor(config, baselineRef);
        const currentPath = await resolveReportFor(config, currentRef);
        const baseline = await loadReport(baselinePath);
        const current = await loadReport(currentPath);
        const c = compareFindings(baseline.findings, current.findings, {
          baselineGeneratedAt: baseline.generatedAt,
          baselinePath,
        });

        logger.heading(`${baseline.generatedAt}  →  ${current.generatedAt}`);
        logger.info(`  resolved: ${c.resolved.length}   new: ${c.introduced.length}   changed severity: ${c.changedSeverity.length}   unchanged: ${c.persisting.length}`);
        for (const f of c.introduced) logger.warn(`new      [${f.severity}] ${f.agent} — ${f.title}`);
        for (const x of c.changedSeverity) logger.warn(`changed  ${x.finding.agent} — ${x.finding.title}: ${x.from} → ${x.to}`);
        for (const f of c.resolved) logger.success(`resolved [${f.severity}] ${f.agent} — ${f.title}`);

        if (opts.failOnRegression && hasRegression(c)) {
          logger.error("Regression against the baseline.");
          process.exitCode = 1;
        }
      } catch (err) {
        reportExpectedError(err);
      }
    });
}
