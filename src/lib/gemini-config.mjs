export const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 1024;

export function getGeminiMaxOutputTokens(environment = process.env) {
  const parsed = Number.parseInt(
    environment.GEMINI_MAX_OUTPUT_TOKENS ?? String(DEFAULT_GEMINI_MAX_OUTPUT_TOKENS),
    10,
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_GEMINI_MAX_OUTPUT_TOKENS;
}
