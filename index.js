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
   🚫 BLOCKLIST (SAFE HARD)
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
   🚫 BLOCK SAFE (NO DEAD BOT)
========================= */
function isBlocked(text) {
  const words = normalize(text).split(" ");
  return BLOCKED.some(b => words.includes(b));
}

/* =========================
   🧭 INTENT
========================= */
function classifyIntent(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("vẽ") || t.includes("ảnh")) return "IMAGE";
  if (t.includes("so sánh") || t.includes("gpu") || t.includes("cpu")) return "TECH";
  if (t.includes("giá") || t.includes("mua")) return "TECH";

  return "CHAT";
}

/* =========================
   🤖 OPENROUTER (RETRY 3 LẦN)
========================= */
async function askAI(prompt, retry = 3) {
  for (let i = 0; i < retry; i++) {
    try {
      const res = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "mistralai/mistral-7b-instruct",
          messages: [
            {
              role: "system",
              content: "Bạn là AI công nghệ. Trả lời ngắn gọn, chính xác."
            },
            { role: "user", content: prompt }
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
      console.log("AI retry:", i + 1);
    }
  }

  return "❌ AI tạm thời không phản hồi";
}

/* =========================
   🔎 SEARCH
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
   📰 NEWS
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
   🎨 IMAGE AI
========================= */
async function generateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: `${prompt}, ultra detailed, 4k` },
      {
        headers: {
          Authorization: `Bearer ${HF_KEY}`
        },
        responseType: "arraybuffer",
        timeout: 30000
      }
    );

    return Buffer.from(res.data).toString("base64");
  } catch {
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
Dữ liệu thực tế:
NEWS: ${JSON.stringify(news)}
SEARCH: ${JSON.stringify(search)}

Câu hỏi: ${text}

Yêu cầu:
- phân tích thực tế
- không bịa
- so sánh rõ ràng
`;

  return await askAI(prompt);
}

/* =========================
   🚀 CORE ENGINE
========================= */
async function handleUser(text) {

  // 🚫 BLOCK nhưng KHÔNG kill bot
  if (isBlocked(text)) {
    return "❌ Nội dung không được hỗ trợ";
  }

  const intent = classifyIntent(text);

  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo ảnh được";
    return { type: "image", data: img };
  }

  if (intent === "TECH") {
    return await handleTech(text);
  }

  return await askAI(text);
}

/* =========================
   🌐 WEBHOOK LINE FIXED
========================= */
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    if (!events || !Array.isArray(events)) {
      return res.sendStatus(200);
    }

    const event = events[0];
    const text = event?.message?.text;

    if (!text) return res.sendStatus(200);

    const result = await handleUser(text);

    if (!result) return res.sendStatus(200);

    if (typeof result === "object" && result.type === "image") {
      return res.json({
        type: "image",
        data: result.data
      });
    }

    return res.json({
      type: "text",
      message: result
    });

  } catch (e) {
    console.log("WEBHOOK ERROR:", e);
    return res.sendStatus(200);
  }
});

/* ========================= */
app.listen(3000, () => {
  console.log("🚀 V38 STABLE PRODUCTION RUNNING");
});