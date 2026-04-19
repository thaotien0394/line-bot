
const express = require("express");
const axios = require("axios");
const line = require("@line/bot-sdk");

const app = express();
app.use(express.json());

// =========================
// 🔐 LINE CONFIG
// =========================
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// =========================
// 🚫 BLOCKLIST SILENT
// =========================
const BLOCKLIST = new Set([
  "KEY","RS","CTKM","MT","HD","BOT",
  "LAPTOP","MÙA NÓNG","PV","8NTTT",
  "TRACHAM","BB","CAMERA"
]);

function isBlocked(text) {
  return BLOCKLIST.has(text.toUpperCase().trim());
}

// =========================
// 🧹 CLEAN LINE TEXT
// =========================
function clean(text) {
  return text
    .toString()
    .normalize("NFC")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .trim();
}

// =========================
// ⚡ DETECT REALTIME NEED
// =========================
function isRealtimeQuery(text) {
  const t = text.toLowerCase();

  return (
    t.includes("hôm nay") ||
    t.includes("mới nhất") ||
    t.includes("hiện tại") ||
    t.includes("giá") ||
    t.includes("tin") ||
    t.includes("update") ||
    t.includes("2026") ||
    t.includes("now")
  );
}

// =========================
// 🧠 INTENT ENGINE
// =========================
function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("so sánh")) return "COMPARE";
  if (t.includes("vẽ") || t.includes("image")) return "IMAGE";
  if (t.includes("video")) return "VIDEO";
  if (t.includes("tin")) return "NEWS";

  return "CHAT";
}

// =========================
// 🌐 TAVILY REALTIME SEARCH (FAST FIX)
// =========================
async function webSearch(query) {
  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: process.env.TAVILY_KEY,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 3
    });

    return res.data.answer || "";
  } catch {
    return "";
  }
}

// =========================
// 📰 NEWS REALTIME (NEWSDATA)
// =========================
async function getNews(query) {
  try {
    const res = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${process.env.NEWSDATA_KEY}&q=${query}&language=vi`
    );

    return res.data.results?.slice(0, 3)
      .map(n => `• ${n.title}`)
      .join("\n") || "";
  } catch {
    return "";
  }
}

// =========================
// 🎨 IMAGE AI (STABILITY - FAST QUEUE FIX)
// =========================
async function generateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api.stability.ai/v1/generation/stable-diffusion-v1-6/text-to-image",
      {
        text_prompts: [{ text: prompt }],
        cfg_scale: 7,
        steps: 25
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STABILITY_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return "🎨 Ảnh đã tạo xong (Stable Diffusion)";
  } catch {
    return "⚠️ Không tạo được ảnh (API lỗi)";
  }
}

// =========================
// 🎬 VIDEO AI (REPLICATE FAST MODE)
// =========================
async function generateVideo(prompt) {
  try {
    const res = await axios.post(
      "https://api.replicate.com/v1/predictions",
      {
        version: "latest",
        input: { prompt }
      },
      {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_KEY}`
        }
      }
    );

    return "🎬 Video đang xử lý (Replicate)";
  } catch {
    return "⚠️ Video không khả dụng";
  }
}

// =========================
// ⚡ GROQ FAST AI
// =========================
async function groqAI(message) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [{ role: "user", content: message }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content;
}

// =========================
// 🧠 OPENROUTER DEEP AI
// =========================
async function openrouterAI(message, context) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
AI V70 SYSTEM

QUY TẮC:
- logic rõ ràng
- không lan man
- ưu tiên dữ liệu realtime

DATA:
${context}
          `
        },
        { role: "user", content: message }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content;
}

// =========================
// 🧠 AI ENGINE (V70 CORE)
// =========================
async function AI_ENGINE(message) {

  const intent = detectIntent(message);
  const realtime = isRealtimeQuery(message);

  let context = "";

  // 🌐 realtime forced search
  if (realtime) {
    context = await webSearch(message);
  }

  // 📰 NEWS
  if (intent === "NEWS") {
    const news = await getNews(message);
    return clean(`📊 TIN MỚI NHẤT:\n${news}`);
  }

  // 🎨 IMAGE FAST FIX
  if (intent === "IMAGE") {
    return await generateImage(message);
  }

  // 🎬 VIDEO FAST FIX
  if (intent === "VIDEO") {
    return await generateVideo(message);
  }

  // ⚡ FAST MODE
  if (message.length < 120) {
    try {
      return clean(await groqAI(message));
    } catch {}
  }

  // 🧠 DEEP MODE
  try {
    const res = await openrouterAI(message, context);
    return clean(res);
  } catch {
    return clean("⚠️ AI đang bảo trì, thử lại sau");
  }
}

// =========================
// 🚫 BLOCK HANDLER
// =========================
async function handleMessage(text) {
  if (isBlocked(text)) return null;
  return await AI_ENGINE(text);
}

// =========================
// 🌐 LINE WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events;

  for (let event of events) {
    if (event.type !== "message") continue;

    const text = event.message.text;

    const reply = await handleMessage(text);

    if (!reply) continue;

    await client.replyMessage(event.replyToken, {
      type: "text",
      text: clean(reply)
    });
  }

  res.sendStatus(200);
});

// =========================
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 THẢO THẢO PRO ");
});