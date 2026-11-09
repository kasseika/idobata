/**
 * socketClient のテスト
 *
 * 目的: スレッドのルームを購読するとき、スレッド ID と一緒に本人の userId を送ることを検証する。
 *       サーバーは、スレッドの持ち主の userId を示したときだけ購読を許可する（issue #146）。
 *       接続済みで購読する場合と、未接続で購読して接続時に送る場合の両方を確かめる。
 * 前提: socket.io-client と userIdManager はモックする。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** socket.io-client が返すソケットのモック。on で登録したハンドラを呼び出せるようにする */
const fakeSocket = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {};
  return {
    handlers,
    id: "socket-1",
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => fakeSocket),
}));
vi.mock("../../utils/userIdManager", () => ({
  userIdManager: { getUserId: () => "uuid-営業部の佐藤さんの端末" },
}));

describe("socketClient のスレッド購読", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("未接続で購読した場合、接続したときにスレッド ID と本人の userId を送ること", async () => {
    const { socketClient } = await import("./socketClient");

    socketClient.subscribeToThread("650000000000000000000099");
    fakeSocket.handlers.connect();

    expect(fakeSocket.emit).toHaveBeenCalledWith("subscribe-thread", {
      threadId: "650000000000000000000099",
      userId: "uuid-営業部の佐藤さんの端末",
    });
  });

  it("接続済みで購読した場合、すぐにスレッド ID と本人の userId を送ること", async () => {
    const { socketClient } = await import("./socketClient");
    fakeSocket.handlers.connect();

    socketClient.subscribeToThread("650000000000000000000098");

    expect(fakeSocket.emit).toHaveBeenCalledWith("subscribe-thread", {
      threadId: "650000000000000000000098",
      userId: "uuid-営業部の佐藤さんの端末",
    });
  });
});
