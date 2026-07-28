import "server-only";

import { z } from "zod";

// ── Gemini REST response schema (Zod-validated) ───────────────────────────────
const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string() })),
        }),
        finishReason: z.string().optional(),
      }),
    )
    .min(1),
});

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function model() {
  return process.env.GEMINI_MODEL?.trim();
}

function isGeminiRateLimitResponse(status: number, body: string): boolean {
  return status === 429
    || /"status"\s*:\s*"RESOURCE_EXHAUSTED"/i.test(body)
    || /"reason"\s*:\s*"(?:RATE_LIMIT_EXCEEDED|QUOTA_EXCEEDED)"/i.test(body);
}

export const GEMINI_RATE_LIMIT_MESSAGE =
  "Rate limit exceeded for the free Gemini version. Please try again in a little while.";

export type AiProviderOptions = {
  /** Maximum output tokens (default 400) */
  maxTokens?: number;
  /** Sampling temperature 0–1 (default 0.2 for factual/grounded tasks) */
  temperature?: number;
};

/**
 * Generates text using the Gemini REST API.
 *
 * Returns null without throwing when:
 * - GEMINI_API_KEY or GEMINI_MODEL is not set (graceful disabled mode)
 * - The API returns a non-2xx status
 * - The response fails Zod validation
 * - The request times out (20 s)
 *
 * Every error is logged to console; nothing is surfaced as a thrown exception
 * so callers never need to catch — they just handle the null case.
 */
export async function generateAiText(
  prompt: string,
  options: AiProviderOptions = {},
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = model();
  if (!key || !configuredModel) return null;

  const { maxTokens = 400, temperature = 0.2 } = options;
  const url = `${GEMINI_BASE}/models/${configuredModel}:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature },
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[ai-provider] Gemini ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const parsed = GeminiResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error("[ai-provider] Unexpected Gemini response shape");
      return null;
    }

    const text = parsed.data.candidates[0].content.parts.map((p) => p.text).join("").trim();
    return text || null;
  } catch (err) {
    console.error("[ai-provider] Request failed:", err);
    return null;
  }
}

/** True only when GEMINI_API_KEY and GEMINI_MODEL are set in the environment. */
export function isAiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() && model());
}

// ── Typed result variant (distinguishes rate-limit from other failures) ────────

export type AiGenerateResult =
  | { ok: true; text: string }
  | { ok: false; reason: "rate-limited" }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "error" };

/**
 * Like generateAiText but returns a discriminated union so callers can
 * treat 429 rate-limit responses differently from other failures.
 */
export async function generateAiResult(
  prompt: string,
  options: AiProviderOptions = {},
): Promise<AiGenerateResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = model();
  if (!key || !configuredModel) return { ok: false, reason: "disabled" };

  const { maxTokens = 400, temperature = 0.2 } = options;
  const url = `${GEMINI_BASE}/models/${configuredModel}:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature },
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (isGeminiRateLimitResponse(res.status, body)) {
        console.error("[ai-provider] Gemini rate limit");
        return { ok: false, reason: "rate-limited" };
      }
      console.error(`[ai-provider] Gemini ${res.status}: ${body.slice(0, 200)}`);
      return { ok: false, reason: "error" };
    }

    const parsed = GeminiResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error("[ai-provider] Unexpected Gemini response shape");
      return { ok: false, reason: "error" };
    }

    const text = parsed.data.candidates[0].content.parts.map((p) => p.text).join("").trim();
    return text ? { ok: true, text } : { ok: false, reason: "error" };
  } catch (err) {
    console.error("[ai-provider] Request failed:", err);
    return { ok: false, reason: "error" };
  }
}
