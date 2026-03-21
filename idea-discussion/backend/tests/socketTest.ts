import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Server } from "socket.io";
import { type Socket, io as ioc } from "socket.io-client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn().mockImplementation(() => {
    return Promise.resolve({
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
    });
  }),
}));

describe("Socket.IO Server Tests", () => {
  let httpServer: ReturnType<typeof createServer>;
  let app: ReturnType<typeof express>;
  let io: Server;
  let clientSocket: Socket;
  let port: number;

  beforeAll(
    () =>
      new Promise<void>((done) => {
        app = express();
        httpServer = createServer(app);

        io = new Server(httpServer, {
          cors: {
            origin: "*",
            methods: ["GET", "POST"],
          },
        });

        io.on("connection", (socket) => {
          console.log(`Socket connected: ${socket.id}`);

          socket.on("subscribe-theme", (themeId) => {
            console.log(`Socket ${socket.id} subscribing to theme: ${themeId}`);
            socket.join(`theme:${themeId}`);
          });

          socket.on("subscribe-thread", (threadId) => {
            console.log(
              `Socket ${socket.id} subscribing to thread: ${threadId}`
            );
            socket.join(`thread:${threadId}`);
          });

          socket.on("unsubscribe-theme", (themeId) => {
            console.log(
              `Socket ${socket.id} unsubscribing from theme: ${themeId}`
            );
            socket.leave(`theme:${themeId}`);
          });

          socket.on("unsubscribe-thread", (threadId) => {
            console.log(
              `Socket ${socket.id} unsubscribing from thread: ${threadId}`
            );
            socket.leave(`thread:${threadId}`);
          });

          socket.on("disconnect", () => {
            console.log(`Socket disconnected: ${socket.id}`);
          });
        });

        httpServer.listen(0, () => {
          port = (httpServer.address() as AddressInfo).port;
          done();
        });
      })
  );

  afterAll(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    httpServer.close();
  });

  beforeEach(
    () =>
      new Promise<void>((done) => {
        clientSocket = ioc(`http://localhost:${port}`);
        clientSocket.on("connect", done);
      })
  );

  afterEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  test("Client should be able to subscribe to a theme", () =>
    new Promise<void>((done) => {
      const themeId = "test-theme-id";

      const joinSpy = vi.spyOn(io.sockets.adapter.rooms, "get");

      clientSocket.emit("subscribe-theme", themeId);

      setTimeout(() => {
        const roomName = `theme:${themeId}`;
        expect(joinSpy).toHaveBeenCalled();
        expect(io.sockets.adapter.rooms.has(roomName)).toBe(true);
        done();
      }, 100);
    }));

  test("Client should be able to subscribe to a thread", () =>
    new Promise<void>((done) => {
      const threadId = "test-thread-id";

      const joinSpy = vi.spyOn(io.sockets.adapter.rooms, "get");

      clientSocket.emit("subscribe-thread", threadId);

      setTimeout(() => {
        const roomName = `thread:${threadId}`;
        expect(joinSpy).toHaveBeenCalled();
        expect(io.sockets.adapter.rooms.has(roomName)).toBe(true);
        done();
      }, 100);
    }));

  test("Server should emit new-extraction event to subscribed clients", () =>
    new Promise<void>((done) => {
      const themeId = "test-theme-id";
      const extractionData = {
        type: "problem",
        data: {
          statement: "テスト課題",
          description: "テスト課題の説明",
        },
      };

      clientSocket.emit("subscribe-theme", themeId);

      clientSocket.on("new-extraction", (data) => {
        expect(data).toEqual(extractionData);
        done();
      });

      setTimeout(() => {
        io.to(`theme:${themeId}`).emit("new-extraction", extractionData);
      }, 100);
    }));

  test("Server should emit extraction-update event to subscribed clients", () =>
    new Promise<void>((done) => {
      const themeId = "test-theme-id";
      const updateData = {
        type: "solution",
        data: {
          statement: "テスト解決策",
          description: "テスト解決策の説明",
        },
      };

      clientSocket.emit("subscribe-theme", themeId);

      clientSocket.on("extraction-update", (data) => {
        expect(data).toEqual(updateData);
        done();
      });

      setTimeout(() => {
        io.to(`theme:${themeId}`).emit("extraction-update", updateData);
      }, 100);
    }));

  test("Client should be able to unsubscribe from a theme", () =>
    new Promise<void>((done) => {
      const themeId = "test-theme-id";
      const roomName = `theme:${themeId}`;

      clientSocket.emit("subscribe-theme", themeId);

      setTimeout(() => {
        clientSocket.emit("unsubscribe-theme", themeId);

        setTimeout(() => {
          const room = io.sockets.adapter.rooms.get(roomName);
          expect(room?.has(clientSocket.id)).toBe(false);
          done();
        }, 100);
      }, 100);
    }));
});
