/**
 * ストレージサービス基底クラス
 *
 * 目的: ファイル保存操作の共通インターフェースを定義する。
 *       ローカルファイルシステム・S3 等の異なる実装を統一的に扱う。
 * 注意: このクラスを直接インスタンス化せず、必ずサブクラスで各メソッドを実装すること。
 */

/** Multer のファイルオブジェクト型（@types/multerなしでの最小定義） */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
}

export default abstract class StorageServiceInterface {
  /**
   * ファイルを保存する
   * @param file - Multerのファイルオブジェクト
   * @param destination - 保存先ディレクトリ
   * @returns 保存されたファイルのパス
   */
  abstract saveFile(file: MulterFile, destination: string): Promise<string>;

  /**
   * ファイルを削除する
   * @param filePath - 削除するファイルのパス
   * @returns 削除成功したかどうか
   */
  abstract deleteFile(filePath: string): Promise<boolean>;

  /**
   * ファイルのURLを取得する
   * @param filePath - ファイルのパス
   * @returns ファイルのURL
   */
  abstract getFileUrl(filePath: string): string | null;
}
