import multer from "multer";
import path from "path";
import fs from "fs";

// Define upload directory
const uploadPath = path.join(process.cwd(), "uploads");

// Ensure uploads folder exists
fs.mkdirSync(uploadPath, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadPath);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    fieldSize: 10 * 1024 * 1024, // Allow larger rich-text fields
  },
});

export default upload;
