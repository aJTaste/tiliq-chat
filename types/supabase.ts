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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          is_read: boolean
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_hidden: {
        Row: {
          hidden_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          hidden_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          hidden_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_hidden_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          room_id: string
          sender_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          room_id: string
          sender_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          room_id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
      room_members: {
        Row: {
          auth_required: boolean
          id: string
          joined_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          auth_required?: boolean
          id?: string
          joined_at?: string
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          auth_required?: boolean
          id?: string
          joined_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_group: boolean
          is_temporary: boolean
          lock_secret: string | null
          lock_type: string
          name: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_group?: boolean
          is_temporary?: boolean
          lock_secret?: string | null
          lock_type?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_group?: boolean
          is_temporary?: boolean
          lock_secret?: string | null
          lock_type?: string
          name?: string | null
        }
        Relationships: []
      }
      temp_chat_cleanup_log: {
        Row: {
          deleted_room_count: number
          error_message: string | null
          id: string
          run_at: string
        }
        Insert: {
          deleted_room_count?: number
          error_message?: string | null
          id?: string
          run_at?: string
        }
        Update: {
          deleted_room_count?: number
          error_message?: string | null
          id?: string
          run_at?: string
        }
        Relationships: []
      }
      temp_chat_sessions: {
        Row: {
          closed_at: string | null
          id: string
          room_id: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          id?: string
          room_id: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          id?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "temp_chat_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auth_failed_attempts: number
          auth_locked_until: string | null
          auth_scope_hidden_list: boolean
          auth_scope_launch: boolean
          auth_secret: string | null
          auth_type: string | null
          dm_from_stranger_enabled: boolean
          email: string | null
          push_notifications_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_failed_attempts?: number
          auth_locked_until?: string | null
          auth_scope_hidden_list?: boolean
          auth_scope_launch?: boolean
          auth_secret?: string | null
          auth_type?: string | null
          dm_from_stranger_enabled?: boolean
          email?: string | null
          push_notifications_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_failed_attempts?: number
          auth_locked_until?: string | null
          auth_scope_hidden_list?: boolean
          auth_scope_launch?: boolean
          auth_secret?: string | null
          auth_type?: string | null
          dm_from_stranger_enabled?: boolean
          email?: string | null
          push_notifications_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_group_members: {
        Args: { p_member_ids: string[]; p_room_id: string }
        Returns: undefined
      }
      block_user: { Args: { p_target_id: string }; Returns: undefined }
      cancel_friend_request: {
        Args: { p_friendship_id: string }
        Returns: undefined
      }
      cleanup_expired_temp_chats: { Args: never; Returns: undefined }
      create_group_room: {
        Args: { p_member_ids: string[]; p_name?: string }
        Returns: string
      }
      create_temp_dm_room: {
        Args: { p_expires_at: string; p_other_user_id: string }
        Returns: string
      }
      delete_own_message: { Args: { p_message_id: string }; Returns: undefined }
      get_conversation_list: {
        Args: never
        Returns: {
          expires_at: string
          friendship_status: string
          is_temporary: boolean
          last_message_at: string
          last_message_preview: string
          other_avatar_url: string
          other_display_name: string
          other_user_id: string
          other_username: string
          room_id: string
        }[]
      }
      get_friend_requests: {
        Args: never
        Returns: {
          counterpart_avatar_url: string
          counterpart_display_name: string
          counterpart_id: string
          counterpart_username: string
          created_at: string
          direction: string
          friendship_id: string
          is_read: boolean
          status: string
        }[]
      }
      get_group_conversation_list: {
        Args: never
        Returns: {
          last_message_at: string
          last_message_preview: string
          member_count: number
          member_names: string[]
          name: string
          room_id: string
        }[]
      }
      get_or_create_dm_room: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      is_blocked: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      is_room_member: { Args: { p_room_id: string }; Returns: boolean }
      is_room_owner: { Args: { p_room_id: string }; Returns: boolean }
      mark_friend_requests_read: { Args: never; Returns: undefined }
      record_auth_attempt: { Args: { p_success: boolean }; Returns: undefined }
      remove_friend: { Args: { p_other_user_id: string }; Returns: undefined }
      respond_to_friend_request: {
        Args: { p_accept: boolean; p_friendship_id: string }
        Returns: undefined
      }
      search_users: {
        Args: { p_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          existing_room_id: string
          friendship_status: string
          user_id: string
          username: string
        }[]
      }
      send_friend_request: { Args: { p_addressee_id: string }; Returns: string }
      set_room_auth_required: {
        Args: { p_required: boolean; p_room_id: string }
        Returns: undefined
      }
      transfer_group_ownership: {
        Args: { p_new_owner_id: string; p_room_id: string }
        Returns: undefined
      }
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
