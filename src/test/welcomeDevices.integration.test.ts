import { expect, it } from 'vitest';

// Uses the managed preview session without printing credentials or changing a real person's devices.
const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const url = process.env.VITE_SUPABASE_URL;
const run = session && key && url ? it : it.skip;

run('only authenticated admins can count or revoke remembered devices', async () => {
  const token = JSON.parse(session || '{}').access_token;
  const call = (bearer: string) => fetch(`${url}/rest/v1/rpc/manage_welcome_devices`, {
    method: 'POST',
    headers: { apikey: key || '', Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ _attendee_id: '00000000-0000-4000-8000-000000000001' }),
  });
  const anonymous = await call(key || '');
  expect(anonymous.ok).toBe(false);
  const admin = await call(token);
  expect(admin.status).toBe(200);
  expect(await admin.json()).toBe(0);
});