require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 ENV
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;
const WEATHER_KEY = process.env.WEATHER_KEY;
const NEWS_KEY = process.env.NEWS_KEY;

// ==========================
// 🧠 MEMORY
// ==========================
let userMemory = {};

function saveMemory(userId, text) {
  if (!userMemory[userId]) {
    userMemory[userId] = { history: [] };
  }

  userMemory[userId].history.push(text);

  if (userMemory[userId].history.length > 10) {
    userMemory[userId].history.shift();
  }
}

function getContext(userId) {
  if (!userMemory[userId]) return "";

  return userMemory[userId].history.join("\n");
}

// ==========================
// 🚫 ANTI SPAM
// ==========================
let cooldown = {};

function isSpam(userId) {
  const now = Date.now();

  if (!cooldown[userId]) {
    cooldown[userId] = now;
    return false;
  }

  if (now - cooldown[userId] < 800) return true;

  cooldown[userId] = now;
  return false;
}

// ==========================
// 🧠 INTENT HYBRID
// ==========================
function detectIntentLocal(text) {
  const t = text.toLowerCase();

  if (t.includes("vẽ") || t.includes("ảnh") || t.includes("hình"))
    return "IMAGE";

  if (t.includes("thời tiết") || t.includes("hôm nay"))
    return "REALTIME";

  if (
    t.includes("là gì") ||
    t.includes("ở đâu") ||
    t.includes("bao nhiêu") ||
    t.includes("tin")
  )
    return "SEARCH";

  return "CHAT";
}

async function detectIntentAI(text) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Trả JSON: {"intent":"CHAT|IMAGE|REALTIME|SEARCH"}`
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENROUTER_KEY}` }
      }
    );

    const content = res.data.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) return "CHAT";

    return JSON.parse(match[0]).intent || "CHAT";
  } catch {
    return "CHAT";
  }
}

// ==========================
// 🤖 AI CHAT (CÓ FALLBACK)
// ==========================
async function askAI(text, userId) {
  const context = getContext(userId);

  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Trả lời tiếng Việt.\nContext:\n${context}`
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENROUTER_KEY}` }
      }
    );

    return res.data.choices[0].message.content;

  } catch (e) {
    console.log("AI ERROR:", e.message);
    return "⚠️ AI đang bận, thử lại sau";
  }
}

// ==========================
// 🔎 GOOGLE SEARCH
// ==========================
async function googleSearch(query) {
  try {
    const res = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: query,
        api_key: SERP_API_KEY,
        hl: "vi"
      }
    });

    let text = "";

    if (res.data.answer_box?.snippet) {
      text += "📌 " + res.data.answer_box.snippet + "\n\n";
    }

    const results = res.data.organic_results.slice(0, 3);

    text += results.map(r =>
      `🔎 ${r.title}\n${r.snippet}`
    ).join("\n\n");

    return text;

  } catch {
    return null;
  }
}

async function searchAndAnswer(query, userId) {
  const data = await googleSearch(query);

  if (!data) return await askAI(query, userId);

  return await askAI(`Tóm tắt:\n${data}`, userId);
}

// ==========================
// 🌤️ REALTIME
// ==========================
async function realtimeHandler(text) {
  if (text.includes("thời tiết")) {
    try {
      const res = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=Can Tho&appid=${WEATHER_KEY}&units=metric&lang=vi`
      );

      return `🌤️ Cần Thơ
Nhiệt độ: ${res.data.main.temp}°C
${res.data.weather[0].description}`;
    } catch {
      return "⚠️ Lỗi thời tiết";
    }
  }

  return "⚠️ Không có dữ liệu realtime";
}

// ==========================
// 🎨 IMAGE
// ==========================
function imageUrl(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
}

// ==========================
// 📩 LINE API
// ==========================
async function replyLine(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` }
    }
  );
}

async function pushLine(userId, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: userId, messages },
    {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` }
    }
  );
}

// ==========================
// 🚀 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  for (const event of req.body.events || []) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text;
      const userId = event.source.userId;
      const replyToken = event.replyToken;

      if (isSpam(userId)) continue;

      saveMemory(userId, text);

      // 🧠 INTENT
      const local = detectIntentLocal(text);
      const ai = await detectIntentAI(text);
      const intent = local !== "CHAT" ? local : ai;

      // 🎨 IMAGE
      if (intent === "IMAGE") {
        const url = imageUrl(text);

        await replyLine(replyToken, [
          { type: "image", originalContentUrl: url, previewImageUrl: url }
        ]);
        continue;
      }

      // 🌐 REALTIME
      if (intent === "REALTIME") {
        const data = await realtimeHandler(text);

        await replyLine(replyToken, [
          { type: "text", text: data }
        ]);
        continue;
      }

      // 🔎 SEARCH
      if (intent === "SEARCH") {
        await replyLine(replyToken, [
          { type: "text", text: "🔎 Đang tìm..." }
        ]);

        const result = await searchAndAnswer(text, userId);

        await pushLine(userId, [
          { type: "text", text: result }
        ]);
        continue;
      }

      // 💬 CHAT
      const aiReply = await askAI(text, userId);

      await replyLine(replyToken, [
        { type: "text", text: aiReply }
      ]);

    } catch (err) {
      console.log("ERROR:", err.message);
    }
  }
});

// ==========================
// 🚀 START
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V26 TRUE AI RUNNING");
});