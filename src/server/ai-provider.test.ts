import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateAiResult,
  generateAiStream,
  generateAiText,
  isAiEnabled,
  type AiStreamEvent,
} from "./ai-provider";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function geminiResponse(
  parts: string | string[],
  {
    finishReason = "STOP",
    usageMetadata,
  }: {
    finishReason?: string | null;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
  } = {},
) {
  const texts = Array.isArray(parts) ? parts : [parts];
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{
        content: { parts: texts.map((text) => ({ text })) },
        ...(finishReason === null ? {} : { finishReason }),
      }],
      usageMetadata,
    }),
    text: async () => "",
  };
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function geminiStreamResponse(payloads: unknown[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        payloads.forEach((payload) => controller.enqueue(encoder.encode(sse(payload))));
        controller.close();
      },
    }),
    text: async () => "",
  };
}

async function collectStreamEvents(
  result: Awaited<ReturnType<typeof generateAiStream>>,
): Promise<AiStreamEvent[]> {
  if (!result.ok) throw new Error(`Stream did not start: ${result.reason}`);
  const events: AiStreamEvent[] = [];
  for await (const event of result.events) events.push(event);
  return events;
}

afterEach(() => {
  mockFetch.mockReset();
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MAX_OUTPUT_TOKENS;
});

describe("isAiEnabled", () => {
  it("returns false when GEMINI_API_KEY is not set", () => {
    expect(isAiEnabled()).toBe(false);
  });

  it("returns false when GEMINI_API_KEY is empty", () => {
    process.env.GEMINI_API_KEY = "";
    expect(isAiEnabled()).toBe(false);
  });

  it("returns true when key and model are configured", () => {
    process.env.GEMINI_API_KEY = "test-key-123";
    process.env.GEMINI_MODEL = "configured-model";
    expect(isAiEnabled()).toBe(true);
  });

  it("returns false when GEMINI_MODEL is not set", () => {
    process.env.GEMINI_API_KEY = "test-key-123";
    expect(isAiEnabled()).toBe(false);
  });
});

describe("generateAiText", () => {
  it("returns null without calling fetch when Gemini is unconfigured", async () => {
    const result = await generateAiText("hello");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("generateAiResult", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-xyz";
    process.env.GEMINI_MODEL = "configured-model";
  });

  it("returns complete text and joins every candidate text part", async () => {
    mockFetch.mockResolvedValueOnce(
      geminiResponse(["First sentence. ", "Second sentence."]),
    );

    const result = await generateAiResult("Summarise this cell.");

    expect(result).toEqual({
      ok: true,
      text: "First sentence. Second sentence.",
    });
  });

  it("uses the environment output-token value and request configuration", async () => {
    process.env.GEMINI_MAX_OUTPUT_TOKENS = "1536";
    mockFetch.mockResolvedValueOnce(geminiResponse("ok"));

    await generateAiResult("Test prompt", { temperature: 0.3 });

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("configured-model");
    expect(url).toContain("test-key-xyz");
    const body = JSON.parse(options.body as string);
    expect(body.contents[0].parts[0].text).toBe("Test prompt");
    expect(body.generationConfig.maxOutputTokens).toBe(1536);
    expect(body.generationConfig.temperature).toBe(0.3);
  });

  it("uses the safe 1024 default for a missing or invalid token value", async () => {
    mockFetch.mockResolvedValueOnce(geminiResponse("default"));
    await generateAiResult("prompt");
    let body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);

    process.env.GEMINI_MAX_OUTPUT_TOKENS = "not-a-number";
    mockFetch.mockResolvedValueOnce(geminiResponse("fallback"));
    await generateAiResult("prompt");
    body = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });

  it("uses GEMINI_MODEL without changing it", async () => {
    process.env.GEMINI_MODEL = "environment-model";
    mockFetch.mockResolvedValueOnce(geminiResponse("ok"));

    await generateAiResult("prompt");

    expect(mockFetch.mock.calls[0][0]).toContain("environment-model");
  });

  it("logs finish and usage metadata without logging the prompt", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(geminiResponse("complete", {
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 12,
        totalTokenCount: 32,
      },
    }));

    await generateAiResult("private prompt contents");

    expect(info).toHaveBeenCalledWith(
      "[ai-provider] Gemini completion metadata: finishReason=STOP "
      + "promptTokens=20 candidateTokens=12 totalTokens=32",
    );
    expect(info.mock.calls.flat().join(" ")).not.toContain("private prompt contents");
  });

  it("treats MAX_TOKENS as incomplete instead of successful partial text", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(
      geminiResponse("This 100-meter", { finishReason: "MAX_TOKENS" }),
    );

    const result = await generateAiResult("prompt");

    expect(result).toEqual({ ok: false, reason: "incomplete" });
    expect(error).toHaveBeenCalledWith(
      "[ai-provider] Gemini response ended because the maximum output-token limit was reached.",
    );
  });

  it("treats other abnormal finish reasons as errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(
      geminiResponse("partial", { finishReason: "SAFETY" }),
    );

    expect(await generateAiResult("prompt")).toEqual({
      ok: false,
      reason: "incomplete",
    });
  });

  it("does not accept text without a normal finish reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(
      geminiResponse("partial", { finishReason: null }),
    );

    expect(await generateAiResult("prompt")).toEqual({
      ok: false,
      reason: "incomplete",
    });
  });

  it("returns rate-limited on HTTP 429", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "quota exceeded",
    });

    expect(await generateAiResult("prompt")).toEqual({
      ok: false,
      reason: "rate-limited",
    });
  });

  it("returns rate-limited for RESOURCE_EXHAUSTED", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
    });

    expect(await generateAiResult("prompt")).toEqual({
      ok: false,
      reason: "rate-limited",
    });
  });

  it("preserves generic handling for other HTTP and response errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "private upstream details",
    });
    expect(await generateAiResult("prompt")).toEqual({
      ok: false,
      reason: "error",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });
    expect(await generateAiResult("prompt")).toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("returns error on a network failure without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    await expect(generateAiResult("prompt")).resolves.toEqual({
      ok: false,
      reason: "error",
    });
  });
});

describe("generateAiStream", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "configured-model";
  });

  it("emits all text parts in order and completes only after STOP", async () => {
    mockFetch.mockResolvedValueOnce(geminiStreamResponse([
      {
        candidates: [{
          content: { parts: [{ text: "First " }, { text: "sentence. " }] },
        }],
      },
      {
        candidates: [{
          content: { parts: [{ text: "Second sentence." }] },
          finishReason: "STOP",
        }],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 15,
          totalTokenCount: 35,
        },
      },
    ]));

    const events = await collectStreamEvents(await generateAiStream("prompt"));

    expect(events).toEqual([
      { type: "text", text: "First sentence. " },
      { type: "text", text: "Second sentence." },
      { type: "complete" },
    ]);
    expect(mockFetch.mock.calls[0][0]).toContain(
      "streamGenerateContent?alt=sse",
    );
  });

  it("uses the shared output-token configuration for streams", async () => {
    process.env.GEMINI_MAX_OUTPUT_TOKENS = "1400";
    mockFetch.mockResolvedValueOnce(geminiStreamResponse([
      { candidates: [{ content: { parts: [{ text: "Done." }] }, finishReason: "STOP" }] },
    ]));

    await collectStreamEvents(await generateAiStream("prompt"));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(1400);
  });

  it("emits an incomplete error instead of completion for MAX_TOKENS", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(geminiStreamResponse([
      {
        candidates: [{
          content: { parts: [{ text: "This 100-meter" }] },
          finishReason: "MAX_TOKENS",
        }],
      },
    ]));

    const events = await collectStreamEvents(await generateAiStream("prompt"));

    expect(events).toEqual([
      { type: "text", text: "This 100-meter" },
      { type: "error", reason: "incomplete" },
    ]);
  });

  it("treats a stream without a finish reason as incomplete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(geminiStreamResponse([
      { candidates: [{ content: { parts: [{ text: "Partial" }] } }] },
    ]));

    const events = await collectStreamEvents(await generateAiStream("prompt"));

    expect(events.at(-1)).toEqual({ type: "error", reason: "incomplete" });
  });

  it("preserves friendly rate-limit classification before streaming starts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "quota exceeded",
      body: null,
    });

    expect(await generateAiStream("prompt")).toEqual({
      ok: false,
      reason: "rate-limited",
    });
  });
});
