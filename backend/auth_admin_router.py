import re
from datetime import date, datetime, timedelta
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from auth_admin_models import AdminAccount, DataIntakeLog, UserAccessCredential
from database import Base, engine, get_db
from instagram_service import fallback_turkish_nlp_parse, match_session, normalize_handle
from models import Booking, ClassSession, MemberPackage, User

router = APIRouter(prefix="/portal", tags=["Portal Auth, Admin & Data Intake"])


# ============================================================================
# PYDANTIC ŞEMALARI (Mevcut schemas.py dosyasına dokunmadan izole tanımlandı)
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


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


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


def _generate_unique_access_code(db: Session, user_id: int) -> str:
    base_num = 1000 + user_id
    candidate = f"FIT-{base_num}"
    while db.query(UserAccessCredential).filter(UserAccessCredential.access_code == candidate).first():
        base_num += 1
        candidate = f"FIT-{base_num}"
    return candidate


def _ensure_user_credential(db: Session, user: User, pin_code: str = "1234") -> UserAccessCredential:
    cred = db.query(UserAccessCredential).filter(UserAccessCredential.user_id == user.id).first()
    if cred:
        return cred
    code = _generate_unique_access_code(db, user.id)
    cred = UserAccessCredential(
        user_id=user.id,
        access_code=code,
        pin_code=(pin_code or "1234").strip() or "1234",
        created_at=_now_str(),
    )
    db.add(cred)
    db.flush()
    return cred


def ensure_portal_initialized(db: Session) -> None:
    """
    Tabloları oluşturur, mevcut tüm User kayıtlarına otomatik FIT-XXXX kodu atar,
    varsayılan admin ('admin' / 'admin123') ve örnek çok kanallı veri kayıtlarını hazırlar.
    """
    Base.metadata.create_all(bind=engine)
    dirty = False

    # 1. Mevcut tüm kullanıcılara benzersiz FIT-{1000 + user.id} erişim kodu ata
    all_users = db.query(User).order_by(User.id.asc()).all()
    existing_creds = {
        c.user_id: c for c in db.query(UserAccessCredential).all()
    }
    used_codes = {c.access_code for c in existing_creds.values()}

    for u in all_users:
        if u.id not in existing_creds:
            base_num = 1000 + u.id
            candidate = f"FIT-{base_num}"
            while candidate in used_codes:
                base_num += 1
                candidate = f"FIT-{base_num}"
            cred = UserAccessCredential(
                user_id=u.id,
                access_code=candidate,
                pin_code="1234",
                created_at=_now_str(),
            )
            db.add(cred)
            existing_creds[u.id] = cred
            used_codes.add(candidate)
            dirty = True

    # 2. Varsayılan Admin hesabı ('admin' / 'admin123')
    admin_acc = db.query(AdminAccount).filter(AdminAccount.username == "admin").first()
    if not admin_acc:
        db.add(
            AdminAccount(
                username="admin",
                password="admin123",
                full_name="Stüdyo Baş Yöneticisi",
            )
        )
        dirty = True

    # 3. Örnek Instagram / WhatsApp / Manuel Veri Çekme Kayıtları
    if db.query(DataIntakeLog).count() == 0:
        user_by_name = {u.full_name: u for u in all_users}
        ahmet = user_by_name.get("Ahmet Yılmaz")
        zeynep = user_by_name.get("Zeynep Kaya")
        mert = user_by_name.get("Mert Demir")

        ahmet_code = existing_creds[ahmet.id].access_code if ahmet and ahmet.id in existing_creds else "FIT-1003"
        zeynep_code = existing_creds[zeynep.id].access_code if zeynep and zeynep.id in existing_creds else "FIT-1004"
        mert_code = existing_creds[mert.id].access_code if mert and mert.id in existing_creds else "FIT-1005"

        now_dt = datetime.now()
        t1 = (now_dt - timedelta(minutes=42)).strftime("%Y-%m-%d %H:%M:%S")
        t2 = (now_dt - timedelta(minutes=25)).strftime("%Y-%m-%d %H:%M:%S")
        t3 = (now_dt - timedelta(minutes=11)).strftime("%Y-%m-%d %H:%M:%S")

        seed_logs = [
            DataIntakeLog(
                source="instagram",
                sender_name=ahmet.full_name if ahmet else "Ahmet Yılmaz",
                sender_contact=ahmet.instagram_handle if ahmet and ahmet.instagram_handle else "@ahmetyilmaz",
                message_or_payload="Hocam yarın 19:00 fonksiyonel grup dersine yer var mı? Sol diz menisküs hassasiyetim devam ediyor.",
                target_department="booking",
                routed_user_id=ahmet.id if ahmet else None,
                assigned_access_code=ahmet_code,
                action_summary=f"Instagram DM çekildi -> {ahmet_code} üye eşleşti, ders talebi ve sakatlık uyarısı işlendi.",
                created_at=t1,
            ),
            DataIntakeLog(
                source="whatsapp",
                sender_name=zeynep.full_name if zeynep else "Zeynep Kaya",
                sender_contact=zeynep.phone if zeynep else "0535 442 18 22",
                message_or_payload="Merhaba, bel fıtığı (L4-L5) kontrolüm yapıldı. Selin Hoca'nın yoklama ekranına dikkat notu düşebilir misiniz?",
                target_department="trainer_note",
                routed_user_id=zeynep.id if zeynep else None,
                assigned_access_code=zeynep_code,
                action_summary=f"WhatsApp Business -> {zeynep_code} üyesinin sağlık notu Eğitmen Yoklama ekranına yönlendirildi.",
                created_at=t2,
            ),
            DataIntakeLog(
                source="manual",
                sender_name=mert.full_name if mert else "Mert Demir",
                sender_contact=mert.phone if mert else "0542 819 60 33",
                message_or_payload="Resepsiyon manuel veri girişi: 8'li Fonksiyonel Grup Paketi ve sağ omuz impingement notu doğrulandı.",
                target_department="member_registry",
                routed_user_id=mert.id if mert else None,
                assigned_access_code=mert_code,
                action_summary=f"Manuel Kayıt -> Üye sicili ve {mert_code} özel erişim kimliği aktif edildi.",
                created_at=t3,
            ),
        ]
        db.add_all(seed_logs)
        dirty = True

    if dirty:
        db.commit()


def _resolve_user_by_code_or_identifier(
    db: Session, raw_input: str, allow_phone_and_handle: bool = False
) -> Optional[User]:
    cleaned = (raw_input or "").strip()
    if not cleaned:
        return None

    upper = cleaned.upper()

    # 1. Doğrudan FIT-XXXX eşleşmesi (örn: FIT-1003 veya FIT1003)
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

    # 2. Sadece sayısal giriş: '1003' -> FIT-1003 veya user_id=3; '3' -> user_id=3 veya FIT-1003
    if cleaned.isdigit():
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
            cred_by_small = (
                db.query(UserAccessCredential)
                .filter(UserAccessCredential.access_code == f"FIT-{1000 + num}")
                .first()
            )
            if cred_by_small:
                return db.query(User).filter(User.id == cred_by_small.user_id).first()

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
        # Mesajın içinden ilgili sağlık cümlesini veya mesaj özetini çıkar
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


# ============================================================================
# ENDPOINT'LER
# ============================================================================

@router.get("/public-chips", response_model=List[PortalQuickChipOut])
def get_public_demo_chips(db: Session = Depends(get_db)):
    """Şifresiz ID sorgulama ekranındaki hızlı test çipleri için aktif FIT-XXXX kodlarını döner."""
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


@router.get("/lookup/{access_code}", response_model=PortalLookupResponse)
def lookup_by_access_code(access_code: str, db: Session = Depends(get_db)):
    """
    GİRİŞ YAPMADAN ÖZEL ID İLE HIZLI SORGULAMA!
    Kullanıcı FIT-1003, 1003 veya 3 girdiğinde; adını, paketini, kalan ders kredisini,
    yaklaşan ve geçmiş derslerini hoca ve saat detaylarıyla döndürür.
    """
    ensure_portal_initialized(db)

    user = _resolve_user_by_code_or_identifier(db, access_code, allow_phone_and_handle=False)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=f"'{access_code}' koduna ait bir üye kaydı bulunamadı. Lütfen FIT-1003 gibi geçerli bir ID girin.",
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
            bookings_q,
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

    # Eğitmen ID'si (örn. FIT-1001) sorgulanırsa eğitmenin ders programını da zarifçe döndür
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


@router.post("/auth/login", response_model=PortalUserLoginResponse)
def portal_user_login(payload: PortalUserLoginRequest, db: Session = Depends(get_db)):
    """Telefon numarası, FIT-XXXX kodu veya @handle (+ opsiyonel PIN) ile üye/eğitmen girişi."""
    ensure_portal_initialized(db)

    user = _resolve_user_by_code_or_identifier(db, payload.identifier, allow_phone_and_handle=True)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Girdiğiniz telefon numarası veya FIT-XXXX koduna ait kayıt bulunamadı.",
        )

    cred = _ensure_user_credential(db, user)
    if payload.pin_code is not None and payload.pin_code.strip() != "":
        if payload.pin_code.strip() != cred.pin_code:
            raise HTTPException(status_code=401, detail="PIN kodu hatalı. (Demo varsayılan PIN: 1234)")

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


@router.post("/admin/login", response_model=PortalAdminLoginResponse)
def portal_admin_login(payload: PortalAdminLoginRequest, db: Session = Depends(get_db)):
    """Admin kullanıcı adı ve şifre doğrulaması (admin / admin123)."""
    ensure_portal_initialized(db)

    username = (payload.username or "").strip()
    password = (payload.password or "").strip()

    admin_acc = db.query(AdminAccount).filter(AdminAccount.username == username).first()
    if not admin_acc or admin_acc.password != password:
        raise HTTPException(status_code=401, detail="Yönetici kullanıcı adı veya şifre hatalı.")

    return PortalAdminLoginResponse(
        authenticated=True,
        username=admin_acc.username,
        full_name=admin_acc.full_name,
        token=f"fit-admin-{admin_acc.id}",
        message=f"Yönetim paneline hoş geldiniz, {admin_acc.full_name}.",
    )


@router.get("/admin/overview", response_model=AdminOverviewResponse)
def get_admin_overview(db: Session = Depends(get_db)):
    """
    Admin paneli özet istatistikleri, tüm kullanıcılar + FIT-XXXX ID rehberi + kalan krediler,
    ders seansları ve kanal/birim bazlı veri çekme sayıları.
    """
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


@router.post("/admin/users", response_model=AdminCreateUserResponse)
def admin_create_user(payload: AdminCreateUserRequest, db: Session = Depends(get_db)):
    """
    Admin tarafından manuel yeni üye veya eğitmen oluşturma;
    otomatik FIT-XXXX ID atama, başlangıç paketi tanımlama ve sakatlık/özel not girme.
    """
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
    pkg_desc = (
        f", {created_pkg.total_credits} ders kredi tanımlandı"
        if created_pkg
        else ""
    )
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


@router.post("/intake/collect", response_model=DataIntakeCollectResponse)
def collect_and_route_intake_data(
    payload: DataIntakeCollectRequest, db: Session = Depends(get_db)
):
    """
    Instagram, WhatsApp veya Manuel veri çekme/girme ve ilgili birimlere
    (Üye Sicili & FIT-XXXX ID, Eğitmen Yoklama Sakatlık Notu, Ders Randevusu, Aday Havuzu)
    otomatik yönlendirme motoru.
    """
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

    # a) Kullanıcı eşleştirme veya otomatik yeni üye + FIT-XXXX oluşturma
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
        routed_departments.append("member_registry")
        summary_parts.append(f"Yeni üye oluşturuldu ({cred.access_code})")
    else:
        cred = _ensure_user_credential(db, matched_user)
        if (
            not matched_user.instagram_handle
            and sender_contact.startswith("@")
        ):
            matched_user.instagram_handle = normalize_handle(sender_contact)

    # Opsiyonel paket kredisi tanımlama / ekleme
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

    # b) Sakatlık / sağlık / özel not tespiti -> Eğitmen Yoklama Ekranına (User.notes) işle
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

    # c) Ders randevu talebi (session_id veya doğal dil mesaj analizi) -> Booking
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

    # d) Hedef departman belirleme & DataIntakeLog kaydı
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


@router.get("/intake/logs", response_model=List[DataIntakeLogOut])
def list_intake_logs(
    source: Optional[str] = Query(default=None, description="instagram | whatsapp | manual"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Çekilen/girilen tüm Instagram, WhatsApp ve Manuel verilerin geçmişini döndürür."""
    ensure_portal_initialized(db)

    query = db.query(DataIntakeLog)
    if source and source.strip():
        query = query.filter(DataIntakeLog.source == source.strip().lower())

    logs = query.order_by(DataIntakeLog.id.desc()).limit(limit).all()
    return [DataIntakeLogOut.model_validate(item) for item in logs]
