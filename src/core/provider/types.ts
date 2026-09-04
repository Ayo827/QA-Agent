export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  /** Concatenated as the system prompt. Callers pass [houseRules, agentSpecific] pre-joined. */
  system: string;
  messages: AIMessage[];
  maxTokens: number;
}

export interface AICompletionUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AICompletionResult {
  text: string;
  model: string;
  stopReason: string | null;
  usage: AICompletionUsage;
}

/**
 * Provider-agnostic seam. Agents depend on this interface, never on `@anthropic-ai/sdk` directly,
 * so a second provider can be added later without touching agent code.
 */
export interface AIProvider {
  readonly name: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
}
