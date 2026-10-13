// One adapter per AI provider protocol: building the request, reading the
// response or its stream, and reporting failures without leaking credentials.
import { createHash } from "node:crypto";
import { AI_PROVIDER_DEFINITIONS, AI_PROVIDERS } from "../shared/constants.mjs";
import { httpError } from "./http.mjs";
import { t } from "./i18n.mjs";

export const providerDefinitions = Object.fromEntries(
  AI_PROVIDER_DEFINITIONS.map((provider) => [
    provider.id,
    {
      label: provider.name,
      key: provider.key,
      base: provider.base,
      model: provider.model,
      defaultBase: provider.defaultBase,
      defaultModel: provider.defaultModel,
      adapter: provider.adapter,
    },
  ]),
);

export function modelConfig(config, requestedProvider) {
  if (!AI_PROVIDERS.includes(requestedProvider)) {
    throw httpError(422, "Select a supported AI provider.", "provider_invalid");
  }
  const provider = requestedProvider;
  const definition = providerDefinitions[provider];
  return {
    provider,
    label: definition.label,
    apiKeyName: definition.key,
    apiKey: config[definition.key],
    baseUrl: (config[definition.base] || definition.defaultBase).replace(/\/$/, ""),
    model: config[definition.model] || definition.defaultModel,
    adapter: definition.adapter,
  };
}

// A key is only sent to its provider to be checked when the researcher asks for
// a check. Between those, the last answer stands for as long as the key does;
// before the first one, a saved key is reported as configured.
const providerChecks = new Map();

const keyFingerprint = (apiKey) => createHash("sha256").update(apiKey).digest("hex");

export async function providerConfigured(config, provider, fresh) {
  const { apiKey } = modelConfig(config, provider);
  if (!apiKey) return false;
  const fingerprint = keyFingerprint(apiKey);
  if (fresh) {
    const accepted = await probeModel(config, provider);
    if (accepted !== null) providerChecks.set(provider, { fingerprint, reachable: accepted });
  }
  const known = providerChecks.get(provider);
  return known?.fingerprint === fingerprint ? known.reachable : true;
}

// true when the provider accepted the key, false when it refused it, and null
// when there is no verdict: offline, timed out, or answering with something else.
// Remembering "no verdict" as a refusal would show a good key as missing until
// someone thought to test again.
async function probeModel(config, provider) {
  const target = modelConfig(config, provider);
  if (!target.apiKey) return false;
  const url =
    target.adapter === "anthropic-messages"
      ? `${target.baseUrl}/v1/models`
      : `${target.baseUrl}/models`;
  const headers =
    target.adapter === "anthropic-messages"
      ? { "x-api-key": target.apiKey, "anthropic-version": "2023-06-01" }
      : target.adapter === "gemini-generate-content"
        ? { "x-goog-api-key": target.apiKey }
        : { Authorization: `Bearer ${target.apiKey}` };
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    return response.ok ? true : [401, 403].includes(response.status) ? false : null;
  } catch {
    return null;
  }
}

// history is [{ role: "user" | "assistant", content }] from earlier turns of the
// same conversation; omitting it keeps the single-shot request byte-identical.
export function modelRequest(target, system, prompt, maxOutputTokens, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];
  const stream = Boolean(options.stream);
  if (target.adapter === "anthropic-messages")
    return {
      url: `${target.baseUrl}/v1/messages`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": target.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: target.model,
          max_tokens: maxOutputTokens,
          system,
          messages: [...history, { role: "user", content: prompt }],
          ...(stream ? { stream: true } : {}),
        }),
      },
    };
  if (target.adapter === "gemini-generate-content")
    return {
      url: `${target.baseUrl}/models/${encodeURIComponent(target.model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": target.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            ...history.map((message) => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content }],
            })),
            { role: "user", parts: [{ text: prompt }] },
          ],
          generationConfig: { maxOutputTokens },
        }),
      },
    };
  if (target.adapter === "responses")
    return {
      url: `${target.baseUrl}/responses`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: target.model,
          instructions: system,
          input: history.length ? [...history, { role: "user", content: prompt }] : prompt,
          max_output_tokens: maxOutputTokens,
          ...(stream ? { stream: true } : {}),
        }),
      },
    };
  return {
    url: `${target.baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: target.model,
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: prompt },
        ],
        temperature: target.provider === "kimi" ? 1 : 0.2,
        max_tokens: maxOutputTokens,
        // DeepSeek V4 enables thinking by default. These workflows need a concise
        // final answer inside a bounded output budget, so do not let hidden
        // reasoning consume the entire allowance before content is produced.
        ...(target.provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      }),
    },
  };
}

// Each provider streams a different envelope; this reduces one decoded SSE frame
// to the two things the workbench shows: answer text and, when the model exposes
// it, its reasoning.
export function streamDelta(target, data) {
  if (target.adapter === "anthropic-messages") {
    if (data?.type === "message_start" && data.message?.usage) return { usage: data.message.usage };
    if (data?.type === "content_block_delta")
      return data.delta?.type === "thinking_delta"
        ? { reasoning: data.delta.thinking || "" }
        : { text: data.delta?.text || "" };
    if (data?.type === "message_delta" && data.usage)
      return {
        usage: {
          ...data.usage,
          total_tokens:
            Number(data.usage.input_tokens || 0) + Number(data.usage.output_tokens || 0),
        },
      };
    return {};
  }
  if (target.adapter === "gemini-generate-content") {
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("");
    return {
      ...(text ? { text } : {}),
      ...(data?.usageMetadata
        ? {
            usage: {
              ...data.usageMetadata,
              total_tokens: data.usageMetadata.totalTokenCount ?? null,
            },
          }
        : {}),
    };
  }
  if (target.adapter === "responses") {
    if (data?.type === "response.output_text.delta") return { text: data.delta || "" };
    if (data?.type === "response.reasoning_summary_text.delta")
      return { reasoning: data.delta || "" };
    if (data?.type === "response.completed" && data.response?.usage)
      return { usage: data.response.usage };
    return {};
  }
  const choice = data?.choices?.[0]?.delta || {};
  return {
    ...(choice.content ? { text: choice.content } : {}),
    ...(choice.reasoning_content ? { reasoning: choice.reasoning_content } : {}),
    ...(data?.choices?.[0]?.finish_reason ? { finishReason: data.choices[0].finish_reason } : {}),
    ...(data?.usage ? { usage: data.usage } : {}),
  };
}

// Yields decoded `data:` payloads from a fetch body, tolerating frames split
// across chunks and the [DONE] sentinel the OpenAI-compatible APIs append.
export async function* sseFrames(body, signal) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    if (signal?.aborted) throw signal.reason;
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      const payload = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload);
      } catch {
        /* a provider heartbeat or a comment frame */
      }
    }
  }
}

export function modelResponse(target, body) {
  let output = "";
  let usage = body?.usage || null;
  if (target.adapter === "anthropic-messages") {
    output = (body?.content || [])
      .filter((item) => item?.type === "text")
      .map((item) => item.text)
      .join("\n");
    usage = body?.usage
      ? {
          ...body.usage,
          total_tokens:
            Number(body.usage.input_tokens || 0) + Number(body.usage.output_tokens || 0),
        }
      : null;
  } else if (target.adapter === "gemini-generate-content") {
    output = (body?.candidates?.[0]?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("\n");
    usage = body?.usageMetadata
      ? { ...body.usageMetadata, total_tokens: body.usageMetadata.totalTokenCount ?? null }
      : null;
  } else if (target.adapter === "responses") {
    output = (body?.output || [])
      .flatMap((item) => item?.content || [])
      .filter((item) => item?.type === "output_text")
      .map((item) => item.text)
      .join("\n");
  } else output = body?.choices?.[0]?.message?.content || "";
  return { output: String(output || "").trim(), usage };
}

export async function providerFetch(target, request, signal) {
  let response;
  try {
    response = await fetch(request.url, {
      ...request.init,
      signal: AbortSignal.any([
        signal || new AbortController().signal,
        AbortSignal.timeout(120_000),
      ]),
    });
  } catch (cause) {
    const error = new Error(t("providers.timeout", target.label), { cause });
    error.status = 504;
    error.code = "provider_timeout";
    throw error;
  }
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      /* some providers return a plain-text error page */
    }
    const redact = (value) => {
      const text = String(value || "");
      // Remove the exact credential before normalization or truncation; provider
      // keys need not follow any particular prefix or alphabet.
      return (target.apiKey ? text.split(target.apiKey).join("[redacted]") : text)
        .replace(/(?:sk|key)-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };
    const providerCode = redact(body?.error?.code || body?.code).slice(0, 80);
    const detail = redact(body?.error?.message || body?.message).slice(0, 300);
    // Public errors include only recognized diagnostic codes, never arbitrary
    // upstream text, which may echo prompts or other private input.
    const publicCode = new Set([
      "rate_limit",
      "rate_limit_exceeded",
      "insufficient_quota",
      "model_not_found",
      "invalid_api_key",
      "authentication_error",
    ]).has(providerCode)
      ? providerCode
      : "";
    const authenticationFailure = response.status === 401 || response.status === 403;
    const summary = authenticationFailure
      ? t("providers.rejected", target.label)
      : t("providers.failed", target.label, response.status, publicCode);
    process.stderr.write(
      `${target.label} provider failure: HTTP ${response.status}${providerCode ? ` ${providerCode}` : ""}${detail ? ` — ${detail}` : ""}\n`,
    );
    const error = new Error(summary);
    error.status = 502;
    error.code = authenticationFailure ? "provider_auth" : "provider_error";
    error.publicMessage = summary;
    throw error;
  }
  return response;
}

function providerTestCall(config, payload) {
  const provider = String(payload?.provider || "");
  const definition = providerDefinitions[provider];
  if (!definition) {
    throw httpError(422, t("setupErrors.providerInvalid"), "provider_invalid");
  }
  const suppliedApiKey = String(payload?.apiKey || "").trim();
  if (suppliedApiKey && (suppliedApiKey.length < 8 || suppliedApiKey.length > 2_000)) {
    throw httpError(422, t("setupErrors.apiKeyInvalid"));
  }
  const model = String(
    payload?.model || config[definition.model] || definition.defaultModel,
  ).trim();
  if (!model || model.length > 200 || /[\r\n]/.test(model)) {
    throw httpError(422, t("setupErrors.modelInvalid"));
  }
  const apiKey = suppliedApiKey || config[definition.key];
  if (!apiKey) {
    throw httpError(
      422,
      t("setupErrors.keyBeforeTest", definition.label),
      "provider_not_configured",
    );
  }
  const target = modelConfig(
    { ...config, [definition.key]: apiKey, [definition.model]: model },
    provider,
  );
  return {
    target,
    request: modelRequest(
      target,
      "You are checking whether this API model is available.",
      "Reply with OK.",
      64,
    ),
  };
}

export async function testProviderModel(config, payload, signal) {
  const { target, request } = providerTestCall(config, payload);
  const response = await providerFetch(
    target,
    request,
    AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(20_000)]),
  );
  await response.arrayBuffer();
  // A model that answered is the strongest verdict there is on the key it used.
  providerChecks.set(target.provider, {
    fingerprint: keyFingerprint(target.apiKey),
    reachable: true,
  });
  return { provider: target.provider, model: target.model };
}
