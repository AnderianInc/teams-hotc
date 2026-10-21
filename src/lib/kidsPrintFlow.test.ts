import { describe, expect, it, vi } from "vitest";
import { runKidsPrintFlow, reprintKidsLabels } from "./kidsPrintFlow";

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

describe("checked-in reprinting", () => {
  const base = { childName: "Existing child", roomName: "Kingdom Kids", securityCode: "ABC123" };
  it("reuses the original pickup code and assigned room on each retry", async () => {
    const print = vi.fn().mockRejectedValueOnce(new Error("Printer offline")).mockResolvedValueOnce(undefined);
    const verify = vi.fn().mockResolvedValue(undefined);
    await expect(reprintKidsLabels(base, verify, print)).rejects.toThrow("Printer offline");
    await reprintKidsLabels(base, verify, print);
    expect(print).toHaveBeenNthCalledWith(1, { childName: "Existing child", roomName: "Kingdom Kids", securityCode: "ABC123" });
    expect(print).toHaveBeenNthCalledWith(2, { childName: "Existing child", roomName: "Kingdom Kids", securityCode: "ABC123" });
    expect(base.securityCode).toBe("ABC123");
  });
  it("never invents a new code for an old check-in without one", async () => {
    const verify = vi.fn();
    const print = vi.fn();
    await expect(reprintKidsLabels({ ...base, securityCode: "" }, verify, print)).rejects.toThrow("no saved pickup code");
    expect(verify).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
  });
});