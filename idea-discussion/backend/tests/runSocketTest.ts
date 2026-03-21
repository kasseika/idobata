/**
 * Socket.IO テスト用スタンドアロンスクリプト
 *
 * 目的: Jest/Vitest を使わずに Socket.IO の動作を手動確認するためのスクリプト。
 */
import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";

async function runSocketTest() {
  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("subscribe-theme", (themeId: string) => {
      console.log(`Socket ${socket.id} subscribing to theme: ${themeId}`);
      socket.join(`theme:${themeId}`);

      setTimeout(() => {
        console.log(`Emitting test extraction to theme:${themeId}`);
        io.to(`theme:${themeId}`).emit("new-extraction", {
          type: "problem",
          data: {
            statement: "テスト課題",
            description: "テスト課題の説明",
          },
        });
      }, 1000);
    });

    socket.on("subscribe-thread", (threadId: string) => {
      console.log(`Socket ${socket.id} subscribing to thread: ${threadId}`);
      socket.join(`thread:${threadId}`);
    });

    socket.on("unsubscribe-theme", (themeId: string) => {
      console.log(`Socket ${socket.id} unsubscribing from theme: ${themeId}`);
      socket.leave(`theme:${themeId}`);
    });

    socket.on("unsubscribe-thread", (threadId: string) => {
      console.log(`Socket ${socket.id} unsubscribing from thread: ${threadId}`);
      socket.leave(`thread:${threadId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  const parsedPort = Number.parseInt(process.env.SOCKET_TEST_PORT ?? "", 10);
  const port =
    Number.isSafeInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
      ? parsedPort
      : 3101;
  httpServer.listen(port, () => {
    console.log(`Socket.IO test server running on port ${port}`);
  });

  console.log("Creating client socket...");
  const clientSocket = ioc(`http://localhost:${port}`);

  clientSocket.on("connect", () => {
    console.log("Client connected to server");

    const themeId = "test-theme-id";
    console.log(`Subscribing to theme: ${themeId}`);
    clientSocket.emit("subscribe-theme", themeId);

    clientSocket.on("new-extraction", (data: unknown) => {
      console.log("Received new-extraction event:", data);
    });

    clientSocket.on("extraction-update", (data: unknown) => {
      console.log("Received extraction-update event:", data);
    });
  });

  console.log("Test running. Press Ctrl+C to exit.");
}

runSocketTest().catch(console.error);
