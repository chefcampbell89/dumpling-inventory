// GENIE API VERSION: v1
// ============================================================
// Ops Genie — Haiku conversational fallback (server-side)
// ============================================================
//
// Vercel serverless function. This is the ONLY place the Anthropic
// API key lives — it is read from process.env.ANTHROPIC_API_KEY and
// never reaches the browser.
//
// READ-ONLY BY DESIGN: this endpoint gives Claude NO tools, NO database
// access, and no write path of anything. It can only return text that
// explains how to use the app. The system prompt also forbids it from
// claiming to make changes. The separate admin "make-the-change" bot is
// a future, isolated system — not this one.
//
// Cost shape: Claude Haiku 4.5 with prompt caching. The large, stable
// knowledge base + instructions live in one cached system block (Haiku's
// minimum cacheable prefix is 4096 tokens). The per-request question,
// short history, and live context go in `messages`, after the cache
// breakpoint, so the expensive prefix is cached and reused.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { TOPICS } from "../src/helpContent.js";

const MODEL = process.env.GENIE_MODEL || "claude-haiku-4-5";

// --- Build the knowledge base ONCE at module load (stable → cacheable) ---
// Answers may be functions of ctx; resolve with a neutral, admin-inclusive
// context so the KB text is fixed (and so it mentions admin-only actions).
function resolveAnswer(t) {
  try {
    return typeof t.answer === "function"
      ? t.answer({ appName: "the app", isAdmin: true, lowStockCount: null })
      : t.answer;
  } catch {
    return typeof t.answer === "string" ? t.answer : "";
  }
}

function topicToText(t) {
  let s = `## ${t.title}\n${resolveAnswer(t)}`;
  if (Array.isArray(t.steps) && t.steps.length) {
    s += "\n" + t.steps.map((x, i) => `${i + 1}. ${x}`).join("\n");
  }
  return s;
}

const KNOWLEDGE_BASE = TOPICS.map(topicToText).join("\n\n");

const SYSTEM_INSTRUCTIONS = `You are the help genie for an inventory and production management web app for a dumpling factory. You are a friendly, concise in-app help assistant for restaurant/factory staff.

STRICT RULES — these are absolute:
- You can ONLY explain how to use the app and why things appear the way they do. You cannot make changes, run actions, edit data, access the database, or see anything beyond what is provided to you in this conversation. You have no tools.
- NEVER claim to have changed, created, deleted, scheduled, or fixed anything. You only give guidance.
- If the user asks you to DO something (make a change, build a feature, automate a workflow), explain that you can't make changes, and suggest they use the in-app "wish" feature (the Sparkles / "Grant My Wish" option) to request it from the team.
- Base your answers ONLY on the KNOWLEDGE BASE below. If it does not cover the question, say you're not certain and suggest contacting their team or submitting a wish — do NOT invent features, tabs, buttons, or behavior that aren't described.

STYLE:
- Be concise and practical. Plain language, no jargon. Use short numbered steps for how-to answers.
- Refer to the app by the name given in the live context. Tailor "admin-only" caveats to whether the user is an admin (given in the live context).
- A few sentences is usually plenty.

KNOWLEDGE BASE (everything the app actually does):

${KNOWLEDGE_BASE}`;

// Reuse the client across warm invocations.
let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "Assistant not configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const question = String(body.question || "").trim().slice(0, 1000);
    if (!question) {
      res.status(400).json({ error: "Missing question" });
      return;
    }

    const ctx = body.context || {};
    const appName = String(ctx.appName || "the app").slice(0, 80);
    const isAdmin = !!ctx.isAdmin;
    const lowStockCount =
      typeof ctx.lowStockCount === "number" ? ctx.lowStockCount : null;

    // Short prior history (text only): [{ role: 'user'|'assistant', content }]
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const priorTurns = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    const liveContext =
      `Live context — app name: "${appName}". ` +
      `The user ${isAdmin ? "IS an admin (mention admin-only actions as available to them)" : "is NOT an admin (note when something is admin-only)"}.` +
      (lowStockCount !== null ? ` There are currently ${lowStockCount} item(s) at or below minimum stock.` : "");

    const messages = [
      ...priorTurns,
      { role: "user", content: `${liveContext}\n\nQuestion: ${question}` },
    ];

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_INSTRUCTIONS,
          cache_control: { type: "ephemeral" }, // caches the whole stable prefix
        },
      ],
      messages,
    });

    const answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    res.status(200).json({
      answer: answer || "I'm not sure about that one — try rephrasing, or submit it as a wish for the team.",
    });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({ error: "Assistant unavailable" });
  }
}
