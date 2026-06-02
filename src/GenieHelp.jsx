// GENIE HELP VERSION: v1
// ============================================================
// Ops Genie — In-App Help Genie (free / static)
// ============================================================
//
// A floating genie chat in the lower-left that answers "how do I…"
// and "why is this showing…" questions about the app.
//
// IMPORTANT — READ-ONLY BY DESIGN:
//  This component only READS from helpContent.js and renders text.
//  It has no Supabase access, no props that mutate app state, and
//  no write path of any kind. It is structurally incapable of
//  changing data, logic, or configuration. The paid "make changes"
//  assistant is a separate, future, admin-only system.
//
// Matching is keyword/fuzzy retrieval over authored topics — not an
// LLM. Live app state (low-stock count, admin flag, app name) is
// passed in via `ctx` so authored answers can include real numbers.
// ============================================================

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Sparkles, X, Search, ArrowLeft, Send } from "lucide-react";
import { TOPICS, CATEGORIES } from "./helpContent";

// Words too common to be useful for matching.
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "how", "what", "why", "i", "my",
  "to", "of", "in", "on", "for", "and", "or", "it", "this", "that", "can", "me",
  "with", "from", "where", "when", "show", "see", "get", "use", "you", "your", "if",
]);

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// Pre-compute a searchable text blob per topic once.
const INDEXED = TOPICS.map((t) => {
  const kw = (t.keywords || []).join(" ");
  return {
    topic: t,
    titleTokens: tokenize(t.title),
    keywordText: " " + kw.toLowerCase() + " ",
    keywordTokens: tokenize(kw),
    // Answer text is only available for static-string answers; functional
    // answers are scored on title + keywords only (which is plenty).
    bodyTokens: tokenize(typeof t.answer === "string" ? t.answer : ""),
  };
});

// Document frequency per token, so distinctive words (e.g. "red") outweigh
// common ones (e.g. "item") when ranking. Computed once over all topics.
const TOTAL_TOPICS = INDEXED.length;
const DOC_FREQ = (() => {
  const df = {};
  for (const idx of INDEXED) {
    const seen = new Set([...idx.titleTokens, ...idx.keywordTokens, ...idx.bodyTokens]);
    for (const tok of seen) df[tok] = (df[tok] || 0) + 1;
  }
  return df;
})();

// Inverse document frequency weight, smoothed. Rare token ⇒ larger weight.
function idf(token) {
  const f = DOC_FREQ[token] || 0;
  return 1 + Math.log((TOTAL_TOPICS + 1) / (f + 1));
}

// Score a query against every topic and return ranked matches.
function searchTopics(query) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const qLower = query.toLowerCase().trim();

  const scored = INDEXED.map((idx) => {
    let score = 0;

    // Strong boost: the whole query appears inside the keyword list.
    if (qLower.length >= 3 && idx.keywordText.includes(" " + qLower + " ")) score += 12;
    if ((idx.topic.keywords || []).some((k) => k.toLowerCase().includes(qLower) && qLower.length >= 4)) score += 6;

    for (const qt of qTokens) {
      const w = idf(qt); // distinctive tokens count for more
      if (idx.keywordTokens.includes(qt)) score += 4 * w;
      else if (idx.keywordText.includes(qt)) score += 2 * w; // partial keyword hit
      if (idx.titleTokens.includes(qt)) score += 3 * w;
      else if (idx.titleTokens.some((tt) => tt.startsWith(qt) || qt.startsWith(tt))) score += 1.5 * w;
      if (idx.bodyTokens.includes(qt)) score += 0.6 * w;
    }

    return { topic: idx.topic, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

// Resolve an answer (string or function) against live context.
function resolveAnswer(topic, ctx) {
  try {
    return typeof topic.answer === "function" ? topic.answer(ctx) : topic.answer;
  } catch {
    return topic.answer && typeof topic.answer === "string" ? topic.answer : "";
  }
}

function topicById(id) {
  return TOPICS.find((t) => t.id === id);
}

// Render an answer body: paragraphs + optional numbered steps + related chips.
function AnswerBlock({ topic, ctx, onPick }) {
  const text = resolveAnswer(topic, ctx);
  const paragraphs = String(text).split("\n").filter((p) => p.trim() !== "");
  const related = (topic.related || []).map(topicById).filter(Boolean);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 6 }}>{topic.title}</div>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.55, color: "#d8d8e0" }}>{p}</p>
      ))}
      {topic.steps && topic.steps.length > 0 && (
        <ol style={{ margin: "4px 0 8px", paddingLeft: 18, color: "#d8d8e0" }}>
          {topic.steps.map((s, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{s}</li>
          ))}
        </ol>
      )}
      {related.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Related</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {related.map((r) => (
              <button key={r.id} onClick={() => onPick(r)} style={chipStyle}>{r.title}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const chipStyle = {
  background: "#2a2a3a",
  color: "#c7c7d6",
  border: "1px solid #3a3a4a",
  borderRadius: 14,
  padding: "5px 10px",
  fontSize: 11.5,
  cursor: "pointer",
  textAlign: "left",
  lineHeight: 1.3,
};

export default function GenieHelp({ ctx }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Conversation: array of { from: 'user'|'genie', kind: 'text'|'topic'|'nomatch'|'list', ... }
  const [messages, setMessages] = useState([]);
  const [browseCat, setBrowseCat] = useState(null); // category id when browsing
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const liveMatches = useMemo(() => (query.trim() ? searchTopics(query).slice(0, 5) : []), [query]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Avoid "Dumpling Genie Genie": only append "Genie" if the app name doesn't already say it.
  const genieName = useMemo(
    () => (/genie/i.test(ctx.appName) ? ctx.appName : `${ctx.appName} Genie`),
    [ctx.appName]
  );
  const greeting = useMemo(
    () => `Hi! I'm the ${genieName} — your in-app help. Ask me how to do something, or why something looks the way it does. Tap a topic below or type a question.`,
    [genieName]
  );

  function pushTopic(topic) {
    setMessages((m) => [...m, { from: "genie", kind: "topic", topicId: topic.id }]);
    setBrowseCat(null);
  }

  function submitQuery(text) {
    const q = (text != null ? text : query).trim();
    if (!q) return;
    setMessages((m) => [...m, { from: "user", kind: "text", text: q }]);
    const results = searchTopics(q);
    setQuery("");
    setBrowseCat(null);

    if (results.length === 0 || results[0].score < 3) {
      setMessages((m) => [...m, { from: "genie", kind: "nomatch", suggestions: results.slice(0, 3).map((r) => r.topic.id) }]);
      return;
    }
    // Lead with the best match; offer the next couple as follow-ups.
    setMessages((m) => [
      ...m,
      { from: "genie", kind: "topic", topicId: results[0].topic.id, alsoSee: results.slice(1, 4).map((r) => r.topic.id) },
    ]);
  }

  const categoryTopics = browseCat ? TOPICS.filter((t) => t.category === browseCat) : [];

  return (
    <>
      {/* Floating launcher — lower left */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask the Ops Genie"
          aria-label="Open help genie"
          style={{
            position: "fixed", left: 20, bottom: 20, zIndex: 1000,
            width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)",
            boxShadow: "0 6px 20px rgba(217,119,6,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, lineHeight: 1,
          }}
        >
          <span role="img" aria-hidden="true">🧞</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed", left: 20, bottom: 20, zIndex: 1000,
            width: 360, maxWidth: "calc(100vw - 40px)",
            height: 560, maxHeight: "calc(100vh - 40px)",
            background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 16,
            boxShadow: "0 12px 40px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #2a2a3a", background: "#1a1a24" }}>
            <span style={{ fontSize: 22 }} role="img" aria-hidden="true">🧞</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {genieName}
              </div>
              <div style={{ fontSize: 10, color: "#777" }}>Help &amp; how-to · free</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Greeting + category chips (only before any conversation) */}
            {messages.length === 0 && !browseCat && (
              <>
                <GenieBubble>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#d8d8e0" }}>{greeting}</p>
                </GenieBubble>
                <div>
                  <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Browse by area</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CATEGORIES.map((c) => (
                      <button key={c.id} onClick={() => setBrowseCat(c.id)} style={chipStyle}>{c.label}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Category browse view */}
            {browseCat && (
              <div>
                <button onClick={() => setBrowseCat(null)} style={{ ...chipStyle, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
                  <ArrowLeft size={12} /> Back
                </button>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                  {CATEGORIES.find((c) => c.id === browseCat)?.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {categoryTopics.map((t) => (
                    <button key={t.id} onClick={() => pushTopic(t)} style={{ ...chipStyle, width: "100%" }}>{t.title}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation */}
            {messages.map((msg, i) => {
              if (msg.from === "user") {
                return (
                  <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", background: "#6366f1", color: "#fff", padding: "8px 12px", borderRadius: "14px 14px 4px 14px", fontSize: 13, lineHeight: 1.45 }}>
                    {msg.text}
                  </div>
                );
              }
              if (msg.kind === "topic") {
                const topic = topicById(msg.topicId);
                if (!topic) return null;
                const alsoSee = (msg.alsoSee || []).map(topicById).filter(Boolean);
                return (
                  <GenieBubble key={i}>
                    <AnswerBlock topic={topic} ctx={ctx} onPick={pushTopic} />
                    {alsoSee.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>You might also mean</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {alsoSee.map((r) => (
                            <button key={r.id} onClick={() => pushTopic(r)} style={chipStyle}>{r.title}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </GenieBubble>
                );
              }
              if (msg.kind === "nomatch") {
                const sugg = (msg.suggestions || []).map(topicById).filter(Boolean);
                return (
                  <GenieBubble key={i}>
                    <p style={{ margin: "0 0 6px", fontSize: 13, lineHeight: 1.55, color: "#d8d8e0" }}>
                      I don't have a saved answer for that one. Try rewording it, browse by area, or — for a brand-new capability — send it in as a wish (Sparkles menu) so the team can build it.
                    </p>
                    {sugg.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Closest topics</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {sugg.map((r) => (
                            <button key={r.id} onClick={() => pushTopic(r)} style={chipStyle}>{r.title}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </GenieBubble>
                );
              }
              return null;
            })}
          </div>

          {/* Live suggestions while typing */}
          {liveMatches.length > 0 && (
            <div style={{ borderTop: "1px solid #2a2a3a", background: "#14141c", maxHeight: 168, overflowY: "auto" }}>
              {liveMatches.map((r) => (
                <button
                  key={r.topic.id}
                  onClick={() => submitQuery(r.topic.title)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid #1f1f2a", color: "#c7c7d6", cursor: "pointer", textAlign: "left", fontSize: 12.5 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1f1f2a")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <Search size={12} style={{ color: "#666", flexShrink: 0 }} />
                  <span>{r.topic.title}</span>
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); submitQuery(); }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderTop: "1px solid #2a2a3a", background: "#1a1a24" }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question…"
              style={{ flex: 1, background: "#0f0f16", border: "1px solid #2a2a3a", borderRadius: 10, padding: "9px 12px", color: "#e0e0e0", fontSize: 13, outline: "none" }}
            />
            <button
              type="submit"
              disabled={!query.trim()}
              aria-label="Send"
              style={{ background: query.trim() ? "linear-gradient(135deg, #fbbf24, #d97706)" : "#2a2a3a", color: query.trim() ? "#000" : "#666", border: "none", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: query.trim() ? "pointer" : "default", flexShrink: 0 }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function GenieBubble({ children }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }} role="img" aria-hidden="true">🧞</span>
      <div style={{ flex: 1, background: "#1e1e2a", border: "1px solid #2a2a3a", borderRadius: "4px 14px 14px 14px", padding: "10px 12px" }}>
        {children}
      </div>
    </div>
  );
}
