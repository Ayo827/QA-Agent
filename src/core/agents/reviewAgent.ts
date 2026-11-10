import {
  formatFileExcerpts,
  runSingleShotAgent,
  summarizePriorFindings,
  summarizeRepoProfile,
  summarizeToolResults,
} from "./baseAgent.js";
import { selectFiles } from "./fileSelector.js";
import type { Finding } from "../evidence/types.js";
import type { AgentContext, AgentResult, QAAgent } from "./types.js";

export interface ReviewAgentSpec {
  name: string;
  description: string;
  prompt: string;
  /** Globs (relative to the target root), most important first. */
  patterns: string[];
  fileLimit?: number;
  includeToolResults?: boolean;
  /**
   * Deterministic checks that run before the model call. Their findings are kept verbatim and
   * shown to the model as already-established, so it adds judgment rather than repeating them.
   */
  deterministic?(ctx: AgentContext): Promise<Finding[]>;
}

/** A single-shot reviewer: gather files by glob, ask the model, merge any deterministic findings. */
export class ReviewAgent implements QAAgent {
  readonly name: string;
  readonly description: string;

  constructor(private readonly spec: ReviewAgentSpec) {
    this.name = spec.name;
    this.description = spec.description;
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const deterministic = (await this.spec.deterministic?.(ctx)) ?? [];
    const files = await selectFiles(ctx, this.spec.patterns, { limit: this.spec.fileLimit });

    const sections = [
      `## Repository facts\n${summarizeRepoProfile(ctx.repoProfile)}`,
      this.spec.includeToolResults
        ? `## Real tool execution results (ground truth)\n${summarizeToolResults(ctx.toolResults)}`
        : undefined,
      deterministic.length > 0
        ? `## Deterministic checks already run (verified; add context, do not repeat verbatim)\n${JSON.stringify(
            deterministic.map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
            null,
            2,
          )}`
        : undefined,
      `## Prior findings from earlier agents this run\n${summarizePriorFindings(ctx.priorFindings)}`,
      `## File excerpts (${files.length} file(s) sampled; this is NOT the whole codebase)\n${formatFileExcerpts(files)}`,
      "Produce your findings now, following the required JSON output contract exactly.",
    ].filter((s): s is string => s !== undefined);

    const llm = await runSingleShotAgent(ctx, {
      agentName: this.name,
      agentPrompt: this.spec.prompt,
      userPrompt: sections.join("\n\n"),
    });

    return {
      ...llm,
      findings: [...deterministic, ...llm.findings],
      summary:
        llm.status === "completed" || deterministic.length === 0
          ? llm.summary
          : `${llm.summary} (${deterministic.length} deterministic finding(s) still reported)`,
    };
  }
}
