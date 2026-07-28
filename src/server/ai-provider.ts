import "server-only";

import { z } from "zod";
import { getGeminiMaxOutputTokens } from "@/lib/gemini-config.mjs";

const GeminiUsageMetadataSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
}).passthrough();

const GeminiResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({
        text: z.string().optional(),
      }).passthrough()),
    }).optional(),
    finishReason: z.string().optional(),
  }).passthrough()).optional(),
  usageMetadata: GeminiUsageMetadataSchema.optional(),
}).passthrough();

type GeminiResponse = z.infer<typeof GeminiResponseSchema>;
type GeminiUsageMetadata = z.infer<typeof GeminiUsageMetadataSchema>;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_REQUEST_TIMEOUT_MS = 20_000;
const GEMINI_STREAM_TIMEOUT_MS = 60_000;

function model() {
  return process.env.GEMINI_MODEL?.trim();
}

function isGeminiRateLimitResponse(status: number, body: string): boolean {
  return status === 429
    || /"code"\s*:\s*429/i.test(body)
    || /"status"\s*:\s*"RESOURCE_EXHAUSTED"/i.test(body)
    || /"reason"\s*:\s*"(?:RATE_LIMIT_EXCEEDED|QUOTA_EXCEEDED)"/i.test(body);
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function generationBody(prompt: string, temperature: number) {
  return JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: getGeminiMaxOutputTokens(),
      temperature,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  });
}

function responseDetails(response: GeminiResponse) {
  const candidate = response.candidates?.[0];
  const text = candidate?.content?.parts
    .map((part) => part.text ?? "")
    .join("") ?? "";

  return {
    text,
    finishReason: candidate?.finishReason,
    usageMetadata: response.usageMetadata,
  };
}

function logCompletionMetadata(
  finishReason: string | undefined,
  usageMetadata: GeminiUsageMetadata | undefined,
): void {
  const details = [
    `finishReason=${finishReason ?? "unknown"}`,
    `promptTokens=${usageMetadata?.promptTokenCount ?? "unknown"}`,
    `candidateTokens=${usageMetadata?.candidatesTokenCount ?? "unknown"}`,
    `totalTokens=${usageMetadata?.totalTokenCount ?? "unknown"}`,
  ];
  console.info(`[ai-provider] Gemini completion metadata: ${details.join(" ")}`);
}

function hasAbnormalFinishReason(finishReason: string | undefined): boolean {
  if (!finishReason) {
    console.error("[ai-provider] Gemini response ended without a normal finish reason.");
    return true;
  }

  if (finishReason === "MAX_TOKENS") {
    console.error(
      "[ai-provider] Gemini response ended because the maximum output-token limit was reached.",
    );
    return true;
  }

  if (finishReason && finishReason !== "STOP") {
    console.error(`[ai-provider] Gemini response ended with finishReason=${finishReason}.`);
    return true;
  }

  return false;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError" || error.name === "TimeoutError"
    : error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export const GEMINI_RATE_LIMIT_MESSAGE =
  "Rate limit exceeded for the free Gemini version. Please try again in a little while.";

export type AiProviderOptions = {
  /** Sampling temperature 0–1 (default 0.2 for factual/grounded tasks) */
  temperature?: number;
  /** Optional caller cancellation signal. */
  signal?: AbortSignal;
};

export type AiFailureReason =
  | "rate-limited"
  | "disabled"
  | "incomplete"
  | "aborted"
  | "error";

export type AiGenerateResult =
  | { ok: true; text: string }
  | { ok: false; reason: AiFailureReason };

export type AiStreamEvent =
  | { type: "text"; text: string }
  | { type: "complete" }
  | { type: "error"; reason: Exclude<AiFailureReason, "disabled" | "aborted"> };

export type AiStreamStartResult =
  | { ok: true; events: AsyncGenerator<AiStreamEvent> }
  | { ok: false; reason: AiFailureReason };

/**
 * Generates text using the Gemini REST API.
 *
 * Returns null without throwing when Gemini is unconfigured, the request
 * fails, or Gemini reports an incomplete/abnormal finish reason.
 */
export async function generateAiText(
  prompt: string,
  options: AiProviderOptions = {},
): Promise<string | null> {
  const result = await generateAiResult(prompt, options);
  return result.ok ? result.text : null;
}

/** True only when GEMINI_API_KEY and GEMINI_MODEL are set in the environment. */
export function isAiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() && model());
}

/**
 * Generates one complete response and distinguishes rate limits and incomplete
 * generations from other failures.
 */
export async function generateAiResult(
  prompt: string,
  options: AiProviderOptions = {},
): Promise<AiGenerateResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = model();
  if (!key || !configuredModel) return { ok: false, reason: "disabled" };

  const { temperature = 0.2, signal } = options;
  const url = `${GEMINI_BASE}/models/${configuredModel}:generateContent?key=${key}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: generationBody(prompt, temperature),
      signal: requestSignal(signal, GEMINI_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (isGeminiRateLimitResponse(response.status, body)) {
        console.error("[ai-provider] Gemini rate limit");
        return { ok: false, reason: "rate-limited" };
      }
      console.error(`[ai-provider] Gemini request failed with status ${response.status}.`);
      return { ok: false, reason: "error" };
    }

    const parsed = GeminiResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error("[ai-provider] Unexpected Gemini response shape");
      return { ok: false, reason: "error" };
    }

    const { text, finishReason, usageMetadata } = responseDetails(parsed.data);
    logCompletionMetadata(finishReason, usageMetadata);

    const completeText = text.trim();
    if (!completeText) {
      return { ok: false, reason: "error" };
    }

    if (hasAbnormalFinishReason(finishReason)) {
      return { ok: false, reason: "incomplete" };
    }

    return { ok: true, text: completeText };
  } catch (error) {
    if (isAbortError(error)) {
      if (!options.signal?.aborted) {
        console.error("[ai-provider] Gemini request timed out.");
      }
      return { ok: false, reason: "aborted" };
    }
    console.error("[ai-provider] Gemini request failed.");
    return { ok: false, reason: "error" };
  }
}

function parseSseBlock(block: string): unknown | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") return null;

  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error("Invalid Gemini stream event.");
  }
}

async function* readSsePayloads(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const payload = parseSseBlock(block);
        if (payload !== null) yield payload;
      }
    }

    buffer += decoder.decode();
    const payload = parseSseBlock(buffer.replaceAll("\r\n", "\n"));
    if (payload !== null) yield payload;
    completed = true;
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

async function* streamEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AiStreamEvent> {
  let finishReason: string | undefined;
  let usageMetadata: GeminiUsageMetadata | undefined;
  let sawPayload = false;

  for await (const payload of readSsePayloads(body)) {
    const serialized = JSON.stringify(payload);
    if (isGeminiRateLimitResponse(200, serialized)) {
      console.error("[ai-provider] Gemini rate limit");
      yield { type: "error", reason: "rate-limited" };
      return;
    }

    const parsed = GeminiResponseSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[ai-provider] Unexpected Gemini stream response shape");
      yield { type: "error", reason: "error" };
      return;
    }

    sawPayload = true;
    const details = responseDetails(parsed.data);
    if (details.text) yield { type: "text", text: details.text };
    if (details.finishReason) finishReason = details.finishReason;
    if (details.usageMetadata) usageMetadata = details.usageMetadata;
  }

  logCompletionMetadata(finishReason, usageMetadata);

  if (!sawPayload || !finishReason) {
    console.error("[ai-provider] Gemini stream ended without a normal finish reason.");
    yield { type: "error", reason: "incomplete" };
    return;
  }

  if (hasAbnormalFinishReason(finishReason)) {
    yield { type: "error", reason: "incomplete" };
    return;
  }

  yield { type: "complete" };
}

/**
 * Starts Gemini's REST SSE endpoint and returns parsed text/terminal events.
 * Text parts are emitted in order and are never buffered into a final response.
 */
export async function generateAiStream(
  prompt: string,
  options: AiProviderOptions = {},
): Promise<AiStreamStartResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = model();
  if (!key || !configuredModel) return { ok: false, reason: "disabled" };

  const { temperature = 0.2, signal } = options;
  const url =
    `${GEMINI_BASE}/models/${configuredModel}:streamGenerateContent?alt=sse&key=${key}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: generationBody(prompt, temperature),
      signal: requestSignal(signal, GEMINI_STREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (isGeminiRateLimitResponse(response.status, body)) {
        console.error("[ai-provider] Gemini rate limit");
        return { ok: false, reason: "rate-limited" };
      }
      console.error(`[ai-provider] Gemini stream failed with status ${response.status}.`);
      return { ok: false, reason: "error" };
    }

    if (!response.body) {
      console.error("[ai-provider] Gemini stream response had no body.");
      return { ok: false, reason: "error" };
    }

    return { ok: true, events: streamEvents(response.body) };
  } catch (error) {
    if (isAbortError(error)) {
      if (!options.signal?.aborted) {
        console.error("[ai-provider] Gemini stream request timed out.");
      }
      return { ok: false, reason: "aborted" };
    }
    console.error("[ai-provider] Gemini stream request failed.");
    return { ok: false, reason: "error" };
  }
}
