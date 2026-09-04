import { Command } from "commander";
import path from "node:path";
import { AGENT_NAMES, type AgentName } from "../../config/schema.js";
import { buildDefaultConfig } from "../../config/defaults.js";
import { writeConfig } from "../../config/writer.js";
import { getDefaultConfigFilePath } from "../../config/loader.js";
import { logger } from "../ui/logger.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create qa.config.json pointing this qa-agent checkout at a target repo")
    .argument("[targetPath]", "Path to the backend repo to analyze")
    .option("--target <path>", "Path to the backend repo to analyze (overrides positional arg)")
    .option("--name <name>", "Display name for the target repo")
    .option("--model <model>", "Anthropic model to use", "claude-opus-4-8")
    .option(
      "--agents <agents>",
      `Comma-separated agent list (${AGENT_NAMES.join(", ")})`,
    )
    .option("--output <dir>", "Report output directory", "./reports")
    .action(async (positionalTarget: string | undefined, opts) => {
      const targetPath = opts.target ?? positionalTarget;
      if (!targetPath) {
        logger.error("A target repo path is required: qa init <targetPath> or --target <path>");
        process.exitCode = 1;
        return;
      }

      const agents = opts.agents
        ? (opts.agents.split(",").map((a: string) => a.trim()) as AgentName[])
        : undefined;
      if (agents) {
        const invalid = agents.filter((a) => !AGENT_NAMES.includes(a));
        if (invalid.length > 0) {
          logger.error(`Unknown agent name(s): ${invalid.join(", ")}. Valid agents: ${AGENT_NAMES.join(", ")}`);
          process.exitCode = 1;
          return;
        }
      }

      const config = buildDefaultConfig({
        targetPath,
        name: opts.name,
        model: opts.model,
        agents,
        outputDir: opts.output,
      });

      const configFilePath = await writeConfig(config);
      logger.success(`Wrote ${path.relative(process.cwd(), configFilePath) || getDefaultConfigFilePath()}`);
      logger.dim(`Target: ${config.target.path}`);
      logger.dim(`Model: ${config.ai.model}`);
      logger.dim(`Agents: ${config.run.agents.join(", ")}`);
      logger.info("\nNext: copy .env.example to .env and set ANTHROPIC_API_KEY, then run \"qa doctor\".");
    });
}
