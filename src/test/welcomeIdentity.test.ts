import { describe, expect, it, vi } from 'vitest';

vi.mock('../../supabase/functions/_shared/phone.ts', () => ({
  normalizePhone: (phone?: string) => ({ e164: phone ? '+12025550198' : null }),
}));
import { findWelcomePerson } from '../../supabase/functions/_shared/welcomeIdentity';

const phone = '+12025550198';
const email = 'family@example.test';
const person = (id: string, first_name: string) => ({ id, first_name, last_name: 'Family', phone, phone_last10: '2025550198', email });
function database(attendees: any[], profiles: any[] = []) {
  return { from: (table: string) => {
    let rows = table === 'attendees' ? attendees : profiles;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { rows = rows.filter(row => row[key] === value); return query; },
      ilike: (key: string, value: string) => { rows = rows.filter(row => row[key]?.toLowerCase() === value.toLowerCase()); return query; },
      order: () => query,
      range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
    };
    return query;
  } };
}

describe('Welcome family identity matching', () => {
  it('allows a new relative sharing both email and phone to register separately', async () => {
    expect(await findWelcomePerson(database([person('parent', 'Parent'), person('sibling', 'Sibling')]), phone, email,
      { firstName: 'New', lastName: 'Family' })).toBeNull();
  });
  it('reuses only the submitted person among relatives sharing a phone', async () => {
    expect(await findWelcomePerson(database([person('parent', 'Parent'), person('child', 'Child')]), phone, undefined,
      { firstName: ' child ', lastName: ' FAMILY ' })).toEqual({ attendeeId: 'child', userId: null });
  });
  it('allows a new relative sharing only email to register separately', async () => {
    expect(await findWelcomePerson(database([person('parent', 'Parent')]), undefined, email,
      { firstName: 'New', lastName: 'Family' })).toBeNull();
  });
  it('deduplicates the same person across a linked profile and attendee', async () => {
    const profile = { user_id: 'user', attendee_id: 'child', full_name: 'Child Family', phone, email };
    expect(await findWelcomePerson(database([person('child', 'Child')], [profile]), phone, email,
      { firstName: 'Child', lastName: 'Family' })).toEqual({ attendeeId: 'child', userId: 'user' });
  });
  it('rejects ambiguous phone-only check-in instead of selecting a relative', async () => {
    await expect(findWelcomePerson(database([person('parent', 'Parent'), person('child', 'Child')]), phone))
      .rejects.toThrow('More than one registration matches');
  });
  it('rejects indistinguishable same-name people rather than guessing', async () => {
    await expect(findWelcomePerson(database([person('one', 'Child'), person('two', 'Child')]), phone, email,
      { firstName: 'Child', lastName: 'Family' })).rejects.toThrow('More than one registration matches');
  });
  it('finds repeat registrants beyond the first contact-match page', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => person(String(i), `Relative${i}`));
    expect(await findWelcomePerson(database(rows), phone, email, { firstName: 'Relative100', lastName: 'Family' }))
      .toEqual({ attendeeId: '100', userId: null });
  });
});