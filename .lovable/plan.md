## Goals

1. Fix label orientation (currently mirrored + portrait) → print landscape, right-reading.
2. Print **three labels per check-in**: Child, Parent, Teacher — all sharing the same random **security code**.
3. Show newly checked-in children on the Kids Check-In page (list currently stays empty).
4. Add a way to clear old check-out data over time.

---

## 1. Label orientation fix (`src/lib/brotherPrinter.ts`)

- Swap canvas dimensions so the print head width (720 dots / 62 mm) is used for the *height* of the visual layout and label length is the *width*.
- Remove the `translate + rotate(π/2)` block that is producing the mirrored/portrait output. Draw text natively horizontal on the swapped canvas, then rotate the *pixel buffer* once (correct direction) when packing into the raster so the printer emits it landscape and right-reading.
- Same code path prints one label; called 3× per check-in with different payloads.

## 2. Three-copy labels + security code

- Extend `printNameTag` payload:
  ```ts
  { copy: "child" | "parent" | "teacher",
    childName, className, securityCode,
    parentName?, allergies? }
  ```
- Layout per copy (all landscape, 62 mm × ~50 mm):
  - **Child**: big name, class, code.
  - **Parent**: "PICKUP SLIP" header, child name, class, code (large, monospace), parent name.
  - **Teacher**: child name, class, code, parent name/phone, **allergies bold red** if present.
- Security code generator: 4-char base32 (e.g. `7K2Q`) via `crypto.getRandomValues`.
- `CheckInConfirm` generates the code once, saves it to the DB, then calls `printNameTag` three times sequentially (child → parent → teacher). If any print fails, abort before DB insert (existing "print-first" rule).

### Database change

Add `security_code text` to `public.check_ins` (nullable, indexed by service_id for lookup). Migration only — no policy changes needed.

Also used at checkout: `KidsCheckOut` already searches by code; ensure it queries this column.

## 3. Checked-in list not appearing

`CheckedInToday` uses React Query key `["check-ins-today", today]` but `CheckInConfirm` never invalidates it after insert. Fix by calling `queryClient.invalidateQueries({ queryKey: ["check-ins-today"] })` on success.

## 4. Clearing old check-out data

Two-part:

- **Auto-checkout stale records**: nightly cleanup — mark any `check_ins` with `checked_out_at IS NULL` older than 12 h as auto-checked-out. Implement as a SQL function `auto_close_stale_check_ins()` scheduled via `pg_cron` daily at 02:00.
- **Admin purge**: add a small "Clear check-outs older than 30 days" button in the Kids Setup & Guide tab (admin-only) that calls an RPC `purge_old_check_ins(days int)` deleting rows where `checked_out_at < now() - interval 'X days'`.

---

## Files touched

- `src/lib/brotherPrinter.ts` — orientation + copy-aware label rendering
- `src/components/kids/CheckInConfirm.tsx` — generate code, 3 prints, invalidate list query
- `src/components/kids/CheckedInToday.tsx` — show security code column
- `src/components/kids/KidsSetupGuide.tsx` — "Purge old check-outs" admin button
- Migration: `security_code` column, `auto_close_stale_check_ins()`, `purge_old_check_ins()`, cron schedule
