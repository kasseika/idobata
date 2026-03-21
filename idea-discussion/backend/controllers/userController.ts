/**
 * ユーザーコントローラー
 *
 * 目的: ユーザー情報取得・表示名更新・プロフィール画像アップロードAPIを提供する。
 * 注意: MongoDB 接続失敗時はインメモリストアへフォールバックする。
 */

import path from "node:path";
import type { Request, Response } from "express";
import User from "../models/User.js";
import { createStorageService } from "../services/storage/storageServiceFactory.js";
import type { MulterFile } from "../services/storage/storageServiceInterface.js";
import { generateRandomDisplayName } from "../utils/displayNameGenerator.js";

const fallbackPort = process.env.PORT || "3100";
const storageService = createStorageService("local", {
  baseUrl: process.env.API_BASE_URL || `http://localhost:${fallbackPort}`,
});

const inMemoryUsers = new Map<
  string,
  {
    userId: string;
    displayName: string;
    profileImagePath: string | null;
    save?: (...args: unknown[]) => Promise<unknown>;
  }
>();

/**
 * ユーザーを DB またはインメモリストアから取得する。
 * 存在しない場合はデフォルト表示名で新規作成する。
 */
export const getUser = async (userId: string) => {
  try {
    let user = await User.findOne({ userId });
    if (user) return user;

    const defaultDisplayName = generateRandomDisplayName();
    user = new User({
      userId,
      displayName: defaultDisplayName,
      profileImagePath: null,
    });
    await user.save();
    return user;
  } catch (error) {
    console.warn("MongoDB not available, using in-memory store");
  }

  if (!inMemoryUsers.has(userId)) {
    const defaultDisplayName = generateRandomDisplayName();
    inMemoryUsers.set(userId, {
      userId,
      displayName: defaultDisplayName,
      profileImagePath: null,
    });
  }

  return inMemoryUsers.get(userId);
};

/**
 * ユーザーを DB またはインメモリストアへ保存する。
 */
const saveUser = async (user: {
  userId: string;
  displayName: string;
  profileImagePath: string | null;
  save?: (...args: unknown[]) => Promise<unknown>;
}) => {
  try {
    if (user.save) {
      await user.save();
      return;
    }
  } catch (error) {
    console.warn("MongoDB not available, using in-memory store");
  }

  inMemoryUsers.set(user.userId, user);
};

/**
 * userId によるユーザー情報取得
 */
export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await getUser(userId);

    return res.status(200).json({
      displayName: user?.displayName,
      profileImagePath: user?.profileImagePath
        ? storageService.getFileUrl(user.profileImagePath)
        : null,
    });
  } catch (error) {
    console.error("Error getting user info:", error);
    return res.status(500).json({
      error: "Failed to get user information",
    });
  }
};

/**
 * ユーザー表示名の更新
 */
export const updateUserDisplayName = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { displayName } = req.body;

    if (!displayName) {
      return res.status(400).json({
        error: "Display name is required",
      });
    }

    const user = await getUser(userId);
    if (user) {
      user.displayName = displayName;
      await saveUser(user);
    }

    return res.status(200).json({
      success: true,
      message: "Display name updated successfully",
    });
  } catch (error) {
    console.error("Error updating display name:", error);
    return res.status(500).json({
      error: "Failed to update display name",
    });
  }
};

/**
 * プロフィール画像のアップロード
 */
export const uploadProfileImage = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const multerReq = req as Request & { file?: MulterFile };
    const file = multerReq.file;
    console.log("Upload request:", {
      params: req.params,
      file: multerReq.file,
      body: req.body,
    });

    if (!file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    const user = await getUser(userId);

    if (user?.profileImagePath) {
      await storageService.deleteFile(user.profileImagePath);
    }

    const uploadDir = path.join(process.cwd(), "uploads/profile-images");
    const filePath = await storageService.saveFile(file, uploadDir);

    if (user) {
      user.profileImagePath = filePath;
      await saveUser(user);
    }

    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      profileImageUrl: storageService.getFileUrl(filePath),
    });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    return res.status(500).json({
      error: "Failed to upload profile image",
    });
  }
};
