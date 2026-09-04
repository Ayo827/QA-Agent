import { z } from "zod";

export const AGENT_NAMES = [
  "architecture-reviewer",
  "backend-reviewer",
  "security-auditor",
  "test-generation",
] as const;

export const AgentNameSchema = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const EffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

export const QAConfigSchema = z.object({
  version: z.literal(1),
  target: z.object({
    path: z.string().min(1, "target.path is required"),
    name: z.string().optional(),
  }),
  ai: z
    .object({
      provider: z.literal("anthropic").default("anthropic"),
      model: z.string().default("claude-opus-4-8"),
      apiKeyEnv: z.string().default("ANTHROPIC_API_KEY"),
      effort: EffortSchema.default("high"),
      maxOutputTokens: z.number().int().positive().max(64000).default(8000),
    })
    .default({}),
  run: z
    .object({
      agents: z.array(AgentNameSchema).default([...AGENT_NAMES]),
      failOn: z.enum(["critical", "high", "medium", "never"]).default("critical"),
    })
    .default({}),
  tools: z
    .object({
      packageManager: z.enum(["npm", "yarn", "pnpm"]).default("npm"),
      timeoutMs: z.number().int().positive().default(120_000),
      allowTestExecution: z.boolean().default(false),
    })
    .default({}),
  output: z
    .object({
      dir: z.string().default("./reports"),
      formats: z.array(z.enum(["markdown", "html", "json"])).default(["markdown", "json"]),
    })
    .default({}),
});

export type QAConfig = z.infer<typeof QAConfigSchema>;
