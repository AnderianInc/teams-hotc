import { describe, expect, it } from "vitest";
import { canDeleteEventMessage, legacyCsv, readAllPages } from "./legacyOutreach";

describe("safe outreach access", () => {
  it("reads legacy records beyond a single page", async () => {
    const source = Array.from({ length: 1220 }, (_, id) => ({ id }));
    expect(await readAllPages(async (from, to) => ({ data: source.slice(from, to + 1), error: null }))).toEqual(source);
  });
  it("rejects partial backups when a page fails", async () => {
    await expect(readAllPages(async (from) => from === 0 ? { data: [1, 2], error: null } : { data: null, error: { message: "Read failed" } }, 2)).rejects.toThrow("Read failed");
  });
  it("preserves nested source data and prevents spreadsheet formulas", () => {
    expect(legacyCsv([{ phone: "+15107750290", payload: { source: "Facebook" } }])).toContain('"\'+15107750290","{""source"":""Facebook""}"');
  });
  it("allows deletion of unsent messages, not delivery history or in-flight messages", () => {
    for (const status of ["pending", "review", "failed", "cancelled", "skipped"]) expect(canDeleteEventMessage(status)).toBe(true);
    for (const status of ["sent", "sending"]) expect(canDeleteEventMessage(status)).toBe(false);
  });
});