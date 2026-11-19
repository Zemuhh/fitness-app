import { AppUser, UserRole } from '@/types/fitness';

export type IntakeSource = 'instagram' | 'whatsapp' | 'manual';

export type TargetDepartment =
  | 'booking'
  | 'trainer_note'
  | 'member_registry'
  | 'lead_queue';

export interface PortalUserSummary extends AppUser {
  access_code: string;
}

export interface PortalPackageSummary {
  id: number;
  package_name: string;
  total_credits: number;
  remaining_credits: number;
  expiry_date: string;
  is_active: boolean;
  low_credit_warning: boolean;
}

export interface PortalBookingLookupItem {
  booking_id: number;
  session_id: number;
  title: string;
  date: string;
  day_label: string;
  start_time: string;
  end_time: string;
  trainer_id: number;
  trainer_name: string;
  status: 'booked' | 'attended' | 'cancelled' | 'no_show' | string;
  capacity: number;
  current_enrolled: number;
}

export interface PortalLookupResponse {
  access_code: string;
  user_id: number;
  full_name: string;
  role: UserRole;
  phone_masked: string;
  user: PortalUserSummary;
  active_package: PortalPackageSummary | null;
  package_name?: string | null;
  remaining_credits: number;
  total_credits: number;
  expiry_date?: string | null;
  low_credit_warning: boolean;
  upcoming_bookings: PortalBookingLookupItem[];
  past_bookings: PortalBookingLookupItem[];
  summary_message: string;
}

export interface PortalQuickChip {
  access_code: string;
  user_id: number;
  full_name: string;
  short_label: string;
  role: UserRole;
  remaining_credits: number;
  total_credits: number;
}

export interface PortalUserLoginResponse {
  message: string;
  access_code: string;
  user: PortalUserSummary;
  active_package: PortalPackageSummary | null;
  remaining_credits: number;
  total_credits: number;
}

export interface PortalAdminLoginResponse {
  authenticated: boolean;
  username: string;
  full_name: string;
  token: string;
  message: string;
}

export interface DataIntakeLogItem {
  id: number;
  source: IntakeSource;
  sender_name: string;
  sender_contact: string;
  message_or_payload: string;
  target_department: TargetDepartment;
  routed_user_id?: number | null;
  assigned_access_code?: string | null;
  action_summary: string;
  created_at: string;
}

export interface AdminDirectoryUser {
  id: number;
  full_name: string;
  phone: string;
  role: UserRole;
  instagram_handle?: string | null;
  notes: string;
  access_code: string;
  pin_code: string;
  package_name?: string | null;
  remaining_credits: number;
  total_credits: number;
  expiry_date?: string | null;
  low_credit_warning: boolean;
  upcoming_count: number;
}

export interface AdminSessionOption {
  id: number;
  title: string;
  date: string;
  day_label: string;
  start_time: string;
  end_time: string;
  trainer_id: number;
  trainer_name: string;
  capacity: number;
  current_enrolled: number;
  remaining_spots: number;
  is_full: boolean;
}

export interface AdminOverviewStats {
  total_members: number;
  total_trainers: number;
  active_packages_count: number;
  total_remaining_credits: number;
  total_sessions: number;
  active_bookings_count: number;
  low_credit_members_count: number;
  total_intake_logs: number;
}

export interface AdminOverviewResponse {
  stats: AdminOverviewStats;
  channel_counts: Record<string, number>;
  department_counts: Record<string, number>;
  users: AdminDirectoryUser[];
  sessions: AdminSessionOption[];
  recent_logs: DataIntakeLogItem[];
}

export interface AdminCreateUserPayload {
  full_name: string;
  phone: string;
  role: UserRole;
  instagram_handle?: string;
  notes?: string;
  pin_code?: string;
  package_name?: string;
  package_credits?: number | null;
  package_duration_days?: number;
}

export interface AdminCreateUserResponse {
  message: string;
  access_code: string;
  pin_code: string;
  user: PortalUserSummary;
  active_package: PortalPackageSummary | null;
}

export interface DataIntakeCollectPayload {
  source: IntakeSource;
  sender_name: string;
  sender_contact: string;
  content: string;
  session_id?: number | null;
  notes?: string;
  package_credits?: number | null;
  package_name?: string;
}

export interface IntakeBookingResult {
  booked: boolean;
  status_code: string;
  message: string;
  booking_id?: number | null;
  session_id?: number | null;
  session_title?: string | null;
  date?: string | null;
  start_time?: string | null;
  trainer_name?: string | null;
  remaining_credits?: number | null;
}

export interface DataIntakeCollectResponse {
  message: string;
  action_summary: string;
  target_department: TargetDepartment;
  routed_departments: TargetDepartment[];
  is_new_user: boolean;
  assigned_access_code: string;
  user: PortalUserSummary;
  notes_updated: boolean;
  updated_notes: string;
  package_updated: boolean;
  remaining_credits: number;
  total_credits: number;
  booking_result?: IntakeBookingResult | null;
  log: DataIntakeLogItem;
}
