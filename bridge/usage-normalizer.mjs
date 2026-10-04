const number = (value) => (Number.isFinite(value) && value >= 0 ? value : null);
export function normalizeUsage(adapter, usage) {
  if (!usage)
    return { inputTokens: null, outputTokens: null, totalTokens: null, usageQuality: "unknown" };
  let input = number(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount);
  const output = number(
    usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount,
  );
  const cached = number(
    usage.cache_read_input_tokens ??
      usage.prompt_tokens_details?.cached_tokens ??
      usage.input_tokens_details?.cached_tokens ??
      usage.cachedContentTokenCount,
  );
  const reasoning = number(
    usage.output_tokens_details?.reasoning_tokens ??
      usage.completion_tokens_details?.reasoning_tokens ??
      usage.thoughtsTokenCount,
  );
  if (adapter === "anthropic-messages" && input !== null)
    input += (number(usage.cache_creation_input_tokens) || 0) + (cached || 0);
  const explicit =
    adapter === "anthropic-messages" ? null : number(usage.total_tokens ?? usage.totalTokenCount);
  const total =
    explicit ??
    (input !== null && output !== null
      ? input + output + (adapter === "gemini-generate-content" ? reasoning || 0 : 0)
      : null);
  return {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    reasoningTokens: reasoning,
    totalTokens: total,
    usageQuality: total !== null ? "reported" : "partial",
  };
}
