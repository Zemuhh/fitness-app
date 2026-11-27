import json
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


def _default_zones_dict() -> Dict[str, str]:
    return {
        "Omuz/Boyun": "healthy",
        "Göğüs": "healthy",
        "Sırt/Bel": "healthy",
        "Kollar": "healthy",
        "Karın/Core": "healthy",
        "Kalça/Bacak": "healthy",
        "Diz/Eklem": "healthy",
    }


class HealthOut(BaseModel):
    status: str = "ok"


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
    body_zones: Dict[str, str] = Field(default_factory=_default_zones_dict)
    referral_code: Optional[str] = None
    referral_count: int = 0
    policy_accepted: bool = False
    policy_accepted_at: Optional[str] = None
    policy_version: str = "v1.0"
    last_login_at: Optional[str] = None
    login_count: int = 0

    @field_validator("policy_accepted", mode="before")
    @classmethod
    def _parse_policy_accepted(cls, val: Any) -> bool:
        return bool(val) if val is not None else False

    @field_validator("policy_version", mode="before")
    @classmethod
    def _parse_policy_version(cls, val: Any) -> str:
        return str(val) if val else "v1.0"

    @field_validator("login_count", mode="before")
    @classmethod
    def _parse_login_count(cls, val: Any) -> int:
        return int(val) if val is not None else 0

    @field_validator("body_zones", mode="before")
    @classmethod
    def _parse_body_zones(cls, val: Any) -> Dict[str, str]:
        base = _default_zones_dict()
        if not val:
            return base
        if isinstance(val, dict):
            for k, v in val.items():
                if k in base and v in ("healthy", "warning", "injured"):
                    base[k] = v
            return base
        if isinstance(val, str):
            try:
                parsed = json.loads(val)
                if isinstance(parsed, dict):
                    for k, v in parsed.items():
                        if k in base and v in ("healthy", "warning", "injured"):
                            base[k] = v
            except Exception:
                pass
        return base

    @field_validator("referral_count", mode="before")
    @classmethod
    def _parse_referral_count(cls, val: Any) -> int:
        if val is None:
            return 0
        return int(val)


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


class HourlyForecastItemOut(BaseModel):
    hour: str
    pct: int


class ClubLiveStatusOut(BaseModel):
    occupancy_pct: int
    active_members_count: int
    active_members_label: str
    capacity: int = 40
    status_level: Literal["low", "moderate", "high"]
    status_badge: str
    hourly_forecast: List[HourlyForecastItemOut]


class BodyZonesOut(BaseModel):
    user_id: int
    zones: Dict[str, str]


class BodyZonesUpdateRequest(BaseModel):
    zones: Dict[str, str]


class BodyZonesUpdateOut(BaseModel):
    user_id: int
    zones: Dict[str, str]
    message: str = "Vücut haritası güncellendi."


class DailyWellnessOut(BaseModel):
    id: int
    member_id: int
    date: str
    water_ml: int = 0
    water_goal_ml: int = 3000
    sleep_hours: float = 7.5
    energy_status: Literal["high", "normal", "low"] = "normal"
    calories_intake: int = 0
    calories_goal: int = 2100
    protein_g: int = 0
    protein_goal_g: int = 140
    carbs_g: int = 0
    carbs_goal_g: int = 220
    fat_g: int = 0
    fat_goal_g: int = 65


class WellnessWaterRequest(BaseModel):
    amount_ml: int = 250


class WellnessEnergyRequest(BaseModel):
    energy_status: Literal["high", "normal", "low"]
    sleep_hours: Optional[float] = None


class NutritionAnalyzeRequest(BaseModel):
    member_id: int
    meal_text: str


class NutritionAnalyzeOut(BaseModel):
    meal_text: str
    added_calories: int
    added_protein_g: int
    added_carbs_g: int
    added_fat_g: int
    coach_note: str
    wellness: DailyWellnessOut


class DetectedFoodItemOut(BaseModel):
    name: str
    portion: str
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    confidence_pct: int = 92


class NutritionPhotoAnalyzeRequest(BaseModel):
    member_id: int
    image_base64: str = ""
    filename: Optional[str] = None
    meal_type: Optional[str] = "Öğle"
    portion_size: Literal["Küçük", "Normal", "Büyük"] = "Normal"
    notes: Optional[str] = None
    auto_log: bool = True


class NutritionPhotoAnalyzeOut(BaseModel):
    log_id: int
    meal_type: str
    portion_size: str
    meal_title: str
    total_calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int
    sugar_g: int
    health_score: int
    glycemic_load: str
    burn_equivalent: str
    analysis_engine: str
    detected_items: List[DetectedFoodItemOut] = Field(default_factory=list)
    coach_note: str
    suggestions: List[str] = Field(default_factory=list)
    wellness: DailyWellnessOut


class NutritionMealLogOut(BaseModel):
    id: int
    member_id: int
    date: str
    created_at: str
    source: str
    meal_type: str
    portion_size: str
    meal_description: str
    photo_thumbnail: Optional[str] = None
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int
    sugar_g: int
    health_score: int
    glycemic_load: str
    burn_equivalent: str
    detected_items: List[DetectedFoodItemOut] = Field(default_factory=list)
    coach_note: str
    is_today: bool = False


class FoodVisionItemOut(BaseModel):
    name: str
    estimated_grams: int = 100
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


class FoodVisionAnalyzeOut(BaseModel):
    meal_name: str
    confidence: int = 90
    items: List[FoodVisionItemOut] = Field(default_factory=list)
    total_calories: int
    total_protein_g: int
    total_carbs_g: int
    total_fat_g: int
    coach_tip: str
    is_mock: bool = False


class NutritionLogMealRequest(BaseModel):
    member_id: int
    meal_name: str
    meal_type: Optional[str] = None
    portion_multiplier: float = 1.0
    total_calories: int
    total_protein_g: int
    total_carbs_g: int
    total_fat_g: int
    coach_tip: Optional[str] = ""
    items: List[FoodVisionItemOut] = Field(default_factory=list)
    photo_thumbnail: Optional[str] = None
    source: str = "photo"


class NutritionLogMealOut(BaseModel):
    logged: bool = True
    log_id: int
    meal_log: NutritionMealLogOut
    wellness: DailyWellnessOut
    message: str = "Öğün günlüğünüze eklendi."


class ReferralInfoOut(BaseModel):
    member_id: int
    member_name: str
    referral_code: str
    referral_count: int = 0
    earned_free_credits: int = 0
    remaining_credits: int = 0


class ReferralRedeemRequest(BaseModel):
    referral_code: str
    new_member_id: Optional[int] = None
    friend_name: Optional[str] = None
    is_demo_simulation: Optional[bool] = False


class ReferralRedeemOut(BaseModel):
    success: bool = True
    referral_code: str
    inviter_id: int
    inviter_name: str
    referral_count: int
    remaining_credits: int
    bonus_credits_added: int = 1
    message: str = "🎉 Tebrikler! Arkadaşınız katıldığı için paketinize +1 Hediye Ders eklendi!"


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
    body_zones: Dict[str, str] = Field(default_factory=_default_zones_dict)
    today_energy_status: Literal["high", "normal", "low"] = "normal"
    today_water_ml: int = 0
    water_goal_ml: int = 3000
    today_protein_g: int = 0
    protein_goal_g: int = 140
    water_pct: int = 0
    protein_pct: int = 0


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
    body_zones: Dict[str, str] = Field(default_factory=_default_zones_dict)
    today_energy_status: Literal["high", "normal", "low"] = "normal"
    today_water_ml: int = 0
    water_goal_ml: int = 3000
    today_protein_g: int = 0
    protein_goal_g: int = 140
    water_pct: int = 0
    protein_pct: int = 0


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
    body_zones: Dict[str, str] = Field(default_factory=_default_zones_dict)
    today_energy_status: Literal["high", "normal", "low"] = "normal"
    today_water_ml: int = 0
    water_goal_ml: int = 3000
    today_protein_g: int = 0
    protein_goal_g: int = 140
    water_pct: int = 0
    protein_pct: int = 0


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


class LiveParticipantOut(BaseModel):
    booking_id: int
    member_id: int
    member_name: str
    member_phone: str
    status: str
    checked_in_at: Optional[str] = None
    body_zones: Dict[str, str] = Field(default_factory=_default_zones_dict)
    today_energy_status: Literal["high", "normal", "low"] = "normal"
    notes: str = ""
    remaining_credits: int = 0


class LiveAttendanceSessionOut(BaseModel):
    id: int
    session_id: int
    trainer_id: int
    trainer_name: str
    title: str
    category: str = "Fonksiyonel"
    room: str = "Ana Stüdyo"
    date: str
    start_time: str
    end_time: str
    capacity: int
    current_enrolled: int
    time_state: Literal["live_now", "upcoming_soon", "upcoming", "completed"]
    session_status: str = "scheduled"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    actual_duration_minutes: Optional[int] = None
    minutes_to_start: int = 0
    attended_count: int = 0
    no_show_count: int = 0
    pending_count: int = 0
    participants: List[LiveParticipantOut] = Field(default_factory=list)


class TrainerLiveAttendanceOut(BaseModel):
    trainer_id: int
    trainer_name: str
    server_time_iso: str
    server_date: str
    server_hhmm: str
    current_active_session: Optional[LiveAttendanceSessionOut] = None
    today_sessions: List[LiveAttendanceSessionOut] = Field(default_factory=list)
    upcoming_sessions: List[LiveAttendanceSessionOut] = Field(default_factory=list)


class CompleteClassResponseOut(BaseModel):
    session_id: int
    title: str
    session_status: str = "completed"
    started_at: Optional[str] = None
    ended_at: str
    actual_duration_minutes: int
    attended_count: int
    no_show_count: int
    pending_count: int
    message: str
    session: LiveAttendanceSessionOut


class AttendanceMarkOut(BaseModel):
    booking_id: int
    session_id: int
    member_id: int
    status: str
    checked_in_at: Optional[str] = None
    attended_count: int
    no_show_count: int
    pending_count: int
    message: str


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
