import { NextResponse } from "next/server";
import { assembleContext } from "@/server/ai-retrieval";
import { generateAiResult, isAiEnabled } from "@/server/ai-provider";

// ── Per-session in-memory rate limiter ────────────────────────────────────────
// Each session ID (opaque client-generated string) gets a rolling window.
// No persistence: counter resets when the server process restarts.

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 20; // max 20 queries per session per hour

type SessionState = { count: number; windowStart: number };
const sessionMap = new Map<string, SessionState>();

function checkRateLimit(sessionId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const state = sessionMap.get(sessionId) ?? { count: 0, windowStart: now };

  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Window expired — reset
    state.count = 0;
    state.windowStart = now;
  }

  if (state.count >= RATE_LIMIT_MAX) {
    sessionMap.set(sessionId, state);
    return { allowed: false, remaining: 0 };
  }

  state.count += 1;
  sessionMap.set(sessionId, state);
  return { allowed: true, remaining: RATE_LIMIT_MAX - state.count };
}

// ── Request schema ─────────────────────────────────────────────────────────────

type ChatRequest = {
  query: string;
  sessionId: string;
};

function parseRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const query = typeof b.query === "string" ? b.query.trim().slice(0, 600) : null;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim().slice(0, 64) : null;
  if (!query || !sessionId) return null;
  return { query, sessionId };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isAiEnabled()) {
    return NextResponse.json(
      {
        reply: null,
        disabled: true,
        message: "The assistant is not yet enabled. Ask the site author to add a Gemini API key.",
      },
      { status: 200 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Missing or invalid 'query' and 'sessionId' fields" },
      { status: 400 },
    );
  }

  const { query, sessionId } = parsed;

  const rateCheck = checkRateLimit(sessionId);
  if (!rateCheck.allowed) {
    // Return as an assistant reply so the chat thread remains intact
    return NextResponse.json({
      reply:
        "You've reached the hourly limit — this assistant runs on a free tier and caps at 20 questions per session per hour. Please try again after some time.",
      rateLimited: true,
    });
  }

  const ctx = await assembleContext(query);

  const fullPrompt = `${ctx.systemPrompt}\n\n${ctx.userTurn}`;
  const result = await generateAiResult(fullPrompt, {
    maxTokens: 500,
    temperature: 0.25,
  });

  if (!result.ok) {
    if (result.reason === "rate-limited") {
      // Gemini quota — return as an assistant reply, not an error, so the UI stays usable
      return NextResponse.json({
        reply:
          "I've hit the free-tier API limit for now — the underlying model needs a short breather. Please try again in a minute or two.",
        rateLimited: true,
      });
    }
    return NextResponse.json(
      { reply: null, error: "The assistant could not generate a response. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    reply: result.text,
    intent: ctx.intent,
    localitiesUsed: ctx.localities.map((l) => l.localityId),
    remaining: rateCheck.remaining,
  });
}
