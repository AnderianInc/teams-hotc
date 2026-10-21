import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.25.76';
import { findWelcomePerson, issueWelcomeToken, recordWelcome, tokenHash } from '../_shared/welcomeIdentity.ts';

const schema = z.object({
  type: z.enum(['signed_in', 'device', 'phone', 'volunteer', 'member']),
  token: z.string().min(40).max(200).optional(), phone: z.string().trim().max(30).optional(),
  user_id: z.string().uuid().optional(), attendee_id: z.string().uuid().optional(),
  first_name: z.string().trim().min(1).max(50).optional(), last_name: z.string().trim().min(1).max(50).optional(),
});
Deno.serve(async req => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return respond({ error: 'Please check the information entered.' }, 400);
    const input = parsed.data;
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Check-in is temporarily unavailable.');
    const sb = createClient(url, key);
    let person: { attendeeId?: string | null; userId?: string | null } | null = null;
    if (input.type === 'signed_in') {
      const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!bearer) return respond({ error: 'Please sign in again.' }, 401);
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) return respond({ error: 'Please sign in again.' }, 401);
      person = { userId: data.user.id };
    } else if (input.type === 'device') {
      if (!input.token) return respond({ error: 'Device not recognized' }, 404);
      const { data, error } = await sb.from('welcome_device_tokens').select('attendee_id,user_id').eq('token_hash', await tokenHash(input.token)).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: 'Device not recognized' }, 404);
      person = { attendeeId: data.attendee_id, userId: data.user_id };
    } else if (input.type === 'phone') {
      if (!input.phone) return respond({ error: 'Please enter your mobile number.' }, 400);
      person = await findWelcomePerson(sb, input.phone);
      if (!person) return respond({ error: 'No registration found. Please register below or ask the welcome team.' }, 404);
    } else if (input.type === 'volunteer' && input.user_id) {
      person = { userId: input.user_id };
    } else if (input.type === 'member') {
      if (input.attendee_id) person = { attendeeId: input.attendee_id };
      else if (input.first_name && input.last_name) {
        person = await findWelcomePerson(sb, input.phone);
        if (!person) {
          const { data, error } = await sb.from('attendees').insert({ first_name: input.first_name, last_name: input.last_name, phone: input.phone || null, is_member: true }).select('id').single();
          if (error) throw error;
          person = { attendeeId: data.id };
        }
      }
    }
    if (!person) return respond({ error: 'Please select a registered person.' }, 400);
    const result = await recordWelcome(sb, person);
    // Only authenticated self, phone lookup, or an existing device credential can remember a device.
    const token = input.type === 'device' ? input.token : ['signed_in', 'phone'].includes(input.type) ? await issueWelcomeToken(sb, person) : undefined;
    return respond({ ...result, token });
  } catch (error) {
    console.error('Check-in failed:', error instanceof Error ? error.message : 'unknown');
    return respond({ error: error instanceof Error ? error.message : 'Unable to check in. Please try again.' }, 400);
  }
});
