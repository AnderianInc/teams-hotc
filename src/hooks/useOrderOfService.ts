import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServiceTemplate {
  id: string;
  name: string;
  description: string | null;
  default_start_time: string | null;
  default_duration_minutes: number | null;
  is_active: boolean;
  created_at: string;
}

export interface TemplateSlot {
  id: string;
  template_id: string;
  order_index: number;
  title: string;
  duration_minutes: number;
  notes: string | null;
  default_team_id: string | null;
  default_role_type_id: string | null;
}

export interface ServiceInstance {
  id: string;
  template_id: string | null;
  roster_event_id: string | null;
  service_date: string;
  start_time: string | null;
  title: string;
  notes: string | null;
  status: string;
  created_at: string;
}

export interface InstanceSlot {
  id: string;
  instance_id: string;
  order_index: number;
  title: string;
  duration_minutes: number;
  notes: string | null;
  team_id: string | null;
  role_type_id: string | null;
}

export interface SlotAssignment {
  id: string;
  slot_id: string;
  assignee_type: "profile" | "attendee";
  profile_id: string | null;
  attendee_id: string | null;
  role_label: string | null;
  status: string;
  roster_entry_id: string | null;
}

export function useTemplates() {
  return useQuery({
    queryKey: ["service-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ServiceTemplate[];
    },
  });
}

export function useTemplateSlots(templateId: string | null) {
  return useQuery({
    queryKey: ["service-template-slots", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_template_slots")
        .select("*")
        .eq("template_id", templateId!)
        .order("order_index");
      if (error) throw error;
      return data as TemplateSlot[];
    },
  });
}

export function useInstances() {
  return useQuery({
    queryKey: ["service-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_instances")
        .select("*")
        .order("service_date", { ascending: false });
      if (error) throw error;
      return data as ServiceInstance[];
    },
  });
}

export function useInstance(instanceId: string | null) {
  return useQuery({
    queryKey: ["service-instance", instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_instances")
        .select("*")
        .eq("id", instanceId!)
        .single();
      if (error) throw error;
      return data as ServiceInstance;
    },
  });
}

export function useInstanceSlots(instanceId: string | null) {
  return useQuery({
    queryKey: ["service-instance-slots", instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_instance_slots")
        .select("*")
        .eq("instance_id", instanceId!)
        .order("order_index");
      if (error) throw error;
      return data as InstanceSlot[];
    },
  });
}

export function useSlotAssignments(instanceId: string | null) {
  return useQuery({
    queryKey: ["service-slot-assignments", instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      // Fetch all assignments for slots in this instance
      const { data: slots } = await supabase
        .from("service_instance_slots")
        .select("id")
        .eq("instance_id", instanceId!);
      const ids = (slots || []).map((s: any) => s.id);
      if (!ids.length) return [] as SlotAssignment[];
      const { data, error } = await supabase
        .from("service_slot_assignments")
        .select("*")
        .in("slot_id", ids);
      if (error) throw error;
      return data as SlotAssignment[];
    },
  });
}

export function useInvalidateOoS() {
  const qc = useQueryClient();
  return (instanceId?: string | null) => {
    qc.invalidateQueries({ queryKey: ["service-templates"] });
    qc.invalidateQueries({ queryKey: ["service-template-slots"] });
    qc.invalidateQueries({ queryKey: ["service-instances"] });
    qc.invalidateQueries({ queryKey: ["service-instance-slots"] });
    qc.invalidateQueries({ queryKey: ["service-slot-assignments"] });
    if (instanceId) {
      qc.invalidateQueries({ queryKey: ["service-instance", instanceId] });
    }
  };
}

/**
 * Generate a service instance from a template on a given date.
 * Creates the instance + slots, and creates/links a roster_event for that date.
 */
export async function generateServiceFromTemplate(
  templateId: string,
  serviceDate: string,
  options: {
    rosterEventId?: string | null;
    title?: string;
    startTime?: string | null;
    createRosterEvent?: boolean;
  } = {},
) {
  const { data: template, error: tErr } = await supabase
    .from("service_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (tErr) throw tErr;

  const { data: tSlots, error: sErr } = await supabase
    .from("service_template_slots")
    .select("*")
    .eq("template_id", templateId)
    .order("order_index");
  if (sErr) throw sErr;

  let rosterEventId: string | null = options.rosterEventId ?? null;
  if (!rosterEventId && options.createRosterEvent !== false) {
    try {
      const { data: rosterEvent } = await supabase
        .from("roster_events")
        .insert({
          name: options.title || template.name,
          event_date: serviceDate,
          event_time: options.startTime ?? template.default_start_time,
          description: `Order of Service: ${options.title || template.name}`,
        })
        .select("id")
        .single();
      rosterEventId = rosterEvent?.id ?? null;
    } catch {
      // Instance can still be created if the linked master schedule event fails.
    }
  }

  let allowedTeamIds: string[] = [];
  if (rosterEventId) {
    const { data: links } = await supabase
      .from("roster_event_teams")
      .select("team_id")
      .eq("event_id", rosterEventId);
    allowedTeamIds = (links || []).map((link: any) => link.team_id).filter(Boolean);
  }

  const { data: instance, error: iErr } = await supabase
    .from("service_instances")
    .insert({
      template_id: templateId,
      roster_event_id: rosterEventId,
      service_date: serviceDate,
      start_time: options.startTime ?? template.default_start_time,
      title: options.title || template.name,
      status: "draft",
    })
    .select("*")
    .single();
  if (iErr) throw iErr;

  if (tSlots && tSlots.length) {
    const rows = tSlots.map((s: any) => ({
      instance_id: instance.id,
      order_index: s.order_index,
      title: s.title,
      duration_minutes: s.duration_minutes,
      notes: s.notes,
      team_id: s.default_team_id,
      team_id: !allowedTeamIds.length || allowedTeamIds.includes(s.default_team_id) ? s.default_team_id : null,
      role_type_id: s.default_role_type_id,
    }));
    const { error: insErr } = await supabase.from("service_instance_slots").insert(rows);
    if (insErr) throw insErr;
  }

  return instance as ServiceInstance;
}
