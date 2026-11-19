export type UserRole = 'member' | 'trainer';

export interface AppUser {
  id: number;
  full_name: string;
  phone: string;
  role: UserRole;
  instagram_handle?: string | null;
  notes?: string | null;
}

export interface MemberPackage {
  id: number;
  member_id: number;
  package_name: string;
  total_credits: number;
  remaining_credits: number;
  expiry_date: string;
  is_active: boolean;
}

export interface MemberBookingItem {
  booking_id: number;
  session_id: number;
  status: 'booked' | 'attended' | 'cancelled' | 'no_show';
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  trainer_id: number;
  trainer_name: string;
  capacity: number;
  current_enrolled: number;
}

export interface AvailableSession {
  id: number;
  trainer_id: number;
  trainer_name: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_enrolled: number;
  remaining_spots: number;
  is_full: boolean;
  is_booked_by_member: boolean;
  booking_id?: number | null;
}

export interface MemberDashboardData {
  member: AppUser;
  active_package: MemberPackage | null;
  my_bookings: MemberBookingItem[];
  available_sessions: AvailableSession[];
}

export interface BookingActionResponse {
  message: string;
  booking_id: number;
  status: string;
  remaining_credits: number;
  session_id: number;
  current_enrolled: number;
  capacity: number;
}

export interface TrainerAttendee {
  booking_id: number;
  member_id: number;
  full_name: string;
  phone: string;
  instagram_handle?: string | null;
  notes?: string | null;
  package_name?: string | null;
  remaining_credits: number;
  total_credits: number;
  low_credit_warning: boolean;
  status: 'booked' | 'attended' | 'no_show';
}

export interface TrainerSession {
  id: number;
  trainer_id: number;
  trainer_name: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_enrolled: number;
  attendees: TrainerAttendee[];
}

export interface TrainerScheduleData {
  trainer: AppUser;
  available_dates: string[];
  sessions: TrainerSession[];
}

export interface InstagramWebhookResponse {
  reply: string;
  action?: string;
  member_name?: string;
  session_id?: number | null;
  booking_id?: number | null;
  remaining_credits?: number | null;
}
