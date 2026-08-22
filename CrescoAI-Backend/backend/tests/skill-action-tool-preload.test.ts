import { describe, expect, test } from "bun:test";
import type { Tool } from "../src/Tool.js";
import { preloadSkillActionTools } from "../src/skills/skillAction.js";

describe("Action Skill declared tool preloading", () => {
  test("makes declared deferred tools child-visible without mutating shared definitions", () => {
    const write = {
      name: "Write",
      alwaysLoad: false,
      call() {
        return "write";
      },
    } as unknown as Tool;
    const bash = { name: "Bash", alwaysLoad: true } as unknown as Tool;
    const read = { name: "Read" } as unknown as Tool;

    const childTools = preloadSkillActionTools(
      [write, bash, read],
      ["Write", "Read", "Bash(git status:*)"],
    );

    expect(childTools[0]).not.toBe(write);
    expect(childTools[0]!.alwaysLoad).toBe(true);
    expect(write.alwaysLoad).toBe(false);
    expect((childTools[0] as any).call()).toBe("write");
    expect(childTools[1]).toBe(bash);
    expect(childTools[2]!.alwaysLoad).toBe(true);
  });

  test("does not alter tools absent from the Skill declaration", () => {
    const bash = { name: "Bash", alwaysLoad: true } as unknown as Tool;
    expect(preloadSkillActionTools([bash], ["Write"])[0]).toBe(bash);
  });
});
