import express from "express";
import Chat from "../models/chat";

const router = express.Router();

const formatChatForDoctor = (chat: any) => ({
  _id: chat._id,
  user: chat.userId,
  lastMessage: chat.lastMessage || "",
  status: chat.status || "accepted",
  requestedAt: chat.requestedAt,
  respondedAt: chat.respondedAt,
  updatedAt: chat.updatedAt,
});

router.post("/", async (req, res) => {
  try {
    const { doctorId, userId } = req.body;

    if (!doctorId || !userId) {
      return res.status(400).json({ error: "doctorId and userId are required." });
    }

    let chat = await Chat.findOne({ doctorId, userId });

    if (!chat) {
      chat = await Chat.create({ doctorId, userId, status: "pending" });
    } else if (chat.status === "declined") {
      chat.status = "pending";
      chat.requestedAt = new Date();
      chat.respondedAt = undefined;
      await chat.save();
    } else if (!chat.status) {
      chat.status = "accepted";
      await chat.save();
    }

    res.json(chat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:chatId/status", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status, doctorId } = req.body;

    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ error: "Status must be accepted or declined." });
    }

    const chat = await Chat.findById(chatId).populate(
      "userId",
      "name email contactNo profileImage patientId"
    );

    if (!chat) {
      return res.status(404).json({ error: "Chat request not found." });
    }

    if (doctorId && String(chat.doctorId) !== String(doctorId)) {
      return res.status(403).json({ error: "You cannot update this chat request." });
    }

    chat.status = status;
    chat.respondedAt = new Date();
    await chat.save();

    res.json(formatChatForDoctor(chat));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user/:userId/doctor/:doctorId", async (req, res) => {
  try {
    const { userId, doctorId } = req.params;
    const chat = await Chat.findOne({ userId, doctorId });

    res.json(chat || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/doctor/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;

    const chats = await Chat.find({ doctorId })
      .populate("userId", "name email contactNo profileImage patientId")
      .sort({ updatedAt: -1 });

    res.json(chats.map(formatChatForDoctor));
  } catch (err: any) {
    console.error("Doctor chat fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
