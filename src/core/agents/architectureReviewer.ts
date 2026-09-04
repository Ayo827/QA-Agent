import {
  formatFileExcerpts,
  readFiles,
  runSingleShotAgent,
  summarizePriorFindings,
  summarizeRepoProfile,
} from "./baseAgent.js";
import { ARCHITECTURE_REVIEWER_PROMPT } from "../../prompts/architectureReviewer.js";
import type { AgentContext, AgentResult, QAAgent } from "./types.js";

const CANDIDATE_FILES = [
  "index.js",
  "index.ts",
  "src/index.js",
  "src/index.ts",
  "config.js",
  "firebase.json",
  "package.json",
  "controller/shared/index.js",
  "controller/index.js",
  "src/routes/index.js",
  "src/app.js",
];

export class ArchitectureReviewerAgent implements QAAgent {
  readonly name = "architecture-reviewer";
  readonly description = "Reviews entry points, routing/module boundaries, and deployment unit shape.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const files = await readFiles(ctx, CANDIDATE_FILES);

    const userPrompt = `## Repository facts
${summarizeRepoProfile(ctx.repoProfile)}

## Prior findings from earlier agents this run
${summarizePriorFindings(ctx.priorFindings)}

## File excerpts (only files that exist are shown)
${formatFileExcerpts(files)}

Produce your findings now, following the required JSON output contract exactly.`;

    return runSingleShotAgent(ctx, {
      agentName: this.name,
      agentPrompt: ARCHITECTURE_REVIEWER_PROMPT,
      userPrompt,
    });
  }
}
