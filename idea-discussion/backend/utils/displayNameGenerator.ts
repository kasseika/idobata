/**
 * ランダム表示名生成ユーティリティ
 *
 * 目的: ユーザーが表示名を設定していない場合に使用するランダムな表示名を生成する。
 * 注意: 生成された表示名はユニーク性を保証しない。衝突が発生した場合は再生成が必要。
 */

/**
 * 鳥の名前とランダムな5桁の数字を組み合わせた表示名を生成する
 * @returns ランダムな表示名（例: "ウグイス12345"）
 */
export const generateRandomDisplayName = (): string => {
  const nameOptions = [
    "ウグイス",
    "メジロ",
    "ツバメ",
    "カワセミ",
    "ツル",
    "キジ",
    "ヒバリ",
    "カッコウ",
    "ムクドリ",
    "ヤマガラ",
  ];

  const randomName =
    nameOptions[Math.floor(Math.random() * nameOptions.length)];
  const randomNumber = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");

  return `${randomName}${randomNumber}`;
};
