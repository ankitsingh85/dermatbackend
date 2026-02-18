import express from "express";
import User from "../models/user";

const router = express.Router();

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
    const { name, email, contactNo, address, profileImage } = req.body;

    const updateData: any = {
      name,
      email,
      contactNo,
      address,
      profileImage,
    };

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;
