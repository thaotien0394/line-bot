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
// 🚫 ANTI SPAM (NHANH)
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
// 🚫 BLOCK EXACT (KHÔNG TƯƠNG ĐỐI)
// ==========================
function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function isBlockedSilent(text) {
  const blockList = [
    "key","ctkm","bb","camera","mt","hd",
    "bot","laptop","mùa nóng","pv","8nttt","tracham","rs"
  ];

  const t = normalize(text);
  return blockList.includes(t); // exact match only
}

// ==========================
// 🎨 IMAGE KEYWORD
// ==========================
function isImageRequest(text) {
  const keywords = [
    "vẽ","ảnh","tạo ảnh","hình","anime",
    "3d","render","avatar","poster","logo"
  ];

  const t = text.toLowerCase();
  return keywords.some(k => t.includes(k));
}

// ==========================
// 🎯 STYLE AUTO
// ==========================
function detectStyle(text) {
  const t = text.toLowerCase();

  if (t.includes("anime")) return "anime style";
  if (t.includes("3d")) return "3D render";
  if (t.includes("realistic")) return "realistic photo";
  if (t.includes("chibi")) return "chibi cute";

  return "ultra realistic, 4k, cinematic lighting";
}

// ==========================
// 🖼️ IMAGE URL
// ==========================
function imageUrl(prompt) {
  const style = detectStyle(prompt);
  const finalPrompt = `${prompt}, ${style}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}`;
}

// ==========================
// 📦 IMAGE QUEUE SYSTEM
// ==========================
let queue = [];
let runningUsers = new Set();
let MAX_USERS = 4;

// auto scale theo tải
function autoScale() {
  if (queue.length > 10) MAX_USERS = 4;
  else if (queue.length > 5) MAX_USERS = 3;
  else MAX_USERS = 2;
}

// thêm job
function addJob(userId, prompt) {
  queue.push({ userId, prompt });
  autoScale();
  processQueue();
}

// xử lý queue
async function processQueue() {
  if (queue.length === 0) return;

  // nếu đã đủ user đang chạy
  if (runningUsers.size >= MAX_USERS) return;

  const job = queue.shift();

  // nếu user này đang chạy rồi → skip (tránh spam)
  if (runningUsers.has(job.userId)) {
    processQueue();
    return;
  }

  runningUsers.add(job.userId);

  try {
    const url = imageUrl(job.prompt);

    await pushLine(job.userId, [
      {
        type: "image",
        originalContentUrl: url,
        previewImageUrl: url
      }
    ]);

  } catch {
    await pushLine(job.userId, [
      { type: "text", text: "⚠️ Lỗi tạo ảnh" }
    ]);
  }

  runningUsers.delete(job.userId);

  // chạy tiếp job khác
  processQueue();
}

// ==========================
// 🤖 AI CHAT
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
// 📩 LINE API
// ==========================
async function replyLine(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`
      }
    }
  );
}

async function pushLine(userId, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: userId, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`
      }
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

      // 🚫 spam
      if (isSpam(userId)) continue;

      // 🚫 block exact
      if (isBlockedSilent(text)) return;

      saveMemory(userId, text);

      // 🎨 IMAGE
      if (isImageRequest(text)) {

        // nếu queue quá tải
        if (runningUsers.size >= MAX_USERS) {
          await replyLine(replyToken, [
            { type: "text", text: "⏳ Server đang bận, vui lòng thử lại..." }
          ]);
          continue;
        }

        await replyLine(replyToken, [
          { type: "text", text: "🎨 Đang tạo ảnh..." }
        ]);

        addJob(userId, text);
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
  console.log("🚀 V27 IMAGE CONTROL RUNNING");
});