import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// apiKeyServiceをモックしてDBアクセスなしにテストする
vi.mock("./apiKeyService.js", () => ({
  getOpenRouterApiKey: vi.fn().mockResolvedValue("test-key"),
}));

// Mock the OpenAI client
vi.mock("openai", () => {
  // Mock the default export (the OpenAI class constructor)
  const MockOpenAI = vi.fn();
  // Mock the chat.completions.create method
  MockOpenAI.prototype.chat = {
    completions: {
      create: vi.fn(),
    },
  };
  return {
    default: MockOpenAI,
  };
});

import { getOpenRouterApiKey } from "./apiKeyService.js";
import { callLLM, testLLM } from "./llmService.js";

// Mock process.env
const originalEnv = { ...process.env };

describe("llmService", () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks and environment variables before each test
    vi.resetAllMocks();
    vi.mocked(getOpenRouterApiKey).mockResolvedValue("test-key");
    process.env = { ...originalEnv };

    // Get a reference to the mocked create function for easier use
    const MockOpenAIInstance = new (
      OpenAI as unknown as new () => {
        chat: { completions: { create: ReturnType<typeof vi.fn> } };
      }
    )();
    mockCreate = MockOpenAIInstance.chat.completions.create;
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe("callLLM", () => {
    const messages = [{ role: "user" as const, content: "Test prompt" }];

    it("should call the OpenAI API with correct parameters for text output", async () => {
      const mockResponse = {
        choices: [{ message: { content: "Test response" } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const response = await callLLM(messages);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        model: "google/gemini-3.1-flash-lite-preview", // Default model
        messages: messages,
      });
      expect(response).toBe("Test response");
    });

    it("should call the OpenAI API with correct parameters for JSON output", async () => {
      const mockJsonResponse = { test: "data" };
      const mockResponse = {
        choices: [{ message: { content: JSON.stringify(mockJsonResponse) } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const response = await callLLM(messages, true);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          {
            role: "user",
            content: "Test prompt\n\nPlease respond ONLY in JSON format.", // Check if prompt is modified
          },
        ],
        response_format: { type: "json_object" },
      });
      expect(response).toEqual(mockJsonResponse);
    });

    it("should parse JSON response enclosed in ```json ... ```", async () => {
      const mockJsonResponse = { key: "value" };
      const rawContent = `\`\`\`json\n${JSON.stringify(mockJsonResponse)}\n\`\`\``;
      const mockResponse = {
        choices: [{ message: { content: rawContent } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const response = await callLLM(messages, true);
      expect(response).toEqual(mockJsonResponse);
    });

    it("should parse JSON response enclosed in ``` ... ```", async () => {
      const mockJsonResponse = { another: "test" };
      const rawContent = `\`\`\`\n${JSON.stringify(mockJsonResponse)}\n\`\`\``;
      const mockResponse = {
        choices: [{ message: { content: rawContent } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      const response = await callLLM(messages, true);
      expect(response).toEqual(mockJsonResponse);
    });

    it("should throw an error if JSON parsing fails when jsonOutput is true", async () => {
      const invalidJsonContent = "This is not JSON.";
      const mockResponse = {
        choices: [{ message: { content: invalidJsonContent } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await expect(callLLM(messages, true)).rejects.toThrow(
        `LLM did not return valid JSON. Raw response: ${invalidJsonContent}`
      );
    });

    it("should throw an error if LLM returns empty content", async () => {
      const mockResponse = {
        choices: [{ message: { content: null } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await expect(callLLM(messages)).rejects.toThrow(
        "LLM returned empty content."
      );
    });

    it("should use the specified model", async () => {
      const specificModel = "openai/gpt-4";
      const mockResponse = {
        choices: [{ message: { content: "Response from GPT-4" } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      await callLLM(messages, false, specificModel);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: specificModel,
        })
      );
    });

    it("should handle errors from the OpenAI API call", async () => {
      const apiError = new Error("API Error");
      mockCreate.mockRejectedValue(apiError);

      await expect(callLLM(messages)).rejects.toThrow("API Error");
    });
  });

  describe("testLLM", () => {
    it("should call callLLM and log the response", async () => {
      const mockResponseContent = "Hello from LLM!";
      const mockResponse = {
        choices: [{ message: { content: mockResponseContent } }],
      };
      mockCreate.mockResolvedValue(mockResponse);

      // Spy on console.log
      const consoleSpy = vi.spyOn(console, "log");

      const result = await testLLM();

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        model: "google/gemini-3.1-flash-lite-preview", // Default model for testLLM
        messages: [{ role: "user", content: "Hello!" }],
      });
      expect(result).toBe(mockResponseContent);
      expect(consoleSpy).toHaveBeenCalledWith("Testing LLM connection...");
      expect(consoleSpy).toHaveBeenCalledWith(
        "LLM Test Response (default model):"
      );
      expect(consoleSpy).toHaveBeenCalledWith(mockResponseContent);

      // Clean up spy
      consoleSpy.mockRestore();
    });

    it("should throw an error if getOpenRouterApiKey fails", async () => {
      // APIキー取得が失敗した場合（DBも環境変数もない場合）
      vi.mocked(getOpenRouterApiKey).mockRejectedValue(
        new Error("OpenRouter APIキーが設定されていません")
      );

      const consoleErrorSpy = vi.spyOn(console, "error");

      await expect(testLLM()).rejects.toThrow(
        "OpenRouter APIキーが設定されていません"
      );
      expect(mockCreate).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle errors during the testLLM call", async () => {
      const testError = new Error("Test call failed");
      mockCreate.mockRejectedValue(testError);

      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, "error");

      await expect(testLLM()).rejects.toThrow("Test call failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "LLM Test Failed:",
        testError
      );

      // Clean up spy
      consoleErrorSpy.mockRestore();
    });

    it("should allow specifying a model for testLLM", async () => {
      const specificModel = "openai/gpt-3.5-turbo";
      const mockResponseContent = "Hello from GPT-3.5!";
      const mockResponse = {
        choices: [{ message: { content: mockResponseContent } }],
      };
      mockCreate.mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, "log");

      const result = await testLLM(specificModel);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: specificModel })
      );
      expect(result).toBe(mockResponseContent);
      expect(consoleSpy).toHaveBeenCalledWith(
        `LLM Test Response (${specificModel}):`
      );

      consoleSpy.mockRestore();
    });
  });
});
