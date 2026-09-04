import { z } from "zod";
import {
  BASE_HOUSE_PROMPT,
  describeError,
  extractJson,
  formatFileExcerpts,
  readFiles,
  summarizeRepoProfile,
} from "./baseAgent.js";
import { composeSystemPrompt } from "../provider/promptCache.js";
import { TEST_GENERATION_AGENT_PROMPT } from "../../prompts/testGenerationAgent.js";
import type { AgentArtifact, AgentContext, AgentResult, QAAgent } from "./types.js";
import type { Finding, Severity } from "../evidence/types.js";

const CANDIDATE_TEST_TARGETS = [
  "utils/bookingStateMachine.js",
  "middleware/validatePhone.js",
  "middleware/validateDob.js",
  "utils/bookingHelper.js",
  "utils/index.js",
];

const EvidenceSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_execution"), commandId: z.string(), exitCode: z.number().nullable(), excerpt: z.string() }),
  z.object({ type: z.literal("static_analysis"), filePath: z.string(), lineRange: z.tuple([z.number(), z.number()]).optional(), excerpt: z.string() }),
  z.object({ type: z.literal("ai_inference"), confidence: z.enum(["low", "medium", "high"]), rationale: z.string() }),
]);

const TestGenOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(["info", "low", "medium", "high", "critical"]),
      title: z.string(),
      description: z.string(),
      evidence: z.array(EvidenceSourceSchema).min(1),
      recommendation: z.string().optional(),
    }),
  ),
  proposedFiles: z.array(
    z.object({
      path: z.string(),
      description: z.string(),
      content: z.string(),
    }),
  ),
});

const TEST_GEN_OUTPUT_CONTRACT_ADDENDUM = `
Additionally, respond with this exact top-level shape (extends the base contract with one more field):
{
  "summary": string,
  "findings": [ ...as described above... ],
  "proposedFiles": [
    { "path": string, "description": string, "content": string }
    // path is a relative path under a "proposals/" directory the pipeline controls, e.g.
    // "package.json.proposed.diff", "jest.config.js", "tests/utils/bookingStateMachine.proposed.test.js"
  ]
}`;

export class TestGenerationAgent implements QAAgent {
  readonly name = "test-generation";
  readonly description = "Proposes test infrastructure and example tests without writing into the target repo.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const files = await readFiles(ctx, CANDIDATE_TEST_TARGETS);

    const system = composeSystemPrompt(BASE_HOUSE_PROMPT, `${TEST_GENERATION_AGENT_PROMPT}\n${TEST_GEN_OUTPUT_CONTRACT_ADDENDUM}`);
    const userPrompt = `## Repository facts
${summarizeRepoProfile(ctx.repoProfile)}

## Candidate low-risk files for test generation (only files that exist are shown)
${formatFileExcerpts(files)}

Produce your findings and proposedFiles now, following the required JSON output contract exactly.`;

    const attempt = async (prompt: string) => {
      const response = await ctx.provider.complete({
        system,
        messages: [{ role: "user", content: prompt }],
        maxTokens: ctx.config.ai.maxOutputTokens,
      });
      return TestGenOutputSchema.parse(extractJson(response.text));
    };

    try {
      let output;
      try {
        output = await attempt(userPrompt);
      } catch (firstErr) {
        ctx.logger.warn(`${this.name}: response did not match schema, retrying once (${describeError(firstErr)})`);
        output = await attempt(
          `${userPrompt}\n\nYour previous response did not match the required JSON schema: ${describeError(firstErr)}. Return ONLY the corrected JSON object.`,
        );
      }

      const findings: Finding[] = output.findings.map((f) => ({
        ...f,
        agent: this.name,
        severity: f.severity as Severity,
      }));
      const artifacts: AgentArtifact[] = output.proposedFiles.map((p) => ({
        path: p.path,
        description: p.description,
        content: p.content,
      }));

      return { agentName: this.name, status: "completed", findings, summary: output.summary, artifacts };
    } catch (err) {
      return { agentName: this.name, status: "failed", findings: [], summary: `Agent failed: ${describeError(err)}` };
    }
  }
}

