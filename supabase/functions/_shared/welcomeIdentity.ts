import { normalizePhone } from './phone.ts';

export async function findWelcomePerson(sb: any, phone?: string, email?: string, registrationName?: { firstName: string; lastName: string }) {
  const matches = new Map<string, { attendeeId: string | null; userId: string | null }>();
  const normalized = normalizePhone(phone);
  const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  const submittedName = registrationName ? normalizeName(`${registrationName.firstName} ${registrationName.lastName}`) : null;
  for (const table of ['attendees', 'profiles']) {
    const select = table === 'attendees' ? 'id,first_name,last_name' : 'user_id,attendee_id,full_name';
    const add = (rows: any[]) => rows.forEach(row => {
      // Shared family contact details alone must never identify a new registrant.
      const rowName = table === 'attendees' ? `${row.first_name || ''} ${row.last_name || ''}` : row.full_name || '';
      if (submittedName && normalizeName(rowName) !== submittedName) return;
      const person = table === 'attendees' ? { attendeeId: row.id, userId: null } : { attendeeId: row.attendee_id, userId: row.user_id };
      const key = person.attendeeId ? `a:${person.attendeeId}` : `u:${person.userId}`;
      const prior = matches.get(key);
      matches.set(key, { attendeeId: person.attendeeId, userId: person.userId || prior?.userId || null });
    });
    const collect = async (column: string, value: string, caseInsensitive = false) => {
      let offset = 0;
      const pageSize = registrationName ? 100 : 3;
      do {
        let query = sb.from(table).select(select);
        query = caseInsensitive ? query.ilike(column, value) : query.eq(column, value);
        const { data, error } = await query.order(table === 'attendees' ? 'id' : 'user_id').range(offset, offset + pageSize - 1);
        if (error) throw error;
        add(data || []);
        if (!registrationName || (data || []).length < pageSize) break;
        offset += pageSize;
      } while (true);
    };
    if (normalized.e164) {
      await collect('phone_last10', normalized.e164.replace(/\D/g, '').slice(-10));
      await collect('phone', normalized.e164);
    }
    if (email?.trim()) {
      const safeEmail = email.trim().replace(/[%_]/g, '\\$&');
      await collect('email', safeEmail, true);
    }
  }
  if (matches.size > 1) throw new Error('More than one registration matches. Please ask the welcome team to check you in.');
  return [...matches.values()][0] || null;
}

export async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function issueWelcomeToken(sb: any, person: { attendeeId?: string | null; userId?: string | null }) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await sb.from('welcome_device_tokens').insert({
    token_hash: await tokenHash(token), attendee_id: person.attendeeId || null, user_id: person.userId || null,
  });
  if (error) throw error;
  return token;
}

export async function recordWelcome(sb: any, person: { attendeeId?: string | null; userId?: string | null }) {
  const { data, error } = await sb.rpc('record_welcome_attendance', {
    _user_id: person.userId || null, _attendee_id: person.attendeeId || null,
  });
  if (error) throw error;
  return data;
}