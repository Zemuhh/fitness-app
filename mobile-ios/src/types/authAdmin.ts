import { AppUser, UserRole } from '@/types/fitness';

export type AuthAccountRole = 'member' | 'trainer' | 'admin';

export type ActivePanelMode = 'admin' | 'trainer' | 'member';

export type IntakeSource = 'instagram' | 'whatsapp' | 'manual';

export type TargetDepartment =
  | 'booking'
  | 'trainer_note'
  | 'member_registry'
  | 'lead_queue';

export interface AuthSessionOut {
  authenticated: boolean;
  token: string;
  token_type: string;
  expires_at?: string;
  auth_provider?: string;
  id: number | null;
  user_id: number | null;
  admin_id?: number | null;
  role: AuthAccountRole;
  username: string | null;
  email: string | null;
  full_name: string;
  phone: string;
  instagram_handle: string | null;
  avatar_url: string | null;
  access_code: string | null;
  has_personal_profile: boolean;
  is_admin: boolean;
  available_panels: ActivePanelMode[];
  default_panel: ActivePanelMode;
  specialty: string | null;
  notes: string | null;
  package_name: string | null;
  remaining_credits: number | null;
  total_credits: number | null;
  policy_accepted?: boolean;
  policy_accepted_at?: string | null;
  policy_version?: string;
  message: string;
}

export interface AuthSessionUser {
  id: number | null;
  user_id?: number | null;
  admin_id?: number | null;
  full_name: string;
  role: AuthAccountRole;
  email?: string | null;
  username?: string | null;
  phone?: string | null;
  access_code?: string | null;
  avatar_url?: string | null;
  specialty?: string | null;
  notes?: string | null;
  instagram_handle?: string | null;
  has_personal_profile: boolean;
  is_admin: boolean;
  available_panels: ActivePanelMode[];
  default_panel: ActivePanelMode;
  policy_accepted?: boolean;
  policy_accepted_at?: string | null;
  policy_version?: string;
}

export interface PolicySection {
  heading: string;
  body: string;
}

export interface CurrentPolicyResponse {
  version: string;
  title: string;
  company_name: string;
  effective_date: string;
  sections: PolicySection[];
  full_text: string;
  policy_accepted?: boolean;
}

export interface PolicyAcceptResponse {
  accepted: boolean;
  already_accepted: boolean;
  user_id: number;
  policy_version: string;
  accepted_at: string;
  file_name: string;
  sha256: string;
  message: string;
}

export interface AuthLoginPayload {
  identifier?: string;
  username?: string;
  email?: string;
  password: string;
}

export interface GoogleAuthUrlResponse {
  auth_url: string;
  state: string;
  provider: string;
  client_id_configured: boolean;
}

export interface GoogleAuthExchangePayload {
  id_token?: string;
  access_token?: string;
  code?: string;
  email?: string;
  full_name?: string;
  google_sub?: string;
  avatar_url?: string;
}

export interface AdminPanelConfig {
  admin_panel_enabled: boolean;
  trainer_panel_enabled: boolean;
  member_panel_enabled: boolean;
  default_landing_panel: ActivePanelMode;
  allow_google_login: boolean;
  allow_member_booking: boolean;
  allow_package_purchase: boolean;
  studio_banner_enabled: boolean;
  studio_banner_title: string;
  studio_banner_message: string;
  updated_at?: string | null;
}

export interface AdminPanelTargetsResponse {
  trainers: AppUser[];
  members: AppUser[];
  default_trainer_id: number | null;
  default_member_id: number | null;
}

export interface AdminAnnouncementItem {
  id: number;
  title: string;
  content: string;
  tag: string;
  date: string;
  is_pinned?: boolean;
}

export interface AdminAnnouncementPayload {
  title: string;
  content: string;
  tag?: string;
  date?: string;
  is_pinned?: boolean;
}

export interface AdminTrainerItem {
  id: number;
  full_name: string;
  email?: string | null;
  username?: string | null;
  phone: string;
  instagram_handle?: string | null;
  specialty?: string | null;
  bio?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  rating?: number | null;
  experience_years?: number | null;
  access_code?: string | null;
  active_sessions_count?: number;
}

export interface AdminTrainerPayload {
  full_name: string;
  specialty?: string;
  email?: string;
  username?: string;
  password?: string;
  phone?: string;
  instagram_handle?: string;
  bio?: string;
  notes?: string;
  experience_years?: number;
}

export interface AdminMemberItem {
  id: number;
  full_name: string;
  email?: string | null;
  username?: string | null;
  phone: string;
  instagram_handle?: string | null;
  notes?: string | null;
  access_code?: string | null;
  package_id?: number | null;
  package_name?: string | null;
  remaining_credits: number;
  total_credits: number;
  expiry_date?: string | null;
  low_credit_warning: boolean;
  upcoming_bookings_count: number;
  attended_count?: number;
  streak_days?: number;
}

export interface AdminMemberCreatePayload {
  full_name: string;
  phone?: string;
  email?: string;
  username?: string;
  password?: string;
  instagram_handle?: string;
  notes?: string;
  package_name?: string;
  credits?: number;
  duration_days?: number;
}

export interface AdminMemberUpdatePayload {
  full_name?: string;
  phone?: string;
  email?: string;
  username?: string;
  password?: string;
  instagram_handle?: string;
  notes?: string;
}

export interface AdminMemberCreditsPayload {
  package_name?: string;
  credits_delta?: number;
  set_remaining_credits?: number;
  total_credits?: number;
  duration_days?: number;
}

export interface AdminClassSessionItem {
  id: number;
  title: string;
  category?: string;
  room?: string | null;
  date: string;
  day_label?: string;
  start_time: string;
  end_time: string;
  trainer_id: number;
  trainer_name: string;
  capacity: number;
  current_enrolled: number;
  remaining_spots?: number;
  is_full?: boolean;
}

export interface AdminClassSessionPayload {
  trainer_id: number;
  title: string;
  category?: string;
  room?: string;
  date: string;
  start_time: string;
  end_time?: string;
  capacity: number;
}

export interface AdminPackagePlanItem {
  id: number;
  code: string;
  name: string;
  subtitle?: string;
  credits: number;
  duration_days: number;
  price_try: number;
  popular_badge?: string | null;
  is_active: boolean;
}

export interface AdminPaymentItem {
  id: number;
  transaction_code?: string;
  session_id?: string;
  member_id: number;
  member_name?: string;
  package_name?: string;
  plan_name?: string;
  amount_try?: number;
  amount?: number;
  currency?: string;
  payment_method?: string;
  provider?: string;
  installment_count?: number;
  status: string;
  created_at: string;
}

export interface AdminSystemOverview {
  total_members: number;
  total_trainers: number;
  total_sessions: number;
  upcoming_sessions_count?: number;
  active_bookings_count: number;
  active_packages_count: number;
  total_remaining_credits: number;
  low_credit_members_count: number;
  total_announcements?: number;
  total_revenue_try?: number;
  total_payments_count?: number;
  panel_config?: AdminPanelConfig;
  recent_announcements?: AdminAnnouncementItem[];
  recent_payments?: AdminPaymentItem[];
}

// ============================================================================
// LEGACY PORTAL GATEWAY UYUMLULUK TİPLERİ
// ============================================================================

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
