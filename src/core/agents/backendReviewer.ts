import {
  formatFileExcerpts,
  readFiles,
  runSingleShotAgent,
  summarizePriorFindings,
  summarizeRepoProfile,
  summarizeToolResults,
} from "./baseAgent.js";
import { BACKEND_REVIEWER_PROMPT } from "../../prompts/backendReviewer.js";
import type { AgentContext, AgentResult, QAAgent } from "./types.js";

const CANDIDATE_FILES = [
  "index.js",
  "index.ts",
  "src/index.js",
  ".eslintrc.js",
  ".eslintrc.json",
  "eslint.config.js",
  "middleware/checkRole.js",
  "middleware/adminGuard.js",
  "middleware/errorHandler.js",
  "controller/shared/index.js",
  "src/middleware/index.js",
];

export class BackendReviewerAgent implements QAAgent {
  readonly name = "backend-reviewer";
  readonly description = "Reviews request handling, middleware, and how well the repo's own tooling gates changes.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const files = await readFiles(ctx, CANDIDATE_FILES);

    const userPrompt = `## Repository facts
${summarizeRepoProfile(ctx.repoProfile)}

## Real tool execution results (ground truth — restate these, don't estimate)
${summarizeToolResults(ctx.toolResults)}

## Prior findings from earlier agents this run
${summarizePriorFindings(ctx.priorFindings)}

## File excerpts (only files that exist are shown)
${formatFileExcerpts(files)}

Produce your findings now, following the required JSON output contract exactly.`;

    return runSingleShotAgent(ctx, {
      agentName: this.name,
      agentPrompt: BACKEND_REVIEWER_PROMPT,
      userPrompt,
    });
  }
}
