
-- Email templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  placeholders text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Edge functions need to read templates with service role, so also allow anon read for service_role usage
-- (service_role bypasses RLS anyway, so this policy is purely for admin UI access)

-- Seed with current hardcoded templates
INSERT INTO public.email_templates (slug, name, subject, body_html, placeholders) VALUES
  ('welcome-visitor', 'Welcome Visitor', 'Welcome to House of Transformation Church!',
   '<div style="font-family: ''Segoe UI'', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
  <h2 style="color: #2d2b6b; margin-bottom: 8px;">Welcome, {{firstName}}!</h2>
  <p style="color: #333; font-size: 16px; line-height: 1.6;">
    We''re so glad you visited <strong>House of Transformation Church</strong>! We hope you felt at home with us today.
  </p>
  <h3 style="color: #2d2b6b; margin-top: 24px;">What''s Next?</h3>
  <ul style="color: #333; font-size: 15px; line-height: 1.8; padding-left: 20px;">
    <li>🙏 <strong>Join us again</strong> — Sunday services at 10:00 AM</li>
    <li>☕ <strong>Newcomers'' Connect</strong> — Stay after service to meet the team</li>
    <li>📱 <strong>Stay connected</strong> — Follow us on social media for updates</li>
  </ul>
  {{#prayerRequests}}
  <p style="color: #333; font-size: 15px; line-height: 1.6; margin-top: 16px;">
    We''ve received your prayer request and our prayer team will be lifting you up in prayer. 💛
  </p>
  {{/prayerRequests}}
  <p style="color: #333; font-size: 16px; line-height: 1.6; margin-top: 24px;">
    If you have any questions, don''t hesitate to reach out. We''d love to help you get connected!
  </p>
  <p style="color: #888; font-size: 13px; margin-top: 24px;">— The HOTC Family</p>
</div>',
   ARRAY['firstName', 'prayerRequests']),

  ('volunteer-invite', 'Volunteer Invitation', 'You''ve been invited to join {{teamName}} at House of Transformation Church',
   '<div style="font-family: ''Segoe UI'', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
  <h2 style="color: #2d2b6b; margin-bottom: 8px;">Welcome to House of Transformation Church!</h2>
  <p style="color: #333; font-size: 16px; line-height: 1.6;">
    You''ve been invited to join <strong>{{teamName}}</strong> as a volunteer.
  </p>
  <p style="color: #333; font-size: 16px; line-height: 1.6;">
    Click the button below to accept your invitation, set up your profile, and get started.
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="{{confirmUrl}}" style="display: inline-block; background: #4338ca; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
      Accept Invitation
    </a>
  </div>
  <p style="color: #888; font-size: 13px; margin-top: 24px;">
    If you didn''t expect this invitation, you can safely ignore this email.
  </p>
  <p style="color: #888; font-size: 13px;">— The HOTC Team</p>
</div>',
   ARRAY['teamName', 'confirmUrl']),

  ('birthday', 'Birthday Greeting', '🎂 Happy Birthday, {{firstName}}!',
   '<div style="font-family: ''Segoe UI'', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
  <h2 style="color: #2d2b6b; margin-bottom: 8px;">🎂 Happy Birthday, {{firstName}}!</h2>
  <p style="color: #333; font-size: 16px; line-height: 1.6;">
    From all of us at <strong>House of Transformation Church</strong>, we want to wish you the happiest of birthdays!
  </p>
  <p style="color: #333; font-size: 16px; line-height: 1.6;">
    May God bless you abundantly in this new year of life. We are so grateful to have you as part of our church family. 🙏
  </p>
  <p style="color: #333; font-size: 16px; line-height: 1.6;">
    Enjoy your special day!
  </p>
  <p style="color: #888; font-size: 13px; margin-top: 24px;">— With love, The HOTC Family</p>
</div>',
   ARRAY['firstName']);

-- Attendees DELETE policy for admins
CREATE POLICY "Admins can delete attendees"
  ON public.attendees FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at on email_templates
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
