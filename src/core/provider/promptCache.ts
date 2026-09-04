/**
 * Composes an agent's full system prompt from the shared house-rules prefix plus its own
 * specific instructions.
 *
 * NOTE: true prompt caching (`cache_control: { type: "ephemeral" }` on a system content block)
 * requires the SDK's beta prompt-caching client (`client.beta.promptCaching.messages`), which the
 * currently pinned @anthropic-ai/sdk version exposes separately from the stable `messages` API
 * used by AnthropicProvider. Wiring that in is a small, isolated follow-up (swap the client used
 * in AnthropicProvider.complete) rather than a design change — house rules are already factored
 * out as a stable, reusable prefix here so that follow-up is just plumbing.
 */
export function composeSystemPrompt(housePrompt: string, agentPrompt: string): string {
  return `${housePrompt.trim()}\n\n---\n\n${agentPrompt.trim()}`;
}
