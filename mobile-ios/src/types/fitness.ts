export type UserRole = 'member' | 'trainer';

export type BookingStatus = 'booked' | 'attended' | 'cancelled' | 'no_show';

export type AttendanceStatus = 'booked' | 'attended' | 'no_show';

export type SessionCategory =
  | 'Grup Reformer'
  | 'Bireysel Reformer'
  | 'Cadillac & Tower'
  | 'Düet & Trio'
  | 'Reformer'
  | 'Fonksiyonel'
  | 'Birebir PT'
  | string;

export type AnnouncementTag =
  | 'Kulüp Haberleri'
  | 'Kurallar & Bilgilendirme'
  | 'Kampanyalar'
  | 'Yeni Ders'
  | 'Kampanya'
  | 'Bakım'
  | string;

export type {
  MemberDrawerRoute,
  TrainerDrawerRoute,
  AppDrawerRoute,
} from './navigation';
export { MEMBER_ROUTE_TITLES, TRAINER_ROUTE_TITLES } from './navigation';

export interface AppUser {
  id: number;
  full_name: string;
  phone: string;
  role: UserRole;
  instagram_handle?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  specialty?: string | null;
  bio?: string | null;
  certificates?: string[];
  rating?: number | null;
  experience_years?: number | null;
  streak_days?: number;
  notify_reminders?: boolean;
  notify_waitlist?: boolean;
  notify_campaigns?: boolean;
  referral_code?: string | null;
  referral_count?: number;
  body_zones?: Record<string, string>;
}

export type EnergyStatus = 'high' | 'normal' | 'low';

export interface HourlyForecastItem {
  hour: string;
  pct: number;
}

export interface ClubLiveStatus {
  occupancy_pct: number;
  active_members_count: number;
  active_members_label: string;
  capacity?: number;
  status_level?: 'low' | 'moderate' | 'high' | string;
  status_badge: string;
  hourly_forecast: HourlyForecastItem[];
}

export interface DailyWellness {
  member_id: number;
  date: string;
  water_ml: number;
  water_goal_ml: number;
  sleep_hours: number;
  energy_status: EnergyStatus;
  calories_intake: number;
  calories_goal: number;
  protein_g: number;
  protein_goal_g: number;
  carbs_g: number;
  carbs_goal_g: number;
  fat_g: number;
  fat_goal_g: number;
}

export interface NutritionAnalyzeResponse {
  meal_text: string;
  added_calories: number;
  added_protein_g: number;
  added_carbs_g: number;
  added_fat_g: number;
  coach_note: string;
  wellness: DailyWellness;
}

export interface FoodVisionItem {
  name: string;
  estimated_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FoodVisionAnalyzeResponse {
  meal_name: string;
  confidence: number;
  items: FoodVisionItem[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  coach_tip: string;
  is_mock?: boolean;
}

export interface NutritionMealLogDetectedItem {
  name: string;
  portion?: string;
  estimated_grams?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence_pct?: number;
}

export interface NutritionMealLog {
  id: number;
  date: string;
  created_at: string;
  source: string;
  meal_type: string;
  portion_size?: string;
  portion_multiplier?: number;
  meal_description: string;
  photo_thumbnail?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  health_score?: number;
  glycemic_load?: string;
  burn_equivalent?: string;
  detected_items?: NutritionMealLogDetectedItem[];
  items?: FoodVisionItem[];
  coach_note?: string;
  coach_tip?: string;
}

export interface NutritionLogMealRequest {
  member_id: number;
  meal_name: string;
  meal_type?: string;
  portion_multiplier: number;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  coach_tip: string;
  items: FoodVisionItem[];
  photo_thumbnail?: string | null;
  source: 'photo';
}

export interface NutritionLogMealResponse {
  logged: boolean;
  log_id: number;
  meal_log: NutritionMealLog;
  wellness: DailyWellness;
  message: string;
}

export interface MemberReferralInfo {
  member_id: number;
  member_name: string;
  referral_code: string;
  referral_count: number;
  earned_free_credits: number;
  remaining_credits: number;
}

export interface ReferralRedeemResponse {
  success: boolean;
  referral_code: string;
  inviter_id?: number;
  inviter_name?: string;
  referral_count: number;
  remaining_credits: number;
  bonus_credits_added: number;
  message: string;
}

export interface MemberPackage {
  id: number;
  member_id: number;
  package_name: string;
  total_credits: number;
  remaining_credits: number;
  expiry_date: string;
  is_active: boolean;
  package_month?: string | null;
  package_notes?: string | null;
  created_at?: string | null;
}

export interface PackageRenewRequest {
  package_name: string;
  credits: number;
  duration_days?: number;
  plan_code?: string;
  price_try?: number;
}

export interface PackageRenewResponse {
  message: string;
  member_id: number;
  package_id: number;
  package_name: string;
  added_credits: number;
  remaining_credits: number;
  total_credits: number;
  expiry_date: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  tag: AnnouncementTag;
  date: string;
}

export interface CheckInLogItem {
  id: number;
  date: string;
  time: string;
  session_title: string;
  trainer_name: string;
  location: string;
  category: SessionCategory;
}

export interface MemberBookingItem {
  booking_id: number;
  session_id: number;
  status: BookingStatus;
  title: string;
  category?: SessionCategory;
  room?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  trainer_id: number;
  trainer_name: string;
  trainer_avatar_url?: string | null;
  trainer_specialty?: string | null;
  capacity: number;
  current_enrolled: number;
}

export interface AvailableSession {
  id: number;
  trainer_id: number;
  trainer_name: string;
  trainer_avatar_url?: string | null;
  trainer_specialty?: string | null;
  title: string;
  category?: SessionCategory;
  room?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_enrolled: number;
  remaining_spots: number;
  is_full: boolean;
  is_booked_by_member: boolean;
  booking_id?: number | null;
  waitlist_count?: number;
  is_waitlisted_by_member?: boolean;
  waitlist_id?: number | null;
  waitlist_position?: number | null;
}

export interface MemberWaitlistItem {
  waitlist_id: number;
  session_id: number;
  position: number;
  total_waiting: number;
  created_at: string;
  title: string;
  category: SessionCategory;
  room?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  trainer_id: number;
  trainer_name: string;
  trainer_avatar_url?: string | null;
  capacity: number;
  current_enrolled: number;
}

export interface MemberDashboardData {
  member: AppUser;
  active_package: MemberPackage | null;
  all_packages: MemberPackage[];
  my_bookings: MemberBookingItem[];
  available_sessions: AvailableSession[];
  waitlist_items: MemberWaitlistItem[];
  recent_checkins: CheckInLogItem[];
}

export interface TrainerCard {
  id: number;
  full_name: string;
  phone: string;
  instagram_handle?: string | null;
  avatar_url?: string | null;
  specialty?: string | null;
  bio?: string | null;
  certificates: string[];
  rating: number;
  experience_years: number;
  active_sessions_count: number;
  monthly_classes_given: number;
}

export interface TrainerDetail extends TrainerCard {
  total_students_count: number;
  attendance_rate_pct: number;
  open_sessions: AvailableSession[];
}

export interface ClubHomeData {
  member: AppUser;
  streak_days: number;
  active_package: MemberPackage | null;
  upcoming_booking: MemberBookingItem | null;
  announcements: AnnouncementItem[];
  trainers: TrainerCard[];
  wod_title: string;
  wod_focus: string;
  wod_duration_min: number;
  wod_calories: number;
  wod_movements: string[];
  motivation_quote: string;
  recent_checkins: CheckInLogItem[];
}

export interface MemberDashboardSummary {
  member: AppUser;
  streak_days: number;
  active_package: MemberPackage | null;
  remaining_credits: number;
  total_credits: number;
  today_wellness: DailyWellness;
  live_status: ClubLiveStatus;
  upcoming_booking: MemberBookingItem | null;
  upcoming_sessions: AvailableSession[]; // max 3
  announcements: AnnouncementItem[]; // max 5
  trainers: TrainerCard[];
  wod_title: string;
  wod_focus: string;
  wod_duration_min: number;
  wod_calories: number;
  wod_movements: string[];
  motivation_quote: string;
  recent_checkins: CheckInLogItem[];
}

export interface BookingCreateRequest {
  member_id: number;
  session_id: number;
}

export interface BookingCancelRequest {
  booking_id?: number | null;
  member_id?: number | null;
  session_id?: number | null;
}

export interface BookingActionResponse {
  message: string;
  booking_id: number;
  status: string;
  remaining_credits: number;
  session_id: number;
  current_enrolled: number;
  capacity: number;
  promoted_from_waitlist_member_id?: number | null;
  promoted_from_waitlist_member_name?: string | null;
}

export interface WaitlistCreateRequest {
  member_id: number;
  session_id: number;
}

export interface WaitlistCancelRequest {
  waitlist_id?: number | null;
  member_id?: number | null;
  session_id?: number | null;
}

export interface WaitlistActionResponse {
  message: string;
  waitlist_id: number;
  session_id: number;
  member_id: number;
  position: number;
  waitlist_count: number;
  status: string;
}

export interface BodyMetric {
  id: number;
  member_id: number;
  date: string;
  weight_kg: number;
  body_fat_pct: number;
  muscle_mass_kg: number;
  trainer_comment?: string | null;
}

export interface BodyMetricCreateRequest {
  member_id: number;
  date?: string | null;
  weight_kg: number;
  body_fat_pct: number;
  muscle_mass_kg: number;
  trainer_comment?: string;
}

export interface MemberMetricsSummary {
  member_id: number;
  member_name: string;
  metrics: BodyMetric[];
  latest: BodyMetric | null;
  previous: BodyMetric | null;
  weight_diff_kg: number;
  body_fat_diff_pct: number;
  muscle_mass_diff_kg: number;
  latest_trainer_comment: string;
  completed_sessions_count: number;
  completed_sessions: MemberBookingItem[];
}

export interface MemberProfileUpdateRequest {
  full_name?: string;
  phone?: string;
  instagram_handle?: string | null;
  notify_reminders?: boolean;
  notify_waitlist?: boolean;
  notify_campaigns?: boolean;
}

export interface WaitlistEntry {
  waitlist_id: number;
  position: number;
  member_id: number;
  full_name: string;
  phone: string;
  instagram_handle?: string | null;
  avatar_url?: string | null;
  remaining_credits: number;
  total_credits: number;
  created_at: string;
}

export interface TrainerAttendee {
  booking_id: number;
  member_id: number;
  full_name: string;
  phone: string;
  instagram_handle?: string | null;
  avatar_url?: string | null;
  notes?: string | null;
  package_name?: string | null;
  remaining_credits: number;
  total_credits: number;
  low_credit_warning: boolean;
  status: AttendanceStatus;
  body_zones?: Record<string, any> | null;
  today_energy_status?: EnergyStatus | string | null;
  today_water_ml?: number | null;
  water_goal_ml?: number | null;
  today_protein_g?: number | null;
  protein_goal_g?: number | null;
  water_pct?: number | null;
  protein_pct?: number | null;
}

export interface TrainerSession {
  id: number;
  trainer_id: number;
  trainer_name: string;
  title: string;
  category: SessionCategory;
  room?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_enrolled: number;
  attendees: TrainerAttendee[];
  waitlist: WaitlistEntry[];
}

export interface TrainerScheduleData {
  trainer: AppUser;
  available_dates: string[];
  monthly_sessions_count: number;
  monthly_attendees_count: number;
  average_fill_rate_pct: number;
  sessions: TrainerSession[];
}

export interface TrainerSessionCreateRequest {
  trainer_id: number;
  title: string;
  category?: SessionCategory;
  date: string;
  start_time: string;
  end_time?: string | null;
  capacity: number;
  room?: string | null;
}

export interface TrainerMemberCrm {
  id: number;
  full_name: string;
  phone: string;
  instagram_handle?: string | null;
  avatar_url?: string | null;
  streak_days: number;
  notes: string;
  package_id?: number | null;
  package_name?: string | null;
  remaining_credits: number;
  total_credits: number;
  expiry_date?: string | null;
  low_credit_warning: boolean;
  attended_sessions_count: number;
  latest_metric?: BodyMetric | null;
  body_zones?: Record<string, any> | null;
  today_energy_status?: EnergyStatus | string | null;
  today_water_ml?: number | null;
  water_goal_ml?: number | null;
  today_protein_g?: number | null;
  protein_goal_g?: number | null;
  water_pct?: number | null;
  protein_pct?: number | null;
}

export interface InstagramWebhookResponse {
  reply: string;
  action?: string | null;
  member_name?: string | null;
  session_id?: number | null;
  booking_id?: number | null;
  remaining_credits?: number | null;
}

// Şema isimlendirme uyumluluğu için ek tip takma adları (Type Aliases)
export type UserOut = AppUser;
export type ClubHomeOut = ClubHomeData;
export type TrainerCardOut = TrainerCard;
export type TrainerDetailOut = TrainerDetail;
export type AnnouncementOut = AnnouncementItem;
export type CheckInLogOut = CheckInLogItem;
export type BodyMetricOut = BodyMetric;
export type MemberMetricsSummaryOut = MemberMetricsSummary;
export type WaitlistEntryOut = WaitlistEntry;
export type AttendeeOut = TrainerAttendee;
export type TrainerSessionOut = TrainerSession;
export type TrainerScheduleOut = TrainerScheduleData;
export type TrainerMemberCrmOut = TrainerMemberCrm;
