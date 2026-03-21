/**
 * ローカルファイルシステムストレージサービス
 *
 * 目的: ローカルファイルシステムへのファイル保存・削除・URL取得を実装する。
 * 注意: baseUrl はサーバーのベースURLを指定する。空文字の場合は相対パスが返される。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import StorageServiceInterface, {
  type MulterFile,
} from "./storageServiceInterface.js";

export default class LocalStorageService extends StorageServiceInterface {
  private baseUrl: string;

  constructor(baseUrl = "") {
    super();
    this.baseUrl = baseUrl;
  }

  async saveFile(file: MulterFile, destination: string): Promise<string> {
    await fs.mkdir(destination, { recursive: true });

    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(destination, fileName);

    await fs.copyFile(file.path, filePath);

    await fs.unlink(file.path);

    return filePath;
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      return false;
    }
  }

  getFileUrl(filePath: string): string | null {
    if (!filePath) return null;

    const relativePath = path.relative(process.cwd(), filePath);

    const urlPath = relativePath.split(path.sep).join("/");

    return `${this.baseUrl}/${urlPath}`;
  }
}
