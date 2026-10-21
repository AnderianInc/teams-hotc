import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { z } from 'zod';
import { findWelcomePerson, issueWelcomeToken, recordWelcome } from '../../supabase/functions/_shared/welcomeIdentity';

const runtime = vi.hoisted(() => ({ handler: null as ((req: Request) => Promise<Response>) | null, db: null as any }));
vi.mock('../../supabase/functions/_shared/phone.ts', () => ({ normalizePhone: () => ({ e164: '+12025550198', valid: true }) }));

it('saves a new family member, queues follow-up, logs welcome email, and reuses only that person on repeat submission', async () => {
  const phone = '+12025550198';
  const email = 'family@example.test';
  const tables: Record<string, any[]> = {
    attendees: [
      { id: 'parent', first_name: 'Parent', last_name: 'Family', phone, phone_last10: '2025550198', email },
      { id: 'sibling', first_name: 'Sibling', last_name: 'Family', phone, phone_last10: '2025550198', email },
    ],
    profiles: [], follow_ups: [], welcome_device_tokens: [], user_roles: [], team_members: [], email_log: [],
    email_templates: [{ slug: 'welcome-visitor', subject: 'Welcome {{firstName}}', body_html: 'Hello {{firstName}}' }],
  };
  const recorded: any[] = [];
  runtime.db = {
    from: (table: string) => {
      let rows = [...(tables[table] || [])];
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
        ilike: (key: string, value: string) => { rows = rows.filter(row => row[key]?.toLowerCase() === value.toLowerCase()); return query; },
        order: () => query,
        limit: (n: number) => { rows = rows.slice(0, n); return query; },
        range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
        insert: (value: any) => {
          const values = (Array.isArray(value) ? value : [value]).map(row => ({ id: `${table}-${(tables[table] || []).length}`, ...row,
            ...(table === 'attendees' ? { phone_last10: '2025550198' } : {}) }));
          tables[table] ||= [];
          tables[table].push(...values);
          rows = values;
          return query;
        },
        single: async () => ({ data: rows[0] || null, error: null }),
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve: (result: any) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return query;
    },
    rpc: async (_name: string, args: any) => { recorded.push(args); return { data: { name: 'New Family' }, error: null }; },
  };
  const send = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', send);
  try {
    // Execute the actual Deno handler with isolated dependencies; no live database or messaging calls.
    const source = readFileSync('supabase/functions/register-visitor/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
    const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 } }).outputText;
    const install = new Function('serve', 'createClient', 'corsHeaders', 'z', 'findWelcomePerson', 'issueWelcomeToken', 'recordWelcome', 'normalizePhone', 'Deno', compiled);
    install((handler: typeof runtime.handler) => { runtime.handler = handler; }, () => runtime.db, {}, z,
      findWelcomePerson, issueWelcomeToken, recordWelcome, () => ({ e164: phone, valid: true }),
      { env: { get: (key: string) => ({ SUPABASE_URL: 'https://backend.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only', RESEND_API_KEY: 'test-only' } as Record<string, string>)[key] } });
    const handler = runtime.handler;
    if (!handler) throw new Error('Registration handler was not installed');
    const submit = () => handler(new Request('https://backend.example.test/register-visitor', {
      method: 'POST', body: JSON.stringify({ firstName: 'New', lastName: 'Family', phone, email, smsOptIn: false }),
    }));
    const initial = await submit();
    expect(initial.status).toBe(200);
    expect((await initial.json()).returning).toBeUndefined();
    expect(tables.attendees).toHaveLength(3);
    expect(tables.attendees[2].first_name).toBe('New');
    expect(tables.follow_ups).toHaveLength(1);
    expect(tables.follow_ups[0].attendee_id).toBe(tables.attendees[2].id);
    expect(tables.email_log).toHaveLength(1);
    expect(tables.email_log[0]).toMatchObject({ to_email: email, related_attendee_id: tables.attendees[2].id, status: 'sent' });
    const repeat = await submit();
    expect(repeat.status).toBe(200);
    expect((await repeat.json()).returning).toBe(true);
    expect(tables.attendees).toHaveLength(3);
    expect(recorded.map(row => row._attendee_id)).toEqual([tables.attendees[2].id, tables.attendees[2].id]);
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});