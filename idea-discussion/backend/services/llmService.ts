/**
 * LLM サービス
 *
 * 目的: OpenRouter API 経由で LLM を呼び出す共通関数を提供する。
 *       JSON 出力モードをサポートし、コードブロック内の JSON も自動パースする。
 * 注意: dotenv は server.ts で読み込まれるため、ここでの再読み込みは上書き用。
 *       APIキーはDB（SystemConfig）優先・環境変数フォールバックで動的取得する。
 *       モジュールレベルでの固定クライアントは使用しない。
 */

import dotenv from "dotenv";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { getOpenRouterApiKey } from "./apiKeyService.js";

// dotenv is loaded in server.js, no need to load it again here.

dotenv.config({ override: true }); // Load environment variables from .env file

/** LLM へ渡すメッセージの型 */
interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * OpenRouter API 経由で LLM を呼び出す
 * @param messages - メッセージオブジェクトの配列（role と content を持つ）
 * @param jsonOutput - JSON 出力を要求するかどうか
 * @param model - 使用するモデル ID（デフォルト: google/gemini-3.1-flash-lite-preview）
 * @returns jsonOutput=true の場合はパース済みオブジェクト、それ以外は文字列
 */
async function callLLM(
  messages: LLMMessage[],
  jsonOutput = false,
  model = "google/gemini-3.1-flash-lite-preview"
): Promise<string | object> {
  const useJsonOutput = jsonOutput;
  if (useJsonOutput) {
    // Ensure the last message prompts for JSON output explicitly
    if (messages.length > 0 && messages[messages.length - 1].role === "user") {
      messages[messages.length - 1].content +=
        "\n\nPlease respond ONLY in JSON format.";
    }
  }

  const logOptions = {
    model,
    messages,
    ...(useJsonOutput ? { response_format: { type: "json_object" } } : {}),
  };
  console.log("Calling LLM with options:", JSON.stringify(logOptions, null, 2)); // Log request details

  // APIキーをDB優先・環境変数フォールバックで動的取得する
  const apiKey = await getOpenRouterApiKey();
  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages as ChatCompletionMessageParam[],
      ...(useJsonOutput
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });
    console.log("LLM Response:", JSON.stringify(completion, null, 2)); // Log full response
    const content = completion.choices[0].message?.content;

    if (!content) {
      console.error("LLM returned empty content.");
      throw new Error("LLM returned empty content.");
    }

    if (jsonOutput) {
      try {
        let jsonString = content;

        // First attempt: Check for ```json ... ``` blocks
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonString = jsonMatch[1];
          console.log("Found JSON in ```json``` block");
        } else {
          // Second attempt: Check for general ``` ... ``` blocks
          const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            jsonString = codeBlockMatch[1];
            console.log("Found JSON in general ``` code block");
          }
        }

        // Try to parse the extracted or raw content
        return JSON.parse(jsonString);
      } catch (e) {
        console.error("Failed to parse LLM JSON response:", content, e);
        // Return the raw content if JSON parsing fails, maybe it's just text
        // Or throw a specific error if JSON is strictly required
        throw new Error(
          `LLM did not return valid JSON. Raw response: ${content}`
        );
      }
    }
    return content;
  } catch (error) {
    console.error("Error calling OpenRouter:", error);
    // Implement retry logic if needed
    throw error;
  }
}

// Simple test function
async function testLLM(model?: string): Promise<string | object | undefined> {
  console.log("Testing LLM connection...");
  try {
    const response = await callLLM(
      [{ role: "user", content: "Hello!" }],
      false,
      model
    );
    console.log(`LLM Test Response (${model || "default model"}):`);
    console.log(response);
    return response;
  } catch (error) {
    console.error("LLM Test Failed:", error);
    throw error;
  }
}

// List of available models that work well with OpenRouter
const RECOMMENDED_MODELS: Record<string, string> = {
  "gemini-flash-lite": "google/gemini-3.1-flash-lite-preview",
  "gemini-flash": "google/gemini-3-flash-preview",
  "gemini-pro": "google/gemini-3.1-pro-preview",
  "claude-sonnet": "anthropic/claude-sonnet-4.6",
  "claude-opus": "anthropic/claude-opus-4.6",
  "gpt-5-mini": "openai/gpt-5.4-mini",
  "gpt-5": "openai/gpt-5.4",
};

export { callLLM, testLLM, RECOMMENDED_MODELS };
