import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));
vi.mock("./config.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./config.js")>(),
  loadConfig: vi.fn(() => ({ aiProvider: "openai" })),
}));
vi.mock("./rss/feed.js", () => ({
  getTodaysArticles: vi.fn(),
  pickForClassifier: vi.fn(),
}));
vi.mock("./ai/select-provider.js", () => ({
  selectProvider: vi.fn(),
  fallbackProvider: vi.fn(),
}));
vi.mock("./ai/classifier.js", () => ({
  classifyArticles: vi.fn(),
  buildPreferenceContext: vi.fn(),
}));
vi.mock("./ai/brief.js", () => ({
  generateBrief: vi.fn(),
  buildDegradedBrief: vi.fn(),
}));
vi.mock("./notify/web-push.js", () => ({ sendWebPush: vi.fn() }));
vi.mock("./notify/db-writer.js", () => ({ writeArticlesToDB: vi.fn() }));
vi.mock("./db/client.js", () => ({
  db: { select: vi.fn(), selectDistinct: vi.fn() },
  getRecentFeedback: vi.fn(),
  getQuizPoolSize: vi.fn(),
  getLastActivityAt: vi.fn(),
}));

import { main } from "./index.js";
import { getTodaysArticles } from "./rss/feed.js";
import { selectProvider } from "./ai/select-provider.js";
import { generateBrief } from "./ai/brief.js";
import { sendWebPush } from "./notify/web-push.js";
import { writeArticlesToDB } from "./notify/db-writer.js";

describe("empty daily brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DRY_RUN", "");
    // Skip publication/idle reads: these tests focus on the empty RSS branch.
    vi.stubEnv("FORCE", "1");
    vi.mocked(getTodaysArticles).mockResolvedValue({
      articles: [], sourceFailures: 0, sourceTotal: 10,
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Preserve process.exit's control flow without terminating the test runner.
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("never pushes or writes on an empty dry run, even when force is enabled", async () => {
    vi.stubEnv("DRY_RUN", "1");

    await main();

    expect(getTodaysArticles).toHaveBeenCalledOnce();
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(writeArticlesToDB).not.toHaveBeenCalled();
    expect(selectProvider).not.toHaveBeenCalled();
    expect(generateBrief).not.toHaveBeenCalled();
  });

  it("still sends the empty-day notice for a live run", async () => {
    await main();

    expect(sendWebPush).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^Sift · \d{4}-\d{2}-\d{2}$/),
      "今日無重大 AI 新聞",
    );
    expect(writeArticlesToDB).not.toHaveBeenCalled();
    expect(generateBrief).not.toHaveBeenCalled();
  });

  it("fails a live run when the empty-day push fails", async () => {
    vi.mocked(sendWebPush).mockRejectedValueOnce(new Error("push service unavailable"));

    await expect(main()).rejects.toThrow("process.exit(1)");
  });
});
