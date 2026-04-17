const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 CONFIG
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;

// ==========================
// 📊 QUEUE SYSTEM
// ==========================
let queue = [];
let running = 0;
let MAX_CONCURRENT = 2;

// ==========================
// 📈 STATS
// ==========================
let stats = {
  total: 0,
  done: 0,
  fail: 0
};

// ==========================
// 👑 VIP USERS
// ==========================
const VIP_USERS = new Set([
  "VIP_USER_ID_1",
  "VIP_USER_ID_2"
]);

// ==========================
// 🧠 AUTO SCALE ENGINE
// ==========================
function autoScale() {
  const q = queue.length;

  if (q > 20) MAX_CONCURRENT = 4;
  else if (q > 10) MAX_CONCURRENT = 3;
  else if (q > 5) MAX_CONCURRENT = 2;
  else MAX_CONCURRENT = 1;

  console.log(`⚙️ AUTO SCALE → workers = ${MAX_CONCURRENT} | queue = ${q}`);
}

// ==========================
// 🧠 PROMPT ENGINE
// ==========================
function enhancePrompt(prompt) {
  return `
ultra detailed, cinematic lighting, masterpiece, 8k, sharp focus,
${prompt},
professional digital art, trending on artstation
  `.trim();
}

// ==========================
// 🎨 IMAGE AI
// ==========================
async function generateImage(prompt) {
  const res = await axios.post(
    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
    { inputs: prompt },
    {
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`
      },
      responseType: "arraybuffer",
      timeout: 30000
    }
  );

  return Buffer.from(res.data, "binary");
}

// ==========================
// 🎨 FALLBACK IMAGE
// ==========================
function fallbackImage(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
}

// ==========================
// 📩 LINE REPLY
// ==========================
async function replyLine(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ==========================
// 📊 DASHBOARD
// ==========================
app.get("/dashboard", (req, res) => {
  res.json({
    queue: queue.length,
    running,
    workers: MAX_CONCURRENT,
    stats
  });
});

// ==========================
// 📥 ADD QUEUE (VIP PRIORITY)
// ==========================
function addQueue(job) {
  stats.total++;

  if (job.vip) queue.unshift(job);
  else queue.push(job);

  autoScale();
  processQueue();
}

// ==========================
// ⚙️ QUEUE PROCESSOR
// ==========================
async function processQueue() {
  autoScale();

  if (running >= MAX_CONCURRENT) return;
  if (queue.length === 0) return;

  const job = queue.shift();
  running++;

  try {
    await handleJob(job);
    stats.done++;
  } catch (e) {
    stats.fail++;
    console.log("JOB ERROR:", e.message);
  }

  running--;
  processQueue();
}

// ==========================
// 🎯 HANDLE JOB
// ==========================
async function handleJob(job) {
  const { text, replyToken } = job;

  await replyLine(replyToken, [
    {
      type: "text",
      text: `⏳ Render... Queue: ${queue.length} | Workers: ${MAX_CONCURRENT}`
    }
  ]);

  const prompt = enhancePrompt(text);

  try {
    const img = await generateImage(prompt);

    const base64 = img.toString("base64");
    const url = `data:image/png;base64,${base64}`;

    await replyLine(replyToken, [
      { type: "text", text: "🎨 V10 render complete" },
      {
        type: "image",
        originalContentUrl: url,
        previewImageUrl: url
      }
    ]);
  } catch (e) {
    console.log("AI FAIL → FALLBACK");

    const url = fallbackImage(prompt);

    await replyLine(replyToken, [
      { type: "text", text: "⚠️ Fallback image used" },
      {
        type: "image",
        originalContentUrl: url,
        previewImageUrl: url
      }
    ]);
  }
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
      const userId = event.source?.userId;
      const replyToken = event.replyToken;

      const isVip = VIP_USERS.has(userId);

      addQueue({
        text,
        replyToken,
        vip: isVip,
        time: Date.now(),
        userId
      });

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
  console.log("🚀 MIDJOURNEY V10 AUTO SCALE RUNNING:", PORT);
});