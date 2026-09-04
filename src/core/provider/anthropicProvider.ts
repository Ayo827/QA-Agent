import Anthropic from "@anthropic-ai/sdk";
import type { QAConfig } from "../../config/schema.js";
import { MissingApiKeyError, wrapAnthropicError } from "./errors.js";
import type { AICompletionOptions, AICompletionResult, AIProvider } from "./types.js";

/** Calls above this many requested output tokens are streamed instead of a single blocking request. */
const STREAMING_THRESHOLD_TOKENS = 16_000;

export interface AnthropicProviderOptions {
  model: string;
  apiKeyEnv: string;
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    const apiKey = process.env[options.apiKeyEnv];
    if (!apiKey) {
      throw new MissingApiKeyError(options.apiKeyEnv);
    }
    this.model = options.model;
    this.client = new Anthropic({ apiKey });
  }

  static fromConfig(config: QAConfig): AnthropicProvider {
    return new AnthropicProvider({ model: config.ai.model, apiKeyEnv: config.ai.apiKeyEnv });
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    try {
      if (options.maxTokens > STREAMING_THRESHOLD_TOKENS) {
        return await this.completeStreaming(options);
      }
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens,
        system: options.system,
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      return toResult(response);
    } catch (err) {
      throw wrapAnthropicError(err);
    }
  }

  private async completeStreaming(options: AICompletionOptions): Promise<AICompletionResult> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens,
      system: options.system,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const finalMessage = await stream.finalMessage();
    return toResult(finalMessage);
  }

  /**
   * Cheap call used by `qa doctor --live` to confirm the API key/model pair actually works.
   * The installed SDK version has no `models.retrieve`, so this uses a minimal 1-token completion
   * instead — the smallest real request that still exercises auth + model resolution.
   */
  async verifyConnection(): Promise<void> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (err) {
      throw wrapAnthropicError(err);
    }
  }
}

function toResult(message: Anthropic.Message): AICompletionResult {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  return {
    text,
    model: message.model,
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
