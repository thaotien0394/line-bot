const express = require("express");
const axios = require("axios");
const line = require("@line/bot-sdk");
const Redis = require("ioredis");

const app = express();
app.use(express.json());

// =========================
// 🔐 CONFIG (LẤY TỪ VARIABLES)
// =========================
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// ⚠️ REDIS URL từ Variables
const redis = new Redis(process.env.REDIS_URL);

// =========================
// 🚫 BLOCKLIST
// =========================
const BLOCKLIST = new Set(["KEY","RS","CTKM","MT","HD"]);

function isBlocked(text) {
  return BLOCKLIST.has(text.toUpperCase().trim());
}

// =========================
// 🧹 CLEAN TEXT
// =========================
function clean(text) {
  return text
    .toString()
    .replace(/[`*]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .trim();
}

// =========================
// 🧠 MEMORY (REDIS)
// =========================
async function getMemory(userId) {
  const data = await redis.get(`mem:${userId}`);
  return data ? JSON.parse(data) : [];
}

async function saveMemory(userId, memory) {
  await redis.set(`mem:${userId}`, JSON.stringify(memory.slice(-10)));
}

// =========================
// ⚡ CACHE
// =========================
async function getCache(key) {
  return await redis.get(`cache:${key}`);
}

async function setCache(key, value) {
  await redis.set(`cache:${key}`, value, "EX", 120);
}

// =========================
// 🌐 REALTIME SEARCH
// =========================
async function webSearch(query) {
  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: process.env.TAVILY_KEY,
      query
    });

    return res.data.results?.map(r => r.content).join("\n") || "";
  } catch {
    return "";
  }
}

// =========================
// 📰 NEWS
// =========================
async function getNews(query) {
  try {
    const res = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${process.env.NEWSDATA_KEY}&q=${query}&language=vi`
    );

    return res.data.results?.slice(0, 3)
      .map(n => `• ${n.title}`)
      .join("\n") || "";
  } catch {
    return "";
  }
}

// =========================
// 🎨 IMAGE
// =========================
async function generateImage(prompt) {
  return "🎨 Đã tạo ảnh (demo)";
}

// =========================
// 🎬 VIDEO
// =========================
async function generateVideo(prompt) {
  return "🎬 Đang tạo video (demo)";
}

// =========================
// 🔧 TOOL EXECUTOR
// =========================
async function executeTool(name, arg) {
  if (name === "search") return await webSearch(arg);
  if (name === "news") return await getNews(arg);
  if (name === "image") return await generateImage(arg);
  if (name === "video") return await generateVideo(arg);
  return "";
}

// =========================
// 🤖 CALL AI
// =========================
async function callAI(messages) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch {
    return null;
  }
}

// =========================
// 🤖 AGENT LOOP V100
// =========================
async function runAgent(userId, message) {

  let memory = await getMemory(userId);
  memory.push({ role: "user", content: message });

  let toolResult = "";
  let loop = 0;

  while (loop < 3) {

    const reply = await callAI([
      {
        role: "system",
        content: `
Bạn là AI Agent

Nếu cần dữ liệu:
TOOL: search(từ khóa)

Nếu đủ thông tin → trả lời luôn
        `
      },
      ...memory,
      ...(toolResult
        ? [{ role: "system", content: "TOOL RESULT:\n" + toolResult }]
        : [])
    ]);

    if (!reply) return "⚠️ AI lỗi";

    // 🔧 detect tool
    if (reply.includes("TOOL:")) {
      const match = reply.match(/TOOL:\s*(\w+)\((.*?)\)/);

      if (match) {
        const toolName = match[1];
        const arg = match[2];

        toolResult = await executeTool(toolName, arg);

        memory.push({
          role: "assistant",
          content: `Đã gọi tool ${toolName}`
        });

        loop++;
        continue;
      }
    }

    // ✅ trả lời cuối
    memory.push({ role: "assistant", content: reply });
    await saveMemory(userId, memory);

    return reply;
  }

  return "⚠️ Quá nhiều bước";
}

// =========================
// 🧠 AI ENGINE
// =========================
async function AI_ENGINE(userId, message) {

  const cache = await getCache(message);
  if (cache) return cache;

  const reply = await runAgent(userId, message);

  await setCache(message, reply);

  return reply;
}

// =========================
// 🌐 LINE WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {

  const events = req.body.events;

  for (let event of events) {
    if (event.type !== "message") continue;

    const userId = event.source.userId;
    const text = event.message.text;

    if (isBlocked(text)) continue;

    const reply = await AI_ENGINE(userId, text);

    await client.replyMessage(event.replyToken, {
      type: "text",
      text: clean(reply)
    });
  }

  res.sendStatus(200);
});

// =========================
// 🚀 START
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("🚀 V100 AGENT RUNNING");

  // 🔥 test Redis ngay khi start
  try {
    await redis.set("ping", "ok");
    const v = await redis.get("ping");
    console.log("REDIS:", v);
  } catch (e) {
    console.log("❌ REDIS ERROR:", e.message);
  }
});