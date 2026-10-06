# Events App: admin-built events, registration pages and follow-up automations

## Goal
Replace Planned Outreach and every hard-coded message, step and form with one **Events** app. Admins (with optional AI help) create an event, design its registration form, build its follow-up workflow from Comms templates, and publish it to a public page. Nothing in the backend holds message wording, timing or step order.

## What users will see

**Events** (new item in the sidebar; it replaces Planned Outreach)
- Events list: upcoming, draft, published and past events, each with a registration count.
- **Create Event** has two options:
  - **Manual:** a step-by-step setup (Details, Registration Form, Follow-up Workflow, Publish).
  - **AI Wizard:** describe the event in plain words. The AI drafts the details, form fields, workflow steps and message copy. You review and edit everything before publishing.
- **Event templates:** save any event as a template, such as "Interest Meeting" or "Sunday Visit", and start new events from it.

**Event setup steps**
1. **Details:** name, date, time, location, description, public link (slug), and the type of contact it creates (visit, interest, prayer or general).
2. **Registration form:** turn standard fields (first and last name, email, phone, SMS consent) on or off and mark them required. Add custom questions such as a team picker, kids count or free text.
3. **Follow-up workflow:** a list of steps, laid out like a Zapier workflow. Each step has:
   - a channel (email or SMS)
   - a template, picked from the Comms email and SMS templates or created on the spot
   - timing relative to the signup or the event, for example "immediately", "1 day before at 10 AM" or "1 hour before"
   - a choice between sending automatically or waiting for review
   - an on/off switch

   Steps can be reordered, added and deleted.
4. **Publish:** the page goes live at `teams.hotc.life/e/<slug>`, and the event appears on the public Events page.

**Each event's dashboard**
- Registrations list, Mark Attended (adds the person to the Directory, and to Volunteer Onboarding for interest events), scheduled and sent messages, and a pending-review queue.

**Comms stays the same.** All event messages are ordinary email and SMS templates in Communications → Templates. Editing a template there changes what goes out.

## How the current Interest Meeting moves over
- `teams.hotc.life/interest-meeting` keeps working at the same address. It becomes a published event with the slug `interest-meeting`, displayed by the new dynamic event page.
- Today's form fields become that event's form settings: required names, email and phone, team chips, and SMS consent.
- Today's hard-coded messages become 6 editable Comms templates: email confirmation, day-before reminder, no-show follow-up, SMS confirmation, day-of nudge (1 hour before) and SMS no-show. The wording stays the same as now.
- Today's fixed timings become the event's workflow steps.
- The Oct 25 session and existing registrations are linked to this event. Nothing already scheduled is lost.

## What is removed
- The `/plan-a-visit` page and its submit endpoint. Visit requests come only from the hotc.life website through the hourly sync.
- The Planned Outreach page and its fixed prayer/visit/interest sequences, after their data is moved into events.
- All message copy in the interest-meeting submit, sync and outreach dispatcher functions.

## Website sync (hotc.life)
- It still runs hourly. Each incoming source (visit requests, interest meetings, prayer requests) is mapped in Events settings to an admin-chosen event or workflow. Prayer requests get no message unless an admin attaches a workflow to them.

## Rollout (phases)
1. **Data foundation:** create the events, form fields, workflow steps, registrations and scheduled messages. Seed the Interest Meeting event and its 6 templates from today's copy, then link the existing leads.
2. **One general engine:** a single submit endpoint and a single message dispatcher, both driven entirely by event data and templates. Old functions move onto them, then retire.
3. **Events app UI:** the list, manual setup, workflow builder, template picker and inline template creation, event templates, and the per-event dashboard.
4. **Public pages:** the dynamic `/e/:slug` page, `/interest-meeting` pointing to it, a public Events list page, and removal of `/plan-a-visit`.
5. **AI Wizard:** a prompt that produces a full draft event (details, form, steps and copy), shown for review before anything is saved.
6. **Clean-up and verification:** remove Planned Outreach, then submit a real test registration on `/interest-meeting` and confirm the email and text use the edited template wording.

## Technical details
- New tables (all with grants and RLS: admins and First Impressions manage them, anonymous visitors read published events only):
  - `events` (slug unique, status draft/published/archived, lead_type, start_at, location, description, form_config jsonb, is_template)
  - `event_workflow_steps` (event_id, order_index, channel, email_template_id / sms_template_id, anchor signup|event_start, offset_minutes, send_at_local_time, requires_approval, active)
  - `funnel_leads` gets `event_id`, plus `custom_answers jsonb`. The existing table is reused, so promote_funnel_lead keeps working.
  - `funnel_messages` gets `event_id`, `step_id` and `template_id`, and the message is rendered at send time from the template.
  - `external_source_mappings` (source key mapped to event_id).
- Templates: add a `category` ("event" or "broadcast") to both template tables, and add `subject` to SMS templates where needed. Placeholders are `{{first_name}}`, `{{event_name}}`, `{{when}}`, `{{where}}` and `{{teams}}`.
- Edge functions:
  - new `event-register` (public; validation from form_config, honeypot, rate limit)
  - `dispatch-funnel-messages` renders from templates and keeps its current consent and DNC rules
  - `outreach-sync` reads the source mappings
  - `interest-meeting-submit` and `plan-visit-submit` are deleted once the new endpoint is live
- AI Wizard: an edge function that calls the Lovable AI Gateway (`openai/gpt-6-astra`, Responses API, streamed, strict JSON schema) and returns a draft event.
- Interest Meeting sessions table: its data moves into events (one event per date), and the settings tab is removed.
- Old outreach_sequences and runs tables are marked deprecated, not dropped.
