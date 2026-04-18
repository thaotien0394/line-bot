const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   🔑 API KEYS
========================= */
const CHANNEL_TOKEN = process.env.CHANNEL_TOKEN;

const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const NEWSDATA_KEY = process.env.NEWSDATA_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

const HF_KEY = process.env.HF_KEY;
const STABILITY_KEY = process.env.STABILITY_KEY;
const REPLICATE_KEY = process.env.REPLICATE_KEY;

/* =========================
   🚫 BLOCKLIST (HARD SAFE)
========================= */
const BLOCKED = [
  "RS","CTKM","8NTTT","HD","MT","BOT",
  "LAPTOP","MÙA NÓNG","CAMERA","PV",
  "BB","TRACHAM","KEY"
];

function normalize(text) {
  return text
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlocked(text) {
  const input = normalize(text);
  return BLOCKED.some(b => new RegExp(`\\b${b}\\b`, "u").test(input));
}

/* =========================
   🧭 INTENT DETECT
========================= */
function classifyIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("vẽ") || t.includes("ảnh") || t.includes("draw")) return "IMAGE";
  if (t.includes("so sánh") || t.includes("vs") || t.includes("gpu") || t.includes("cpu")) return "TECH";
  if (t.includes("giá") || t.includes("mua") || t.includes("bao nhiêu")) return "PRICE";
  if (t.includes("tìm") || t.includes("search")) return "SEARCH";

  return "CHAT";
}

/* =========================
   🧠 OPENROUTER AI
========================= */
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { role: "system", content: "Bạn là AI công nghệ. Không bịa dữ liệu." },
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch {
    return "❌ AI lỗi";
  }
}

/* =========================
   🔎 SERP GOOGLE REALTIME
========================= */
async function searchGoogle(query) {
  try {
    const res = await axios.get(
      `https://serpapi.com/search.json?q=${query}&api_key=${SERPAPI_KEY}`
    );

    return res.data.organic_results?.slice(0, 5) || [];
  } catch {
    return [];
  }
}

/* =========================
   📰 NEWS REALTIME
========================= */
async function getNews(query) {
  try {
    const res = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&q=${query}`
    );

    return res.data.results?.slice(0, 5) || [];
  } catch {
    return [];
  }
}

/* =========================
   🎨 IMAGE ENGINE (MULTI)
========================= */

// HF
async function hfImage(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: `${prompt}, ultra detailed` },
      {
        headers: { Authorization: `Bearer ${HF_KEY}` },
        responseType: "arraybuffer"
      }
    );

    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

/* =========================
   🧠 TECH ENGINE (REAL DATA + AI)
========================= */
async function handleTech(query) {

  const [news, search] = await Promise.all([
    getNews(query),
    searchGoogle(query)
  ]);

  const prompt = `
REAL DATA NEWS:
${JSON.stringify(news)}

GOOGLE RESULTS:
${JSON.stringify(search)}

QUESTION:
${query}

TASK:
- phân tích
- so sánh
- kết luận thực tế
`;

  return await askAI(prompt);
}

/* =========================
   🎨 IMAGE ROUTER
========================= */
async function handleImage(prompt) {
  const img = await hfImage(prompt);
  if (!img) return "❌ Không tạo ảnh";

  return {
    type: "image",
    data: img.toString("base64")
  };
}

/* =========================
   🚀 MAIN ENGINE
========================= */
async function handleUser(userId, text) {

  // 🚫 BLOCK HARD
  if (isBlocked(text)) return null;

  const intent = classifyIntent(text);

  // 🎨 IMAGE
  if (intent === "IMAGE") {
    return await handleImage(text);
  }

  // 🔎 SEARCH
  if (intent === "SEARCH") {
    const data = await searchGoogle(text);
    return await askAI(`Tóm tắt kết quả: ${JSON.stringify(data)}`);
  }

  // 🧠 TECH / PRICE
  if (intent === "TECH" || intent === "PRICE") {
    return await handleTech(text);
  }

  // 💬 CHAT
  return await askAI(text);
}

/* =========================
   🌐 WEBHOOK LINE BOT
========================= */
app.post("/webhook", async (req, res) => {
  const { userId, message } = req.body;

  const result = await handleUser(userId, message);

  if (!result) return res.sendStatus(200);

  if (typeof result === "object" && result.type === "image") {
    return res.json(result);
  }

  return res.json({
    type: "text",
    message: result
  });
});

/* ========================= */
app.listen(3000, () =>
  console.log("🚀 V37 FULL SYSTEM RUNNING")
);