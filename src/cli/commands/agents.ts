import { Command } from "commander";
import { createAgentRegistry, CANONICAL_AGENT_ORDER } from "../../core/agents/registry.js";
import { PluginManager } from "../../core/plugins/pluginManager.js";
import { loadConfigFor, reportExpectedError } from "../shared.js";
import { logger } from "../ui/logger.js";

export function registerAgentsCommand(program: Command): void {
  program
    .command("agents")
    .description("List the built-in agents and any agents contributed by plugins")
    .option("--config <path>", "Path to qa.config.json")
    .action(async (opts) => {
      try {
        const registry = createAgentRegistry();
        let enabled: Set<string> | undefined;
        let pluginAgents: { name: string; description: string }[] = [];
        let pluginNames: string[] = [];

        try {
          const config = await loadConfigFor({ config: opts.config });
          enabled = new Set(config.run.agents);
          const manager = await PluginManager.fromConfig(config);
          pluginAgents = manager.collectAgents();
          pluginNames = manager.pluginNames.filter((n) => n !== "builtin-lint-test");
        } catch (err) {
          // Listing built-ins must work before `qa init`; a broken plugin is still worth surfacing.
          if (err instanceof Error && err.name === "PluginLoadError") throw err;
          logger.dim("(no valid qa.config.json, so enabled/disabled status is not shown)");
        }

        logger.heading("Built-in agents (run in this order)");
        for (const name of CANONICAL_AGENT_ORDER) {
          const agent = registry.get(name);
          const status = enabled ? (enabled.has(name) ? "on " : "off") : "   ";
          logger.info(`  ${status} ${name} — ${agent?.description ?? ""}`);
        }

        if (pluginAgents.length > 0) {
          logger.heading(`Plugin agents (from ${pluginNames.join(", ")}; run after the built-ins)`);
          for (const agent of pluginAgents) logger.info(`  on  ${agent.name} — ${agent.description}`);
        }
      } catch (err) {
        reportExpectedError(err);
      }
    });
}
