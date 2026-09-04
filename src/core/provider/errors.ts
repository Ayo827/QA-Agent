import Anthropic from "@anthropic-ai/sdk";

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export class MissingApiKeyError extends AIProviderError {
  constructor(readonly apiKeyEnv: string) {
    super(
      `Missing API key: environment variable "${apiKeyEnv}" is not set. ` +
        `Copy .env.example to .env and fill in ${apiKeyEnv}, or export it in your shell.`,
    );
    this.name = "MissingApiKeyError";
  }
}

export class AuthenticationFailedError extends AIProviderError {
  constructor(cause?: unknown) {
    super("Anthropic API rejected the configured API key (authentication failed).", cause);
    this.name = "AuthenticationFailedError";
  }
}

export class RateLimitedError extends AIProviderError {
  constructor(cause?: unknown) {
    super("Anthropic API rate limit exceeded.", cause);
    this.name = "RateLimitedError";
  }
}

/** Wraps the SDK's typed exception hierarchy into our own error types, most-specific first. */
export function wrapAnthropicError(err: unknown): AIProviderError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new AuthenticationFailedError(err);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new RateLimitedError(err);
  }
  if (err instanceof Anthropic.APIError) {
    return new AIProviderError(`Anthropic API error: ${err.message}`, err);
  }
  if (err instanceof Error) {
    return new AIProviderError(`Anthropic request failed: ${err.message}`, err);
  }
  return new AIProviderError("Anthropic request failed with an unknown error.", err);
}
