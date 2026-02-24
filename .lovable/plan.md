

## Register New Family Improvements

### Bug Fix: Input loses focus after each keystroke

**Root cause:** The `ChildFields` component is defined as a function **inside** the `RegisterChild` component body (line 122). Every time state changes (i.e., every keystroke), `RegisterChild` re-renders, creating a brand-new `ChildFields` function reference. React treats this as a completely different component and unmounts/remounts it, destroying the focused input.

**Fix:** Move `ChildFields` outside of `RegisterChild` as a standalone component at module level. This ensures React reuses the same component identity across renders and preserves input focus.

### Feature: Copy family last name to all children

Add a small "Apply to all" button next to the primary child's Last Name field. When clicked, it copies the current last name value to all sibling entries at once. This saves time when registering multiple children from the same family.

---

### Technical Details

**File:** `src/components/kids/RegisterChild.tsx`

1. **Extract `ChildFields`** -- Move the component definition (currently lines 122-173) above and outside of the `RegisterChild` function. Pass the same props interface.

2. **Add "Apply last name to all" button** -- After the primary child's Last Name input (rendered via `ChildFields`), add a small button that sets `lastName` on every sibling entry to match the primary child's `form.lastName`. This button only appears when siblings exist. It will be placed in the Parent/Guardian section near Family Name, or as a subtle link-style button next to the primary child's last name field.

3. **Stable keys for siblings** -- Replace `key={i}` with a stable unique ID per sibling (e.g., add an `id` field using `crypto.randomUUID()` to each `SiblingEntry`). This further prevents unnecessary re-mounting when siblings are added/removed.

