export function guestAssignment(slotId: string, name: string, roleLabel: string) {
  const guestName = name.trim();
  if (!guestName) throw new Error("Enter a guest name");
  return {
    slot_id: slotId,
    assignee_type: "guest" as const,
    guest_name: guestName,
    profile_id: null,
    attendee_id: null,
    roster_entry_id: null,
    role_label: roleLabel.trim() || null,
  };
}