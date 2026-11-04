import { Command } from "commander";
import { executeRun, loadConfigFor, reportExpectedError, resolveReportFor } from "../shared.js";
import { finish } from "./run.js";

export function registerRerunCommand(program: Command): void {
  program
    .command("rerun")
    .description("Run again and compare with the previous report: what is resolved, new, or unchanged")
    .argument("[baseline]", 'Report to compare against: "latest" (default), a run directory, or a report.json')
    .option("--config <path>", "Path to qa.config.json")
    .option("--fail-on-regression", "Exit non-zero if the run adds a medium+ finding or makes one worse", false)
    .action(async (baseline: string | undefined, opts) => {
      try {
        const config = await loadConfigFor({ config: opts.config });
        const baselinePath = await resolveReportFor(config, baseline);
        const { result, written } = await executeRun(config, { baselinePath });
        finish(result, written.reportMdPath, Boolean(opts.failOnRegression));
      } catch (err) {
        reportExpectedError(err);
      }
    });
}
