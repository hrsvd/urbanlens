import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiSummarySection } from "./intelligence-panel";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createSummaryStream() {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  return {
    response: new Response(body, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    }),
    send(event: string, data: unknown) {
      streamController.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    },
    close() {
      streamController.close();
    },
  };
}

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("AiSummarySection", () => {
  it("shows streamed chunks progressively and finishes with the accumulated text", async () => {
    const stream = createSummaryStream();
    mockFetch.mockResolvedValueOnce(stream.response);

    render(<AiSummarySection cellId="cell-a" initialSummary={null} />);

    expect(screen.getByText("Generating summary…")).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());

    await act(async () => {
      stream.send("chunk", { text: "First sentence. " });
    });
    expect(screen.getByText(/First sentence\./)).toBeInTheDocument();

    await act(async () => {
      stream.send("chunk", { text: "Second sentence." });
    });
    expect(screen.getByText(/First sentence\. Second sentence\./)).toBeInTheDocument();

    await act(async () => {
      stream.send("complete", { text: "First sentence. Second sentence." });
      stream.close();
    });

    await waitFor(() => {
      expect(screen.getByText("First sentence. Second sentence.")).toBeInTheDocument();
    });
  });

  it("aborts the old cell request and clears its partial text on cell change", async () => {
    const oldStream = createSummaryStream();
    const newStream = createSummaryStream();
    mockFetch
      .mockResolvedValueOnce(oldStream.response)
      .mockResolvedValueOnce(newStream.response);

    const { rerender } = render(
      <AiSummarySection key="cell-a" cellId="cell-a" initialSummary={null} />,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      oldStream.send("chunk", { text: "Old cell partial text." });
    });
    expect(screen.getByText(/Old cell partial text/)).toBeInTheDocument();

    rerender(
      <AiSummarySection key="cell-b" cellId="cell-b" initialSummary={null} />,
    );

    const oldSignal = (mockFetch.mock.calls[0][1] as RequestInit).signal;
    expect(oldSignal?.aborted).toBe(true);
    expect(screen.queryByText(/Old cell partial text/)).not.toBeInTheDocument();
    expect(screen.getByText("Generating summary…")).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      newStream.send("chunk", { text: "New cell summary." });
      newStream.send("complete", { text: "New cell summary." });
      newStream.close();
    });

    await waitFor(() => {
      expect(screen.getByText("New cell summary.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Old cell/)).not.toBeInTheDocument();
  });

  it("shows the friendly message for a 429 response", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      summary: null,
      rateLimited: true,
      message:
        "Rate limit exceeded for the free Gemini version. Please try again in a little while.",
    }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }));

    render(<AiSummarySection cellId="cell-a" initialSummary={null} />);

    expect(await screen.findByText(
      "Rate limit exceeded for the free Gemini version. Please try again in a little while.",
    )).toBeInTheDocument();
  });

  it("preserves generic handling for non-rate-limit errors", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      summary: null,
      error: true,
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    }));

    render(<AiSummarySection cellId="cell-a" initialSummary={null} />);

    expect(await screen.findByText(
      "Summary couldn't be generated right now. Try again shortly.",
    )).toBeInTheDocument();
  });

  it("replaces a streamed fragment with the generic error on incomplete completion", async () => {
    const stream = createSummaryStream();
    mockFetch.mockResolvedValueOnce(stream.response);

    render(<AiSummarySection cellId="cell-a" initialSummary={null} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());

    await act(async () => {
      stream.send("chunk", { text: "This 100-meter" });
      stream.send("error", {
        reason: "incomplete",
        message: "Summary couldn't be generated right now. Try again shortly.",
      });
      stream.close();
    });

    expect(await screen.findByText(
      "Summary couldn't be generated right now. Try again shortly.",
    )).toBeInTheDocument();
    expect(screen.queryByText("This 100-meter")).not.toBeInTheDocument();
  });
});
