import { describe, expect, it } from 'vitest';
import { attendanceTotals, attendanceWeeks, churchSunday } from './attendance';

describe('church attendance', () => {
  it('uses Pacific Sunday even after midnight UTC on Monday', () => {
    expect(attendanceWeeks(churchSunday(new Date('2026-10-19T00:30:00Z'))).at(-1)).toBe('2026-10-18');
  });
  it('includes August 16 through September 20 in the twelve-week trend', () => {
    const weeks = attendanceWeeks(new Date('2026-10-18T12:00:00'));
    expect(weeks.filter(w => w >= '2026-08-16' && w <= '2026-09-20')).toEqual([
      '2026-08-16','2026-08-23','2026-08-30','2026-09-06','2026-09-13','2026-09-20',
    ]);
  });
  it('counts a linked member and volunteer once and retains independent people', () => {
    expect(attendanceTotals(['2026-09-20'], [
      { service_date:'2026-09-20', status:'present', user_id:'u', attendee_id:null },
      { service_date:'2026-09-20', status:'absent', user_id:null, attendee_id:'a' },
      { service_date:'2026-09-20', status:'present', user_id:null, attendee_id:'b' },
    ], [{user_id:'u',attendee_id:'a'}])[0]).toEqual({week:'09-20',Present:2,Late:0,Absent:0,Excused:0});
  });
});