import express from "express";
import Chat from "../models/chat";
import Message from "../models/message";
import { resolveChatClosure } from "../utils/chatLifecycle";

const router = express.Router();

const formatChatForDoctor = (chat: any) => ({
  _id: chat._id,
  user: chat.userId,
  lastMessage: chat.lastMessage || "",
  status: chat.status || "accepted",
  requestedAt: chat.requestedAt,
  respondedAt: chat.respondedAt,
  updatedAt: chat.updatedAt,
  source: chat.source || "direct",
  consultationExpiresAt: chat.consultationExpiresAt || null,
  closedAt: chat.closedAt || null,
  closedBy: chat.closedBy || null,
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

// 👉 DOCTOR: End an online-consultation chat early. Once closed, no one can
// send messages, attachments, prescriptions, or start a call in it again —
// the same end state it would reach on its own after the 7-day window.
router.patch("/:chatId/close", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { doctorId } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: "Chat request not found." });
    }
    if (!doctorId || String(chat.doctorId) !== String(doctorId)) {
      return res.status(403).json({ error: "You cannot close this chat." });
    }
    if (chat.source !== "consultation") {
      return res.status(400).json({ error: "Only online-consultation chats can be closed." });
    }
    if (chat.closedAt) {
      return res.json(formatChatForDoctor(chat));
    }

    chat.closedAt = new Date();
    chat.closedBy = "doctor";
    await chat.save();

    res.json(formatChatForDoctor(chat));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { doctorId, userId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ error: "Chat request not found." });
    }

    const isDoctor = doctorId && String(chat.doctorId) === String(doctorId);
    const isUser = userId && String(chat.userId) === String(userId);

    if (!isDoctor && !isUser) {
      return res.status(403).json({ error: "You cannot delete this chat." });
    }

    await Message.deleteMany({ chatId });
    await Chat.findByIdAndDelete(chatId);

    res.json({
      success: true,
      chatId,
      doctorId: String(chat.doctorId),
      userId: String(chat.userId),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user/:userId/doctor/:doctorId", async (req, res) => {
  try {
    const { userId, doctorId } = req.params;
    const chat = await Chat.findOne({ userId, doctorId });
    if (chat) await resolveChatClosure(chat);

    res.json(chat || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/doctor/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Sorted by when the patient's booking/chat request came in, not by
    // last message activity — otherwise a doctor's patient list reshuffles
    // every time any one of them sends a new message, which makes multiple
    // bookings for the same doctor impossible to track in order.
    const chats = await Chat.find({ doctorId })
      .populate("userId", "name email contactNo profileImage patientId")
      .sort({ requestedAt: -1 });

    // Lazily close any consultation chat whose 7-day window has passed —
    // there's no background job, so this is resolved whenever the doctor's
    // inbox is loaded instead.
    await Promise.all(chats.map((chat) => resolveChatClosure(chat)));

    res.json(chats.map(formatChatForDoctor));
  } catch (err: any) {
    console.error("Doctor chat fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
