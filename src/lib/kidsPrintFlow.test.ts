import { describe, expect, it, vi } from "vitest";
import { runKidsPrintFlow } from "./kidsPrintFlow";

describe("check-in only after printed labels are confirmed", () => {
  it("closing or canceling the system dialog never saves attendance", async () => {
    const save = vi.fn();
    expect(await runKidsPrintFlow(false, vi.fn(), save)).toBe("awaiting-confirmation");
    expect(save).not.toHaveBeenCalled();
  });
  it("confirmed physical printing saves once without reprinting", async () => {
    const print = vi.fn();
    const save = vi.fn();
    expect(await runKidsPrintFlow(true, print, save)).toBe("saved");
    expect(print).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("a print error does not save attendance", async () => {
    const save = vi.fn();
    await expect(runKidsPrintFlow(false, async () => { throw new Error("Canceled"); }, save)).rejects.toThrow("Canceled");
    expect(save).not.toHaveBeenCalled();
  });
});