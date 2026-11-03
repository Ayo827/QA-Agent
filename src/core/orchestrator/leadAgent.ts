import type { AgentName, QAConfig } from "../../config/schema.js";
import { makeSandboxedReader, noopLogger } from "../agents/baseAgent.js";
import { CANONICAL_AGENT_ORDER, resolveEnabledAgents } from "../agents/registry.js";
import type { AgentContext, AgentResult, Logger, QAAgent } from "../agents/types.js";
import type { RepoProfile } from "../discovery/repoScanner.js";
import type { Finding } from "../evidence/types.js";
import { PluginManager } from "../plugins/pluginManager.js";
import { skippedEntryToCommandResult } from "../tool-runner/commandRegistry.js";
import { ToolRunner } from "../tool-runner/toolRunner.js";
import type { CommandResult } from "../tool-runner/types.js";
import type { AIProvider } from "../provider/types.js";
import type { QARunResult } from "./runContext.js";

export class LeadAgentOrchestrator {
  constructor(
    private readonly agentRegistry: Map<AgentName, QAAgent>,
    private readonly toolRunner: ToolRunner = new ToolRunner(),
    private readonly pluginManager: PluginManager = new PluginManager(),
    private readonly logger: Logger = noopLogger(),
  ) {}

  async run(config: QAConfig, profile: RepoProfile, provider: AIProvider): Promise<QARunResult> {
    await this.pluginManager.notifyRepoDiscovered(profile);

    // 1. Baseline tool execution — ground truth, always runs first, independent of which agents
    //    are enabled.
    const entries = this.pluginManager.collectCommandEntries(profile, config);
    const toolResults: CommandResult[] = [];
    for (const entry of entries) {
      if (entry.spec) {
        this.logger.info(`Running ${entry.spec.label}...`);
        toolResults.push(await this.toolRunner.run(entry.spec));
      } else if (entry.skipped) {
        toolResults.push(skippedEntryToCommandResult(entry.skipped));
      }
    }

    // 2. Sequential agent execution in fixed canonical order — each agent sees prior findings.
    const findings: Finding[] = [];
    const agentResults: AgentResult[] = [];
    const builtIn = resolveEnabledAgents(config.run.agents, this.agentRegistry);
    const builtInNames = new Set<string>(this.agentRegistry.keys());
    // Plugin agents run after the built-ins (so they see every built-in finding). A plugin agent
    // may not reuse a built-in name: findings are matched across runs by agent name + id.
    const pluginAgents = this.pluginManager.collectAgents().filter((agent) => {
      if (!builtInNames.has(agent.name)) return true;
      this.logger.warn(`Ignoring plugin agent "${agent.name}": the name belongs to a built-in agent`);
      return false;
    });
    const readFile = makeSandboxedReader(profile);

    for (const agent of [...builtIn, ...pluginAgents]) {
      this.logger.info(`Running agent: ${agent.name}...`);
      const ctx: AgentContext = {
        repoProfile: profile,
        toolResults,
        priorFindings: findings,
        provider,
        config,
        readFile,
        logger: this.logger,
      };

      let result: AgentResult;
      try {
        result = await agent.run(ctx);
      } catch (err) {
        result = {
          agentName: agent.name,
          status: "failed",
          findings: [],
          summary: `Agent threw an unhandled error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      agentResults.push(result);
      findings.push(...result.findings);
    }

    return {
      profile,
      toolResults,
      agentResults,
      findings,
      generatedAt: new Date().toISOString(),
      config,
    };
  }
}

export { CANONICAL_AGENT_ORDER };
