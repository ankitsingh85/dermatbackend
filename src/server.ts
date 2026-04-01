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
import offer1Routes from "./routes/productOfferRoutes";
import offer2Routes from "./routes/treatmentOfferRoutes";
import offer3Routes from "./routes/clinicOfferRoutes";
import doctorAdminRoutes from "./routes/admindoctorRoutes";
import serviceCategoryRoutes from "./routes/serviceCategoryRoutes";
import clinicCategoryRoutes from "./routes/clinicCategoryRoutes";
import clinicAuthRoutes from "./routes/clinicAuthRoutes";
import topProductsRoute from "./routes/TopProducts";
import latestShortRoutes from "./routes/latestshortsRoutes";
import quizRoutes from "./routes/quizRoutes";
import treatmentShortsRoutes from "./routes/treatmentshortsRoutes";
import treatmentPlansRoutes from "./routes/treatmentplans";
// import userProfileRoutes from "./routes/userinformationRoutes";
import orderRoutes from "./routes/orderRoutes";
import b2bCategoryRoutes from "./routes/b2bCategories";
import b2bProductRoutes from "./routes/b2bProducts";
import courseRoutes from "./routes/courseRoutes";
import courseTypeRoutes from "./routes/courseTypeRoutes";

dotenv.config();

const server = express();

// -------------------- MIDDLEWARE --------------------
server.use(
  cors({
    origin: (origin, callback) => {
      // allow server-to-server / same-origin
      if (!origin) return callback(null, true);

      // localhost
      if (origin === "http://localhost:3000") {
        return callback(null, true);
      }

      // allow ALL vercel deployments
      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }

      // ❌ DO NOT THROW ERROR
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);


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
server.use("/api/offer1", offer1Routes);
server.use("/api/offer2", offer2Routes);
server.use("/api/offer3", offer3Routes);
server.use("/api/doctoradmin", doctorAdminRoutes);
server.use("/api/service-categories", serviceCategoryRoutes);
server.use("/api/clinic-categories", clinicCategoryRoutes);
server.use("/api/clinic-auth", clinicAuthRoutes);
server.use("/api/top-products", topProductsRoute);
server.use("/api/latest-shorts", latestShortRoutes);
server.use("/api/quiz", quizRoutes);
server.use("/api/treatment-shorts", treatmentShortsRoutes);
server.use("/api/treatment-plans", treatmentPlansRoutes);
// server.use("/api/userprofile", userProfileRoutes);
server.use("/api/orders", orderRoutes);
server.use("/api/b2b-categories", b2bCategoryRoutes);
server.use("/api/b2b-products", b2bProductRoutes);
server.use("/api/courses", courseRoutes);
server.use("/api/course-types", courseTypeRoutes);
//console.log
// -------------------- MONGODB CONNECTION --------------------
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error err:", err));

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server ready on port ${PORT}`);
});


