import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import Clinic from "./models/clinic";
import User from "./models/user";

// Routes
import authRoutes from "./routes/AuthRouter";
import userRoutes from "./routes/UserRouter";
import adminRoutes from "./routes/AdminRouter";
import categoryRoutes from "./routes/Category";
import clinicRoutes from "./routes/clinicRoutes";
import productRoutes from "./routes/productRoutes";
import doctorRoutes from "./routes/doctorRoutes";
import editClinicRoutes from "./routes/EditClinicRoutes";
import serviceRoutes from "./routes/serviceRoutes";
import offer1Routes from "./routes/productOfferRoutes";
import offer2Routes from "./routes/treatmentOfferRoutes";
import offer3Routes from "./routes/clinicOfferRoutes";
import doctorAdminRoutes from "./routes/admindoctorRoutes";
import serviceCategoryRoutes from "./routes/serviceCategoryRoutes";
import onlineConsultationServiceRoutes from "./routes/onlineConsultationServiceRoutes";
import clinicCategoryRoutes from "./routes/clinicCategoryRoutes";
import clinicAuthRoutes from "./routes/clinicAuthRoutes";
import businessAuthRoutes from "./routes/businessAuthRoutes";
import topProductsRoute from "./routes/TopProducts";
import latestShortRoutes from "./routes/latestshortsRoutes";
import quizRoutes from "./routes/quizRoutes";
import treatmentShortsRoutes from "./routes/treatmentshortsRoutes";
import treatmentPlansRoutes from "./routes/treatmentplans";
import orderRoutes from "./routes/orderRoutes";
import doctorOrderRoutes from "./routes/doctorOrderRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import b2bCategoryRoutes from "./routes/b2bCategories";
import b2bProductRoutes from "./routes/b2bProducts";
import b2bUserRoutes from "./routes/b2bUserRoutes";
import courseRoutes from "./routes/courseRoutes";
import courseTypeRoutes from "./routes/courseTypeRoutes";
import leadRoutes from "./routes/leadRoutes";
import workshopTrainingRoutes from "./routes/workshopTrainingRoutes";
import trainingTypeRoutes from "./routes/trainingTypeRoutes";
import hiringRequestRoutes from "./routes/hiringRequestRoutes";
import supportTicketRoutes from "./routes/supportTicketRoutes";
import featuredSectionRoutes from "./routes/featuredSectionRoutes";
import Chat from "./models/chat";
import Message from "./models/message";
import reviewRoutes from "./routes/b2breviewRoute";
import clinicReviewRoutes from "./routes/clinicReviewRoute";
// ✅ CHAT ROUTES
import chatRoutes from "./routes/chatRoute";
import messageRoutes from "./routes/messageRoute";
import courseReviewRoutes from "./routes/courseReviewRoutes";
import productReviewRoutes from "./routes/productReviewRoute";
import treatmentReviewRoutes from "./routes/treatmentReviewRoute";
// ✅ EXPRESS APP (rename internally)
const app = express();

// -------------------- MIDDLEWARE --------------------
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin === "http://localhost:3000") return callback(null, true);
      if (origin.endsWith(".vercel.app")) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "100mb" }));

// -------------------- STATIC --------------------
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});
app.use("/api/reviews", reviewRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/products", productRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/editclinics", editClinicRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/offer1", offer1Routes);
app.use("/api/offer2", offer2Routes);
app.use("/api/offer3", offer3Routes);
app.use("/api/doctoradmin", doctorAdminRoutes);
app.use("/api/service-categories", serviceCategoryRoutes);
app.use("/api/online-consultation-services", onlineConsultationServiceRoutes);
app.use("/api/clinic-categories", clinicCategoryRoutes);
app.use("/api/clinic-auth", clinicAuthRoutes);
app.use("/api/business-auth", businessAuthRoutes);
app.use("/api/top-products", topProductsRoute);
app.use("/api/latest-shorts", latestShortRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/treatment-shorts", treatmentShortsRoutes);
app.use("/api/treatment-plans", treatmentPlansRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/doctor-orders", doctorOrderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/b2b-categories", b2bCategoryRoutes);
app.use("/api/b2b-products", b2bProductRoutes);
app.use("/api/b2b-users", b2bUserRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/course-types", courseTypeRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/workshop-trainings", workshopTrainingRoutes);
app.use("/api/training-types", trainingTypeRoutes);
app.use("/api/hiring-requests", hiringRequestRoutes);
app.use("/api/support-tickets", supportTicketRoutes);
app.use("/api/featured-section", featuredSectionRoutes);
app.use("/api/clinic-reviews", clinicReviewRoutes);
app.use("/api/treatment-reviews",treatmentReviewRoutes);

// ✅ CHAT ROUTES
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/course-reviews",courseReviewRoutes);
app.use("/api/product-reviews", productReviewRoutes);
// -------------------- DB --------------------
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // One-time backfill: clinics created before the approval-workflow
    // field existed have no `approvalStatus` in the DB. Without this,
    // Mongoose's schema default ("pending") would apply to them on
    // next read and lock out every already-active clinic. Mark any
    // clinic that predates this field as already approved.
    try {
      const backfilled = await Clinic.updateMany(
        { approvalStatus: { $exists: false } },
        { $set: { approvalStatus: "approved" } }
      );
      if (backfilled.modifiedCount) {
        console.log(
          `✅ Backfilled approvalStatus="approved" for ${backfilled.modifiedCount} pre-existing clinic(s)`
        );
      }
    } catch (migrationErr) {
      console.error("⚠️ Clinic approvalStatus backfill failed:", migrationErr);
    }

    // One-time repair: the old `email` unique index on User was NOT
    // sparse, so once email became optional, a second user with no
    // email would fail to save (a non-sparse unique index treats every
    // missing value as the same "null" and rejects the duplicate).
    // Drop the old index and let Mongoose rebuild it from the schema
    // (unique + sparse) so multiple emailless users can coexist.
    try {
      const existingIndexes = await User.collection.indexes();
      const staleEmailIndex = existingIndexes.find(
        (index) => index.key?.email === 1 && !index.sparse
      );
      if (staleEmailIndex?.name) {
        await User.collection.dropIndex(staleEmailIndex.name);
        console.log("✅ Dropped stale non-sparse email index on User");
      }
      await User.syncIndexes();
    } catch (migrationErr) {
      console.error("⚠️ User email index repair failed:", migrationErr);
    }
  })
  .catch((err) => console.error("❌ MongoDB error:", err));

// ================= SOCKET =================
const httpServer = http.createServer(app);
const allowedOrigins = [
  "http://localhost:3000",
  "https://drmatfrontend.vercel.app",
];

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }

      return callback(new Error("Socket CORS blocked"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const users = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("🔥 Socket connected:", socket.id);

  socket.on("register", (userId: string) => {
    users.set(userId, socket.id);
    io.emit("presence_online", { id: userId });
  });

  socket.on("check_online", (id: string, callback: (online: boolean) => void) => {
    if (typeof callback === "function") callback(users.has(id));
  });

  socket.on("send_message", (data) => {
    const receiverSocket = users.get(data.receiverId);

    if (receiverSocket) {
      io.to(receiverSocket).emit("receive_message", data);
    }
  });

  socket.on("chat_request_created", (data) => {
    const receiverSocket = users.get(data.doctorId);

    if (receiverSocket) {
      io.to(receiverSocket).emit("chat_request_created", data);
    }
  });

  socket.on("chat_status_updated", (data) => {
    const receiverSocket = users.get(data.userId);

    if (receiverSocket) {
      io.to(receiverSocket).emit("chat_status_updated", data);
    }
  });

  socket.on("chat_deleted", (data) => {
    const receiverSocket = users.get(data.to);

    if (receiverSocket) {
      io.to(receiverSocket).emit("chat_deleted", data);
    }
  });

  const emitToUser = (
    userId: string | undefined,
    eventName: string,
    data: any,
  ) => {
    if (!userId) return;

    const userSocket = users.get(userId);

    if (userSocket) {
      io.to(userSocket).emit(eventName, data);
    }
  };

  const createCallHistoryMessage = async (data: {
    chatId?: string;
    from?: string;
    to?: string;
    callType?: "audio" | "video";
  }) => {
    if (!data.chatId || !data.from || !data.to) return null;

    const label = data.callType === "audio" ? "Audio call" : "Video call";
    const message = await Message.create({
      chatId: data.chatId,
      senderId: data.from,
      receiverId: data.to,
      message: `${label} started`,
      messageType: "call",
      callType: data.callType || "video",
      callStatus: "started",
    });

    await Chat.findByIdAndUpdate(data.chatId, {
      lastMessage: message.message,
    });

    return {
      _id: String(message._id),
      chatId: String(message.chatId),
      senderId: message.senderId,
      receiverId: message.receiverId,
      message: message.message,
      messageType: message.messageType,
      callType: message.callType,
      callStatus: message.callStatus,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  };

  const relayCallSignal = (eventName: string, data: { to?: string }) => {
    if (!data?.to) return;

    emitToUser(data.to, eventName, data);
  };

  socket.on("call:invite", async (data) => {
    try {
      const callMessage = await createCallHistoryMessage(data);

      if (callMessage) {
        emitToUser(data.from, "receive_message", callMessage);
        emitToUser(data.to, "receive_message", callMessage);
      }
    } catch (err) {
      console.error("Call history save error:", err);
    }

    relayCallSignal("call:invite", data);
  });
  socket.on("call:accepted", (data) => relayCallSignal("call:accepted", data));
  socket.on("call:rejected", (data) => relayCallSignal("call:rejected", data));
  socket.on("call:offer", (data) => relayCallSignal("call:offer", data));
  socket.on("call:answer", (data) => relayCallSignal("call:answer", data));
  socket.on("call:ice-candidate", (data) =>
    relayCallSignal("call:ice-candidate", data),
  );
  socket.on("call:ended", (data) => relayCallSignal("call:ended", data));

  socket.on("disconnect", () => {
    for (const [key, value] of users.entries()) {
      if (value === socket.id) {
        users.delete(key);
        io.emit("presence_offline", { id: key });
      }
    }
  });
});

// -------------------- START --------------------
const PORT = process.env.PORT || 8080;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server + Socket running on ${PORT}`);
});
