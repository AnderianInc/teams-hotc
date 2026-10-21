import { normalizePhone } from './phone.ts';

export async function findWelcomePerson(sb: any, phone?: string, email?: string) {
  const matches = new Map<string, { attendeeId: string | null; userId: string | null }>();
  const normalized = normalizePhone(phone);
  for (const table of ['attendees', 'profiles']) {
    const select = table === 'attendees' ? 'id' : 'user_id,attendee_id';
    const add = (rows: any[]) => rows.forEach(row => {
      const person = table === 'attendees' ? { attendeeId: row.id, userId: null } : { attendeeId: row.attendee_id, userId: row.user_id };
      const key = person.attendeeId ? `a:${person.attendeeId}` : `u:${person.userId}`;
      const prior = matches.get(key);
      matches.set(key, { attendeeId: person.attendeeId, userId: person.userId || prior?.userId || null });
    });
    if (normalized.e164) {
      const { data, error } = await sb.from(table).select(select).eq('phone_last10', normalized.e164.replace(/\D/g, '').slice(-10)).limit(3);
      if (error) throw error;
      add(data || []);
      const { data: exact, error: exactError } = await sb.from(table).select(select).eq('phone', normalized.e164).limit(3);
      if (exactError) throw exactError;
      add(exact || []);
    }
    if (email?.trim()) {
      const safeEmail = email.trim().replace(/[%_]/g, '\\$&');
      const { data, error } = await sb.from(table).select(select).ilike('email', safeEmail).limit(3);
      if (error) throw error;
      add(data || []);
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