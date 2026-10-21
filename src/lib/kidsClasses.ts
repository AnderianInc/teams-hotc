export interface AgeRoom {
  id: string;
  name: string;
  min_age: number | null;
  max_age: number | null;
}

/** Whole years old on `on` (defaults to today). Null when DOB missing/invalid. */
export function ageInYears(dob: string | null | undefined, on: Date = new Date()): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--;
  return age < 0 ? null : age;
}

export function kidsCheckInError(dob: string | null | undefined, on?: Date): string | null {
  const age = ageInYears(dob, on);
  if (age === null) return "Add a valid date of birth before checking in.";
  if (age > 14) return "Children's Ministry is for ages 0–14. Ages 15–19 belong in Young Adults.";
  return null;
}

/** Pick the class whose age range contains the child's age. */
export function roomForAge<R extends AgeRoom>(rooms: R[] | null | undefined, dob: string | null | undefined, on?: Date): R | undefined {
  const age = ageInYears(dob, on);
  if (age === null || !rooms) return undefined;
  return rooms.find((r) => r.min_age !== null && r.max_age !== null && age >= r.min_age && age <= r.max_age);
}
