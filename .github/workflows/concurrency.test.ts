import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("scheduled pipeline concurrency", () => {
  it.each([
    ["daily_sync.yml", "sift-daily-brief"],
    ["quiz_sync.yml", "sift-quiz-generator"],
    ["reminder_sync.yml", "sift-afternoon-reminder"],
  ])("serializes manual and scheduled runs of %s across branches", (file, group) => {
    const workflow = parse(readFileSync(new URL(file, import.meta.url), "utf8"));

    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch).toBeDefined();
    // A literal, workflow-specific group also prevents another branch's manual
    // run from racing the scheduled job against the same production database.
    expect(workflow.concurrency).toEqual({
      group,
      "cancel-in-progress": false,
    });
  });
});
