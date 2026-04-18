const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   🔑 API KEYS
========================= */
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const NEWSDATA_KEY = process.env.NEWSDATA_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const HF_KEY = process.env.HF_KEY;

/* =========================
   🚫 BLOCKLIST SAFE
========================= */
const BLOCKED = [
  "RS","CTKM","8NTTT","HD","MT","BOT",
  "LAPTOP","MÙA NÓNG","CAMERA","PV",
  "BB","TRACHAM","KEY"
];

/* =========================
   🧹 NORMALIZE
========================= */
function normalize(text) {
  return (text || "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   🚫 BLOCK SAFE (NO NULL FLOW)
========================= */
function isBlocked(text) {
  const words = normalize(text).split(" ");
  return BLOCKED.some(b => words.includes(b));
}

/* =========================
   🧭 INTENT DETECT
========================= */
function classifyIntent(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("vẽ") || t.includes("ảnh")) return "IMAGE";
  if (t.includes("so sánh") || t.includes("gpu") || t.includes("cpu")) return "TECH";
  if (t.includes("giá") || t.includes("mua")) return "TECH";

  return "CHAT";
}

/* =========================
   🔎 GOOGLE SEARCH
========================= */
async function searchGoogle(query) {
  try {
    const res = await axios.get(
      `https://serpapi.com/search.json?q=${query}&api_key=${SERPAPI_KEY}`
    );

    return res.data.organic_results?.slice(0, 5) || [];
  } catch (e) {
    console.log("SEARCH ERROR:", e.message);
    return [];
  }
}

/* =========================
   📰 NEWS
========================= */
async function getNews(query) {
  try {
    const res = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&q=${query}`
    );

    return res.data.results?.slice(0, 5) || [];
  } catch (e) {
    console.log("NEWS ERROR:", e.message);
    return [];
  }
}

/* =========================
   🤖 OPENROUTER (SAFE + RETRY)
========================= */
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content: "Bạn là AI công nghệ. Trả lời rõ ràng, không bịa."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`
        },
        timeout: 15000
      }
    );

    return res.data.choices?.[0]?.message?.content || "❌ Không có phản hồi AI";
  } catch (e) {
    console.log("AI ERROR:", e.message);
    return "❌ AI đang bận, thử lại sau";
  }
}

/* =========================
   🎨 IMAGE AI
========================= */
async function generateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: `${prompt}, ultra detailed` },
      {
        headers: {
          Authorization: `Bearer ${HF_KEY}`
        },
        responseType: "arraybuffer",
        timeout: 30000
      }
    );

    return Buffer.from(res.data).toString("base64");
  } catch (e) {
    console.log("IMAGE ERROR:", e.message);
    return null;
  }
}

/* =========================
   🧠 TECH ENGINE
========================= */
async function handleTech(text) {
  const [news, search] = await Promise.all([
    getNews(text),
    searchGoogle(text)
  ]);

  const prompt = `
REAL DATA:
NEWS: ${JSON.stringify(news)}
SEARCH: ${JSON.stringify(search)}

QUESTION:
${text}

TASK:
- phân tích thực tế
- không bịa
- so sánh rõ ràng
`;

  return await askAI(prompt);
}

/* =========================
   🚀 CORE ENGINE (NO NULL DEAD FLOW)
========================= */
async function handleUser(text) {

  console.log("👉 USER INPUT:", text);

  if (!text) return "❌ Không có nội dung";

  // 🚫 BLOCK SAFE
  if (isBlocked(text)) {
    console.log("🚫 BLOCKED:", text);
    return "❌ Nội dung không được hỗ trợ";
  }

  const intent = classifyIntent(text);
  console.log("🧭 INTENT:", intent);

  // 🎨 IMAGE
  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo ảnh được";

    return {
      type: "image",
      data: img
    };
  }

  // 🧠 TECH
  if (intent === "TECH") {
    return await handleTech(text);
  }

  // 💬 CHAT DEFAULT
  return await askAI(text);
}

/* =========================
   🌐 WEBHOOK FIXED (LINE SAFE)
========================= */
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 RAW BODY:", JSON.stringify(req.body));

    const event = req.body.events?.[0];

    const text = event?.message?.text;
    const userId = event?.source?.userId;

    console.log("👤 USER:", userId);
    console.log("💬 TEXT:", text);

    if (!text) {
      console.log("⚠️ NO TEXT");
      return res.sendStatus(200);
    }

    const result = await handleUser(text);

    console.log("📤 RESULT:", result);

    // ❗ NEVER SILENT
    if (!result) {
      return res.json({
        type: "text",
        message: "❌ Không xử lý được yêu cầu"
      });
    }

    // 🎨 IMAGE
    if (typeof result === "object" && result.type === "image") {
      return res.json({
        type: "image",
        data: result.data
      });
    }

    // 💬 TEXT
    return res.json({
      type: "text",
      message: result
    });

  } catch (e) {
    console.log("💥 WEBHOOK ERROR:", e);
    return res.sendStatus(200);
  }
});

/* ========================= */
app.listen(3000, () => {
  console.log("🚀 V38 DEBUG STABLE RUNNING");
});