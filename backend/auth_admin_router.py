import base64
import hashlib
import hmac
import html
import json
import os
import re
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple
from urllib.parse import parse_qs, urlencode

import httpx
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from auth_admin_models import (
    AdminAccount,
    AuthSession,
    DataIntakeLog,
    GoogleOAuthState,
    PanelSetting,
    UserAccessCredential,
    UserAuthAccount,
    run_sqlite_schema_migrations,
)
from database import engine, get_db
from instagram_service import fallback_turkish_nlp_parse, match_session, normalize_handle
from models import (
    Announcement,
    BodyMetrics,
    Booking,
    ClassSession,
    DailyWellness,
    MemberPackage,
    NutritionMealLog,
    User,
    Waitlist,
    generate_unique_referral_code,
    grant_bonus_credit_to_member,
    infer_default_body_zones,
    normalize_referral_code_input,
)
import payment_models
from payment_models import PackageCatalogPlan, PaymentCheckoutSession, PaymentTransaction
from schemas import AnnouncementOut, UserOut

portal_router = APIRouter(prefix="/portal", tags=["Portal Legacy & Data Intake"])
auth_router = APIRouter(prefix="/auth", tags=["Authentication & Google OAuth"])
admin_router = APIRouter(prefix="/admin", tags=["Zero-Profile System Administration"])
policy_router = APIRouter(prefix="/policy", tags=["Company Policy & KVKK Agreement"])

SIGNED_POLICIES_DIR = Path(__file__).resolve().parent / "signed_policies"
POLICY_VERSION = "v1.0"

# Backward-compatible export alias
router = portal_router


# ============================================================================
# ŞİFRE HASHLEME & GÜVENLİK YARDIMCILARI (PBKDF2-HMAC-SHA256)
# ============================================================================

PBKDF2_ITERATIONS = 120_000


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _hash_password(raw_password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        raw_password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def _verify_password(raw_password: str, stored_hash: Optional[str]) -> bool:
    if not raw_password or not stored_hash:
        return False
    if not stored_hash.startswith("pbkdf2_sha256$"):
        return hmac.compare_digest(raw_password, stored_hash)
    try:
        _, iter_str, salt, expected_hex = stored_hash.split("$", 3)
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            raw_password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iter_str),
        )
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def _slugify_tr(text_val: str) -> str:
    tr_map = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    lowered = (text_val or "").translate(tr_map).lower()
    cleaned = re.sub(r"[^a-z0-9]+", "", lowered)
    return cleaned or "uye"


def _derive_base_url(request: Request) -> str:
    proto = (
        request.headers.get("x-forwarded-proto")
        or request.url.scheme
        or "http"
    ).split(",")[0].strip()
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
        or "localhost:8000"
    ).split(",")[0].strip()
    return f"{proto}://{host}"


# ============================================================================
# PYDANTIC ŞEMALARI: AUTH, GOOGLE OAUTH & ZERO-PROFILE ADMIN
# ============================================================================


class AuthLoginRequest(BaseModel):
    identifier: Optional[str] = Field(
        default=None,
        description="E-posta, kullanıcı adı, telefon numarası, @handle veya FIT-XXXX kodu",
    )
    email: Optional[str] = None
    username: Optional[str] = None
    password: str


class AuthRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = "0500 000 00 00"
    instagram_handle: Optional[str] = None
    referral_code: Optional[str] = None


class GoogleAuthRequest(BaseModel):
    id_token: Optional[str] = None
    access_token: Optional[str] = None
    code: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    google_sub: Optional[str] = None
    avatar_url: Optional[str] = None


class GoogleAuthUrlOut(BaseModel):
    auth_url: str
    state: str
    provider: str = "google"
    client_id_configured: bool = False


class AuthLogoutRequest(BaseModel):
    token: Optional[str] = None


class AuthLogoutOut(BaseModel):
    logged_out: bool
    message: str


class AuthDeleteAccountOut(BaseModel):
    deleted: bool = True
    user_id: int
    message: str = "Hesabınız ve ilişkili kişisel verileriniz kalıcı olarak silindi."


class AuthSessionOut(BaseModel):
    authenticated: bool = True
    token: str
    token_type: str = "Bearer"
    expires_at: str
    auth_provider: str = "password"
    account_type: Literal["admin", "user"]
    id: Optional[int] = None
    user_id: Optional[int] = None
    admin_id: Optional[int] = None
    role: Literal["admin", "trainer", "member"]
    username: str
    email: str
    full_name: str
    phone: str = ""
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    access_code: Optional[str] = None
    has_personal_profile: bool
    is_admin: bool
    available_panels: List[str]
    default_panel: Literal["admin", "trainer", "member"]
    specialty: Optional[str] = None
    notes: Optional[str] = None
    package_name: Optional[str] = None
    remaining_credits: Optional[int] = None
    total_credits: Optional[int] = None
    policy_accepted: bool = False
    policy_accepted_at: Optional[str] = None
    policy_version: str = "v1.0"
    last_login_at: Optional[str] = None
    login_count: int = 0
    message: str = "Giriş başarılı."


class CodeLoginRequest(BaseModel):
    access_code: str = Field(..., description="Admin tarafından atanan kişisel erişim kodu (örn. ERYA-1004)")


class AdminAccessCodeItemOut(BaseModel):
    user_id: int
    full_name: str
    role: str
    phone: str
    access_code: str
    is_active: bool = True
    last_login_at: Optional[str] = None
    login_count: int = 0
    policy_accepted: bool = False
    policy_accepted_at: Optional[str] = None
    remaining_credits: int = 0


class AdminCreateUserWithCodeRequest(BaseModel):
    full_name: str
    phone: Optional[str] = None
    role: Literal["member", "trainer"] = "member"
    custom_code: Optional[str] = None
    initial_credits: Optional[int] = 0
    notes: Optional[str] = ""
    specialty: Optional[str] = None


class AdminCreateUserWithCodeOut(BaseModel):
    user_id: int
    full_name: str
    role: str
    phone: str
    access_code: str
    is_active: bool = True
    remaining_credits: int = 0
    policy_accepted: bool = False
    policy_accepted_at: Optional[str] = None
    specialty: Optional[str] = None
    notes: str = ""
    message: str = "Kullanıcı ve kişisel erişim kodu başarıyla oluşturuldu."


class AdminRegenerateCodeRequest(BaseModel):
    custom_code: Optional[str] = None


class AdminRegenerateCodeOut(BaseModel):
    user_id: int
    full_name: str
    role: str
    previous_code: Optional[str] = None
    access_code: str
    message: str = "Erişim kodu başarıyla yenilendi."


class PolicySectionOut(BaseModel):
    heading: str
    body: str


class PolicyCurrentOut(BaseModel):
    version: str = "v1.0"
    title: str
    company_name: str
    effective_date: str
    sections: List[PolicySectionOut]
    full_text: str
    policy_accepted: bool = False
    policy_accepted_at: Optional[str] = None


class PolicyAcceptRequest(BaseModel):
    user_id: Optional[int] = None
    signer_name: str
    accepted: bool


class PolicyAcceptOut(BaseModel):
    accepted: bool = True
    already_accepted: bool = False
    user_id: int
    policy_version: str = "v1.0"
    accepted_at: str
    file_name: str
    sha256: str
    message: str = "Şirket politika sözleşmesi başarıyla onaylandı ve arşivlendi."


class AdminPolicyRecordOut(BaseModel):
    user_id: int
    full_name: str
    role: str
    access_code: str
    policy_accepted: bool
    policy_accepted_at: Optional[str] = None
    policy_version: str = "v1.0"
    file_name: Optional[str] = None
    file_exists: bool = False
    file_size_bytes: int = 0


class AdminPoliciesOverviewOut(BaseModel):
    signed_count: int
    pending_count: int
    storage_folder: str
    records: List[AdminPolicyRecordOut]


class AdminPolicyDocumentOut(BaseModel):
    user_id: int
    full_name: str
    file_name: str
    accepted_at: Optional[str] = None
    content: str


class AdminMonthlySummaryOut(BaseModel):
    month: str
    month_label: str
    total_trainer_hours: float
    total_sessions_scheduled: int
    total_sessions_entered: int
    total_registered_members: int
    logged_in_members_count: int
    active_members_count: int
    passive_members_count: int
    worked_with_members_count: int
    total_member_hours: float
    policy_signed_count: int
    policy_pending_count: int


class AdminMonthlyTrainerStatOut(BaseModel):
    trainer_id: int
    full_name: str
    specialty: Optional[str] = None
    access_code: str
    sessions_scheduled: int
    sessions_entered: int
    sessions_completed: int
    total_hours_taught: float
    total_attended_students: int
    total_no_show_students: int
    attendance_rate_pct: float
    unique_members_trained: int


class AdminMonthlyMemberStatOut(BaseModel):
    member_id: int
    full_name: str
    phone: str
    access_code: str
    status: Literal["active", "passive"]
    has_logged_in: bool
    last_login_at: Optional[str] = None
    login_count: int
    attended_sessions: int
    no_show_sessions: int
    total_hours_attended: float
    remaining_credits: int
    policy_accepted: bool
    policy_accepted_at: Optional[str] = None


class AdminMonthlyAnalyticsOut(BaseModel):
    month: str
    month_label: str
    summary: AdminMonthlySummaryOut
    trainers: List[AdminMonthlyTrainerStatOut]
    members: List[AdminMonthlyMemberStatOut]


class PanelConfigOut(BaseModel):
    admin_panel_enabled: bool = True
    trainer_panel_enabled: bool = True
    member_panel_enabled: bool = True
    default_landing_panel: Literal["admin", "trainer", "member"] = "admin"
    allow_google_login: bool = True
    allow_member_booking: bool = True
    allow_package_purchase: bool = True
    studio_banner_enabled: bool = True
    studio_banner_title: str
    studio_banner_message: str
    updated_at: str


class PanelConfigUpdateRequest(BaseModel):
    admin_panel_enabled: Optional[bool] = None
    trainer_panel_enabled: Optional[bool] = None
    member_panel_enabled: Optional[bool] = None
    default_landing_panel: Optional[Literal["admin", "trainer", "member"]] = None
    allow_google_login: Optional[bool] = None
    allow_member_booking: Optional[bool] = None
    allow_package_purchase: Optional[bool] = None
    studio_banner_enabled: Optional[bool] = None
    studio_banner_title: Optional[str] = None
    studio_banner_message: Optional[str] = None


class AdminPanelTargetsOut(BaseModel):
    trainers: List[UserOut]
    members: List[UserOut]
    default_trainer_id: Optional[int] = None
    default_member_id: Optional[int] = None


class AdminAnnouncementCreateRequest(BaseModel):
    title: str
    content: str
    tag: Optional[str] = "Kulüp Haberleri"
    date: Optional[str] = None
    is_pinned: Optional[bool] = False


class AdminAnnouncementUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tag: Optional[str] = None
    date: Optional[str] = None
    is_pinned: Optional[bool] = None


class AdminTrainerOut(BaseModel):
    id: int
    full_name: str
    email: str
    username: str
    phone: str
    instagram_handle: Optional[str] = None
    specialty: str
    bio: str
    notes: str
    avatar_url: Optional[str] = None
    rating: float = 4.9
    experience_years: int = 5
    access_code: str
    active_sessions_count: int = 0


class AdminTrainerCreateRequest(BaseModel):
    full_name: str
    specialty: Optional[str] = "Reformer & Klinik Pilates"
    email: Optional[str] = None
    username: Optional[str] = None
    password: str = "Erya2026!"
    phone: Optional[str] = "0551 497 90 09"
    instagram_handle: Optional[str] = None
    bio: Optional[str] = None
    notes: Optional[str] = ""
    avatar_url: Optional[str] = None
    experience_years: Optional[int] = 5
    rating: Optional[float] = 5.0


class AdminTrainerUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    specialty: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    instagram_handle: Optional[str] = None
    bio: Optional[str] = None
    notes: Optional[str] = None
    avatar_url: Optional[str] = None
    experience_years: Optional[int] = None
    rating: Optional[float] = None


class AdminMemberOut(BaseModel):
    id: int
    full_name: str
    email: str
    username: str
    phone: str
    instagram_handle: Optional[str] = None
    avatar_url: Optional[str] = None
    notes: str
    access_code: str
    package_id: Optional[int] = None
    package_name: Optional[str] = None
    package_month: Optional[str] = None
    package_notes: Optional[str] = ""
    remaining_credits: int = 0
    total_credits: int = 0
    expiry_date: Optional[str] = None
    low_credit_warning: bool = False
    upcoming_bookings_count: int = 0
    attended_count: int = 0
    streak_days: int = 0


class AdminMemberCreateRequest(BaseModel):
    full_name: str
    phone: Optional[str] = "0530 000 00 00"
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = "Erya2026!"
    instagram_handle: Optional[str] = None
    notes: Optional[str] = ""
    avatar_url: Optional[str] = None
    package_name: Optional[str] = "8 Seans Grup Reformer Paketi"
    credits: Optional[int] = 8
    duration_days: Optional[int] = 40
    package_month: Optional[str] = None
    package_notes: Optional[str] = None


class AdminMemberUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    instagram_handle: Optional[str] = None
    notes: Optional[str] = None
    package_name: Optional[str] = None
    remaining_credits: Optional[int] = None
    total_credits: Optional[int] = None
    expiry_date: Optional[str] = None
    package_month: Optional[str] = None
    package_notes: Optional[str] = None


class AdminMemberPackageItemOut(BaseModel):
    id: int
    member_id: int
    member_name: str
    package_name: str
    total_credits: int
    remaining_credits: int
    used_credits: int
    package_month: Optional[str] = None
    package_notes: str = ""
    expiry_date: str
    created_at: Optional[str] = None
    is_active: bool = True


class AdminAssignMemberPackageRequest(BaseModel):
    package_name: str
    total_credits: int = Field(..., ge=1, le=200)
    remaining_credits: Optional[int] = Field(default=None, ge=0, le=200)
    package_month: Optional[str] = None
    duration_days: Optional[int] = Field(default=30, ge=1, le=365)
    expiry_date: Optional[str] = None
    package_notes: Optional[str] = ""
    deactivate_previous: bool = True


class AdminUpdateMemberPackageRequest(BaseModel):
    package_name: Optional[str] = None
    total_credits: Optional[int] = Field(default=None, ge=1, le=200)
    remaining_credits: Optional[int] = Field(default=None, ge=0, le=200)
    package_month: Optional[str] = None
    expiry_date: Optional[str] = None
    package_notes: Optional[str] = None
    is_active: Optional[bool] = None


class AdminMemberCreditAdjustRequest(BaseModel):
    package_name: Optional[str] = None
    credits_delta: Optional[int] = None
    set_remaining_credits: Optional[int] = None
    total_credits: Optional[int] = None
    duration_days: Optional[int] = 45


class AdminSessionItemOut(BaseModel):
    id: int
    trainer_id: int
    trainer_name: str
    title: str
    category: str
    room: str
    date: str
    day_label: str
    start_time: str
    end_time: str
    capacity: int
    current_enrolled: int
    remaining_spots: int
    is_full: bool


class AdminSessionCreateRequest(BaseModel):
    trainer_id: int
    title: str
    category: Optional[str] = "Grup Reformer"
    room: Optional[str] = None
    date: str
    start_time: str
    end_time: Optional[str] = None
    capacity: int = Field(default=6, ge=1, le=20)


class AdminSessionUpdateRequest(BaseModel):
    trainer_id: Optional[int] = None
    title: Optional[str] = None
    category: Optional[str] = None
    room: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=20)


class AdminSessionDeleteOut(BaseModel):
    deleted: bool
    id: int
    refunded_bookings: int
    message: str


class AdminPackagePlanOut(BaseModel):
    id: int
    code: str
    name: str
    subtitle: str
    credits: int
    duration_days: int
    price_try: float
    popular_badge: Optional[str] = None
    features: List[str]
    is_active: bool


class AdminPackagePlanCreateRequest(BaseModel):
    code: Optional[str] = None
    name: str
    subtitle: Optional[str] = ""
    credits: int = Field(..., gt=0)
    duration_days: int = Field(default=40, gt=0)
    price_try: float = Field(..., ge=0)
    popular_badge: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    is_active: bool = True


class AdminPackagePlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    subtitle: Optional[str] = None
    credits: Optional[int] = None
    duration_days: Optional[int] = None
    price_try: Optional[float] = None
    popular_badge: Optional[str] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None


class AdminPaymentItemOut(BaseModel):
    id: int
    transaction_code: str
    member_id: int
    member_name: str
    plan_id: int
    plan_name: str
    package_name: str
    amount_try: float
    amount: float
    currency: str = "TRY"
    payment_method: str
    installment_count: int
    status: str
    created_at: str


class AdminSystemOverviewOut(BaseModel):
    total_members: int
    total_trainers: int
    total_sessions: int
    upcoming_sessions_count: int
    active_bookings_count: int
    active_packages_count: int
    total_remaining_credits: int
    low_credit_members_count: int
    total_announcements: int
    total_revenue_try: float
    total_payments_count: int
    panel_config: PanelConfigOut
    recent_announcements: List[AnnouncementOut]
    recent_payments: List[AdminPaymentItemOut]


class AdminDeleteOut(BaseModel):
    deleted: bool
    id: int
    message: str


# ============================================================================
# PORTAL LEGACY PYDANTIC ŞEMALARI (/portal/* uyumluluğu)
# ============================================================================


class PortalUserSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str
    role: str
    instagram_handle: Optional[str] = None
    notes: Optional[str] = ""
    access_code: str


class PortalPackageSummaryOut(BaseModel):
    id: int
    package_name: str
    total_credits: int
    remaining_credits: int
    expiry_date: str
    is_active: bool
    low_credit_warning: bool


class PortalBookingLookupItemOut(BaseModel):
    booking_id: int
    session_id: int
    title: str
    date: str
    day_label: str
    start_time: str
    end_time: str
    trainer_id: int
    trainer_name: str
    status: str
    capacity: int
    current_enrolled: int


class PortalLookupResponse(BaseModel):
    access_code: str
    user_id: int
    full_name: str
    role: str
    phone_masked: str
    user: PortalUserSummaryOut
    active_package: Optional[PortalPackageSummaryOut] = None
    package_name: Optional[str] = None
    remaining_credits: int
    total_credits: int
    expiry_date: Optional[str] = None
    low_credit_warning: bool = False
    upcoming_bookings: List[PortalBookingLookupItemOut]
    past_bookings: List[PortalBookingLookupItemOut]
    summary_message: str


class PortalQuickChipOut(BaseModel):
    access_code: str
    user_id: int
    full_name: str
    short_label: str
    role: str
    remaining_credits: int
    total_credits: int


class PortalUserLoginRequest(BaseModel):
    identifier: str = Field(..., description="Telefon numarası, FIT-XXXX kodu veya @kullaniciadi")
    pin_code: Optional[str] = Field(default=None, description="Opsiyonel PIN kodu (varsayılan 1234)")


class PortalUserLoginResponse(BaseModel):
    message: str
    access_code: str
    user: PortalUserSummaryOut
    active_package: Optional[PortalPackageSummaryOut] = None
    remaining_credits: int
    total_credits: int


class PortalAdminLoginRequest(BaseModel):
    username: str
    password: str


class PortalAdminLoginResponse(BaseModel):
    authenticated: bool
    username: str
    full_name: str
    token: str
    message: str


class DataIntakeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    sender_name: str
    sender_contact: str
    message_or_payload: str
    target_department: str
    routed_user_id: Optional[int] = None
    assigned_access_code: Optional[str] = None
    action_summary: str
    created_at: str


class AdminDirectoryUserOut(BaseModel):
    id: int
    full_name: str
    phone: str
    role: str
    instagram_handle: Optional[str] = None
    notes: str
    access_code: str
    pin_code: str
    package_name: Optional[str] = None
    remaining_credits: int
    total_credits: int
    expiry_date: Optional[str] = None
    low_credit_warning: bool
    upcoming_count: int


class AdminSessionOptionOut(BaseModel):
    id: int
    title: str
    date: str
    day_label: str
    start_time: str
    end_time: str
    trainer_id: int
    trainer_name: str
    capacity: int
    current_enrolled: int
    remaining_spots: int
    is_full: bool


class AdminOverviewStatsOut(BaseModel):
    total_members: int
    total_trainers: int
    active_packages_count: int
    total_remaining_credits: int
    total_sessions: int
    active_bookings_count: int
    low_credit_members_count: int
    total_intake_logs: int


class AdminOverviewResponse(BaseModel):
    stats: AdminOverviewStatsOut
    channel_counts: Dict[str, int]
    department_counts: Dict[str, int]
    users: List[AdminDirectoryUserOut]
    sessions: List[AdminSessionOptionOut]
    recent_logs: List[DataIntakeLogOut]


class AdminCreateUserRequest(BaseModel):
    full_name: str
    phone: str
    role: Literal["member", "trainer"] = "member"
    instagram_handle: Optional[str] = None
    notes: Optional[str] = ""
    pin_code: Optional[str] = "1234"
    package_name: Optional[str] = None
    package_credits: Optional[int] = None
    package_duration_days: int = 30


class AdminCreateUserResponse(BaseModel):
    message: str
    access_code: str
    pin_code: str
    user: PortalUserSummaryOut
    active_package: Optional[PortalPackageSummaryOut] = None


class DataIntakeCollectRequest(BaseModel):
    source: Literal["instagram", "whatsapp", "manual"]
    sender_name: str
    sender_contact: str
    content: str
    session_id: Optional[int] = None
    notes: Optional[str] = None
    package_credits: Optional[int] = None
    package_name: Optional[str] = None


class IntakeBookingResultOut(BaseModel):
    booked: bool
    status_code: str
    message: str
    booking_id: Optional[int] = None
    session_id: Optional[int] = None
    session_title: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    trainer_name: Optional[str] = None
    remaining_credits: Optional[int] = None


class DataIntakeCollectResponse(BaseModel):
    message: str
    action_summary: str
    target_department: str
    routed_departments: List[str]
    is_new_user: bool
    assigned_access_code: str
    user: PortalUserSummaryOut
    notes_updated: bool
    updated_notes: str
    package_updated: bool
    remaining_credits: int
    total_credits: int
    booking_result: Optional[IntakeBookingResultOut] = None
    log: DataIntakeLogOut


# ============================================================================
# YARDIMCI FONKSİYONLAR VE BAŞLATMA MOTORU
# ============================================================================

INJURY_HEALTH_KEYWORDS = [
    "sakatlık",
    "sakatlik",
    "ağrı",
    "agri",
    "fıtık",
    "fitik",
    "menisküs",
    "meniskus",
    "omuz",
    "diz",
    "bel",
    "boyun",
    "bilek",
    "ameliyat",
    "hassasiyet",
    "hamile",
    "tansiyon",
    "astım",
    "astim",
    "dikkat",
    "rapor",
    "mr ",
    "mr,",
    "fizik tedavi",
    "kırık",
    "kirik",
    "zorlanma",
    "ödem",
    "odem",
    "impingement",
    "postür",
    "postur",
    "skolyoz",
]

SEEDED_USER_IDENTITIES = {
    "Seher Hoca": ("seher", "seher@eryapilates.com"),
    "Selin Hoca": ("selin", "selin@eryapilates.com"),
    "İpek Hoca": ("ipek", "ipek@eryapilates.com"),
    "Zeynep Kaya": ("zeynep", "zeynep@eryapilates.com"),
    "Elif Şahin": ("elif", "elif@eryapilates.com"),
    "Defne Yıldız": ("defne", "defne@eryapilates.com"),
    "Merve Arslan": ("merve", "merve@eryapilates.com"),
    "İrem Korkmaz": ("irem", "irem@eryapilates.com"),
    "Ayşe Demir": ("aysedemir", "ayse.demir@gmail.com"),
    "Burcu Yılmaz": ("burcuyilmaz", "burcu.yilmaz@gmail.com"),
    "Ceren Öztürk": ("cerenozturk", "ceren.ozturk@gmail.com"),
    "Pelin Karaca": ("pelinkaraca", "pelin.karaca@gmail.com"),
    "Aslı Aydıner": ("asliaydiner", "asli.aydiner@gmail.com"),
    "Gizem Aksoy": ("gizemaksoy", "gizem.aksoy@gmail.com"),
    "Ece Kılıç": ("ecekilic", "ece.kilic@gmail.com"),
    "Melis Erdoğan": ("meliserdogan", "melis.erdogan@gmail.com"),
}


def _normalize_phone_digits(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) > 10 and digits.startswith("90"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def _mask_phone(phone: str) -> str:
    digits = _normalize_phone_digits(phone)
    if len(digits) >= 10:
        return f"0{digits[:3]} *** ** {digits[-2:]}"
    return phone or "-"


def _format_day_label_tr(iso_date: str) -> str:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)
    if iso_date == today.strftime("%Y-%m-%d"):
        return f"Bugün ({iso_date})"
    if iso_date == tomorrow.strftime("%Y-%m-%d"):
        return f"Yarın ({iso_date})"
    if iso_date == day_after.strftime("%Y-%m-%d"):
        return f"Ertesi Gün ({iso_date})"
    return iso_date


def _get_active_package(db: Session, member_id: int) -> Optional[MemberPackage]:
    return (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id, MemberPackage.is_active == True)
        .order_by(MemberPackage.id.desc())
        .first()
    )


def _to_package_summary(pkg: Optional[MemberPackage]) -> Optional[PortalPackageSummaryOut]:
    if not pkg:
        return None
    return PortalPackageSummaryOut(
        id=pkg.id,
        package_name=pkg.package_name,
        total_credits=pkg.total_credits,
        remaining_credits=pkg.remaining_credits,
        expiry_date=pkg.expiry_date,
        is_active=pkg.is_active,
        low_credit_warning=(pkg.remaining_credits <= 2),
    )


def _normalize_access_code(raw_code: Optional[str]) -> str:
    cleaned = re.sub(r"\s+", "", (raw_code or "").strip()).upper()
    if not cleaned:
        return ""
    m = re.match(r"^(ERYA|FIT)(\d+)$", cleaned)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return cleaned


def _compact_code_key(raw_code: Optional[str]) -> str:
    return re.sub(r"[\s\-_]+", "", (raw_code or "").strip()).upper()


def _generate_unique_access_code(
    db: Session,
    user_id: int,
    prefix: str = "ERYA",
    randomized: bool = False,
    exclude_code: Optional[str] = None,
) -> str:
    existing_keys = {
        _compact_code_key(c.access_code)
        for c in db.query(UserAccessCredential).all()
        if c.access_code
    }
    excl_key = _compact_code_key(exclude_code) if exclude_code else ""

    if randomized:
        for _ in range(200):
            num = 1000 + secrets.randbelow(9000)
            candidate = f"{prefix}-{num}"
            ckey = _compact_code_key(candidate)
            if ckey not in existing_keys and ckey != excl_key:
                return candidate

    base_num = 1000 + user_id
    while True:
        candidate = f"{prefix}-{base_num}"
        ckey = _compact_code_key(candidate)
        if ckey not in existing_keys and ckey != excl_key:
            return candidate
        base_num += 1


def _ensure_user_credential(db: Session, user: User, pin_code: str = "1234") -> UserAccessCredential:
    cred = db.query(UserAccessCredential).filter(UserAccessCredential.user_id == user.id).first()
    if cred:
        return cred
    code = _generate_unique_access_code(db, user.id, prefix="ERYA")
    cred = UserAccessCredential(
        user_id=user.id,
        access_code=code,
        pin_code=(pin_code or "1234").strip() or "1234",
        created_at=_now_str(),
    )
    db.add(cred)
    db.flush()
    return cred


def _unique_username(db: Session, base_username: str, exclude_user_id: Optional[int] = None) -> str:
    clean_base = _slugify_tr(base_username)[:40] or "uye"
    candidate = clean_base
    suffix = 1
    while True:
        q = db.query(UserAuthAccount).filter(UserAuthAccount.username == candidate)
        if exclude_user_id is not None:
            q = q.filter(UserAuthAccount.user_id != exclude_user_id)
        if candidate == "admin" or q.first() is not None:
            suffix += 1
            candidate = f"{clean_base}{suffix}"
        else:
            return candidate


def _unique_email(db: Session, desired_email: str, exclude_user_id: Optional[int] = None) -> str:
    clean_email = (desired_email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        clean_email = f"{_slugify_tr(desired_email)}@eryapilates.com"
    candidate = clean_email
    local_part, domain_part = candidate.split("@", 1)
    suffix = 1
    while True:
        q = db.query(UserAuthAccount).filter(UserAuthAccount.email == candidate)
        if exclude_user_id is not None:
            q = q.filter(UserAuthAccount.user_id != exclude_user_id)
        if candidate == "admin@eryapilates.com" or q.first() is not None:
            suffix += 1
            candidate = f"{local_part}{suffix}@{domain_part}"
        else:
            return candidate


def _ensure_user_auth_account(
    db: Session,
    user: User,
    desired_username: Optional[str] = None,
    desired_email: Optional[str] = None,
    raw_password: str = "Erya2026!",
    auth_provider: str = "password",
    google_sub: Optional[str] = None,
) -> UserAuthAccount:
    acc = db.query(UserAuthAccount).filter(UserAuthAccount.user_id == user.id).first()
    if acc:
        if not user.email:
            user.email = acc.email
        return acc

    preset = SEEDED_USER_IDENTITIES.get(user.full_name)
    base_uname = (
        desired_username
        or (preset[0] if preset else None)
        or (user.email.split("@")[0] if user.email and "@" in user.email else None)
        or _slugify_tr(user.full_name)
    )
    base_email = (
        desired_email
        or user.email
        or (preset[1] if preset else None)
        or f"{_slugify_tr(user.full_name)}@eryapilates.com"
    )

    final_uname = _unique_username(db, base_uname, exclude_user_id=user.id)
    final_email = _unique_email(db, base_email, exclude_user_id=user.id)

    user.email = final_email
    acc = UserAuthAccount(
        user_id=user.id,
        username=final_uname,
        email=final_email,
        password_hash=_hash_password(raw_password or "Erya2026!"),
        google_sub=google_sub,
        auth_provider=auth_provider,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    db.add(acc)
    db.flush()
    return acc


def _get_or_create_panel_settings(db: Session) -> PanelSetting:
    ps = db.query(PanelSetting).order_by(PanelSetting.id.asc()).first()
    if not ps:
        ps = PanelSetting(
            admin_panel_enabled=True,
            trainer_panel_enabled=True,
            member_panel_enabled=True,
            default_landing_panel="admin",
            allow_google_login=True,
            allow_member_booking=True,
            allow_package_purchase=True,
            studio_banner_enabled=True,
            studio_banner_title="ERYA Pilates & Reformer — Yeni Dönem Kayıtları Aktif",
            studio_banner_message="Kadınlara özel butik Reformer & Cadillac seanslarımız için güncel ders programı yayındadır.",
            updated_at=_now_str(),
        )
        db.add(ps)
        db.flush()
    return ps


def _to_panel_config_out(ps: PanelSetting) -> PanelConfigOut:
    landing = ps.default_landing_panel if ps.default_landing_panel in ("admin", "trainer", "member") else "admin"
    return PanelConfigOut(
        admin_panel_enabled=bool(ps.admin_panel_enabled),
        trainer_panel_enabled=bool(ps.trainer_panel_enabled),
        member_panel_enabled=bool(ps.member_panel_enabled),
        default_landing_panel=landing,  # type: ignore[arg-type]
        allow_google_login=bool(ps.allow_google_login),
        allow_member_booking=bool(ps.allow_member_booking),
        allow_package_purchase=bool(ps.allow_package_purchase),
        studio_banner_enabled=bool(ps.studio_banner_enabled),
        studio_banner_title=ps.studio_banner_title or "",
        studio_banner_message=ps.studio_banner_message or "",
        updated_at=ps.updated_at or _now_str(),
    )


def ensure_portal_initialized(db: Session) -> None:
    """
    SQLite şema migrasyonlarını çalıştırır, tüm üye/eğitmen kimliklerini (FIT-XXXX + e-posta/şifre)
    hazırlar ve KİŞİSEL VERİ TAŞIMAYAN Tam Yetkili Admin ('admin' / 'admin@eryapilates.com' / 'EryaAdmin2026!')
    hesabını idempotent olarak oluşturur/günceller.
    """
    run_sqlite_schema_migrations(engine)
    dirty = False

    # 0. Admin rolüyle yanlışlıkla oluşturulmuş kişisel User kaydı varsa temizle (zero-profile garantisi)
    stray_admin_users = db.query(User).filter(User.role == "admin").all()
    for su in stray_admin_users:
        db.query(UserAccessCredential).filter(UserAccessCredential.user_id == su.id).delete()
        db.query(UserAuthAccount).filter(UserAuthAccount.user_id == su.id).delete()
        db.delete(su)
        dirty = True

    # 1. Mevcut tüm kullanıcılara benzersiz ERYA-XXXX kodu ve UserAuthAccount ata
    all_users = db.query(User).order_by(User.id.asc()).all()
    existing_creds = {c.user_id: c for c in db.query(UserAccessCredential).all()}
    used_codes = {_compact_code_key(c.access_code) for c in existing_creds.values()}
    existing_auth = {a.user_id: a for a in db.query(UserAuthAccount).all()}
    default_pw_hash = _hash_password("Erya2026!")

    for u in all_users:
        if u.id not in existing_creds:
            base_num = 1000 + u.id
            candidate = f"ERYA-{base_num}"
            while _compact_code_key(candidate) in used_codes:
                base_num += 1
                candidate = f"ERYA-{base_num}"
            cred = UserAccessCredential(
                user_id=u.id,
                access_code=candidate,
                pin_code="1234",
                created_at=_now_str(),
            )
            db.add(cred)
            existing_creds[u.id] = cred
            used_codes.add(_compact_code_key(candidate))
            dirty = True

        if not getattr(u, "policy_version", None):
            u.policy_version = POLICY_VERSION
            dirty = True
        if getattr(u, "policy_accepted", None) is None:
            u.policy_accepted = False
            dirty = True
        if getattr(u, "login_count", None) is None:
            u.login_count = 0
            dirty = True

        if u.id not in existing_auth:
            preset = SEEDED_USER_IDENTITIES.get(u.full_name)
            uname = _unique_username(db, preset[0] if preset else _slugify_tr(u.full_name), exclude_user_id=u.id)
            uemail = _unique_email(
                db,
                u.email or (preset[1] if preset else f"{_slugify_tr(u.full_name)}@eryapilates.com"),
                exclude_user_id=u.id,
            )
            u.email = uemail
            auth_acc = UserAuthAccount(
                user_id=u.id,
                username=uname,
                email=uemail,
                password_hash=default_pw_hash,
                auth_provider="password",
                created_at=_now_str(),
                updated_at=_now_str(),
            )
            db.add(auth_acc)
            db.flush()
            existing_auth[u.id] = auth_acc
            dirty = True
        elif not u.email:
            u.email = existing_auth[u.id].email
            dirty = True

        if not u.referral_code:
            u.referral_code = generate_unique_referral_code(db, u.full_name, exclude_user_id=u.id)
            db.flush()
            dirty = True
        if u.referral_count is None:
            u.referral_count = 0
            dirty = True
        if not u.body_zones:
            u.body_zones = json.dumps(
                infer_default_body_zones(u.full_name, u.notes),
                ensure_ascii=False,
            )
            dirty = True

    # 2. Kişisel bilgi taşımayan Tam Yetkili Admin hesabı ('admin' / 'admin@eryapilates.com' / 'EryaAdmin2026!')
    admin_acc = db.query(AdminAccount).filter(AdminAccount.username == "admin").first()
    if not admin_acc:
        admin_acc = AdminAccount(
            username="admin",
            email="admin@eryapilates.com",
            password="",
            password_hash=_hash_password("EryaAdmin2026!"),
            full_name="Sistem Yöneticisi",
        )
        db.add(admin_acc)
        dirty = True
    else:
        if admin_acc.email != "admin@eryapilates.com":
            admin_acc.email = "admin@eryapilates.com"
            dirty = True
        if admin_acc.full_name != "Sistem Yöneticisi":
            admin_acc.full_name = "Sistem Yöneticisi"
            dirty = True
        if not admin_acc.password_hash or not _verify_password("EryaAdmin2026!", admin_acc.password_hash):
            admin_acc.password_hash = _hash_password("EryaAdmin2026!")
            admin_acc.password = ""
            dirty = True

    # 3. Panel yapılandırması singleton kaydı
    if db.query(PanelSetting).count() == 0:
        _get_or_create_panel_settings(db)
        dirty = True

    # 4. Örnek Instagram / WhatsApp / Manuel Veri Çekme Kayıtları
    if db.query(DataIntakeLog).count() == 0:
        user_by_name = {u.full_name: u for u in all_users}
        zeynep = user_by_name.get("Zeynep Kaya")
        elif_u = user_by_name.get("Elif Şahin")
        defne = user_by_name.get("Defne Yıldız")

        zeynep_code = existing_creds[zeynep.id].access_code if zeynep and zeynep.id in existing_creds else "FIT-1004"
        elif_code = existing_creds[elif_u.id].access_code if elif_u and elif_u.id in existing_creds else "FIT-1005"
        defne_code = existing_creds[defne.id].access_code if defne and defne.id in existing_creds else "FIT-1006"

        now_dt = datetime.now()
        t1 = (now_dt - timedelta(minutes=42)).strftime("%Y-%m-%d %H:%M:%S")
        t2 = (now_dt - timedelta(minutes=25)).strftime("%Y-%m-%d %H:%M:%S")
        t3 = (now_dt - timedelta(minutes=11)).strftime("%Y-%m-%d %H:%M:%S")

        seed_logs = [
            DataIntakeLog(
                source="instagram",
                sender_name=zeynep.full_name if zeynep else "Zeynep Kaya",
                sender_contact=zeynep.instagram_handle if zeynep and zeynep.instagram_handle else "@zeynepkaya",
                message_or_payload="Seher Hocam yarın 19:00 Grup Reformer seansına yer var mı? Bel hassasiyetim için hafif yay çalışalım.",
                target_department="booking",
                routed_user_id=zeynep.id if zeynep else None,
                assigned_access_code=zeynep_code,
                action_summary=f"@eryapilatesreformer DM çekildi -> {zeynep_code} üye eşleşti, seans talebi ve bel hassasiyeti işlendi.",
                created_at=t1,
            ),
            DataIntakeLog(
                source="whatsapp",
                sender_name=elif_u.full_name if elif_u else "Elif Şahin",
                sender_contact=elif_u.phone if elif_u else "0505 731 92 44",
                message_or_payload="Merhaba, masa başı boyun gerginliğim arttı. Selin Hoca'nın Cadillac seansı ekranına not düşebilir misiniz?",
                target_department="trainer_note",
                routed_user_id=elif_u.id if elif_u else None,
                assigned_access_code=elif_code,
                action_summary=f"WhatsApp (0551 497 90 09) -> {elif_code} üyesinin postür notu Eğitmen Yoklama ekranına iletildi.",
                created_at=t2,
            ),
            DataIntakeLog(
                source="manual",
                sender_name=defne.full_name if defne else "Defne Yıldız",
                sender_contact=defne.phone if defne else "0533 210 34 11",
                message_or_payload="Eryaman Port AVM resepsiyon kaydı: 8 Seans Düet Reformer Paketi ve sağ omuz mobilite notu tanımlandı.",
                target_department="member_registry",
                routed_user_id=defne.id if defne else None,
                assigned_access_code=defne_code,
                action_summary=f"Stüdyo Kayıt -> Üye sicili ve {defne_code} dijital giriş kimliği aktif edildi.",
                created_at=t3,
            ),
        ]
        db.add_all(seed_logs)
        dirty = True

    if dirty:
        db.commit()


# ============================================================================
# OTURUM (BEARER TOKEN) YÖNETİMİ & YETKİLENDİRME
# ============================================================================


def _issue_session(
    db: Session,
    account_type: Literal["admin", "user"],
    role: Literal["admin", "trainer", "member"],
    auth_provider: str = "password",
    admin_id: Optional[int] = None,
    user_id: Optional[int] = None,
    ttl_days: int = 30,
) -> AuthSession:
    token = f"erya_sess_{secrets.token_urlsafe(32)}"
    now = datetime.now()
    expires = (now + timedelta(days=ttl_days)).strftime("%Y-%m-%d %H:%M:%S")
    sess = AuthSession(
        token=token,
        account_type=account_type,
        admin_id=admin_id,
        user_id=user_id,
        role=role,
        auth_provider=auth_provider,
        created_at=now.strftime("%Y-%m-%d %H:%M:%S"),
        expires_at=expires,
        is_revoked=False,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess


def _build_admin_session_out(admin_acc: AdminAccount, sess: AuthSession, message: str = "Giriş başarılı.") -> AuthSessionOut:
    """
    Zero-Profile Admin yanıtı: hiçbir kişisel üye paketi, kredi, sakatlık notu,
    telefon veya eğitmen biyografisi taşımaz; tüm panellere erişim yetkisi taşır.
    """
    return AuthSessionOut(
        authenticated=True,
        token=sess.token,
        token_type="Bearer",
        expires_at=sess.expires_at,
        auth_provider=sess.auth_provider,
        account_type="admin",
        id=None,
        user_id=None,
        admin_id=admin_acc.id,
        role="admin",
        username=admin_acc.username,
        email=admin_acc.email or "admin@eryapilates.com",
        full_name=admin_acc.full_name or "Sistem Yöneticisi",
        phone="",
        instagram_handle=None,
        avatar_url=None,
        access_code=None,
        has_personal_profile=False,
        is_admin=True,
        available_panels=["admin", "trainer", "member"],
        default_panel="admin",
        specialty=None,
        notes=None,
        package_name=None,
        remaining_credits=None,
        total_credits=None,
        policy_accepted=True,
        policy_accepted_at=None,
        policy_version=POLICY_VERSION,
        last_login_at=_now_str(),
        login_count=1,
        message=message,
    )


def _build_user_session_out(db: Session, user: User, sess: AuthSession, message: str = "Giriş başarılı.") -> AuthSessionOut:
    cred = _ensure_user_credential(db, user)
    auth_acc = _ensure_user_auth_account(db, user)
    pkg = _get_active_package(db, user.id) if user.role == "member" else None
    role_lit: Literal["trainer", "member"] = "trainer" if user.role == "trainer" else "member"

    return AuthSessionOut(
        authenticated=True,
        token=sess.token,
        token_type="Bearer",
        expires_at=sess.expires_at,
        auth_provider=sess.auth_provider,
        account_type="user",
        id=user.id,
        user_id=user.id,
        admin_id=None,
        role=role_lit,
        username=auth_acc.username,
        email=auth_acc.email,
        full_name=user.full_name,
        phone=user.phone or "",
        instagram_handle=user.instagram_handle,
        avatar_url=user.avatar_url,
        access_code=cred.access_code,
        has_personal_profile=True,
        is_admin=False,
        available_panels=[role_lit],
        default_panel=role_lit,
        specialty=user.specialty if user.role == "trainer" else None,
        notes=user.notes or "",
        package_name=pkg.package_name if pkg else None,
        remaining_credits=pkg.remaining_credits if pkg else (0 if user.role == "member" else None),
        total_credits=pkg.total_credits if pkg else (0 if user.role == "member" else None),
        policy_accepted=bool(getattr(user, "policy_accepted", False)),
        policy_accepted_at=getattr(user, "policy_accepted_at", None),
        policy_version=getattr(user, "policy_version", None) or POLICY_VERSION,
        last_login_at=getattr(user, "last_login_at", None),
        login_count=int(getattr(user, "login_count", 0) or 0),
        message=message,
    )


def _extract_bearer_token(
    authorization: Optional[str] = None,
    x_admin_token: Optional[str] = None,
    query_token: Optional[str] = None,
) -> Optional[str]:
    if authorization:
        raw = authorization.strip()
        if raw.lower().startswith("bearer "):
            return raw[7:].strip()
        if raw:
            return raw
    if x_admin_token and x_admin_token.strip():
        return x_admin_token.strip()
    if query_token and query_token.strip():
        return query_token.strip()
    return None


def get_current_auth_session(
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> AuthSession:
    ensure_portal_initialized(db)
    raw_token = _extract_bearer_token(authorization, x_admin_token, token)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Oturum anahtarı (Bearer token) bulunamadı. Lütfen giriş yapın.")

    sess = db.query(AuthSession).filter(AuthSession.token == raw_token).first()
    if not sess or sess.is_revoked:
        raise HTTPException(status_code=401, detail="Oturum geçersiz veya sonlandırılmış. Lütfen tekrar giriş yapın.")

    if sess.expires_at < _now_str():
        sess.is_revoked = True
        db.commit()
        raise HTTPException(status_code=401, detail="Oturum süresi dolmuş. Lütfen tekrar giriş yapın.")

    return sess


def require_admin(
    sess: AuthSession = Depends(get_current_auth_session),
    db: Session = Depends(get_db),
) -> AdminAccount:
    if sess.role != "admin" or sess.account_type != "admin":
        raise HTTPException(
            status_code=403,
            detail="Bu işlem yalnızca Sistem Yöneticisi (Admin) yetkisiyle gerçekleştirilebilir.",
        )
    admin_acc = db.query(AdminAccount).filter(AdminAccount.id == sess.admin_id).first()
    if not admin_acc:
        admin_acc = db.query(AdminAccount).filter(AdminAccount.username == "admin").first()
    if not admin_acc:
        raise HTTPException(status_code=401, detail="Yönetici hesabı doğrulanamadı.")
    return admin_acc


def _resolve_user_by_code_or_identifier(
    db: Session, raw_input: str, allow_phone_and_handle: bool = False
) -> Optional[User]:
    cleaned = (raw_input or "").strip()
    if not cleaned:
        return None

    lower = cleaned.lower()
    upper = cleaned.upper()

    # 0. E-posta veya kullanıcı adı eşleşmesi
    if allow_phone_and_handle:
        auth_acc = (
            db.query(UserAuthAccount)
            .filter((UserAuthAccount.email == lower) | (UserAuthAccount.username == lower))
            .first()
        )
        if auth_acc:
            u = db.query(User).filter(User.id == auth_acc.user_id).first()
            if u:
                return u
        u_by_email = db.query(User).filter(User.email == lower).first()
        if u_by_email:
            return u_by_email

    # 1. Doğrudan FIT-XXXX eşleşmesi
    normalized_fit = upper
    fit_no_dash = re.match(r"^FIT(\d+)$", upper)
    if fit_no_dash:
        normalized_fit = f"FIT-{fit_no_dash.group(1)}"

    cred = (
        db.query(UserAccessCredential)
        .filter(UserAccessCredential.access_code == normalized_fit)
        .first()
    )
    if cred:
        return db.query(User).filter(User.id == cred.user_id).first()

    # 2. Sayısal giriş
    if cleaned.isdigit() and len(cleaned) <= 6:
        num = int(cleaned)
        if num >= 1000:
            cred_by_num = (
                db.query(UserAccessCredential)
                .filter(UserAccessCredential.access_code == f"FIT-{num}")
                .first()
            )
            if cred_by_num:
                return db.query(User).filter(User.id == cred_by_num.user_id).first()
            candidate_uid = num - 1000
            user_obj = db.query(User).filter(User.id == candidate_uid).first()
            if user_obj:
                return user_obj
        else:
            user_obj = db.query(User).filter(User.id == num).first()
            if user_obj:
                return user_obj

    if not allow_phone_and_handle:
        return None

    # 3. Instagram handle eşleşmesi
    norm_handle = normalize_handle(cleaned)
    all_users = db.query(User).all()
    if cleaned.startswith("@") or re.match(r"^[a-zA-Z0-9._]+$", cleaned):
        for u in all_users:
            if u.instagram_handle and normalize_handle(u.instagram_handle) == norm_handle:
                return u

    # 4. Telefon numarası eşleşmesi
    input_digits = _normalize_phone_digits(cleaned)
    if len(input_digits) >= 7:
        for u in all_users:
            u_digits = _normalize_phone_digits(u.phone)
            if u_digits and (u_digits == input_digits or u_digits.endswith(input_digits)):
                return u

    return None


# ============================================================================
# /auth/* ENDPOINT'LERİ (LOGIN, REGISTER, ME, LOGOUT, GOOGLE OAUTH)
# ============================================================================


@auth_router.post("/login", response_model=AuthSessionOut)
def auth_login(payload: AuthLoginRequest, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    raw_ident = (payload.identifier or payload.email or payload.username or "").strip()
    raw_pw = (payload.password or "").strip()

    if not raw_ident or not raw_pw:
        raise HTTPException(status_code=400, detail="E-posta/kullanıcı adı ve şifre alanları zorunludur.")

    ident_lower = raw_ident.lower()

    # 1. Zero-Profile Sistem Yöneticisi (Admin) kontrolü
    admin_acc = (
        db.query(AdminAccount)
        .filter(
            (AdminAccount.username == ident_lower)
            | (AdminAccount.email == ident_lower)
        )
        .first()
    )
    if admin_acc:
        valid_admin_pw = _verify_password(raw_pw, admin_acc.password_hash) or (
            bool(admin_acc.password) and hmac.compare_digest(raw_pw, admin_acc.password)
        )
        if not valid_admin_pw:
            raise HTTPException(status_code=401, detail="Yönetici kullanıcı adı veya şifre hatalı.")

        sess = _issue_session(
            db,
            account_type="admin",
            role="admin",
            auth_provider="password",
            admin_id=admin_acc.id,
        )
        return _build_admin_session_out(admin_acc, sess, message="Sistem Yönetim Merkezine hoş geldiniz.")

    # 2. Eğitmen / Müşteri kontrolü
    user = _resolve_user_by_code_or_identifier(db, raw_ident, allow_phone_and_handle=True)
    if not user:
        raise HTTPException(status_code=401, detail="Girdiğiniz bilgilere ait bir hesap bulunamadı.")

    auth_acc = _ensure_user_auth_account(db, user)
    cred = _ensure_user_credential(db, user)

    pw_ok = _verify_password(raw_pw, auth_acc.password_hash) or hmac.compare_digest(raw_pw, cred.pin_code)
    if not pw_ok:
        raise HTTPException(status_code=401, detail="E-posta/kullanıcı adı veya şifre hatalı.")

    role_lit: Literal["trainer", "member"] = "trainer" if user.role == "trainer" else "member"
    user.last_login_at = _now_str()
    user.login_count = int(user.login_count or 0) + 1
    db.flush()
    sess = _issue_session(
        db,
        account_type="user",
        role=role_lit,
        auth_provider="password",
        user_id=user.id,
    )
    return _build_user_session_out(db, user, sess, message=f"Hoş geldiniz, {user.full_name}!")


def _resolve_user_by_access_code(db: Session, raw_code: str) -> Optional[User]:
    """
    Büyük/küçük harf, boşluk ve tire duyarsız olarak UserAccessCredential.access_code
    (veya FIT-{1000+user.id} / ERYA-{1000+user.id} eşleşmesi) üzerinden üye/eğitmen bulur.
    """
    cleaned = (raw_code or "").strip()
    if not cleaned:
        return None

    target_compact = _compact_code_key(cleaned)
    if not target_compact:
        return None

    # 1. Doğrudan UserAccessCredential tablosundan (case/space/dash duyarsız) eşleştir
    all_creds = db.query(UserAccessCredential).all()
    for cred in all_creds:
        if cred.access_code and _compact_code_key(cred.access_code) == target_compact:
            user_obj = db.query(User).filter(User.id == cred.user_id).first()
            if user_obj:
                return user_obj

    # 2. FIT-{1000+user.id} veya ERYA-{1000+user.id} uyumluluk eşleşmesi
    m = re.match(r"^(?:FIT|ERYA)(\d+)$", target_compact)
    if m:
        num = int(m.group(1))
        if num >= 1000:
            candidate_uid = num - 1000
            user_obj = db.query(User).filter(User.id == candidate_uid).first()
            if user_obj:
                return user_obj

    return None


@auth_router.post("/code-login", response_model=AuthSessionOut)
def auth_code_login(payload: CodeLoginRequest, db: Session = Depends(get_db)):
    """
    Yalnızca Admin tarafından üretilen kişiye özel erişim kodu ile giriş (kayıt olma yok).
    'admin' kodu ile doğrudan yönetici oturumu açılabilir.
    """
    ensure_portal_initialized(db)
    raw_code = (payload.access_code or "").strip()
    if not raw_code:
        raise HTTPException(
            status_code=400,
            detail="Lütfen stüdyo yöneticinizden aldığınız kişisel erişim kodunu girin.",
        )

    if raw_code.lower() == "admin":
        admin = (
            db.query(AdminAccount).filter(AdminAccount.username == "admin").first()
            or db.query(AdminAccount).first()
        )
        if not admin:
            raise HTTPException(
                status_code=500,
                detail="Yönetici hesabı bulunamadı.",
            )
        sess = _issue_session(
            db,
            account_type="admin",
            role="admin",
            auth_provider="access_code",
            admin_id=admin.id,
        )
        return _build_admin_session_out(admin, sess, message="Yönetici paneline hoş geldiniz!")

    user = _resolve_user_by_access_code(db, raw_code)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz erişim kodu. Lütfen size özel tanımlanan kodu kontrol edin veya stüdyo yönetimi ile iletişime geçin.",
        )

    user.last_login_at = _now_str()
    user.login_count = int(user.login_count or 0) + 1
    db.flush()

    role_lit: Literal["trainer", "member"] = "trainer" if user.role == "trainer" else "member"
    sess = _issue_session(
        db,
        account_type="user",
        role=role_lit,
        auth_provider="access_code",
        user_id=user.id,
    )
    return _build_user_session_out(db, user, sess, message=f"Hoş geldiniz, {user.full_name}!")


@auth_router.post("/register", response_model=AuthSessionOut)
def auth_register(payload: AuthRegisterRequest, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    full_name = (payload.full_name or "").strip()
    email = (payload.email or "").strip().lower()
    password = (payload.password or "").strip()
    phone = (payload.phone or "").strip() or "0500 000 00 00"

    if not full_name:
        raise HTTPException(status_code=400, detail="Ad Soyad zorunludur.")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi girin.")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Şifre en az 4 karakter olmalıdır.")
    if email == "admin@eryapilates.com" or db.query(UserAuthAccount).filter(UserAuthAccount.email == email).first():
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlıdır.")

    ig = normalize_handle(payload.instagram_handle) if payload.instagram_handle else None
    new_user = User(
        full_name=full_name,
        email=email,
        phone=phone,
        role="member",
        instagram_handle=ig,
        notes="",
        streak_days=0,
        body_zones=json.dumps(infer_default_body_zones(full_name, ""), ensure_ascii=False),
        referral_count=0,
    )
    db.add(new_user)
    db.flush()
    new_user.referral_code = generate_unique_referral_code(db, full_name, exclude_user_id=new_user.id)
    db.flush()

    _ensure_user_credential(db, new_user)
    _ensure_user_auth_account(
        db,
        new_user,
        desired_username=email.split("@")[0],
        desired_email=email,
        raw_password=password,
        auth_provider="password",
    )

    referral_applied = False
    raw_ref = (payload.referral_code or "").strip()
    if raw_ref:
        clean_ref = normalize_referral_code_input(raw_ref)
        if clean_ref:
            inviter = (
                db.query(User)
                .filter(User.referral_code == clean_ref, User.id != new_user.id)
                .first()
            )
            if inviter:
                inviter.referral_count = (inviter.referral_count or 0) + 1
                grant_bonus_credit_to_member(
                    db,
                    inviter.id,
                    credits_to_add=1,
                    fallback_package_name="Arkadaş Daveti Hediye Paketi",
                )
                grant_bonus_credit_to_member(
                    db,
                    new_user.id,
                    credits_to_add=1,
                    fallback_package_name="Hoş Geldin Hediye Ders Paketi",
                )
                referral_applied = True

    db.commit()
    db.refresh(new_user)

    sess = _issue_session(db, account_type="user", role="member", auth_provider="password", user_id=new_user.id)
    welcome_msg = (
        f"🎉 Hesabınız oluşturuldu ve davet koduyla +1 Hediye Ders paketinize tanımlandı, hoş geldiniz {new_user.full_name}!"
        if referral_applied
        else f"Hesabınız oluşturuldu, hoş geldiniz {new_user.full_name}!"
    )
    return _build_user_session_out(db, new_user, sess, message=welcome_msg)


def _remove_signed_policy_files(
    policy_file_path: Optional[str],
    user_id: Optional[int] = None,
) -> None:
    if policy_file_path:
        try:
            safe_name = Path(policy_file_path).name
            if safe_name:
                txt_path = SIGNED_POLICIES_DIR / safe_name
                if txt_path.is_file():
                    txt_path.unlink()
                json_path = txt_path.with_suffix(".json")
                if json_path.is_file():
                    json_path.unlink()
        except OSError:
            pass

    if user_id is not None and SIGNED_POLICIES_DIR.is_dir():
        for pattern in (
            f"sozlesme_user_{user_id}_*.txt",
            f"sozlesme_user_{user_id}_*.json",
        ):
            for fp in SIGNED_POLICIES_DIR.glob(pattern):
                try:
                    if fp.is_file():
                        fp.unlink()
                except OSError:
                    pass


def _permanently_delete_user(db: Session, user: User) -> Tuple[int, Optional[str]]:
    """
    Kullanıcıya (member veya trainer) bağlı tüm kayıtları foreign-key güvenli sırada
    atomik transaction içinde siler ve aktif randevuların ders kontenjanlarını günceller.
    Commit çağıran tarafından yapılır.
    """
    user_id = user.id
    policy_file_path = getattr(user, "policy_file_path", None)

    # Kullanıcının e-posta, google_sub ve oturum token bilgilerini OAuth state temizliği için topla
    user_emails = set()
    if user.email and user.email.strip():
        user_emails.add(user.email.strip().lower())
    auth_acc = db.query(UserAuthAccount).filter(UserAuthAccount.user_id == user_id).first()
    google_sub: Optional[str] = None
    if auth_acc:
        if auth_acc.email and auth_acc.email.strip():
            user_emails.add(auth_acc.email.strip().lower())
        if auth_acc.google_sub and auth_acc.google_sub.strip():
            google_sub = auth_acc.google_sub.strip()

    user_session_tokens = [
        row[0]
        for row in db.query(AuthSession.token).filter(AuthSession.user_id == user_id).all()
        if row[0]
    ]
    member_package_ids = [
        row[0]
        for row in db.query(MemberPackage.id).filter(MemberPackage.member_id == user_id).all()
    ]

    # 1. Üyenin aktif 'booked' rezervasyonları için ders kontenjanlarını (current_enrolled) düşür
    active_member_bookings = (
        db.query(Booking)
        .filter(Booking.member_id == user_id, Booking.status == "booked")
        .all()
    )
    for booking in active_member_bookings:
        class_sess = db.query(ClassSession).filter(ClassSession.id == booking.session_id).first()
        if class_sess:
            class_sess.current_enrolled = max(0, (class_sess.current_enrolled or 0) - 1)

    # 2. Kullanıcıya eğitmen olarak bağlı dersler varsa, diğer üyelerin aktif kredilerini iade et ve dersleri temizle
    trainer_sessions = db.query(ClassSession).filter(ClassSession.trainer_id == user_id).all()
    trainer_session_ids: List[int] = [ts.id for ts in trainer_sessions]
    if trainer_session_ids:
        other_active_bookings = (
            db.query(Booking)
            .filter(
                Booking.session_id.in_(trainer_session_ids),
                Booking.status == "booked",
                Booking.member_id != user_id,
            )
            .all()
        )
        for tb in other_active_bookings:
            pkg = db.query(MemberPackage).filter(MemberPackage.id == tb.package_id).first()
            if pkg:
                pkg.remaining_credits = max(0, (pkg.remaining_credits or 0) + 1)

    # ORM güncellemelerini toplu silmelerden önce transaction içine flush et
    db.flush()

    # 3. Eğitmen derslerine bağlı bekleme listesi, randevu ve ders kayıtlarını sil
    if trainer_session_ids:
        db.query(Waitlist).filter(Waitlist.session_id.in_(trainer_session_ids)).delete(
            synchronize_session=False
        )
        db.query(Booking).filter(Booking.session_id.in_(trainer_session_ids)).delete(
            synchronize_session=False
        )
        db.query(ClassSession).filter(ClassSession.id.in_(trainer_session_ids)).delete(
            synchronize_session=False
        )

    # 4. Kullanıcıya ait tüm bağımlı kayıtları child -> parent sırasında sil
    if member_package_ids:
        db.query(PaymentCheckoutSession).filter(
            (PaymentCheckoutSession.member_id == user_id)
            | (PaymentCheckoutSession.credited_package_id.in_(member_package_ids))
        ).delete(synchronize_session=False)
        db.query(PaymentTransaction).filter(
            (PaymentTransaction.member_id == user_id)
            | (PaymentTransaction.member_package_id.in_(member_package_ids))
        ).delete(synchronize_session=False)
        db.query(Booking).filter(
            (Booking.member_id == user_id)
            | (Booking.package_id.in_(member_package_ids))
        ).delete(synchronize_session=False)
    else:
        db.query(PaymentCheckoutSession).filter(PaymentCheckoutSession.member_id == user_id).delete(
            synchronize_session=False
        )
        db.query(PaymentTransaction).filter(PaymentTransaction.member_id == user_id).delete(
            synchronize_session=False
        )
        db.query(Booking).filter(Booking.member_id == user_id).delete(synchronize_session=False)
    db.query(Waitlist).filter(Waitlist.member_id == user_id).delete(synchronize_session=False)
    db.query(BodyMetrics).filter(BodyMetrics.member_id == user_id).delete(synchronize_session=False)
    db.query(DailyWellness).filter(DailyWellness.member_id == user_id).delete(
        synchronize_session=False
    )
    db.query(NutritionMealLog).filter(NutritionMealLog.member_id == user_id).delete(
        synchronize_session=False
    )
    db.query(MemberPackage).filter(MemberPackage.member_id == user_id).delete(
        synchronize_session=False
    )
    db.query(DataIntakeLog).filter(DataIntakeLog.routed_user_id == user_id).delete(
        synchronize_session=False
    )
    if user_emails:
        db.query(GoogleOAuthState).filter(GoogleOAuthState.email.in_(list(user_emails))).delete(
            synchronize_session=False
        )
    if google_sub:
        db.query(GoogleOAuthState).filter(GoogleOAuthState.google_sub == google_sub).delete(
            synchronize_session=False
        )
    if user_session_tokens:
        db.query(GoogleOAuthState).filter(
            GoogleOAuthState.session_token.in_(user_session_tokens)
        ).delete(synchronize_session=False)
    db.query(AuthSession).filter(AuthSession.user_id == user_id).delete(synchronize_session=False)
    db.query(UserAuthAccount).filter(UserAuthAccount.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(UserAccessCredential).filter(UserAccessCredential.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)

    return user_id, policy_file_path


@auth_router.get("/me", response_model=AuthSessionOut)
def auth_me(
    sess: AuthSession = Depends(get_current_auth_session),
    db: Session = Depends(get_db),
):
    if sess.account_type == "admin" or sess.role == "admin":
        admin_acc = db.query(AdminAccount).filter(AdminAccount.id == sess.admin_id).first()
        if not admin_acc:
            admin_acc = db.query(AdminAccount).filter(AdminAccount.username == "admin").first()
        if not admin_acc:
            raise HTTPException(status_code=401, detail="Yönetici oturumu bulunamadı.")
        return _build_admin_session_out(admin_acc, sess, message="Yönetici oturumu aktif.")

    user = db.query(User).filter(User.id == sess.user_id).first()
    if not user:
        sess.is_revoked = True
        db.commit()
        raise HTTPException(status_code=401, detail="Kullanıcı kaydı bulunamadı.")

    return _build_user_session_out(db, user, sess, message="Oturum aktif.")


@auth_router.delete("/me", response_model=AuthDeleteAccountOut)
def auth_delete_me(
    sess: AuthSession = Depends(get_current_auth_session),
    db: Session = Depends(get_db),
):
    """
    Apple App Store Guideline 5.1.1(v) ve 6698 sayılı KVKK uyarınca kimliği doğrulanmış
    kullanıcının kendi hesabını ve ilişkili kişisel verilerini kalıcı olarak siler.
    """
    if sess.account_type == "admin" or sess.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Sistem yöneticisi hesapları bu uç nokta üzerinden silinemez.",
        )

    user = db.query(User).filter(User.id == sess.user_id).first()
    if not user:
        sess.is_revoked = True
        db.commit()
        raise HTTPException(status_code=401, detail="Kullanıcı kaydı bulunamadı.")

    try:
        deleted_user_id, policy_file_path = _permanently_delete_user(db, user)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Hesap silme işlemi sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
        ) from exc

    _remove_signed_policy_files(policy_file_path, user_id=deleted_user_id)

    return AuthDeleteAccountOut(
        deleted=True,
        user_id=deleted_user_id,
        message="Hesabınız ve ilişkili kişisel verileriniz kalıcı olarak silindi.",
    )


@auth_router.post("/logout", response_model=AuthLogoutOut)
def auth_logout(
    payload: Optional[AuthLogoutRequest] = None,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    body_tok = payload.token if payload else None
    raw_token = _extract_bearer_token(authorization, x_admin_token, body_tok)
    if raw_token:
        sess = db.query(AuthSession).filter(AuthSession.token == raw_token).first()
        if sess and not sess.is_revoked:
            sess.is_revoked = True
            db.commit()
    return AuthLogoutOut(logged_out=True, message="Oturum güvenli şekilde kapatıldı.")


@auth_router.get("/panel-config", response_model=PanelConfigOut)
def get_public_panel_config(db: Session = Depends(get_db)):
    ensure_portal_initialized(db)
    ps = _get_or_create_panel_settings(db)
    db.commit()
    return _to_panel_config_out(ps)


def _find_or_create_google_user(
    db: Session,
    email: str,
    full_name: Optional[str],
    google_sub: Optional[str],
    avatar_url: Optional[str],
    verified_google_token: bool = False,
) -> User:
    clean_email = email.strip().lower()
    if clean_email == "admin@eryapilates.com":
        raise HTTPException(
            status_code=403,
            detail="Sistem Yöneticisi hesabı yalnızca güvenli yönetici kimlik bilgileriyle açılabilir.",
        )

    auth_acc = None
    if google_sub:
        auth_acc = db.query(UserAuthAccount).filter(UserAuthAccount.google_sub == google_sub).first()
    if not auth_acc:
        auth_acc = db.query(UserAuthAccount).filter(UserAuthAccount.email == clean_email).first()

    if auth_acc:
        user = db.query(User).filter(User.id == auth_acc.user_id).first()
        if user:
            if google_sub and not auth_acc.google_sub:
                auth_acc.google_sub = google_sub
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url
            auth_acc.updated_at = _now_str()
            db.commit()
            db.refresh(user)
            return user

    user_by_email = db.query(User).filter(User.email == clean_email).first()
    if user_by_email:
        acc = _ensure_user_auth_account(
            db,
            user_by_email,
            desired_email=clean_email,
            auth_provider="google",
            google_sub=google_sub,
        )
        if google_sub:
            acc.google_sub = google_sub
        if avatar_url and not user_by_email.avatar_url:
            user_by_email.avatar_url = avatar_url
        db.commit()
        db.refresh(user_by_email)
        return user_by_email

    derived_name = (full_name or "").strip()
    if not derived_name:
        local = clean_email.split("@")[0].replace(".", " ").replace("_", " ").strip()
        derived_name = local.title() or "Google Üyesi"

    new_user = User(
        full_name=derived_name,
        email=clean_email,
        phone="0500 000 00 00",
        role="member",
        avatar_url=avatar_url,
        notes="Google hesabı ile hızlı giriş yapıldı.",
        streak_days=1,
    )
    db.add(new_user)
    db.flush()

    _ensure_user_credential(db, new_user)
    _ensure_user_auth_account(
        db,
        new_user,
        desired_username=clean_email.split("@")[0],
        desired_email=clean_email,
        raw_password=secrets.token_urlsafe(16),
        auth_provider="google",
        google_sub=google_sub,
    )
    db.commit()
    db.refresh(new_user)
    return new_user


def _decode_jwt_payload_unverified(jwt_token: str) -> Optional[dict]:
    parts = jwt_token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload_b64 = parts[1]
        pad = "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(payload_b64 + pad).decode("utf-8")
        data = json.loads(decoded)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


@auth_router.get("/google/url", response_model=GoogleAuthUrlOut)
def get_google_oauth_url(
    request: Request,
    redirect_uri: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    ps = _get_or_create_panel_settings(db)
    if not ps.allow_google_login:
        raise HTTPException(status_code=403, detail="Google ile giriş yönetici tarafından geçici olarak kapatılmıştır.")

    state = f"erya_gstate_{secrets.token_urlsafe(20)}"
    now = datetime.now()
    oauth_state = GoogleOAuthState(
        state=state,
        redirect_uri=redirect_uri,
        is_used=False,
        created_at=now.strftime("%Y-%m-%d %H:%M:%S"),
        expires_at=(now + timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S"),
    )
    db.add(oauth_state)
    db.commit()

    base_url = _derive_base_url(request)
    google_client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    google_client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()

    if google_client_id and google_client_secret:
        callback_uri = f"{base_url}/auth/google/callback"
        params = urlencode(
            {
                "client_id": google_client_id,
                "redirect_uri": callback_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "prompt": "select_account",
            }
        )
        return GoogleAuthUrlOut(
            auth_url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}",
            state=state,
            provider="google",
            client_id_configured=True,
        )

    params_dict = {"state": state}
    if redirect_uri:
        params_dict["redirect_uri"] = redirect_uri
    hosted_url = f"{base_url}/auth/google/authorize?{urlencode(params_dict)}"
    return GoogleAuthUrlOut(
        auth_url=hosted_url,
        state=state,
        provider="google",
        client_id_configured=False,
    )


@auth_router.get("/google/authorize", response_class=HTMLResponse)
def google_hosted_authorize_page(
    request: Request,
    state: Optional[str] = Query(default=None),
    redirect_uri: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    if not state:
        state = f"erya_gstate_{secrets.token_urlsafe(20)}"
        now = datetime.now()
        db.add(
            GoogleOAuthState(
                state=state,
                redirect_uri=redirect_uri,
                is_used=False,
                created_at=now.strftime("%Y-%m-%d %H:%M:%S"),
                expires_at=(now + timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S"),
            )
        )
        db.commit()

    show_quick_accounts = os.getenv("AUTH_SHOW_QUICK_ACCOUNTS", "0").strip() == "1"
    account_buttons_html = ""
    if show_quick_accounts:
        quick_members = (
            db.query(User)
            .filter(User.role == "member", User.email.isnot(None))
            .order_by(User.id.desc())
            .limit(5)
            .all()
        )
        for m in quick_members:
            m_email = html.escape(m.email or "")
            m_name = html.escape(m.full_name)
            initial = html.escape((m.full_name or "U")[0].upper())
            account_buttons_html += f"""
        <button type="button" class="acc-row" onclick="pickAccount('{m_email}', '{m_name}')">
          <div class="avatar">{initial}</div>
          <div class="acc-meta">
            <div class="acc-name">{m_name}</div>
            <div class="acc-email">{m_email}</div>
          </div>
        </button>
        """
    quick_section_html = (
        f'<div class="acc-list">{account_buttons_html}</div>'
        '<div class="divider">veya başka bir Google hesabı kullanın</div>'
        if account_buttons_html
        else ""
    )

    safe_state = html.escape(state)
    safe_redirect = html.escape(redirect_uri or "")

    html_doc = f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google ile Oturum Açın — ERYA Pilates</title>
  <style>
    * {{ box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
    body {{ margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #0f172a; padding: 16px; }}
    .card {{ width: 100%; max-width: 420px; background: #ffffff; border-radius: 20px; padding: 32px 28px; box-shadow: 0 24px 60px rgba(0,0,0,0.45); }}
    .g-badge {{ display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; color: #3c4043; margin-bottom: 12px; }}
    .g-dot {{ width: 10px; height: 10px; border-radius: 50%; background: #4285F4; box-shadow: 14px 0 0 #EA4335, 28px 0 0 #FBBC05, 42px 0 0 #34A853; margin-right: 44px; }}
    h1 {{ font-size: 22px; margin: 6px 0 6px; color: #202124; font-weight: 600; }}
    p.sub {{ margin: 0 0 20px; font-size: 14px; color: #5f6368; }}
    .acc-list {{ display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }}
    .acc-row {{ display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 1px solid #dadce0; border-radius: 12px; background: #fff; cursor: pointer; text-align: left; transition: background 0.15s, border-color 0.15s; }}
    .acc-row:hover {{ background: #f8f9fa; border-color: #1a73e8; }}
    .avatar {{ width: 36px; height: 36px; border-radius: 50%; background: #1a73e8; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px; flex-shrink: 0; }}
    .acc-name {{ font-size: 14px; font-weight: 600; color: #202124; }}
    .acc-email {{ font-size: 12px; color: #5f6368; }}
    .divider {{ display: flex; align-items: center; gap: 10px; color: #5f6368; font-size: 12px; margin: 16px 0; }}
    .divider::before, .divider::after {{ content: ''; flex: 1; height: 1px; background: #e0e0e0; }}
    label {{ display: block; font-size: 12px; font-weight: 600; color: #3c4043; margin-bottom: 6px; }}
    input {{ width: 100%; padding: 11px 12px; border: 1px solid #dadce0; border-radius: 10px; font-size: 14px; margin-bottom: 12px; outline: none; }}
    input:focus {{ border-color: #1a73e8; box-shadow: 0 0 0 2px rgba(26,115,232,0.18); }}
    .submit-btn {{ width: 100%; padding: 12px 16px; border: none; border-radius: 10px; background: #1a73e8; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }}
    .submit-btn:hover {{ background: #1557b0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="g-badge"><span class="g-dot"></span>Google ile Oturum Açın</div>
    <h1>Bir hesap seçin</h1>
    <p class="sub"><strong>ERYA Pilates &amp; Reformer</strong> uygulamasına devam etmek için Google hesabınızı seçin</p>

    {quick_section_html}

    <form id="gForm" method="POST" action="/auth/google/authorize/complete">
      <input type="hidden" name="state" value="{safe_state}" />
      <input type="hidden" name="redirect_uri" value="{safe_redirect}" />
      <label for="emailInput">Gmail / Google E-posta Adresi</label>
      <input id="emailInput" name="email" type="email" placeholder="ornek@gmail.com" required />
      <label for="nameInput">Ad Soyad (Yeni hesaplar için)</label>
      <input id="nameInput" name="full_name" type="text" placeholder="Adınız Soyadınız" />
      <button type="submit" class="submit-btn">Google ile Devam Et</button>
    </form>
  </div>
  <script>
    function pickAccount(email, name) {{
      document.getElementById('emailInput').value = email;
      document.getElementById('nameInput').value = name;
      document.getElementById('gForm').submit();
    }}
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_doc)


def _complete_google_authorize_html(
    db: Session,
    state: str,
    email: str,
    full_name: Optional[str] = None,
    redirect_uri: Optional[str] = None,
) -> HTMLResponse:
    ensure_portal_initialized(db)
    clean_email = (email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Geçerli bir Google e-posta adresi girin.")

    user = _find_or_create_google_user(
        db,
        email=clean_email,
        full_name=full_name,
        google_sub=f"google_{hashlib.sha256(clean_email.encode()).hexdigest()[:20]}",
        avatar_url=None,
    )
    role_lit: Literal["trainer", "member"] = "trainer" if user.role == "trainer" else "member"
    user.last_login_at = _now_str()
    user.login_count = int(user.login_count or 0) + 1
    db.flush()
    sess = _issue_session(
        db,
        account_type="user",
        role=role_lit,
        auth_provider="google",
        user_id=user.id,
    )

    code = f"erya_gcode_{secrets.token_urlsafe(24)}"
    oauth_row = db.query(GoogleOAuthState).filter(GoogleOAuthState.state == state).first()
    final_redirect = (redirect_uri or (oauth_row.redirect_uri if oauth_row else "") or "").strip()

    if oauth_row:
        oauth_row.code = code
        oauth_row.session_token = sess.token
        oauth_row.email = clean_email
        oauth_row.full_name = user.full_name
        if final_redirect:
            oauth_row.redirect_uri = final_redirect
    else:
        now = datetime.now()
        oauth_row = GoogleOAuthState(
            state=state,
            code=code,
            session_token=sess.token,
            redirect_uri=final_redirect or None,
            email=clean_email,
            full_name=user.full_name,
            is_used=False,
            created_at=now.strftime("%Y-%m-%d %H:%M:%S"),
            expires_at=(now + timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S"),
        )
        db.add(oauth_row)
    db.commit()

    session_out = _build_user_session_out(db, user, sess, message=f"Google ile giriş başarılı: {user.full_name}")
    payload_json = json.dumps(
        {
            "type": "ERYA_GOOGLE_AUTH",
            "provider": "google",
            "token": sess.token,
            "code": code,
            "state": state,
            "session": session_out.model_dump(),
        },
        ensure_ascii=False,
    )

    target_url_js = "null"
    if final_redirect:
        sep = "&" if "?" in final_redirect else "?"
        redir_with_params = f"{final_redirect}{sep}{urlencode({'token': sess.token, 'code': code, 'state': state, 'auth_provider': 'google'})}"
        target_url_js = json.dumps(redir_with_params)

    bridge_html = f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google Girişi Tamamlandı</title>
  <style>
    body {{ margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; text-align: center; }}
    .box {{ max-width: 400px; background: #1e293b; border: 1px solid #334155; border-radius: 18px; padding: 28px 24px; }}
    h2 {{ margin: 0 0 8px; font-size: 20px; color: #34d399; }}
    p {{ margin: 0 0 18px; font-size: 14px; color: #cbd5e1; }}
    a.btn {{ display: inline-block; padding: 11px 20px; border-radius: 10px; background: #10b981; color: #06281e; font-weight: 700; text-decoration: none; font-size: 14px; }}
  </style>
</head>
<body>
  <div class="box">
    <h2>Google ile Giriş Onaylandı</h2>
    <p>Hoş geldiniz, <strong>{html.escape(user.full_name)}</strong>. Uygulamaya yönlendiriliyorsunuz...</p>
    <div id="fallbackLink"></div>
  </div>
  <script>
    (function() {{
      var msg = {payload_json};
      var targetUrl = {target_url_js};
      try {{
        if (window.opener && !window.opener.closed) {{
          window.opener.postMessage(msg, "*");
          setTimeout(function() {{ window.close(); }}, 350);
          return;
        }}
      }} catch (e) {{}}
      if (targetUrl) {{
        var el = document.getElementById("fallbackLink");
        if (el) {{
          el.innerHTML = '<a class="btn" href="' + targetUrl + '">Uygulamaya Dön</a>';
        }}
        window.location.replace(targetUrl);
      }}
    }})();
  </script>
</body>
</html>"""
    return HTMLResponse(content=bridge_html)


@auth_router.post("/google/authorize/complete", response_class=HTMLResponse)
async def google_hosted_authorize_complete(
    request: Request,
    db: Session = Depends(get_db),
):
    raw_bytes = await request.body()
    raw_text = raw_bytes.decode("utf-8", errors="replace").strip()
    content_type = (request.headers.get("content-type") or "").lower()

    data: dict = {}
    if "application/json" in content_type or raw_text.startswith("{"):
        try:
            data = json.loads(raw_text)
        except Exception:
            data = {}
    else:
        parsed = parse_qs(raw_text, keep_blank_values=True)
        data = {k: (v[0] if v else "") for k, v in parsed.items()}

    state = str(data.get("state") or f"erya_gstate_{secrets.token_urlsafe(12)}")
    email = str(data.get("email") or "")
    full_name = data.get("full_name")
    redirect_uri = data.get("redirect_uri")
    return _complete_google_authorize_html(
        db=db,
        state=state,
        email=email,
        full_name=str(full_name) if full_name else None,
        redirect_uri=str(redirect_uri) if redirect_uri else None,
    )


@auth_router.get("/google/callback", response_class=HTMLResponse)
def google_real_oauth_callback(
    request: Request,
    code: str = Query(...),
    state: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    google_client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    google_client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()
    if not google_client_id or not google_client_secret:
        raise HTTPException(status_code=400, detail="Google OAuth istemci yapılandırması eksik.")

    base_url = _derive_base_url(request)
    callback_uri = f"{base_url}/auth/google/callback"

    try:
        token_resp = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": google_client_id,
                "client_secret": google_client_secret,
                "redirect_uri": callback_uri,
                "grant_type": "authorization_code",
            },
            timeout=8.0,
        )
        token_resp.raise_for_status()
        tok_data = token_resp.json()
        access_tok = tok_data.get("access_token")
        uinfo_resp = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_tok}"},
            timeout=6.0,
        )
        uinfo_resp.raise_for_status()
        uinfo = uinfo_resp.json()
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Google OAuth doğrulaması başarısız: {exc}")

    email = (uinfo.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google hesabından e-posta bilgisi alınamadı.")

    user = _find_or_create_google_user(
        db,
        email=email,
        full_name=uinfo.get("name"),
        google_sub=uinfo.get("sub"),
        avatar_url=uinfo.get("picture"),
        verified_google_token=True,
    )
    role_lit: Literal["trainer", "member"] = "trainer" if user.role == "trainer" else "member"
    user.last_login_at = _now_str()
    user.login_count = int(user.login_count or 0) + 1
    db.flush()
    sess = _issue_session(db, account_type="user", role=role_lit, auth_provider="google", user_id=user.id)

    exchange_code = f"erya_gcode_{secrets.token_urlsafe(24)}"
    oauth_row = db.query(GoogleOAuthState).filter(GoogleOAuthState.state == state).first() if state else None
    redir = oauth_row.redirect_uri if oauth_row and oauth_row.redirect_uri else ""
    if oauth_row:
        oauth_row.code = exchange_code
        oauth_row.session_token = sess.token
        db.commit()

    return _complete_google_authorize_html(
        db=db,
        state=state or f"erya_gstate_{secrets.token_urlsafe(12)}",
        email=email,
        full_name=user.full_name,
        redirect_uri=redir,
    )


@auth_router.post("/google", response_model=AuthSessionOut)
def auth_google_exchange(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)
    ps = _get_or_create_panel_settings(db)
    if not ps.allow_google_login:
        raise HTTPException(status_code=403, detail="Google ile giriş şu anda devre dışıdır.")

    # 1. Hosted veya OAuth redirect akışından dönen tek kullanımlık `code`
    if payload.code and payload.code.strip():
        raw_code = payload.code.strip()
        state_row = (
            db.query(GoogleOAuthState)
            .filter(GoogleOAuthState.code == raw_code, GoogleOAuthState.is_used == False)
            .first()
        )
        if state_row and state_row.session_token:
            state_row.is_used = True
            db.commit()
            sess = db.query(AuthSession).filter(AuthSession.token == state_row.session_token).first()
            if sess and sess.user_id:
                user = db.query(User).filter(User.id == sess.user_id).first()
                if user:
                    return _build_user_session_out(
                        db, user, sess, message=f"Google ile giriş başarılı, hoş geldiniz {user.full_name}!"
                    )

    verified_email: Optional[str] = None
    verified_name: Optional[str] = payload.full_name
    verified_sub: Optional[str] = payload.google_sub
    verified_pic: Optional[str] = payload.avatar_url
    google_client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()

    # 2. Google ID Token doğrulaması
    if payload.id_token and payload.id_token.strip():
        id_tok = payload.id_token.strip()
        try:
            resp = httpx.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_tok},
                timeout=5.0,
            )
            if resp.status_code == 200:
                info = resp.json()
                if google_client_id and info.get("aud") != google_client_id:
                    raise HTTPException(status_code=401, detail="Google ID token istemci kimliği (aud) eşleşmedi.")
                verified_email = (info.get("email") or "").strip().lower()
                verified_name = info.get("name") or verified_name
                verified_sub = info.get("sub") or verified_sub
                verified_pic = info.get("picture") or verified_pic
        except HTTPException:
            raise
        except Exception:
            pass

        if not verified_email and not google_client_id:
            claims = _decode_jwt_payload_unverified(id_tok)
            if claims and claims.get("email"):
                verified_email = str(claims["email"]).strip().lower()
                verified_name = claims.get("name") or verified_name
                verified_sub = claims.get("sub") or verified_sub
                verified_pic = claims.get("picture") or verified_pic

    # 3. Google OAuth Access Token doğrulaması
    if not verified_email and payload.access_token and payload.access_token.strip():
        acc_tok = payload.access_token.strip()
        try:
            resp = httpx.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {acc_tok}"},
                timeout=5.0,
            )
            if resp.status_code == 200:
                info = resp.json()
                verified_email = (info.get("email") or "").strip().lower()
                verified_name = info.get("name") or verified_name
                verified_sub = info.get("sub") or verified_sub
                verified_pic = info.get("picture") or verified_pic
        except Exception:
            pass

    # 4. Doğrudan Google kimlik e-postası (GSI / Web / Mobil OAuth istemci akışı)
    if not verified_email and payload.email and payload.email.strip():
        if google_client_id and (payload.id_token or payload.access_token):
            raise HTTPException(status_code=401, detail="Google token doğrulanamadı.")
        verified_email = payload.email.strip().lower()

    if not verified_email or "@" not in verified_email:
        raise HTTPException(status_code=400, detail="Google oturumu için geçerli bir Google token veya e-posta gereklidir.")

    user = _find_or_create_google_user(
        db,
        email=verified_email,
        full_name=verified_name,
        google_sub=verified_sub or f"google_{hashlib.sha256(verified_email.encode()).hexdigest()[:20]}",
        avatar_url=verified_pic,
    )
    role_lit: Literal["trainer", "member"] = "trainer" if user.role == "trainer" else "member"
    user.last_login_at = _now_str()
    user.login_count = int(user.login_count or 0) + 1
    db.flush()
    sess = _issue_session(
        db,
        account_type="user",
        role=role_lit,
        auth_provider="google",
        user_id=user.id,
    )
    return _build_user_session_out(
        db, user, sess, message=f"Google ile giriş başarılı, hoş geldiniz {user.full_name}!"
    )


# ============================================================================
# /admin/* ENDPOINT'LERİ (ZERO-PROFILE TAM YETKİLİ YÖNETİM MERKEZİ)
# ============================================================================


def _build_admin_trainer_out(db: Session, t: User) -> AdminTrainerOut:
    cred = _ensure_user_credential(db, t)
    auth_acc = _ensure_user_auth_account(db, t)
    today_iso = date.today().strftime("%Y-%m-%d")
    active_cnt = (
        db.query(ClassSession)
        .filter(ClassSession.trainer_id == t.id, ClassSession.date >= today_iso)
        .count()
    )
    return AdminTrainerOut(
        id=t.id,
        full_name=t.full_name,
        email=auth_acc.email,
        username=auth_acc.username,
        phone=t.phone or "",
        instagram_handle=t.instagram_handle,
        specialty=t.specialty or "Reformer & Klinik Pilates",
        bio=t.bio or "",
        notes=t.notes or "",
        avatar_url=t.avatar_url,
        rating=round(t.rating if t.rating is not None else 4.9, 1),
        experience_years=t.experience_years if t.experience_years is not None else 5,
        access_code=cred.access_code,
        active_sessions_count=active_cnt,
    )


def _normalize_package_month(
    raw_month: Optional[str],
    default_today: bool = False,
) -> Optional[str]:
    cleaned = (raw_month or "").strip()
    if not cleaned:
        return date.today().strftime("%Y-%m") if default_today else None
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", cleaned):
        raise HTTPException(
            status_code=400,
            detail="Paket dönemi YYYY-MM formatında olmalıdır (örn. 2026-11).",
        )
    return cleaned


def _build_admin_member_package_item_out(
    pkg: MemberPackage,
    member_name: Optional[str] = None,
) -> AdminMemberPackageItemOut:
    total_c = int(pkg.total_credits or 0)
    rem_c = int(pkg.remaining_credits or 0)
    used_c = max(0, total_c - rem_c)
    resolved_name = (
        member_name
        or (pkg.member.full_name if getattr(pkg, "member", None) else None)
        or f"Üye #{pkg.member_id}"
    )
    return AdminMemberPackageItemOut(
        id=pkg.id,
        member_id=pkg.member_id,
        member_name=resolved_name,
        package_name=pkg.package_name,
        total_credits=total_c,
        remaining_credits=rem_c,
        used_credits=used_c,
        package_month=getattr(pkg, "package_month", None),
        package_notes=getattr(pkg, "package_notes", None) or "",
        expiry_date=pkg.expiry_date,
        created_at=getattr(pkg, "created_at", None),
        is_active=bool(pkg.is_active),
    )


def _build_admin_member_out(db: Session, m: User) -> AdminMemberOut:
    cred = _ensure_user_credential(db, m)
    auth_acc = _ensure_user_auth_account(db, m)
    pkg = _get_active_package(db, m.id)
    today_iso = date.today().strftime("%Y-%m-%d")

    bookings = (
        db.query(Booking)
        .options(joinedload(Booking.session))
        .filter(Booking.member_id == m.id, Booking.status != "cancelled")
        .all()
    )
    upcoming_cnt = sum(
        1 for b in bookings if b.status == "booked" and b.session and b.session.date >= today_iso
    )
    attended_cnt = sum(1 for b in bookings if b.status == "attended")
    rem = pkg.remaining_credits if pkg else 0
    tot = pkg.total_credits if pkg else 0

    return AdminMemberOut(
        id=m.id,
        full_name=m.full_name,
        email=auth_acc.email,
        username=auth_acc.username,
        phone=m.phone or "",
        instagram_handle=m.instagram_handle,
        avatar_url=m.avatar_url,
        notes=m.notes or "",
        access_code=cred.access_code,
        package_id=pkg.id if pkg else None,
        package_name=pkg.package_name if pkg else None,
        package_month=getattr(pkg, "package_month", None) if pkg else None,
        package_notes=(getattr(pkg, "package_notes", None) or "") if pkg else "",
        remaining_credits=rem,
        total_credits=tot,
        expiry_date=pkg.expiry_date if pkg else None,
        low_credit_warning=(rem <= 2),
        upcoming_bookings_count=upcoming_cnt,
        attended_count=attended_cnt,
        streak_days=m.streak_days or 0,
    )


def _build_admin_session_item_out(s: ClassSession) -> AdminSessionItemOut:
    rem_spots = max(0, s.capacity - s.current_enrolled)
    return AdminSessionItemOut(
        id=s.id,
        trainer_id=s.trainer_id,
        trainer_name=s.trainer.full_name if s.trainer else "Eğitmen",
        title=s.title,
        category=s.category or "Grup Reformer",
        room=s.room or "Kemerli Ayna Reformer Salonu",
        date=s.date,
        day_label=_format_day_label_tr(s.date),
        start_time=s.start_time,
        end_time=s.end_time,
        capacity=s.capacity,
        current_enrolled=s.current_enrolled,
        remaining_spots=rem_spots,
        is_full=(rem_spots == 0),
    )


def _build_admin_package_plan_out(plan: PackageCatalogPlan) -> AdminPackagePlanOut:
    features: List[str] = []
    if plan.features_json:
        try:
            parsed = json.loads(plan.features_json)
            if isinstance(parsed, list):
                features = [str(item) for item in parsed]
        except Exception:
            features = []
    return AdminPackagePlanOut(
        id=plan.id,
        code=plan.code,
        name=plan.name,
        subtitle=plan.subtitle or "",
        credits=plan.credits,
        duration_days=plan.duration_days,
        price_try=plan.price_try,
        popular_badge=plan.popular_badge,
        features=features,
        is_active=bool(plan.is_active),
    )


def _build_admin_payment_out(tx: PaymentTransaction) -> AdminPaymentItemOut:
    p_name = tx.plan.name if tx.plan else f"Paket #{tx.plan_id}"
    return AdminPaymentItemOut(
        id=tx.id,
        transaction_code=tx.transaction_code,
        member_id=tx.member_id,
        member_name=tx.member.full_name if tx.member else f"Üye #{tx.member_id}",
        plan_id=tx.plan_id,
        plan_name=p_name,
        package_name=p_name,
        amount_try=tx.amount_try,
        amount=tx.amount_try,
        currency="TRY",
        payment_method=tx.payment_method,
        installment_count=tx.installment_count,
        status=tx.status,
        created_at=tx.created_at,
    )


# --- a) PANEL YÖNETİMİ & GEÇİŞ HEDEFLERİ ---


@admin_router.get("/panels", response_model=PanelConfigOut)
def admin_get_panels(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ps = _get_or_create_panel_settings(db)
    db.commit()
    return _to_panel_config_out(ps)


@admin_router.put("/panels", response_model=PanelConfigOut)
def admin_update_panels(
    payload: PanelConfigUpdateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ps = _get_or_create_panel_settings(db)
    if payload.admin_panel_enabled is not None:
        ps.admin_panel_enabled = payload.admin_panel_enabled
    if payload.trainer_panel_enabled is not None:
        ps.trainer_panel_enabled = payload.trainer_panel_enabled
    if payload.member_panel_enabled is not None:
        ps.member_panel_enabled = payload.member_panel_enabled
    if payload.default_landing_panel is not None:
        ps.default_landing_panel = payload.default_landing_panel
    if payload.allow_google_login is not None:
        ps.allow_google_login = payload.allow_google_login
    if payload.allow_member_booking is not None:
        ps.allow_member_booking = payload.allow_member_booking
    if payload.allow_package_purchase is not None:
        ps.allow_package_purchase = payload.allow_package_purchase
    if payload.studio_banner_enabled is not None:
        ps.studio_banner_enabled = payload.studio_banner_enabled
    if payload.studio_banner_title is not None:
        ps.studio_banner_title = payload.studio_banner_title.strip()
    if payload.studio_banner_message is not None:
        ps.studio_banner_message = payload.studio_banner_message.strip()
    ps.updated_at = _now_str()
    db.commit()
    db.refresh(ps)
    return _to_panel_config_out(ps)


@admin_router.get("/panel-targets", response_model=AdminPanelTargetsOut)
def admin_get_panel_targets(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    trainers = db.query(User).filter(User.role == "trainer").order_by(User.id.asc()).all()
    members = db.query(User).filter(User.role == "member").order_by(User.id.asc()).all()
    return AdminPanelTargetsOut(
        trainers=[UserOut.model_validate(t) for t in trainers],
        members=[UserOut.model_validate(m) for m in members],
        default_trainer_id=trainers[0].id if trainers else None,
        default_member_id=members[0].id if members else None,
    )


# --- b) YENİ HABER / DUYURU YAYINLAMA ---


@admin_router.get("/announcements", response_model=List[AnnouncementOut])
def admin_list_announcements(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Announcement)
        .order_by(Announcement.is_pinned.desc(), Announcement.date.desc(), Announcement.id.desc())
        .all()
    )
    return [AnnouncementOut.model_validate(a) for a in rows]


@admin_router.post("/announcements", response_model=AnnouncementOut)
def admin_create_announcement(
    payload: AdminAnnouncementCreateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    title = (payload.title or "").strip()
    content = (payload.content or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Haber/duyuru başlığı zorunludur.")
    if not content:
        raise HTTPException(status_code=400, detail="Haber/duyuru içeriği zorunludur.")

    tag = (payload.tag or "").strip() or "Kulüp Haberleri"
    pub_date = (payload.date or "").strip() or date.today().strftime("%Y-%m-%d")

    ann = Announcement(
        title=title,
        content=content,
        tag=tag,
        date=pub_date,
        is_pinned=bool(payload.is_pinned),
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@admin_router.put("/announcements/{announcement_id}", response_model=AnnouncementOut)
def admin_update_announcement(
    announcement_id: int,
    payload: AdminAnnouncementUpdateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ann = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı.")

    if payload.title is not None:
        cleaned = payload.title.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Başlık boş bırakılamaz.")
        ann.title = cleaned
    if payload.content is not None:
        cleaned_c = payload.content.strip()
        if not cleaned_c:
            raise HTTPException(status_code=400, detail="İçerik boş bırakılamaz.")
        ann.content = cleaned_c
    if payload.tag is not None and payload.tag.strip():
        ann.tag = payload.tag.strip()
    if payload.date is not None and payload.date.strip():
        ann.date = payload.date.strip()
    if payload.is_pinned is not None:
        ann.is_pinned = payload.is_pinned

    db.commit()
    db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@admin_router.delete("/announcements/{announcement_id}", response_model=AdminDeleteOut)
def admin_delete_announcement(
    announcement_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ann = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı.")
    db.delete(ann)
    db.commit()
    return AdminDeleteOut(deleted=True, id=announcement_id, message="Haber/duyuru yayından kaldırıldı.")


# --- c) YENİ ÖĞRETMEN / EĞİTMEN SİSTEME GİRME ---


@admin_router.get("/trainers", response_model=List[AdminTrainerOut])
def admin_list_trainers(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    trainers = db.query(User).filter(User.role == "trainer").order_by(User.id.asc()).all()
    out = [_build_admin_trainer_out(db, t) for t in trainers]
    db.commit()
    return out


@admin_router.post("/trainers", response_model=AdminTrainerOut)
def admin_create_trainer(
    payload: AdminTrainerCreateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    full_name = (payload.full_name or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Eğitmen Ad Soyad alanı zorunludur.")

    raw_pw = (payload.password or "").strip() or "Erya2026!"
    specialty = (payload.specialty or "").strip() or "Reformer & Klinik Pilates"
    phone = (payload.phone or "").strip() or "0551 497 90 09"
    ig = normalize_handle(payload.instagram_handle) if payload.instagram_handle else None
    notes = (payload.notes or "").strip() or f"{specialty} Eğitmeni"
    bio = (payload.bio or "").strip() or (
        f"{full_name}, ERYA Pilates & Reformer bünyesinde {specialty} alanında bireysel ve butik grup dersleri yönetmektedir.\n"
        f"Sertifikalar: {specialty} Uzmanlık Sertifikası | Modern Reformer & Cadillac Eğitmenliği"
    )

    desired_uname = (payload.username or "").strip().lower()
    desired_email = (payload.email or "").strip().lower()
    if desired_email and "@" not in desired_email and not desired_uname:
        desired_uname = desired_email
        desired_email = f"{_slugify_tr(desired_uname)}@eryapilates.com"

    if desired_email and (
        desired_email == "admin@eryapilates.com"
        or db.query(UserAuthAccount).filter(UserAuthAccount.email == desired_email).first()
    ):
        raise HTTPException(status_code=400, detail="Bu e-posta adresi başka bir hesapta kullanılıyor.")
    if desired_uname and (
        desired_uname == "admin"
        or db.query(UserAuthAccount).filter(UserAuthAccount.username == desired_uname).first()
    ):
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı başka bir hesapta kullanılıyor.")

    trainer = User(
        full_name=full_name,
        phone=phone,
        role="trainer",
        instagram_handle=ig,
        specialty=specialty,
        bio=bio,
        notes=notes,
        avatar_url=payload.avatar_url,
        rating=payload.rating if payload.rating is not None else 5.0,
        experience_years=payload.experience_years if payload.experience_years is not None else 5,
        streak_days=0,
    )
    db.add(trainer)
    db.flush()

    _ensure_user_credential(db, trainer)
    _ensure_user_auth_account(
        db,
        trainer,
        desired_username=desired_uname or None,
        desired_email=desired_email or None,
        raw_password=raw_pw,
        auth_provider="password",
    )
    db.commit()
    db.refresh(trainer)
    return _build_admin_trainer_out(db, trainer)


@admin_router.put("/trainers/{trainer_id}", response_model=AdminTrainerOut)
def admin_update_trainer(
    trainer_id: int,
    payload: AdminTrainerUpdateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    trainer = db.query(User).filter(User.id == trainer_id, User.role == "trainer").first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")

    auth_acc = _ensure_user_auth_account(db, trainer)

    if payload.full_name is not None and payload.full_name.strip():
        trainer.full_name = payload.full_name.strip()
    if payload.specialty is not None and payload.specialty.strip():
        trainer.specialty = payload.specialty.strip()
    if payload.phone is not None and payload.phone.strip():
        trainer.phone = payload.phone.strip()
    if payload.instagram_handle is not None:
        trainer.instagram_handle = normalize_handle(payload.instagram_handle) if payload.instagram_handle.strip() else None
    if payload.bio is not None:
        trainer.bio = payload.bio.strip()
    if payload.notes is not None:
        trainer.notes = payload.notes.strip()
    if payload.avatar_url is not None:
        trainer.avatar_url = payload.avatar_url.strip() or None
    if payload.experience_years is not None:
        trainer.experience_years = payload.experience_years
    if payload.rating is not None:
        trainer.rating = payload.rating

    if payload.email is not None and payload.email.strip():
        new_email = _unique_email(db, payload.email.strip(), exclude_user_id=trainer.id)
        auth_acc.email = new_email
        trainer.email = new_email
    if payload.username is not None and payload.username.strip():
        auth_acc.username = _unique_username(db, payload.username.strip(), exclude_user_id=trainer.id)
    if payload.password is not None and payload.password.strip():
        auth_acc.password_hash = _hash_password(payload.password.strip())
    auth_acc.updated_at = _now_str()

    db.commit()
    db.refresh(trainer)
    return _build_admin_trainer_out(db, trainer)


@admin_router.delete("/trainers/{trainer_id}", response_model=AdminDeleteOut)
def admin_delete_trainer(
    trainer_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    trainer = db.query(User).filter(User.id == trainer_id, User.role == "trainer").first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")

    deleted_id, policy_file_path = _permanently_delete_user(db, trainer)
    db.commit()
    _remove_signed_policy_files(policy_file_path)
    return AdminDeleteOut(deleted=True, id=deleted_id, message="Eğitmen sistemden silindi.")


# --- d) BÜTÜN SİSTEMLERİ YÖNETME (OVERVIEW, MEMBERS, CREDITS, SESSIONS, PACKAGES, PAYMENTS) ---


@admin_router.get("/overview", response_model=AdminSystemOverviewOut)
def admin_system_overview(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    today_iso = date.today().strftime("%Y-%m-%d")
    members = db.query(User).filter(User.role == "member").all()
    trainers_cnt = db.query(User).filter(User.role == "trainer").count()
    all_sessions = db.query(ClassSession).all()
    upcoming_sessions_cnt = sum(1 for s in all_sessions if s.date >= today_iso)
    active_bookings_cnt = db.query(Booking).filter(Booking.status == "booked").count()

    active_pkgs = db.query(MemberPackage).filter(MemberPackage.is_active == True).all()
    pkg_by_member: Dict[int, MemberPackage] = {}
    for p in active_pkgs:
        if p.member_id not in pkg_by_member or p.id > pkg_by_member[p.member_id].id:
            pkg_by_member[p.member_id] = p

    total_rem_credits = sum(max(0, p.remaining_credits) for p in pkg_by_member.values())
    low_credit_cnt = sum(
        1 for m in members if (m.id not in pkg_by_member) or (pkg_by_member[m.id].remaining_credits <= 2)
    )

    anns = (
        db.query(Announcement)
        .order_by(Announcement.is_pinned.desc(), Announcement.date.desc(), Announcement.id.desc())
        .all()
    )
    payments = (
        db.query(PaymentTransaction)
        .options(joinedload(PaymentTransaction.member), joinedload(PaymentTransaction.plan))
        .order_by(PaymentTransaction.id.desc())
        .all()
    )
    completed_payments = [tx for tx in payments if tx.status in ("completed", "succeeded")]
    total_revenue = round(sum(tx.amount_try for tx in completed_payments), 2)

    ps = _get_or_create_panel_settings(db)
    db.commit()

    return AdminSystemOverviewOut(
        total_members=len(members),
        total_trainers=trainers_cnt,
        total_sessions=len(all_sessions),
        upcoming_sessions_count=upcoming_sessions_cnt,
        active_bookings_count=active_bookings_cnt,
        active_packages_count=len(pkg_by_member),
        total_remaining_credits=total_rem_credits,
        low_credit_members_count=low_credit_cnt,
        total_announcements=len(anns),
        total_revenue_try=total_revenue,
        total_payments_count=len(completed_payments),
        panel_config=_to_panel_config_out(ps),
        recent_announcements=[AnnouncementOut.model_validate(a) for a in anns[:6]],
        recent_payments=[_build_admin_payment_out(tx) for tx in payments[:10]],
    )


@admin_router.get("/members", response_model=List[AdminMemberOut])
def admin_list_members(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    members = db.query(User).filter(User.role == "member").order_by(User.id.desc()).all()
    out = [_build_admin_member_out(db, m) for m in members]
    db.commit()
    return out


@admin_router.post("/members", response_model=AdminMemberOut)
def admin_create_member(
    payload: AdminMemberCreateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    full_name = (payload.full_name or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Müşteri Ad Soyad zorunludur.")

    phone = (payload.phone or "").strip() or "0530 000 00 00"
    ig = normalize_handle(payload.instagram_handle) if payload.instagram_handle else None
    raw_pw = (payload.password or "").strip() or "Erya2026!"

    member = User(
        full_name=full_name,
        phone=phone,
        role="member",
        instagram_handle=ig,
        notes=(payload.notes or "").strip(),
        avatar_url=payload.avatar_url,
        streak_days=0,
    )
    db.add(member)
    db.flush()

    _ensure_user_credential(db, member)
    _ensure_user_auth_account(
        db,
        member,
        desired_username=(payload.username or "").strip() or None,
        desired_email=(payload.email or "").strip() or None,
        raw_password=raw_pw,
        auth_provider="password",
    )

    if payload.credits is not None and payload.credits >= 0:
        pkg_title = (payload.package_name or "").strip() or "8 Seans Grup Reformer Paketi"
        dur = max(1, payload.duration_days or 40)
        total_c = max(payload.credits, 1)
        pkg_month = _normalize_package_month(payload.package_month, default_today=False)
        pkg_notes = (payload.package_notes or "").strip()
        db.add(
            MemberPackage(
                member_id=member.id,
                package_name=pkg_title,
                total_credits=total_c,
                remaining_credits=payload.credits,
                expiry_date=(date.today() + timedelta(days=dur)).strftime("%Y-%m-%d"),
                is_active=True,
                package_month=pkg_month,
                package_notes=pkg_notes,
                created_at=_now_str(),
            )
        )

    db.commit()
    db.refresh(member)
    return _build_admin_member_out(db, member)


@admin_router.put("/members/{member_id}", response_model=AdminMemberOut)
def admin_update_member(
    member_id: int,
    payload: AdminMemberUpdateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    auth_acc = _ensure_user_auth_account(db, member)

    if payload.full_name is not None and payload.full_name.strip():
        member.full_name = payload.full_name.strip()
    if payload.phone is not None and payload.phone.strip():
        member.phone = payload.phone.strip()
    if payload.instagram_handle is not None:
        member.instagram_handle = normalize_handle(payload.instagram_handle) if payload.instagram_handle.strip() else None
    if payload.notes is not None:
        member.notes = payload.notes.strip()

    if payload.email is not None and payload.email.strip():
        new_email = _unique_email(db, payload.email.strip(), exclude_user_id=member.id)
        auth_acc.email = new_email
        member.email = new_email
    if payload.username is not None and payload.username.strip():
        auth_acc.username = _unique_username(db, payload.username.strip(), exclude_user_id=member.id)
    if payload.password is not None and payload.password.strip():
        auth_acc.password_hash = _hash_password(payload.password.strip())
    auth_acc.updated_at = _now_str()

    if any(
        v is not None
        for v in (
            payload.package_name,
            payload.remaining_credits,
            payload.total_credits,
            payload.expiry_date,
            payload.package_month,
            payload.package_notes,
        )
    ):
        pkg = _get_active_package(db, member.id)
        if not pkg:
            rem = max(0, payload.remaining_credits if payload.remaining_credits is not None else 8)
            tot = max(rem, payload.total_credits if payload.total_credits is not None else max(8, rem))
            pkg = MemberPackage(
                member_id=member.id,
                package_name=(payload.package_name or "").strip() or "8 Seans Grup Reformer Paketi",
                total_credits=tot,
                remaining_credits=rem,
                expiry_date=payload.expiry_date or (date.today() + timedelta(days=40)).strftime("%Y-%m-%d"),
                is_active=True,
                package_month=_normalize_package_month(payload.package_month, default_today=False),
                package_notes=(payload.package_notes or "").strip(),
                created_at=_now_str(),
            )
            db.add(pkg)
        else:
            if payload.package_name is not None and payload.package_name.strip():
                pkg.package_name = payload.package_name.strip()
            if payload.remaining_credits is not None:
                pkg.remaining_credits = max(0, payload.remaining_credits)
                if pkg.total_credits < pkg.remaining_credits:
                    pkg.total_credits = pkg.remaining_credits
            if payload.total_credits is not None:
                pkg.total_credits = max(pkg.remaining_credits, payload.total_credits)
            if payload.expiry_date is not None and payload.expiry_date.strip():
                pkg.expiry_date = payload.expiry_date.strip()
            if payload.package_month is not None:
                pkg.package_month = _normalize_package_month(payload.package_month, default_today=False)
            if payload.package_notes is not None:
                pkg.package_notes = payload.package_notes.strip()

    db.commit()
    db.refresh(member)
    return _build_admin_member_out(db, member)


@admin_router.get("/member-packages", response_model=List[AdminMemberPackageItemOut])
def admin_list_member_packages(
    month: Optional[str] = Query(default=None, description="Opsiyonel YYYY-MM dönem filtresi"),
    member_id: Optional[int] = Query(default=None, description="Opsiyonel müşteri ID filtresi"),
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(MemberPackage).options(joinedload(MemberPackage.member))
    if month is not None and month.strip():
        month_clean = _normalize_package_month(month, default_today=False)
        q = q.filter(MemberPackage.package_month == month_clean)
    if member_id is not None:
        q = q.filter(MemberPackage.member_id == member_id)
    packages = q.order_by(MemberPackage.id.desc()).all()
    return [_build_admin_member_package_item_out(p) for p in packages]


@admin_router.post("/members/{member_id}/packages", response_model=AdminMemberOut)
def admin_assign_member_package(
    member_id: int,
    payload: AdminAssignMemberPackageRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    pkg_name = (payload.package_name or "").strip()
    if not pkg_name:
        raise HTTPException(status_code=400, detail="Paket adı zorunludur.")

    total_c = int(payload.total_credits)
    rem_c = total_c if payload.remaining_credits is None else int(payload.remaining_credits)
    if rem_c > total_c:
        total_c = rem_c

    pkg_month = _normalize_package_month(payload.package_month, default_today=True)
    if payload.expiry_date is not None and payload.expiry_date.strip():
        expiry_str = payload.expiry_date.strip()
        try:
            datetime.strptime(expiry_str, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Bitiş tarihi YYYY-MM-DD formatında olmalıdır (örn. 2026-12-27).",
            )
    else:
        dur = max(1, int(payload.duration_days or 30))
        expiry_str = (date.today() + timedelta(days=dur)).strftime("%Y-%m-%d")

    if payload.deactivate_previous:
        db.query(MemberPackage).filter(
            MemberPackage.member_id == member.id,
            MemberPackage.is_active == True,
        ).update({"is_active": False}, synchronize_session=False)

    new_pkg = MemberPackage(
        member_id=member.id,
        package_name=pkg_name,
        total_credits=total_c,
        remaining_credits=rem_c,
        expiry_date=expiry_str,
        is_active=True,
        package_month=pkg_month,
        package_notes=(payload.package_notes or "").strip(),
        created_at=_now_str(),
    )
    db.add(new_pkg)
    db.commit()
    db.refresh(member)
    return _build_admin_member_out(db, member)


@admin_router.put("/member-packages/{package_id}", response_model=AdminMemberPackageItemOut)
def admin_update_member_package(
    package_id: int,
    payload: AdminUpdateMemberPackageRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    pkg = (
        db.query(MemberPackage)
        .options(joinedload(MemberPackage.member))
        .filter(MemberPackage.id == package_id)
        .first()
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="Üye paketi bulunamadı.")

    if payload.package_name is not None and payload.package_name.strip():
        pkg.package_name = payload.package_name.strip()
    if payload.total_credits is not None:
        pkg.total_credits = int(payload.total_credits)
    if payload.remaining_credits is not None:
        pkg.remaining_credits = max(0, int(payload.remaining_credits))
    if pkg.total_credits < pkg.remaining_credits:
        if payload.total_credits is not None and payload.remaining_credits is None:
            pkg.remaining_credits = pkg.total_credits
        else:
            pkg.total_credits = pkg.remaining_credits
    if payload.package_month is not None:
        pkg.package_month = _normalize_package_month(payload.package_month, default_today=False)
    if payload.expiry_date is not None and payload.expiry_date.strip():
        expiry_str = payload.expiry_date.strip()
        try:
            datetime.strptime(expiry_str, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Bitiş tarihi YYYY-MM-DD formatında olmalıdır (örn. 2026-12-27).",
            )
        pkg.expiry_date = expiry_str
    if payload.package_notes is not None:
        pkg.package_notes = payload.package_notes.strip()
    if payload.is_active is not None:
        pkg.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(pkg)
    return _build_admin_member_package_item_out(pkg)


@admin_router.delete("/member-packages/{package_id}", response_model=AdminDeleteOut)
def admin_delete_member_package(
    package_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    pkg = db.query(MemberPackage).filter(MemberPackage.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Üye paketi bulunamadı.")

    has_booking = db.query(Booking).filter(Booking.package_id == pkg.id).first()
    has_payment_ref = (
        db.query(PaymentTransaction).filter(PaymentTransaction.member_package_id == pkg.id).first()
        or db.query(PaymentCheckoutSession).filter(PaymentCheckoutSession.credited_package_id == pkg.id).first()
    )
    if has_booking or has_payment_ref:
        pkg.is_active = False
        db.commit()
        return AdminDeleteOut(
            deleted=True,
            id=package_id,
            message="Bağlı rezervasyonu bulunan paket pasife alındı.",
        )

    db.delete(pkg)
    db.commit()
    return AdminDeleteOut(deleted=True, id=package_id, message="Üye paketi silindi.")


@admin_router.post("/members/{member_id}/credits", response_model=AdminMemberOut)
def admin_adjust_member_credits(
    member_id: int,
    payload: AdminMemberCreditAdjustRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    pkg = _get_active_package(db, member.id)
    dur = max(1, payload.duration_days or 45)
    exp_str = (date.today() + timedelta(days=dur)).strftime("%Y-%m-%d")

    if not pkg:
        initial_rem = (
            payload.set_remaining_credits
            if payload.set_remaining_credits is not None
            else max(0, payload.credits_delta or 8)
        )
        initial_tot = max(initial_rem, payload.total_credits or max(8, initial_rem))
        pkg = MemberPackage(
            member_id=member.id,
            package_name=(payload.package_name or "").strip() or "8 Seans Grup Reformer Paketi",
            total_credits=initial_tot,
            remaining_credits=initial_rem,
            expiry_date=exp_str,
            is_active=True,
        )
        db.add(pkg)
    else:
        if payload.package_name is not None and payload.package_name.strip():
            pkg.package_name = payload.package_name.strip()
        if payload.set_remaining_credits is not None:
            pkg.remaining_credits = max(0, payload.set_remaining_credits)
        elif payload.credits_delta is not None:
            pkg.remaining_credits = max(0, pkg.remaining_credits + payload.credits_delta)
            if payload.credits_delta > 0:
                pkg.total_credits = max(pkg.total_credits + payload.credits_delta, pkg.remaining_credits)
        if payload.total_credits is not None:
            pkg.total_credits = max(pkg.remaining_credits, payload.total_credits)
        elif pkg.total_credits < pkg.remaining_credits:
            pkg.total_credits = pkg.remaining_credits
        if payload.duration_days is not None:
            pkg.expiry_date = exp_str

    db.commit()
    db.refresh(member)
    return _build_admin_member_out(db, member)


@admin_router.delete("/members/{member_id}", response_model=AdminDeleteOut)
def admin_delete_member(
    member_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    deleted_id, policy_file_path = _permanently_delete_user(db, member)
    db.commit()
    _remove_signed_policy_files(policy_file_path)
    return AdminDeleteOut(deleted=True, id=deleted_id, message="Müşteri kaydı silindi.")


@admin_router.get("/sessions", response_model=List[AdminSessionItemOut])
def admin_list_sessions(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )
    return [_build_admin_session_item_out(s) for s in sessions]


@admin_router.post("/sessions", response_model=AdminSessionItemOut)
def admin_create_session(
    payload: AdminSessionCreateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    trainer = db.query(User).filter(User.id == payload.trainer_id, User.role == "trainer").first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Seçilen eğitmen bulunamadı.")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Ders başlığı zorunludur.")

    start_raw = (payload.start_time or "").strip().replace(".", ":")
    m = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", start_raw)
    if not m:
        raise HTTPException(status_code=400, detail="Başlangıç saati HH:MM formatında olmalıdır.")
    start_hhmm = f"{int(m.group(1)):02d}:{int(m.group(2)):02d}"

    if payload.end_time and payload.end_time.strip():
        end_raw = payload.end_time.strip().replace(".", ":")
        m2 = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", end_raw)
        if not m2:
            raise HTTPException(status_code=400, detail="Bitiş saati HH:MM formatında olmalıdır.")
        end_hhmm = f"{int(m2.group(1)):02d}:{int(m2.group(2)):02d}"
    else:
        end_hhmm = (datetime.strptime(start_hhmm, "%H:%M") + timedelta(minutes=60)).strftime("%H:%M")

    category = (payload.category or "").strip() or "Grup Reformer"
    room = (payload.room or "").strip() or "Kemerli Ayna Reformer Salonu"

    sess = ClassSession(
        trainer_id=trainer.id,
        title=title,
        category=category,
        room=room,
        date=payload.date.strip(),
        start_time=start_hhmm,
        end_time=end_hhmm,
        capacity=payload.capacity,
        current_enrolled=0,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return _build_admin_session_item_out(sess)


@admin_router.put("/sessions/{session_id}", response_model=AdminSessionItemOut)
def admin_update_session(
    session_id: int,
    payload: AdminSessionUpdateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sess = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .filter(ClassSession.id == session_id)
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Ders seansı bulunamadı.")

    if payload.trainer_id is not None:
        tr = db.query(User).filter(User.id == payload.trainer_id, User.role == "trainer").first()
        if not tr:
            raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")
        sess.trainer_id = tr.id
    if payload.title is not None and payload.title.strip():
        sess.title = payload.title.strip()
    if payload.category is not None and payload.category.strip():
        sess.category = payload.category.strip()
    if payload.room is not None and payload.room.strip():
        sess.room = payload.room.strip()
    if payload.date is not None and payload.date.strip():
        sess.date = payload.date.strip()
    if payload.start_time is not None and payload.start_time.strip():
        sess.start_time = payload.start_time.strip()
    if payload.end_time is not None and payload.end_time.strip():
        sess.end_time = payload.end_time.strip()
    if payload.capacity is not None:
        sess.capacity = max(sess.current_enrolled, payload.capacity)

    db.commit()
    db.refresh(sess)
    return _build_admin_session_item_out(sess)


@admin_router.delete("/sessions/{session_id}", response_model=AdminSessionDeleteOut)
def admin_delete_session(
    session_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sess = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Ders seansı bulunamadı.")

    booked_rows = db.query(Booking).filter(Booking.session_id == session_id, Booking.status == "booked").all()
    refunded = 0
    for b in booked_rows:
        pkg = db.query(MemberPackage).filter(MemberPackage.id == b.package_id).first() or _get_active_package(
            db, b.member_id
        )
        if pkg:
            pkg.remaining_credits += 1
            refunded += 1

    db.delete(sess)
    db.commit()
    return AdminSessionDeleteOut(
        deleted=True,
        id=session_id,
        refunded_bookings=refunded,
        message=f"Ders seansı iptal edildi ve silindi ({refunded} üyeye +1 kredi iade edildi).",
    )


@admin_router.get("/packages", response_model=List[AdminPackagePlanOut])
def admin_list_package_plans(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    plans = db.query(PackageCatalogPlan).order_by(PackageCatalogPlan.price_try.asc()).all()
    return [_build_admin_package_plan_out(p) for p in plans]


@admin_router.post("/packages", response_model=AdminPackagePlanOut)
def admin_create_package_plan(
    payload: AdminPackagePlanCreateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Paket adı zorunludur.")

    code = (payload.code or "").strip().upper() or f"ERYA-{_slugify_tr(name).upper()[:12]}-{payload.credits}"
    while db.query(PackageCatalogPlan).filter(PackageCatalogPlan.code == code).first():
        code = f"{code}-{secrets.randbelow(90) + 10}"

    plan = PackageCatalogPlan(
        code=code,
        name=name,
        subtitle=(payload.subtitle or "").strip(),
        credits=payload.credits,
        duration_days=payload.duration_days,
        price_try=payload.price_try,
        popular_badge=(payload.popular_badge or "").strip() or None,
        features_json=json.dumps(payload.features or [], ensure_ascii=False),
        is_active=payload.is_active,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _build_admin_package_plan_out(plan)


@admin_router.put("/packages/{plan_id}", response_model=AdminPackagePlanOut)
def admin_update_package_plan(
    plan_id: int,
    payload: AdminPackagePlanUpdateRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    plan = db.query(PackageCatalogPlan).filter(PackageCatalogPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Paket planı bulunamadı.")

    if payload.name is not None and payload.name.strip():
        plan.name = payload.name.strip()
    if payload.subtitle is not None:
        plan.subtitle = payload.subtitle.strip()
    if payload.credits is not None and payload.credits > 0:
        plan.credits = payload.credits
    if payload.duration_days is not None and payload.duration_days > 0:
        plan.duration_days = payload.duration_days
    if payload.price_try is not None and payload.price_try >= 0:
        plan.price_try = payload.price_try
    if payload.popular_badge is not None:
        plan.popular_badge = payload.popular_badge.strip() or None
    if payload.features is not None:
        plan.features_json = json.dumps(payload.features, ensure_ascii=False)
    if payload.is_active is not None:
        plan.is_active = payload.is_active

    db.commit()
    db.refresh(plan)
    return _build_admin_package_plan_out(plan)


@admin_router.delete("/packages/{plan_id}", response_model=AdminDeleteOut)
def admin_delete_package_plan(
    plan_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    plan = db.query(PackageCatalogPlan).filter(PackageCatalogPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Paket planı bulunamadı.")

    has_tx = db.query(PaymentTransaction).filter(PaymentTransaction.plan_id == plan.id).first()
    if has_tx:
        plan.is_active = False
        db.commit()
        return AdminDeleteOut(deleted=True, id=plan_id, message="Geçmiş ödemesi bulunan paket pasife alındı.")

    db.delete(plan)
    db.commit()
    return AdminDeleteOut(deleted=True, id=plan_id, message="Paket katalogdan silindi.")


@admin_router.get("/payments", response_model=List[AdminPaymentItemOut])
def admin_list_payments(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    txs = (
        db.query(PaymentTransaction)
        .options(joinedload(PaymentTransaction.member), joinedload(PaymentTransaction.plan))
        .order_by(PaymentTransaction.id.desc())
        .all()
    )
    return [_build_admin_payment_out(tx) for tx in txs]


# ============================================================================
# MEVCUT /portal/* ENDPOINT'LERİ (GERİYE DÖNÜK %100 UYUMLULUK)
# ============================================================================


def _detect_injury_or_special_note(content: str, explicit_notes: Optional[str]) -> Optional[str]:
    parts: List[str] = []
    if explicit_notes and explicit_notes.strip():
        parts.append(explicit_notes.strip())

    lower_content = (
        (content or "")
        .replace("İ", "i")
        .replace("I", "ı")
        .lower()
    )
    if any(kw in lower_content for kw in INJURY_HEALTH_KEYWORDS):
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", content or "") if s.strip()]
        matched_sentences = [
            s
            for s in sentences
            if any(
                kw in s.replace("İ", "i").replace("I", "ı").lower()
                for kw in INJURY_HEALTH_KEYWORDS
            )
        ]
        extracted = ". ".join(matched_sentences) if matched_sentences else (content or "").strip()
        if extracted and extracted not in parts:
            parts.append(extracted)

    if not parts:
        return None
    return " | ".join(parts)


@portal_router.get("/public-chips", response_model=List[PortalQuickChipOut])
def get_public_demo_chips(db: Session = Depends(get_db)):
    ensure_portal_initialized(db)
    users = db.query(User).order_by(User.role.asc(), User.id.asc()).all()
    creds_map = {c.user_id: c.access_code for c in db.query(UserAccessCredential).all()}

    chips: List[PortalQuickChipOut] = []
    for u in users:
        code = creds_map.get(u.id, f"FIT-{1000 + u.id}")
        pkg = _get_active_package(db, u.id) if u.role == "member" else None
        first_part = u.full_name.split(" ")[0]
        chips.append(
            PortalQuickChipOut(
                access_code=code,
                user_id=u.id,
                full_name=u.full_name,
                short_label=f"{code} • {first_part}",
                role=u.role,
                remaining_credits=pkg.remaining_credits if pkg else 0,
                total_credits=pkg.total_credits if pkg else 0,
            )
        )
    return chips


@portal_router.get("/lookup/{access_code}", response_model=PortalLookupResponse)
def lookup_by_access_code(access_code: str, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    user = _resolve_user_by_code_or_identifier(db, access_code, allow_phone_and_handle=False)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=f"'{access_code}' koduna ait bir üye kaydı bulunamadı. Lütfen FIT-1004 gibi geçerli bir ID girin.",
        )

    cred = _ensure_user_credential(db, user)
    today_iso = date.today().strftime("%Y-%m-%d")

    upcoming_bookings: List[PortalBookingLookupItemOut] = []
    past_bookings: List[PortalBookingLookupItemOut] = []

    if user.role == "member":
        pkg = _get_active_package(db, user.id)
        pkg_summary = _to_package_summary(pkg)

        bookings_q = (
            db.query(Booking)
            .options(joinedload(Booking.session).joinedload(ClassSession.trainer))
            .filter(Booking.member_id == user.id, Booking.status != "cancelled")
            .all()
        )
        bookings_sorted = sorted(
            [b for b in bookings_q if b.session is not None],
            key=lambda b: (b.session.date, b.session.start_time),
        )

        for b in bookings_sorted:
            s = b.session
            item = PortalBookingLookupItemOut(
                booking_id=b.id,
                session_id=s.id,
                title=s.title,
                date=s.date,
                day_label=_format_day_label_tr(s.date),
                start_time=s.start_time,
                end_time=s.end_time,
                trainer_id=s.trainer_id,
                trainer_name=s.trainer.full_name if s.trainer else "Eğitmen",
                status=b.status,
                capacity=s.capacity,
                current_enrolled=s.current_enrolled,
            )
            if b.status == "booked" and s.date >= today_iso:
                upcoming_bookings.append(item)
            else:
                past_bookings.append(item)

        past_bookings.reverse()
        rem = pkg.remaining_credits if pkg else 0
        tot = pkg.total_credits if pkg else 0
        summary_msg = (
            f"{user.full_name} ({cred.access_code}) • Kalan Ders: {rem}/{tot} • "
            f"{len(upcoming_bookings)} yaklaşan randevu bulundu."
        )

        return PortalLookupResponse(
            access_code=cred.access_code,
            user_id=user.id,
            full_name=user.full_name,
            role=user.role,
            phone_masked=_mask_phone(user.phone),
            user=PortalUserSummaryOut(
                id=user.id,
                full_name=user.full_name,
                phone=user.phone,
                role=user.role,
                instagram_handle=user.instagram_handle,
                notes=user.notes or "",
                access_code=cred.access_code,
            ),
            active_package=pkg_summary,
            package_name=pkg.package_name if pkg else None,
            remaining_credits=rem,
            total_credits=tot,
            expiry_date=pkg.expiry_date if pkg else None,
            low_credit_warning=(rem <= 2) if pkg else True,
            upcoming_bookings=upcoming_bookings,
            past_bookings=past_bookings,
            summary_message=summary_msg,
        )

    trainer_sessions = (
        db.query(ClassSession)
        .filter(ClassSession.trainer_id == user.id)
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )
    for s in trainer_sessions:
        item = PortalBookingLookupItemOut(
            booking_id=s.id,
            session_id=s.id,
            title=s.title,
            date=s.date,
            day_label=_format_day_label_tr(s.date),
            start_time=s.start_time,
            end_time=s.end_time,
            trainer_id=user.id,
            trainer_name=user.full_name,
            status="booked",
            capacity=s.capacity,
            current_enrolled=s.current_enrolled,
        )
        if s.date >= today_iso:
            upcoming_bookings.append(item)
        else:
            past_bookings.append(item)

    return PortalLookupResponse(
        access_code=cred.access_code,
        user_id=user.id,
        full_name=user.full_name,
        role=user.role,
        phone_masked=_mask_phone(user.phone),
        user=PortalUserSummaryOut(
            id=user.id,
            full_name=user.full_name,
            phone=user.phone,
            role=user.role,
            instagram_handle=user.instagram_handle,
            notes=user.notes or "",
            access_code=cred.access_code,
        ),
        active_package=None,
        package_name="Eğitmen Hesabı",
        remaining_credits=len(upcoming_bookings),
        total_credits=len(trainer_sessions),
        expiry_date=None,
        low_credit_warning=False,
        upcoming_bookings=upcoming_bookings,
        past_bookings=past_bookings,
        summary_message=f"{user.full_name} ({cred.access_code}) • Eğitmen Programı: {len(upcoming_bookings)} aktif ders.",
    )


@portal_router.post("/auth/login", response_model=PortalUserLoginResponse)
def portal_user_login(payload: PortalUserLoginRequest, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    user = _resolve_user_by_code_or_identifier(db, payload.identifier, allow_phone_and_handle=True)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Girdiğiniz telefon numarası veya FIT-XXXX koduna ait kayıt bulunamadı.",
        )

    cred = _ensure_user_credential(db, user)
    if payload.pin_code is not None and payload.pin_code.strip() != "":
        auth_acc = _ensure_user_auth_account(db, user)
        raw_pin = payload.pin_code.strip()
        if raw_pin != cred.pin_code and not _verify_password(raw_pin, auth_acc.password_hash):
            raise HTTPException(status_code=401, detail="Şifre veya PIN kodu hatalı.")

    pkg = _get_active_package(db, user.id) if user.role == "member" else None
    db.commit()

    return PortalUserLoginResponse(
        message=f"Hoş geldiniz, {user.full_name}!",
        access_code=cred.access_code,
        user=PortalUserSummaryOut(
            id=user.id,
            full_name=user.full_name,
            phone=user.phone,
            role=user.role,
            instagram_handle=user.instagram_handle,
            notes=user.notes or "",
            access_code=cred.access_code,
        ),
        active_package=_to_package_summary(pkg),
        remaining_credits=pkg.remaining_credits if pkg else 0,
        total_credits=pkg.total_credits if pkg else 0,
    )


@portal_router.post("/admin/login", response_model=PortalAdminLoginResponse)
def portal_admin_login(payload: PortalAdminLoginRequest, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    ident = (payload.username or "").strip().lower()
    password = (payload.password or "").strip()

    admin_acc = (
        db.query(AdminAccount)
        .filter((AdminAccount.username == ident) | (AdminAccount.email == ident))
        .first()
    )
    if not admin_acc or not _verify_password(password, admin_acc.password_hash):
        raise HTTPException(status_code=401, detail="Yönetici kullanıcı adı veya şifre hatalı.")

    sess = _issue_session(
        db,
        account_type="admin",
        role="admin",
        auth_provider="password",
        admin_id=admin_acc.id,
    )

    return PortalAdminLoginResponse(
        authenticated=True,
        username=admin_acc.username,
        full_name=admin_acc.full_name,
        token=sess.token,
        message=f"Yönetim paneline hoş geldiniz, {admin_acc.full_name}.",
    )


@portal_router.get("/admin/overview", response_model=AdminOverviewResponse)
def get_admin_overview(db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    all_users = db.query(User).order_by(User.role.asc(), User.id.asc()).all()
    creds_map = {c.user_id: c for c in db.query(UserAccessCredential).all()}

    today_iso = date.today().strftime("%Y-%m-%d")
    all_bookings = (
        db.query(Booking)
        .options(joinedload(Booking.session))
        .filter(Booking.status != "cancelled")
        .all()
    )

    upcoming_by_member: Dict[int, int] = {}
    active_bookings_count = 0
    for b in all_bookings:
        if b.status == "booked":
            active_bookings_count += 1
        if b.session and b.session.date >= today_iso and b.status == "booked":
            upcoming_by_member[b.member_id] = upcoming_by_member.get(b.member_id, 0) + 1

    directory_users: List[AdminDirectoryUserOut] = []
    total_members = 0
    total_trainers = 0
    active_packages_count = 0
    total_remaining_credits = 0
    low_credit_members_count = 0

    for u in all_users:
        cred = creds_map.get(u.id) or _ensure_user_credential(db, u)
        pkg = _get_active_package(db, u.id) if u.role == "member" else None

        if u.role == "member":
            total_members += 1
            if pkg:
                active_packages_count += 1
                total_remaining_credits += pkg.remaining_credits
                if pkg.remaining_credits <= 2:
                    low_credit_members_count += 1
            else:
                low_credit_members_count += 1
        else:
            total_trainers += 1

        rem = pkg.remaining_credits if pkg else 0
        tot = pkg.total_credits if pkg else 0
        directory_users.append(
            AdminDirectoryUserOut(
                id=u.id,
                full_name=u.full_name,
                phone=u.phone,
                role=u.role,
                instagram_handle=u.instagram_handle,
                notes=u.notes or "",
                access_code=cred.access_code,
                pin_code=cred.pin_code,
                package_name=pkg.package_name if pkg else None,
                remaining_credits=rem,
                total_credits=tot,
                expiry_date=pkg.expiry_date if pkg else None,
                low_credit_warning=(u.role == "member" and rem <= 2),
                upcoming_count=upcoming_by_member.get(u.id, 0),
            )
        )

    all_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )
    session_options: List[AdminSessionOptionOut] = []
    for s in all_sessions:
        rem_spots = max(0, s.capacity - s.current_enrolled)
        session_options.append(
            AdminSessionOptionOut(
                id=s.id,
                title=s.title,
                date=s.date,
                day_label=_format_day_label_tr(s.date),
                start_time=s.start_time,
                end_time=s.end_time,
                trainer_id=s.trainer_id,
                trainer_name=s.trainer.full_name if s.trainer else "Eğitmen",
                capacity=s.capacity,
                current_enrolled=s.current_enrolled,
                remaining_spots=rem_spots,
                is_full=(rem_spots == 0),
            )
        )

    all_logs = db.query(DataIntakeLog).order_by(DataIntakeLog.id.desc()).all()
    channel_counts = {"instagram": 0, "whatsapp": 0, "manual": 0}
    department_counts = {
        "booking": 0,
        "trainer_note": 0,
        "member_registry": 0,
        "lead_queue": 0,
    }
    for log in all_logs:
        channel_counts[log.source] = channel_counts.get(log.source, 0) + 1
        department_counts[log.target_department] = (
            department_counts.get(log.target_department, 0) + 1
        )

    recent_logs = [DataIntakeLogOut.model_validate(l) for l in all_logs[:30]]

    return AdminOverviewResponse(
        stats=AdminOverviewStatsOut(
            total_members=total_members,
            total_trainers=total_trainers,
            active_packages_count=active_packages_count,
            total_remaining_credits=total_remaining_credits,
            total_sessions=len(all_sessions),
            active_bookings_count=active_bookings_count,
            low_credit_members_count=low_credit_members_count,
            total_intake_logs=len(all_logs),
        ),
        channel_counts=channel_counts,
        department_counts=department_counts,
        users=directory_users,
        sessions=session_options,
        recent_logs=recent_logs,
    )


@portal_router.post("/admin/users", response_model=AdminCreateUserResponse)
def admin_create_user(payload: AdminCreateUserRequest, db: Session = Depends(get_db)):
    ensure_portal_initialized(db)

    full_name = (payload.full_name or "").strip()
    phone = (payload.phone or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Ad Soyad alanı zorunludur.")
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon numarası zorunludur.")

    ig_handle = normalize_handle(payload.instagram_handle) if payload.instagram_handle else None
    clean_notes = (payload.notes or "").strip()

    new_user = User(
        full_name=full_name,
        phone=phone,
        role=payload.role,
        instagram_handle=ig_handle or None,
        notes=clean_notes,
    )
    db.add(new_user)
    db.flush()

    cred = _ensure_user_credential(db, new_user, pin_code=payload.pin_code or "1234")
    _ensure_user_auth_account(db, new_user, raw_password="Erya2026!")

    created_pkg: Optional[MemberPackage] = None
    if payload.role == "member" and payload.package_credits and payload.package_credits > 0:
        pkg_title = (
            payload.package_name.strip()
            if payload.package_name and payload.package_name.strip()
            else f"{payload.package_credits}'li Stüdyo Üyelik Paketi"
        )
        duration = max(1, payload.package_duration_days or 30)
        expiry_str = (date.today() + timedelta(days=duration)).strftime("%Y-%m-%d")
        created_pkg = MemberPackage(
            member_id=new_user.id,
            package_name=pkg_title,
            total_credits=payload.package_credits,
            remaining_credits=payload.package_credits,
            expiry_date=expiry_str,
            is_active=True,
        )
        db.add(created_pkg)
        db.flush()

    role_tr = "Eğitmen" if payload.role == "trainer" else "Üye"
    pkg_desc = f", {created_pkg.total_credits} ders kredi tanımlandı" if created_pkg else ""
    note_desc = " ve özel/sakatlık notu işlendi" if clean_notes else ""
    summary = f"Admin Kaydı -> {full_name} ({role_tr}) oluşturuldu, {cred.access_code} atandı{pkg_desc}{note_desc}."

    log_entry = DataIntakeLog(
        source="manual",
        sender_name=full_name,
        sender_contact=ig_handle or phone,
        message_or_payload=clean_notes or f"Yeni {role_tr} kaydı ({cred.access_code})",
        target_department="member_registry",
        routed_user_id=new_user.id,
        assigned_access_code=cred.access_code,
        action_summary=summary,
        created_at=_now_str(),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(new_user)
    if created_pkg:
        db.refresh(created_pkg)

    return AdminCreateUserResponse(
        message=f"{full_name} başarıyla kaydedildi. Atanan Özel ID: {cred.access_code}",
        access_code=cred.access_code,
        pin_code=cred.pin_code,
        user=PortalUserSummaryOut(
            id=new_user.id,
            full_name=new_user.full_name,
            phone=new_user.phone,
            role=new_user.role,
            instagram_handle=new_user.instagram_handle,
            notes=new_user.notes or "",
            access_code=cred.access_code,
        ),
        active_package=_to_package_summary(created_pkg),
    )


@portal_router.post("/intake/collect", response_model=DataIntakeCollectResponse)
def collect_and_route_intake_data(
    payload: DataIntakeCollectRequest, db: Session = Depends(get_db)
):
    ensure_portal_initialized(db)

    sender_name = (payload.sender_name or "").strip()
    sender_contact = (payload.sender_contact or "").strip()
    content = (payload.content or "").strip()

    if not sender_contact and not sender_name:
        raise HTTPException(
            status_code=400, detail="Gönderici adı veya iletişim bilgisi (@handle / telefon) zorunludur."
        )
    if not content and not payload.notes and not payload.session_id and not payload.package_credits:
        raise HTTPException(status_code=400, detail="İşlenecek mesaj veya veri içeriği boş olamaz.")

    source_labels = {
        "instagram": "Instagram DM",
        "whatsapp": "WhatsApp",
        "manual": "Manuel Kayıt",
    }
    source_label = source_labels.get(payload.source, payload.source.upper())

    routed_departments: List[str] = []
    summary_parts: List[str] = []

    matched_user: Optional[User] = None
    if sender_contact:
        matched_user = _resolve_user_by_code_or_identifier(
            db, sender_contact, allow_phone_and_handle=True
        )

    if not matched_user and sender_name:
        name_lower = sender_name.replace("İ", "i").replace("I", "ı").lower()
        for u in db.query(User).all():
            if u.full_name.replace("İ", "i").replace("I", "ı").lower() == name_lower:
                matched_user = u
                break

    is_new_user = False
    if not matched_user:
        is_new_user = True
        looks_like_handle = sender_contact.startswith("@") or (
            payload.source == "instagram" and not any(ch.isdigit() for ch in sender_contact[:4])
        )
        ig_handle = normalize_handle(sender_contact) if (sender_contact and looks_like_handle) else None
        phone_val = sender_contact if (sender_contact and not looks_like_handle) else "0500 000 00 00"
        resolved_name = sender_name or (ig_handle.lstrip("@").title() if ig_handle else "Yeni Stüdyo Üyesi")

        matched_user = User(
            full_name=resolved_name,
            phone=phone_val,
            role="member",
            instagram_handle=ig_handle,
            notes="",
        )
        db.add(matched_user)
        db.flush()
        cred = _ensure_user_credential(db, matched_user)
        _ensure_user_auth_account(db, matched_user)
        routed_departments.append("member_registry")
        summary_parts.append(f"Yeni üye oluşturuldu ({cred.access_code})")
    else:
        cred = _ensure_user_credential(db, matched_user)
        _ensure_user_auth_account(db, matched_user)
        if not matched_user.instagram_handle and sender_contact.startswith("@"):
            matched_user.instagram_handle = normalize_handle(sender_contact)

    package_updated = False
    active_pkg = _get_active_package(db, matched_user.id) if matched_user.role == "member" else None
    if matched_user.role == "member" and payload.package_credits and payload.package_credits > 0:
        carried = active_pkg.remaining_credits if active_pkg and active_pkg.remaining_credits > 0 else 0
        if active_pkg:
            active_pkg.is_active = False
        pkg_title = (
            payload.package_name.strip()
            if payload.package_name and payload.package_name.strip()
            else f"{payload.package_credits}'li Çok Kanallı Kayıt Paketi"
        )
        active_pkg = MemberPackage(
            member_id=matched_user.id,
            package_name=pkg_title,
            total_credits=payload.package_credits + carried,
            remaining_credits=payload.package_credits + carried,
            expiry_date=(date.today() + timedelta(days=30)).strftime("%Y-%m-%d"),
            is_active=True,
        )
        db.add(active_pkg)
        db.flush()
        package_updated = True
        if "member_registry" not in routed_departments:
            routed_departments.append("member_registry")
        summary_parts.append(
            f"{payload.package_credits} ders paketi tanımlandı (Toplam Kredi: {active_pkg.remaining_credits})"
        )

    notes_updated = False
    detected_note = _detect_injury_or_special_note(content, payload.notes)
    if detected_note:
        tagged_note = f"[{source_label}] {detected_note}"
        existing_notes = (matched_user.notes or "").strip()
        if not existing_notes:
            matched_user.notes = tagged_note
            notes_updated = True
        elif detected_note.lower() not in existing_notes.lower():
            matched_user.notes = f"{existing_notes} | {tagged_note}"
            notes_updated = True
        else:
            notes_updated = True

        if "trainer_note" not in routed_departments:
            routed_departments.append("trainer_note")
        summary_parts.append("Eğitmen Yoklama ekranına sakatlık/özel not iletildi")

    booking_result: Optional[IntakeBookingResultOut] = None
    target_session: Optional[ClassSession] = None

    all_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    today = date.today()
    today_iso = today.strftime("%Y-%m-%d")
    tomorrow_iso = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after_iso = (today + timedelta(days=2)).strftime("%Y-%m-%d")

    parsed_nlp = fallback_turkish_nlp_parse(content, today_iso, tomorrow_iso, day_after_iso) if content else {"intent": "list"}

    if payload.session_id is not None:
        target_session = next((s for s in all_sessions if s.id == payload.session_id), None)
        if not target_session:
            raise HTTPException(status_code=404, detail="Seçilen ders seansı bulunamadı.")
    elif parsed_nlp.get("intent") == "book":
        matched_s, _ = match_session(
            all_sessions,
            parsed_nlp.get("target_date") or today_iso,
            parsed_nlp.get("start_time"),
            parsed_nlp.get("keyword"),
        )
        if not matched_s and not parsed_nlp.get("target_date") and parsed_nlp.get("start_time"):
            matched_s, _ = match_session(
                all_sessions, None, parsed_nlp.get("start_time"), parsed_nlp.get("keyword")
            )
        target_session = matched_s

    if target_session is not None and matched_user.role == "member":
        trainer_name = target_session.trainer.full_name if target_session.trainer else "Eğitmen"
        existing_active = (
            db.query(Booking)
            .filter(
                Booking.session_id == target_session.id,
                Booking.member_id == matched_user.id,
                Booking.status.in_(["booked", "attended"]),
            )
            .first()
        )
        active_pkg = _get_active_package(db, matched_user.id)

        if existing_active:
            booking_result = IntakeBookingResultOut(
                booked=False,
                status_code="already_booked",
                message=f"{target_session.date} {target_session.start_time} {target_session.title} dersine zaten kayıtlı.",
                booking_id=existing_active.id,
                session_id=target_session.id,
                session_title=target_session.title,
                date=target_session.date,
                start_time=target_session.start_time,
                trainer_name=trainer_name,
                remaining_credits=active_pkg.remaining_credits if active_pkg else 0,
            )
            if "booking" not in routed_departments:
                routed_departments.append("booking")
            summary_parts.append(f"{target_session.start_time} {target_session.title} mevcut kaydı doğrulandı")
        elif target_session.current_enrolled >= target_session.capacity:
            booking_result = IntakeBookingResultOut(
                booked=False,
                status_code="session_full",
                message=f"{target_session.title} ({target_session.start_time}) kontenjanı dolu ({target_session.current_enrolled}/{target_session.capacity}).",
                session_id=target_session.id,
                session_title=target_session.title,
                date=target_session.date,
                start_time=target_session.start_time,
                trainer_name=trainer_name,
                remaining_credits=active_pkg.remaining_credits if active_pkg else 0,
            )
            summary_parts.append(f"{target_session.start_time} dersi dolu olduğu için yedek/aday kuyruğuna alındı")
        elif not active_pkg or active_pkg.remaining_credits <= 0:
            booking_result = IntakeBookingResultOut(
                booked=False,
                status_code="no_credits",
                message="Üyenin aktif ders kredisi bulunmadığı için randevu onayı kredi yüklemesi bekliyor.",
                session_id=target_session.id,
                session_title=target_session.title,
                date=target_session.date,
                start_time=target_session.start_time,
                trainer_name=trainer_name,
                remaining_credits=0,
            )
            summary_parts.append("Ders talebi alındı (paket kredisi yüklenmesi bekleniyor)")
        else:
            cancelled_prev = (
                db.query(Booking)
                .filter(
                    Booking.session_id == target_session.id,
                    Booking.member_id == matched_user.id,
                    Booking.status == "cancelled",
                )
                .first()
            )
            if cancelled_prev:
                cancelled_prev.status = "booked"
                cancelled_prev.package_id = active_pkg.id
                booking_obj = cancelled_prev
            else:
                booking_obj = Booking(
                    session_id=target_session.id,
                    member_id=matched_user.id,
                    package_id=active_pkg.id,
                    status="booked",
                )
                db.add(booking_obj)

            active_pkg.remaining_credits -= 1
            target_session.current_enrolled += 1
            db.flush()

            booking_result = IntakeBookingResultOut(
                booked=True,
                status_code="booked",
                message=(
                    f"{_format_day_label_tr(target_session.date)} {target_session.start_time} "
                    f"{target_session.title} ({trainer_name}) dersine kayıt yapıldı (-1 kredi)."
                ),
                booking_id=booking_obj.id,
                session_id=target_session.id,
                session_title=target_session.title,
                date=target_session.date,
                start_time=target_session.start_time,
                trainer_name=trainer_name,
                remaining_credits=active_pkg.remaining_credits,
            )
            if "booking" not in routed_departments:
                routed_departments.append("booking")
            summary_parts.append(
                f"{target_session.date} {target_session.start_time} {target_session.title} randevusu oluşturuldu (Kalan: {active_pkg.remaining_credits})"
            )

    if not routed_departments:
        routed_departments.append("lead_queue")
        summary_parts.append("Talep müşteri iletişim / aday havuzuna yönlendirildi")

    if "booking" in routed_departments:
        primary_department = "booking"
    elif "trainer_note" in routed_departments:
        primary_department = "trainer_note"
    elif "member_registry" in routed_departments:
        primary_department = "member_registry"
    else:
        primary_department = "lead_queue"

    action_summary = f"{source_label} ({cred.access_code}) -> " + "; ".join(summary_parts) + "."

    final_pkg = _get_active_package(db, matched_user.id) if matched_user.role == "member" else None
    rem_credits = final_pkg.remaining_credits if final_pkg else 0
    tot_credits = final_pkg.total_credits if final_pkg else 0

    log_entry = DataIntakeLog(
        source=payload.source,
        sender_name=matched_user.full_name,
        sender_contact=sender_contact or matched_user.phone,
        message_or_payload=content or (payload.notes or "Manuel veri kaydı"),
        target_department=primary_department,
        routed_user_id=matched_user.id,
        assigned_access_code=cred.access_code,
        action_summary=action_summary,
        created_at=_now_str(),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(matched_user)
    db.refresh(log_entry)

    return DataIntakeCollectResponse(
        message="Veri başarıyla çekildi, analiz edildi ve ilgili birimlere yönlendirildi.",
        action_summary=action_summary,
        target_department=primary_department,
        routed_departments=routed_departments,
        is_new_user=is_new_user,
        assigned_access_code=cred.access_code,
        user=PortalUserSummaryOut(
            id=matched_user.id,
            full_name=matched_user.full_name,
            phone=matched_user.phone,
            role=matched_user.role,
            instagram_handle=matched_user.instagram_handle,
            notes=matched_user.notes or "",
            access_code=cred.access_code,
        ),
        notes_updated=notes_updated,
        updated_notes=matched_user.notes or "",
        package_updated=package_updated,
        remaining_credits=rem_credits,
        total_credits=tot_credits,
        booking_result=booking_result,
        log=DataIntakeLogOut.model_validate(log_entry),
    )


@portal_router.get("/intake/logs", response_model=List[DataIntakeLogOut])
def list_intake_logs(
    source: Optional[str] = Query(default=None, description="instagram | whatsapp | manual"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)

    query = db.query(DataIntakeLog)
    if source and source.strip():
        query = query.filter(DataIntakeLog.source == source.strip().lower())

    logs = query.order_by(DataIntakeLog.id.desc()).limit(limit).all()
    return [DataIntakeLogOut.model_validate(item) for item in logs]


# ============================================================================
# RESMİ ŞİRKET POLİTİKA SÖZLEŞMESİ, KVKK & GERÇEK KLASÖR ARŞİVİ (/policy/*)
# ============================================================================

COMPANY_POLICY_COMPANY_NAME = "ERYA Pilates & Reformer Stüdyo"
COMPANY_POLICY_TITLE = "ERYA Pilates & Reformer Üyelik, Stüdyo Kuralları ve KVKK Aydınlatma Sözleşmesi"
COMPANY_POLICY_EFFECTIVE_DATE = "2026-01-01"

COMPANY_POLICY_SECTIONS: List[Dict[str, str]] = [
    {
        "heading": "1. Taraflar, Fiziksel Stüdyo Hizmetleri ve Ücretsiz Dijital Araçlar",
        "body": (
            "İşbu sözleşme, ERYA Pilates & Reformer Stüdyo ('Stüdyo') ile stüdyo tarafından "
            "kişiye özel erişim kodu veya üyelik hesabı tanımlanan üye/eğitmen ('Kullanıcı') arasında "
            "stüdyoda yüz yüze gerçekleştirilen fiziksel Reformer Pilates, Cadillac Tower, fonksiyonel "
            "antrenman ve birebir PT ders paketlerinin kullanım koşullarını düzenler. Uygulama üzerinden "
            "yapılan tüm paket ödemeleri yalnızca stüdyoda yüz yüze yapılan fiziksel antrenman, PT ve "
            "Reformer Pilates dersleri içindir. AI Beslenme analizi, vücut haritası ve ilerleme takibi "
            "gibi uygulama içi dijital araçlar tüm aktif kulüp üyelerine ücretsiz dahildir; ayrıca "
            "ücretli dijital ürün veya abonelik olarak satılmaz."
        ),
    },
    {
        "heading": "2. Rezervasyon, Ders İptali ve Kredi Kullanım Kuralları",
        "body": (
            "Üye, aktif paketindeki fiziksel ders kredileri karşılığında mobil/web panel üzerinden seans "
            "rezervasyonu oluşturur; her rezervasyonda 1 ders kredisi bakiyeden anında düşülür. "
            "Planlanan seans başlangıcından en az 6 saat önce yapılan iptallerde 1 ders kredisi "
            "üye paketine otomatik iade edilir. Zamanında iptal edilmeyen veya katılım sağlanmayan "
            "('Gelmedi / No-Show') seanslarda ders kredisi kullanılmış sayılır."
        ),
    },
    {
        "heading": "3. Sağlık Beyanı, Sakatlık Bildirimi ve Tıbbi Sorumluluk Reddi",
        "body": (
            "Kullanıcı, egzersiz yapmasına engel oluşturabilecek kalp-damar, tansiyon, bel/boyun "
            "fıtığı, eklem/menisküs hassasiyeti, yakın dönem ameliyat veya gebelik gibi durumları "
            "seans öncesinde eğitmenine ve sistemdeki Vücut Haritası / Sağlık Notları bölümüne "
            "eksiksiz bildirmeyi taahhüt eder. Eğitmenler, bildirilen hassasiyetlere göre yay "
            "direnci ve hareket modifikasyonu uygular. Bilgilendirme: Uygulamadaki beslenme analizleri, "
            "vücut haritası ve sağlık notları yalnızca spor/fitness takibi amaçlıdır; tıbbi tanı, "
            "tedavi veya doktor tavsiyesi yerine geçmez."
        ),
    },
    {
        "heading": "4. Stüdyo Hijyen, Kıyafet ve Güvenlik Kuralları",
        "body": (
            "Tüm Reformer ve Cadillac seanslarında hijyen ve güvenlik amacıyla kaymaz tabanlı "
            "pilates çorabı ile temiz spor kıyafeti kullanılması zorunludur. Üyeler seans saatinden "
            "en az 10 dakika önce stüdyoda hazır bulunmalı, ekipman kullanımında eğitmenin talimatlarına "
            "eksiksiz uymalıdır."
        ),
    },
    {
        "heading": "5. 6698 Sayılı KVKK Aydınlatma, Açık Rıza ve Hesap Silme Hakkı",
        "body": (
            "Ad-soyad, iletişim bilgileri, rezervasyon ve yoklama geçmişi, vücut ölçüm/postür notları "
            "ile isteğe bağlı beslenme ve su tüketim kayıtları 6698 sayılı Kişisel Verilerin Korunması "
            "Kanunu kapsamında yalnızca stüdyo hizmetlerinin yürütülmesi, antrenman güvenliği ve "
            "kişiselleştirilmiş spor takibi amacıyla işlenir; üçüncü kişilerle ticari amaçla paylaşılmaz. "
            "Kullanıcılar diledikleri zaman uygulama içindeki Profil > Hesabımı Kalıcı Olarak Sil "
            "adımı üzerinden (DELETE /auth/me) hesaplarını ve ilişkili tüm kişisel verilerini kalıcı "
            "olarak silebilirler."
        ),
    },
    {
        "heading": "6. Kişiye Özel Erişim Kodu ve Dijital Onay Geçerliliği",
        "body": (
            "Stüdyo yönetimi tarafından üretilen kişiye özel erişim kodu (ERYA-XXXX) yalnızca ilgili "
            "kullanıcıya aittir ve üçüncü kişilerle paylaşılamaz. İşbu sözleşmenin uygulama üzerinden "
            "ad-soyad beyanı ile onaylanması; zaman damgası, IP bilgisi ve SHA-256 doğrulama özeti "
            "ile birlikte stüdyo dijital arşiv klasöründe hukuki kanıt olarak tek seferlik saklanır."
        ),
    },
]


def _build_policy_full_text() -> str:
    lines = [
        f"{COMPANY_POLICY_COMPANY_NAME.upper()}",
        f"{COMPANY_POLICY_TITLE}",
        f"Sözleşme Versiyonu: {POLICY_VERSION} | Yürürlük Tarihi: {COMPANY_POLICY_EFFECTIVE_DATE}",
        "=" * 78,
        "",
    ]
    for sec in COMPANY_POLICY_SECTIONS:
        lines.append(sec["heading"])
        lines.append("-" * len(sec["heading"]))
        lines.append(sec["body"])
        lines.append("")
    return "\n".join(lines).strip()


def _resolve_optional_session_user(
    db: Session,
    authorization: Optional[str],
    x_admin_token: Optional[str],
    fallback_user_id: Optional[int] = None,
) -> Tuple[Optional[AuthSession], Optional[User]]:
    raw_token = _extract_bearer_token(authorization, x_admin_token, None)
    sess: Optional[AuthSession] = None
    if raw_token:
        cand = db.query(AuthSession).filter(AuthSession.token == raw_token).first()
        if cand and not cand.is_revoked and cand.expires_at >= _now_str():
            sess = cand

    if sess and sess.account_type == "user" and sess.user_id:
        u = db.query(User).filter(User.id == sess.user_id).first()
        if u:
            return sess, u

    if fallback_user_id is not None:
        u = db.query(User).filter(User.id == fallback_user_id).first()
        if u:
            return sess, u

    return sess, None


@policy_router.get("/current", response_model=PolicyCurrentOut)
def get_current_policy(
    user_id: Optional[int] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    sess, user = _resolve_optional_session_user(db, authorization, x_admin_token, user_id)

    accepted = False
    accepted_at: Optional[str] = None
    if sess and sess.account_type == "admin" and user is None:
        accepted = True
    elif user is not None:
        accepted = bool(getattr(user, "policy_accepted", False))
        accepted_at = getattr(user, "policy_accepted_at", None)

    return PolicyCurrentOut(
        version=POLICY_VERSION,
        title=COMPANY_POLICY_TITLE,
        company_name=COMPANY_POLICY_COMPANY_NAME,
        effective_date=COMPANY_POLICY_EFFECTIVE_DATE,
        sections=[PolicySectionOut(heading=s["heading"], body=s["body"]) for s in COMPANY_POLICY_SECTIONS],
        full_text=_build_policy_full_text(),
        policy_accepted=accepted,
        policy_accepted_at=accepted_at,
    )


@policy_router.post("/accept", response_model=PolicyAcceptOut)
def accept_company_policy(
    payload: PolicyAcceptRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    if not payload.accepted:
        raise HTTPException(
            status_code=400,
            detail="Devam etmek için şirket politika sözleşmesini onaylamanız gerekmektedir.",
        )

    signer_name = (payload.signer_name or "").strip()
    if len(signer_name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Onaylayan ad-soyad bilgisi zorunludur.",
        )

    _sess, user = _resolve_optional_session_user(db, authorization, x_admin_token, payload.user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Sözleşme onayı için geçerli kullanıcı oturumu veya user_id gereklidir.",
        )

    SIGNED_POLICIES_DIR.mkdir(parents=True, exist_ok=True)
    cred = _ensure_user_credential(db, user)

    # Kullanıcı daha önce onayladıysa ve dosyası klasörde mevcutsa mevcut arşivi dön (tek seferlik garanti)
    existing_file_name = getattr(user, "policy_file_path", None)
    if user.policy_accepted and existing_file_name:
        safe_existing = SIGNED_POLICIES_DIR / Path(existing_file_name).name
        if safe_existing.is_file():
            existing_text = safe_existing.read_text(encoding="utf-8")
            sha_match = re.search(r"SHA-256 DOĞRULAMA ÖZETİ:\s*([a-fA-F0-9]{64})", existing_text)
            existing_sha = (
                sha_match.group(1)
                if sha_match
                else hashlib.sha256(existing_text.encode("utf-8")).hexdigest()
            )
            return PolicyAcceptOut(
                accepted=True,
                already_accepted=True,
                user_id=user.id,
                policy_version=user.policy_version or POLICY_VERSION,
                accepted_at=user.policy_accepted_at or _now_str(),
                file_name=safe_existing.name,
                sha256=existing_sha,
                message="Şirket politika sözleşmesi daha önce onaylanmış ve arşivlenmiştir.",
            )

    now_dt = datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    file_ts = now_dt.strftime("%Y%m%d_%H%M%S")
    slug = _slugify_tr(user.full_name)[:32]
    base_name = f"sozlesme_user_{user.id}_{slug}_{file_ts}"
    txt_filename = f"{base_name}.txt"
    json_filename = f"{base_name}.json"

    forwarded_for = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = forwarded_for or (request.client.host if request.client else "unknown")
    user_agent = (request.headers.get("user-agent") or "unknown").strip()

    full_policy_text = _build_policy_full_text()
    signature_body = (
        f"{full_policy_text}\n\n"
        f"{'=' * 78}\n"
        f"DİJİTAL ONAY VE ARŞİV KAYDI\n"
        f"{'-' * 78}\n"
        f"Onaylayan Ad Soyad : {signer_name}\n"
        f"Kayıtlı Kullanıcı  : {user.full_name}\n"
        f"Kullanıcı ID       : {user.id}\n"
        f"Kullanıcı Rolü     : {user.role}\n"
        f"Erişim Kodu        : {cred.access_code}\n"
        f"Sözleşme Versiyonu : {POLICY_VERSION}\n"
        f"Onay Tarih / Saat  : {now_str}\n"
        f"İstemci IP         : {client_ip}\n"
        f"User-Agent         : {user_agent}\n"
    )
    sha256_hex = hashlib.sha256(signature_body.encode("utf-8")).hexdigest()
    final_txt_content = (
        f"{signature_body}"
        f"SHA-256 DOĞRULAMA ÖZETİ: {sha256_hex}\n"
        f"{'=' * 78}\n"
    )

    json_payload = {
        "policy_version": POLICY_VERSION,
        "title": COMPANY_POLICY_TITLE,
        "company_name": COMPANY_POLICY_COMPANY_NAME,
        "effective_date": COMPANY_POLICY_EFFECTIVE_DATE,
        "user_id": user.id,
        "full_name": user.full_name,
        "signer_name": signer_name,
        "role": user.role,
        "access_code": cred.access_code,
        "accepted": True,
        "accepted_at": now_str,
        "client_ip": client_ip,
        "user_agent": user_agent,
        "sha256": sha256_hex,
        "txt_file_name": txt_filename,
        "sections": COMPANY_POLICY_SECTIONS,
    }

    txt_path = SIGNED_POLICIES_DIR / txt_filename
    json_path = SIGNED_POLICIES_DIR / json_filename
    txt_path.write_text(final_txt_content, encoding="utf-8")
    json_path.write_text(json.dumps(json_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    user.policy_accepted = True
    user.policy_accepted_at = now_str
    user.policy_version = POLICY_VERSION
    user.policy_file_path = txt_filename
    db.commit()
    db.refresh(user)

    return PolicyAcceptOut(
        accepted=True,
        already_accepted=False,
        user_id=user.id,
        policy_version=POLICY_VERSION,
        accepted_at=now_str,
        file_name=txt_filename,
        sha256=sha256_hex,
        message="Şirket politika sözleşmesi başarıyla onaylandı ve arşivlendi.",
    )


# ============================================================================
# ADMIN ERİŞİM KODU YÖNETİMİ, SÖZLEŞME ARŞİVİ VE AYLIK ANALİTİK (/admin/*)
# ============================================================================


@admin_router.get("/access-codes", response_model=List[AdminAccessCodeItemOut])
def admin_list_access_codes(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    users = db.query(User).order_by(User.id.desc()).all()
    creds_by_uid = {c.user_id: c for c in db.query(UserAccessCredential).all()}
    active_pkgs = db.query(MemberPackage).filter(MemberPackage.is_active == True).all()
    pkg_by_member: Dict[int, MemberPackage] = {}
    for p in active_pkgs:
        if p.member_id not in pkg_by_member or p.id > pkg_by_member[p.member_id].id:
            pkg_by_member[p.member_id] = p

    items: List[AdminAccessCodeItemOut] = []
    dirty = False
    for u in users:
        cred = creds_by_uid.get(u.id)
        if not cred:
            cred = _ensure_user_credential(db, u)
            creds_by_uid[u.id] = cred
            dirty = True
        pkg = pkg_by_member.get(u.id) if u.role == "member" else None
        items.append(
            AdminAccessCodeItemOut(
                user_id=u.id,
                full_name=u.full_name,
                role=u.role,
                phone=u.phone or "",
                access_code=cred.access_code,
                is_active=True,
                last_login_at=getattr(u, "last_login_at", None),
                login_count=int(getattr(u, "login_count", 0) or 0),
                policy_accepted=bool(getattr(u, "policy_accepted", False)),
                policy_accepted_at=getattr(u, "policy_accepted_at", None),
                remaining_credits=int(pkg.remaining_credits) if pkg else 0,
            )
        )
    if dirty:
        db.commit()
    return items


@admin_router.post("/members/create-with-code", response_model=AdminCreateUserWithCodeOut)
def admin_create_user_with_code(
    payload: AdminCreateUserWithCodeRequest,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    full_name = (payload.full_name or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Ad Soyad alanı zorunludur.")

    role = payload.role if payload.role in ("member", "trainer") else "member"
    phone = (payload.phone or "").strip() or "0500 000 00 00"
    notes = (payload.notes or "").strip()
    specialty = (payload.specialty or "").strip() or (
        "Reformer & Fonksiyonel Pilates" if role == "trainer" else None
    )

    desired_code: Optional[str] = None
    if payload.custom_code and payload.custom_code.strip():
        desired_code = _normalize_access_code(payload.custom_code)
        if len(desired_code) < 3:
            raise HTTPException(status_code=400, detail="Özel erişim kodu en az 3 karakter olmalıdır.")
        target_key = _compact_code_key(desired_code)
        for c in db.query(UserAccessCredential).all():
            if _compact_code_key(c.access_code) == target_key:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{desired_code}' erişim kodu zaten başka bir kullanıcıya atanmış.",
                )

    new_user = User(
        full_name=full_name,
        phone=phone,
        role=role,
        notes=notes,
        specialty=specialty,
        streak_days=0,
        body_zones=json.dumps(infer_default_body_zones(full_name, notes), ensure_ascii=False),
        referral_count=0,
        policy_accepted=False,
        policy_version=POLICY_VERSION,
        login_count=0,
    )
    db.add(new_user)
    db.flush()

    new_user.referral_code = generate_unique_referral_code(db, full_name, exclude_user_id=new_user.id)
    db.flush()

    final_code = desired_code or _generate_unique_access_code(db, new_user.id, prefix="ERYA")
    cred = UserAccessCredential(
        user_id=new_user.id,
        access_code=final_code,
        pin_code="1234",
        created_at=_now_str(),
    )
    db.add(cred)
    db.flush()

    _ensure_user_auth_account(db, new_user)

    init_credits = max(0, int(payload.initial_credits or 0))
    if role == "member" and init_credits > 0:
        db.add(
            MemberPackage(
                member_id=new_user.id,
                package_name=f"{init_credits} Seans Stüdyo Paketi",
                total_credits=init_credits,
                remaining_credits=init_credits,
                expiry_date=(date.today() + timedelta(days=45)).strftime("%Y-%m-%d"),
                is_active=True,
            )
        )

    db.commit()
    db.refresh(new_user)

    return AdminCreateUserWithCodeOut(
        user_id=new_user.id,
        full_name=new_user.full_name,
        role=new_user.role,
        phone=new_user.phone or "",
        access_code=final_code,
        is_active=True,
        remaining_credits=init_credits if role == "member" else 0,
        policy_accepted=False,
        policy_accepted_at=None,
        specialty=new_user.specialty,
        notes=new_user.notes or "",
        message=f"{new_user.full_name} için {final_code} kişisel erişim kodu oluşturuldu.",
    )


@admin_router.post("/users/{user_id}/regenerate-code", response_model=AdminRegenerateCodeOut)
def admin_regenerate_user_code(
    user_id: int,
    payload: Optional[AdminRegenerateCodeRequest] = Body(default=None),
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    cred = db.query(UserAccessCredential).filter(UserAccessCredential.user_id == user.id).first()
    previous_code = cred.access_code if cred else None

    custom_raw = (payload.custom_code or "").strip() if payload and payload.custom_code else ""
    if custom_raw:
        new_code = _normalize_access_code(custom_raw)
        if len(new_code) < 3:
            raise HTTPException(status_code=400, detail="Özel erişim kodu en az 3 karakter olmalıdır.")
        target_key = _compact_code_key(new_code)
        for existing in db.query(UserAccessCredential).filter(UserAccessCredential.user_id != user.id).all():
            if _compact_code_key(existing.access_code) == target_key:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{new_code}' erişim kodu zaten başka bir kullanıcı tarafından kullanılıyor.",
                )
    else:
        new_code = _generate_unique_access_code(
            db,
            user.id,
            prefix="ERYA",
            randomized=True,
            exclude_code=previous_code,
        )

    if cred:
        cred.access_code = new_code
    else:
        cred = UserAccessCredential(
            user_id=user.id,
            access_code=new_code,
            pin_code="1234",
            created_at=_now_str(),
        )
        db.add(cred)

    db.commit()
    return AdminRegenerateCodeOut(
        user_id=user.id,
        full_name=user.full_name,
        role=user.role,
        previous_code=previous_code,
        access_code=new_code,
        message=f"{user.full_name} için yeni erişim kodu: {new_code}",
    )


@admin_router.get("/policies", response_model=AdminPoliciesOverviewOut)
def admin_list_policies(
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    SIGNED_POLICIES_DIR.mkdir(parents=True, exist_ok=True)

    users = db.query(User).order_by(User.id.asc()).all()
    creds_by_uid = {c.user_id: c for c in db.query(UserAccessCredential).all()}

    records: List[AdminPolicyRecordOut] = []
    signed_count = 0
    pending_count = 0

    for u in users:
        cred = creds_by_uid.get(u.id) or _ensure_user_credential(db, u)
        accepted = bool(getattr(u, "policy_accepted", False))
        fname = getattr(u, "policy_file_path", None)
        file_exists = False
        file_size = 0

        if fname:
            candidate = SIGNED_POLICIES_DIR / Path(fname).name
            if candidate.is_file():
                file_exists = True
                file_size = candidate.stat().st_size
                fname = candidate.name

        if accepted:
            signed_count += 1
        else:
            pending_count += 1

        records.append(
            AdminPolicyRecordOut(
                user_id=u.id,
                full_name=u.full_name,
                role=u.role,
                access_code=cred.access_code,
                policy_accepted=accepted,
                policy_accepted_at=getattr(u, "policy_accepted_at", None),
                policy_version=getattr(u, "policy_version", None) or POLICY_VERSION,
                file_name=fname,
                file_exists=file_exists,
                file_size_bytes=file_size,
            )
        )

    records.sort(
        key=lambda r: (
            0 if r.policy_accepted else 1,
            r.policy_accepted_at or "",
            r.user_id,
        )
    )
    db.commit()

    return AdminPoliciesOverviewOut(
        signed_count=signed_count,
        pending_count=pending_count,
        storage_folder=str(SIGNED_POLICIES_DIR),
        records=records,
    )


@admin_router.get("/policies/{user_id}/document", response_model=AdminPolicyDocumentOut)
def admin_get_policy_document(
    user_id: int,
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    target_path: Optional[Path] = None
    if user.policy_file_path:
        cand = SIGNED_POLICIES_DIR / Path(user.policy_file_path).name
        if cand.is_file():
            target_path = cand

    if target_path is None and SIGNED_POLICIES_DIR.is_dir():
        matches = sorted(SIGNED_POLICIES_DIR.glob(f"sozlesme_user_{user.id}_*.txt"), reverse=True)
        if matches:
            target_path = matches[0]

    if target_path is None or not target_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Bu kullanıcıya ait imzalanmış sözleşme dosyası arşivde bulunamadı.",
        )

    content = target_path.read_text(encoding="utf-8")
    return AdminPolicyDocumentOut(
        user_id=user.id,
        full_name=user.full_name,
        file_name=target_path.name,
        accepted_at=getattr(user, "policy_accepted_at", None),
        content=content,
    )


_TR_MONTH_NAMES = {
    1: "Ocak",
    2: "Şubat",
    3: "Mart",
    4: "Nisan",
    5: "Mayıs",
    6: "Haziran",
    7: "Temmuz",
    8: "Ağustos",
    9: "Eylül",
    10: "Ekim",
    11: "Kasım",
    12: "Aralık",
}


def _session_duration_hours(session: ClassSession) -> float:
    actual_min = getattr(session, "actual_duration_minutes", None)
    if actual_min is not None and actual_min > 0:
        return round(actual_min / 60.0, 4)
    try:
        st = datetime.strptime((session.start_time or "").strip(), "%H:%M")
        en = datetime.strptime((session.end_time or "").strip(), "%H:%M")
        diff_min = (en - st).total_seconds() / 60.0
        if diff_min > 0:
            return round(diff_min / 60.0, 4)
    except Exception:
        pass
    return round(50.0 / 60.0, 4)


@admin_router.get("/analytics/monthly", response_model=AdminMonthlyAnalyticsOut)
def admin_monthly_analytics(
    month: Optional[str] = Query(default=None, description="YYYY-MM formatında ay (boşsa mevcut ay)"),
    _admin: AdminAccount = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ensure_portal_initialized(db)
    today = date.today()
    today_iso = today.strftime("%Y-%m-%d")

    target_month = (month or "").strip() or today.strftime("%Y-%m")
    if not re.match(r"^\d{4}-\d{2}$", target_month):
        raise HTTPException(status_code=400, detail="month parametresi YYYY-MM formatında olmalıdır.")

    yr_int, mo_int = int(target_month[:4]), int(target_month[5:7])
    if not (1 <= mo_int <= 12):
        raise HTTPException(status_code=400, detail="Geçersiz ay değeri.")
    month_label = f"{_TR_MONTH_NAMES.get(mo_int, str(mo_int))} {yr_int}"

    trainers = db.query(User).filter(User.role == "trainer").order_by(User.id.asc()).all()
    members = db.query(User).filter(User.role == "member").order_by(User.id.asc()).all()
    creds_by_uid = {c.user_id: c for c in db.query(UserAccessCredential).all()}

    active_pkgs = db.query(MemberPackage).filter(MemberPackage.is_active == True).all()
    pkg_by_member: Dict[int, MemberPackage] = {}
    for p in active_pkgs:
        if p.member_id not in pkg_by_member or p.id > pkg_by_member[p.member_id].id:
            pkg_by_member[p.member_id] = p

    auth_session_user_ids = {
        row[0]
        for row in db.query(AuthSession.user_id)
        .filter(AuthSession.user_id.isnot(None))
        .distinct()
        .all()
    }

    month_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.bookings))
        .filter(ClassSession.date.like(f"{target_month}-%"))
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    sessions_by_trainer: Dict[int, List[ClassSession]] = {}
    for s in month_sessions:
        sessions_by_trainer.setdefault(s.trainer_id, []).append(s)

    # Üye bazlı o ayki katılım istatistikleri
    member_attended_count: Dict[int, int] = {}
    member_no_show_count: Dict[int, int] = {}
    member_hours_attended: Dict[int, float] = {}
    member_has_month_booking: set = set()

    for s in month_sessions:
        dur_h = _session_duration_hours(s)
        for b in s.bookings:
            if b.status != "cancelled":
                member_has_month_booking.add(b.member_id)
            if b.status == "attended":
                member_attended_count[b.member_id] = member_attended_count.get(b.member_id, 0) + 1
                member_hours_attended[b.member_id] = member_hours_attended.get(b.member_id, 0.0) + dur_h
            elif b.status == "no_show":
                member_no_show_count[b.member_id] = member_no_show_count.get(b.member_id, 0) + 1

    trainer_stats: List[AdminMonthlyTrainerStatOut] = []
    total_trainer_hours = 0.0
    total_sessions_scheduled = 0
    total_sessions_entered = 0

    for t in trainers:
        cred = creds_by_uid.get(t.id) or _ensure_user_credential(db, t)
        t_sessions = sessions_by_trainer.get(t.id, [])
        sched_cnt = len(t_sessions)
        entered_cnt = 0
        completed_cnt = 0
        hours_taught = 0.0
        attended_students = 0
        no_show_students = 0
        unique_trained: set = set()

        for s in t_sessions:
            s_status = getattr(s, "session_status", None) or "scheduled"
            s_bookings = [b for b in s.bookings if b.status != "cancelled"]
            s_attended = [b for b in s_bookings if b.status == "attended"]
            s_no_show = [b for b in s_bookings if b.status == "no_show"]

            has_attendance_activity = (len(s_attended) + len(s_no_show)) > 0
            is_entered = (
                s_status in ("in_progress", "completed")
                or bool(getattr(s, "started_at", None))
                or has_attendance_activity
            )
            is_completed = (s_status == "completed") or (s.date < today_iso and has_attendance_activity)

            if is_entered:
                entered_cnt += 1
                hours_taught += _session_duration_hours(s)
            if is_completed:
                completed_cnt += 1

            attended_students += len(s_attended)
            no_show_students += len(s_no_show)
            for b in s_attended:
                unique_trained.add(b.member_id)

        denom = attended_students + no_show_students
        att_rate = round((attended_students / denom) * 100.0, 1) if denom > 0 else 0.0
        hours_taught_r = round(hours_taught, 2)

        total_trainer_hours += hours_taught
        total_sessions_scheduled += sched_cnt
        total_sessions_entered += entered_cnt

        trainer_stats.append(
            AdminMonthlyTrainerStatOut(
                trainer_id=t.id,
                full_name=t.full_name,
                specialty=t.specialty,
                access_code=cred.access_code,
                sessions_scheduled=sched_cnt,
                sessions_entered=entered_cnt,
                sessions_completed=completed_cnt,
                total_hours_taught=hours_taught_r,
                total_attended_students=attended_students,
                total_no_show_students=no_show_students,
                attendance_rate_pct=att_rate,
                unique_members_trained=len(unique_trained),
            )
        )

    member_stats: List[AdminMonthlyMemberStatOut] = []
    logged_in_members_count = 0
    active_members_count = 0
    passive_members_count = 0
    worked_with_members_count = 0
    total_member_hours = 0.0
    policy_signed_count = 0
    policy_pending_count = 0

    for m in members:
        cred = creds_by_uid.get(m.id) or _ensure_user_credential(db, m)
        pkg = pkg_by_member.get(m.id)
        rem_credits = int(pkg.remaining_credits) if pkg else 0
        login_cnt = int(getattr(m, "login_count", 0) or 0)
        last_login = getattr(m, "last_login_at", None)
        has_logged_in = (login_cnt > 0) or bool(last_login) or (m.id in auth_session_user_ids)
        att_cnt = member_attended_count.get(m.id, 0)
        ns_cnt = member_no_show_count.get(m.id, 0)
        hrs_att = round(member_hours_attended.get(m.id, 0.0), 2)
        pol_acc = bool(getattr(m, "policy_accepted", False))
        pol_at = getattr(m, "policy_accepted_at", None)

        is_active_member = (att_cnt > 0) or has_logged_in or (m.id in member_has_month_booking)
        m_status: Literal["active", "passive"] = "active" if is_active_member else "passive"

        if has_logged_in:
            logged_in_members_count += 1
        if is_active_member:
            active_members_count += 1
        else:
            passive_members_count += 1
        if att_cnt > 0:
            worked_with_members_count += 1
        total_member_hours += member_hours_attended.get(m.id, 0.0)
        if pol_acc:
            policy_signed_count += 1
        else:
            policy_pending_count += 1

        member_stats.append(
            AdminMonthlyMemberStatOut(
                member_id=m.id,
                full_name=m.full_name,
                phone=m.phone or "",
                access_code=cred.access_code,
                status=m_status,
                has_logged_in=has_logged_in,
                last_login_at=last_login,
                login_count=login_cnt,
                attended_sessions=att_cnt,
                no_show_sessions=ns_cnt,
                total_hours_attended=hrs_att,
                remaining_credits=rem_credits,
                policy_accepted=pol_acc,
                policy_accepted_at=pol_at,
            )
        )

    db.commit()

    summary = AdminMonthlySummaryOut(
        month=target_month,
        month_label=month_label,
        total_trainer_hours=round(total_trainer_hours, 2),
        total_sessions_scheduled=total_sessions_scheduled,
        total_sessions_entered=total_sessions_entered,
        total_registered_members=len(members),
        logged_in_members_count=logged_in_members_count,
        active_members_count=active_members_count,
        passive_members_count=passive_members_count,
        worked_with_members_count=worked_with_members_count,
        total_member_hours=round(total_member_hours, 2),
        policy_signed_count=policy_signed_count,
        policy_pending_count=policy_pending_count,
    )

    return AdminMonthlyAnalyticsOut(
        month=target_month,
        month_label=month_label,
        summary=summary,
        trainers=trainer_stats,
        members=member_stats,
    )
