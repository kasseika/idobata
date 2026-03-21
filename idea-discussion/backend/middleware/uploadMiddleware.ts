/**
 * ファイルアップロードミドルウェア
 *
 * 目的: multer を使用した画像ファイルのアップロード処理を提供する。
 * 注意: 対応形式は JPEG・PNG・GIF のみ。最大ファイルサイズは 5MB。
 *       一時保存先は uploads/temp ディレクトリ。
 *       @types/multer は未インストールのため、ファイルオブジェクトは最小限の型で定義する。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempDir = path.join(__dirname, "../uploads/temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export const logRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.log("Request headers:", req.headers);
  console.log("Request method:", req.method);
  console.log("Request URL:", req.url);
  console.log("Content-Type:", req.headers["content-type"]);
  next();
};

/** multer ファイルオブジェクトの最小限の型定義 */
interface UploadFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(
      "Multer destination called with file:",
      (file as UploadFile).originalname
    );
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    console.log(
      "Multer filename called with file:",
      (file as UploadFile).originalname
    );
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(
      null,
      `${(file as UploadFile).fieldname}-${uniqueSuffix}${path.extname((file as UploadFile).originalname)}`
    );
  },
});

const fileFilter = (
  req: Request,
  file: UploadFile,
  cb: (error: Error | null, accept?: boolean) => void
): void => {
  console.log("Multer fileFilter called with file:", file);
  const allowedTypes = ["image/jpeg", "image/png", "image/gif"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "許可されていないファイル形式です。JPG、PNG、GIF画像のみ対応しています。"
      ),
      false
    );
  }
};

const limits = {
  fileSize: 5 * 1024 * 1024,
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter as multer.Options["fileFilter"],
  limits: limits,
});
