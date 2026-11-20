import json
import re
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Dict, List, Literal, Optional, Tuple

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload

import auth_admin_models  # noqa: F401
import payment_models  # noqa: F401
from auth_admin_models import run_sqlite_schema_migrations
from auth_admin_router import (
    admin_router,
    auth_router,
    ensure_portal_initialized,
    portal_router,
)
from database import Base, SessionLocal, engine, get_db as _raw_get_db
from instagram_service import normalize_handle, process_instagram_dm
from models import (
    CALORIES_GOAL,
    CARBS_GOAL_G,
    FAT_GOAL_G,
    PROTEIN_GOAL_G,
    STANDARD_BODY_ZONES,
    VALID_ZONE_STATUSES,
    WATER_GOAL_ML,
    Announcement,
    BodyMetrics,
    Booking,
    ClassSession,
    DailyWellness,
    MemberPackage,
    User,
    Waitlist,
    compute_wellness_pcts,
    generate_unique_referral_code,
    get_user_body_zones_dict,
    grant_bonus_credit_to_member,
    infer_default_body_zones,
    normalize_body_zones_payload,
    normalize_referral_code_input,
)
from payment_router import ensure_payment_catalog_seeded, router as payment_router
from schemas import (
    AnnouncementOut,
    AttendanceUpdateRequest,
    AttendeeOut,
    AvailableSessionOut,
    BodyMetricCreateRequest,
    BodyMetricOut,
    BodyZonesOut,
    BodyZonesUpdateOut,
    BodyZonesUpdateRequest,
    BookingActionResponse,
    BookingCancelRequest,
    BookingCreateRequest,
    CheckInLogOut,
    ClubHomeOut,
    ClubLiveStatusOut,
    DailyWellnessOut,
    HealthOut,
    HourlyForecastItemOut,
    InstagramWebhookRequest,
    InstagramWebhookResponse,
    MemberBookingItemOut,
    MemberDashboardOut,
    MemberMetricsSummaryOut,
    MemberNotesUpdateRequest,
    MemberProfileUpdateRequest,
    MemberWaitlistItemOut,
    NutritionAnalyzeOut,
    NutritionAnalyzeRequest,
    PackageOut,
    PackageRenewRequest,
    PackageRenewResponse,
    ReferralInfoOut,
    ReferralRedeemOut,
    ReferralRedeemRequest,
    TrainerCardOut,
    TrainerDetailOut,
    TrainerMemberCrmOut,
    TrainerScheduleOut,
    TrainerSessionCreateRequest,
    TrainerSessionOut,
    UserOut,
    WaitlistActionResponse,
    WaitlistCancelRequest,
    WaitlistCreateRequest,
    WaitlistEntryOut,
    WellnessEnergyRequest,
    WellnessWaterRequest,
)
from seed import seed_initial_data

load_dotenv()

_APP_BOOTSTRAPPED = False


def ensure_wellness_and_referrals_initialized(db: Session) -> None:
    """
    Ensures every User has a unique referral_code, initialized referral_count,
    and valid 7-zone body_zones JSON, plus seeds initial demo wellness records once.
    """
    dirty = False
    all_users = db.query(User).order_by(User.id.asc()).all()
    ahmet_marked = False

    for u in all_users:
        if not u.referral_code:
            u.referral_code = generate_unique_referral_code(db, u.full_name, exclude_user_id=u.id)
            db.flush()
            dirty = True
        if u.referral_count is None:
            u.referral_count = 0
            dirty = True

        name_low = (u.full_name or "").replace("İ", "i").replace("I", "ı").lower()
        if not u.body_zones:
            if "ahmet" in name_low and not ahmet_marked:
                zones = {z: "healthy" for z in STANDARD_BODY_ZONES}
                zones["Diz/Eklem"] = "warning"
                ahmet_marked = True
            else:
                zones = infer_default_body_zones(u.full_name, u.notes)
            u.body_zones = json.dumps(zones, ensure_ascii=False)
            dirty = True

    today_str = date.today().strftime("%Y-%m-%d")
    if db.query(DailyWellness).count() == 0 and all_users:
        by_name = {u.full_name: u for u in all_users}
        zeynep = by_name.get("Zeynep Kaya")
        elif_u = by_name.get("Elif Şahin")
        if zeynep:
            db.add(
                DailyWellness(
                    member_id=zeynep.id,
                    date=today_str,
                    water_ml=1750,
                    sleep_hours=7.5,
                    energy_status="normal",
                    calories_intake=1120,
                    protein_g=76,
                    carbs_g=115,
                    fat_g=34,
                )
            )
            dirty = True
        if elif_u:
            db.add(
                DailyWellness(
                    member_id=elif_u.id,
                    date=today_str,
                    water_ml=1000,
                    sleep_hours=5.5,
                    energy_status="low",
                    calories_intake=840,
                    protein_g=46,
                    carbs_g=92,
                    fat_g=26,
                )
            )
            dirty = True

    if dirty:
        db.commit()


def bootstrap_database_once() -> None:
    global _APP_BOOTSTRAPPED
    if _APP_BOOTSTRAPPED:
        return
    run_sqlite_schema_migrations(engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
        ensure_portal_initialized(db)
        ensure_payment_catalog_seeded(db)
        ensure_wellness_and_referrals_initialized(db)
        _APP_BOOTSTRAPPED = True
    finally:
        db.close()


def get_db():
    if not _APP_BOOTSTRAPPED:
        bootstrap_database_once()
    yield from _raw_get_db()


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_database_once()
    yield


app = FastAPI(
    title="Fitness Randevu & Kulüp Yönetim API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(portal_router)
app.include_router(payment_router)


# ============================================================================
# GÜNÜN ANTRENMANI (WOD) HAVUZU & YARDIMCI FONKSİYONLAR
# ============================================================================

DAILY_WOD_CATALOG = [
    {
        "wod_title": "Reformer Akışı: Dik Duruş & Derin Core",
        "wod_focus": "Omurga Uzaması, Pelvik Stabilizasyon & Zarafet",
        "wod_duration_min": 50,
        "wod_calories": 320,
        "wod_movements": [
            "Footwork Serisi • Nefes & Pelvik Hizalama (Isınma)",
            "Hundred & Long Stretch • Derin Core Aktivasyonu",
            "Short Spine & Swan • Torakal Açılma ve Dik Duruş",
            "Feet in Straps • Esneklik, Denge ve Uzun Kas Formu",
        ],
        "motivation_quote": "Dengeyle güçlen, zarafetle parla — A journey to your best self.",
    },
    {
        "wod_title": "Cadillac Tower & Omurga Dekompresyonu",
        "wod_focus": "Skolyoz Desteği, Esneklik & Nefes Kontrolü",
        "wod_duration_min": 50,
        "wod_calories": 290,
        "wod_movements": [
            "Roll Down Bar • Segmental Omurga Mobilizasyonu",
            "Push Through Seated • Omuz Kuşağı & Üst Sırt Rahatlama",
            "Leg Springs Series • Kalça Stabilizasyonu & Sıkılaşma",
            "Breathing & Cat Stretch • Zihinsel Denge ve Uzama",
        ],
        "motivation_quote": "Güç, denge, nefes, kontrol ve zihin tek bir akışta buluşur.",
    },
    {
        "wod_title": "Toning Reformer: Tüm Beden Sıkılaşma",
        "wod_focus": "Alt Gövde Şekillendirme, Core & Kontrol",
        "wod_duration_min": 50,
        "wod_calories": 350,
        "wod_movements": [
            "Scooter & Standing Splits • Kalça ve İç Bacak Tonlama",
            "Long Box Pulling Straps • Güçlü Sırt ve Zarif Omuzlar",
            "Knee Stretch & Elephant • Merkez Bölge Kontrolü",
            "Mermaid Stretch • Yan Gövde Uzaması ve Nefes",
        ],
        "motivation_quote": "Reformer: güçlü beden, dik duruş, zihinsel denge.",
    },
]


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _today_iso() -> str:
    return date.today().strftime("%Y-%m-%d")


def _clean_trainer_bio(bio: Optional[str]) -> Optional[str]:
    if bio is None:
        return None
    lines = [
        line.strip()
        for line in bio.splitlines()
        if line.strip() and not line.strip().lower().startswith("sertifikalar:")
    ]
    cleaned = " ".join(lines).strip()
    return cleaned if cleaned else bio.strip()


def _to_user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.body_zones = get_user_body_zones_dict(user)
    if user.role == "trainer" and user.bio:
        out.bio = _clean_trainer_bio(user.bio)
    return out


def _to_daily_wellness_out(row: DailyWellness) -> DailyWellnessOut:
    e_status: Literal["high", "normal", "low"] = (
        row.energy_status if row.energy_status in ("high", "normal", "low") else "normal"  # type: ignore[assignment]
    )
    return DailyWellnessOut(
        id=row.id,
        member_id=row.member_id,
        date=row.date,
        water_ml=row.water_ml or 0,
        water_goal_ml=WATER_GOAL_ML,
        sleep_hours=float(row.sleep_hours if row.sleep_hours is not None else 7.5),
        energy_status=e_status,
        calories_intake=row.calories_intake or 0,
        calories_goal=CALORIES_GOAL,
        protein_g=row.protein_g or 0,
        protein_goal_g=PROTEIN_GOAL_G,
        carbs_g=row.carbs_g or 0,
        carbs_goal_g=CARBS_GOAL_G,
        fat_g=row.fat_g or 0,
        fat_goal_g=FAT_GOAL_G,
    )


def _get_or_create_today_wellness(db: Session, member_id: int) -> DailyWellness:
    user = db.query(User).filter(User.id == member_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Üye bulunamadı.")

    today_str = _today_iso()
    row = (
        db.query(DailyWellness)
        .filter(DailyWellness.member_id == member_id, DailyWellness.date == today_str)
        .first()
    )
    if not row:
        row = DailyWellness(
            member_id=member_id,
            date=today_str,
            water_ml=0,
            sleep_hours=7.5,
            energy_status="normal",
            calories_intake=0,
            protein_g=0,
            carbs_g=0,
            fat_g=0,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _load_today_wellness_map(db: Session) -> Dict[int, DailyWellness]:
    today_str = _today_iso()
    rows = db.query(DailyWellness).filter(DailyWellness.date == today_str).all()
    return {r.member_id: r for r in rows}


def _extract_member_wellness_fields(
    user: User,
    wellness_row: Optional[DailyWellness],
) -> Dict[str, object]:
    zones = get_user_body_zones_dict(user)
    w_ml = wellness_row.water_ml if (wellness_row and wellness_row.water_ml is not None) else 0
    p_g = wellness_row.protein_g if (wellness_row and wellness_row.protein_g is not None) else 0
    e_raw = wellness_row.energy_status if wellness_row else "normal"
    e_status: Literal["high", "normal", "low"] = (
        e_raw if e_raw in ("high", "normal", "low") else "normal"  # type: ignore[assignment]
    )
    w_pct, p_pct = compute_wellness_pcts(w_ml, p_g)
    return {
        "body_zones": zones,
        "today_energy_status": e_status,
        "today_water_ml": w_ml,
        "water_goal_ml": WATER_GOAL_ML,
        "today_protein_g": p_g,
        "protein_goal_g": PROTEIN_GOAL_G,
        "water_pct": w_pct,
        "protein_pct": p_pct,
    }


# Besin Sözlüğü: (keywords, per_100g=(kcal, protein_g, carbs_g, fat_g), default_unit_grams)
TURKISH_NUTRITION_DICTIONARY: List[Tuple[List[str], Tuple[float, float, float, float], float]] = [
    (["yumurtalı menemen", "yumurtali menemen", "menemen"], (115.0, 6.8, 3.8, 8.0), 220.0),
    (["omlet"], (154.0, 10.6, 1.2, 11.8), 140.0),
    (["yumurta beyazı", "yumurta beyazi"], (52.0, 10.9, 0.7, 0.2), 35.0),
    (["haşlanmış yumurta", "haslanmis yumurta", "yumurta"], (155.0, 12.6, 1.1, 10.6), 55.0),
    (["beyaz peynir"], (265.0, 17.0, 2.0, 21.0), 60.0),
    (["lor peyniri", "lor peynir", "lor"], (98.0, 11.0, 3.4, 4.3), 80.0),
    (["kaşar peyniri", "kasar peyniri", "kaşar", "kasar"], (350.0, 25.0, 2.0, 27.0), 30.0),
    (["süzme peynir", "suzme peynir", "peynir"], (250.0, 16.0, 2.5, 20.0), 50.0),
    (["tam buğday ekmeği", "tam bugday ekmegi", "çavdar ekmeği", "cavdar ekmegi", "kepekli ekmek", "ekmek"], (247.0, 9.5, 43.0, 3.4), 30.0),
    (["simit"], (275.0, 9.6, 57.0, 3.5), 100.0),
    (["ızgara tavuk göğsü", "izgara tavuk gogsu", "tavuk göğsü", "tavuk gogsu", "haşlama tavuk", "tavuk"], (165.0, 31.0, 0.0, 3.6), 160.0),
    (["hindi göğsü", "hindi füme", "hindi"], (145.0, 29.0, 1.0, 2.5), 150.0),
    (["ızgara köfte", "izgara kofte", "köfte", "kofte"], (240.0, 20.0, 5.0, 15.5), 150.0),
    (["dana bonfile", "antrikot", "kırmızı et", "kirmizi et", "dana eti", "biftek"], (235.0, 26.0, 0.0, 14.0), 180.0),
    (["ızgara somon", "izgara somon", "fırın somon", "somon"], (208.0, 21.6, 0.0, 13.0), 180.0),
    (["ton balığı", "ton baligi"], (132.0, 28.0, 0.0, 1.5), 120.0),
    (["levrek", "çipura", "cipura", "balık", "balik"], (140.0, 22.0, 0.0, 5.5), 180.0),
    (["pirinç pilavı", "pirinc pilavi", "pilav"], (145.0, 3.0, 28.0, 2.3), 180.0),
    (["bulgur pilavı", "bulgur pilavi", "bulgur"], (125.0, 4.2, 24.0, 1.8), 180.0),
    (["karabuğday", "karabugday", "kinoa"], (120.0, 4.4, 21.3, 1.9), 160.0),
    (["kepekli makarna", "tam buğday makarna", "makarna"], (155.0, 5.8, 30.5, 1.1), 180.0),
    (["yulaf ezmesi", "yulaf lapası", "yulaf"], (380.0, 13.5, 66.0, 7.0), 50.0),
    (["whey protein", "ölçek protein", "olcek protein", "protein tozu", "protein"], (400.0, 80.0, 10.0, 5.0), 30.0),
    (["muz"], (89.0, 1.1, 22.8, 0.3), 120.0),
    (["elma", "armut", "portakal", "şeftali", "seftali"], (52.0, 0.3, 14.0, 0.2), 150.0),
    (["avokado"], (160.0, 2.0, 8.5, 14.7), 100.0),
    (["fıstık ezmesi", "fistik ezmesi", "badem ezmesi"], (588.0, 25.0, 20.0, 50.0), 20.0),
    (["çiğ badem", "badem", "ceviz", "fındık", "findik", "kaju"], (590.0, 20.0, 18.0, 52.0), 30.0),
    (["süzme yoğurt", "suzme yogurt", "yoğurt", "yogurt"], (75.0, 6.5, 4.5, 3.5), 180.0),
    (["ayran", "kefir"], (45.0, 3.0, 3.8, 1.8), 220.0),
    (["süt", "sut"], (60.0, 3.2, 4.8, 3.2), 200.0),
    (["mercimek çorbası", "mercimek corbasi", "ezogelin", "çorba", "corba"], (65.0, 4.0, 9.5, 1.8), 250.0),
    (["haşlanmış patates", "fırın patates", "patates"], (93.0, 2.5, 21.0, 0.2), 160.0),
    (["yeşillikli salata", "mevsim salata", "çoban salata", "salata", "yeşillik", "yesillik"], (48.0, 1.3, 4.0, 3.0), 200.0),
    (["brokoli", "kabak", "ıspanak", "ispanak", "ızgara sebze", "sebze"], (45.0, 2.8, 6.5, 1.2), 180.0),
    (["zeytin"], (145.0, 1.0, 3.8, 15.0), 30.0),
    (["tost"], (290.0, 14.0, 28.0, 13.0), 130.0),
]


def _analyze_turkish_meal(meal_text: str) -> Tuple[int, int, int, int, str]:
    cleaned = (meal_text or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Lütfen analiz edilecek öğünü yazın.")

    lowered = cleaned.replace("İ", "i").replace("I", "ı").lower()
    clauses = [
        seg.strip()
        for seg in re.split(r"[,;+\n&]|\bve\b|\bile\b", lowered)
        if seg and seg.strip()
    ]
    if not clauses:
        clauses = [lowered]

    total_cal = 0.0
    total_prot = 0.0
    total_carb = 0.0
    total_fat = 0.0
    matched_any = False

    for clause in clauses:
        matched_entry = None
        matched_kw = ""
        for keywords, macros_100g, unit_g in TURKISH_NUTRITION_DICTIONARY:
            for kw in keywords:
                if kw in clause:
                    matched_entry = (macros_100g, unit_g)
                    matched_kw = kw
                    break
            if matched_entry:
                break

        if not matched_entry:
            continue

        matched_any = True
        (kcal_100, prot_100, carb_100, fat_100), default_unit_g = matched_entry

        gram_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:gr|gram|g|ml)\b", clause)
        if gram_match:
            grams = float(gram_match.group(1).replace(",", "."))
        elif "menemen" in matched_kw:
            egg_count_match = re.search(r"(\d+)\s*yumurta", clause)
            grams = default_unit_g
            if egg_count_match:
                eggs = int(egg_count_match.group(1))
                if eggs > 2:
                    grams += (eggs - 2) * 55.0
                elif eggs == 1:
                    grams = max(160.0, default_unit_g - 45.0)
        else:
            count_mult = 1.0
            if "yarım" in clause or "yarim" in clause:
                count_mult = 0.5
            elif "çeyrek" in clause or "ceyrek" in clause:
                count_mult = 0.25
            elif "duble" in clause or "büyük" in clause or "buyuk" in clause:
                count_mult = 1.4
            else:
                num_match = re.search(
                    r"(\d+(?:[.,]\d+)?)\s*(?:adet|tane|dilim|tabak|kase|porsiyon|ölçek|olcek|kaşık|kasik|bardak|avuç|avuc)?",
                    clause,
                )
                if num_match:
                    parsed_num = float(num_match.group(1).replace(",", "."))
                    if parsed_num > 30:
                        # Örn. "150 tavuk" gibi birim yazılmamış gramaj ifadesi
                        grams = parsed_num
                        count_mult = -1.0
                    elif parsed_num > 0:
                        count_mult = parsed_num
            if count_mult > 0:
                grams = count_mult * default_unit_g

        factor = grams / 100.0
        total_cal += kcal_100 * factor
        total_prot += prot_100 * factor
        total_carb += carb_100 * factor
        total_fat += fat_100 * factor

    if not matched_any:
        gram_fallback = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:gr|gram|g|ml)\b", lowered)
        scale = (float(gram_fallback.group(1).replace(",", ".")) / 220.0) if gram_fallback else 1.0
        scale = max(0.5, min(2.5, scale))
        total_cal = 340.0 * scale
        total_prot = 18.0 * scale
        total_carb = 36.0 * scale
        total_fat = 13.0 * scale

    cal_i = max(25, int(round(total_cal)))
    prot_i = max(1, int(round(total_prot)))
    carb_i = max(0, int(round(total_carb)))
    fat_i = max(0, int(round(total_fat)))

    if prot_i >= 30 and carb_i >= 20:
        coach_note = (
            "💡 AI Koç Notu: Harika bir protein kaynağı! Antrenman öncesi ve sonrası için "
            "karbonhidrat-protein dengesi oldukça ideal."
        )
    elif prot_i >= 28 and carb_i < 20:
        coach_note = (
            "💡 AI Koç Notu: Kas onarımı ve sıkılaşma için çok temiz, yüksek proteinli bir seçim! "
            "Bol su ile sindirimi destekleyebilirsin."
        )
    elif carb_i >= 55 and prot_i < 20:
        coach_note = (
            "💡 AI Koç Notu: Enerji veren karbonhidrat ağırlıklı bir öğün. Bir sonraki öğününde "
            "yumurta, ızgara tavuk veya süzme yoğurt ekleyerek protein dengesini tamamlayabilirsin."
        )
    elif fat_i >= 28:
        coach_note = (
            "💡 AI Koç Notu: Doyuruculuğu ve sağlıklı yağ oranı yüksek bir tabak! "
            "Metabolik denge için gün içinde +500 ml ekstra su içmeyi unutma."
        )
    else:
        coach_note = (
            "💡 AI Koç Notu: Dengeli ve hafif bir öğün! Günlük protein ve su hedefine "
            "istikrarlı şekilde yaklaşıyorsun."
        )

    return cal_i, prot_i, carb_i, fat_i, coach_note


def _compute_checkin_time(start_time: str) -> str:
    try:
        dt = datetime.strptime(start_time.strip(), "%H:%M") - timedelta(minutes=12)
        return dt.strftime("%H:%M")
    except Exception:
        return start_time


def _normalize_hhmm(time_str: str, field_label: str = "Saat") -> str:
    raw = (time_str or "").strip().replace(".", ":")
    m = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", raw)
    if not m:
        raise HTTPException(
            status_code=400,
            detail=f"{field_label} SS:DD (HH:MM) formatında olmalıdır (örn. 18:30).",
        )
    return f"{int(m.group(1)):02d}:{int(m.group(2)):02d}"


def _add_minutes_hhmm(start_hhmm: str, minutes: int = 60) -> str:
    dt = datetime.strptime(start_hhmm, "%H:%M") + timedelta(minutes=minutes)
    return dt.strftime("%H:%M")


def _default_room_for_category(category: str) -> str:
    cat_lower = (category or "").lower()
    if "cadillac" in cat_lower or "tower" in cat_lower:
        return "Cadillac & Trapeze Alanı"
    if "bireysel" in cat_lower or "birebir" in cat_lower or "özel" in cat_lower or "pt" in cat_lower:
        return "VIP Özel Reformer Odası"
    return "Kemerli Ayna Reformer Salonu"


def get_active_package_for_member(db: Session, member_id: int) -> Optional[MemberPackage]:
    return (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id, MemberPackage.is_active == True)
        .order_by(MemberPackage.id.desc())
        .first()
    )


def _build_member_booking_item(b: Booking) -> MemberBookingItemOut:
    s = b.session
    tr = s.trainer if s else None
    return MemberBookingItemOut(
        booking_id=b.id,
        session_id=s.id,
        status=b.status,
        title=s.title,
        category=s.category or "Fonksiyonel",
        room=s.room or "Ana Stüdyo",
        date=s.date,
        start_time=s.start_time,
        end_time=s.end_time,
        trainer_id=s.trainer_id,
        trainer_name=tr.full_name if tr else "Eğitmen",
        trainer_avatar_url=tr.avatar_url if tr else None,
        trainer_specialty=tr.specialty if tr else None,
        capacity=s.capacity,
        current_enrolled=s.current_enrolled,
    )


def _build_recent_checkins(db: Session, member_id: int, limit: int = 8) -> List[CheckInLogOut]:
    attended_bookings = (
        db.query(Booking)
        .options(joinedload(Booking.session).joinedload(ClassSession.trainer))
        .filter(Booking.member_id == member_id, Booking.status == "attended")
        .all()
    )
    attended_sorted = sorted(
        [b for b in attended_bookings if b.session is not None],
        key=lambda b: (b.session.date, b.session.start_time, b.id),
        reverse=True,
    )
    logs: List[CheckInLogOut] = []
    for b in attended_sorted[:limit]:
        s = b.session
        logs.append(
            CheckInLogOut(
                id=b.id,
                date=s.date,
                time=_compute_checkin_time(s.start_time),
                session_title=s.title,
                trainer_name=s.trainer.full_name if s.trainer else "Eğitmen",
                location=s.room or "Ana Stüdyo",
                category=s.category or "Fonksiyonel",
            )
        )
    return logs


def _load_waitlist_by_session(db: Session) -> Dict[int, List[Waitlist]]:
    rows = (
        db.query(Waitlist)
        .options(
            joinedload(Waitlist.member),
            joinedload(Waitlist.session).joinedload(ClassSession.trainer),
        )
        .order_by(Waitlist.id.asc())
        .all()
    )
    mapping: Dict[int, List[Waitlist]] = {}
    for w in rows:
        mapping.setdefault(w.session_id, []).append(w)
    return mapping


def _build_available_session_out(
    s: ClassSession,
    booked_session_map: Dict[int, int],
    waitlist_by_session: Dict[int, List[Waitlist]],
    member_id: Optional[int] = None,
) -> AvailableSessionOut:
    remaining_spots = max(0, s.capacity - s.current_enrolled)
    b_id = booked_session_map.get(s.id) if member_id is not None else None
    w_list = waitlist_by_session.get(s.id, [])
    w_count = len(w_list)

    is_waitlisted = False
    w_id: Optional[int] = None
    w_pos: Optional[int] = None
    if member_id is not None and w_list:
        for idx, w_item in enumerate(w_list, start=1):
            if w_item.member_id == member_id:
                is_waitlisted = True
                w_id = w_item.id
                w_pos = idx
                break

    tr = s.trainer
    return AvailableSessionOut(
        id=s.id,
        trainer_id=s.trainer_id,
        trainer_name=tr.full_name if tr else "Eğitmen",
        trainer_avatar_url=tr.avatar_url if tr else None,
        trainer_specialty=tr.specialty if tr else None,
        title=s.title,
        category=s.category or "Fonksiyonel",
        room=s.room or "Ana Stüdyo",
        date=s.date,
        start_time=s.start_time,
        end_time=s.end_time,
        capacity=s.capacity,
        current_enrolled=s.current_enrolled,
        remaining_spots=remaining_spots,
        is_full=(remaining_spots == 0),
        is_booked_by_member=(b_id is not None),
        booking_id=b_id,
        waitlist_count=w_count,
        is_waitlisted_by_member=is_waitlisted,
        waitlist_id=w_id,
        waitlist_position=w_pos,
    )


def _build_trainer_card(
    trainer: User,
    trainer_sessions: List[ClassSession],
    today_iso: str,
    window_start_iso: str,
) -> TrainerCardOut:
    active_count = sum(1 for s in trainer_sessions if s.date >= today_iso)
    monthly_count = sum(1 for s in trainer_sessions if s.date >= window_start_iso)
    return TrainerCardOut(
        id=trainer.id,
        full_name=trainer.full_name,
        phone=trainer.phone,
        instagram_handle=trainer.instagram_handle,
        avatar_url=trainer.avatar_url,
        specialty=trainer.specialty or "Fitness & Kondisyon Eğitmeni",
        bio=_clean_trainer_bio(trainer.bio) or trainer.notes or "",
        certificates=trainer.certificates,
        rating=round(trainer.rating if trainer.rating is not None else 4.9, 1),
        experience_years=trainer.experience_years if trainer.experience_years is not None else 5,
        active_sessions_count=active_count,
        monthly_classes_given=monthly_count,
    )


def promote_next_waitlist_member(
    db: Session, session_obj: ClassSession
) -> Tuple[Optional[int], Optional[str]]:
    """
    Derste boş kontenjan oluştuğunda aynı transaction içinde yedek listedeki en eski
    ve aktif paketi / kredisi (> 0) bulunan üyeyi otomatik olarak derse kaydeder.
    """
    if not session_obj or session_obj.current_enrolled >= session_obj.capacity:
        return None, None

    waitlist_candidates = (
        db.query(Waitlist)
        .filter(Waitlist.session_id == session_obj.id)
        .order_by(Waitlist.id.asc())
        .all()
    )

    for w_entry in waitlist_candidates:
        w_member = (
            db.query(User)
            .filter(User.id == w_entry.member_id, User.role == "member")
            .first()
        )
        if not w_member:
            db.delete(w_entry)
            continue

        already_active = (
            db.query(Booking)
            .filter(
                Booking.session_id == session_obj.id,
                Booking.member_id == w_member.id,
                Booking.status.in_(["booked", "attended"]),
            )
            .first()
        )
        if already_active:
            db.delete(w_entry)
            continue

        w_pkg = get_active_package_for_member(db, w_member.id)
        if not w_pkg or w_pkg.remaining_credits <= 0:
            # Kredisi olmayan yedek üyeyi atla, sıradaki kredili üyeye bak
            continue

        prev_cancelled = (
            db.query(Booking)
            .filter(
                Booking.session_id == session_obj.id,
                Booking.member_id == w_member.id,
                Booking.status == "cancelled",
            )
            .first()
        )
        if prev_cancelled:
            prev_cancelled.status = "booked"
            prev_cancelled.package_id = w_pkg.id
        else:
            promoted_booking = Booking(
                session_id=session_obj.id,
                member_id=w_member.id,
                package_id=w_pkg.id,
                status="booked",
            )
            db.add(promoted_booking)

        w_pkg.remaining_credits -= 1
        session_obj.current_enrolled += 1
        db.delete(w_entry)
        db.flush()
        return w_member.id, w_member.full_name

    return None, None


def create_booking_internal(db: Session, member_id: int, session_id: int) -> BookingActionResponse:
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    session_obj = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Ders seansı bulunamadı.")

    if session_obj.date < _today_iso():
        raise HTTPException(status_code=400, detail="Geçmiş tarihli bir derse kayıt olunamaz.")

    existing_active = (
        db.query(Booking)
        .filter(
            Booking.session_id == session_id,
            Booking.member_id == member_id,
            Booking.status.in_(["booked", "attended"]),
        )
        .first()
    )
    if existing_active:
        raise HTTPException(status_code=400, detail="Bu derse zaten aktif bir kaydınız bulunuyor.")

    if session_obj.current_enrolled >= session_obj.capacity:
        raise HTTPException(
            status_code=400,
            detail="Bu dersin kontenjanı dolmuştur. Yedek listeye (Waitlist) yazılabilirsiniz.",
        )

    package = get_active_package_for_member(db, member_id)
    if not package:
        raise HTTPException(status_code=400, detail="Aktif bir üyelik paketiniz bulunmuyor.")

    if package.remaining_credits <= 0:
        raise HTTPException(status_code=400, detail="Paketinizde kalan ders kredisi bulunmuyor.")

    cancelled_booking = (
        db.query(Booking)
        .filter(
            Booking.session_id == session_id,
            Booking.member_id == member_id,
            Booking.status == "cancelled",
        )
        .first()
    )

    if cancelled_booking:
        cancelled_booking.status = "booked"
        cancelled_booking.package_id = package.id
        booking = cancelled_booking
    else:
        booking = Booking(
            session_id=session_id,
            member_id=member_id,
            package_id=package.id,
            status="booked",
        )
        db.add(booking)

    # Üye bu dersin yedek listesinde bulunuyorsa temizle
    existing_waitlist = (
        db.query(Waitlist)
        .filter(Waitlist.session_id == session_id, Waitlist.member_id == member_id)
        .first()
    )
    if existing_waitlist:
        db.delete(existing_waitlist)

    package.remaining_credits -= 1
    session_obj.current_enrolled += 1

    db.commit()
    db.refresh(booking)
    db.refresh(package)
    db.refresh(session_obj)

    return BookingActionResponse(
        message="Derse kaydınız başarıyla oluşturuldu.",
        booking_id=booking.id,
        status=booking.status,
        remaining_credits=package.remaining_credits,
        session_id=session_obj.id,
        current_enrolled=session_obj.current_enrolled,
        capacity=session_obj.capacity,
    )


# ============================================================================
# GENEL & KULÜP VITRIN ENDPOINT'LERİ
# ============================================================================


@app.get("/health", response_model=HealthOut)
def health_check():
    return HealthOut(status="ok")


@app.get("/club/live-status", response_model=ClubLiveStatusOut)
def get_club_live_status(db: Session = Depends(get_db)):
    capacity = 40
    today_str = _today_iso()
    now_dt = datetime.now()
    now_hour = now_dt.hour

    today_sessions = db.query(ClassSession).filter(ClassSession.date == today_str).all()

    base_curve = {
        7: 22,
        8: 28,
        9: 35,
        10: 42,
        11: 38,
        12: 34,
        13: 40,
        14: 32,
        15: 30,
        16: 36,
        17: 45,
        18: 75,
        19: 90,
        20: 55,
        21: 30,
        22: 20,
    }

    enrolled_by_hour: Dict[int, int] = {}
    for s in today_sessions:
        try:
            sh = int((s.start_time or "00:00").split(":")[0])
            enrolled_by_hour[sh] = enrolled_by_hour.get(sh, 0) + max(0, s.current_enrolled or 0)
        except Exception:
            continue

    nearby_enrolled = (
        enrolled_by_hour.get(now_hour, 0)
        + int(round(enrolled_by_hour.get(now_hour - 1, 0) * 0.5))
    )
    baseline_pct = base_curve.get(now_hour, 36)
    baseline_members = int(round((capacity * baseline_pct) / 100.0))

    if nearby_enrolled > 0:
        active_members_count = min(capacity, max(baseline_members, nearby_enrolled + 8))
    else:
        active_members_count = max(6, min(capacity, baseline_members))

    occupancy_pct = min(100, max(10, int(round((active_members_count * 100.0) / capacity))))

    if occupancy_pct < 55:
        status_level: Literal["low", "moderate", "high"] = "low"
        status_badge = "🟢 Salon Şu An Ferah - Antrenman İçin Harika Saat"
    elif occupancy_pct < 80:
        status_level = "moderate"
        status_badge = "🟡 Salon Dengeli Yoğunlukta - Tempolu Atmosfer"
    else:
        status_level = "high"
        status_badge = "🔴 Salon Yoğun Saatte - Ekipman Sırası Olabilir"

    forecast_hours = [16, 17, 18, 19, 20, 21]
    hourly_forecast: List[HourlyForecastItemOut] = []
    for fh in forecast_hours:
        fh_base = base_curve.get(fh, 40)
        fh_enrolled = enrolled_by_hour.get(fh, 0)
        fh_pct = min(98, fh_base + (fh_enrolled * 2)) if fh_enrolled > 0 else fh_base
        hourly_forecast.append(HourlyForecastItemOut(hour=f"{fh:02d}:00", pct=int(fh_pct)))

    return ClubLiveStatusOut(
        occupancy_pct=occupancy_pct,
        active_members_count=active_members_count,
        active_members_label=f"{active_members_count} Kişi",
        capacity=capacity,
        status_level=status_level,
        status_badge=status_badge,
        hourly_forecast=hourly_forecast,
    )


@app.get("/users/{user_id}/body-zones", response_model=BodyZonesOut)
def get_user_body_zones(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    zones = get_user_body_zones_dict(user)
    if not user.body_zones:
        user.body_zones = json.dumps(zones, ensure_ascii=False)
        db.commit()
    return BodyZonesOut(user_id=user.id, zones=zones)


@app.put("/users/{user_id}/body-zones", response_model=BodyZonesUpdateOut)
def update_user_body_zones(
    user_id: int,
    payload: BodyZonesUpdateRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    for k, v in (payload.zones or {}).items():
        if k in STANDARD_BODY_ZONES and (v or "").strip().lower() not in VALID_ZONE_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Geçersiz bölge durumu: {v}. ('healthy', 'warning', 'injured' olmalıdır)",
            )

    current_zones = get_user_body_zones_dict(user)
    updated_zones = normalize_body_zones_payload(payload.zones, base_zones=current_zones)
    user.body_zones = json.dumps(updated_zones, ensure_ascii=False)
    db.commit()
    db.refresh(user)

    return BodyZonesUpdateOut(
        user_id=user.id,
        zones=updated_zones,
        message="Vücut haritası güncellendi.",
    )


@app.get("/wellness/{member_id}/today", response_model=DailyWellnessOut)
def get_member_today_wellness(member_id: int, db: Session = Depends(get_db)):
    row = _get_or_create_today_wellness(db, member_id)
    return _to_daily_wellness_out(row)


@app.post("/wellness/{member_id}/water", response_model=DailyWellnessOut)
def add_member_water(
    member_id: int,
    payload: Optional[WellnessWaterRequest] = Body(default=None),
    db: Session = Depends(get_db),
):
    row = _get_or_create_today_wellness(db, member_id)
    amount = payload.amount_ml if (payload is not None and payload.amount_ml is not None) else 250
    row.water_ml = max(0, (row.water_ml or 0) + int(amount))
    db.commit()
    db.refresh(row)
    return _to_daily_wellness_out(row)


@app.post("/wellness/{member_id}/energy", response_model=DailyWellnessOut)
def update_member_energy(
    member_id: int,
    payload: WellnessEnergyRequest,
    db: Session = Depends(get_db),
):
    row = _get_or_create_today_wellness(db, member_id)
    row.energy_status = payload.energy_status
    if payload.sleep_hours is not None:
        row.sleep_hours = round(max(0.0, min(24.0, float(payload.sleep_hours))), 1)
    db.commit()
    db.refresh(row)
    return _to_daily_wellness_out(row)


@app.post("/nutrition/analyze", response_model=NutritionAnalyzeOut)
def analyze_nutrition_meal(
    payload: NutritionAnalyzeRequest,
    db: Session = Depends(get_db),
):
    row = _get_or_create_today_wellness(db, payload.member_id)
    cal_i, prot_i, carb_i, fat_i, coach_note = _analyze_turkish_meal(payload.meal_text)

    row.calories_intake = max(0, (row.calories_intake or 0) + cal_i)
    row.protein_g = max(0, (row.protein_g or 0) + prot_i)
    row.carbs_g = max(0, (row.carbs_g or 0) + carb_i)
    row.fat_g = max(0, (row.fat_g or 0) + fat_i)
    db.commit()
    db.refresh(row)

    return NutritionAnalyzeOut(
        meal_text=payload.meal_text.strip(),
        added_calories=cal_i,
        added_protein_g=prot_i,
        added_carbs_g=carb_i,
        added_fat_g=fat_i,
        coach_note=coach_note,
        wellness=_to_daily_wellness_out(row),
    )


@app.get("/referral/{member_id}", response_model=ReferralInfoOut)
def get_member_referral_info(member_id: int, db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Üye bulunamadı.")

    if not member.referral_code:
        member.referral_code = generate_unique_referral_code(
            db, member.full_name, exclude_user_id=member.id
        )
        if member.referral_count is None:
            member.referral_count = 0
        db.commit()
        db.refresh(member)

    active_pkg = get_active_package_for_member(db, member.id)
    rem_credits = active_pkg.remaining_credits if active_pkg else 0
    ref_count = member.referral_count or 0

    return ReferralInfoOut(
        member_id=member.id,
        member_name=member.full_name,
        referral_code=member.referral_code,
        referral_count=ref_count,
        earned_free_credits=ref_count,
        remaining_credits=rem_credits,
    )


@app.post("/referral/redeem", response_model=ReferralRedeemOut)
def redeem_referral_code(
    payload: ReferralRedeemRequest,
    db: Session = Depends(get_db),
):
    clean_code = normalize_referral_code_input(payload.referral_code)
    if not clean_code:
        raise HTTPException(status_code=400, detail="Davet kodu boş bırakılamaz.")

    inviter = db.query(User).filter(User.referral_code == clean_code).first()
    if not inviter:
        raise HTTPException(status_code=404, detail="Geçersiz davet kodu.")

    is_sim = bool(payload.is_demo_simulation) or (payload.new_member_id is None)
    if not is_sim and payload.new_member_id == inviter.id:
        raise HTTPException(status_code=400, detail="Kendi davet kodunuzu kendiniz için kullanamazsınız.")

    inviter.referral_count = (inviter.referral_count or 0) + 1
    inviter_pkg = grant_bonus_credit_to_member(
        db,
        inviter.id,
        credits_to_add=1,
        fallback_package_name="Arkadaş Daveti Hediye Paketi",
    )

    if payload.new_member_id is not None and payload.new_member_id != inviter.id:
        new_member = db.query(User).filter(User.id == payload.new_member_id).first()
        if new_member:
            grant_bonus_credit_to_member(
                db,
                new_member.id,
                credits_to_add=1,
                fallback_package_name="Hoş Geldin Hediye Ders Paketi",
            )

    db.commit()
    db.refresh(inviter)
    db.refresh(inviter_pkg)

    return ReferralRedeemOut(
        success=True,
        referral_code=inviter.referral_code,
        inviter_id=inviter.id,
        inviter_name=inviter.full_name,
        referral_count=inviter.referral_count or 0,
        remaining_credits=inviter_pkg.remaining_credits,
        bonus_credits_added=1,
        message="🎉 Tebrikler! Arkadaşınız katıldığı için paketinize +1 Hediye Ders eklendi!",
    )


@app.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):
    users = (
        db.query(User)
        .filter(User.role.in_(["member", "trainer"]))
        .order_by(User.role.asc(), User.id.asc())
        .all()
    )
    return [_to_user_out(u) for u in users]


@app.get("/announcements", response_model=List[AnnouncementOut])
def list_announcements(
    category: Optional[str] = Query(
        default=None,
        description="Kategori filtresi: 'Tümü', 'Kulüp Haberleri', 'Kurallar & Bilgilendirme', 'Kampanyalar'",
    ),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Announcement)
        .order_by(Announcement.is_pinned.desc(), Announcement.date.desc(), Announcement.id.desc())
        .all()
    )
    if not category or category.strip() in ("", "Tümü", "all", "All"):
        return [AnnouncementOut.model_validate(a) for a in rows]

    cat_clean = category.strip().lower()
    filtered: List[Announcement] = []
    for a in rows:
        tag_lower = (a.tag or "").strip().lower()
        if "haber" in cat_clean or "yeni" in cat_clean:
            if "haber" in tag_lower or "yeni" in tag_lower:
                filtered.append(a)
        elif "kural" in cat_clean or "bilgi" in cat_clean or "bakım" in cat_clean:
            if "kural" in tag_lower or "bilgi" in tag_lower or "bakım" in tag_lower or "bakim" in tag_lower:
                filtered.append(a)
        elif "kampanya" in cat_clean:
            if "kampanya" in tag_lower:
                filtered.append(a)
        elif tag_lower == cat_clean:
            filtered.append(a)

    return [AnnouncementOut.model_validate(a) for a in filtered]


@app.get("/club/home/{member_id}", response_model=ClubHomeOut)
def get_club_home(member_id: int, db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    today_iso = _today_iso()
    window_start_iso = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")

    announcements = (
        db.query(Announcement)
        .order_by(Announcement.is_pinned.desc(), Announcement.date.desc(), Announcement.id.desc())
        .all()
    )

    trainers = db.query(User).filter(User.role == "trainer").order_by(User.id.asc()).all()
    all_sessions = db.query(ClassSession).all()
    sessions_by_trainer: Dict[int, List[ClassSession]] = {}
    for s in all_sessions:
        sessions_by_trainer.setdefault(s.trainer_id, []).append(s)

    trainer_cards = [
        _build_trainer_card(t, sessions_by_trainer.get(t.id, []), today_iso, window_start_iso)
        for t in trainers
    ]

    active_package = get_active_package_for_member(db, member_id)

    member_booked_q = (
        db.query(Booking)
        .options(joinedload(Booking.session).joinedload(ClassSession.trainer))
        .filter(Booking.member_id == member_id, Booking.status == "booked")
        .all()
    )
    future_bookings = sorted(
        [b for b in member_booked_q if b.session and b.session.date >= today_iso],
        key=lambda b: (b.session.date, b.session.start_time),
    )
    upcoming_booking = _build_member_booking_item(future_bookings[0]) if future_bookings else None

    wod = DAILY_WOD_CATALOG[date.today().toordinal() % len(DAILY_WOD_CATALOG)]
    recent_checkins = _build_recent_checkins(db, member_id)

    return ClubHomeOut(
        member=_to_user_out(member),
        streak_days=member.streak_days or 0,
        active_package=PackageOut.model_validate(active_package) if active_package else None,
        upcoming_booking=upcoming_booking,
        announcements=[AnnouncementOut.model_validate(a) for a in announcements],
        trainers=trainer_cards,
        wod_title=wod["wod_title"],
        wod_focus=wod["wod_focus"],
        wod_duration_min=wod["wod_duration_min"],
        wod_calories=wod["wod_calories"],
        wod_movements=wod["wod_movements"],
        motivation_quote=wod["motivation_quote"],
        recent_checkins=recent_checkins,
    )


@app.get("/trainers", response_model=List[TrainerCardOut])
def list_trainers(
    member_id: Optional[int] = Query(default=None, description="Opsiyonel üye ID"),
    db: Session = Depends(get_db),
):
    today_iso = _today_iso()
    window_start_iso = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")

    trainers = db.query(User).filter(User.role == "trainer").order_by(User.id.asc()).all()
    all_sessions = db.query(ClassSession).all()
    sessions_by_trainer: Dict[int, List[ClassSession]] = {}
    for s in all_sessions:
        sessions_by_trainer.setdefault(s.trainer_id, []).append(s)

    return [
        _build_trainer_card(t, sessions_by_trainer.get(t.id, []), today_iso, window_start_iso)
        for t in trainers
    ]


@app.get("/trainers/{trainer_id}", response_model=TrainerDetailOut)
def get_trainer_detail(
    trainer_id: int,
    member_id: Optional[int] = Query(default=None, description="Üyenin kayıt/yedek durumunu işaretlemek için opsiyonel üye ID"),
    db: Session = Depends(get_db),
):
    trainer = db.query(User).filter(User.id == trainer_id, User.role == "trainer").first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")

    today_iso = _today_iso()
    window_start_iso = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")

    trainer_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer), joinedload(ClassSession.bookings))
        .filter(ClassSession.trainer_id == trainer_id)
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    card = _build_trainer_card(trainer, trainer_sessions, today_iso, window_start_iso)

    distinct_students = set()
    attended_count = 0
    noshow_count = 0
    for s in trainer_sessions:
        for b in s.bookings:
            if b.status != "cancelled":
                distinct_students.add(b.member_id)
            if b.status == "attended":
                attended_count += 1
            elif b.status == "no_show":
                noshow_count += 1

    evaluated_total = attended_count + noshow_count
    attendance_rate = (
        round((attended_count / evaluated_total) * 100.0, 1)
        if evaluated_total > 0
        else 97.5
    )

    booked_session_map: Dict[int, int] = {}
    if member_id is not None:
        member_bookings = (
            db.query(Booking)
            .filter(Booking.member_id == member_id, Booking.status != "cancelled")
            .all()
        )
        for b in member_bookings:
            booked_session_map[b.session_id] = b.id

    waitlist_by_session = _load_waitlist_by_session(db)
    future_sessions = [s for s in trainer_sessions if s.date >= today_iso]
    open_sessions = [
        _build_available_session_out(s, booked_session_map, waitlist_by_session, member_id)
        for s in future_sessions
    ]

    return TrainerDetailOut(
        id=card.id,
        full_name=card.full_name,
        phone=card.phone,
        instagram_handle=card.instagram_handle,
        avatar_url=card.avatar_url,
        specialty=card.specialty,
        bio=card.bio,
        certificates=card.certificates,
        rating=card.rating,
        experience_years=card.experience_years,
        active_sessions_count=card.active_sessions_count,
        monthly_classes_given=card.monthly_classes_given,
        total_students_count=len(distinct_students),
        attendance_rate_pct=attendance_rate,
        open_sessions=open_sessions,
    )


# ============================================================================
# MÜŞTERİ (MEMBER) ENDPOINT'LERİ
# ============================================================================


@app.get("/member/{member_id}/dashboard", response_model=MemberDashboardOut)
def get_member_dashboard(member_id: int, db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    today_iso = _today_iso()

    all_member_packages = (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id)
        .order_by(MemberPackage.is_active.desc(), MemberPackage.id.desc())
        .all()
    )
    active_package = next((p for p in all_member_packages if p.is_active), None)

    member_bookings_q = (
        db.query(Booking)
        .options(joinedload(Booking.session).joinedload(ClassSession.trainer))
        .filter(Booking.member_id == member_id, Booking.status != "cancelled")
        .all()
    )

    member_bookings_sorted = sorted(
        [b for b in member_bookings_q if b.session is not None],
        key=lambda b: (b.session.date, b.session.start_time),
    )

    my_bookings: List[MemberBookingItemOut] = []
    booked_session_map: Dict[int, int] = {}
    for b in member_bookings_sorted:
        booked_session_map[b.session.id] = b.id
        my_bookings.append(_build_member_booking_item(b))

    upcoming_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .filter(ClassSession.date >= today_iso)
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    waitlist_by_session = _load_waitlist_by_session(db)

    available_sessions = [
        _build_available_session_out(s, booked_session_map, waitlist_by_session, member_id)
        for s in upcoming_sessions
    ]

    waitlist_items: List[MemberWaitlistItemOut] = []
    for s_id, w_entries in waitlist_by_session.items():
        for idx, w in enumerate(w_entries, start=1):
            if w.member_id == member_id and w.session and w.session.date >= today_iso:
                sess = w.session
                tr = sess.trainer
                waitlist_items.append(
                    MemberWaitlistItemOut(
                        waitlist_id=w.id,
                        session_id=sess.id,
                        position=idx,
                        total_waiting=len(w_entries),
                        created_at=w.created_at,
                        title=sess.title,
                        category=sess.category or "Fonksiyonel",
                        room=sess.room or "Ana Stüdyo",
                        date=sess.date,
                        start_time=sess.start_time,
                        end_time=sess.end_time,
                        trainer_id=sess.trainer_id,
                        trainer_name=tr.full_name if tr else "Eğitmen",
                        trainer_avatar_url=tr.avatar_url if tr else None,
                        capacity=sess.capacity,
                        current_enrolled=sess.current_enrolled,
                    )
                )
    waitlist_items.sort(key=lambda item: (item.date, item.start_time))

    recent_checkins = _build_recent_checkins(db, member_id)

    return MemberDashboardOut(
        member=_to_user_out(member),
        active_package=PackageOut.model_validate(active_package) if active_package else None,
        all_packages=[PackageOut.model_validate(p) for p in all_member_packages],
        my_bookings=my_bookings,
        available_sessions=available_sessions,
        waitlist_items=waitlist_items,
        recent_checkins=recent_checkins,
    )


@app.get("/member/{member_id}/metrics", response_model=MemberMetricsSummaryOut)
def get_member_metrics(member_id: int, db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    metric_rows = (
        db.query(BodyMetrics)
        .filter(BodyMetrics.member_id == member_id)
        .order_by(BodyMetrics.date.asc(), BodyMetrics.id.asc())
        .all()
    )
    metrics_out = [BodyMetricOut.model_validate(m) for m in metric_rows]

    latest = metrics_out[-1] if metrics_out else None
    previous = metrics_out[-2] if len(metrics_out) >= 2 else None

    weight_diff = round(latest.weight_kg - previous.weight_kg, 2) if (latest and previous) else 0.0
    fat_diff = round(latest.body_fat_pct - previous.body_fat_pct, 2) if (latest and previous) else 0.0
    muscle_diff = round(latest.muscle_mass_kg - previous.muscle_mass_kg, 2) if (latest and previous) else 0.0

    latest_comment = ""
    for m in reversed(metrics_out):
        if m.trainer_comment and m.trainer_comment.strip():
            latest_comment = m.trainer_comment.strip()
            break

    attended_bookings = (
        db.query(Booking)
        .options(joinedload(Booking.session).joinedload(ClassSession.trainer))
        .filter(Booking.member_id == member_id, Booking.status == "attended")
        .all()
    )
    attended_sorted = sorted(
        [b for b in attended_bookings if b.session is not None],
        key=lambda b: (b.session.date, b.session.start_time),
        reverse=True,
    )
    completed_sessions = [_build_member_booking_item(b) for b in attended_sorted]

    wellness_map = _load_today_wellness_map(db)
    w_fields = _extract_member_wellness_fields(member, wellness_map.get(member.id))

    return MemberMetricsSummaryOut(
        member_id=member.id,
        member_name=member.full_name,
        metrics=metrics_out,
        latest=latest,
        previous=previous,
        weight_diff_kg=weight_diff,
        body_fat_diff_pct=fat_diff,
        muscle_mass_diff_kg=muscle_diff,
        latest_trainer_comment=latest_comment,
        completed_sessions_count=len(completed_sessions),
        completed_sessions=completed_sessions,
        **w_fields,  # type: ignore[arg-type]
    )


@app.put("/member/{member_id}/profile", response_model=UserOut)
def update_member_profile(
    member_id: int,
    payload: MemberProfileUpdateRequest,
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    if payload.full_name is not None:
        cleaned_name = payload.full_name.strip()
        if not cleaned_name:
            raise HTTPException(status_code=400, detail="Ad Soyad boş bırakılamaz.")
        member.full_name = cleaned_name

    if payload.phone is not None:
        cleaned_phone = payload.phone.strip()
        if not cleaned_phone:
            raise HTTPException(status_code=400, detail="Telefon numarası boş bırakılamaz.")
        member.phone = cleaned_phone

    if payload.instagram_handle is not None:
        raw_ig = payload.instagram_handle.strip()
        member.instagram_handle = normalize_handle(raw_ig) if raw_ig else None

    if payload.notify_reminders is not None:
        member.notify_reminders = payload.notify_reminders
    if payload.notify_waitlist is not None:
        member.notify_waitlist = payload.notify_waitlist
    if payload.notify_campaigns is not None:
        member.notify_campaigns = payload.notify_campaigns

    db.commit()
    db.refresh(member)
    return _to_user_out(member)


@app.post("/member/{member_id}/renew-package", response_model=PackageRenewResponse)
def renew_member_package(
    member_id: int,
    payload: PackageRenewRequest,
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    pkg_name = (payload.package_name or "").strip()
    if not pkg_name:
        raise HTTPException(status_code=400, detail="Paket adı zorunludur.")

    added_credits = int(payload.credits)
    if added_credits <= 0:
        raise HTTPException(status_code=400, detail="Eklenecek ders kredisi 0'dan büyük olmalıdır.")

    duration_days = (
        int(payload.duration_days)
        if payload.duration_days is not None and int(payload.duration_days) > 0
        else 45
    )

    today = date.today()
    active_pkg = get_active_package_for_member(db, member_id)

    if active_pkg:
        prev_remaining = max(0, active_pkg.remaining_credits)
        prev_total = max(prev_remaining, active_pkg.total_credits)

        base_date = today
        try:
            parsed_exp = datetime.strptime((active_pkg.expiry_date or "").strip(), "%Y-%m-%d").date()
            if parsed_exp > today:
                base_date = parsed_exp
        except Exception:
            base_date = today

        new_expiry = (base_date + timedelta(days=duration_days)).strftime("%Y-%m-%d")

        active_pkg.remaining_credits = prev_remaining + added_credits
        active_pkg.total_credits = prev_total + added_credits
        active_pkg.package_name = pkg_name
        active_pkg.expiry_date = new_expiry
        active_pkg.is_active = True
        target_pkg = active_pkg
    else:
        new_expiry = (today + timedelta(days=duration_days)).strftime("%Y-%m-%d")
        target_pkg = MemberPackage(
            member_id=member.id,
            package_name=pkg_name,
            total_credits=added_credits,
            remaining_credits=added_credits,
            expiry_date=new_expiry,
            is_active=True,
        )
        db.add(target_pkg)

    db.commit()
    db.refresh(target_pkg)

    return PackageRenewResponse(
        message=(
            f"{pkg_name} başarıyla tanımlandı! +{added_credits} ders kredisi hesabınıza eklendi. "
            f"Güncel bakiyeniz: {target_pkg.remaining_credits} / {target_pkg.total_credits} ders."
        ),
        member_id=member.id,
        package_id=target_pkg.id,
        package_name=target_pkg.package_name,
        added_credits=added_credits,
        remaining_credits=target_pkg.remaining_credits,
        total_credits=target_pkg.total_credits,
        expiry_date=target_pkg.expiry_date,
    )


# ============================================================================
# RANDEVU (BOOKING) & YEDEK LİSTE (WAITLIST) ENDPOINT'LERİ
# ============================================================================


@app.post("/bookings/create", response_model=BookingActionResponse)
def create_booking(payload: BookingCreateRequest, db: Session = Depends(get_db)):
    return create_booking_internal(db, payload.member_id, payload.session_id)


@app.post("/bookings/cancel", response_model=BookingActionResponse)
def cancel_booking(payload: BookingCancelRequest, db: Session = Depends(get_db)):
    booking = None
    if payload.booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    elif payload.member_id is not None and payload.session_id is not None:
        booking = (
            db.query(Booking)
            .filter(
                Booking.member_id == payload.member_id,
                Booking.session_id == payload.session_id,
                Booking.status == "booked",
            )
            .first()
        )

    if not booking:
        raise HTTPException(status_code=404, detail="İptal edilecek randevu bulunamadı.")

    if booking.status == "cancelled":
        raise HTTPException(status_code=400, detail="Bu randevu zaten iptal edilmiş.")

    if booking.status in ("attended", "no_show"):
        raise HTTPException(status_code=400, detail="Yoklaması tamamlanmış ders iptal edilemez.")

    session_obj = db.query(ClassSession).filter(ClassSession.id == booking.session_id).first()
    package = db.query(MemberPackage).filter(MemberPackage.id == booking.package_id).first()
    if not package:
        package = get_active_package_for_member(db, booking.member_id)

    booking.status = "cancelled"
    if session_obj:
        session_obj.current_enrolled = max(0, session_obj.current_enrolled - 1)
    if package:
        package.remaining_credits += 1

    db.flush()

    # OTOMATİK TERFİ KURALI: Yedek listede bekleyen ve kredisi olan ilk üyeyi otomatik derse al
    promoted_member_id: Optional[int] = None
    promoted_member_name: Optional[str] = None
    if session_obj:
        promoted_member_id, promoted_member_name = promote_next_waitlist_member(db, session_obj)

    db.commit()
    db.refresh(booking)
    if package:
        db.refresh(package)
    if session_obj:
        db.refresh(session_obj)

    if promoted_member_name:
        msg = (
            f"Randevunuz iptal edildi ve 1 ders krediniz paketinize iade edildi. "
            f"Yedek listede bekleyen {promoted_member_name} otomatik olarak derse kaydedildi."
        )
    else:
        msg = "Randevunuz iptal edildi ve 1 ders krediniz paketinize iade edildi."

    return BookingActionResponse(
        message=msg,
        booking_id=booking.id,
        status=booking.status,
        remaining_credits=package.remaining_credits if package else 0,
        session_id=session_obj.id if session_obj else booking.session_id,
        current_enrolled=session_obj.current_enrolled if session_obj else 0,
        capacity=session_obj.capacity if session_obj else 0,
        promoted_from_waitlist_member_id=promoted_member_id,
        promoted_from_waitlist_member_name=promoted_member_name,
    )


@app.post("/bookings/waitlist", response_model=WaitlistActionResponse)
def join_waitlist(payload: BookingCreateRequest, db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == payload.member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    session_obj = db.query(ClassSession).filter(ClassSession.id == payload.session_id).first()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Ders seansı bulunamadı.")

    if session_obj.date < _today_iso():
        raise HTTPException(status_code=400, detail="Geçmiş tarihli bir dersin yedek listesine yazılamaz.")

    existing_active = (
        db.query(Booking)
        .filter(
            Booking.session_id == payload.session_id,
            Booking.member_id == payload.member_id,
            Booking.status.in_(["booked", "attended"]),
        )
        .first()
    )
    if existing_active:
        raise HTTPException(status_code=400, detail="Bu derse zaten aktif bir kaydınız bulunuyor.")

    existing_waitlist = (
        db.query(Waitlist)
        .filter(
            Waitlist.session_id == payload.session_id,
            Waitlist.member_id == payload.member_id,
        )
        .first()
    )
    if existing_waitlist:
        raise HTTPException(status_code=400, detail="Bu dersin yedek listesinde zaten yer alıyorsunuz.")

    if session_obj.current_enrolled < session_obj.capacity:
        raise HTTPException(
            status_code=400,
            detail="Derste boş yer var, doğrudan kayıt olabilirsiniz.",
        )

    pkg = get_active_package_for_member(db, payload.member_id)
    if not pkg or pkg.remaining_credits <= 0:
        raise HTTPException(
            status_code=400,
            detail="Yedek listeye yazılmak için aktif paketinizde en az 1 ders kredisi bulunmalıdır.",
        )

    entry = Waitlist(
        session_id=payload.session_id,
        member_id=payload.member_id,
        created_at=_now_str(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    queue = (
        db.query(Waitlist)
        .filter(Waitlist.session_id == payload.session_id)
        .order_by(Waitlist.id.asc())
        .all()
    )
    position = next((idx for idx, w in enumerate(queue, start=1) if w.id == entry.id), len(queue))

    return WaitlistActionResponse(
        message=(
            f"Yedek listeye {position}. sıradan kaydınız alındı. "
            f"Kontenjan açıldığında derse otomatik kaydedileceksiniz."
        ),
        waitlist_id=entry.id,
        session_id=payload.session_id,
        member_id=payload.member_id,
        position=position,
        waitlist_count=len(queue),
        status="waitlisted",
    )


@app.post("/bookings/waitlist/cancel", response_model=WaitlistActionResponse)
def cancel_waitlist(payload: WaitlistCancelRequest, db: Session = Depends(get_db)):
    entry: Optional[Waitlist] = None
    if payload.waitlist_id is not None:
        entry = db.query(Waitlist).filter(Waitlist.id == payload.waitlist_id).first()
    elif payload.member_id is not None and payload.session_id is not None:
        entry = (
            db.query(Waitlist)
            .filter(
                Waitlist.member_id == payload.member_id,
                Waitlist.session_id == payload.session_id,
            )
            .first()
        )

    if not entry:
        raise HTTPException(status_code=404, detail="Yedek liste kaydı bulunamadı.")

    entry_id = entry.id
    sess_id = entry.session_id
    mem_id = entry.member_id

    db.delete(entry)
    db.commit()

    remaining_count = db.query(Waitlist).filter(Waitlist.session_id == sess_id).count()

    return WaitlistActionResponse(
        message="Yedek liste kaydınız iptal edildi.",
        waitlist_id=entry_id,
        session_id=sess_id,
        member_id=mem_id,
        position=0,
        waitlist_count=remaining_count,
        status="cancelled",
    )


# ============================================================================
# EĞİTMEN (TRAINER) TAKVİM, YENİ DERS, CRM & ÖLÇÜM ENDPOINT'LERİ
# ============================================================================


@app.get("/trainer/members", response_model=List[TrainerMemberCrmOut])
def list_trainer_crm_members(db: Session = Depends(get_db)):
    members = db.query(User).filter(User.role == "member").order_by(User.id.asc()).all()

    all_metrics = (
        db.query(BodyMetrics)
        .order_by(BodyMetrics.date.desc(), BodyMetrics.id.desc())
        .all()
    )
    latest_metric_by_member: Dict[int, BodyMetricOut] = {}
    for m in all_metrics:
        if m.member_id not in latest_metric_by_member:
            latest_metric_by_member[m.member_id] = BodyMetricOut.model_validate(m)

    attended_rows = (
        db.query(Booking.member_id)
        .filter(Booking.status == "attended")
        .all()
    )
    attended_count_by_member: Dict[int, int] = {}
    for (m_id,) in attended_rows:
        attended_count_by_member[m_id] = attended_count_by_member.get(m_id, 0) + 1

    wellness_map = _load_today_wellness_map(db)
    crm_list: List[TrainerMemberCrmOut] = []
    for u in members:
        pkg = get_active_package_for_member(db, u.id)
        rem = pkg.remaining_credits if pkg else 0
        tot = pkg.total_credits if pkg else 0
        w_fields = _extract_member_wellness_fields(u, wellness_map.get(u.id))
        crm_list.append(
            TrainerMemberCrmOut(
                id=u.id,
                full_name=u.full_name,
                phone=u.phone,
                instagram_handle=u.instagram_handle,
                avatar_url=u.avatar_url,
                streak_days=u.streak_days or 0,
                notes=u.notes or "",
                package_id=pkg.id if pkg else None,
                package_name=pkg.package_name if pkg else None,
                remaining_credits=rem,
                total_credits=tot,
                expiry_date=pkg.expiry_date if pkg else None,
                low_credit_warning=(rem <= 2),
                attended_sessions_count=attended_count_by_member.get(u.id, 0),
                latest_metric=latest_metric_by_member.get(u.id),
                **w_fields,  # type: ignore[arg-type]
            )
        )
    return crm_list


@app.get("/trainer/members/{member_id}", response_model=TrainerMemberCrmOut)
def get_trainer_crm_member_detail(member_id: int, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not u:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı.")

    latest_m = (
        db.query(BodyMetrics)
        .filter(BodyMetrics.member_id == u.id)
        .order_by(BodyMetrics.date.desc(), BodyMetrics.id.desc())
        .first()
    )
    attended_cnt = (
        db.query(Booking)
        .filter(Booking.member_id == u.id, Booking.status == "attended")
        .count()
    )
    pkg = get_active_package_for_member(db, u.id)
    rem = pkg.remaining_credits if pkg else 0
    tot = pkg.total_credits if pkg else 0
    wellness_map = _load_today_wellness_map(db)
    w_fields = _extract_member_wellness_fields(u, wellness_map.get(u.id))

    return TrainerMemberCrmOut(
        id=u.id,
        full_name=u.full_name,
        phone=u.phone,
        instagram_handle=u.instagram_handle,
        avatar_url=u.avatar_url,
        streak_days=u.streak_days or 0,
        notes=u.notes or "",
        package_id=pkg.id if pkg else None,
        package_name=pkg.package_name if pkg else None,
        remaining_credits=rem,
        total_credits=tot,
        expiry_date=pkg.expiry_date if pkg else None,
        low_credit_warning=(rem <= 2),
        attended_sessions_count=attended_cnt,
        latest_metric=BodyMetricOut.model_validate(latest_m) if latest_m else None,
        **w_fields,  # type: ignore[arg-type]
    )


@app.post("/trainer/sessions/create", response_model=TrainerSessionOut)
def create_trainer_session(
    payload: TrainerSessionCreateRequest,
    db: Session = Depends(get_db),
):
    trainer = (
        db.query(User)
        .filter(User.id == payload.trainer_id, User.role == "trainer")
        .first()
    )
    if not trainer:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Ders başlığı zorunludur.")

    date_str = (payload.date or "").strip()
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Tarih YYYY-AA-GG (YYYY-MM-DD) formatında olmalıdır.")

    start_hhmm = _normalize_hhmm(payload.start_time, "Başlangıç saati")
    if payload.end_time and payload.end_time.strip():
        end_hhmm = _normalize_hhmm(payload.end_time, "Bitiş saati")
    else:
        end_hhmm = _add_minutes_hhmm(start_hhmm, 60)

    if payload.capacity < 1 or payload.capacity > 15:
        raise HTTPException(status_code=400, detail="Kontenjan 1 ile 15 kişi arasında olmalıdır.")

    conflict = (
        db.query(ClassSession)
        .filter(
            ClassSession.trainer_id == trainer.id,
            ClassSession.date == date_str,
            ClassSession.start_time == start_hhmm,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"{date_str} tarihinde saat {start_hhmm} için zaten tanımlı bir dersiniz bulunuyor.",
        )

    category = (payload.category or "").strip() or "Fonksiyonel"
    room = (payload.room or "").strip() or _default_room_for_category(category)

    new_session = ClassSession(
        trainer_id=trainer.id,
        title=title,
        category=category,
        room=room,
        date=date_str,
        start_time=start_hhmm,
        end_time=end_hhmm,
        capacity=payload.capacity,
        current_enrolled=0,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return TrainerSessionOut(
        id=new_session.id,
        trainer_id=trainer.id,
        trainer_name=trainer.full_name,
        title=new_session.title,
        category=new_session.category,
        room=new_session.room,
        date=new_session.date,
        start_time=new_session.start_time,
        end_time=new_session.end_time,
        capacity=new_session.capacity,
        current_enrolled=0,
        attendees=[],
        waitlist=[],
    )


@app.post("/trainer/metrics", response_model=BodyMetricOut)
def create_member_metric(
    payload: BodyMetricCreateRequest,
    db: Session = Depends(get_db),
):
    member = (
        db.query(User)
        .filter(User.id == payload.member_id, User.role == "member")
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    metric_date = (payload.date or "").strip() or _today_iso()
    try:
        datetime.strptime(metric_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Ölçüm tarihi YYYY-MM-DD formatında olmalıdır.")

    if payload.weight_kg <= 20 or payload.weight_kg >= 300:
        raise HTTPException(status_code=400, detail="Lütfen geçerli bir kilo (kg) değeri girin.")
    if payload.body_fat_pct <= 2 or payload.body_fat_pct >= 65:
        raise HTTPException(status_code=400, detail="Lütfen geçerli bir yağ oranı (%) değeri girin.")
    if payload.muscle_mass_kg <= 10 or payload.muscle_mass_kg >= 150:
        raise HTTPException(status_code=400, detail="Lütfen geçerli bir kas kütlesi (kg) değeri girin.")

    metric = BodyMetrics(
        member_id=member.id,
        date=metric_date,
        weight_kg=round(payload.weight_kg, 2),
        body_fat_pct=round(payload.body_fat_pct, 2),
        muscle_mass_kg=round(payload.muscle_mass_kg, 2),
        trainer_comment=(payload.trainer_comment or "").strip(),
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return BodyMetricOut.model_validate(metric)


@app.get("/trainer/{trainer_id}/schedule", response_model=TrainerScheduleOut)
def get_trainer_schedule(
    trainer_id: int,
    date_filter: Optional[str] = Query(default=None, alias="date", description="YYYY-MM-DD tarih filtresi (opsiyonel)"),
    db: Session = Depends(get_db),
):
    trainer = db.query(User).filter(User.id == trainer_id, User.role == "trainer").first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")

    all_trainer_sessions = (
        db.query(ClassSession)
        .options(
            joinedload(ClassSession.bookings).joinedload(Booking.member),
            joinedload(ClassSession.bookings).joinedload(Booking.package),
            joinedload(ClassSession.waitlist_entries).joinedload(Waitlist.member),
        )
        .filter(ClassSession.trainer_id == trainer_id)
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    available_dates = sorted({s.date for s in all_trainer_sessions})

    window_start_iso = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")
    monthly_sessions = [s for s in all_trainer_sessions if s.date >= window_start_iso]
    monthly_sessions_count = len(monthly_sessions)
    monthly_attendees_count = sum(s.current_enrolled for s in monthly_sessions)
    total_capacity = sum(s.capacity for s in monthly_sessions)
    avg_fill_rate = (
        round((monthly_attendees_count / total_capacity) * 100.0, 1)
        if total_capacity > 0
        else 0.0
    )

    filtered_sessions = (
        [s for s in all_trainer_sessions if s.date == date_filter]
        if date_filter
        else all_trainer_sessions
    )

    wellness_map = _load_today_wellness_map(db)
    session_items: List[TrainerSessionOut] = []
    for s in filtered_sessions:
        attendees: List[AttendeeOut] = []
        active_bookings = [b for b in s.bookings if b.status != "cancelled" and b.member is not None]
        active_bookings.sort(key=lambda b: b.id)

        for b in active_bookings:
            m = b.member
            pkg = get_active_package_for_member(db, b.member_id) or b.package
            rem = pkg.remaining_credits if pkg else 0
            tot = pkg.total_credits if pkg else 0
            w_fields = _extract_member_wellness_fields(m, wellness_map.get(m.id))
            attendees.append(
                AttendeeOut(
                    booking_id=b.id,
                    member_id=m.id,
                    full_name=m.full_name,
                    phone=m.phone,
                    instagram_handle=m.instagram_handle,
                    avatar_url=m.avatar_url,
                    notes=m.notes or "",
                    package_name=pkg.package_name if pkg else None,
                    remaining_credits=rem,
                    total_credits=tot,
                    low_credit_warning=(rem <= 2),
                    status=b.status,
                    **w_fields,  # type: ignore[arg-type]
                )
            )

        sorted_waitlist = sorted(
            [w for w in s.waitlist_entries if w.member is not None],
            key=lambda w: w.id,
        )
        waitlist_out: List[WaitlistEntryOut] = []
        for idx, w in enumerate(sorted_waitlist, start=1):
            wm = w.member
            wpkg = get_active_package_for_member(db, wm.id)
            waitlist_out.append(
                WaitlistEntryOut(
                    waitlist_id=w.id,
                    position=idx,
                    member_id=wm.id,
                    full_name=wm.full_name,
                    phone=wm.phone,
                    instagram_handle=wm.instagram_handle,
                    avatar_url=wm.avatar_url,
                    remaining_credits=wpkg.remaining_credits if wpkg else 0,
                    total_credits=wpkg.total_credits if wpkg else 0,
                    created_at=w.created_at,
                )
            )

        session_items.append(
            TrainerSessionOut(
                id=s.id,
                trainer_id=trainer.id,
                trainer_name=trainer.full_name,
                title=s.title,
                category=s.category or "Fonksiyonel",
                room=s.room or "Ana Stüdyo",
                date=s.date,
                start_time=s.start_time,
                end_time=s.end_time,
                capacity=s.capacity,
                current_enrolled=s.current_enrolled,
                attendees=attendees,
                waitlist=waitlist_out,
            )
        )

    return TrainerScheduleOut(
        trainer=_to_user_out(trainer),
        available_dates=available_dates,
        monthly_sessions_count=monthly_sessions_count,
        monthly_attendees_count=monthly_attendees_count,
        average_fill_rate_pct=avg_fill_rate,
        sessions=session_items,
    )


@app.post("/trainer/attendance")
def update_attendance(payload: AttendanceUpdateRequest, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı.")

    if booking.status == "cancelled":
        raise HTTPException(status_code=400, detail="İptal edilmiş kayda yoklama girilemez.")

    booking.status = payload.status
    db.commit()
    db.refresh(booking)

    return {
        "message": "Yoklama durumu güncellendi.",
        "booking_id": booking.id,
        "status": booking.status,
    }


@app.put("/trainer/member/{member_id}/notes", response_model=UserOut)
def update_member_notes_by_id(
    member_id: int,
    payload: MemberNotesUpdateRequest,
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    member.notes = payload.notes.strip()
    db.commit()
    db.refresh(member)
    return _to_user_out(member)


@app.post("/trainer/notes", response_model=UserOut)
def update_member_notes_post(
    payload: MemberNotesUpdateRequest,
    db: Session = Depends(get_db),
):
    if payload.member_id is None:
        raise HTTPException(status_code=400, detail="member_id zorunludur.")

    member = db.query(User).filter(User.id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    member.notes = payload.notes.strip()
    db.commit()
    db.refresh(member)
    return _to_user_out(member)


@app.post("/instagram/webhook", response_model=InstagramWebhookResponse)
def instagram_webhook(
    payload: InstagramWebhookRequest,
    db: Session = Depends(get_db),
):
    result = process_instagram_dm(db, payload.instagram_handle, payload.message)
    return InstagramWebhookResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
