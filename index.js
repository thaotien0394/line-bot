const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔐 LẤY TỪ RAILWAY VARIABLES
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 🔥 LOG KIỂM TRA
console.log("KEY:", GEMINI_API_KEY ? "OK" : "MISSING");
console.log("LINE TOKEN:", CHANNEL_ACCESS_TOKEN ? "OK" : "MISSING");

// ⚙️ CONFIG
const DAILY_LIMIT = 10;
const COOLDOWN = 5000;
const MAX_USERS = 20;

// 🧠 RAM
const userUsage = {};
const allowedUsers = new Set();

// ==========================
// 🧠 CHECK USER
// ==========================
function checkUser(userId) {
  const today = new Date().toISOString().slice(0, 10);

  if (!allowedUsers.has(userId)) {
    if (allowedUsers.size >= MAX_USERS) {
      return { ok: false, msg: "🚫 Bot đã đủ 20 người dùng" };
    }
    allowedUsers.add(userId);
  }

  if (!userUsage[userId]) {
    userUsage[userId] = {
      count: 0,
      date: today,
      lastTime: 0
    };
  }

  const user = userUsage[userId];

  if (user.date !== today) {
    user.count = 0;
    user.date = today;
  }

  const now = Date.now();
  if (now - user.lastTime < COOLDOWN) {
    return { ok: false, msg: "⏳ Đợi 5 giây rồi hỏi tiếp" };
  }

  if (user.count >= DAILY_LIMIT) {
    return { ok: false, msg: "🚫 Hết lượt hôm nay" };
  }

  user.count++;
  user.lastTime = now;

  return { ok: true };
}

// ==========================
// 🤖 GEMINI
// ==========================
async function askGemini(text) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text }] }]
      }
    );

    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Không có phản hồi";
  } catch (err) {
    console.error("❌ Gemini:", err.response?.data || err.message);
    return "⚠️ AI lỗi hoặc hết quota";
  }
}

// ==========================
// 📩 LINE
// ==========================
async function replyLine(replyToken, text) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [{ type: "text", text }],
      },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("❌ LINE:", err.response?.data || err.message);
  }
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const replyToken = event.replyToken;
      const text = event.message.text;

      console.log("👤 User:", text);

      const check = checkUser(userId);
      if (!check.ok) {
        await replyLine(replyToken, check.msg);
        continue;
      }

      const ai = await askGemini(text);

      console.log("🤖 AI:", ai);

      await replyLine(replyToken, ai);
    }
  }

  res.sendStatus(200);
});

// ==========================
// 🚀 START
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server chạy port " + PORT);
});