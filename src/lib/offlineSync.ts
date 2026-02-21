import { get, set, keys, del } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const CHILDREN_KEY = "offline_children";
const FAMILIES_KEY = "offline_families";
const ROOMS_KEY = "offline_rooms";
const PENDING_CHECKINS_KEY = "offline_pending_checkins";

export interface OfflineChild {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  grade_group: string | null;
  allergies: string | null;
  medical_notes: string | null;
  family_id: string;
}

export interface OfflineFamily {
  id: string;
  family_name: string;
  parent1_name: string;
  parent1_phone: string;
  parent2_name: string | null;
  parent2_phone: string | null;
}

export interface OfflineRoom {
  id: string;
  name: string;
  grade_group: string | null;
  capacity: number | null;
}

export interface PendingCheckIn {
  id: string;
  child_id: string;
  service_id: string | null;
  room_id: string | null;
  checked_in_by: string | null;
  checked_in_at: string;
  synced: boolean;
}

/** Pull fresh data from server into IndexedDB */
export async function syncDataToLocal(): Promise<{ children: number; families: number; rooms: number }> {
  try {
    const [childrenRes, familiesRes, roomsRes] = await Promise.all([
      supabase.from("children").select("id, first_name, last_name, date_of_birth, grade_group, allergies, medical_notes, family_id"),
      supabase.from("families").select("id, family_name, parent1_name, parent1_phone, parent2_name, parent2_phone"),
      supabase.from("rooms").select("id, name, grade_group, capacity"),
    ]);

    const children = (childrenRes.data || []) as OfflineChild[];
    const families = (familiesRes.data || []) as OfflineFamily[];
    const rooms = (roomsRes.data || []) as OfflineRoom[];

    await Promise.all([
      set(CHILDREN_KEY, children),
      set(FAMILIES_KEY, families),
      set(ROOMS_KEY, rooms),
    ]);

    return { children: children.length, families: families.length, rooms: rooms.length };
  } catch (e) {
    console.error("Offline sync failed:", e);
    throw e;
  }
}

/** Search children from local IndexedDB */
export async function searchChildrenOffline(query: string): Promise<(OfflineChild & { family?: OfflineFamily })[]> {
  const children = (await get<OfflineChild[]>(CHILDREN_KEY)) || [];
  const families = (await get<OfflineFamily[]>(FAMILIES_KEY)) || [];
  const familyMap = new Map(families.map((f) => [f.id, f]));

  const q = query.toLowerCase();
  return children
    .filter((c) => {
      const family = familyMap.get(c.family_id);
      return (
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        family?.family_name.toLowerCase().includes(q) ||
        family?.parent1_phone.includes(q)
      );
    })
    .map((c) => ({ ...c, family: familyMap.get(c.family_id) }))
    .slice(0, 20);
}

/** Get rooms from local IndexedDB */
export async function getRoomsOffline(): Promise<OfflineRoom[]> {
  return (await get<OfflineRoom[]>(ROOMS_KEY)) || [];
}

/** Queue a check-in for later sync */
export async function queueCheckIn(checkIn: Omit<PendingCheckIn, "synced">): Promise<void> {
  const pending = (await get<PendingCheckIn[]>(PENDING_CHECKINS_KEY)) || [];
  pending.push({ ...checkIn, synced: false });
  await set(PENDING_CHECKINS_KEY, pending);
}

/** Push any queued check-ins to the server */
export async function syncPendingCheckIns(): Promise<number> {
  const pending = (await get<PendingCheckIn[]>(PENDING_CHECKINS_KEY)) || [];
  const unsynced = pending.filter((p) => !p.synced);

  if (unsynced.length === 0) return 0;

  let syncedCount = 0;
  for (const ci of unsynced) {
    try {
      const { error } = await supabase.from("check_ins").insert({
        child_id: ci.child_id,
        service_id: ci.service_id,
        room_id: ci.room_id,
        checked_in_by: ci.checked_in_by,
        checked_in_at: ci.checked_in_at,
      });
      if (!error) {
        ci.synced = true;
        syncedCount++;
      }
    } catch {
      // Will retry next sync
    }
  }

  await set(PENDING_CHECKINS_KEY, pending.filter((p) => !p.synced));
  return syncedCount;
}

/** Get pending check-in count */
export async function getPendingCount(): Promise<number> {
  const pending = (await get<PendingCheckIn[]>(PENDING_CHECKINS_KEY)) || [];
  return pending.filter((p) => !p.synced).length;
}

/** Check if we have local data cached */
export async function hasLocalData(): Promise<boolean> {
  const children = await get<OfflineChild[]>(CHILDREN_KEY);
  return !!children && children.length > 0;
}
