import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

// Routes
import authRoutes from "./routes/AuthRouter";
import userRoutes from "./routes/UserRouter";
import adminRoutes from "./routes/AdminRouter";
import categoryRoutes from "./routes/Category";
import clinicRoutes from "./routes/clinicRoutes";
import productRoutes from "./routes/productRoutes";
import appointmentRoutes from "./routes/appointmentsRoutes";
import doctorRoutes from "./routes/doctorRoutes";
import editClinicRoutes from "./routes/EditClinicRoutes";
import serviceRoutes from "./routes/serviceRoutes";
import offerRoutes from "./routes/offerRotes";
import doctorAdminRoutes from "./routes/admindoctorRoutes";
import serviceCategoryRoutes from "./routes/serviceCategoryRoutes";
import clinicCategoryRoutes from "./routes/clinicCategoryRoutes";
import topProductsRoute from "./routes/TopProducts";
import latestOfferRoutes from "./routes/latestofferRoutes";
import latestShortRoutes from "./routes/latestshortsRoutes";
import quizRoutes from "./routes/quizRoutes";
import treatmentShortsRoutes from "./routes/treatmentshortsRoutes";
import treatmentPlansRoutes from "./routes/treatmentplans";
// import userProfileRoutes from "./routes/userinformationRoutes";
import orderRoutes from "./routes/orderRoutes";
import b2bCategoryRoutes from "./routes/b2bCategories";
import b2bProductRoutes from "./routes/b2bProducts";

dotenv.config();
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8081",
];
const server = express();

// -------------------- MIDDLEWARE --------------------

// server.use(
//   cors({
//     origin: (origin, callback) => {
//       // allow server-to-server / same-origin
//       if (!origin) return callback(null, true);

//       // localhost
//       if (origin === "http://localhost:3000") {
//         return callback(null, true);
//       }

//       // allow ALL vercel deployments
//       if (origin.endsWith(".vercel.app")) {
//         return callback(null, true);
//       }

//       // ❌ DO NOT THROW ERROR
//       return callback(null, false);
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "DELETE"],
//   })
// );


server.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) {
        console.log("✅ Allowed (no origin)");
        return callback(null, true);
      }
 
      // Allow localhost ports
      if (allowedOrigins.includes(origin)) {
        console.log("✅ Allowed localhost:", origin);
        return callback(null, true);
      }
 
      // Allow ALL vercel deployments
      if (/\.vercel\.app$/.test(new URL(origin).hostname)) {
        console.log("✅ Allowed Vercel:", origin);
        return callback(null, true);
      }
 
      // Allow your future live domain (replace with real domain later)
      if (origin.includes("drdermat")) {
        console.log("✅ Allowed live domain:", origin);
        return callback(null, true);
      }
 
      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
 
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
server.options("*", cors());
server.use(express.json({ limit: "100mb" }));

// -------------------- STATIC FILES --------------------
server.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// -------------------- ROOT ROUTE --------------------
server.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

// -------------------- API ROUTES --------------------
server.use("/api/auth", authRoutes);
server.use("/api/users", userRoutes);
server.use("/api/admins", adminRoutes);
server.use("/api/categories", categoryRoutes);
server.use("/api/clinics", clinicRoutes);
server.use("/api/products", productRoutes);
server.use("/api/appointments", appointmentRoutes);
server.use("/api/doctors", doctorRoutes);
server.use("/api/editclinics", editClinicRoutes);
server.use("/api/services", serviceRoutes);
server.use("/api/offers", offerRoutes);
server.use("/api/doctoradmin", doctorAdminRoutes);
server.use("/api/service-categories", serviceCategoryRoutes);
server.use("/api/clinic-categories", clinicCategoryRoutes);
server.use("/api/top-products", topProductsRoute);
server.use("/api/latest-offers", latestOfferRoutes);
server.use("/api/latest-shorts", latestShortRoutes);
server.use("/api/quiz", quizRoutes);
server.use("/api/treatment-shorts", treatmentShortsRoutes);
server.use("/api/treatment-plans", treatmentPlansRoutes);
// server.use("/api/userprofile", userProfileRoutes);
server.use("/api/orders", orderRoutes);
server.use("/api/b2b-categories", b2bCategoryRoutes);
server.use("/api/b2b-products", b2bProductRoutes);

// -------------------- MONGODB CONNECTION --------------------
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server ready on port ${PORT}`);
});


