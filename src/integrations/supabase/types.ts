export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          attendee_id: string
          created_at: string
          id: string
          notes: string | null
          service_id: string | null
          visit_date: string
        }
        Insert: {
          attendee_id: string
          created_at?: string
          id?: string
          notes?: string | null
          service_id?: string | null
          visit_date?: string
        }
        Update: {
          attendee_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          service_id?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_relationships: {
        Row: {
          created_at: string
          from_attendee_id: string
          id: string
          relationship_type: string
          to_attendee_id: string
        }
        Insert: {
          created_at?: string
          from_attendee_id: string
          id?: string
          relationship_type: string
          to_attendee_id: string
        }
        Update: {
          created_at?: string
          from_attendee_id?: string
          id?: string
          relationship_type?: string
          to_attendee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendee_relationships_from_attendee_id_fkey"
            columns: ["from_attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendee_relationships_to_attendee_id_fkey"
            columns: ["to_attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendees: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          do_not_contact: boolean
          do_not_contact_reason: string | null
          email: string | null
          first_name: string
          first_visit_date: string | null
          how_heard: string | null
          id: string
          is_member: boolean
          last_name: string
          notes: string | null
          phone: string | null
          phone_raw: string | null
          prayer_requests: string | null
          sms_opt_in: boolean
          sms_opt_in_at: string | null
          sms_opt_in_source: string | null
          sms_opt_in_text: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          email?: string | null
          first_name: string
          first_visit_date?: string | null
          how_heard?: string | null
          id?: string
          is_member?: boolean
          last_name: string
          notes?: string | null
          phone?: string | null
          phone_raw?: string | null
          prayer_requests?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opt_in_source?: string | null
          sms_opt_in_text?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          email?: string | null
          first_name?: string
          first_visit_date?: string | null
          how_heard?: string | null
          id?: string
          is_member?: boolean
          last_name?: string
          notes?: string | null
          phone?: string | null
          phone_raw?: string | null
          prayer_requests?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opt_in_source?: string | null
          sms_opt_in_text?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          checked_out_at: string | null
          child_id: string
          id: string
          room_id: string | null
          service_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          child_id: string
          id?: string
          room_id?: string | null
          service_id: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          child_id?: string
          id?: string
          room_id?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          allergies: string | null
          created_at: string
          date_of_birth: string | null
          family_id: string
          first_name: string
          grade_group: string | null
          id: string
          last_name: string
          medical_notes: string | null
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          family_id: string
          first_name: string
          grade_group?: string | null
          id?: string
          last_name: string
          medical_notes?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          family_id?: string
          first_name?: string
          grade_group?: string | null
          id?: string
          last_name?: string
          medical_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          member_id: string
          member_type: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          member_id: string
          member_type: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          member_id?: string
          member_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filter: Json
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter?: Json
          id?: string
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter?: Json
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          body_html: string | null
          created_at: string | null
          id: string
          related_attendee_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
          subject: string
          to_email: string
          to_name: string | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string | null
          id?: string
          related_attendee_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject: string
          to_email: string
          to_name?: string | null
        }
        Update: {
          body_html?: string | null
          created_at?: string | null
          id?: string
          related_attendee_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject?: string
          to_email?: string
          to_name?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string | null
          id: string
          name: string
          placeholders: string[] | null
          slug: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          created_at?: string | null
          id?: string
          name: string
          placeholders?: string[] | null
          slug: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string | null
          id?: string
          name?: string
          placeholders?: string[] | null
          slug?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      external_records: {
        Row: {
          attendee_id: string | null
          category: string | null
          created_at: string
          event_date: string | null
          external_id: string
          id: string
          match_reason: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          attendee_id?: string | null
          category?: string | null
          created_at?: string
          event_date?: string | null
          external_id: string
          id?: string
          match_reason?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          attendee_id?: string | null
          category?: string | null
          created_at?: string
          event_date?: string | null
          external_id?: string
          id?: string
          match_reason?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      external_sync_state: {
        Row: {
          last_error: string | null
          last_run_status: string | null
          last_synced_at: string | null
          records_imported: number
          source: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          last_run_status?: string | null
          last_synced_at?: string | null
          records_imported?: number
          source: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          last_run_status?: string | null
          last_synced_at?: string | null
          records_imported?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      families: {
        Row: {
          created_at: string
          family_name: string
          id: string
          parent1_name: string
          parent1_phone: string
          parent2_name: string | null
          parent2_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_name: string
          id?: string
          parent1_name: string
          parent1_phone: string
          parent2_name?: string | null
          parent2_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_name?: string
          id?: string
          parent1_name?: string
          parent1_phone?: string
          parent2_name?: string | null
          parent2_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          id: string
          message: string
          responded_at: string | null
          responded_by: string | null
          status: string
          subject: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_activities: {
        Row: {
          activity_type: string
          actor_id: string | null
          content: string | null
          created_at: string
          follow_up_id: string
          id: string
        }
        Insert: {
          activity_type: string
          actor_id?: string | null
          content?: string | null
          created_at?: string
          follow_up_id: string
          id?: string
        }
        Update: {
          activity_type?: string
          actor_id?: string | null
          content?: string | null
          created_at?: string
          follow_up_id?: string
          id?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          assigned_to: string | null
          attendee_id: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          method: string | null
          notes: string | null
          priority: string | null
          prospect_pipeline_stage: string | null
          status: Database["public"]["Enums"]["followup_status"]
          type: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attendee_id: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          priority?: string | null
          prospect_pipeline_stage?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          type?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attendee_id?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          priority?: string | null
          prospect_pipeline_stage?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
        ]
      }
      help_feedback: {
        Row: {
          article_slug: string
          comment: string | null
          created_at: string
          helpful: boolean
          id: string
          user_id: string | null
        }
        Insert: {
          article_slug: string
          comment?: string | null
          created_at?: string
          helpful: boolean
          id?: string
          user_id?: string | null
        }
        Update: {
          article_slug?: string
          comment?: string | null
          created_at?: string
          helpful?: boolean
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      interest_meetings: {
        Row: {
          created_at: string
          id: string
          location: string | null
          meeting_date: string
          notes: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          meeting_date: string
          notes?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          meeting_date?: string
          notes?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          recipient_id: string
          title: string
          type: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: []
      }
      outreach_sequence_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string | null
          channel: string | null
          detail: string | null
          external_record_id: string
          id: string
          recipient: string | null
          scheduled_for: string | null
          sent_at: string
          sequence_id: string
          status: string
          subject: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          channel?: string | null
          detail?: string | null
          external_record_id: string
          id?: string
          recipient?: string | null
          scheduled_for?: string | null
          sent_at?: string
          sequence_id: string
          status?: string
          subject?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          channel?: string | null
          detail?: string | null
          external_record_id?: string
          id?: string
          recipient?: string | null
          scheduled_for?: string | null
          sent_at?: string
          sequence_id?: string
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_sequence_runs_external_record_id_fkey"
            columns: ["external_record_id"]
            isOneToOne: false
            referencedRelation: "external_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_sequence_runs_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "outreach_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_sequences: {
        Row: {
          active: boolean
          anchor: string
          audience: string
          body_override: string | null
          channel: string
          created_at: string
          description: string | null
          id: string
          offset_days: number
          requires_approval: boolean
          source: string
          step_order: number
          subject_override: string | null
          template_slug: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          anchor?: string
          audience?: string
          body_override?: string | null
          channel: string
          created_at?: string
          description?: string | null
          id?: string
          offset_days?: number
          requires_approval?: boolean
          source: string
          step_order: number
          subject_override?: string | null
          template_slug?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          anchor?: string
          audience?: string
          body_override?: string | null
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          offset_days?: number
          requires_approval?: boolean
          source?: string
          step_order?: number
          subject_override?: string | null
          template_slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      phone_normalization_issues: {
        Row: {
          created_at: string
          id: string
          original: string | null
          reason: string | null
          row_id: string
          source_table: string
        }
        Insert: {
          created_at?: string
          id?: string
          original?: string | null
          reason?: string | null
          row_id: string
          source_table: string
        }
        Update: {
          created_at?: string
          id?: string
          original?: string | null
          reason?: string | null
          row_id?: string
          source_table?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          attendee_id: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          do_not_contact: boolean
          do_not_contact_reason: string | null
          email: string
          full_name: string
          id: string
          is_staff: boolean
          org_sort_order: number
          org_team_id: string | null
          phone: string | null
          phone_raw: string | null
          reports_to_user_id: string | null
          sms_opt_in: boolean
          sms_opt_in_at: string | null
          sms_opt_in_source: string | null
          sms_opt_in_text: string | null
          staff_role_id: string | null
          staff_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          attendee_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          email?: string
          full_name?: string
          id?: string
          is_staff?: boolean
          org_sort_order?: number
          org_team_id?: string | null
          phone?: string | null
          phone_raw?: string | null
          reports_to_user_id?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opt_in_source?: string | null
          sms_opt_in_text?: string | null
          staff_role_id?: string | null
          staff_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          attendee_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          email?: string
          full_name?: string
          id?: string
          is_staff?: boolean
          org_sort_order?: number
          org_team_id?: string | null
          phone?: string | null
          phone_raw?: string | null
          reports_to_user_id?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opt_in_source?: string | null
          sms_opt_in_text?: string | null
          staff_role_id?: string | null
          staff_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_team_id_fkey"
            columns: ["org_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_staff_role_id_fkey"
            columns: ["staff_role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          capacity: number | null
          created_at: string
          grade_group: string | null
          id: string
          max_age: number | null
          min_age: number | null
          name: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          grade_group?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          grade_group?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name?: string
        }
        Relationships: []
      }
      roster_entries: {
        Row: {
          created_at: string
          decline_reason: string | null
          event_id: string | null
          id: string
          notes: string | null
          responded_at: string | null
          response_status: string
          role_description: string | null
          scheduled_date: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          responded_at?: string | null
          response_status?: string
          role_description?: string | null
          scheduled_date: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          responded_at?: string | null
          response_status?: string
          role_description?: string | null
          scheduled_date?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "roster_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      roster_event_teams: {
        Row: {
          created_at: string
          event_id: string
          id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          team_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_event_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "roster_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_event_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_events: {
        Row: {
          created_at: string
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          name: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          name: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          service_date: string
          service_time: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          service_date?: string
          service_time?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          service_date?: string
          service_time?: string | null
        }
        Relationships: []
      }
      sms_inbound: {
        Row: {
          body: string
          created_at: string
          from_name: string | null
          from_phone: string
          id: string
          media_urls: string[] | null
          num_media: number | null
          provider_message_id: string | null
          received_at: string
          related_attendee_id: string | null
          status: string
          to_phone: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          from_name?: string | null
          from_phone: string
          id?: string
          media_urls?: string[] | null
          num_media?: number | null
          provider_message_id?: string | null
          received_at?: string
          related_attendee_id?: string | null
          status?: string
          to_phone?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          from_name?: string | null
          from_phone?: string
          id?: string
          media_urls?: string[] | null
          num_media?: number | null
          provider_message_id?: string | null
          received_at?: string
          related_attendee_id?: string | null
          status?: string
          to_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sms_log: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          related_attendee_id: string | null
          sent_at: string
          sent_by: string | null
          status: string
          to_name: string | null
          to_phone: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          related_attendee_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          to_name?: string | null
          to_phone: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          related_attendee_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          to_name?: string | null
          to_phone?: string
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          placeholders: string[] | null
          slug: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          placeholders?: string[] | null
          slug: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          placeholders?: string[] | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          custom_role: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_role?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_role?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      team_role_types: {
        Row: {
          created_at: string
          id: string
          name: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_role_types_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          team_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          team_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          team_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      volunteer_blocked_dates: {
        Row: {
          blocked_date: string
          created_at: string
          end_date: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          blocked_date: string
          created_at?: string
          end_date?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          blocked_date?: string
          created_at?: string
          end_date?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_attendance: {
        Row: {
          attendee_id: string | null
          checked_in_by: string | null
          created_at: string
          id: string
          is_self_reported: boolean
          notes: string | null
          service_date: string
          status: string
          user_id: string | null
        }
        Insert: {
          attendee_id?: string | null
          checked_in_by?: string | null
          created_at?: string
          id?: string
          is_self_reported?: boolean
          notes?: string | null
          service_date?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          attendee_id?: string | null
          checked_in_by?: string | null
          created_at?: string
          id?: string
          is_self_reported?: boolean
          notes?: string | null
          service_date?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_attendance_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      member_engagement: {
        Row: {
          attendance_90d: number | null
          attendee_id: string | null
          days_since_last_attendance: number | null
          email: string | null
          engagement_band: string | null
          engagement_id: string | null
          full_name: string | null
          last_attendance_date: string | null
          roster_participations_90d: number | null
          source: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_interest_pipeline: {
        Args: { _attendee_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_team_lead: { Args: { _user_id: string }; Returns: boolean }
      is_first_impressions_member: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_kids_ministry_member: { Args: { _user_id: string }; Returns: boolean }
      is_team_lead: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      resolve_contact_group: {
        Args: { _group_id: string }
        Returns: {
          do_not_contact: boolean
          email: string
          first_name: string
          last_name: string
          phone: string
          sms_opt_in: boolean
          source: string
          source_id: string
          tags: string[]
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "team_lead" | "member" | "staff"
      followup_status:
        | "pending"
        | "contacted"
        | "connected"
        | "no_response"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "team_lead", "member", "staff"],
      followup_status: [
        "pending",
        "contacted",
        "connected",
        "no_response",
        "closed",
      ],
    },
  },
} as const
