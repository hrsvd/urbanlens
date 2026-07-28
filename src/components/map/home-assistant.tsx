"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, X } from "lucide-react";

type Message = { role: "user" | "assistant"; text: string };

type ChatResponse = {
  reply: string | null;
  disabled?: boolean;
  rateLimited?: boolean;
  message?: string;
  error?: string;
};

function getOrCreateSessionId(): string {
  const key = "ul-chat-session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

// ── Individual message bubble ─────────────────────────────────────────────────

function MessageBubble({ role, text }: Message) {
  return (
    <div className={`chat-bubble chat-bubble--${role}`}>
      {role === "assistant" && (
        <div className="chat-bubble-icon">
          <Bot aria-hidden="true" size={13} />
        </div>
      )}
      <p className="chat-bubble-text">{text}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HomeAssistant({ open, onClose }: Props) {
  const inputId = useId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sessionId = useRef<string | null>(null);
  useEffect(() => {
    sessionId.current = getOrCreateSessionId();
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, sessionId: sessionId.current }),
      });

      const data: ChatResponse = await res.json();

      if (data.disabled) {
        setDisabled(true);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "The intelligence assistant is not yet enabled — Gemini is not fully configured." },
        ]);
        return;
      }

      // Rate-limited replies (both session and Gemini quota) arrive as normal assistant
      // messages so the chat stays fully usable — the user can try again whenever ready.
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply! }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              (typeof data.error === "string" ? data.error : null) ??
              "Something didn't go right on my end. Please try again in a moment.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Network error — please check your connection and try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage],
  );

  const isEmpty = messages.length === 0 && !loading;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="assistant-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.aside
            className="assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-label="UrbanLens intelligence assistant"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <div className="assistant-header">
              <div className="assistant-header-title">
                <Bot aria-hidden="true" size={16} />
                <span>Intelligence Assistant</span>
                <em className="ai-badge">AI · grounded</em>
              </div>
              <button
                type="button"
                className="assistant-close"
                onClick={onClose}
                aria-label="Close assistant"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {/* Message list */}
            <div className="assistant-messages" aria-live="polite" aria-atomic="false">
              {isEmpty && (
                <div className="assistant-empty">
                  <p>Ask about any Bengaluru locality — flood risk, transit, green cover, utilities, or more.</p>
                  <p className="assistant-empty-hint">
                    Answers are grounded in ingested data only. No facts are invented.
                  </p>
                  <ul className="assistant-examples" aria-label="Example questions">
                    <li>Which locality has the best public transit?</li>
                    <li>What&apos;s the flood situation in Bellandur?</li>
                    <li>How green is Indiranagar compared to Whitefield?</li>
                  </ul>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} role={msg.role} text={msg.text} />
              ))}

              {loading && (
                <div className="chat-bubble chat-bubble--assistant chat-bubble--loading">
                  <div className="chat-bubble-icon">
                    <Bot aria-hidden="true" size={13} />
                  </div>
                  <span className="chat-typing">
                    <i /><i /><i />
                  </span>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input area */}
            <div className="assistant-input-row">
              <label htmlFor={inputId} className="sr-only">
                Ask a question about Bengaluru localities
              </label>
              <textarea
                ref={inputRef}
                id={inputId}
                className="assistant-input"
                placeholder={
                  disabled
                    ? "Assistant not enabled"
                    : "Ask about any Bengaluru locality…"
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                disabled={disabled}
                aria-disabled={disabled}
              />
              <button
                type="button"
                className="assistant-send"
                onClick={() => void sendMessage()}
                disabled={!inputValue.trim() || loading || disabled}
                aria-label="Send"
              >
                <Send size={15} aria-hidden="true" />
              </button>
            </div>

            <p className="assistant-disclaimer">
              Answers are based solely on ingested locality data. Never use for medical, legal, or safety decisions.
            </p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
