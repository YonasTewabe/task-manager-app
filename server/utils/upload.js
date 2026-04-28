import fs from "fs";
import path from "path";
import multer from "multer";

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function resolveUploadDirectory(subDir = "") {
  const baseUploadDir = process.env.UPLOAD_DIR || "uploads";
  const target = path.resolve(process.cwd(), baseUploadDir, subDir);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function sanitizeFilename(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  const name = path.basename(filename || "file", ext).replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${Date.now()}-${name || "file"}${ext}`;
}

function createFileFilter(allowedMimeTypes = []) {
  const allowedSet = new Set(allowedMimeTypes);
  return (_req, file, callback) => {
    if (!allowedSet.size || allowedSet.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Unsupported file type: ${file.mimetype}`));
  };
}

export function createUploadMiddleware(options = {}) {
  const {
    subDir = "",
    maxFileSizeBytes = Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES) || DEFAULT_MAX_FILE_SIZE_BYTES,
    allowedMimeTypes = [],
  } = options;

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, resolveUploadDirectory(subDir)),
    filename: (_req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  });

  return multer({
    storage,
    limits: { fileSize: maxFileSizeBytes },
    fileFilter: createFileFilter(allowedMimeTypes),
  });
}

export function handleUploadError(error, res, fallbackMessage = "File upload failed") {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Uploaded file is too large" });
    }
    return res.status(400).json({ error: error.message });
  }

  if (error) {
    return res.status(400).json({ error: error.message || fallbackMessage });
  }

  return null;
}
