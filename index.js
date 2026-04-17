const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 CONFIG
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ==========================
// 🧠 DETECT IMAGE INTENT (AI TỰ HIỂU)
// ==========================
function isImageIntent(text) {
  const t = text.toLowerCase();

  const strongKeywords = [
    "vẽ", "ảnh", "image", "tạo ảnh", "thiết kế", "draw"
  ];

  if (strongKeywords.some(k => t.includes(k))) return true;

  const visualWords = [
    "con", "người", "cảnh", "biển", "vũ trụ",
    "robot", "anime", "thành phố", "thiên nhiên"
  ];

  return visualWords.some(k => t.includes(k));
}

// ==========================
// 🎨 IMAGE ENGINE 1
// ==========================
function imageEngine1(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
}

// ==========================
// 🎨 IMAGE ENGINE 2
// ==========================
function imageEngine2(prompt) {
  return `https://pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux`;
}

// ==========================
// 🎨 CANVA FALLBACK LINK
// ==========================
function canvaFallback(prompt) {
  const search = encodeURIComponent(prompt);
  return `https://www.canva.com/templates/search/${search}/`;
}

// ==========================
// 🧠 SAFE IMAGE GENERATOR
// ==========================
async function generateImageUltra(prompt) {
  // LEVEL 1
  try {
    const url1 = imageEngine1(prompt);
    await axios.get(url1, { timeout: 5000 });

    console.log("🎨 ENGINE 1 OK");
    return { type: "image", url: url1 };

  } catch (e) {
    console.log("⚠️ ENGINE 1 FAIL");

    // LEVEL 2
    try {
      const url2 = imageEngine2(prompt);
      await axios.get(url2, { timeout: 5000 });

      console.log("🎨 ENGINE 2 OK");
      return { type: "image", url: url2 };

    } catch (e2) {
      console.log("❌ BOTH IMAGE ENGINE FAIL → CANVA");

      // LEVEL 3 CANVA
      return {
        type: "canva",
        url: canvaFallback(prompt)
      };
    }
  }
}

// ==========================
// 📩 LINE REPLY
// ==========================
async function replyLine(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const events = req.body.events || [];

  for (const event of events) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text;
      const replyToken = event.replyToken;

      console.log("USER:", text);

      // ==========================
      // 🎨 IMAGE MODE
      // ==========================
      if (isImageIntent(text)) {
        const result = await generateImageUltra(text);

        if (result.type === "image") {
          await replyLine(replyToken, [
            { type: "text", text: "🎨 Đang tạo ảnh..." },
            {
              type: "image",
              originalContentUrl: result.url,
              previewImageUrl: result.url
            }
          ]);
        }

        if (result.type === "canva") {
          await replyLine(replyToken, [
            {
              type: "text",
              text: "⚠️ Không tạo được ảnh AI, mở Canva để chỉnh sửa:"
            },
            {
              type: "text",
              text: result.url
            }
          ]);
        }

        continue; // 🚨 KHÔNG chạy AI text
      }

      // ==========================
      // 🤖 TEXT MODE (placeholder AI)
      // ==========================
      await replyLine(replyToken, [
        {
          type: "text",
          text: "AI text chưa gắn (có thể thêm Groq/OpenRouter)"
        }
      ]);

    } catch (err) {
      console.log("WEBHOOK ERROR:", err.message);
    }
  }
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 AI IMAGE ULTRA PRO + CANVA RUNNING:", PORT);
});