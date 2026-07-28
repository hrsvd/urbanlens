import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assembleContext: vi.fn(),
  generateAiResult: vi.fn(),
  isAiEnabled: vi.fn(),
}));

vi.mock("@/server/ai-retrieval", () => ({
  assembleContext: mocks.assembleContext,
}));

vi.mock("@/server/ai-provider", () => ({
  GEMINI_RATE_LIMIT_MESSAGE:
    "Rate limit exceeded for the free Gemini version. Please try again in a little while.",
  generateAiResult: mocks.generateAiResult,
  isAiEnabled: mocks.isAiEnabled,
}));

import { POST } from "./route";

function request(query: string, sessionId: string) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, sessionId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAiEnabled.mockReturnValue(true);
  mocks.assembleContext.mockResolvedValue({
    systemPrompt: "Grounded system prompt",
    userTurn: "Question and locality data",
    intent: { kind: "broad" },
    localities: [{ localityId: "hsr" }],
  });
});

describe("Ask AI route", () => {
  it("returns a complete provider response without changing the existing UI contract", async () => {
    mocks.generateAiResult.mockResolvedValue({
      ok: true,
      text: "First complete sentence. Second complete sentence.",
    });

    const response = await POST(request("Compare transit", "success-session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: "First complete sentence. Second complete sentence.",
      intent: { kind: "broad" },
      localitiesUsed: ["hsr"],
      remaining: 19,
    });
    expect(mocks.generateAiResult).toHaveBeenCalledWith(
      "Grounded system prompt\n\nQuestion and locality data",
      { temperature: 0.25 },
    );
  });

  it("does not return a MAX_TOKENS fragment as a successful reply", async () => {
    mocks.generateAiResult.mockResolvedValue({
      ok: false,
      reason: "incomplete",
    });

    const response = await POST(request("Compare flooding", "incomplete-session"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      reply: null,
      error: "The assistant could not generate a response. Please try again.",
    });
  });

  it("preserves the friendly Gemini rate-limit reply", async () => {
    mocks.generateAiResult.mockResolvedValue({
      ok: false,
      reason: "rate-limited",
    });

    const response = await POST(request("Compare parks", "rate-session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply:
        "Rate limit exceeded for the free Gemini version. Please try again in a little while.",
      rateLimited: true,
    });
  });
});
