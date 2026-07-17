import express from "express";
import fs from "fs";
import Message from "../models/message";
import Chat from "../models/chat";
import upload from "../middleware/uploads";

const router = express.Router();

// 👉 Send an image or PDF attachment
router.post("/send-attachment", upload.single("file"), async (req, res) => {
  const file = req.file;

  try {
    const { chatId, senderId, receiverId, message } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const mimetype = file.mimetype || "";
    const attachmentType = mimetype.startsWith("image/")
      ? "image"
      : mimetype === "application/pdf"
      ? "pdf"
      : null;

    if (!attachmentType) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ error: "Only image or PDF attachments are supported." });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      fs.unlink(file.path, () => {});
      return res.status(404).json({ error: "Chat request not found." });
    }

    if ((chat.status || "accepted") !== "accepted") {
      fs.unlink(file.path, () => {});
      return res.status(403).json({ error: "Doctor must accept the chat request first." });
    }

    const newMessage = await Message.create({
      chatId,
      senderId,
      receiverId,
      message: message || "",
      messageType: "text",
      attachmentUrl: `/uploads/${file.filename}`,
      attachmentType,
      attachmentName: file.originalname,
    });

    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: attachmentType === "image" ? "📷 Photo" : "📄 Document",
    });

    res.json(newMessage);
  } catch (err: any) {
    if (file) fs.unlink(file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

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
      messageType: "text",
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
