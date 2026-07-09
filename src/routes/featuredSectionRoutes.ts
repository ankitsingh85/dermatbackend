import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import FeaturedSection from "../models/featuredSection";
import upload from "../middleware/uploads";

const router = express.Router();

const REQUIRED_WIDTH = 473;
const REQUIRED_HEIGHT = 300;

const getUploadedPath = (file?: Express.Multer.File) =>
  file ? `/uploads/${file.filename}` : "";

const deleteStoredFile = async (storedPath?: string | null) => {
  if (!storedPath || !storedPath.startsWith("/uploads/")) return;

  const absolutePath = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  try {
    await fs.promises.unlink(absolutePath);
  } catch {
    // Ignore files that were already removed.
  }
};

const readUInt24LE = (buffer: Buffer, offset: number) =>
  buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

const getImageDimensions = (buffer: Buffer) => {
  const isPng =
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  if (isPng) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  const isJpeg = buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
  if (isJpeg) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker);

      if (isSof) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + length;
    }
  }

  const isWebp =
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (isWebp) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: readUInt24LE(buffer, 24) + 1,
        height: readUInt24LE(buffer, 27) + 1,
      };
    }

    if (chunk === "VP8L") {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }

    if (chunk === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  return null;
};

const validateFeaturedImage = async (file: Express.Multer.File) => {
  const buffer = await fs.promises.readFile(file.path);
  const dimensions = getImageDimensions(buffer);

  if (!dimensions) {
    throw new Error("Only PNG, JPG, JPEG or WEBP images are supported");
  }

  if (
    dimensions.width !== REQUIRED_WIDTH ||
    dimensions.height !== REQUIRED_HEIGHT
  ) {
    throw new Error(
      `Image must be exactly ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}px. Uploaded image is ${dimensions.width}x${dimensions.height}px`,
    );
  }
};

router.get("/", async (_req: Request, res: Response) => {
  try {
    const items = await FeaturedSection.find()
      .sort({ sortOrder: 1, createdAt: 1 });

    res.json(items);
  } catch (err: any) {
    res.status(500).json({
      message: "Failed to fetch featured section",
      error: err.message,
    });
  }
});

router.get("/active", async (_req: Request, res: Response) => {
  try {
    const items = await FeaturedSection.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 });

    res.json(items);
  } catch (err: any) {
    res.status(500).json({
      message: "Failed to fetch featured section",
      error: err.message,
    });
  }
});

router.post("/", upload.single("image"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const heading = String(req.body.heading ?? "").trim();
    const link = String(req.body.link ?? "/#").trim() || "/#";
    const sortOrder = Number(req.body.sortOrder ?? 0);

    if (!file) return res.status(400).json({ message: "Image is required" });
    if (!heading) {
      await deleteStoredFile(getUploadedPath(file));
      return res.status(400).json({ message: "Heading is required" });
    }

    await validateFeaturedImage(file);

    const item = await FeaturedSection.create({
      imageUrl: getUploadedPath(file),
      heading,
      link,
      sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
      isActive: req.body.isActive !== "false",
    });

    res.status(201).json(item);
  } catch (err: any) {
    if (req.file) await deleteStoredFile(getUploadedPath(req.file));
    res.status(400).json({
      message: err.message || "Failed to create featured item",
    });
  }
});

router.put("/:id", upload.single("image"), async (req: Request, res: Response) => {
  try {
    const existing = await FeaturedSection.findById(req.params.id);
    if (!existing) {
      if (req.file) await deleteStoredFile(getUploadedPath(req.file));
      return res.status(404).json({ message: "Featured item not found" });
    }

    const updatePayload: Record<string, unknown> = {};

    if (req.body.heading !== undefined) {
      const heading = String(req.body.heading ?? "").trim();
      if (!heading) {
        if (req.file) await deleteStoredFile(getUploadedPath(req.file));
        return res.status(400).json({ message: "Heading is required" });
      }
      updatePayload.heading = heading;
    }

    if (req.body.link !== undefined) {
      updatePayload.link = String(req.body.link ?? "").trim() || "/#";
    }

    if (req.body.sortOrder !== undefined) {
      const sortOrder = Number(req.body.sortOrder);
      updatePayload.sortOrder = Number.isNaN(sortOrder) ? 0 : sortOrder;
    }

    if (req.body.isActive !== undefined) {
      updatePayload.isActive = req.body.isActive !== "false";
    }

    if (req.file) {
      await validateFeaturedImage(req.file);
      updatePayload.imageUrl = getUploadedPath(req.file);
    }

    const updated = await FeaturedSection.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true },
    );

    if (req.file) await deleteStoredFile(existing.imageUrl);

    res.json(updated);
  } catch (err: any) {
    if (req.file) await deleteStoredFile(getUploadedPath(req.file));
    res.status(400).json({
      message: err.message || "Failed to update featured item",
    });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await FeaturedSection.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Featured item not found" });
    }

    await deleteStoredFile(deleted.imageUrl);

    res.json({ message: "Featured item deleted successfully" });
  } catch (err: any) {
    res.status(500).json({
      message: "Failed to delete featured item",
      error: err.message,
    });
  }
});

export default router;
