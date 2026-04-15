const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔐 ENV
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!CHANNEL_ACCESS_TOKEN || !DEEPSEEK_API_KEY) {
  console.error("❌ Thiếu ENV!");
}

// 🧠 Gọi DeepSeek (giống OpenAI)
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: `Trả lời ngắn gọn bằng tiếng Việt:\n${prompt}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.data.choices?.[0]?.message?.content || "Không có phản hồi 😢";
  } catch (err) {
    console.error("❌ DeepSeek error:", err.response?.data || err.message);
    return "AI đang bận 😢";
  }
}

// 📩 Webhook LINE
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  await Promise.all(
    events.map(async (event) => {
      try {
        if (event.type === "message" && event.message.type === "text") {
          const replyToken = event.replyToken;
          const userMessage = event.message.text;

          console.log("📩 User:", userMessage);

          // 🛑 chống spam nhẹ
          await new Promise((r) => setTimeout(r, 500));

          const replyText = await askAI(userMessage);

          await axios.post(
            "https://api.line.me/v2/bot/message/reply",
            {
              replyToken,
              messages: [
                {
                  type: "text",
                  text: replyText.substring(0, 1000),
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
        }
      } catch (err) {
        console.error("❌ LINE error:", err.response?.data || err.message);
      }
    })
  );

  res.sendStatus(200);
});

// 🌐 Test server
app.get("/", (req, res) => {
  res.send("✅ DeepSeek LINE Bot đang chạy!");
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});