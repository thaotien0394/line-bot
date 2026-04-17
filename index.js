const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 ENV
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// ==========================
// 📊 LOG HELPER (QUAN TRỌNG)
// ==========================
function log(title, data) {
  console.log("\n==============================");
  console.log("📌 " + title);
  console.log("==============================");
  console.log(data);
  console.log("==============================\n");
}

// ==========================
// 🧼 CLEAN TEXT
// ==========================
function cleanText(text = "") {
  return text
    .replace(/[*#_>`~\-]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ==========================
// 📩 LINE REPLY
// ==========================
async function replyLine(replyToken, messages) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      { replyToken, messages },
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    log("LINE REPLY SUCCESS", messages);
  } catch (err) {
    log("LINE ERROR", {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message
    });
  }
}

// ==========================
// 🤖 GROQ AI (FULL DEBUG)
// ==========================
async function askGroq(text) {
  try {
    log("GROQ REQUEST", {
      model: "llama3-70b-8192",
      input: text
    });

    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [
          {
            role: "system",
            content: "Trả lời tiếng Việt, không markdown, rõ ràng, ngắn gọn."
          },
          { role: "user", content: text }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    log("GROQ RESPONSE", res.data);

    return res.data.choices[0].message.content;

  } catch (err) {
    log("❌ GROQ ERROR DETAIL", {
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      message: err.message,
      stack: err.stack
    });

    return null;
  }
}

// ==========================
// 🔁 OPENROUTER (FULL DEBUG)
// ==========================
async function askOpenRouter(text) {
  try {
    log("OPENROUTER REQUEST", {
      model: "deepseek/deepseek-chat",
      input: text
    });

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: text }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    log("OPENROUTER RESPONSE", res.data);

    return res.data.choices[0].message.content;

  } catch (err) {
    log("❌ OPENROUTER ERROR DETAIL", {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message
    });

    return null;
  }
}

// ==========================
// 🤖 AI ROUTER (SAFE)
// ==========================
async function askAI(text) {
  let groq = await askGroq(text);

  if (groq) {
    log("AI SOURCE", "GROQ");
    return groq;
  }

  log("AI SWITCH", "Groq fail → OpenRouter");

  let or = await askOpenRouter(text);

  if (or) {
    log("AI SOURCE", "OPENROUTER");
    return or;
  }

  return "⚠️ Hệ thống AI đang quá tải, vui lòng thử lại sau.";
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  log("WEBHOOK EVENT", req.body);

  const events = req.body.events || [];

  for (const event of events) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text;
      const replyToken = event.replyToken;

      log("USER MESSAGE", text);

      const aiText = cleanText(await askAI(text));

      await replyLine(replyToken, [
        { type: "text", text: aiText }
      ]);

    } catch (err) {
      log("WEBHOOK ERROR", {
        message: err.message,
        stack: err.stack
      });
    }
  }
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 DEBUG BOT RUNNING PORT:", PORT);
});