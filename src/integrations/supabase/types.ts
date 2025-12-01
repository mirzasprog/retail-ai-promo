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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      campaign_items: {
        Row: {
          campaign_id: string
          created_at: string | null
          final_price: number | null
          id: string
          llm_result_id: string | null
          product_id: string
          proposed_price: number
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          final_price?: number | null
          id?: string
          llm_result_id?: string | null
          product_id: string
          proposed_price: number
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          final_price?: number | null
          id?: string
          llm_result_id?: string | null
          product_id?: string
          proposed_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          end_date: string
          id: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["campaign_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["campaign_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      competitor_prices: {
        Row: {
          brand: string | null
          category: string | null
          currency: string | null
          competitor_id: string
          fetched_at: string | null
          id: string
          location: string | null
          product_ean: string | null
          product_name: string
          promo_end_date: string | null
          promo_price: number | null
          promo_start_date: string | null
          regular_price: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          currency?: string | null
          competitor_id: string
          fetched_at?: string | null
          id?: string
          location?: string | null
          product_ean?: string | null
          product_name: string
          promo_end_date?: string | null
          promo_price?: number | null
          promo_start_date?: string | null
          regular_price?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          currency?: string | null
          competitor_id?: string
          fetched_at?: string | null
          id?: string
          location?: string | null
          product_ean?: string | null
          product_name?: string
          promo_end_date?: string | null
          promo_price?: number | null
          promo_start_date?: string | null
          regular_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_prices_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          base_url: string
          config_json: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          refresh_interval: number | null
          source_type: Database["public"]["Enums"]["source_type"]
        }
        Insert: {
          base_url: string
          config_json?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          refresh_interval?: number | null
          source_type: Database["public"]["Enums"]["source_type"]
        }
        Update: {
          base_url?: string
          config_json?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          refresh_interval?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
        }
        Relationships: []
      }
      context_snapshots: {
        Row: {
          created_at: string | null
          date: string
          day_of_week: string
          holiday_name: string | null
          id: string
          is_holiday: boolean
          is_weekend: boolean
          season: string
        }
        Insert: {
          created_at?: string | null
          date: string
          day_of_week: string
          holiday_name?: string | null
          id?: string
          is_holiday: boolean
          is_weekend: boolean
          season: string
        }
        Update: {
          created_at?: string | null
          date?: string
          day_of_week?: string
          holiday_name?: string | null
          id?: string
          is_holiday?: boolean
          is_weekend?: boolean
          season?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_recurring: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_recurring?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_recurring?: boolean | null
          name?: string
        }
        Relationships: []
      }
      llm_evaluations: {
        Row: {
          campaign_item_id: string
          created_at: string | null
          id: string
          is_item_good: boolean
          is_price_good: boolean
          item_score: number | null
          reasoning: string
          recommended_price: number | null
          recommended_substitutes: Json | null
        }
        Insert: {
          campaign_item_id: string
          created_at?: string | null
          id?: string
          is_item_good: boolean
          is_price_good: boolean
          item_score?: number | null
          reasoning: string
          recommended_price?: number | null
          recommended_substitutes?: Json | null
        }
        Update: {
          campaign_item_id?: string
          created_at?: string | null
          id?: string
          is_item_good?: boolean
          is_price_good?: boolean
          item_score?: number | null
          reasoning?: string
          recommended_price?: number | null
          recommended_substitutes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_evaluations_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string
          created_at: string | null
          ean: string | null
          id: string
          name: string
          regular_price: number | null
          seasonality: string | null
          sku: string
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category: string
          created_at?: string | null
          ean?: string | null
          id?: string
          name: string
          regular_price?: number | null
          seasonality?: string | null
          sku: string
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          created_at?: string | null
          ean?: string | null
          id?: string
          name?: string
          regular_price?: number | null
          seasonality?: string | null
          sku?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_api_keys: {
        Row: {
          description: string | null
          id: string
          key_name: string
          key_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key_name: string
          key_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key_name?: string
          key_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weather_snapshots: {
        Row: {
          id: string
          location: string
          recorded_at: string | null
          temperature: number | null
          weather_type: string
        }
        Insert: {
          id?: string
          location: string
          recorded_at?: string | null
          temperature?: number | null
          weather_type: string
        }
        Update: {
          id?: string
          location?: string
          recorded_at?: string | null
          temperature?: number | null
          weather_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "category_manager" | "viewer"
      campaign_status: "draft" | "active" | "completed" | "cancelled"
      source_type: "api" | "html" | "csv" | "json" | "pdf" | "image"
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
      app_role: ["admin", "category_manager", "viewer"],
      campaign_status: ["draft", "active", "completed", "cancelled"],
      source_type: ["api", "html", "csv", "json", "pdf", "image"],
    },
  },
} as const
