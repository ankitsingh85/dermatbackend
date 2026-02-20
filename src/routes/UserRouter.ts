import express from "express";
import User from "../models/user";
import { userAuth, UserAuthRequest } from "../middleware/authUser";

const router = express.Router();

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
      profileImage: user.profileImage,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

/* ================= CREATE USER ================= */
router.post("/", async (req, res) => {
  try {
    const {
      patientId,
      name,
      email,
      contactNo,
      address,
      profileImage,
    } = req.body;

    // ✅ STRICT VALIDATION
    if (!patientId || !name || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      patientId,
      name,
      email,
      contactNo,
      address,
      profileImage,
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

router.put("/:id", async (req, res) => {
  try {
    const { name, email, contactNo, address, profileImage, addresses } = req.body;

    const updateData: any = {
      name,
      email,
      contactNo,
      address,
    };

    if (profileImage) {
      updateData.profileImage = profileImage; // ✅ base64 stored
    }
    if (Array.isArray(addresses)) {
      updateData.addresses = addresses;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User updated", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;
