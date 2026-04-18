const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ======================
// 🔑 API KEYS
// ======================
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const HF_KEY = process.env.HF_KEY;
const NEWSDATA_KEY = process.env.NEWSDATA_KEY;

// ======================
// 🚫 BLOCKLIST (SILENT)
// ======================
const BLOCKED = [
  "RS","CTKM","8NTTT","HD","MT","BOT",
  "LAPTOP","MÙA NÓNG","CAMERA","PV",
  "BB","TRACHAM","KEY"
];

function isBlocked(text) {
  return BLOCKED.some(k =>
    text.toUpperCase().includes(k)
  );
}

// ======================
// 🧭 INTENT DETECT
// ======================
function classifyIntent(text) {
  if (/vẽ|ảnh|image|draw|mockup/i.test(text)) return "IMAGE";
  if (/so sánh|vs|RTX|GPU|CPU|laptop/i.test(text)) return "TECH";
  if (/giá|bao nhiêu|mua|deal/i.test(text)) return "PRICE";
  return "CHAT";
}

// ======================
// 📰 REALTIME NEWS
// ======================
async function getNews(query) {
  try {
    const res = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&q=${query}`
    );
    return res.data.results?.slice(0, 5) || [];
  } catch {
    return [];
  }
}

// ======================
// 🤖 OPENROUTER AI (FIXED)
// ======================
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content:
              "Bạn là AI công nghệ. Phân tích logic, không bịa dữ liệu."
          },
          {
            role: "user",
            content: prompt
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
  } catch (e) {
    return "❌ AI error";
  }
}

// ======================
// 🎨 IMAGE AI (HUGGINGFACE)
// ======================
async function generateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: `${prompt}, ultra detailed, 4k` },
      {
        headers: {
          Authorization: `Bearer ${HF_KEY}`
        },
        responseType: "arraybuffer"
      }
    );

    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

// ======================
// 🧠 TECH ENGINE
// ======================
async function handleTech(query) {
  const news = await getNews(query);

  const prompt = `
Dữ liệu realtime:
${JSON.stringify(news)}

Câu hỏi:
${query}

Yêu cầu:
- so sánh rõ ràng
- không bịa
- kết luận theo nhu cầu
`;

  return await askAI(prompt);
}

// ======================
// 🚀 MAIN ENGINE
// ======================
async function handleUser(userId, text) {

  // 🚫 SILENT BLOCK
  if (isBlocked(text)) return null;

  const intent = classifyIntent(text);

  // 🎨 IMAGE
  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo ảnh được";
    return { type: "image", data: img.toString("base64") };
  }

  // 🧠 TECH / PRICE
  if (intent === "TECH" || intent === "PRICE") {
    return await handleTech(text);
  }

  // 💬 CHAT
  return await askAI(text);
}

// ======================
// 🌐 WEBHOOK API
// ======================
app.post("/webhook", async (req, res) => {
  const { userId, message } = req.body;

  const result = await handleUser(userId, message);

  // silent
  if (!result) return res.sendStatus(200);

  // image
  if (typeof result === "object" && result.type === "image") {
    return res.json(result);
  }

  // text
  return res.json({
    type: "text",
    message: result
  });
});

// ======================
app.listen(3000, () =>
  console.log("🚀 V35 STABLE RUNNING ON PORT 3000")
);