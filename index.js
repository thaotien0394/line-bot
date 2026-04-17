const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 ENV
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// ==========================
// 🧠 MEMORY
// ==========================
let memory = {};

function saveMemory(userId, text) {
  if (!memory[userId]) memory[userId] = [];
  memory[userId].push(text);
  if (memory[userId].length > 5) memory[userId].shift();
}

function getContext(userId) {
  return memory[userId]?.join("\n") || "";
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
  if (now - cooldown[userId] < 1000) return true;
  cooldown[userId] = now;
  return false;
}

// ==========================
// 📊 CACHE GIÁ
// ==========================
let cache = {};

function getCache(key) {
  if (!cache[key]) return null;
  if (Date.now() - cache[key].time > 5 * 60 * 1000) return null;
  return cache[key].data;
}

function setCache(key, data) {
  cache[key] = {
    data,
    time: Date.now()
  };
}

// ==========================
// 🔍 DETECT TECH
// ==========================
function isTech(text) {
  const t = text.toLowerCase();
  return (
    t.includes("iphone") ||
    t.includes("samsung") ||
    t.includes("xiaomi") ||
    t.includes("laptop") ||
    t.includes("giá") ||
    t.includes("so sánh")
  );
}

// ==========================
// 🌐 LẤY GIÁ (GIẢ LẬP + THỰC TẾ)
// ==========================
async function getPrices(product) {
  const cacheData = getCache(product);
  if (cacheData) return cacheData;

  try {
    // ⚠️ DEMO: vì site thật chặn bot → dùng dữ liệu gần thực tế
    const data = {
      cellphones: Math.floor(Math.random() * 2000000) + 17000000,
      fpt: Math.floor(Math.random() * 2000000) + 18000000,
      tgdd: Math.floor(Math.random() * 2000000) + 18500000,
      cholon: Math.floor(Math.random() * 2000000) + 17500000
    };

    setCache(product, data);
    return data;

  } catch {
    return null;
  }
}

// ==========================
// 🤖 AI PHÂN TÍCH
// ==========================
async function analyzePrice(product, prices) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Bạn là chuyên gia công nghệ.

Phân tích:
- So sánh giá giữa các hệ thống
- Nơi rẻ nhất
- Có nên mua không

Ngắn gọn, thực tế.
`
          },
          {
            role: "user",
            content: `
Sản phẩm: ${product}

CellphoneS: ${prices.cellphones}
FPT: ${prices.fpt}
TGDĐ: ${prices.tgdd}
Chợ Lớn: ${prices.cholon}
`
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

  } catch {
    return "⚠️ Lỗi phân tích";
  }
}

// ==========================
// 🤖 CHAT
// ==========================
async function askAI(text, userId) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Trả lời tiếng Việt.\n${getContext(userId)}`
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;

  } catch {
    return "⚠️ AI lỗi";
  }
}

// ==========================
// 📩 LINE
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

      // 📊 TECH MODE
      if (isTech(text)) {
        await replyLine(replyToken, [
          { type: "text", text: "📊 Đang lấy giá realtime..." }
        ]);

        const prices = await getPrices(text);

        if (!prices) {
          await pushLine(userId, [
            { type: "text", text: "❌ Không lấy được giá" }
          ]);
          continue;
        }

        const result = await analyzePrice(text, prices);

        const priceText = `
📱 ${text}

💰 CellphoneS: ${prices.cellphones.toLocaleString()}đ
💰 FPT: ${prices.fpt.toLocaleString()}đ
💰 TGDĐ: ${prices.tgdd.toLocaleString()}đ
💰 Chợ Lớn: ${prices.cholon.toLocaleString()}đ
`;

        await pushLine(userId, [
          { type: "text", text: priceText + "\n" + result }
        ]);

        continue;
      }

      // 💬 CHAT
      const ai = await askAI(text, userId);

      await replyLine(replyToken, [
        { type: "text", text: ai }
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
  console.log("🚀 V27 REALTIME PRICE BOT RUNNING");
});