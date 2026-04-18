const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   🔐 ENV KEYS SAFE CHECK
========================= */
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || "";
const HF_KEY = process.env.HF_KEY || "";
const STABILITY_KEY = process.env.STABILITY_KEY || "";
const REPLICATE_KEY = process.env.REPLICATE_KEY || "";
const CHANNEL_TOKEN = process.env.CHANNEL_TOKEN || "";

/* =========================
   ⚡ SAFE SERVER HEALTH
========================= */
app.get("/", (req, res) => {
  res.send("V40 BOT OK");
});

/* =========================
   🧠 CACHE
========================= */
const cache = new Map();

/* =========================
   🚦 RATE LIMIT
========================= */
const userTime = new Map();

function rateLimit(userId) {
  const now = Date.now();
  const last = userTime.get(userId) || 0;

  if (now - last < 1500) return false;

  userTime.set(userId, now);
  return true;
}

/* =========================
   🧠 AI SAFE CALL
========================= */
async function askAI(text) {
  if (cache.has(text)) return cache.get(text);

  try {
    if (!OPENROUTER_KEY) return "⚠️ AI chưa cấu hình API KEY";

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { role: "system", content: "Bạn là AI thông minh, trả lời ngắn gọn." },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`
        },
        timeout: 12000
      }
    );

    const result =
      res.data?.choices?.[0]?.message?.content || "❌ AI lỗi";

    cache.set(text, result);
    return result;

  } catch (e) {
    return "❌ AI đang bận";
  }
}

/* =========================
   🎨 IMAGE SAFE (FALLBACK)
========================= */
async function generateImage(prompt) {
  try {
    if (HF_KEY) {
      const res = await axios.post(
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        { inputs: prompt },
        {
          headers: { Authorization: `Bearer ${HF_KEY}` },
          responseType: "arraybuffer",
          timeout: 20000
        }
      );

      return Buffer.from(res.data).toString("base64");
    }
  } catch {}

  return null;
}

/* =========================
   🧠 INTENT DETECTOR
========================= */
function detectIntent(text) {
  const t = text.toLowerCase();
  if (t.includes("vẽ") || t.includes("ảnh")) return "IMAGE";
  return "CHAT";
}

/* =========================
   ⚙️ MAIN LOGIC SAFE
========================= */
async function handle(userId, text) {
  if (!text) return "❌ Không có nội dung";

  if (!rateLimit(userId)) {
    return "⛔ Gửi quá nhanh, chờ 2 giây";
  }

  const intent = detectIntent(text);

  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo được ảnh";

    return {
      type: "image",
      data: img
    };
  }

  return await askAI(text);
}

/* =========================
   🌐 WEBHOOK SAFE 100% (NO 502)
========================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // ⚠️ QUAN TRỌNG: trả ngay để tránh LINE timeout

  try {
    const event = req.body?.events?.[0];
    if (!event) return;

    const text = event.message?.text;
    const userId = event.source?.userId;
    const replyToken = event.replyToken;

    if (!text || !replyToken) return;

    const result = await handle(userId, text);

    let message;

    if (typeof result === "object" && result.type === "image") {
      message = {
        type: "image",
        originalContentUrl: `data:image/png;base64,${result.data}`,
        previewImageUrl: `data:image/png;base64,${result.data}`
      };
    } else {
      message = {
        type: "text",
        text: result
      };
    }

    if (!CHANNEL_TOKEN) return;

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [message]
      },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

  } catch (err) {
    console.log("WEBHOOK ERROR:", err.message);
  }
});

/* =========================
   🚀 RAILWAY SAFE PORT
========================= */
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("🚀 V40 RUNNING ON PORT", port);
});