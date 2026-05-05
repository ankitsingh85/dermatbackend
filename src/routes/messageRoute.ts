import express from "express";
import Message from "../models/message";
import Chat from "../models/chat";

const router = express.Router();

// 👉 Send message
router.post("/send", async (req, res) => {
  try {
    const { chatId, senderId, receiverId, message } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ error: "Chat request not found." });
    }

    if ((chat.status || "accepted") !== "accepted") {
      return res.status(403).json({ error: "Doctor must accept the chat request first." });
    }

    const newMessage = await Message.create({
      chatId,
      senderId,
      receiverId,
      message,
    });

    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: message,
    });

    res.json(newMessage);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 👉 Get messages
router.get("/:chatId", async (req, res) => {
  try {
    const messages = await Message.find({
      chatId: req.params.chatId,
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
