import json
import re
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base

STANDARD_BODY_ZONES: List[str] = [
    "Omuz/Boyun",
    "Göğüs",
    "Sırt/Bel",
    "Kollar",
    "Karın/Core",
    "Kalça/Bacak",
    "Diz/Eklem",
]
VALID_ZONE_STATUSES = {"healthy", "warning", "injured"}

WATER_GOAL_ML = 3000
CALORIES_GOAL = 2100
PROTEIN_GOAL_G = 140
CARBS_GOAL_G = 220
FAT_GOAL_G = 65


def _tr_lower(text_val: Optional[str]) -> str:
    if not text_val:
        return ""
    return text_val.replace("İ", "i").replace("I", "ı").lower()


def clean_tr_uppercase(text_val: Optional[str]) -> str:
    if not text_val:
        return ""
    tr_map = str.maketrans(
        "çğıiöşüÇĞİIÖŞÜ",
        "CGIIOSUCGIIOSU",
    )
    translated = text_val.translate(tr_map).upper()
    return re.sub(r"[^A-Z0-9]", "", translated)


def normalize_referral_code_input(raw_code: Optional[str]) -> str:
    return clean_tr_uppercase(raw_code)


def infer_default_body_zones(full_name: Optional[str] = "", notes: Optional[str] = "") -> Dict[str, str]:
    zones: Dict[str, str] = {zone: "healthy" for zone in STANDARD_BODY_ZONES}
    name_low = _tr_lower(full_name)
    notes_low = _tr_lower(notes)

    if "ahmet" in name_low:
        zones["Diz/Eklem"] = "warning"
        return zones

    if any(k in notes_low for k in ("diz", "menisküs", "meniskus", "eklem", "çapraz", "capraz")):
        zones["Diz/Eklem"] = "warning"
    if any(k in notes_low for k in ("bel", "lomber", "l4", "l5", "s1", "skolyoz", "fıtık", "fitik", "sırt", "sirt", "torakal")):
        zones["Sırt/Bel"] = "warning"
    if any(k in notes_low for k in ("omuz", "boyun", "servikal", "c5", "c6", "trapez", "skapula", "impingement")):
        zones["Omuz/Boyun"] = "warning"
    if any(k in notes_low for k in ("bilek", "karpal", "kol", "dirsek")):
        zones["Kollar"] = "warning"
    if any(k in notes_low for k in ("diastasis", "karın", "karin", "prenatal", "hamile", "postnatal")):
        zones["Karın/Core"] = "warning"
    if any(k in notes_low for k in ("kalça", "kalca", "piriformis", "siyatik", "bacak", "hamstring", "gluteal")):
        zones["Kalça/Bacak"] = "warning"
    if any(k in notes_low for k in ("göğüs", "gogus", "pektoral")):
        zones["Göğüs"] = "warning"

    return zones


def normalize_body_zones_payload(
    incoming: Optional[Dict[str, str]],
    base_zones: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    result: Dict[str, str] = {
        zone: (
            base_zones.get(zone, "healthy")
            if base_zones and base_zones.get(zone) in VALID_ZONE_STATUSES
            else "healthy"
        )
        for zone in STANDARD_BODY_ZONES
    }
    if not incoming or not isinstance(incoming, dict):
        return result

    for key, val in incoming.items():
        if key in result and isinstance(val, str):
            cleaned_val = val.strip().lower()
            if cleaned_val in VALID_ZONE_STATUSES:
                result[key] = cleaned_val
    return result


def get_user_body_zones_dict(user: "User") -> Dict[str, str]:
    defaults = infer_default_body_zones(user.full_name, user.notes)
    raw = getattr(user, "body_zones", None)
    if not raw:
        return defaults
    if isinstance(raw, dict):
        return normalize_body_zones_payload(raw, base_zones=defaults)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return normalize_body_zones_payload(parsed, base_zones=defaults)
    except Exception:
        pass
    return defaults


def generate_unique_referral_code(
    db,
    full_name: str,
    exclude_user_id: Optional[int] = None,
) -> str:
    parts = (full_name or "").strip().split()
    first_word = parts[0] if parts else "FIT"
    prefix = clean_tr_uppercase(first_word)
    if len(prefix) < 2:
        prefix = clean_tr_uppercase(full_name)
    if len(prefix) < 2:
        prefix = "FIT"
    prefix = prefix[:14]

    suffix_num = 10
    while True:
        candidate = f"{prefix}{suffix_num}"
        q = db.query(User).filter(User.referral_code == candidate)
        if exclude_user_id is not None:
            q = q.filter(User.id != exclude_user_id)
        if q.first() is None:
            return candidate
        suffix_num += 1


def grant_bonus_credit_to_member(
    db,
    member_id: int,
    credits_to_add: int = 1,
    fallback_package_name: str = "Arkadaş Daveti Hediye Paketi",
) -> "MemberPackage":
    active_pkg = (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id, MemberPackage.is_active == True)
        .order_by(MemberPackage.id.desc())
        .first()
    )
    if active_pkg:
        active_pkg.remaining_credits = max(0, active_pkg.remaining_credits) + credits_to_add
        active_pkg.total_credits = max(
            active_pkg.total_credits + credits_to_add,
            active_pkg.remaining_credits,
        )
        db.flush()
        return active_pkg

    expiry_str = (date.today() + timedelta(days=45)).strftime("%Y-%m-%d")
    gift_pkg = MemberPackage(
        member_id=member_id,
        package_name=fallback_package_name,
        total_credits=credits_to_add,
        remaining_credits=credits_to_add,
        expiry_date=expiry_str,
        is_active=True,
    )
    db.add(gift_pkg)
    db.flush()
    return gift_pkg


def compute_wellness_pcts(water_ml: int, protein_g: int) -> Tuple[int, int]:
    w_pct = min(100, max(0, int(round(((water_ml or 0) * 100.0) / WATER_GOAL_ML))))
    p_pct = min(100, max(0, int(round(((protein_g or 0) * 100.0) / PROTEIN_GOAL_G))))
    return w_pct, p_pct


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(150), nullable=True, index=True)
    phone = Column(String(30), nullable=False)
    role = Column(String(20), nullable=False, index=True)  # 'member' | 'trainer'
    instagram_handle = Column(String(80), nullable=True, index=True)
    notes = Column(Text, nullable=True, default="")

    # Ticari Kulüp Genişletme Alanları
    avatar_url = Column(String(500), nullable=True)
    specialty = Column(String(200), nullable=True)
    bio = Column(Text, nullable=True)
    rating = Column(Float, nullable=True, default=4.9)
    experience_years = Column(Integer, nullable=True, default=5)
    streak_days = Column(Integer, nullable=False, default=0)

    # Bildirim Tercihleri
    notify_reminders = Column(Boolean, nullable=False, default=True)
    notify_waitlist = Column(Boolean, nullable=False, default=True)
    notify_campaigns = Column(Boolean, nullable=False, default=False)

    # Vücut Haritası & Davet Sistemi Alanları
    body_zones = Column(Text, nullable=True)
    referral_code = Column(String(40), nullable=True, index=True)
    referral_count = Column(Integer, nullable=False, default=0)

    # Şirket Politika Sözleşmesi & Giriş Takip Alanları
    policy_accepted = Column(Boolean, nullable=False, default=False)
    policy_accepted_at = Column(String(40), nullable=True)
    policy_version = Column(String(20), nullable=False, default="v1.0")
    policy_file_path = Column(String(260), nullable=True)
    last_login_at = Column(String(40), nullable=True)
    login_count = Column(Integer, nullable=False, default=0)

    packages = relationship(
        "MemberPackage",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    trained_sessions = relationship(
        "ClassSession",
        back_populates="trainer",
        cascade="all, delete-orphan",
    )
    bookings = relationship(
        "Booking",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    body_metrics = relationship(
        "BodyMetrics",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    waitlist_entries = relationship(
        "Waitlist",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    wellness_logs = relationship(
        "DailyWellness",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    meal_logs = relationship(
        "NutritionMealLog",
        back_populates="member",
        cascade="all, delete-orphan",
    )

    @property
    def certificates(self) -> List[str]:
        if self.role != "trainer":
            return []
        raw_bio = self.bio or ""
        for line in raw_bio.splitlines():
            stripped = line.strip()
            if stripped.lower().startswith("sertifikalar:"):
                cert_part = stripped.split(":", 1)[1].strip()
                items = [c.strip() for c in cert_part.split("|") if c.strip()]
                if items:
                    return items
        if self.specialty:
            return [f"{self.specialty} Uzmanlık Sertifikası", "Kidemli Antrenör Lisansı"]
        return ["Profesyonel Spor Eğitmenliği Sertifikası"]


class MemberPackage(Base):
    __tablename__ = "member_packages"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    package_name = Column(String(150), nullable=False)
    total_credits = Column(Integer, nullable=False)
    remaining_credits = Column(Integer, nullable=False)
    expiry_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    is_active = Column(Boolean, default=True, nullable=False, index=True)

    member = relationship("User", back_populates="packages")
    bookings = relationship("Booking", back_populates="package")


class ClassSession(Base):
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    category = Column(String(60), nullable=False, default="Fonksiyonel")  # 'Birebir PT' | 'Reformer' | 'Fonksiyonel' | 'Boks'
    room = Column(String(80), nullable=True, default="Ana Stüdyo")
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    start_time = Column(String(10), nullable=False)  # HH:MM
    end_time = Column(String(10), nullable=False)  # HH:MM
    capacity = Column(Integer, nullable=False)
    current_enrolled = Column(Integer, default=0, nullable=False)
    started_at = Column(String(40), nullable=True)
    ended_at = Column(String(40), nullable=True)
    actual_duration_minutes = Column(Integer, nullable=True)
    session_status = Column(String(30), nullable=False, default="scheduled", index=True)  # 'scheduled' | 'in_progress' | 'completed'

    trainer = relationship("User", back_populates="trained_sessions")
    bookings = relationship(
        "Booking",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    waitlist_entries = relationship(
        "Waitlist",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    package_id = Column(Integer, ForeignKey("member_packages.id"), nullable=False, index=True)
    status = Column(String(20), default="booked", nullable=False, index=True)  # 'booked' | 'attended' | 'cancelled' | 'no_show'
    checked_in_at = Column(String(40), nullable=True)

    session = relationship("ClassSession", back_populates="bookings")
    member = relationship("User", back_populates="bookings")
    package = relationship("MemberPackage", back_populates="bookings")


class BodyMetrics(Base):
    __tablename__ = "body_metrics"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    weight_kg = Column(Float, nullable=False)
    body_fat_pct = Column(Float, nullable=False)
    muscle_mass_kg = Column(Float, nullable=False)
    trainer_comment = Column(Text, nullable=True, default="")

    member = relationship("User", back_populates="body_metrics")


class Waitlist(Base):
    __tablename__ = "waitlist"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(String(40), nullable=False)  # YYYY-MM-DD HH:MM:SS

    session = relationship("ClassSession", back_populates="waitlist_entries")
    member = relationship("User", back_populates="waitlist_entries")


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), nullable=False)
    content = Column(Text, nullable=False)
    tag = Column(String(60), nullable=False)  # 'Kulüp Haberleri' | 'Kurallar & Bilgilendirme' | 'Kampanyalar'
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    is_pinned = Column(Boolean, default=False, nullable=False, index=True)


class DailyWellness(Base):
    __tablename__ = "daily_wellness"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    water_ml = Column(Integer, nullable=False, default=0)
    sleep_hours = Column(Float, nullable=False, default=7.5)
    energy_status = Column(String(20), nullable=False, default="normal")  # 'high' | 'normal' | 'low'
    calories_intake = Column(Integer, nullable=False, default=0)
    protein_g = Column(Integer, nullable=False, default=0)
    carbs_g = Column(Integer, nullable=False, default=0)
    fat_g = Column(Integer, nullable=False, default=0)

    member = relationship("User", back_populates="wellness_logs")


class NutritionMealLog(Base):
    __tablename__ = "nutrition_meal_logs"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    created_at = Column(String(40), nullable=False)  # YYYY-MM-DD HH:MM:SS
    source = Column(String(20), nullable=False, default="photo")  # 'photo' | 'text'
    meal_type = Column(String(40), nullable=False, default="Öğle")
    portion_size = Column(String(30), nullable=False, default="Normal")
    meal_description = Column(Text, nullable=False, default="")
    photo_thumbnail = Column(Text, nullable=True)
    calories = Column(Integer, nullable=False, default=0)
    protein_g = Column(Integer, nullable=False, default=0)
    carbs_g = Column(Integer, nullable=False, default=0)
    fat_g = Column(Integer, nullable=False, default=0)
    fiber_g = Column(Integer, nullable=False, default=0)
    sugar_g = Column(Integer, nullable=False, default=0)
    health_score = Column(Integer, nullable=False, default=75)
    glycemic_load = Column(String(30), nullable=False, default="Orta")
    burn_equivalent = Column(String(180), nullable=False, default="")
    detected_items_json = Column(Text, nullable=False, default="[]")
    coach_note = Column(Text, nullable=False, default="")

    member = relationship("User", back_populates="meal_logs")
