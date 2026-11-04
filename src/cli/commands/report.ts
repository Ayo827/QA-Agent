import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { loadReport } from "../../core/compare/reportLoader.js";
import { generateHtmlReport } from "../../core/reports/htmlGenerator.js";
import { generateMarkdownReport } from "../../core/reports/markdownGenerator.js";
import { loadConfigFor, reportExpectedError, resolveReportFor } from "../shared.js";
import { logger } from "../ui/logger.js";

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Re-render an existing report from its report.json (no tools or AI calls)")
    .argument("[ref]", '"latest" (default), a run directory, or a report.json')
    .option("--config <path>", "Path to qa.config.json")
    .option("--format <format>", "markdown or html", "html")
    .option("--stdout", "Print markdown to the terminal instead of writing a file", false)
    .action(async (ref: string | undefined, opts) => {
      try {
        if (opts.format !== "markdown" && opts.format !== "html") {
          logger.error(`Unknown format "${opts.format}". Use markdown or html.`);
          process.exitCode = 1;
          return;
        }
        const config = await loadConfigFor({ config: opts.config });
        const reportJson = await resolveReportFor(config, ref);
        const result = await loadReport(reportJson);

        if (opts.stdout) {
          console.log(generateMarkdownReport(result));
          return;
        }
        const isHtml = opts.format === "html";
        const outPath = path.join(path.dirname(reportJson), isHtml ? "report.html" : "report.md");
        await fs.writeFile(outPath, isHtml ? generateHtmlReport(result) : generateMarkdownReport(result), "utf-8");
        logger.success(`Wrote ${outPath}`);
      } catch (err) {
        reportExpectedError(err);
      }
    });
}
