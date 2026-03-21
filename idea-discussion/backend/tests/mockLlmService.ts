/**
 * テスト用 LLM サービスモック
 *
 * 目的: テスト時に実際の LLM API を呼び出さずに事前定義済みのレスポンスを返す。
 */

/**
 * callLLM のモック実装。事前定義されたレスポンスを返す。
 */
export function mockCallLLM(
  messages: Array<{ role: string; content: string }>,
  jsonOutput = false,
  model = "mock-model"
): object | string {
  console.log("Using mock LLM service");

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.content.includes("extract")) {
    return jsonOutput
      ? {
          problems: [
            {
              statement: "テスト課題",
              description: "テスト課題の説明",
            },
          ],
          solutions: [
            {
              statement: "テスト解決策",
              description: "テスト解決策の説明",
            },
          ],
        }
      : "Extracted 1 problem and 1 solution.";
  }

  return jsonOutput
    ? { response: "This is a mock response" }
    : "This is a mock response";
}

export const MOCK_MODELS = {
  "mock-model": "mock-model",
};
