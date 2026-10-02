import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8");

interface NotificationClickEvent {
  notification: { data?: { url: string }; close: () => void };
  waitUntil: (task: Promise<unknown>) => void;
}

function createWorker(openPaths: string[]) {
  const handlers = new Map<string, (event: NotificationClickEvent) => void>();
  const clients = openPaths.map((path) => ({
    url: `https://sift.example${path}`,
    postMessage: vi.fn(),
    focus: vi.fn().mockResolvedValue(undefined),
  }));
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(serviceWorkerSource, {
    self: {
      addEventListener: (type: string, handler: (event: NotificationClickEvent) => void) => {
        handlers.set(type, handler);
      },
      clients: { matchAll: vi.fn().mockResolvedValue(clients), openWindow },
    },
  });

  async function clickNotification(url?: string) {
    const close = vi.fn();
    const waitUntil = vi.fn();
    handlers.get("notificationclick")!({
      notification: { data: url === undefined ? undefined : { url }, close },
      waitUntil,
    });
    expect(close).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0][0];
  }

  return { clients, openWindow, clickNotification };
}

describe("service worker notification navigation", () => {
  it.each(["/quiz", "/library"])("opens the morning brief from an existing %s window", async (path) => {
    const worker = createWorker([path]);
    await worker.clickNotification("/");

    expect(worker.clients[0].postMessage).toHaveBeenCalledExactlyOnceWith({ type: "navigate", url: "/" });
    expect(worker.clients[0].focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("defaults notifications without a target to the brief", async () => {
    const worker = createWorker(["/activity"]);
    await worker.clickNotification();

    expect(worker.clients[0].postMessage).toHaveBeenCalledExactlyOnceWith({ type: "navigate", url: "/" });
    expect(worker.clients[0].focus).toHaveBeenCalledOnce();
  });

  it("keeps reminders targeted to quiz in an existing window", async () => {
    const worker = createWorker(["/"]);
    await worker.clickNotification("/quiz");

    expect(worker.clients[0].postMessage).toHaveBeenCalledExactlyOnceWith({ type: "navigate", url: "/quiz" });
    expect(worker.clients[0].focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it.each(["/", "/quiz"])("opens %s when no app window exists", async (target) => {
    const worker = createWorker([]);
    await worker.clickNotification(target);

    expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith(target);
  });
});
