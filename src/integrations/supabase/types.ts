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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string | null
          course_id: number | null
          created_at: string | null
          id: string
          posted_at: string | null
          scheduled_post: string | null
          status: string | null
          subject: string | null
          title: string | null
          type: string | null
          week_id: string | null
        }
        Insert: {
          content?: string | null
          course_id?: number | null
          created_at?: string | null
          id?: string
          posted_at?: string | null
          scheduled_post?: string | null
          status?: string | null
          subject?: string | null
          title?: string | null
          type?: string | null
          week_id?: string | null
        }
        Update: {
          content?: string | null
          course_id?: number | null
          created_at?: string | null
          id?: string
          posted_at?: string | null
          scheduled_post?: string | null
          status?: string | null
          subject?: string | null
          title?: string | null
          type?: string | null
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      content_map: {
        Row: {
          canonical_name: string | null
          canvas_file_id: string | null
          canvas_url: string | null
          created_at: string | null
          id: string
          lesson_ref: string
          subject: string
          type: string | null
        }
        Insert: {
          canonical_name?: string | null
          canvas_file_id?: string | null
          canvas_url?: string | null
          created_at?: string | null
          id?: string
          lesson_ref: string
          subject: string
          type?: string | null
        }
        Update: {
          canonical_name?: string | null
          canvas_file_id?: string | null
          canvas_url?: string | null
          created_at?: string | null
          id?: string
          lesson_ref?: string
          subject?: string
          type?: string | null
        }
        Relationships: []
      }
      deploy_log: {
        Row: {
          action: string | null
          canvas_url: string | null
          created_at: string | null
          id: string
          message: string | null
          payload: Json | null
          status: string | null
          subject: string | null
          week_id: string | null
        }
        Insert: {
          action?: string | null
          canvas_url?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          payload?: Json | null
          status?: string | null
          subject?: string | null
          week_id?: string | null
        }
        Update: {
          action?: string | null
          canvas_url?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          payload?: Json | null
          status?: string | null
          subject?: string | null
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deploy_log_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          confidence: string | null
          created_at: string | null
          drive_file_id: string | null
          friendly_name: string | null
          id: string
          lesson_num: string | null
          original_name: string | null
          subject: string | null
          type: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string | null
          drive_file_id?: string | null
          friendly_name?: string | null
          id?: string
          lesson_num?: string | null
          original_name?: string | null
          subject?: string | null
          type?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string | null
          drive_file_id?: string | null
          friendly_name?: string | null
          id?: string
          lesson_num?: string | null
          original_name?: string | null
          subject?: string | null
          type?: string | null
        }
        Relationships: []
      }
      newsletters: {
        Row: {
          birthdays: string | null
          created_at: string | null
          date_range: string | null
          extra_sections: Json | null
          homeroom_notes: string | null
          html_content: string | null
          id: string
          posted_at: string | null
          status: string | null
        }
        Insert: {
          birthdays?: string | null
          created_at?: string | null
          date_range?: string | null
          extra_sections?: Json | null
          homeroom_notes?: string | null
          html_content?: string | null
          id?: string
          posted_at?: string | null
          status?: string | null
        }
        Update: {
          birthdays?: string | null
          created_at?: string | null
          date_range?: string | null
          extra_sections?: Json | null
          homeroom_notes?: string | null
          html_content?: string | null
          id?: string
          posted_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      pacing_rows: {
        Row: {
          at_home: string | null
          canvas_assignment_id: string | null
          canvas_url: string | null
          content_hash: string | null
          create_assign: boolean | null
          created_at: string | null
          day: string
          deploy_status: string | null
          id: string
          in_class: string | null
          last_deployed: string | null
          lesson_num: string | null
          object_id: string | null
          resources: string | null
          subject: string
          type: string | null
          week_id: string | null
        }
        Insert: {
          at_home?: string | null
          canvas_assignment_id?: string | null
          canvas_url?: string | null
          content_hash?: string | null
          create_assign?: boolean | null
          created_at?: string | null
          day: string
          deploy_status?: string | null
          id?: string
          in_class?: string | null
          last_deployed?: string | null
          lesson_num?: string | null
          object_id?: string | null
          resources?: string | null
          subject: string
          type?: string | null
          week_id?: string | null
        }
        Update: {
          at_home?: string | null
          canvas_assignment_id?: string | null
          canvas_url?: string | null
          content_hash?: string | null
          create_assign?: boolean | null
          created_at?: string | null
          day?: string
          deploy_status?: string | null
          id?: string
          in_class?: string | null
          last_deployed?: string | null
          lesson_num?: string | null
          object_id?: string | null
          resources?: string | null
          subject?: string
          type?: string | null
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacing_rows_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          assignment_prefixes: Json
          auto_logic: Json
          canvas_base_url: string | null
          course_ids: Json
          id: string
          power_up_map: Json
          quarter_colors: Json
          spelling_word_bank: Json
          updated_at: string | null
        }
        Insert: {
          assignment_prefixes?: Json
          auto_logic?: Json
          canvas_base_url?: string | null
          course_ids?: Json
          id?: string
          power_up_map?: Json
          quarter_colors?: Json
          spelling_word_bank?: Json
          updated_at?: string | null
        }
        Update: {
          assignment_prefixes?: Json
          auto_logic?: Json
          canvas_base_url?: string | null
          course_ids?: Json
          id?: string
          power_up_map?: Json
          quarter_colors?: Json
          spelling_word_bank?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      weeks: {
        Row: {
          created_at: string | null
          date_range: string | null
          id: string
          quarter: string
          reminders: string | null
          resources: string | null
          week_num: number
        }
        Insert: {
          created_at?: string | null
          date_range?: string | null
          id?: string
          quarter: string
          reminders?: string | null
          resources?: string | null
          week_num: number
        }
        Update: {
          created_at?: string | null
          date_range?: string | null
          id?: string
          quarter?: string
          reminders?: string | null
          resources?: string | null
          week_num?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
