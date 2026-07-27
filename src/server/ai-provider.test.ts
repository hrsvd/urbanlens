import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { generateAiText, isAiEnabled } from "./ai-provider";

// Mock fetch globally for all tests in this file
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function geminiResponse(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    }),
    text: async () => "",
  };
}

afterEach(() => {
  mockFetch.mockReset();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});

describe("isAiEnabled", () => {
  it("returns false when GEMINI_API_KEY is not set", () => {
    expect(isAiEnabled()).toBe(false);
  });

  it("returns false when GEMINI_API_KEY is empty string", () => {
    process.env.GEMINI_API_KEY = "";
    expect(isAiEnabled()).toBe(false);
  });

  it("returns true when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key-123";
    expect(isAiEnabled()).toBe(true);
  });
});

describe("generateAiText — no key", () => {
  it("returns null without calling fetch when key is absent", async () => {
    const result = await generateAiText("hello");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("generateAiText — with key", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-xyz";
  });

  it("returns extracted text on success", async () => {
    mockFetch.mockResolvedValueOnce(geminiResponse("This cell scores 7.2/10 overall."));
    const result = await generateAiText("Summarise this cell.");
    expect(result).toBe("This cell scores 7.2/10 overall.");
  });

  it("passes the prompt and config to the Gemini endpoint", async () => {
    mockFetch.mockResolvedValueOnce(geminiResponse("ok"));
    await generateAiText("Test prompt", { maxTokens: 250, temperature: 0.3 });
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-1.5-flash");
    expect(url).toContain("test-key-xyz");
    const body = JSON.parse(options.body as string);
    expect(body.contents[0].parts[0].text).toBe("Test prompt");
    expect(body.generationConfig.maxOutputTokens).toBe(250);
    expect(body.generationConfig.temperature).toBe(0.3);
  });

  it("uses GEMINI_MODEL env var when set", async () => {
    process.env.GEMINI_MODEL = "gemini-2.0-flash";
    mockFetch.mockResolvedValueOnce(geminiResponse("ok"));
    await generateAiText("prompt");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-2.0-flash");
  });

  it("returns null on non-2xx HTTP status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "quota" });
    const result = await generateAiText("prompt");
    expect(result).toBeNull();
  });

  it("returns null when Gemini response has unexpected shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "blocked" }),
    });
    const result = await generateAiText("prompt");
    expect(result).toBeNull();
  });

  it("returns null (does not throw) when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    await expect(generateAiText("prompt")).resolves.toBeNull();
  });

  it("trims the returned text", async () => {
    mockFetch.mockResolvedValueOnce(geminiResponse("  Summary with whitespace.  \n"));
    const result = await generateAiText("prompt");
    expect(result).toBe("Summary with whitespace.");
  });

  it("returns null when the model returns an empty string", async () => {
    mockFetch.mockResolvedValueOnce(geminiResponse(""));
    const result = await generateAiText("prompt");
    expect(result).toBeNull();
  });
});
