const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔐 ENV
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!CHANNEL_ACCESS_TOKEN || !GEMINI_API_KEY) {
  console.error("❌ Thiếu ENV!");
}

// 🧠 Gọi Gemini FREE
async function askGemini(prompt) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Trả lời ngắn gọn, dễ hiểu bằng tiếng Việt:\n${prompt}`,
              },
            ],
          },
        ],
      }
    );

    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "Không có phản hồi 😢";
  } catch (err) {
    console.error("Gemini error:", err.response?.data || err.message);
    return "AI đang bận 😢";
  }
}

// 📩 Webhook LINE
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  await Promise.all(
    events.map(async (event) => {
      if (event.type === "message" && event.message.type === "text") {
        const replyToken = event.replyToken;
        const userMessage = event.message.text;

        console.log("📩 User:", userMessage);

        // 🛑 chống spam (delay 1s)
        await new Promise((r) => setTimeout(r, 1000));

        const replyText = await askGemini(userMessage);

        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken,
            messages: [{ type: "text", text: replyText }],
          },
          {
            headers: {
              Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );
      }
    })
  );

  res.sendStatus(200);
});

// 🌐 Test server
app.get("/", (req, res) => {
  res.send("✅ Gemini LINE Bot đang chạy!");
});

// 🚀 Start server
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running...");
});