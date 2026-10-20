import { describe, expect, it } from "vitest";
import { guestAssignment } from "./serviceGuests";

describe("guest service assignments", () => {
  it("stores an occasional guest name without linking a Directory person or roster entry", () => {
    expect(guestAssignment("slot-1", " Guest Speaker ", " Speaker ")).toEqual({
      slot_id: "slot-1", assignee_type: "guest", guest_name: "Guest Speaker",
      profile_id: null, attendee_id: null, roster_entry_id: null, role_label: "Speaker",
    });
  });
  it("rejects blank guest names", () => {
    expect(() => guestAssignment("slot-1", "  ", "")).toThrow("Enter a guest name");
  });
});