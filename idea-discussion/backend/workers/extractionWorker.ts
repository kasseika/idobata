/**
 * 抽出ワーカー
 *
 * 目的: チャット会話またはインポートテキストから課題（Problem）と解決策（Solution）を LLM で抽出し、
 *       DB に保存してリンキングをトリガーする。
 * 注意: チャット抽出は additions（新規）と updates（既存更新）の両方を処理する。
 *       インポート抽出は additions のみを処理し、ImportedItem のステータスを更新する。
 *       動的モデル選択（Problem/Solution）は typeof Problem | typeof Solution で型付け。
 */

import { type Types, isValidObjectId } from "mongoose";
import ChatThread from "../models/ChatThread.js";
import ImportedItem from "../models/ImportedItem.js";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { emitNewExtraction } from "../services/socketService.js";
import { linkItemToQuestions } from "./linkingWorker.js";

/** 抽出アイテムの型（additions 配列の要素） */
interface ExtractionItem {
  type: "problem" | "solution";
  statement: string;
}

/** 更新アイテムの型（updates 配列の要素） */
interface UpdateItem {
  id: string;
  type: "problem" | "solution";
  statement: string;
}

/** チャット抽出 LLM レスポンスの型 */
interface ChatExtractionResponse {
  additions?: ExtractionItem[];
  updates?: UpdateItem[];
}

/** インポート抽出 LLM レスポンスの型 */
interface ImportExtractionResponse {
  additions?: ExtractionItem[];
}

/** ジョブデータの型 */
interface ExtractionJobData {
  sourceType: string;
  sourceOriginId: string;
  content?: string;
  metadata?: object;
  themeId?: string;
}

/**
 * 抽出用のプロンプトを組み立てる。
 *
 * 管理画面で編集できる「指針」（guidelines）と、コードが動作に必要とする部分
 * （会話履歴・既存項目・入力テキスト・ルール・出力 JSON 形式）を分けて埋め込む。
 * 指針が編集されても、出力形式の指定が失われてパースが壊れることはない。
 *
 * @param sourceType - 抽出元の種別（"chat" またはインポート種別）
 * @param data - 会話履歴・既存項目・入力テキスト
 * @param guidelines - パイプライン設定で解決済みの指針（空文字は不可）
 * @throws 指針が空の場合
 */
function buildExtractionPrompt(
  sourceType: string,
  data: {
    messages?: Array<{ role: string; content: string }>;
    existingProblems?: Array<{ _id: unknown; statement: string }>;
    existingSolutions?: Array<{ _id: unknown; statement: string }>;
    content?: string;
  },
  guidelines: string
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  if (!guidelines.trim()) {
    throw new Error(
      `[ExtractionWorker] 抽出プロンプト（指針）が空です。パイプライン設定を確認してください。sourceType=${sourceType}`
    );
  }
  let prompt = "";

  if (sourceType === "chat") {
    const {
      messages = [],
      existingProblems = [],
      existingSolutions = [],
    } = data;
    // Find the latest user message index
    const latestUserIndex = [...messages]
      .reverse()
      .findIndex((msg) => msg.role === "user");
    const latestUserPosition =
      latestUserIndex >= 0 ? messages.length - 1 - latestUserIndex : -1;

    // Get the latest user message content
    const latestUserMessage =
      latestUserPosition >= 0
        ? messages[latestUserPosition].content
        : "No user message found";

    // Format messages with special marking for the latest user message
    const history = messages
      .map((msg, index) => {
        const isLatestUser = index === latestUserPosition;
        return `${msg.role}${isLatestUser ? " [LATEST USER MESSAGE]" : ""}: ${msg.content}`;
      })
      .join("\n");

    // Prepare existing data summaries
    const existingProblemSummary =
      existingProblems.length > 0
        ? existingProblems
            .map((p) => `- ID: ${p._id}, Statement: ${p.statement}`)
            .join("\n")
        : "None";
    const existingSolutionSummary =
      existingSolutions.length > 0
        ? existingSolutions
            .map((s) => `- ID: ${s._id}, Statement: ${s.statement}`)
            .join("\n")
        : "None";

    // Construct the prompt for chat
    prompt = `
Conversation History:
---
${history}
---

Existing Extracted Problems (for context, focus on user turns below for *new* problems):
---
${existingProblemSummary}
---

Existing Extracted Solutions (for context, focus on user turns below for *new* solutions):
---
${existingSolutionSummary}
---

Latest User Message:
---
${latestUserMessage}
---

Instructions:
Analyze the **latest user message** (marked with [LATEST USER MESSAGE]) in the Conversation History above.
Identify and extract the following, ensuring the output is in **Japanese**:
1.  **New Problems:** If a user message introduces a new problem (an unmet need or challenge), describe it. Provide:
    *   statement (A concise description of the problem, Japanese)
2.  **New Solutions:** If a user message proposes a specific solution or approach, describe it. Provide:
    *   statement (The core solution, Japanese)
3.  **Updates to Existing Items:** If a user message refines or clarifies an *existing* problem or solution (listed above), provide its ID and the updated Japanese statement.

Guidelines (editable by the administrator):
${guidelines}


Rules:
- Focus *only* on the contributions from the 'user' role marked with [LATEST USER MESSAGE] in the conversation history for identifying *new* problems or solutions.
- The message marked with [LATEST USER MESSAGE] is the most recent user message that you should analyze.
- Ensure all generated statements are in **Japanese**.
- If no new problems/solutions or updates are found, return empty arrays.
- Refer to existing items by their provided IDs when suggesting updates.
- **重要**: 情報が不足している場合は、無理に問題や解決策を生成しないでください。良質なstatementを作成するための十分な情報がない場合は、空の配列を返してください。不確かな推測や曖昧な表現は避け、明確に表現できる場合のみ抽出してください。

Output Format: Respond ONLY in JSON format with the following structure:
{
  "additions": [
    { "type": "problem", "statement": "課題の説明..." },
    { "type": "solution", "statement": "具体的な解決策..." }
  ],
  "updates": [
    { "id": "existing_problem_id", "type": "problem", "statement": "更新された課題の説明..." },
    { "id": "existing_solution_id", "type": "solution", "statement": "更新された解決策..." }
  ]
}
`;
  } else if (
    sourceType === "tweet" ||
    sourceType === "other_import" ||
    sourceType !== "chat"
  ) {
    const { content = "" } = data;
    // Construct the prompt for single text import
    prompt = `
Input Text:
---
${content}
---

Instructions:
Analyze the Input Text above.
Identify and extract the following, ensuring the output is in **Japanese**:
1.  **Problems:** If the text describes a problem (an unmet need or challenge), describe it. Provide:
    *   statement (A concise description of the problem, Japanese)
2.  **Solutions:** If the text proposes a specific solution or approach, describe it. Provide:
    *   statement (The core solution, Japanese)

Guidelines (editable by the administrator):
${guidelines}


Rules:
- Extract only problems and solutions explicitly mentioned or strongly implied in the text.
- Ensure all generated statements are in **Japanese**.
- If no problems or solutions are found, return an empty array for "additions".
- **重要**: 情報が不足している場合は、無理に問題や解決策を生成しないでください。良質なstatementを作成するための十分な情報がない場合は、空の配列を返してください。不確かな推測や曖昧な表現は避け、明確に表現できる場合のみ抽出してください。

Output Format: Respond ONLY in JSON format with the following structure:
{
  "additions": [
    { "type": "problem", "statement": "課題の説明...(課題とコメントの背景の二文構成で記述する)" },
    { "type": "solution", "statement": "具体的な解決策...(解決策とコメントの背景の二文構成で記述する)" }
  ]
}
`;
  }

  return [{ role: "user", content: prompt }];
}

/** 保存済みドキュメントの最小型定義 */
interface SavedDocument {
  _id: unknown;
}

// Helper to save a new problem/solution and trigger linking
async function saveAndLinkItem(
  itemData: ExtractionItem,
  sourceOriginId: string,
  sourceType: string,
  sourceMetadata: object | undefined,
  themeId: Types.ObjectId | string
): Promise<SavedDocument | null> {
  let savedItem: SavedDocument | null = null;
  if (itemData.type === "problem") {
    const newProblem = new Problem({
      statement: itemData.statement,
      sourceOriginId: sourceOriginId,
      sourceType: sourceType,
      sourceMetadata: sourceMetadata || {},
      version: 1,
      themeId: themeId,
    });
    savedItem = await newProblem.save();
    console.log(
      `[ExtractionWorker] Added Problem: ${savedItem._id} from ${sourceType} ${sourceOriginId} for theme ${themeId}`
    );
  } else if (itemData.type === "solution") {
    const newSolution = new Solution({
      statement: itemData.statement,
      sourceOriginId: sourceOriginId,
      sourceType: sourceType,
      sourceMetadata: sourceMetadata || {},
      version: 1,
      themeId: themeId,
    });
    savedItem = await newSolution.save();
    console.log(
      `[ExtractionWorker] Added Solution: ${savedItem._id} from ${sourceType} ${sourceOriginId} for theme ${themeId}`
    );
  }

  if (savedItem) {
    // Trigger linking asynchronously
    setTimeout(
      () => linkItemToQuestions(String(savedItem._id), itemData.type),
      0
    );
    return savedItem;
  }
  return null;
}

// Main processing function called by the job queue worker
async function processExtraction(job: {
  data: ExtractionJobData;
}): Promise<void> {
  const { sourceType, sourceOriginId } = job.data;
  console.log(
    `[ExtractionWorker] Starting extraction for ${sourceType}: ${sourceOriginId}`
  );

  try {
    const addedProblemIds: unknown[] = [];
    const addedSolutionIds: unknown[] = [];

    if (sourceType === "chat") {
      // --- Chat Processing Logic ---
      const thread = await ChatThread.findById(sourceOriginId);
      if (!thread) {
        console.error(
          `[ExtractionWorker] ChatThread not found: ${sourceOriginId}`
        );
        return;
      }

      const existingProblemIds = thread.extractedProblemIds || [];
      const existingSolutionIds = thread.extractedSolutionIds || [];

      const [existingProblems, existingSolutions] = await Promise.all([
        Problem.find({ _id: { $in: existingProblemIds } }),
        Solution.find({ _id: { $in: existingSolutionIds } }),
      ]);

      // 2. Build prompt and call LLM for chat
      // チャット抽出のパイプライン設定（モデル・指針）を解決
      const { model: chatExtractionModel, prompt: chatExtractionGuidelines } =
        await resolveStageConfig(thread.themeId.toString(), "extraction_chat");
      const extractionPromptMessages = buildExtractionPrompt(
        "chat",
        {
          messages: thread.messages,
          existingProblems,
          existingSolutions,
        },
        chatExtractionGuidelines
      );
      const llmResponse = (await callLLM(
        extractionPromptMessages,
        true,
        chatExtractionModel
      )) as ChatExtractionResponse;

      if (
        !llmResponse ||
        typeof llmResponse !== "object" ||
        (!llmResponse.additions && !llmResponse.updates)
      ) {
        console.warn(
          "[ExtractionWorker] LLM did not return valid JSON or expected structure for chat %s. Response:",
          sourceOriginId,
          llmResponse
        );
        return;
      }

      const additions = llmResponse.additions || [];
      const updates = llmResponse.updates || [];

      // 3. Process additions for chat
      const totalAdditions = additions.length;
      console.log(
        `[ExtractionWorker] Processing ${totalAdditions} new items for chat ${sourceOriginId}`
      );

      for (let i = 0; i < additions.length; i++) {
        const item = additions[i];
        console.log(
          `[ExtractionWorker] Processing item ${i + 1}/${totalAdditions} (${item.type}) for chat ${sourceOriginId}`
        );
        const savedItem = await saveAndLinkItem(
          item,
          sourceOriginId,
          "chat",
          {},
          thread.themeId
        );
        if (savedItem) {
          if (item.type === "problem") {
            addedProblemIds.push(savedItem._id);
            await emitNewExtraction(
              thread.themeId.toString(),
              sourceOriginId,
              "problem",
              savedItem
            );
          }
          if (item.type === "solution") {
            addedSolutionIds.push(savedItem._id);
            await emitNewExtraction(
              thread.themeId.toString(),
              sourceOriginId,
              "solution",
              savedItem
            );
          }
        }
      }

      // 4. Process updates for chat (existing logic adapted)
      const totalUpdates = updates.length;
      console.log(
        `[ExtractionWorker] Processing ${totalUpdates} updates for chat ${sourceOriginId}`
      );

      for (let i = 0; i < updates.length; i++) {
        const item = updates[i];
        console.log(
          `[ExtractionWorker] Processing update ${i + 1}/${totalUpdates} (${item.type}) for chat ${sourceOriginId}`
        );
        // LLM が ID を崩して返すことがある。findById は不正な ObjectId で例外を投げ、
        // 残りの更新とスレッドへの紐付けまで止めるため、形式が不正な項目はここで飛ばす
        if (!item.id || !isValidObjectId(item.id)) {
          console.warn(
            "[ExtractionWorker] Invalid update item received from LLM for chat %s:",
            sourceOriginId,
            item
          );
          continue;
        }
        const updateData: Record<string, unknown> = { ...item };
        updateData.id = undefined;
        updateData.type = undefined;
        updateData.version = undefined; // Let $inc handle version

        // 動的モデル選択: typeof Problem | typeof Solution で型付け
        let Model: typeof Problem | typeof Solution;
        if (item.type === "problem") Model = Problem;
        else if (item.type === "solution") Model = Solution;
        else continue;

        const existingItem = await Model.findById(item.id);
        if (!existingItem) {
          console.warn(
            `[ExtractionWorker] ${item.type} ${item.id} not found for update (chat ${sourceOriginId}).`
          );
          continue;
        }

        const result = await Model.findOneAndUpdate(
          { _id: item.id, version: existingItem.version },
          { $set: updateData, $inc: { version: 1 } },
          { new: true }
        );
        if (result) {
          console.log(
            `[ExtractionWorker] Updated ${item.type}: ${item.id} to version ${result.version} (chat ${sourceOriginId})`
          );
          setTimeout(
            () => linkItemToQuestions(item.id.toString(), item.type),
            0
          );
        } else {
          console.warn(
            `[ExtractionWorker] Failed to update ${item.type} ${item.id} (chat ${sourceOriginId}). Version mismatch or not found.`
          );
        }
      }

      // 5. Update ChatThread with new IDs (if any)
      if (addedProblemIds.length > 0 || addedSolutionIds.length > 0) {
        await ChatThread.updateOne(
          { _id: sourceOriginId },
          {
            $addToSet: {
              extractedProblemIds: { $each: addedProblemIds },
              extractedSolutionIds: { $each: addedSolutionIds },
            },
          }
        );
        console.log(
          `[ExtractionWorker] Updated chat thread ${sourceOriginId} with new extraction IDs.`
        );
      }
    } else if (
      sourceType === "tweet" ||
      sourceType === "other_import" ||
      sourceType !== "chat"
    ) {
      // --- Import Processing Logic ---
      const importItem = await ImportedItem.findById(sourceOriginId);
      if (!importItem) {
        console.error(
          `[ExtractionWorker] ImportedItem not found: ${sourceOriginId}`
        );
        return;
      }
      if (importItem.status !== "pending") {
        console.warn(
          `[ExtractionWorker] ImportedItem ${sourceOriginId} is not pending, skipping. Status: ${importItem.status}`
        );
        return;
      }

      // Mark as processing
      importItem.status = "processing";
      await importItem.save();

      // 2. Build prompt and call LLM for import
      // インポート抽出のパイプライン設定（モデル・指針）を解決
      const {
        model: importExtractionModel,
        prompt: importExtractionGuidelines,
      } = await resolveStageConfig(
        importItem.themeId.toString(),
        "extraction_import"
      );
      const extractionPromptMessages = buildExtractionPrompt(
        sourceType,
        {
          content: importItem.content,
        },
        importExtractionGuidelines
      );
      const llmResponse = (await callLLM(
        extractionPromptMessages,
        true,
        importExtractionModel
      )) as ImportExtractionResponse;

      if (
        !llmResponse ||
        typeof llmResponse !== "object" ||
        !llmResponse.additions
      ) {
        console.warn(
          "[ExtractionWorker] LLM did not return valid JSON or expected structure for import %s. Response:",
          sourceOriginId,
          llmResponse
        );
        importItem.status = "failed";
        importItem.errorMessage = "LLM response invalid";
        await importItem.save();
        return;
      }

      const additions = llmResponse.additions || [];

      // 3. Process additions for import
      const totalAdditions = additions.length;
      console.log(
        `[ExtractionWorker] Processing ${totalAdditions} new items for ${sourceType} ${sourceOriginId}`
      );

      for (let i = 0; i < additions.length; i++) {
        const item = additions[i];
        console.log(
          `[ExtractionWorker] Processing item ${i + 1}/${totalAdditions} (${item.type}) for ${sourceType} ${sourceOriginId}`
        );
        const savedItem = await saveAndLinkItem(
          item,
          sourceOriginId,
          sourceType,
          importItem.metadata,
          importItem.themeId
        );
        if (savedItem) {
          if (item.type === "problem") {
            addedProblemIds.push(savedItem._id);
            await emitNewExtraction(
              importItem.themeId.toString(),
              sourceOriginId,
              "problem",
              savedItem
            );
          }
          if (item.type === "solution") {
            addedSolutionIds.push(savedItem._id);
            await emitNewExtraction(
              importItem.themeId.toString(),
              sourceOriginId,
              "solution",
              savedItem
            );
          }
        }
      }

      // 4. Update ImportedItem status and IDs
      importItem.status = "completed";
      importItem.extractedProblemIds = addedProblemIds as Types.ObjectId[];
      importItem.extractedSolutionIds = addedSolutionIds as Types.ObjectId[];
      importItem.processedAt = new Date();
      importItem.errorMessage = undefined;
      await importItem.save();
      console.log(
        `[ExtractionWorker] Updated imported item ${sourceOriginId} with status 'completed' and extraction IDs.`
      );
    }

    // Common success log
    console.log(
      `[ExtractionWorker] Successfully processed extraction for ${sourceType}: ${sourceOriginId}`
    );
  } catch (error) {
    console.error(
      "[ExtractionWorker] Error processing extraction for %s %s:",
      sourceType,
      sourceOriginId,
      error
    );

    // Attempt to mark ImportedItem as failed if applicable
    if (
      sourceType === "tweet" ||
      sourceType === "other_import" ||
      sourceType !== "chat"
    ) {
      try {
        await ImportedItem.updateOne(
          { _id: sourceOriginId, status: "processing" },
          {
            $set: {
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message : "Unknown error",
            },
          }
        );
      } catch (updateError) {
        console.error(
          "[ExtractionWorker] Failed to mark ImportedItem %s as failed:",
          sourceOriginId,
          updateError
        );
      }
    }
  }
}

export { processExtraction };
