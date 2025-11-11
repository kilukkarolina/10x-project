export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_user_id: string;
          after: Json | null;
          before: Json | null;
          entity_id: string;
          entity_type: string;
          id: string;
          owner_user_id: string;
          performed_at: string;
        };
        Insert: {
          action: string;
          actor_user_id: string;
          after?: Json | null;
          before?: Json | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          owner_user_id: string;
          performed_at?: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string;
          after?: Json | null;
          before?: Json | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          owner_user_id?: string;
          performed_at?: string;
        };
        Relationships: [];
      };
      goal_events: {
        Row: {
          amount_cents: number;
          client_request_id: string;
          created_at: string;
          created_by: string;
          goal_id: string;
          id: string;
          month: string;
          occurred_on: string;
          type: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          client_request_id: string;
          created_at?: string;
          created_by?: string;
          goal_id: string;
          id?: string;
          month?: string;
          occurred_on: string;
          type: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          client_request_id?: string;
          created_at?: string;
          created_by?: string;
          goal_id?: string;
          id?: string;
          month?: string;
          occurred_on?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_events_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      goal_types: {
        Row: {
          code: string;
          created_at: string;
          is_active: boolean;
          label_pl: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          is_active?: boolean;
          label_pl: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          is_active?: boolean;
          label_pl?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          current_balance_cents: number;
          deleted_at: string | null;
          deleted_by: string | null;
          id: string;
          is_priority: boolean;
          name: string;
          target_amount_cents: number;
          type_code: string;
          updated_at: string;
          updated_by: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          current_balance_cents?: number;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          is_priority?: boolean;
          name: string;
          target_amount_cents: number;
          type_code: string;
          updated_at?: string;
          updated_by?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          current_balance_cents?: number;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          is_priority?: boolean;
          name?: string;
          target_amount_cents?: number;
          type_code?: string;
          updated_at?: string;
          updated_by?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_type_code_fkey";
            columns: ["type_code"];
            isOneToOne: false;
            referencedRelation: "goal_types";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      monthly_metrics: {
        Row: {
          expenses_cents: number;
          free_cash_flow_cents: number;
          income_cents: number;
          month: string;
          net_saved_cents: number;
          refreshed_at: string;
          user_id: string;
        };
        Insert: {
          expenses_cents?: number;
          free_cash_flow_cents?: number;
          income_cents?: number;
          month: string;
          net_saved_cents?: number;
          refreshed_at?: string;
          user_id: string;
        };
        Update: {
          expenses_cents?: number;
          free_cash_flow_cents?: number;
          income_cents?: number;
          month?: string;
          net_saved_cents?: number;
          refreshed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_metrics_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email_confirmed: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email_confirmed?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_confirmed?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          action: string;
          bucket_30m: string;
          id: number;
          occurred_at: string;
          user_id: string;
        };
        Insert: {
          action: string;
          bucket_30m: string;
          id?: number;
          occurred_at?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          bucket_30m?: string;
          id?: number;
          occurred_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      transaction_categories: {
        Row: {
          code: string;
          created_at: string;
          is_active: boolean;
          kind: string;
          label_pl: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          is_active?: boolean;
          kind: string;
          label_pl: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          is_active?: boolean;
          kind?: string;
          label_pl?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          amount_cents: number;
          category_code: string;
          client_request_id: string;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          id: string;
          month: string;
          note: string | null;
          occurred_on: string;
          type: string;
          updated_at: string;
          updated_by: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          category_code: string;
          client_request_id: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          month?: string;
          note?: string | null;
          occurred_on: string;
          type: string;
          updated_at?: string;
          updated_by?: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          category_code?: string;
          client_request_id?: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          month?: string;
          note?: string | null;
          occurred_on?: string;
          type?: string;
          updated_at?: string;
          updated_by?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_transactions_category";
            columns: ["category_code", "type"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["code", "kind"];
          },
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      add_goal_event: {
        Args: {
          p_amount_cents: number;
          p_client_request_id: string;
          p_goal_id: string;
          p_occurred_on: string;
          p_type: string;
        };
        Returns: string;
      };
      bankers_round: { Args: { val: number }; Returns: number };
      is_verified_user: { Args: never; Returns: boolean };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
