const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔐 TOKEN LINE
const CHANNEL_ACCESS_TOKEN = "z3BfktkVc/IK6DwdhU6C6OhMgLqBRZlehEQGppxWo8lIF/nINJ2Z2axlkLc4Hk8wmQJiQzefvseH4UedcsfSE6zqL2oVp8yH8XzvHkP2SalmlpfDYU0Pe24RjL7HUFottPdyvq9lgva16ugm1GKpiQdB04t89/1O/w1cDnyilFU=";

// 🔐 GEMINI API KEY (FREE từ AI Studio)
const GEMINI_API_KEY = "AIzaSyA752UvdiN5OJ-6rhOzZ1GiNbFgAnzyW0M";

// ⚙️ CONFIG
const DAILY_LIMIT = 10; // 10 câu/ngày
const COOLDOWN = 5000; // 5 giây chống spam
const MAX_USERS = 20;

// 🧠 Lưu dữ liệu RAM
const userUsage = {};
const allowedUsers = new Set();

// ==========================
// 🚀 DEBUG (rất quan trọng)
// ==========================
console.log("🚀 ĐANG CHẠY CODE GEMINI MỚI");

// ==========================
// 🧠 KIỂM TRA USER
// ==========================
function checkUser(userId) {
  const today = new Date().toISOString().slice(0, 10);

  // giới hạn 20 user
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

  // reset mỗi ngày
  if (user.date !== today) {
    user.count = 0;
    user.date = today;
  }

  // chống spam
  const now = Date.now();
  if (now - user.lastTime < COOLDOWN) {
    return { ok: false, msg: "⏳ Đợi 5 giây rồi hỏi tiếp" };
  }

  // hết lượt
  if (user.count >= DAILY_LIMIT) {
    return { ok: false, msg: "🚫 Hết 10 câu hôm nay" };
  }

  user.count++;
  user.lastTime = now;

  return { ok: true };
}

// ==========================
// 🤖 GỌI GEMINI FREE
// ==========================
async function askGemini(text) {
  try {
const res = await axios.post(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
  {
    contents: [
      {
        parts: [{ text }]
      }
    ]
  }
);

    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Không có phản hồi";
  } catch (err) {
    console.error("❌ Gemini lỗi:", err.response?.data || err.message);
    return "⚠️ AI lỗi, thử lại sau";
  }
}

// ==========================
// 📩 GỬI LINE
// ==========================
async function replyLine(replyToken, text) {
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
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const replyToken = event.replyToken;
      const userText = event.message.text;

      console.log("👤 User:", userText);

      // kiểm tra user
      const check = checkUser(userId);
      if (!check.ok) {
        await replyLine(replyToken, check.msg);
        continue;
      }

      // gọi AI
      const aiText = await askGemini(userText);

      console.log("🤖 AI:", aiText);

      // trả về LINE
      await replyLine(replyToken, aiText);
    }
  }

  res.sendStatus(200);
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server chạy port " + PORT);
});