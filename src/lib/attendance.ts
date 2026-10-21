import { format, startOfWeek, subWeeks } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export function churchSunday(now = new Date(), timezone = 'America/Los_Angeles') {
  const localDate = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  return startOfWeek(new Date(`${localDate}T12:00:00`), { weekStartsOn: 0 });
}

export function attendanceWeeks(end: Date) {
  const sunday = startOfWeek(end, { weekStartsOn: 0 });
  return Array.from({ length: 12 }, (_, i) => format(subWeeks(sunday, 11 - i), 'yyyy-MM-dd'));
}

type Attendance = { service_date: string; status: string; user_id: string | null; attendee_id: string | null };
export function attendanceTotals(weeks: string[], rows: Attendance[], links: { user_id: string; attendee_id: string | null }[]) {
  const linked = new Map(links.map(p => [p.user_id, p.attendee_id]));
  // A present record takes precedence over historical unsynchronized absent records.
  const priority: Record<string, number> = { absent: 0, excused: 1, late: 2, present: 3 };
  return weeks.map(week => {
    const people = new Map<string, string>();
    rows.filter(r => r.service_date === week).forEach(r => {
      const attendee = r.attendee_id || (r.user_id ? linked.get(r.user_id) : null);
      const key = attendee ? `a:${attendee}` : r.user_id ? `u:${r.user_id}` : null;
      if (!key) return;
      const old = people.get(key);
      if (!old || priority[r.status] > priority[old]) people.set(key, r.status);
    });
    const statuses = [...people.values()];
    return { week: week.slice(5), Present: statuses.filter(s => s === 'present').length,
      Late: statuses.filter(s => s === 'late').length, Absent: statuses.filter(s => s === 'absent').length,
      Excused: statuses.filter(s => s === 'excused').length };
  });
}