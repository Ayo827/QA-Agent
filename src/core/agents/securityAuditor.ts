import {
  formatFileExcerpts,
  readFiles,
  runSingleShotAgent,
  summarizePriorFindings,
  summarizeRepoProfile,
} from "./baseAgent.js";
import { runSecretScan } from "./secretScanner.js";
import { SECURITY_AUDITOR_PROMPT } from "../../prompts/securityAuditor.js";
import type { AgentContext, AgentResult, QAAgent } from "./types.js";

const CANDIDATE_FILES = ["index.js", "index.ts", "src/index.js", "package.json", "middleware/checkRole.js", "middleware/adminGuard.js"];

export class SecurityAuditorAgent implements QAAgent {
  readonly name = "security-auditor";
  readonly description = "Deterministic secret scanning plus AI review of security-relevant code patterns.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const secretHitPaths = ctx.repoProfile.secretFilesDetected.map((h) => h.relativePath);
    const scanFindings = await runSecretScan(ctx.repoProfile.rootPath, secretHitPaths);

    const files = await readFiles(ctx, CANDIDATE_FILES);

    const userPrompt = `## Repository facts (secretFilesDetected below is filename/git-tracked status ONLY — contents were never read)
${summarizeRepoProfile(ctx.repoProfile)}

## Deterministic secret-pattern scan results (already tool_execution-verified — restate/contextualize, do not re-derive)
${JSON.stringify(scanFindings.map((f) => ({ id: f.id, title: f.title, severity: f.severity })), null, 2)}

## Prior findings from earlier agents this run
${summarizePriorFindings(ctx.priorFindings)}

## File excerpts (only files that exist are shown)
${formatFileExcerpts(files)}

Produce your findings now, following the required JSON output contract exactly. Do not duplicate the secret-pattern scan findings listed above verbatim — add context/severity judgment, or cover different ground (e.g. secretFilesDetected entries, CORS/headers/rate-limiting patterns visible in the file excerpts).`;

    const llmResult = await runSingleShotAgent(ctx, {
      agentName: this.name,
      agentPrompt: SECURITY_AUDITOR_PROMPT,
      userPrompt,
    });

    return {
      agentName: this.name,
      status: llmResult.status,
      findings: [...scanFindings, ...llmResult.findings],
      summary:
        llmResult.status === "completed"
          ? llmResult.summary
          : `${llmResult.summary} (deterministic secret scan still ran and found ${scanFindings.length} pattern match(es))`,
    };
  }
}
