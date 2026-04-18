// =======================
// V31 AI SYSTEM FULL
// =======================

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// =======================
// 🔑 ENV KEYS
// =======================
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const HF_KEY = process.env.HF_KEY;
const REPLICATE_KEY = process.env.REPLICATE_KEY;

// =======================
// 🚫 BLACKLIST (SILENT)
// =======================
const BLOCKED_KEYWORDS = [
  "RS", "CTKM", "8NTTT", "HD", "MT", "BOT",
  "LAPTOP", "MÙA NÓNG", "CAMERA", "PV",
  "BB", "TRACHAM", "KEY"
];

function isBlocked(text) {
  const input = text.toUpperCase();
  return BLOCKED_KEYWORDS.some(k => input.includes(k));
}

// =======================
// 🧭 INTENT CLASSIFIER
// =======================
function classifyIntent(text) {
  if (isBlocked(text)) return "BLOCKED";

  if (/vẽ|ảnh|draw|image|tạo hình/i.test(text)) return "IMAGE";

  if (/so sánh|vs|tốt hơn|nên mua|RTX|CPU|GPU|benchmark/i.test(text))
    return "TECH";

  if (/giá|bao nhiêu|mua|deal|rẻ/i.test(text))
    return "PRICE";

  return "CHAT";
}

// =======================
// 🧠 MEMORY SYSTEM
// =======================
const memory = {};

function updateMemory(userId, intent) {
  if (!memory[userId]) {
    memory[userId] = { tech: 0, image: 0, price: 0 };
  }

  if (intent === "TECH") memory[userId].tech++;
  if (intent === "IMAGE") memory[userId].image++;
  if (intent === "PRICE") memory[userId].price++;
}

// =======================
// 🤖 OPENROUTER AI
// =======================
async function askAI(prompt) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "mistralai/mistral-7b-instruct",
      messages: [
        {
          role: "system",
          content:
            "Bạn là AI chuyên gia công nghệ. Phân tích logic, không bịa thông tin."
        },
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        Authorization: Bearer ${OPENROUTER_KEY}
      }
    }
  );

  return res.data.choices[0].message.content;
}

// =======================
// 🎨 IMAGE AI (HUGGINGFACE)
// =======================
async function generateHF(prompt) {
  const res = await axios.post(
    "https://api-inference.huggingface.co/models/stable-diffusion-xl-base-1.0",
    { inputs: prompt },
    {
      headers: {
        Authorization: Bearer ${HF_KEY}
      },
      responseType: "arraybuffer"
    }
  );

  return Buffer.from(res.data);
}

// fallback image
async function generateImage(prompt) {
  const clean = `${prompt}, ultra detailed, 4k, high quality`;

  try {
    return await generateHF(clean);
  } catch (e) {
    return null;
  }
}

// =======================
// 🧠 MAIN ENGINE
// =======================
async function handleUser(userId, text) {
  // 🚫 SILENT BLOCK
  if (isBlocked(text)) return null;

  const intent = classifyIntent(text);

  updateMemory(userId, intent);

  // 🎨 IMAGE
  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo được ảnh";
    return img;
  }

  // 🧠 TECH
  if (intent === "TECH") {
    return await askAI(`So sánh / phân tích kỹ thuật: ${text}`);
  }

  // 💰 PRICE
  if (intent === "PRICE") {
    return await askAI(`Phân tích giá + tư vấn mua: ${text}`);
  }

  // 💬 CHAT
  return await askAI(text);
}

// =======================
// 🌐 API (WEBHOOK)
// =======================
app.post("/webhook", async (req, res) => {
  const { userId, message } = req.body;

  const result = await handleUser(userId, message);

  // nếu bị block → im lặng
  if (!result) return res.sendStatus(200);

  // nếu là ảnh
  if (Buffer.isBuffer(result)) {
    return res.send({
      type: "image",
      data: result.toString("base64")
    });
  }

  // text
  return res.send({
    type: "text",
    message: result
  });
});

// =======================
app.listen(3000, () =>
  console.log("V31 AI SYSTEM RUNNING ON PORT 3000")
);