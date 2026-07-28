import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStreamEvent } from "@/server/ai-provider";

const mocks = vi.hoisted(() => ({
  getBootstrap: vi.fn(),
  getCell: vi.fn(),
  getCellSummaries: vi.fn(),
  getLiveSummary: vi.fn(),
  getStaticIntelligence: vi.fn(),
  localityForCell: vi.fn(),
  setCachedSummary: vi.fn(),
  generateAiStream: vi.fn(),
  isAiEnabled: vi.fn(),
}));

vi.mock("@/server/data", () => ({
  getBootstrap: mocks.getBootstrap,
  getCell: mocks.getCell,
  getCellSummaries: mocks.getCellSummaries,
  getLiveSummary: mocks.getLiveSummary,
  getStaticIntelligence: mocks.getStaticIntelligence,
  localityForCell: mocks.localityForCell,
  setCachedSummary: mocks.setCachedSummary,
}));

vi.mock("@/server/ai-provider", () => ({
  GEMINI_RATE_LIMIT_MESSAGE:
    "Rate limit exceeded for the free Gemini version. Please try again in a little while.",
  generateAiStream: mocks.generateAiStream,
  isAiEnabled: mocks.isAiEnabled,
}));

import { GET } from "./route";

const cellId = "hsr-grid-01-01";
const routeContext = { params: Promise.resolve({ cellId }) };

async function* streamEvents(events: AiStreamEvent[]) {
  for (const event of events) yield event;
}

function request(signal?: AbortSignal) {
  return new Request(`http://localhost/api/ai/cell-summary/${cellId}`, { signal });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAiEnabled.mockReturnValue(true);
  mocks.getLiveSummary.mockReturnValue(null);
  mocks.localityForCell.mockReturnValue("hsr");
  mocks.getStaticIntelligence.mockResolvedValue(null);
  mocks.getCellSummaries.mockResolvedValue({});
  mocks.getBootstrap.mockResolvedValue({});
  mocks.getCell.mockResolvedValue({
    properties: {
      id: cellId,
      sizeMeters: 100,
      staticFeatures: {},
      staticScores: {},
    },
  });
});

describe("cell summary streaming route", () => {
  it("streams multiple complete sentences and caches only the final text", async () => {
    mocks.generateAiStream.mockResolvedValue({
      ok: true,
      events: streamEvents([
        { type: "text", text: "The cell has strong transit access. " },
        { type: "text", text: "Its flood baseline is the weakest scored signal." },
        { type: "complete" },
      ]),
    });

    const response = await GET(request(), routeContext);
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(body).toContain(
      'event: chunk\ndata: {"text":"The cell has strong transit access. "}',
    );
    expect(body).toContain(
      'event: chunk\ndata: {"text":"Its flood baseline is the weakest scored signal."}',
    );
    expect(body).toContain(
      'event: complete\ndata: {"text":"The cell has strong transit access. Its flood baseline is the weakest scored signal."}',
    );
    expect(mocks.setCachedSummary).toHaveBeenCalledOnce();
    expect(mocks.setCachedSummary).toHaveBeenCalledWith(
      cellId,
      "The cell has strong transit access. Its flood baseline is the weakest scored signal.",
    );
  });

  it("does not cache a MAX_TOKENS partial generation", async () => {
    mocks.generateAiStream.mockResolvedValue({
      ok: true,
      events: streamEvents([
        { type: "text", text: "This 100-meter" },
        { type: "error", reason: "incomplete" },
      ]),
    });

    const response = await GET(request(), routeContext);
    const body = await response.text();

    expect(body).toContain('event: chunk\ndata: {"text":"This 100-meter"}');
    expect(body).toContain(
      'event: error\ndata: {"reason":"incomplete","message":"Summary couldn\'t be generated right now. Try again shortly."}',
    );
    expect(body).not.toContain("event: complete");
    expect(mocks.setCachedSummary).not.toHaveBeenCalled();
  });

  it("does not cache or hang when the upstream stream fails", async () => {
    async function* failedStream(): AsyncGenerator<AiStreamEvent> {
      yield { type: "text", text: "Partial" };
      throw new Error("upstream disconnected");
    }
    mocks.generateAiStream.mockResolvedValue({
      ok: true,
      events: failedStream(),
    });

    const response = await GET(request(), routeContext);
    const body = await response.text();

    expect(body).toContain('event: chunk\ndata: {"text":"Partial"}');
    expect(body).toContain('event: error\ndata: {"reason":"error"');
    expect(mocks.setCachedSummary).not.toHaveBeenCalled();
  });

  it("preserves the friendly rate-limit JSON response", async () => {
    mocks.generateAiStream.mockResolvedValue({
      ok: false,
      reason: "rate-limited",
    });

    const response = await GET(request(), routeContext);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      summary: null,
      rateLimited: true,
      message:
        "Rate limit exceeded for the free Gemini version. Please try again in a little while.",
    });
    expect(mocks.setCachedSummary).not.toHaveBeenCalled();
  });

  it("preserves generic handling for non-rate-limit start failures", async () => {
    mocks.generateAiStream.mockResolvedValue({ ok: false, reason: "error" });

    const response = await GET(request(), routeContext);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ summary: null, error: true });
  });

  it("returns an existing completed cache without starting a stream", async () => {
    mocks.getLiveSummary.mockReturnValue(
      "Cached first sentence. Cached second sentence.",
    );

    const response = await GET(request(), routeContext);

    await expect(response.json()).resolves.toEqual({
      summary: "Cached first sentence. Cached second sentence.",
      cached: true,
    });
    expect(mocks.generateAiStream).not.toHaveBeenCalled();
  });

  it("does not cache or emit an error after intentional cancellation", async () => {
    let releaseStream: () => void = () => undefined;
    let firstChunkReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      firstChunkReady = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });

    async function* delayedStream(): AsyncGenerator<AiStreamEvent> {
      firstChunkReady();
      yield { type: "text", text: "Old cell text. " };
      await release;
      yield { type: "text", text: "This must not leak." };
      yield { type: "complete" };
    }

    mocks.generateAiStream.mockResolvedValue({
      ok: true,
      events: delayedStream(),
    });

    const abortController = new AbortController();
    const response = await GET(request(abortController.signal), routeContext);
    await ready;
    abortController.abort();
    releaseStream();
    const body = await response.text();

    expect(body).not.toContain("This must not leak.");
    expect(body).not.toContain("event: complete");
    expect(body).not.toContain("event: error");
    expect(mocks.setCachedSummary).not.toHaveBeenCalled();
  });
});
