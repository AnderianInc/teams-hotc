-- Make Coffee with P.K automation respect a setting in app_settings
CREATE OR REPLACE FUNCTION public.queue_coffee_with_pk_for_new_attendee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template RECORD;
  v_subject TEXT;
  v_body TEXT;
  v_settings JSONB;
  v_enabled BOOLEAN;
  v_days INT;
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.do_not_contact, false) THEN RETURN NEW; END IF;

  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'inreach_trigger_config';
  v_enabled := COALESCE((v_settings->>'coffee_with_pk_enabled')::boolean, true);
  v_days := COALESCE((v_settings->>'coffee_with_pk_lead_days')::int, 1);
  IF NOT v_enabled THEN RETURN NEW; END IF;

  SELECT subject, body_html INTO v_template FROM public.email_templates WHERE slug = 'coffee-with-pk' LIMIT 1;
  IF v_template IS NULL THEN RETURN NEW; END IF;

  v_subject := replace(v_template.subject, '{{first_name}}', COALESCE(NEW.first_name, ''));
  v_body := replace(v_template.body_html, '{{first_name}}', COALESCE(NEW.first_name, ''));

  INSERT INTO public.pending_email_approvals (
    attendee_id, template_slug, to_email, to_name, subject, body_html, scheduled_for, status, notes
  ) VALUES (
    NEW.id, 'coffee-with-pk', NEW.email,
    trim(concat(NEW.first_name, ' ', NEW.last_name)),
    v_subject, v_body,
    now() + make_interval(days => v_days),
    'pending',
    'Auto-queued on new attendee. Review and approve before scheduled send time.'
  );

  RETURN NEW;
END;
$function$;