const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 ENV
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;

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
// 🚫 SPAM
// ==========================
let cooldown = {};
function isSpam(userId) {
  const now = Date.now();
  if (!cooldown[userId]) return (cooldown[userId] = now), false;
  if (now - cooldown[userId] < 1000) return true;
  cooldown[userId] = now;
  return false;
}

// ==========================
// 🚫 BLOCK EXACT
// ==========================
function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}
function isBlockedSilent(text) {
  const blockList = [
    "key","ctkm","bb","camera","mt","hd",
    "bot","laptop","mùa nóng","pv","8nttt","tracham","rs"
  ];
  return blockList.includes(normalize(text));
}

// ==========================
// 🎨 IMAGE
// ==========================
function isImageRequest(text) {
  return ["vẽ","ảnh","anime","3d","logo","avatar"]
    .some(k => text.toLowerCase().includes(k));
}

function detectStyle(text) {
  const t = text.toLowerCase();
  if (t.includes("anime")) return "anime style";
  if (t.includes("3d")) return "3D render";
  return "realistic, 4k";
}

function imageUrl(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + "," + detectStyle(prompt))}`;
}

// ==========================
// 📦 IMAGE QUEUE (4 USER)
// ==========================
let queue = [];
let runningUsers = new Set();
const MAX_USERS = 4;

function addJob(userId, prompt) {
  queue.push({ userId, prompt });
  processQueue();
}

async function processQueue() {
  if (queue.length === 0) return;
  if (runningUsers.size >= MAX_USERS) return;

  const job = queue.shift();
  if (runningUsers.has(job.userId)) return processQueue();

  runningUsers.add(job.userId);

  try {
    const url = imageUrl(job.prompt);

    await pushLine(job.userId, [{
      type: "image",
      originalContentUrl: url,
      previewImageUrl: url
    }]);

  } catch {
    await pushLine(job.userId, [{ type: "text", text: "⚠️ lỗi ảnh" }]);
  }

  runningUsers.delete(job.userId);
  processQueue();
}

// ==========================
// 🌐 SEARCH REAL (SERP)
// ==========================
let cache = {};

function getCache(q) {
  if (!cache[q]) return null;
  if (Date.now() - cache[q].time > 5 * 60 * 1000) return null;
  return cache[q].data;
}

function setCache(q, data) {
  cache[q] = { data, time: Date.now() };
}

async function searchGoogle(query) {
  const cached = getCache(query);
  if (cached) return cached;

  try {
    const res = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: query,
        api_key: SERP_API_KEY,
        hl: "vi"
      }
    });

    const results = res.data.organic_results.slice(0, 5);

    const text = results.map(r =>
      `${r.title}\n${r.snippet}`
    ).join("\n\n");

    setCache(query, text);
    return text;

  } catch {
    return null;
  }
}

// ==========================
// 🤖 AI TỔNG HỢP REALTIME
// ==========================
async function realtimeAnswer(query, userId) {
  const data = await searchGoogle(query);
  if (!data) return "❌ Không lấy được dữ liệu";

  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Hiện tại là năm ${new Date().getFullYear()}.

- Trả lời như dữ liệu mới nhất
- Không nói "2023"
- Tóm tắt rõ ràng
`
          },
          {
            role: "user",
            content: `Câu hỏi: ${query}\n\nDữ liệu:\n${data}`
          }
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENROUTER_KEY}` }
      }
    );

    return res.data.choices[0].message.content;

  } catch {
    return data;
  }
}

// ==========================
// 💬 CHAT
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
            content: `Hiện tại là ${new Date().getFullYear()}.\n${getContext(userId)}`
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENROUTER_KEY}` }
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
    { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
  );
}

async function pushLine(userId, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: userId, messages },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
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
      if (isBlockedSilent(text)) return;

      saveMemory(userId, text);

      // 🎨 IMAGE
      if (isImageRequest(text)) {
        await replyLine(replyToken, [
          { type: "text", text: "🎨 đang vẽ..." }
        ]);
        addJob(userId, text);
        continue;
      }

      // 🌐 REALTIME
      await replyLine(replyToken, [
        { type: "text", text: "🔎 đang tìm dữ liệu mới..." }
      ]);

      const result = await realtimeAnswer(text, userId);

      await pushLine(userId, [
        { type: "text", text: result }
      ]);

    } catch (err) {
      console.log(err.message);
    }
  }
});

// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 V28 REALTIME TRUE RUNNING"));