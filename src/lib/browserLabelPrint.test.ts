import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareBrowserLabelPrint } from "./browserLabelPrint";

afterEach(() => {
  window.dispatchEvent(new Event("afterprint"));
  document.getElementById("hotc-airprint-root")?.remove();
  document.getElementById("hotc-airprint-style")?.remove();
  vi.restoreAllMocks();
});

describe("iPad and PC browser label printing", () => {
  it("calls system printing synchronously from the print action, without starting during preparation", () => {
    const systemPrint = vi.spyOn(window, "print").mockImplementation(() => {});
    const job = prepareBrowserLabelPrint([document.createElement("canvas")]);
    expect(systemPrint).not.toHaveBeenCalled();
    job.print();
    expect(systemPrint).toHaveBeenCalledTimes(1);
  });
  it("retains requested label pages if Safari returns before the print sheet finishes", () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    const job = prepareBrowserLabelPrint([document.createElement("canvas")]);
    job.print();
    job.dispose();
    expect(document.getElementById("hotc-airprint-root")).not.toBeNull();
    window.dispatchEvent(new Event("afterprint"));
    expect(document.getElementById("hotc-airprint-root")).toBeNull();
  });
  it("removes unrequested pages when preview is canceled", () => {
    const systemPrint = vi.spyOn(window, "print").mockImplementation(() => {});
    const job = prepareBrowserLabelPrint([document.createElement("canvas")]);
    job.dispose();
    expect(systemPrint).not.toHaveBeenCalled();
    expect(() => job.print()).toThrow("Reopen the preview");
  });
  it("allows a new request after a print error", () => {
    vi.spyOn(window, "print").mockImplementationOnce(() => { throw new Error("Blocked"); }).mockImplementation(() => {});
    const first = prepareBrowserLabelPrint([document.createElement("canvas")]);
    expect(() => first.print()).toThrow("Blocked");
    expect(document.getElementById("hotc-airprint-root")).toBeNull();
    expect(() => prepareBrowserLabelPrint([document.createElement("canvas")]).print()).not.toThrow();
  });
});