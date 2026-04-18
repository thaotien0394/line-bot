const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   🔑 API KEYS
========================= */
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const HF_KEY = process.env.HF_KEY;
const NEWSDATA_KEY = process.env.NEWSDATA_KEY;

/* =========================
   🚫 BLOCKLIST (HARD)
========================= */
const BLOCKED = [
  "RS",
  "CTKM",
  "8NTTT",
  "HD",
  "MT",
  "BOT",
  "LAPTOP",
  "MÙA NÓNG",
  "CAMERA",
  "PV",
  "BB",
  "TRACHAM",
  "KEY"
];

/* =========================
   🧹 CLEAN TEXT
========================= */
function cleanText(text) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9À-Ỹ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   🚫 HARD BLOCK CHECK
   - CHỈ MATCH CHÍNH XÁC TỪ
========================= */
function isBlocked(text) {
  const words = cleanText(text).split(" ");

  return BLOCKED.some(block => {
    return words.includes(block);
  });
}

/* =========================
   🧭 INTENT
========================= */
function classifyIntent(text) {
  if (/vẽ|ảnh|image|draw|mockup/i.test(text)) return "IMAGE";
  if (/so sánh|vs|RTX|GPU|CPU|laptop/i.test(text)) return "TECH";
  if (/giá|bao nhiêu|mua|deal/i.test(text)) return "PRICE";
  return "CHAT";
}

/* =========================
   📰 REALTIME NEWS
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
   🤖 OPENROUTER AI
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
            content:
              "Bạn là AI công nghệ. Trả lời rõ ràng, không bịa dữ liệu."
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
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (e) {
    return "❌ AI error";
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
        responseType: "arraybuffer"
      }
    );

    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

/* =========================
   🧠 TECH ENGINE
========================= */
async function handleTech(query) {
  const news = await getNews(query);

  const prompt = `
Dữ liệu realtime:
${JSON.stringify(news)}

Câu hỏi:
${query}

Yêu cầu:
- phân tích rõ ràng
- không bịa dữ liệu
- so sánh theo thực tế
`;

  return await askAI(prompt);
}

/* =========================
   🚀 MAIN ENGINE
========================= */
async function handleUser(userId, text) {

  /* 🚫 HARD BLOCK */
  if (isBlocked(text)) {
    return null; // IM LẶNG HOÀN TOÀN
  }

  const intent = classifyIntent(text);

  /* 🎨 IMAGE */
  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo ảnh được";

    return {
      type: "image",
      data: img.toString("base64")
    };
  }

  /* 🧠 TECH / PRICE */
  if (intent === "TECH" || intent === "PRICE") {
    return await handleTech(text);
  }

  /* 💬 CHAT */
  return await askAI(text);
}

/* =========================
   🌐 WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  const { userId, message } = req.body;

  const result = await handleUser(userId, message);

  /* 🚫 silent */
  if (!result) return res.sendStatus(200);

  /* 🎨 image */
  if (typeof result === "object" && result.type === "image") {
    return res.json(result);
  }

  /* 💬 text */
  return res.json({
    type: "text",
    message: result
  });
});

/* ========================= */
app.listen(3000, () =>
  console.log("🚀 V36 HARD BLOCK SYSTEM RUNNING")
);