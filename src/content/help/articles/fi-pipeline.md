# Outreach pipeline

The pipeline tracks every prospect through five stages:

1. **Interested** — knows about us, hasn't visited
2. **Invited** — has been personally invited
3. **Visited** — attended a service
4. **Connected** — joined a group / ongoing contact
5. **Member** — fully assimilated

Cards advance with the arrow button or are moved automatically:
- New visitor registration → **Visited**
- External source records (prayer / visit / interest) → **Visited** or **Interested** depending on source
- Stage **Member** flips `is_member = true` on the attendee record

Source badges on each card show where the prospect came from.
