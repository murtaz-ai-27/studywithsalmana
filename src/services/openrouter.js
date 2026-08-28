const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

const MODELS = [
  "openrouter/free",
  "z-ai/glm-5.2:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

export const modelShortName = (m) =>
  m === "openrouter/free" ? "Auto" : m.split("/").pop().replace(":free", "");

async function fetchWithTimeout(url, opts, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function callModel(model, messages) {
  let res;
  try {
    res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "https://studywithsalmana.vercel.app",
        "X-Title": "Study With Salmana",
      },
      body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 8000 }),
    });
  } catch (e) {
    return { ok: false, status: e.name === "AbortError" ? 408 : 0, error: e.message };
  }
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) return { ok: false, status: res.status, error: data?.error?.message || "API error" };
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text.trim()) return { ok: false, status: 204, error: "Empty" };
  return { ok: true, text };
}

function parseCards(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if (s !== -1 && e > s) {
    try {
      const arr = JSON.parse(clean.slice(s, e + 1));
      const cards = arr
        .filter(c => c?.front && c?.back)
        .map(c => ({ front: String(c.front).trim(), back: String(c.back).trim() }))
        .filter(c => c.front && c.back);
      if (cards.length > 0) return cards;
    } catch {}
  }
  return null;
}

async function runWithFallback(messages, onStatus) {
  for (const model of MODELS) {
    onStatus?.({ status: "trying", model });
    const r = await callModel(model, messages);
    if (r.ok) {
      const cards = parseCards(r.text);
      if (cards?.length > 0) { onStatus?.({ status: "ok", model }); return cards; }
    }
    if (r.status === 401 || r.status === 403) throw new Error("INVALID_KEY");
  }
  throw new Error("ALL_FAILED");
}

export function checkKey() {
  if (!API_KEY || API_KEY.includes("your-key") || !API_KEY.trim()) throw new Error("NO_KEY");
}

const li = (lang) => lang === "English"
  ? "Write all content in English."
  : `Write ALL content in ${lang}. Use English only for proper nouns.`;

export async function generateFromTopic(topic, count, lang, onStatus) {
  checkKey();
  return runWithFallback([{ role: "user", content:
    `Create exactly ${count} flashcards about: "${topic}"
Return ONLY a JSON array. No markdown. [{"front":"...","back":"..."},...]
front: max 15 words. back: max 40 words. ${li(lang)}
Start with [ end with ]` }], onStatus);
}

export async function generateFromText(text, count, lang, onStatus) {
  checkKey();
  return runWithFallback([
    { role: "system", content: `Expert study assistant. Create exam-ready flashcards. front max 15 words, back max 50 words. ${li(lang)} Return ONLY JSON array starting with [. No markdown.` },
    { role: "user", content: `Create exactly ${count} flashcards:\n---\n${text.slice(0,35000)}\n---\nJSON only:` }
  ], onStatus);
}
