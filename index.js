const express = require("express");
const axios = require("axios");
const line = require("@line/bot-sdk");
const Redis = require("ioredis");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// =========================
// 🔐 LINE CONFIG
// =========================
const client = new line.Client({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// =========================
// 🧠 REDIS SAFE INIT
// =========================
let redis;
try {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1
  });

  redis.on("connect", () => console.log("✅ Redis OK"));
  redis.on("error", (e) => console.log("❌ Redis:", e.message));
} catch {
  console.log("❌ Redis disabled");
}

// =========================
// 🚫 BLOCKLIST (EXACT MATCH)
// =========================
const BLOCKLIST = new Set([
  "KEY","RS","CTKM","MT","HD","BOT",
  "LAPTOP","MÙA NÓNG","PV","8NTTT",
  "TRACHAM","BB","CAMERA"
]);

function isBlocked(text) {
  return BLOCKLIST.has(
    text
      .toString()
      .normalize("NFC")
      .toUpperCase()
      .trim()
  );
}

// =========================
// ⚡ UTILS
// =========================
const hash = (t) =>
  crypto.createHash("md5").update(t).digest("hex");

function clean(text) {
  return text
    .toString()
    .replace(/[`*]/g, "")
    .trim();
}

// =========================
// 🚫 RATE LIMIT
// =========================
const userRate = {};

function isSpam(userId) {
  const now = Date.now();
  if (!userRate[userId]) userRate[userId] = [];

  userRate[userId] = userRate[userId].filter(
    (t) => now - t < 5000
  );

  userRate[userId].push(now);

  return userRate[userId].length > 5;
}

// =========================
// 🧠 MEMORY
// =========================
async function getMemory(userId) {
  try {
    if (!redis) return [];
    const d = await redis.get("mem:" + userId);
    return d ? JSON.parse(d) : [];
  } catch {
    return [];
  }
}

async function saveMemory(userId, mem) {
  try {
    if (!redis) return;
    await redis.set(
      "mem:" + userId,
      JSON.stringify(mem.slice(-8))
    );
  } catch {}
}

// =========================
// ⚡ CACHE
// =========================
async function getCache(msg) {
  try {
    if (!redis) return null;
    return await redis.get("c:" + hash(msg));
  } catch {
    return null;
  }
}

async function setCache(msg, val) {
  try {
    if (!redis) return;
    await redis.set("c:" + hash(msg), val, "EX", 300);
  } catch {}
}

// =========================
// 🌐 SEARCH (TAVILY)
// =========================
async function webSearch(q) {
  try {
    const r = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: process.env.TAVILY_KEY,
        query: q
      }
    );

    return r.data.results
      ?.map((x) => x.content)
      .join("\n") || "";
  } catch {
    return "";
  }
}

// =========================
// ⚡ FAST AI (GROQ)
// =========================
async function fastAI(msg) {
  try {
    const r = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: msg }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_KEY}`
        }
      }
    );

    return r.data.choices[0].message.content;
  } catch {
    return null;
  }
}

// =========================
// 🧠 DEEP AI
// =========================
async function deepAI(msg, context) {
  try {
    const r = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Trả lời chính xác.
Nếu có dữ liệu thì dùng:

${context}
            `
          },
          { role: "user", content: msg }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`
        }
      }
    );

    return r.data.choices[0].message.content;
  } catch {
    return null;
  }
}

// =========================
// 🧠 RULE SEARCH
// =========================
function needSearch(msg) {
  const t = msg.toLowerCase();
  return (
    t.includes("giá") ||
    t.includes("hôm nay") ||
    t.includes("bao nhiêu") ||
    t.includes("tin")
  );
}

// =========================
// 🚀 AI ENGINE
// =========================
async function AI_ENGINE(userId, msg) {

  // 🚫 blocklist
  if (isBlocked(msg)) return null;

  // 🚫 spam
  if (isSpam(userId)) return "⛔ Bạn gửi quá nhanh";

  // ⚡ cache
  const cached = await getCache(msg);
  if (cached) return cached;

  // ⚡ fast AI
  if (msg.length < 60) {
    const f = await fastAI(msg);
    if (f) {
      await setCache(msg, f);
      return f;
    }
  }

  // 🌐 search nếu cần
  let context = "";
  if (needSearch(msg)) {
    context = await webSearch(msg);
  }

  // 🧠 deep AI
  const reply =
    (await deepAI(msg, context)) ||
    "⚠️ AI tạm thời lỗi";

  await setCache(msg, reply);

  // 💾 memory
  let mem = await getMemory(userId);
  mem.push({ role: "user", content: msg });
  mem.push({ role: "assistant", content: reply });
  await saveMemory(userId, mem);

  return reply;
}

// =========================
// 🌐 LINE WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {

  const events = req.body.events;

  for (let e of events) {
    if (e.type !== "message") continue;

    const userId = e.source.userId;
    const text = e.message.text;

    const reply = await AI_ENGINE(userId, text);

    if (!reply) continue;

    await client.replyMessage(e.replyToken, {
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
  console.log("🚀 V100++ FINAL READY");
});