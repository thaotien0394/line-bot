const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

// Cấu hình lấy từ Variables trên Railway
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

/**
 * Hàm tìm kiếm thông tin từ DuckDuckGo
 */
async function searchDuckDuckGo(query) {
  try {
    // Sử dụng API tìm kiếm nhanh (không cần key)
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await axios.get(searchUrl);
    return response.data.AbstractText || "";
  } catch (error) {
    console.error("Lỗi tìm kiếm DuckDuckGo:", error.message);
    return "";
  }
}

/**
 * Hàm gọi AI qua OpenRouter với cơ chế dự phòng (Fallback)
 */
async function askAI(userMessage) {
  // Danh sách model ưu tiên từ Miễn phí đến Xịn
  const models = [
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemini-flash-1.5-exp",
    "mistralai/mistral-7b-instruct:free"
  ];

  // Kiểm tra nếu câu hỏi cần tìm kiếm dữ liệu thực tế
  let context = "";
  const triggers = ["giá", "hôm nay", "tin tức", "mới nhất", "thời tiết", "ở đâu"];
  if (triggers.some(word => userMessage.toLowerCase().includes(word))) {
    context = await searchDuckDuckGo(userMessage);
  }

  const systemPrompt = context 
    ? `Dưới đây là thông tin thực tế vừa tìm được: "${context}". Hãy dựa vào đó để trả lời câu hỏi của người dùng.`
    : "Bạn là một trợ lý ảo thông minh, trả lời ngắn gọn và hữu ích.";

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        // Tính năng đặc biệt của OpenRouter: Tự động đổi model nếu model chính lỗi/limit
        models: models, 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 25000 // Chờ tối đa 25s
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Lỗi gọi OpenRouter:", error.message);
    return "AI đang bận một chút, bạn thử lại sau giây lát nhé!";
  }
}

// Route nhận Webhook từ LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Lỗi Webhook:", err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  // Chỉ xử lý tin nhắn văn bản
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userText = event.message.text;
  
  // Gọi hàm xử lý AI
  const aiAnswer = await askAI(userText);

  // Phản hồi lại người dùng trên LINE
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: aiAnswer,
  });
}

// Railway yêu cầu lắng nghe trên 0.0.0.0
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bot LINE đang chạy tại cổng: ${PORT}`);
});
