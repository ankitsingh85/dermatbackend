import express from "express";
import fs from "fs";
import path from "path";
import User from "../models/user";
import { userAuth, UserAuthRequest } from "../middleware/authUser";
import upload from "../middleware/uploads";

const router = express.Router();

const nameRegex = /^[A-Za-z ]+$/;
const contactRegex = /^\d{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseJsonArray = <T,>(value: unknown): T[] | undefined => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
};

const getUploadedPath = (file: Express.Multer.File | undefined) => {
  if (!file) return undefined;
  return `/uploads/${file.filename}`;
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined) => {
  if (!files?.length) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const deleteStoredFile = async (storedPath?: string | null) => {
  if (!storedPath || !storedPath.startsWith("/uploads/")) return;

  const absolutePath = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  try {
    await fs.promises.unlink(absolutePath);
  } catch {
    // ignore cleanup failures
  }
};

/* ================= GET CURRENT USER (ME) ================= */
router.get("/me", userAuth, async (req: UserAuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      _id: user._id,
      patientId: user.patientId,
      name: user.name,
      email: user.email,
      contactNo: user.contactNo,
      address: user.address,
      addresses: user.addresses || [],
      cartItems: user.cartItems || [],
      wishlistItems: user.wishlistItems || [],
      resultGallery: user.resultGallery || [],
      prescriptions: user.prescriptions || [],
      testReports: user.testReports || [],
      profileImage: user.profileImage,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

/* ================= CREATE USER ================= */
router.post("/", upload.single("profileImage"), async (req, res) => {
  try {
    const {
      patientId,
      name,
      email,
      contactNo,
      address,
      profileImage,
    } = req.body;
    const uploadedProfileImage = getUploadedPath(req.file);
    const resolvedPatientId = patientId
      ? String(patientId).trim()
      : `PAT-${Date.now().toString().slice(-6)}`;
    const cleanName = String(name ?? "").trim();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanContactNo = String(contactNo ?? "").trim();
    const cleanAddress = String(address ?? "").trim();

    if (!cleanName || !cleanEmail || !cleanContactNo || !cleanAddress) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!nameRegex.test(cleanName)) {
      return res
        .status(400)
        .json({ message: "Patient name should contain only letters and spaces" });
    }

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (!contactRegex.test(cleanContactNo)) {
      return res
        .status(400)
        .json({ message: "Contact No. must contain exactly 10 digits" });
    }

    const exists = await User.findOne({
      $or: [{ email: cleanEmail }, { contactNo: cleanContactNo }, { patientId: resolvedPatientId }],
    });
    if (exists) {
      return res.status(400).json({ message: "User with same email, contact number or ID already exists" });
    }

    const user = await User.create({
      patientId: resolvedPatientId,
      name: cleanName,
      email: cleanEmail,
      contactNo: cleanContactNo,
      address: cleanAddress,
      profileImage: uploadedProfileImage || profileImage,
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        patientId: user.patientId,
        name: user.name,
        email: user.email,
        contactNo: user.contactNo,
        address: user.address,
        profileImage: user.profileImage,
      },
    });
  } catch (err: any) {
    console.error("Create user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= GET ALL USERS ================= */
router.get("/", async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ================= GET USER BY EMAIL ================= */
router.get("/by-email/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const user = await User.findOne({ email }).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

/* ================= GET USER BY ID ================= */
router.get("/:id", async (req, res, next) => {
  if (
    req.params.id === "me" ||
    req.params.id === "by-email" ||
    req.params.id === "upload-prescription" ||
    req.params.id === "upload-report"
  ) {
    return next();
  }

  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

/* ================= UPLOAD RESULT GALLERY ================= */
router.post(
  "/:id/result-gallery",
  upload.fields([
    { name: "beforeImage", maxCount: 1 },
    { name: "afterImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, note } = req.body;
      const files = req.files as
        | {
            beforeImage?: Express.Multer.File[];
            afterImage?: Express.Multer.File[];
          }
        | undefined;

      const beforeImage = getUploadedPath(files?.beforeImage?.[0]);
      const afterImage = getUploadedPath(files?.afterImage?.[0]);

      if (!beforeImage && !afterImage) {
        return res.status(400).json({
          message: "At least one image is required",
        });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.resultGallery = user.resultGallery || [];
      user.resultGallery.unshift({
        title: String(title || "").trim(),
        note: String(note || "").trim(),
        beforeImage: beforeImage || "",
        afterImage: afterImage || "",
        uploadedAt: new Date(),
      });

      await user.save();

      res.status(201).json({
        message: "Gallery item uploaded successfully",
        resultGallery: user.resultGallery,
      });
    } catch (err: any) {
      console.error("Upload gallery error:", err);
      res.status(500).json({ message: "Failed to upload gallery item" });
    }
  }
);

/* ================= DELETE RESULT GALLERY ITEM ================= */
router.delete("/:id/result-gallery/:itemId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const side = String(req.query.side || "").toLowerCase();
    const gallery = user.resultGallery || [];
    const matchedItem = gallery.find(
      (item: any) => item?._id?.toString() === req.params.itemId
    );

    if (matchedItem && (side === "before" || side === "after")) {
      const field = side === "before" ? "beforeImage" : "afterImage";
      await deleteStoredFile((matchedItem as any)[field]);
      (matchedItem as any)[field] = "";

      user.resultGallery = gallery.filter((item: any) => {
        if (item?._id?.toString() !== req.params.itemId) return true;
        return Boolean(item.beforeImage || item.afterImage);
      });
    } else if (matchedItem) {
      await deleteStoredFile((matchedItem as any).beforeImage);
      await deleteStoredFile((matchedItem as any).afterImage);
      user.resultGallery = gallery.filter(
        (item: any) => item?._id?.toString() !== req.params.itemId
      );
    }

    await user.save();

    res.json({
      message: "Gallery item deleted successfully",
      resultGallery: user.resultGallery,
    });
  } catch (err: any) {
    console.error("Delete gallery error:", err);
    res.status(500).json({ message: "Failed to delete gallery item" });
  }
});

/* ================= UPLOAD TEST REPORT ================= */
router.post(
  "/:id/test-reports",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Test report file is required" });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.testReports = user.testReports || [];
      user.testReports.unshift({
        fileName: req.file.originalname,
        fileUrl: getUploadedPath(req.file) || "",
        fileType: req.file.mimetype,
        uploadedAt: new Date(),
      });

      await user.save();

      res.status(201).json({
        message: "Test report uploaded successfully",
        testReports: user.testReports,
      });
    } catch (err: any) {
      console.error("Upload test report error:", err);
      res.status(500).json({ message: "Failed to upload test report" });
    }
  }
);

/* ================= DELETE TEST REPORT ================= */
router.delete("/:id/test-reports/:itemId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const target = (user.testReports || []).find(
      (item: any) => item?._id?.toString() === req.params.itemId
    );
    if (target) {
      await deleteStoredFile(target.fileUrl);
    }

    user.testReports = (user.testReports || []).filter(
      (item: any) => item?._id?.toString() !== req.params.itemId
    );
    await user.save();

    res.json({
      message: "Test report deleted successfully",
      testReports: user.testReports,
    });
  } catch (err: any) {
    console.error("Delete test report error:", err);
    res.status(500).json({ message: "Failed to delete test report" });
  }
});

/* ================= UPLOAD PRESCRIPTION PDF ================= */
router.post(
  "/:id/prescriptions",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Prescription PDF is required" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "Only PDF files are allowed" });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.prescriptions = user.prescriptions || [];
      user.prescriptions.unshift({
        fileName: req.file.originalname,
        fileUrl: getUploadedPath(req.file) || "",
        fileType: req.file.mimetype,
        uploadedAt: new Date(),
      });

      await user.save();

      res.status(201).json({
        message: "Prescription uploaded successfully",
        prescriptions: user.prescriptions,
      });
    } catch (err: any) {
      console.error("Upload prescription error:", err);
      res.status(500).json({ message: "Failed to upload prescription" });
    }
  }
);

/* ================= DELETE PRESCRIPTION ================= */
router.delete("/:id/prescriptions/:itemId", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.prescriptions = (user.prescriptions || []).filter(
      (item: any) => item?._id?.toString() !== req.params.itemId
    );
    await user.save();

    res.json({
      message: "Prescription deleted successfully",
      prescriptions: user.prescriptions,
    });
  } catch (err: any) {
    console.error("Delete prescription error:", err);
    res.status(500).json({ message: "Failed to delete prescription" });
  }
});

/* ================= DELETE USER ================= */
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

router.put("/:id", upload.single("profileImage"), async (req, res) => {
  try {
    const {
      name,
      email,
      contactNo,
      address,
      profileImage,
      addresses,
      cartItems,
      wishlistItems,
    } = req.body;

    const updateData: any = {};

    // ---------------------------
    // ✅ BASIC FIELDS
    // ---------------------------
    if (name !== undefined) {
      updateData.name = String(name).trim();
    }

    if (email !== undefined) {
      updateData.email = String(email).trim().toLowerCase();
    }

    if (contactNo !== undefined) {
      updateData.contactNo = String(contactNo).trim();
    }

    if (address !== undefined) {
      updateData.address = String(address).trim();
    }

    // ---------------------------
    // ✅ IMAGE HANDLING (WEB + MOBILE)
    // ---------------------------

    const uploadedProfileImage = req.file
      ? `/uploads/${req.file.filename}`
      : null;

    if (uploadedProfileImage) {
      // ✅ Web file upload
      updateData.profileImage = uploadedProfileImage;
    } else if (
      typeof profileImage === "string" &&
      profileImage.startsWith("data:image")
    ) {
      // ✅ Mobile base64 image
      updateData.profileImage = profileImage;
    }

    // ❌ DO NOT overwrite if not sent

    // ---------------------------
    // ✅ ADDRESS PARSING (SUPER SAFE)
    // ---------------------------

    let parsedAddresses: any[] | undefined;

    if (Array.isArray(addresses)) {
      // ✅ Mobile JSON case
      parsedAddresses = addresses;
    } else if (typeof addresses === "string") {
      // ✅ Web FormData case
      try {
        parsedAddresses = JSON.parse(addresses);
      } catch (err) {
        console.log("❌ Address parse error:", err);
      }
    }

    if (parsedAddresses && Array.isArray(parsedAddresses)) {
      updateData.addresses = parsedAddresses;
    }

    // ---------------------------
    // ✅ CART ITEMS (SAFE)
    // ---------------------------

    let parsedCart: any[] | undefined;

    if (Array.isArray(cartItems)) {
      parsedCart = cartItems;
    } else if (typeof cartItems === "string") {
      try {
        parsedCart = JSON.parse(cartItems);
      } catch {}
    }

    if (parsedCart) {
      updateData.cartItems = parsedCart;
    }

    // ---------------------------
    // ✅ WISHLIST ITEMS (SAFE)
    // ---------------------------

    let parsedWishlist: any[] | undefined;

    if (Array.isArray(wishlistItems)) {
      parsedWishlist = wishlistItems;
    } else if (typeof wishlistItems === "string") {
      try {
        parsedWishlist = JSON.parse(wishlistItems);
      } catch {}
    }

    if (parsedWishlist) {
      updateData.wishlistItems = parsedWishlist;
    }

    // ---------------------------
    // ✅ UPDATE USER
    // ---------------------------

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      message: "User updated successfully",
      user,
    });

  } catch (err: any) {
    console.error("🔥 UPDATE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message, // 👈 now you'll see real error
    });
  }
});


export default router;
