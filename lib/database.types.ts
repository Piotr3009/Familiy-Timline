/**
 * Database types mirroring supabase/migrations.
 * Regenerate against a live project with:
 *   npx supabase gen types typescript --project-id <id> --schema public > lib/database.types.ts
 * Until then this file is maintained by hand and MUST follow every
 * schema migration.
 *
 * Note: queries in this codebase use flat selects (no PostgREST embedded
 * resources), so Relationships metadata is intentionally left empty.
 */

export type Json = string | number | boolean | null | {[key: string]: Json | undefined} | Json[];

export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type RelationshipType = 'partner' | 'parent_child' | 'sibling';
export type ParentRole = 'biological' | 'adoptive' | 'step' | 'foster' | 'legal_guardian';
export type PartnerStatus =
  | 'partners'
  | 'married'
  | 'separated'
  | 'divorced'
  | 'former_partner'
  | 'widowed';
export type PrivacyLevel = 'private' | 'immediate_family' | 'family';
export type InvitationStatus = 'pending' | 'opened' | 'claimed' | 'expired' | 'revoked';
export type ClaimStatus = 'pending_approval' | 'approved' | 'rejected';
export type EventType =
  | 'birth'
  | 'baptism'
  | 'first_communion'
  | 'school_graduation'
  | 'university'
  | 'wedding'
  | 'divorce'
  | 'moving_home'
  | 'home_purchase'
  | 'emigration'
  | 'job_start'
  | 'business_start'
  | 'child_birth'
  | 'family_gathering'
  | 'anniversary'
  | 'death'
  | 'funeral'
  | 'achievement'
  | 'travel'
  | 'other';
export type MediaKind = 'photo' | 'video';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type FamilyRole = 'admin' | 'member';

type ConfigRow = {
  key: string;
  value: Json;
  description: string;
  updated_at: string;
};

type FamilyRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type FamilyMemberRow = {
  id: string;
  family_id: string;
  user_id: string;
  role: FamilyRole;
  created_at: string;
};

type PersonRow = {
  id: string;
  family_id: string;
  user_id: string | null;
  managed_by: string | null;
  created_by: string;
  first_name: string;
  last_name: string;
  maiden_name: string | null;
  gender: Gender | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_place: string | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  death_place: string | null;
  is_deceased: boolean;
  avatar_url: string | null;
  bio: string | null;
  life_details_privacy: PrivacyLevel;
  created_at: string;
  updated_at: string;
};

type RelationshipRow = {
  id: string;
  family_id: string;
  person_a_id: string;
  person_b_id: string;
  type: RelationshipType;
  parent_role: ParentRole | null;
  status: PartnerStatus | null;
  start_date: string | null;
  wedding_date: string | null;
  separation_date: string | null;
  divorce_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type InvitationRow = {
  id: string;
  family_id: string;
  person_id: string;
  invited_by: string;
  email: string | null;
  token_hash: string;
  status: InvitationStatus;
  expires_at: string;
  opened_at: string | null;
  claimed_by: string | null;
  claim_status: ClaimStatus | null;
  claimed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  family_id: string;
  type: EventType;
  title: string | null;
  description: string | null;
  location: string | null;
  event_year: number;
  event_month: number | null;
  event_day: number | null;
  privacy: PrivacyLevel;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type EventPersonRow = {
  event_id: string;
  person_id: string;
  created_at: string;
};

type PhotoRow = {
  id: string;
  family_id: string;
  uploaded_by: string;
  kind: MediaKind;
  storage_path_original: string;
  storage_path_preview: string | null;
  storage_path_thumb: string | null;
  file_size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  taken_year: number | null;
  taken_month: number | null;
  taken_day: number | null;
  location: string | null;
  description: string | null;
  event_id: string | null;
  privacy: PrivacyLevel;
  created_at: string;
  updated_at: string;
};

type PhotoPersonRow = {
  photo_id: string;
  person_id: string;
  created_at: string;
};

type ReportRow = {
  id: string;
  family_id: string;
  reported_person_id: string;
  reported_by: string;
  reason: string;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

/** visible_persons view: life details are null unless details_visible. */
type VisiblePersonRow = Omit<PersonRow, 'bio'> & {
  bio: string | null;
  details_visible: boolean;
};

type WithOptional<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

export type Database = {
  public: {
    Tables: {
      config: {
        Row: ConfigRow;
        Insert: WithOptional<ConfigRow, 'updated_at'>;
        Update: Partial<ConfigRow>;
        Relationships: [];
      };
      families: {
        Row: FamilyRow;
        Insert: WithOptional<FamilyRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<FamilyRow>;
        Relationships: [];
      };
      family_members: {
        Row: FamilyMemberRow;
        Insert: WithOptional<FamilyMemberRow, 'id' | 'role' | 'created_at'>;
        Update: Partial<FamilyMemberRow>;
        Relationships: [];
      };
      persons: {
        Row: PersonRow;
        Insert: WithOptional<
          PersonRow,
          | 'id'
          | 'user_id'
          | 'managed_by'
          | 'maiden_name'
          | 'gender'
          | 'birth_year'
          | 'birth_month'
          | 'birth_day'
          | 'birth_place'
          | 'death_year'
          | 'death_month'
          | 'death_day'
          | 'death_place'
          | 'is_deceased'
          | 'avatar_url'
          | 'bio'
          | 'life_details_privacy'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<PersonRow>;
        Relationships: [];
      };
      relationships: {
        Row: RelationshipRow;
        Insert: WithOptional<
          RelationshipRow,
          | 'id'
          | 'family_id'
          | 'parent_role'
          | 'status'
          | 'start_date'
          | 'wedding_date'
          | 'separation_date'
          | 'divorce_date'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<RelationshipRow>;
        Relationships: [];
      };
      invitations: {
        Row: InvitationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      events: {
        Row: EventRow;
        Insert: WithOptional<
          EventRow,
          | 'id'
          | 'title'
          | 'description'
          | 'location'
          | 'event_month'
          | 'event_day'
          | 'privacy'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<EventRow>;
        Relationships: [];
      };
      event_persons: {
        Row: EventPersonRow;
        Insert: WithOptional<EventPersonRow, 'created_at'>;
        Update: Partial<EventPersonRow>;
        Relationships: [];
      };
      photos: {
        Row: PhotoRow;
        Insert: WithOptional<
          PhotoRow,
          | 'id'
          | 'kind'
          | 'storage_path_preview'
          | 'storage_path_thumb'
          | 'duration_seconds'
          | 'width'
          | 'height'
          | 'taken_year'
          | 'taken_month'
          | 'taken_day'
          | 'location'
          | 'description'
          | 'event_id'
          | 'privacy'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<PhotoRow>;
        Relationships: [];
      };
      photo_persons: {
        Row: PhotoPersonRow;
        Insert: WithOptional<PhotoPersonRow, 'created_at'>;
        Update: Partial<PhotoPersonRow>;
        Relationships: [];
      };
      reports: {
        Row: ReportRow;
        Insert: WithOptional<
          ReportRow,
          'id' | 'status' | 'resolved_by' | 'resolved_at' | 'created_at' | 'updated_at'
        >;
        Update: Partial<ReportRow>;
        Relationships: [];
      };
    };
    Views: {
      visible_persons: {
        Row: VisiblePersonRow;
        Relationships: [];
      };
    };
    Functions: {
      create_family_with_profile: {
        Args: {
          p_family_name: string;
          p_first_name: string;
          p_last_name: string;
          p_maiden_name?: string | null;
          p_gender?: Gender | null;
          p_birth_year?: number | null;
          p_birth_month?: number | null;
          p_birth_day?: number | null;
          p_birth_place?: string | null;
        };
        Returns: Json;
      };
      create_invitation: {
        Args: {p_person_id: string; p_token: string; p_email?: string | null};
        Returns: Json;
      };
      get_invitation_by_token: {
        Args: {p_token: string; p_rate_key?: string};
        Returns: Json;
      };
      claim_invitation: {
        Args: {p_token: string};
        Returns: Json;
      };
      approve_claim: {
        Args: {p_invitation_id: string};
        Returns: Json;
      };
      reject_claim: {
        Args: {p_invitation_id: string};
        Returns: undefined;
      };
      is_family_member: {
        Args: {p_family: string};
        Returns: boolean;
      };
      is_family_admin: {
        Args: {p_family: string};
        Returns: boolean;
      };
      my_person_id: {
        Args: {p_family: string};
        Returns: string | null;
      };
      is_immediate_family: {
        Args: {p_a: string; p_b: string};
        Returns: boolean;
      };
    };
    Enums: {
      gender: Gender;
      relationship_type: RelationshipType;
      parent_role: ParentRole;
      partner_status: PartnerStatus;
      privacy_level: PrivacyLevel;
      invitation_status: InvitationStatus;
      claim_status: ClaimStatus;
      event_type: EventType;
      media_kind: MediaKind;
      report_status: ReportStatus;
      family_role: FamilyRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Person = PersonRow;
export type VisiblePerson = VisiblePersonRow;
export type Relationship = RelationshipRow;
export type Family = FamilyRow;
export type FamilyMember = FamilyMemberRow;
export type Invitation = InvitationRow;
export type FamilyEvent = EventRow;
export type Photo = PhotoRow;
export type Report = ReportRow;
