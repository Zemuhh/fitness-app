from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: Optional[str] = None
    phone: str
    role: str
    instagram_handle: Optional[str] = None
    notes: Optional[str] = ""
    avatar_url: Optional[str] = None
    specialty: Optional[str] = None
    bio: Optional[str] = None
    certificates: List[str] = Field(default_factory=list)
    rating: Optional[float] = 4.9
    experience_years: Optional[int] = 5
    streak_days: int = 0
    notify_reminders: bool = True
    notify_waitlist: bool = True
    notify_campaigns: bool = False


class PackageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    package_name: str
    total_credits: int
    remaining_credits: int
    expiry_date: str
    is_active: bool


class PackageRenewRequest(BaseModel):
    package_name: str
    credits: int = Field(..., gt=0)
    duration_days: Optional[int] = 45
    plan_code: Optional[str] = None
    price_try: Optional[float] = None


class PackageRenewResponse(BaseModel):
    message: str
    member_id: int
    package_id: int
    package_name: str
    added_credits: int
    remaining_credits: int
    total_credits: int
    expiry_date: str


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    tag: str
    date: str
    is_pinned: bool = False


class CheckInLogOut(BaseModel):
    id: int
    date: str
    time: str
    session_title: str
    trainer_name: str
    location: str
    category: str = "Fonksiyonel"


class MemberBookingItemOut(BaseModel):
    booking_id: int
    session_id: int
    status: str
    title: str
    category: str = "Fonksiyonel"
    room: Optional[str] = "Ana Stüdyo"
    date: str
    start_time: str
    end_time: str
    trainer_id: int
    trainer_name: str
    trainer_avatar_url: Optional[str] = None
    trainer_specialty: Optional[str] = None
    capacity: int
    current_enrolled: int


class AvailableSessionOut(BaseModel):
    id: int
    trainer_id: int
    trainer_name: str
    trainer_avatar_url: Optional[str] = None
    trainer_specialty: Optional[str] = None
    title: str
    category: str = "Fonksiyonel"
    room: Optional[str] = "Ana Stüdyo"
    date: str
    start_time: str
    end_time: str
    capacity: int
    current_enrolled: int
    remaining_spots: int
    is_full: bool
    is_booked_by_member: bool
    booking_id: Optional[int] = None
    waitlist_count: int = 0
    is_waitlisted_by_member: bool = False
    waitlist_id: Optional[int] = None
    waitlist_position: Optional[int] = None


class MemberWaitlistItemOut(BaseModel):
    waitlist_id: int
    session_id: int
    position: int
    total_waiting: int
    created_at: str
    title: str
    category: str = "Fonksiyonel"
    room: Optional[str] = "Ana Stüdyo"
    date: str
    start_time: str
    end_time: str
    trainer_id: int
    trainer_name: str
    trainer_avatar_url: Optional[str] = None
    capacity: int
    current_enrolled: int


class MemberDashboardOut(BaseModel):
    member: UserOut
    active_package: Optional[PackageOut] = None
    all_packages: List[PackageOut] = Field(default_factory=list)
    my_bookings: List[MemberBookingItemOut]
    available_sessions: List[AvailableSessionOut]
    waitlist_items: List[MemberWaitlistItemOut] = Field(default_factory=list)
    recent_checkins: List[CheckInLogOut] = Field(default_factory=list)


class TrainerCardOut(BaseModel):
    id: int
    full_name: str
    phone: str
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    specialty: Optional[str] = None
    bio: Optional[str] = None
    certificates: List[str] = Field(default_factory=list)
    rating: float = 4.9
    experience_years: int = 5
    active_sessions_count: int = 0
    monthly_classes_given: int = 0


class TrainerDetailOut(BaseModel):
    id: int
    full_name: str
    phone: str
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    specialty: Optional[str] = None
    bio: Optional[str] = None
    certificates: List[str] = Field(default_factory=list)
    rating: float = 4.9
    experience_years: int = 5
    active_sessions_count: int = 0
    monthly_classes_given: int = 0
    total_students_count: int = 0
    attendance_rate_pct: float = 96.0
    open_sessions: List[AvailableSessionOut] = Field(default_factory=list)


class ClubHomeOut(BaseModel):
    member: UserOut
    streak_days: int
    active_package: Optional[PackageOut] = None
    upcoming_booking: Optional[MemberBookingItemOut] = None
    announcements: List[AnnouncementOut]
    trainers: List[TrainerCardOut]
    wod_title: str
    wod_focus: str
    wod_duration_min: int
    wod_calories: int
    wod_movements: List[str]
    motivation_quote: str
    recent_checkins: List[CheckInLogOut]


class BookingCreateRequest(BaseModel):
    member_id: int
    session_id: int


class BookingCancelRequest(BaseModel):
    booking_id: Optional[int] = None
    member_id: Optional[int] = None
    session_id: Optional[int] = None


class BookingActionResponse(BaseModel):
    message: str
    booking_id: int
    status: str
    remaining_credits: int
    session_id: int
    current_enrolled: int
    capacity: int
    promoted_from_waitlist_member_id: Optional[int] = None
    promoted_from_waitlist_member_name: Optional[str] = None


class WaitlistCreateRequest(BaseModel):
    member_id: int
    session_id: int


class WaitlistCancelRequest(BaseModel):
    waitlist_id: Optional[int] = None
    member_id: Optional[int] = None
    session_id: Optional[int] = None


class WaitlistActionResponse(BaseModel):
    message: str
    waitlist_id: int
    session_id: int
    member_id: int
    position: int
    waitlist_count: int
    status: str


class BodyMetricOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    date: str
    weight_kg: float
    body_fat_pct: float
    muscle_mass_kg: float
    trainer_comment: Optional[str] = ""


class BodyMetricCreateRequest(BaseModel):
    member_id: int
    date: Optional[str] = None
    weight_kg: float
    body_fat_pct: float
    muscle_mass_kg: float
    trainer_comment: Optional[str] = ""


class MemberMetricsSummaryOut(BaseModel):
    member_id: int
    member_name: str
    metrics: List[BodyMetricOut]
    latest: Optional[BodyMetricOut] = None
    previous: Optional[BodyMetricOut] = None
    weight_diff_kg: float = 0.0
    body_fat_diff_pct: float = 0.0
    muscle_mass_diff_kg: float = 0.0
    latest_trainer_comment: str = ""
    completed_sessions_count: int = 0
    completed_sessions: List[MemberBookingItemOut] = Field(default_factory=list)


class WaitlistEntryOut(BaseModel):
    waitlist_id: int
    position: int
    member_id: int
    full_name: str
    phone: str
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    remaining_credits: int
    total_credits: int
    created_at: str


class AttendeeOut(BaseModel):
    booking_id: int
    member_id: int
    full_name: str
    phone: str
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    notes: Optional[str] = ""
    package_name: Optional[str] = None
    remaining_credits: int
    total_credits: int
    low_credit_warning: bool
    status: str


class TrainerSessionOut(BaseModel):
    id: int
    trainer_id: int
    trainer_name: str
    title: str
    category: str = "Fonksiyonel"
    room: Optional[str] = "Ana Stüdyo"
    date: str
    start_time: str
    end_time: str
    capacity: int
    current_enrolled: int
    attendees: List[AttendeeOut]
    waitlist: List[WaitlistEntryOut] = Field(default_factory=list)


class TrainerScheduleOut(BaseModel):
    trainer: UserOut
    available_dates: List[str]
    monthly_sessions_count: int = 0
    monthly_attendees_count: int = 0
    average_fill_rate_pct: float = 0.0
    sessions: List[TrainerSessionOut]


class TrainerSessionCreateRequest(BaseModel):
    trainer_id: int
    title: str
    category: Optional[str] = "Fonksiyonel"
    date: str
    start_time: str
    end_time: Optional[str] = None
    capacity: int = Field(default=4, ge=1, le=15)
    room: Optional[str] = None


class TrainerMemberCrmOut(BaseModel):
    id: int
    full_name: str
    phone: str
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    streak_days: int = 0
    notes: str = ""
    package_id: Optional[int] = None
    package_name: Optional[str] = None
    remaining_credits: int = 0
    total_credits: int = 0
    expiry_date: Optional[str] = None
    low_credit_warning: bool = False
    attended_sessions_count: int = 0
    latest_metric: Optional[BodyMetricOut] = None


class MemberProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    instagram_handle: Optional[str] = None
    notify_reminders: Optional[bool] = None
    notify_waitlist: Optional[bool] = None
    notify_campaigns: Optional[bool] = None


class AttendanceUpdateRequest(BaseModel):
    booking_id: int
    status: Literal["booked", "attended", "no_show"]


class MemberNotesUpdateRequest(BaseModel):
    member_id: Optional[int] = None
    notes: str


class InstagramWebhookRequest(BaseModel):
    instagram_handle: str
    message: str


class InstagramWebhookResponse(BaseModel):
    reply: str
    action: Optional[str] = None
    member_name: Optional[str] = None
    session_id: Optional[int] = None
    booking_id: Optional[int] = None
    remaining_credits: Optional[int] = None
