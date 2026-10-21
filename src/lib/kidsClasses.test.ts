import { describe, it, expect } from "vitest";
import { roomForAge, kidsCheckInError } from "./kidsClasses";

const rooms = [
  { id: "1", name: "Little Lambs", min_age: 0, max_age: 4 },
  { id: "2", name: "Kingdom Kids", min_age: 5, max_age: 9 },
  { id: "3", name: "Young Leaders", min_age: 10, max_age: 14 },
];
const on = new Date(2026, 9, 25);

describe("children's class by age", () => {
  it("4-year-old is Little Lambs", () => expect(roomForAge(rooms, "2022-01-01", on)?.name).toBe("Little Lambs"));
  it("5-year-old is Kingdom Kids", () => expect(roomForAge(rooms, "2021-10-25", on)?.name).toBe("Kingdom Kids"));
  it("9-year-old is Kingdom Kids", () => expect(roomForAge(rooms, "2017-01-01", on)?.name).toBe("Kingdom Kids"));
  it("10-year-old is Young Leaders", () => expect(roomForAge(rooms, "2016-10-01", on)?.name).toBe("Young Leaders"));
  it("15-year-old has no children's class", () => expect(roomForAge(rooms, "2011-01-01", on)).toBeUndefined());
  it("14-year-old is Young Leaders and eligible", () => {
    expect(roomForAge(rooms, "2012-10-25", on)?.name).toBe("Young Leaders");
    expect(kidsCheckInError("2012-10-25", on)).toBeNull();
  });
  it("15-year-olds cannot check in even with an old class", () => expect(kidsCheckInError("2011-10-25", on)).not.toBeNull());
  it("19-year-olds cannot check in", () => expect(kidsCheckInError("2007-10-25", on)).not.toBeNull());
  it("a baby is Little Lambs", () => expect(roomForAge(rooms, "2026-10-25", on)?.name).toBe("Little Lambs"));
  it("missing or invalid birth dates cannot check in", () => {
    expect(kidsCheckInError(null, on)).not.toBeNull();
    expect(kidsCheckInError("2020-02-31", on)).not.toBeNull();
  });
});
