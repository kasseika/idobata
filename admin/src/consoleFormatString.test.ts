// @vitest-environment node
/**
 * ログ出力の書式文字列の検査（管理画面）
 *
 * 目的: console.* の第1引数（書式文字列）に、テンプレートリテラルで値を埋め込まないことを検証する（issue #154）。
 *       console.* は第1引数の %s・%o などを書式指定子として解釈するため、URL パラメータ等の値を
 *       埋め込むと、値に含まれる書式指定子で後ろの引数の出力が崩れる（CodeQL の js/tainted-format-string）。
 *       値は "...%s..." の書式指定子と別の引数で渡す。
 * 対象: 第2引数以降がある呼び出しだけ。src 配下のソースコード（テストを除く）。
 * 注意: バックエンドにも同じ検査（idea-discussion/backend/tests/consoleFormatString.test.ts）がある。
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

/** src 配下のソースファイル（.ts・.tsx、テストを除く）を列挙する */
const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [fullPath]
      : [];
  });

/**
 * 書式文字列に値を埋め込んでいる console.* の呼び出しを探す
 *
 * @returns "ファイルパス:行番号" の一覧
 */
const findInterpolatedFormatStrings = (filePath: string): string[] => {
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "console" &&
      node.arguments.length > 1 &&
      ts.isTemplateExpression(node.arguments[0])
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
      );
      found.push(`${path.relative(process.cwd(), filePath)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

describe("ログ出力の書式文字列", () => {
  test("console.* の書式文字列に、テンプレートリテラルで値を埋め込んでいないこと", () => {
    const srcRoot = path.resolve(import.meta.dirname);

    const violations = listSourceFiles(srcRoot).flatMap(
      findInterpolatedFormatStrings
    );

    expect(violations).toEqual([]);
  });
});
