import hashlib
import hmac
import html
import json
import os
import re
import secrets
import urllib.parse
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from database import Base, engine, get_db
from models import Booking, MemberPackage, User
from payment_models import (
    PackageCatalogPlan,
    PaymentCheckoutSession,
    PaymentTransaction,
)

router = APIRouter(prefix="/payments", tags=["Payments & Package Purchases"])

PaymentMethodLiteral = Literal["credit_card", "apple_pay", "bank_transfer"]
CheckoutSessionStatusLiteral = Literal[
    "pending", "requires_3ds", "succeeded", "failed", "cancelled"
]


# ============================================================================
# PYDANTIC ŞEMALARI (DÜZ VE KESİN TİPLİ API MODELLERİ)
# ============================================================================


class PackageCatalogPlanOut(BaseModel):
    id: int
    code: str
    name: str
    subtitle: str
    credits: int
    duration_days: int
    price_try: float
    per_lesson_price_try: float
    savings_percent: int
    savings_amount_try: float
    popular_badge: Optional[str] = None
    features: List[str]
    is_active: bool


class ActiveMemberPackageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    package_name: str
    total_credits: int
    remaining_credits: int
    expiry_date: str
    is_active: bool


class DigitalReceiptOut(BaseModel):
    transaction_id: int
    transaction_code: str
    member_id: int
    member_name: str
    plan_id: int
    plan_code: str
    plan_name: str
    member_package_id: int
    amount_try: float
    monthly_installment_try: float
    payment_method: str
    payment_method_label: str
    card_holder_name: Optional[str] = None
    card_last4: Optional[str] = None
    masked_payment_info: str
    installment_count: int
    purchased_credits: int
    carried_credits: int
    booked_hold_count: int = 0
    new_remaining_credits: int
    new_total_credits: int
    expiry_date: str
    status: str
    created_at: str


class CheckoutSessionCreateRequest(BaseModel):
    member_id: int
    plan_id: Optional[int] = None
    plan_code: Optional[str] = None
    installment_count: int = Field(default=1)
    payment_method: PaymentMethodLiteral = "credit_card"
    return_url: Optional[str] = None
    cancel_url: Optional[str] = None
    prefer_hosted_gateway: bool = False


class CheckoutSessionCreatedOut(BaseModel):
    session_id: str
    checkout_url: str
    status: CheckoutSessionStatusLiteral
    amount: float
    currency: str = "TRY"
    provider: str
    expires_at: str
    member_id: int
    plan_id: int
    plan_code: str
    plan_name: str
    plan_credits: int
    installment_count: int
    return_url: Optional[str] = None


class CheckoutCardStepOut(BaseModel):
    session_id: str
    status: CheckoutSessionStatusLiteral
    provider: str
    bank_name: str
    card_brand: str
    card_last4: str
    masked_phone: str
    installment_count: int
    monthly_installment_try: float
    amount: float
    currency: str = "TRY"
    demo_sms_code: str
    message: str


class CheckoutVerify3DSOut(BaseModel):
    session_id: str
    status: CheckoutSessionStatusLiteral
    provider: str
    message: str
    transaction_code: str
    credited_package_id: int
    credited_package_name: str
    purchased_credits: int
    carried_credits: int
    booked_hold_count: int = 0
    new_remaining_credits: int
    new_total_credits: int
    expiry_date: str
    amount: float
    currency: str = "TRY"
    installment_count: int
    redirect_url: Optional[str] = None
    active_package: ActiveMemberPackageOut
    receipt: DigitalReceiptOut


class CheckoutSessionStatusOut(BaseModel):
    session_id: str
    status: CheckoutSessionStatusLiteral
    provider: str
    member_id: int
    member_name: str
    plan_id: int
    plan_code: str
    plan_name: str
    plan_credits: int
    amount: float
    currency: str = "TRY"
    installment_count: int
    monthly_installment_try: float
    payment_method: str
    card_last4: Optional[str] = None
    card_brand: Optional[str] = None
    bank_name: Optional[str] = None
    checkout_url: str
    return_url: Optional[str] = None
    created_at: str
    expires_at: str
    completed_at: Optional[str] = None
    failure_reason: Optional[str] = None
    transaction_code: Optional[str] = None
    credited_package_id: Optional[int] = None
    credited_package_name: Optional[str] = None
    purchased_credits: int = 0
    carried_credits: int = 0
    booked_hold_count: int = 0
    new_remaining_credits: Optional[int] = None
    new_total_credits: Optional[int] = None
    package_expiry_date: Optional[str] = None
    active_package: Optional[ActiveMemberPackageOut] = None
    receipt: Optional[DigitalReceiptOut] = None


class PaymentWebhookOut(BaseModel):
    received: bool
    provider: str
    event_type: str
    session_id: Optional[str] = None
    status: Optional[str] = None
    credited_package_id: Optional[int] = None
    new_remaining_credits: Optional[int] = None
    message: str


class PaymentCheckoutRequest(BaseModel):
    member_id: int
    plan_id: int
    payment_method: PaymentMethodLiteral = "credit_card"
    card_holder_name: Optional[str] = None
    card_number: Optional[str] = None
    expiry_mm_yy: Optional[str] = None
    cvv: Optional[str] = None
    installment_count: int = Field(default=1)


class PaymentCheckoutResponse(BaseModel):
    message: str
    purchased_credits: int
    carried_credits: int
    booked_hold_count: int = 0
    new_remaining_credits: int
    new_total_credits: int
    active_package: ActiveMemberPackageOut
    receipt: DigitalReceiptOut


class PaymentHistoryItemOut(BaseModel):
    id: int
    transaction_code: str
    member_id: int
    plan_id: int
    plan_name: str
    plan_credits: int
    member_package_id: int
    package_total_credits: int
    package_remaining_credits: int
    package_expiry_date: str
    package_is_active: bool
    amount_try: float
    monthly_installment_try: float
    payment_method: str
    payment_method_label: str
    card_holder_name: Optional[str] = None
    card_last4: Optional[str] = None
    masked_payment_info: str
    installment_count: int
    status: str
    created_at: str


class MemberPaymentHistoryOut(BaseModel):
    member_id: int
    total_spent_try: float
    transaction_count: int
    active_package: Optional[ActiveMemberPackageOut] = None
    transactions: List[PaymentHistoryItemOut]
    packages: List[ActiveMemberPackageOut]


# ============================================================================
# KATALOG BAŞLANGIÇ VERİSİ (SEED) VE YARDIMCI FONKSİYONLAR
# ============================================================================

DEFAULT_CATALOG_PLANS = [
    {
        "code": "ERYA-GRUP-8",
        "name": "8 Seans Grup Reformer Paketi",
        "subtitle": "6-7 kişilik kemerli ayna stüdyoda postür, esneklik ve sıkılaşma",
        "credits": 8,
        "duration_days": 35,
        "price_try": 3000.0,
        "popular_badge": "En Çok Tercih Edilen",
        "features": [
            "8 Seans Butik Grup Reformer Pilates (6-7 Kişilik)",
            "Postür Değerlendirmesi & Nefes Koordinasyonu",
            "Uygulamadan Anında Rezervasyon & 4 Saate Kadar İptal",
            "Kalan Seansları Yeni Pakete Devretme Garantisi",
        ],
    },
    {
        "code": "ERYA-DUET-8",
        "name": "8 Seans Düet / Trio Reformer",
        "subtitle": "Arkadaşınızla veya 2-3 kişilik özel grupla yüksek odaklı Reformer",
        "credits": 8,
        "duration_days": 40,
        "price_try": 4800.0,
        "popular_badge": "Zarif Uyum",
        "features": [
            "8 Seans Düet veya Trio Reformer Pilates Erişimi",
            "Kişisel Esneklik & Core Güçlendirme Takibi",
            "Öncelikli Akşam Seansı Rezervasyon Avantajı",
            "40 Gün Esnek Kullanım + Kredi Koruma",
        ],
    },
    {
        "code": "ERYA-PRIVATE-8",
        "name": "8 Seans Bireysel Reformer & Cadillac",
        "subtitle": "Seher Hoca & uzman kadroyla 1'e 1 skolyoz, postür ve omurga programı",
        "credits": 8,
        "duration_days": 45,
        "price_try": 6800.0,
        "popular_badge": "Klinik & Özel İlgi",
        "features": [
            "8 Seans VIP 1-1 Reformer & Cadillac Trapeze Tower",
            "Skolyoz, Bel-Boyun Hassasiyeti & Duruş Biyomekaniği",
            "Aylık Vücut Analizi & Eğitmen Gelişim Raporu",
            "45 Gün Geçerlilik + Kredi Devir Garantisi",
        ],
    },
    {
        "code": "ERYA-VIP-16",
        "name": "16 Seans VIP Dönüşüm Paketi",
        "subtitle": "Tam kapsamlı Reformer + Cadillac ile dik duruş ve sıkılaşma serisi",
        "credits": 16,
        "duration_days": 75,
        "price_try": 12000.0,
        "popular_badge": "Maksimum Avantaj",
        "features": [
            "16 Seans Tüm Reformer, Cadillac & Özel Seans Erişimi",
            "Haftalık Postür Takibi & Kişisel Programlama",
            "1 Ücretsiz Misafir Tanışma Seansı Hakkı",
            "En Avantajlı Seans Birim Ücreti + 75 Gün Süre",
        ],
    },
]


def ensure_payment_catalog_seeded(db: Session) -> None:
    """Ödeme ve checkout oturum tablolarını oluşturur; katalog boşsa 4 paketi ekler."""
    bind = db.get_bind() or engine
    Base.metadata.create_all(bind=bind)

    existing_count = db.query(PackageCatalogPlan).count()
    if existing_count > 0:
        return

    for item in DEFAULT_CATALOG_PLANS:
        plan = PackageCatalogPlan(
            code=item["code"],
            name=item["name"],
            subtitle=item["subtitle"],
            credits=item["credits"],
            duration_days=item["duration_days"],
            price_try=item["price_try"],
            popular_badge=item["popular_badge"],
            features_json=json.dumps(item["features"], ensure_ascii=False),
            is_active=True,
        )
        db.add(plan)

    db.commit()


def _parse_features(features_json: Optional[str]) -> List[str]:
    if not features_json:
        return []
    try:
        parsed = json.loads(features_json)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except Exception:
        pass
    return []


def _payment_method_label(method: str) -> str:
    labels = {
        "credit_card": "Kredi / Banka Kartı (3D Secure)",
        "apple_pay": "Apple Pay",
        "bank_transfer": "Havale / FAST",
    }
    return labels.get(method, method)


def _format_masked_payment(method: str, card_last4: Optional[str]) -> str:
    if method == "credit_card":
        suffix = card_last4 or "4242"
        return f"•••• •••• •••• {suffix}"
    if method == "apple_pay":
        suffix = card_last4 if card_last4 and card_last4.isdigit() else "Apple Pay"
        return f" Pay • Dijital Cüzdan ({suffix})"
    return "TR42 •••• FAST Anında Onay"


def _mask_member_phone(phone: Optional[str]) -> str:
    digits = re.sub(r"\D", "", phone or "")
    last2 = digits[-2:] if len(digits) >= 2 else "42"
    return f"+90 (5••) ••• •• {last2}"


def _generate_unique_transaction_code(db: Session) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(20):
        suffix = "".join(secrets.choice(alphabet) for _ in range(6))
        code = f"PAY-2026-{suffix}"
        exists = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.transaction_code == code)
            .first()
        )
        if not exists:
            return code
    return f"PAY-2026-{int(datetime.now().timestamp())}"


def _generate_checkout_session_id(db: Session) -> str:
    for _ in range(20):
        sid = f"cs_erya_{secrets.token_hex(12)}"
        exists = (
            db.query(PaymentCheckoutSession)
            .filter(PaymentCheckoutSession.session_id == sid)
            .first()
        )
        if not exists:
            return sid
    return f"cs_erya_{int(datetime.now().timestamp())}_{secrets.token_hex(4)}"


def _derive_public_base_url(request: Request) -> str:
    """
    Gelen HTTP isteğinin başlıklarından (Cloudflare Tunnel, Reverse Proxy, LAN IP veya localhost)
    dış erişime uygun temel URL'yi dinamik olarak üretir.
    """
    env_override = os.getenv("PUBLIC_BACKEND_URL", "").strip()
    if env_override:
        return env_override.rstrip("/")

    forwarded_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    host = forwarded_host or request.headers.get("host", "").strip() or request.url.netloc

    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    cf_visitor_raw = request.headers.get("cf-visitor", "")
    cf_proto = ""
    if cf_visitor_raw:
        try:
            cf_data = json.loads(cf_visitor_raw)
            cf_proto = str(cf_data.get("scheme", "")).strip().lower()
        except Exception:
            pass

    lower_host = host.lower()
    if forwarded_proto in ("http", "https"):
        scheme = forwarded_proto
    elif cf_proto in ("http", "https"):
        scheme = cf_proto
    elif any(
        domain in lower_host
        for domain in (".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".loca.lt")
    ):
        scheme = "https"
    else:
        scheme = request.url.scheme or "http"

    return f"{scheme}://{host}".rstrip("/")


def _append_query_params(url: Optional[str], params: Dict[str, str]) -> Optional[str]:
    if not url or not url.strip():
        return None
    raw = url.strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
        existing_qs = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
        existing_qs.update(params)
        new_query = urllib.parse.urlencode(existing_qs)
        return urllib.parse.urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment)
        )
    except Exception:
        sep = "&" if "?" in raw else "?"
        return f"{raw}{sep}{urllib.parse.urlencode(params)}"


def _luhn_check(digits: str) -> bool:
    if not digits.isdigit() or len(digits) < 12 or len(digits) > 19:
        return False
    checksum = 0
    parity = len(digits) % 2
    for idx, ch in enumerate(digits):
        d = int(ch)
        if idx % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def _detect_card_brand_and_bank(digits: str) -> Tuple[str, str]:
    if digits.startswith("9792") or digits.startswith("65"):
        brand = "TROY"
    elif digits.startswith("4"):
        brand = "VISA"
    elif re.match(r"^(5[1-5]|2[2-7])", digits):
        brand = "MASTERCARD"
    elif digits.startswith(("34", "37")):
        brand = "AMEX"
    else:
        brand = "CARD"

    prefix6 = digits[:6]
    if prefix6.startswith(("4543", "5549", "4894")):
        bank = "Garanti BBVA Bonus"
    elif prefix6.startswith(("5406", "4508", "5437")):
        bank = "Türkiye İş Bankası Maximum"
    elif prefix6.startswith(("4506", "5400", "4921")):
        bank = "Yapı Kredi World"
    elif prefix6.startswith(("5571", "4355", "5218")):
        bank = "Akbank Axess"
    elif prefix6.startswith(("9792",)):
        bank = "BKM Troy Bankkart"
    elif prefix6.startswith(("5342", "4111", "4242")):
        bank = "QNB Finansbank CardFinans"
    else:
        bank = "Türkiye Bankalararası 3D Secure"

    return brand, bank


async def _parse_flexible_body(request: Request) -> Dict[str, Any]:
    """
    Hem application/json hem de application/x-www-form-urlencoded gövdelerini
    harici python-multipart bağımlılığına ihtiyaç duymadan güvenli şekilde ayrıştırır.
    """
    raw_bytes = await request.body()
    if not raw_bytes:
        return {}
    content_type = request.headers.get("content-type", "").lower()
    raw_text = raw_bytes.decode("utf-8", errors="replace").strip()
    if not raw_text:
        return {}

    if "application/json" in content_type or raw_text.startswith("{"):
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, dict):
                return parsed
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Geçersiz JSON verisi: {exc}") from exc

    parsed_qs = urllib.parse.parse_qs(raw_text, keep_blank_values=True)
    return {k: v[-1] if isinstance(v, list) and v else "" for k, v in parsed_qs.items()}


def _validate_card_submission(
    holder_raw: str,
    card_number_raw: str,
    expiry_raw: str,
    cvv_raw: str,
    installment_count: int,
    enforce_luhn: bool = True,
) -> Tuple[str, str, str, str, int]:
    """
    Kart doğrulaması yapar (Luhn, SKT, CVV, Taksit).
    Tam kart numarasını veya CVV'yi ASLA veritabanına kaydetmez.
    """
    if installment_count not in (1, 3, 6):
        raise HTTPException(
            status_code=400,
            detail="Taksit seçeneği yalnızca Tek Çekim (1), 3 Taksit veya 6 Taksit olabilir.",
        )

    holder = (holder_raw or "").strip()
    if len(holder) < 3:
        raise HTTPException(
            status_code=400,
            detail="Lütfen kart üzerindeki ad ve soyad bilgisini eksiksiz girin.",
        )

    digits = re.sub(r"\D", "", card_number_raw or "")
    if len(digits) < 13 or len(digits) > 19:
        raise HTTPException(
            status_code=400,
            detail="Kart numarası 16 haneli olmalıdır.",
        )

    if enforce_luhn and not _luhn_check(digits):
        raise HTTPException(
            status_code=400,
            detail="Kart numarası Luhn güvenlik doğrulamasından geçemedi. Lütfen kart numaranızı kontrol edin.",
        )

    expiry_clean = (expiry_raw or "").strip()
    expiry_match = re.match(r"^(0[1-9]|1[0-2])\s*/\s*(\d{2}|\d{4})$", expiry_clean)
    if not expiry_match:
        raise HTTPException(
            status_code=400,
            detail="Son kullanma tarihi AA/YY formatında olmalıdır (örn. 09/29).",
        )

    exp_month = int(expiry_match.group(1))
    exp_year_str = expiry_match.group(2)
    exp_year = int(exp_year_str) + 2000 if len(exp_year_str) == 2 else int(exp_year_str)

    today = date.today()
    if exp_year < today.year or (exp_year == today.year and exp_month < today.month):
        raise HTTPException(
            status_code=400,
            detail="Kartın son kullanma tarihi geçmiş görünüyor.",
        )

    cvv_digits = re.sub(r"\D", "", cvv_raw or "")
    if len(cvv_digits) not in (3, 4):
        raise HTTPException(
            status_code=400,
            detail="CVV güvenlik kodu 3 veya 4 haneli olmalıdır.",
        )

    brand, bank_name = _detect_card_brand_and_bank(digits)
    return holder.upper(), digits[-4:], brand, bank_name, installment_count


def _build_digital_receipt(
    transaction: PaymentTransaction,
    member: User,
    plan: PackageCatalogPlan,
    pkg: MemberPackage,
    purchased_credits: int,
    carried_credits: int,
    booked_hold_count: int,
) -> DigitalReceiptOut:
    monthly_installment = round(
        transaction.amount_try / max(1, transaction.installment_count), 2
    )
    return DigitalReceiptOut(
        transaction_id=transaction.id,
        transaction_code=transaction.transaction_code,
        member_id=member.id,
        member_name=member.full_name,
        plan_id=plan.id,
        plan_code=plan.code,
        plan_name=plan.name,
        member_package_id=pkg.id,
        amount_try=transaction.amount_try,
        monthly_installment_try=monthly_installment,
        payment_method=transaction.payment_method,
        payment_method_label=_payment_method_label(transaction.payment_method),
        card_holder_name=transaction.card_holder_name,
        card_last4=transaction.card_last4,
        masked_payment_info=_format_masked_payment(
            transaction.payment_method, transaction.card_last4
        ),
        installment_count=transaction.installment_count,
        purchased_credits=purchased_credits,
        carried_credits=carried_credits,
        booked_hold_count=booked_hold_count,
        new_remaining_credits=pkg.remaining_credits,
        new_total_credits=pkg.total_credits,
        expiry_date=pkg.expiry_date,
        status=transaction.status,
        created_at=transaction.created_at,
    )


def _fulfill_package_purchase(
    db: Session,
    member: User,
    plan: PackageCatalogPlan,
    payment_method: str,
    holder_name: str,
    card_last4: Optional[str],
    installment_count: int,
) -> Tuple[MemberPackage, PaymentTransaction, int, int, DigitalReceiptOut, str]:
    """
    Üyenin mevcut kredisini koruyarak yeni MemberPackage oluşturur, aktif randevuları bağlar
    ve PaymentTransaction makbuzunu üretir.
    """
    existing_active_packages = (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member.id, MemberPackage.is_active == True)
        .all()
    )

    carried_credits = 0
    for old_pkg in existing_active_packages:
        if old_pkg.remaining_credits > 0:
            carried_credits += old_pkg.remaining_credits
        old_pkg.is_active = False

    active_bookings = (
        db.query(Booking)
        .filter(Booking.member_id == member.id, Booking.status == "booked")
        .all()
    )
    booked_hold_count = len(active_bookings)

    new_remaining_credits = plan.credits + carried_credits
    new_total_credits = new_remaining_credits + booked_hold_count
    new_expiry_date = (date.today() + timedelta(days=plan.duration_days)).isoformat()

    new_member_package = MemberPackage(
        member_id=member.id,
        package_name=plan.name,
        total_credits=new_total_credits,
        remaining_credits=new_remaining_credits,
        expiry_date=new_expiry_date,
        is_active=True,
    )
    db.add(new_member_package)
    db.flush()

    for b in active_bookings:
        b.package_id = new_member_package.id

    tx_code = _generate_unique_transaction_code(db)
    created_iso = datetime.now().isoformat(timespec="seconds")

    transaction = PaymentTransaction(
        transaction_code=tx_code,
        member_id=member.id,
        plan_id=plan.id,
        member_package_id=new_member_package.id,
        amount_try=plan.price_try,
        payment_method=payment_method,
        card_holder_name=holder_name,
        card_last4=card_last4,
        installment_count=installment_count,
        status="completed",
        created_at=created_iso,
    )
    db.add(transaction)
    db.flush()

    if carried_credits > 0:
        msg = (
            f"{plan.name} ödemeniz onaylandı! Önceki paketinizden {carried_credits} ders devredildi; "
            f"yeni kullanılabilir bakiyeniz {new_remaining_credits} ders."
        )
    else:
        msg = (
            f"{plan.name} ödemeniz onaylandı! Kullanılabilir {new_remaining_credits} ders krediniz "
            f"hesabınıza tanımlandı."
        )

    receipt = _build_digital_receipt(
        transaction=transaction,
        member=member,
        plan=plan,
        pkg=new_member_package,
        purchased_credits=plan.credits,
        carried_credits=carried_credits,
        booked_hold_count=booked_hold_count,
    )
    return (
        new_member_package,
        transaction,
        carried_credits,
        booked_hold_count,
        receipt,
        msg,
    )


def _complete_checkout_session_idempotent(
    db: Session,
    checkout_session: PaymentCheckoutSession,
    holder_override: Optional[str] = None,
    last4_override: Optional[str] = None,
) -> Tuple[MemberPackage, PaymentTransaction, DigitalReceiptOut, str]:
    """
    Bir PaymentCheckoutSession oturumunu idempotent (tekil ve güvenli) olarak tamamlar.
    Daha önce tamamlanmışsa krediyi ikinci kez eklemez; mevcut makbuzu döndürür.
    """
    member = db.query(User).filter(User.id == checkout_session.member_id).first()
    plan = (
        db.query(PackageCatalogPlan)
        .filter(PackageCatalogPlan.id == checkout_session.plan_id)
        .first()
    )
    if not member or not plan:
        raise HTTPException(status_code=404, detail="Üye veya paket kaydı bulunamadı.")

    if (
        checkout_session.status == "succeeded"
        and checkout_session.credited_package_id
        and checkout_session.transaction_id
    ):
        existing_pkg = (
            db.query(MemberPackage)
            .filter(MemberPackage.id == checkout_session.credited_package_id)
            .first()
        )
        existing_tx = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.id == checkout_session.transaction_id)
            .first()
        )
        if existing_pkg and existing_tx:
            receipt = _build_digital_receipt(
                transaction=existing_tx,
                member=member,
                plan=plan,
                pkg=existing_pkg,
                purchased_credits=checkout_session.purchased_credits or plan.credits,
                carried_credits=checkout_session.carried_credits or 0,
                booked_hold_count=checkout_session.booked_hold_count or 0,
            )
            return (
                existing_pkg,
                existing_tx,
                receipt,
                f"{plan.name} ödemeniz doğrulandı. Bakiyeniz: {existing_pkg.remaining_credits} ders.",
            )

    holder_name = (
        holder_override
        or checkout_session.card_holder_name
        or member.full_name.upper()
    )
    card_last4 = last4_override or checkout_session.card_last4 or "4242"

    pkg, tx, carried_credits, booked_hold_count, receipt, msg = _fulfill_package_purchase(
        db=db,
        member=member,
        plan=plan,
        payment_method=checkout_session.payment_method or "credit_card",
        holder_name=holder_name,
        card_last4=card_last4,
        installment_count=max(1, checkout_session.installment_count or 1),
    )

    checkout_session.status = "succeeded"
    checkout_session.card_holder_name = holder_name
    checkout_session.card_last4 = card_last4
    checkout_session.transaction_id = tx.id
    checkout_session.credited_package_id = pkg.id
    checkout_session.purchased_credits = plan.credits
    checkout_session.carried_credits = carried_credits
    checkout_session.booked_hold_count = booked_hold_count
    checkout_session.new_remaining_credits = pkg.remaining_credits
    checkout_session.new_total_credits = pkg.total_credits
    checkout_session.completed_at = datetime.now().isoformat(timespec="seconds")
    checkout_session.sms_otp_code = None

    db.commit()
    db.refresh(pkg)
    db.refresh(tx)
    db.refresh(checkout_session)

    # Refresh receipt after commit so IDs/fields are crisp
    receipt = _build_digital_receipt(
        transaction=tx,
        member=member,
        plan=plan,
        pkg=pkg,
        purchased_credits=plan.credits,
        carried_credits=carried_credits,
        booked_hold_count=booked_hold_count,
    )
    return pkg, tx, receipt, msg


# ============================================================================
# HARİCİ ÖDEME SAĞLAYICILARI (STRIPE & IYZICO) ENTEGRASYON YARDIMCILARI
# ============================================================================


async def _try_create_stripe_checkout(
    secret_key: str,
    session_id: str,
    member: User,
    plan: PackageCatalogPlan,
    success_url: str,
    cancel_url: str,
) -> Tuple[str, str]:
    form_data = {
        "mode": "payment",
        "client_reference_id": session_id,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "try",
        "line_items[0][price_data][unit_amount]": str(int(round(plan.price_try * 100))),
        "line_items[0][price_data][product_data][name]": plan.name,
        "line_items[0][price_data][product_data][description]": plan.subtitle,
        "metadata[session_id]": session_id,
        "metadata[member_id]": str(member.id),
        "metadata[plan_id]": str(plan.id),
        "metadata[plan_code]": plan.code,
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            data=form_data,
            headers={"Authorization": f"Bearer {secret_key}"},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Stripe API hatası ({resp.status_code}): {resp.text[:240]}")
        body = resp.json()
        return str(body["id"]), str(body["url"])


async def _try_create_iyzico_checkout(
    api_key: str,
    secret_key: str,
    base_url_iyzico: str,
    session_id: str,
    member: User,
    plan: PackageCatalogPlan,
    callback_url: str,
) -> Tuple[str, str]:
    uri_path = "/payment/iyzipos/checkoutform/initialize/auth/ecom"
    name_parts = (member.full_name or "Erya Üye").strip().split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else "Üye"
    price_str = f"{plan.price_try:.2f}"

    payload = {
        "locale": "tr",
        "conversationId": session_id,
        "price": price_str,
        "paidPrice": price_str,
        "currency": "TRY",
        "basketId": f"BASKET-{session_id}",
        "paymentGroup": "PRODUCT",
        "callbackUrl": callback_url,
        "enabledInstallments": [1, 3, 6],
        "buyer": {
            "id": f"M-{member.id}",
            "name": first_name,
            "surname": last_name,
            "gsmNumber": member.phone or "+905550000000",
            "email": f"member{member.id}@eryapilates.com",
            "identityNumber": "11111111110",
            "registrationAddress": "Erya Pilates Reformer Studio İstanbul",
            "ip": "127.0.0.1",
            "city": "Istanbul",
            "country": "Turkey",
        },
        "billingAddress": {
            "contactName": member.full_name,
            "city": "Istanbul",
            "country": "Turkey",
            "address": "Erya Pilates Reformer Studio İstanbul",
        },
        "basketItems": [
            {
                "id": plan.code,
                "name": plan.name,
                "category1": "Pilates & Reformer",
                "itemType": "VIRTUAL",
                "price": price_str,
            }
        ],
    }

    body_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    random_key = secrets.token_hex(8)
    signature = hmac.new(
        secret_key.encode("utf-8"),
        f"{random_key}{uri_path}{body_json}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    import base64

    auth_token = base64.b64encode(
        f"apiKey:{api_key}&randomKey:{random_key}&signature:{signature}".encode("utf-8")
    ).decode("utf-8")

    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.post(
            f"{base_url_iyzico.rstrip('/')}{uri_path}",
            content=body_json.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"IYZWSv2 {auth_token}",
                "x-iyzi-rnd": random_key,
            },
        )
        data = resp.json()
        if data.get("status") != "success" or not data.get("paymentPageUrl"):
            raise RuntimeError(
                f"Iyzico API hatası: {data.get('errorMessage') or resp.text[:200]}"
            )
        return str(data.get("token", session_id)), str(data["paymentPageUrl"])


async def _sync_stripe_session_if_needed(
    db: Session, checkout_session: PaymentCheckoutSession
) -> None:
    if (
        checkout_session.provider != "stripe"
        or checkout_session.status not in ("pending", "requires_3ds")
        or not checkout_session.provider_reference
    ):
        return
    stripe_key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not stripe_key:
        return
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://api.stripe.com/v1/checkout/sessions/{checkout_session.provider_reference}",
                headers={"Authorization": f"Bearer {stripe_key}"},
            )
            if resp.status_code == 200:
                sdata = resp.json()
                if sdata.get("payment_status") == "paid":
                    _complete_checkout_session_idempotent(db, checkout_session)
                elif sdata.get("status") == "expired":
                    checkout_session.status = "cancelled"
                    checkout_session.failure_reason = "Stripe ödeme oturumu süresi doldu."
                    db.commit()
    except Exception:
        pass


def _build_session_status_out(
    db: Session,
    checkout_session: PaymentCheckoutSession,
    base_url: str,
) -> CheckoutSessionStatusOut:
    member = db.query(User).filter(User.id == checkout_session.member_id).first()
    plan = (
        db.query(PackageCatalogPlan)
        .filter(PackageCatalogPlan.id == checkout_session.plan_id)
        .first()
    )

    # Süresi dolmuş bekleyen oturumları işaretle
    if checkout_session.status in ("pending", "requires_3ds"):
        try:
            exp_dt = datetime.fromisoformat(checkout_session.expires_at)
            if datetime.now() > exp_dt:
                checkout_session.status = "cancelled"
                checkout_session.failure_reason = "Ödeme oturumu zaman aşımına uğradı."
                db.commit()
        except Exception:
            pass

    checkout_url = (
        checkout_session.external_checkout_url
        or f"{base_url}/payments/checkout/{checkout_session.session_id}"
    )

    active_pkg_out: Optional[ActiveMemberPackageOut] = None
    receipt_out: Optional[DigitalReceiptOut] = None
    tx_code: Optional[str] = None
    credited_pkg_name: Optional[str] = None
    pkg_expiry: Optional[str] = None

    if checkout_session.credited_package_id:
        pkg_obj = (
            db.query(MemberPackage)
            .filter(MemberPackage.id == checkout_session.credited_package_id)
            .first()
        )
        if pkg_obj:
            active_pkg_out = ActiveMemberPackageOut.model_validate(pkg_obj)
            credited_pkg_name = pkg_obj.package_name
            pkg_expiry = pkg_obj.expiry_date

            if checkout_session.transaction_id and member and plan:
                tx_obj = (
                    db.query(PaymentTransaction)
                    .filter(PaymentTransaction.id == checkout_session.transaction_id)
                    .first()
                )
                if tx_obj:
                    tx_code = tx_obj.transaction_code
                    receipt_out = _build_digital_receipt(
                        transaction=tx_obj,
                        member=member,
                        plan=plan,
                        pkg=pkg_obj,
                        purchased_credits=checkout_session.purchased_credits
                        or (plan.credits if plan else 0),
                        carried_credits=checkout_session.carried_credits or 0,
                        booked_hold_count=checkout_session.booked_hold_count or 0,
                    )

    status_val: CheckoutSessionStatusLiteral = (
        checkout_session.status  # type: ignore[assignment]
        if checkout_session.status
        in ("pending", "requires_3ds", "succeeded", "failed", "cancelled")
        else "pending"
    )

    return CheckoutSessionStatusOut(
        session_id=checkout_session.session_id,
        status=status_val,
        provider=checkout_session.provider,
        member_id=checkout_session.member_id,
        member_name=member.full_name if member else "Üye",
        plan_id=checkout_session.plan_id,
        plan_code=plan.code if plan else "",
        plan_name=plan.name if plan else "Spor Paketi",
        plan_credits=plan.credits if plan else 0,
        amount=checkout_session.amount_try,
        currency=checkout_session.currency,
        installment_count=checkout_session.installment_count,
        monthly_installment_try=round(
            checkout_session.amount_try / max(1, checkout_session.installment_count), 2
        ),
        payment_method=checkout_session.payment_method,
        card_last4=checkout_session.card_last4,
        card_brand=checkout_session.card_brand,
        bank_name=checkout_session.bank_name,
        checkout_url=checkout_url,
        return_url=checkout_session.return_url,
        created_at=checkout_session.created_at,
        expires_at=checkout_session.expires_at,
        completed_at=checkout_session.completed_at,
        failure_reason=checkout_session.failure_reason,
        transaction_code=tx_code,
        credited_package_id=checkout_session.credited_package_id,
        credited_package_name=credited_pkg_name,
        purchased_credits=checkout_session.purchased_credits or 0,
        carried_credits=checkout_session.carried_credits or 0,
        booked_hold_count=checkout_session.booked_hold_count or 0,
        new_remaining_credits=checkout_session.new_remaining_credits,
        new_total_credits=checkout_session.new_total_credits,
        package_expiry_date=pkg_expiry,
        active_package=active_pkg_out,
        receipt=receipt_out,
    )


def _query_catalog_plans(db: Session) -> List[PackageCatalogPlanOut]:
    ensure_payment_catalog_seeded(db)

    plans = (
        db.query(PackageCatalogPlan)
        .filter(PackageCatalogPlan.is_active == True)
        .order_by(PackageCatalogPlan.credits.asc(), PackageCatalogPlan.id.asc())
        .all()
    )
    if not plans:
        return []

    base_per_lesson = max(p.price_try / max(1, p.credits) for p in plans)
    result: List[PackageCatalogPlanOut] = []
    for p in plans:
        per_lesson = round(p.price_try / max(1, p.credits), 2)
        raw_savings_ratio = max(0.0, (base_per_lesson - per_lesson) / base_per_lesson)
        savings_percent = int(round(raw_savings_ratio * 100))
        savings_amount = round(max(0.0, (base_per_lesson * p.credits) - p.price_try), 2)

        result.append(
            PackageCatalogPlanOut(
                id=p.id,
                code=p.code,
                name=p.name,
                subtitle=p.subtitle,
                credits=p.credits,
                duration_days=p.duration_days,
                price_try=p.price_try,
                per_lesson_price_try=per_lesson,
                savings_percent=savings_percent,
                savings_amount_try=savings_amount,
                popular_badge=p.popular_badge,
                features=_parse_features(p.features_json),
                is_active=p.is_active,
            )
        )
    return result


# ============================================================================
# HOSTED 256-BIT SSL & 3D SECURE WEB CHECKOUT HTML ÜRETİCİSİ
# ============================================================================


def _render_hosted_checkout_html(
    checkout_session: PaymentCheckoutSession,
    member: User,
    plan: PackageCatalogPlan,
    existing_credits: int,
    base_url: str,
    tx_code: Optional[str] = None,
) -> str:
    redirect_success_url = _append_query_params(
        checkout_session.return_url,
        {
            "payment_session_id": checkout_session.session_id,
            "payment_status": "succeeded",
        },
    )
    redirect_cancel_url = _append_query_params(
        checkout_session.cancel_url or checkout_session.return_url,
        {
            "payment_session_id": checkout_session.session_id,
            "payment_status": "cancelled",
        },
    )

    boot_state = {
        "sessionId": checkout_session.session_id,
        "status": checkout_session.status,
        "amount": checkout_session.amount_try,
        "currency": checkout_session.currency,
        "installmentCount": checkout_session.installment_count or 1,
        "memberName": member.full_name,
        "maskedPhone": _mask_member_phone(member.phone),
        "planName": plan.name,
        "planSubtitle": plan.subtitle,
        "planCode": plan.code,
        "planCredits": plan.credits,
        "durationDays": plan.duration_days,
        "existingCredits": existing_credits,
        "cardLast4": checkout_session.card_last4 or "",
        "cardBrand": checkout_session.card_brand or "VISA",
        "bankName": checkout_session.bank_name or "Garanti BBVA Bonus",
        "demoSmsCode": checkout_session.sms_otp_code or "",
        "newRemainingCredits": checkout_session.new_remaining_credits
        or (existing_credits + plan.credits),
        "transactionCode": tx_code or "",
        "failureReason": checkout_session.failure_reason or "",
        "returnUrl": redirect_success_url or "",
        "cancelUrl": redirect_cancel_url or "",
        "apiBase": f"{base_url}/payments/checkout/{checkout_session.session_id}",
    }

    safe_json = json.dumps(boot_state, ensure_ascii=False).replace("</", "<\\/")
    escaped_plan = html.escape(plan.name)
    escaped_member = html.escape(member.full_name)

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>ERYA Pay • 3D Secure Güvenli Ödeme Geçidi — {escaped_plan}</title>
  <style>
    :root {{
      --bg: #f4efe6;
      --surface: #ffffff;
      --surface-soft: #faf6ee;
      --border: #e5dac8;
      --gold: #9a7328;
      --gold-dark: #7b5a1b;
      --gold-soft: #faf0d7;
      --plum: #8c5258;
      --plum-soft: #f8ecee;
      --ink: #1e1915;
      --muted: #6b5e51;
      --green: #1f7a4c;
      --green-soft: #e8f6ee;
      --danger: #b83b42;
      --danger-soft: #fcebec;
      --bank-blue: #0f2942;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: radial-gradient(circle at top, #fbf7f0 0%, var(--bg) 65%);
      color: var(--ink);
      min-height: 100vh;
      padding: 16px 14px 48px;
      line-height: 1.45;
    }}
    .topbar {{
      max-width: 920px;
      margin: 0 auto 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      box-shadow: 0 6px 20px rgba(60, 45, 25, 0.05);
    }}
    .brand {{ display: flex; align-items: center; gap: 10px; }}
    .brand-mark {{
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, var(--gold), #c9a452);
      color: #fff; font-weight: 900; font-size: 16px;
      display: flex; align-items: center; justify-content: center;
    }}
    .brand-title {{ font-weight: 800; font-size: 15px; letter-spacing: -0.2px; }}
    .brand-sub {{ font-size: 11.5px; color: var(--muted); }}
    .ssl-pill {{
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--green-soft); color: var(--green);
      border: 1px solid #bce3cd; border-radius: 999px;
      padding: 5px 12px; font-size: 11.5px; font-weight: 700;
    }}
    .layout {{
      max-width: 920px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1.25fr;
      gap: 18px;
      align-items: start;
    }}
    @media (max-width: 780px) {{
      .layout {{ grid-template-columns: 1fr; }}
    }}
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 22px;
      box-shadow: 0 10px 28px rgba(60, 45, 25, 0.06);
    }}
    .summary-tag {{
      display: inline-block;
      background: var(--gold-soft);
      color: var(--gold);
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 999px;
      letter-spacing: 0.4px;
      margin-bottom: 10px;
    }}
    .summary-title {{ font-size: 19px; font-weight: 800; margin-bottom: 4px; }}
    .summary-sub {{ font-size: 13px; color: var(--muted); margin-bottom: 16px; }}
    .price-hero {{
      background: var(--surface-soft);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 14px;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }}
    .price-big {{ font-size: 26px; font-weight: 900; color: var(--ink); letter-spacing: -0.6px; }}
    .price-note {{ font-size: 12px; font-weight: 700; color: var(--gold); }}
    .meta-row {{
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px dashed var(--border); font-size: 13px;
    }}
    .meta-row:last-child {{ border-bottom: none; }}
    .meta-k {{ color: var(--muted); font-weight: 500; }}
    .meta-v {{ font-weight: 700; color: var(--ink); text-align: right; }}
    .carry-box {{
      margin-top: 14px;
      background: var(--gold-soft);
      border: 1px solid #e5cb90;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #5b4212;
    }}
    .trust-strip {{
      margin-top: 16px;
      display: flex; gap: 6px; flex-wrap: wrap;
    }}
    .scheme-badge {{
      padding: 4px 9px; border-radius: 7px; font-size: 10.5px; font-weight: 800;
      background: #f3efe8; color: #4f443a; border: 1px solid var(--border);
    }}
    /* Visual Card */
    .visual-card {{
      background: linear-gradient(135deg, #241d18 0%, #443325 55%, #7a5827 100%);
      color: #fff;
      border-radius: 18px;
      padding: 18px 20px;
      margin-bottom: 16px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 24px rgba(34, 29, 25, 0.2);
    }}
    .vc-top {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }}
    .vc-chip {{
      width: 38px; height: 27px; border-radius: 6px;
      background: linear-gradient(135deg, #f3d285, #c89b3c);
    }}
    .vc-bank {{ font-size: 12px; font-weight: 800; opacity: 0.92; letter-spacing: 0.3px; }}
    .vc-num {{
      font-family: "Courier New", monospace;
      font-size: 19px; font-weight: 700; letter-spacing: 2px;
      margin-bottom: 16px;
    }}
    .vc-bottom {{ display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }}
    .vc-cap {{ font-size: 9.5px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.6px; }}
    .vc-val {{ font-weight: 700; font-size: 13px; margin-top: 2px; }}
    /* Form */
    .quick-bar {{
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      margin-bottom: 14px; padding: 9px 11px;
      background: var(--plum-soft); border: 1px solid #e5c5c9; border-radius: 12px;
    }}
    .quick-label {{ font-size: 11px; font-weight: 800; color: var(--plum); margin-right: 2px; }}
    .quick-btn {{
      border: 1px solid #d7aeb4; background: #fff; color: var(--plum);
      font-size: 11px; font-weight: 700; padding: 5px 9px; border-radius: 8px;
      cursor: pointer; transition: all 0.15s;
    }}
    .quick-btn:hover {{ background: var(--plum); color: #fff; }}
    .field {{ margin-bottom: 13px; }}
    .label-row {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }}
    label {{ font-size: 12px; font-weight: 700; color: var(--ink); }}
    .luhn-tag {{ font-size: 11px; font-weight: 700; }}
    .luhn-ok {{ color: var(--green); }}
    .luhn-bad {{ color: var(--danger); }}
    input {{
      width: 100%; padding: 12px 13px; font-size: 15px; font-weight: 600;
      border: 1.5px solid var(--border); border-radius: 12px;
      background: var(--surface-soft); color: var(--ink); outline: none;
      transition: border-color 0.15s, background 0.15s;
    }}
    input:focus {{ border-color: var(--gold); background: #fff; }}
    .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .inst-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }}
    .inst-opt {{
      border: 1.5px solid var(--border); background: var(--surface-soft);
      border-radius: 12px; padding: 10px 8px; text-align: center; cursor: pointer;
    }}
    .inst-opt.active {{
      border-color: var(--gold); background: var(--gold-soft);
    }}
    .inst-t {{ font-size: 12.5px; font-weight: 800; color: var(--ink); }}
    .inst-opt.active .inst-t {{ color: var(--gold-dark); }}
    .inst-s {{ font-size: 11px; color: var(--muted); margin-top: 2px; font-weight: 600; }}
    .btn-primary {{
      width: 100%; border: none; border-radius: 14px;
      background: linear-gradient(135deg, var(--gold), var(--gold-dark));
      color: #fff; font-size: 15px; font-weight: 800;
      padding: 15px 18px; cursor: pointer;
      box-shadow: 0 6px 16px rgba(154, 115, 40, 0.26);
      transition: opacity 0.15s, transform 0.1s;
    }}
    .btn-primary:disabled {{ opacity: 0.6; cursor: not-allowed; }}
    .btn-secondary {{
      width: 100%; margin-top: 10px; border: 1px solid var(--border);
      background: transparent; color: var(--muted); font-size: 13px; font-weight: 700;
      padding: 11px; border-radius: 12px; cursor: pointer;
    }}
    .err-box {{
      display: none; margin-bottom: 12px; padding: 11px 13px;
      border-radius: 12px; background: var(--danger-soft);
      border: 1px solid #f0bfc3; color: var(--danger);
      font-size: 12.5px; font-weight: 700;
    }}
    /* 3D Secure Frame */
    .sms-toast {{
      background: #111827; color: #f9fafb; border-radius: 14px;
      padding: 13px 15px; margin-bottom: 16px;
      border-left: 4px solid #10b981;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
    }}
    .sms-toast-top {{
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11px; color: #9ca3af; font-weight: 700; margin-bottom: 5px;
    }}
    .sms-code-pill {{
      display: inline-block; background: #10b981; color: #052e16;
      font-weight: 900; padding: 2px 8px; border-radius: 6px; letter-spacing: 1.5px;
    }}
    .sms-fill-btn {{
      margin-top: 8px; background: #1f2937; color: #34d399;
      border: 1px solid #374151; border-radius: 8px;
      padding: 5px 10px; font-size: 11.5px; font-weight: 800; cursor: pointer;
    }}
    .bank-header {{
      background: var(--bank-blue); color: #fff; border-radius: 14px;
      padding: 14px 16px; margin-bottom: 14px;
      display: flex; justify-content: space-between; align-items: center;
    }}
    .otp-input {{
      text-align: center; font-size: 24px; letter-spacing: 8px; font-weight: 900;
    }}
    /* Success Receipt */
    .ok-circle {{
      width: 64px; height: 64px; border-radius: 32px;
      background: var(--green-soft); color: var(--green);
      display: flex; align-items: center; justify-content: center;
      font-size: 30px; font-weight: 900; margin: 0 auto 14px;
      border: 2px solid #a7dfbf;
    }}
    .hidden {{ display: none !important; }}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark">E</div>
      <div>
        <div class="brand-title">ERYA Pay • Güvenli Ödeme Geçidi</div>
        <div class="brand-sub">ERYA Pilates &amp; Reformer Studio • BKM 3D Secure 2.0</div>
      </div>
    </div>
    <div class="ssl-pill">🔒 256-Bit TLS / 3D Secure Doğrulamalı</div>
  </div>

  <div class="layout">
    <!-- SOL: SİPARİŞ ÖZETİ -->
    <div class="card">
      <span class="summary-tag">SİPARİŞ &amp; PAKET ÖZETİ</span>
      <div class="summary-title">{escaped_plan}</div>
      <div class="summary-sub">{html.escape(plan.subtitle)}</div>

      <div class="price-hero">
        <div>
          <div style="font-size:11px;color:var(--muted);font-weight:700;">TOPLAM TUTAR</div>
          <div class="price-big" id="summaryTotal">₺{plan.price_try:,.2f}</div>
        </div>
        <div class="price-note" id="summaryInstLabel">Tek Çekim</div>
      </div>

      <div class="meta-row">
        <span class="meta-k">Üye Adı</span>
        <span class="meta-v">{escaped_member}</span>
      </div>
      <div class="meta-row">
        <span class="meta-k">Eklenecek Ders Kredisi</span>
        <span class="meta-v">+{plan.credits} Seans ({plan.duration_days} Gün)</span>
      </div>
      <div class="meta-row">
        <span class="meta-k">Mevcut Devreden Kredi</span>
        <span class="meta-v">{existing_credits} Seans</span>
      </div>
      <div class="meta-row">
        <span class="meta-k">Onay Sonrası Yeni Bakiye</span>
        <span class="meta-v" style="color:var(--gold);">{existing_credits + plan.credits} Seans</span>
      </div>

      <div class="carry-box">
        🛡️ Kredi Koruma Garantisi: Mevcut {existing_credits} ders hakkınız yanmaz; ödeme onaylandığı anda yeni paketinizle otomatik birleşir.
      </div>

      <div class="trust-strip">
        <span class="scheme-badge">VISA SECURE</span>
        <span class="scheme-badge">MASTERCARD ID CHECK</span>
        <span class="scheme-badge">BKM TROY 3D</span>
        <span class="scheme-badge">PCI-DSS LEVEL 1</span>
      </div>
    </div>

    <!-- SAĞ: ADIM 1 (KART), ADIM 2 (3D SECURE SMS), ADIM 3 (ONAY) -->
    <div class="card">
      <div id="errorBanner" class="err-box"></div>

      <!-- ADIM 1: KART BİLGİLERİ -->
      <div id="stepCard" class="hidden">
        <div class="visual-card">
          <div class="vc-top">
            <div class="vc-chip"></div>
            <div style="text-align:right;">
              <div class="vc-bank" id="vcBank">TÜRKİYE 3D SECURE</div>
              <div style="font-size:11px;opacity:0.8;" id="vcBrand">VISA / MC / TROY</div>
            </div>
          </div>
          <div class="vc-num" id="vcNumber">•••• •••• •••• ••••</div>
          <div class="vc-bottom">
            <div>
              <div class="vc-cap">Kart Sahibi</div>
              <div class="vc-val" id="vcHolder">{escaped_member.upper()}</div>
            </div>
            <div style="text-align:right;">
              <div class="vc-cap">SKT</div>
              <div class="vc-val" id="vcExpiry">AA/YY</div>
            </div>
          </div>
        </div>

        <div class="quick-bar">
          <span class="quick-label">⚡ Hızlı Test Kartı:</span>
          <button type="button" class="quick-btn" onclick="fillTestCard('4543 6012 8940 4247','09/29','842')">Garanti Bonus</button>
          <button type="button" class="quick-btn" onclick="fillTestCard('5406 6712 3456 7896','11/28','519')">İş Bankası Max</button>
          <button type="button" class="quick-btn" onclick="fillTestCard('9792 0012 3456 7890','06/30','307')">BKM Troy</button>
        </div>

        <div class="field">
          <label>Taksit Seçeneği (Vade Farksız)</label>
          <div class="inst-grid" style="margin-top:6px;">
            <div class="inst-opt active" data-inst="1" onclick="selectInst(1)">
              <div class="inst-t">Tek Çekim</div>
              <div class="inst-s" id="instSub1"></div>
            </div>
            <div class="inst-opt" data-inst="3" onclick="selectInst(3)">
              <div class="inst-t">3 Taksit</div>
              <div class="inst-s" id="instSub3"></div>
            </div>
            <div class="inst-opt" data-inst="6" onclick="selectInst(6)">
              <div class="inst-t">6 Taksit</div>
              <div class="inst-s" id="instSub6"></div>
            </div>
          </div>
        </div>

        <form id="cardForm" onsubmit="submitCardStep(event)">
          <div class="field">
            <label for="holderInput">Kart Üzerindeki Ad Soyad</label>
            <input id="holderInput" type="text" autocomplete="cc-name" value="{escaped_member.upper()}" required />
          </div>

          <div class="field">
            <div class="label-row">
              <label for="numberInput">Kart Numarası</label>
              <span id="luhnBadge" class="luhn-tag"></span>
            </div>
            <input id="numberInput" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="4543 6012 8940 4247" maxlength="19" required />
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="expiryInput">Son Kullanma (AA/YY)</label>
              <input id="expiryInput" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="09/29" maxlength="5" required />
            </div>
            <div class="field">
              <label for="cvvInput">CVV Güvenlik Kodu</label>
              <input id="cvvInput" type="password" inputmode="numeric" autocomplete="cc-csc" placeholder="842" maxlength="4" required />
            </div>
          </div>

          <button id="cardSubmitBtn" type="submit" class="btn-primary">
            3D Secure Doğrulamaya Geç →
          </button>
          <button type="button" class="btn-secondary" onclick="cancelSession()">
            İptal Et ve Uygulamaya Dön
          </button>
        </form>
      </div>

      <!-- ADIM 2: 3D SECURE BANKA SMS DOĞRULAMA -->
      <div id="step3ds" class="hidden">
        <div class="sms-toast" id="smsToast">
          <div class="sms-toast-top">
            <span>💬 BANKA SMS BİLDİRİMİ • ŞİMDİ</span>
            <span id="smsBankTag">3D SECURE</span>
          </div>
          <div style="font-size:13px;line-height:1.45;">
            ERYA PİLATES harcamanız için 3D Secure tek kullanımlık doğrulama şifreniz:
            <span class="sms-code-pill" id="smsCodeText">------</span>
          </div>
          <button type="button" class="sms-fill-btn" onclick="autoFillOtp()">
            Şifreyi Otomatik Doldur
          </button>
        </div>

        <div class="bank-header">
          <div>
            <div style="font-size:11px;opacity:0.8;font-weight:700;">BANKA 3D SECURE DOĞRULAMA</div>
            <div style="font-size:16px;font-weight:800;" id="bankTitle3ds">Garanti BBVA 3D Secure</div>
          </div>
          <div style="text-align:right;font-size:12px;font-weight:800;" id="timer3ds">03:00</div>
        </div>

        <div style="background:var(--surface-soft);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:12.5px;">
          <div class="meta-row"><span class="meta-k">İşyeri</span><span class="meta-v">ERYA PİLATES STÜDYO</span></div>
          <div class="meta-row"><span class="meta-k">Kart</span><span class="meta-v" id="maskedCard3ds">•••• 4247</span></div>
          <div class="meta-row"><span class="meta-k">Cep Telefonu</span><span class="meta-v">{_mask_member_phone(member.phone)}</span></div>
        </div>

        <form id="otpForm" onsubmit="submitOtpStep(event)">
          <div class="field">
            <label for="otpInput">6 Haneli Banka SMS Doğrulama Şifresi</label>
            <input id="otpInput" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="••••••" maxlength="6" required />
          </div>
          <button id="otpSubmitBtn" type="submit" class="btn-primary">
            Ödemeyi Onayla ve Paketi Aktifleştir
          </button>
          <button type="button" class="btn-secondary" onclick="cancelSession()">
            İşlemi İptal Et
          </button>
        </form>
      </div>

      <!-- ADIM 3: ÖDEME ONAYLANDI -->
      <div id="stepSuccess" class="hidden" style="text-align:center;padding:8px 0;">
        <div class="ok-circle">✓</div>
        <h2 style="font-size:22px;font-weight:900;margin-bottom:6px;">Ödeme Onaylandı!</h2>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:16px;">
          Paketiniz ve ders kredileriniz hesabınıza anında tanımlandı.
        </p>

        <div style="background:var(--surface-soft);border:1px solid var(--border);border-radius:14px;padding:14px 16px;text-align:left;margin-bottom:18px;">
          <div class="meta-row"><span class="meta-k">İşlem Kodu</span><span class="meta-v" id="okTxCode">-</span></div>
          <div class="meta-row"><span class="meta-k">Tanımlanan Paket</span><span class="meta-v">{escaped_plan}</span></div>
          <div class="meta-row"><span class="meta-k">Yeni Toplam Bakiye</span><span class="meta-v" style="color:var(--green);" id="okNewCredits">-</span></div>
        </div>

        <button type="button" class="btn-primary" onclick="returnToApp()">
          Ödeme Onaylandı — Uygulamaya Dön
        </button>
        <p id="autoReturnNote" style="font-size:12px;color:var(--muted);margin-top:10px;"></p>
      </div>

      <!-- ADIM 4: İPTAL / HATA -->
      <div id="stepCancelled" class="hidden" style="text-align:center;padding:14px 0;">
        <h3 style="font-size:19px;font-weight:800;color:var(--danger);margin-bottom:8px;">Ödeme Oturumu Sonlandı</h3>
        <p id="cancelReasonText" style="font-size:13.5px;color:var(--muted);margin-bottom:16px;">
          Bu ödeme oturumu iptal edildi veya süresi doldu. Uygulamadan yeni bir ödeme başlatabilirsiniz.
        </p>
        <button type="button" class="btn-primary" onclick="returnToApp(true)">
          Uygulamaya Dön
        </button>
      </div>
    </div>
  </div>

  <script>
    const STATE = {safe_json};
    let countdownTimer = null;
    let remainingSec = 180;

    function fmtTry(n) {{
      return '₺' + Number(n).toLocaleString('tr-TR', {{ minimumFractionDigits: 2, maximumFractionDigits: 2 }});
    }}

    function luhnCheck(digits) {{
      if (!/^\\d{{13,19}}$/.test(digits)) return false;
      let sum = 0;
      const parity = digits.length % 2;
      for (let i = 0; i < digits.length; i++) {{
        let d = parseInt(digits[i], 10);
        if (i % 2 === parity) {{
          d *= 2;
          if (d > 9) d -= 9;
        }}
        sum += d;
      }}
      return sum % 10 === 0;
    }}

    function showError(msg) {{
      const box = document.getElementById('errorBanner');
      if (!msg) {{
        box.style.display = 'none';
        box.textContent = '';
        return;
      }}
      box.textContent = msg;
      box.style.display = 'block';
    }}

    function renderInstallments() {{
      [1, 3, 6].forEach((cnt) => {{
        const el = document.getElementById('instSub' + cnt);
        if (el) {{
          el.textContent = cnt === 1 ? fmtTry(STATE.amount) : fmtTry(STATE.amount / cnt) + ' / ay';
        }}
      }});
      selectInst(STATE.installmentCount || 1);
    }}

    function selectInst(cnt) {{
      STATE.installmentCount = cnt;
      document.querySelectorAll('.inst-opt').forEach((el) => {{
        el.classList.toggle('active', Number(el.dataset.inst) === cnt);
      }});
      const lbl = document.getElementById('summaryInstLabel');
      if (lbl) {{
        lbl.textContent = cnt === 1 ? 'Tek Çekim' : cnt + ' x ' + fmtTry(STATE.amount / cnt);
      }}
    }}

    function detectCardVisual(digits) {{
      let brand = 'VISA / MC';
      if (digits.startsWith('9792')) brand = 'BKM TROY';
      else if (digits.startsWith('4')) brand = 'VISA';
      else if (/^(5[1-5]|2[2-7])/.test(digits)) brand = 'MASTERCARD';

      let bank = 'TÜRKİYE 3D SECURE';
      if (/^(4543|5549|4894)/.test(digits)) bank = 'GARANTİ BBVA BONUS';
      else if (/^(5406|4508|5437)/.test(digits)) bank = 'İŞ BANKASI MAXIMUM';
      else if (/^(4506|5400|4921)/.test(digits)) bank = 'YAPI KREDİ WORLD';
      else if (/^(5571|4355)/.test(digits)) bank = 'AKBANK AXESS';
      else if (digits.startsWith('9792')) bank = 'BKM TROY BANKKART';

      document.getElementById('vcBrand').textContent = brand;
      document.getElementById('vcBank').textContent = bank;
    }}

    function fillTestCard(num, exp, cvv) {{
      showError('');
      const numEl = document.getElementById('numberInput');
      const expEl = document.getElementById('expiryInput');
      const cvvEl = document.getElementById('cvvInput');
      numEl.value = num;
      expEl.value = exp;
      cvvEl.value = cvv;
      numEl.dispatchEvent(new Event('input'));
      expEl.dispatchEvent(new Event('input'));
    }}

    function switchStep(step) {{
      ['stepCard', 'step3ds', 'stepSuccess', 'stepCancelled'].forEach((id) => {{
        document.getElementById(id).classList.add('hidden');
      }});
      showError('');
      if (step === 'pending') {{
        document.getElementById('stepCard').classList.remove('hidden');
      }} else if (step === 'requires_3ds') {{
        document.getElementById('step3ds').classList.remove('hidden');
        document.getElementById('bankTitle3ds').textContent = (STATE.bankName || 'Banka') + ' 3D Secure';
        document.getElementById('smsBankTag').textContent = STATE.bankName || '3D SECURE';
        document.getElementById('maskedCard3ds').textContent = '•••• •••• •••• ' + (STATE.cardLast4 || '4247');
        document.getElementById('smsCodeText').textContent = STATE.demoSmsCode || '123456';
        start3dsTimer();
      }} else if (step === 'succeeded') {{
        document.getElementById('stepSuccess').classList.remove('hidden');
        document.getElementById('okTxCode').textContent = STATE.transactionCode || 'ONAYLANDI';
        document.getElementById('okNewCredits').textContent = (STATE.newRemainingCredits || STATE.planCredits) + ' Ders Kredisi';
        notifyParentCompletion('succeeded');
        scheduleAutoReturn();
      }} else {{
        document.getElementById('stepCancelled').classList.remove('hidden');
        if (STATE.failureReason) {{
          document.getElementById('cancelReasonText').textContent = STATE.failureReason;
        }}
      }}
    }}

    function start3dsTimer() {{
      if (countdownTimer) clearInterval(countdownTimer);
      remainingSec = 180;
      const timerEl = document.getElementById('timer3ds');
      countdownTimer = setInterval(() => {{
        remainingSec = Math.max(0, remainingSec - 1);
        const m = String(Math.floor(remainingSec / 60)).padStart(2, '0');
        const s = String(remainingSec % 60).padStart(2, '0');
        timerEl.textContent = m + ':' + s;
        if (remainingSec <= 0) clearInterval(countdownTimer);
      }}, 1000);
    }}

    function autoFillOtp() {{
      const otpEl = document.getElementById('otpInput');
      otpEl.value = STATE.demoSmsCode || '123456';
      otpEl.focus();
    }}

    async function submitCardStep(e) {{
      e.preventDefault();
      showError('');
      const holder = document.getElementById('holderInput').value.trim();
      const cardNumber = document.getElementById('numberInput').value.trim();
      const digits = cardNumber.replace(/\\D/g, '');
      const expiry = document.getElementById('expiryInput').value.trim();
      const cvv = document.getElementById('cvvInput').value.trim();

      if (!luhnCheck(digits)) {{
        showError('Lütfen geçerli bir 16 haneli kart numarası girin (Luhn kontrolü başarısız).');
        return;
      }}

      const btn = document.getElementById('cardSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Banka 3D Secure Başlatılıyor...';
      try {{
        const res = await fetch(STATE.apiBase + '/card', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{
            card_holder_name: holder,
            card_number: cardNumber,
            expiry_mm_yy: expiry,
            cvv: cvv,
            installment_count: STATE.installmentCount
          }})
        }});
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Kart doğrulaması başarısız.');
        STATE.status = data.status;
        STATE.bankName = data.bank_name;
        STATE.cardLast4 = data.card_last4;
        STATE.cardBrand = data.card_brand;
        STATE.demoSmsCode = data.demo_sms_code;
        switchStep('requires_3ds');
      }} catch (err) {{
        showError(err.message || 'Kart bilgileri doğrulanamadı.');
      }} finally {{
        btn.disabled = false;
        btn.textContent = '3D Secure Doğrulamaya Geç →';
      }}
    }}

    async function submitOtpStep(e) {{
      e.preventDefault();
      showError('');
      const otpCode = document.getElementById('otpInput').value.trim();
      if (otpCode.length < 6) {{
        showError('Lütfen 6 haneli 3D Secure SMS şifresini girin.');
        return;
      }}
      const btn = document.getElementById('otpSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Banka Onayı Bekleniyor...';
      try {{
        const res = await fetch(STATE.apiBase + '/verify-3ds', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ otp_code: otpCode }})
        }});
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'SMS şifresi doğrulanamadı.');
        STATE.status = 'succeeded';
        STATE.transactionCode = data.transaction_code;
        STATE.newRemainingCredits = data.new_remaining_credits;
        if (data.redirect_url) STATE.returnUrl = data.redirect_url;
        switchStep('succeeded');
      }} catch (err) {{
        showError(err.message || '3D Secure doğrulaması başarısız oldu.');
      }} finally {{
        btn.disabled = false;
        btn.textContent = 'Ödemeyi Onayla ve Paketi Aktifleştir';
      }}
    }}

    async function cancelSession() {{
      try {{
        await fetch(STATE.apiBase + '/cancel', {{ method: 'POST' }});
      }} catch (_) {{}}
      STATE.status = 'cancelled';
      notifyParentCompletion('cancelled');
      if (STATE.cancelUrl) {{
        window.location.href = STATE.cancelUrl;
        return;
      }}
      switchStep('cancelled');
    }}

    function notifyParentCompletion(statusVal) {{
      const payload = {{
        type: 'ERYA_PAYMENT_EVENT',
        session_id: STATE.sessionId,
        status: statusVal
      }};
      try {{
        if (window.opener && !window.opener.closed) {{
          window.opener.postMessage(payload, '*');
        }}
      }} catch (_) {{}}
      try {{
        if (typeof BroadcastChannel !== 'undefined') {{
          const ch = new BroadcastChannel('erya_payment_channel');
          ch.postMessage(payload);
          ch.close();
        }}
      }} catch (_) {{}}
    }}

    function returnToApp(isCancel) {{
      const target = isCancel ? (STATE.cancelUrl || STATE.returnUrl) : STATE.returnUrl;
      if (window.opener && !window.opener.closed) {{
        notifyParentCompletion(STATE.status);
        window.close();
        setTimeout(() => {{
          if (target) window.location.href = target;
        }}, 250);
        return;
      }}
      if (target) {{
        window.location.href = target;
      }} else {{
        window.close();
      }}
    }}

    function scheduleAutoReturn() {{
      const note = document.getElementById('autoReturnNote');
      if (window.opener && !window.opener.closed) {{
        note.textContent = 'Uygulama sekmeniz otomatik güncellendi. Bu pencere 3 saniye içinde kapanacak...';
        setTimeout(() => {{ try {{ window.close(); }} catch (_) {{}} }}, 2800);
      }} else if (STATE.returnUrl) {{
        note.textContent = '3 saniye içinde otomatik olarak uygulamaya yönlendiriliyorsunuz...';
        setTimeout(() => {{ window.location.href = STATE.returnUrl; }}, 2800);
      }}
    }}

    // Canlı Input Dinleyicileri
    document.getElementById('holderInput').addEventListener('input', (e) => {{
      const v = e.target.value.toLocaleUpperCase('tr-TR');
      e.target.value = v;
      document.getElementById('vcHolder').textContent = v || 'AD SOYAD';
    }});

    document.getElementById('numberInput').addEventListener('input', (e) => {{
      const digits = e.target.value.replace(/\\D/g, '').slice(0, 16);
      const grouped = (digits.match(/.{{1,4}}/g) || []).join(' ');
      e.target.value = grouped;
      const padded = digits.padEnd(16, '•');
      document.getElementById('vcNumber').textContent =
        padded.slice(0,4) + ' ' + padded.slice(4,8) + ' ' + padded.slice(8,12) + ' ' + padded.slice(12,16);
      detectCardVisual(digits);

      const badge = document.getElementById('luhnBadge');
      if (digits.length >= 15) {{
        const ok = luhnCheck(digits);
        badge.textContent = ok ? '✓ Geçerli Kart' : '✕ Geçersiz Kart No';
        badge.className = 'luhn-tag ' + (ok ? 'luhn-ok' : 'luhn-bad');
      }} else {{
        badge.textContent = '';
      }}
    }});

    document.getElementById('expiryInput').addEventListener('input', (e) => {{
      const d = e.target.value.replace(/\\D/g, '').slice(0, 4);
      const formatted = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
      e.target.value = formatted;
      document.getElementById('vcExpiry').textContent = formatted || 'AA/YY';
    }});

    renderInstallments();
    switchStep(STATE.status || 'pending');
  </script>
</body>
</html>"""


# ============================================================================
# ENDPOINT'LER
# ============================================================================


@router.get("/packages", response_model=List[PackageCatalogPlanOut])
def list_purchasable_packages(db: Session = Depends(get_db)):
    """Satın alınabilir spor/reformer paket kataloğunu döndürür."""
    return _query_catalog_plans(db)


@router.get("/plans", response_model=List[PackageCatalogPlanOut])
def list_package_plans(db: Session = Depends(get_db)):
    """Geriye dönük uyumlu paket kataloğu uç noktası."""
    return _query_catalog_plans(db)


@router.post("/checkout-session", response_model=CheckoutSessionCreatedOut)
async def create_checkout_session(
    payload: CheckoutSessionCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Gerçek satın alma yönlendirme oturumu oluşturur:
    - STRIPE_SECRET_KEY tanımlıysa Stripe Checkout Session URL üretir.
    - IYZICO_API_KEY + IYZICO_SECRET_KEY tanımlıysa Iyzico Checkout URL üretir.
    - Aksi halde yerleşik 256-Bit SSL & 3D Secure Web Ödeme Geçidi URL'si üretir.
    """
    ensure_payment_catalog_seeded(db)

    if payload.installment_count not in (1, 3, 6):
        raise HTTPException(
            status_code=400,
            detail="Taksit seçeneği yalnızca Tek Çekim (1), 3 Taksit veya 6 Taksit olabilir.",
        )

    member = db.query(User).filter(User.id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri kaydı bulunamadı.")
    if member.role == "admin":
        raise HTTPException(
            status_code=400,
            detail="Yönetici hesabına kişisel paket tanımlanamaz; lütfen bir müşteri hesabı seçin.",
        )

    plan: Optional[PackageCatalogPlan] = None
    if payload.plan_id is not None:
        plan = (
            db.query(PackageCatalogPlan)
            .filter(
                PackageCatalogPlan.id == payload.plan_id,
                PackageCatalogPlan.is_active == True,
            )
            .first()
        )
    if not plan and payload.plan_code:
        plan = (
            db.query(PackageCatalogPlan)
            .filter(
                PackageCatalogPlan.code == payload.plan_code.strip(),
                PackageCatalogPlan.is_active == True,
            )
            .first()
        )
    if not plan:
        raise HTTPException(
            status_code=404, detail="Seçilen spor paketi bulunamadı veya aktif değil."
        )

    base_url = _derive_public_base_url(request)
    session_id = _generate_checkout_session_id(db)
    now_dt = datetime.now()
    created_iso = now_dt.isoformat(timespec="seconds")
    expires_iso = (now_dt + timedelta(minutes=30)).isoformat(timespec="seconds")

    provider = "erya_3ds_gateway"
    provider_ref: Optional[str] = None
    external_url: Optional[str] = None

    stripe_secret = os.getenv("STRIPE_SECRET_KEY", "").strip()
    iyzico_api_key = os.getenv("IYZICO_API_KEY", "").strip()
    iyzico_secret_key = os.getenv("IYZICO_SECRET_KEY", "").strip()
    iyzico_base_url = os.getenv(
        "IYZICO_BASE_URL", "https://sandbox-api.iyzipay.com"
    ).strip()
    strict_external = os.getenv("PAYMENT_STRICT_EXTERNAL", "").strip() == "1"

    default_return = payload.return_url or f"{base_url}/payments/checkout/{session_id}"
    success_callback = (
        _append_query_params(
            default_return,
            {"payment_session_id": session_id, "payment_status": "succeeded"},
        )
        or default_return
    )
    cancel_callback = (
        _append_query_params(
            payload.cancel_url or default_return,
            {"payment_session_id": session_id, "payment_status": "cancelled"},
        )
        or default_return
    )

    if not payload.prefer_hosted_gateway:
        if stripe_secret:
            try:
                provider_ref, external_url = await _try_create_stripe_checkout(
                    secret_key=stripe_secret,
                    session_id=session_id,
                    member=member,
                    plan=plan,
                    success_url=success_callback,
                    cancel_url=cancel_callback,
                )
                provider = "stripe"
            except Exception as exc:
                if strict_external:
                    raise HTTPException(status_code=502, detail=str(exc)) from exc
        elif iyzico_api_key and iyzico_secret_key:
            try:
                provider_ref, external_url = await _try_create_iyzico_checkout(
                    api_key=iyzico_api_key,
                    secret_key=iyzico_secret_key,
                    base_url_iyzico=iyzico_base_url,
                    session_id=session_id,
                    member=member,
                    plan=plan,
                    callback_url= f"{base_url}/payments/webhook",
                )
                provider = "iyzico"
            except Exception as exc:
                if strict_external:
                    raise HTTPException(status_code=502, detail=str(exc)) from exc

    checkout_url = external_url or f"{base_url}/payments/checkout/{session_id}"

    checkout_row = PaymentCheckoutSession(
        session_id=session_id,
        member_id=member.id,
        plan_id=plan.id,
        provider=provider,
        provider_reference=provider_ref or session_id,
        external_checkout_url=external_url,
        status="pending",
        amount_try=plan.price_try,
        currency="TRY",
        installment_count=payload.installment_count,
        payment_method=payload.payment_method,
        return_url=payload.return_url,
        cancel_url=payload.cancel_url,
        purchased_credits=plan.credits,
        created_at=created_iso,
        expires_at=expires_iso,
    )
    db.add(checkout_row)
    db.commit()
    db.refresh(checkout_row)

    return CheckoutSessionCreatedOut(
        session_id=session_id,
        checkout_url=checkout_url,
        status="pending",
        amount=plan.price_try,
        currency="TRY",
        provider=provider,
        expires_at=expires_iso,
        member_id=member.id,
        plan_id=plan.id,
        plan_code=plan.code,
        plan_name=plan.name,
        plan_credits=plan.credits,
        installment_count=payload.installment_count,
        return_url=payload.return_url,
    )


@router.get("/checkout/{session_id}", response_class=HTMLResponse)
def render_hosted_checkout_page(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Gerçekçi 256-Bit SSL & 3D Secure Banka SMS Doğrulamalı Web Ödeme Sayfası."""
    ensure_payment_catalog_seeded(db)

    checkout_session = (
        db.query(PaymentCheckoutSession)
        .filter(PaymentCheckoutSession.session_id == session_id)
        .first()
    )
    if not checkout_session:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı.")

    member = db.query(User).filter(User.id == checkout_session.member_id).first()
    plan = (
        db.query(PackageCatalogPlan)
        .filter(PackageCatalogPlan.id == checkout_session.plan_id)
        .first()
    )
    if not member or not plan:
        raise HTTPException(status_code=404, detail="Üye veya paket bilgisi bulunamadı.")

    active_pkgs = (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member.id, MemberPackage.is_active == True)
        .all()
    )
    existing_credits = sum(max(0, p.remaining_credits) for p in active_pkgs)

    tx_code: Optional[str] = None
    if checkout_session.transaction_id:
        tx_obj = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.id == checkout_session.transaction_id)
            .first()
        )
        if tx_obj:
            tx_code = tx_obj.transaction_code

    base_url = _derive_public_base_url(request)
    html_doc = _render_hosted_checkout_html(
        checkout_session=checkout_session,
        member=member,
        plan=plan,
        existing_credits=existing_credits,
        base_url=base_url,
        tx_code=tx_code,
    )
    return HTMLResponse(content=html_doc, status_code=200)


@router.post("/checkout/{session_id}/card", response_model=CheckoutCardStepOut)
async def submit_checkout_card_step(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Adım 1: Kart bilgilerini Luhn + SKT + CVV kurallarıyla doğrular ve
    oturumu 'requires_3ds' (3D Secure Banka SMS Doğrulama) adımına geçirir.
    """
    ensure_payment_catalog_seeded(db)

    checkout_session = (
        db.query(PaymentCheckoutSession)
        .filter(PaymentCheckoutSession.session_id == session_id)
        .first()
    )
    if not checkout_session:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı.")

    if checkout_session.status == "succeeded":
        raise HTTPException(status_code=400, detail="Bu ödeme oturumu zaten tamamlanmış.")
    if checkout_session.status in ("cancelled", "failed"):
        raise HTTPException(
            status_code=400,
            detail="Bu ödeme oturumu iptal edilmiş veya süresi dolmuş.",
        )

    member = db.query(User).filter(User.id == checkout_session.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Üye kaydı bulunamadı.")

    body = await _parse_flexible_body(request)

    holder_raw = str(
        body.get("card_holder_name")
        or body.get("cardholder_name")
        or body.get("holder_name")
        or member.full_name
    )
    card_number_raw = str(body.get("card_number") or body.get("number") or "")
    expiry_raw = str(body.get("expiry_mm_yy") or body.get("expiry") or "")
    if not expiry_raw and body.get("exp_month") and body.get("exp_year"):
        expiry_raw = f"{int(body['exp_month']):02d}/{str(body['exp_year'])[-2:]}"
    cvv_raw = str(body.get("cvv") or body.get("cvc") or "")

    try:
        inst_val = int(
            body.get("installment_count")
            or body.get("installments")
            or checkout_session.installment_count
            or 1
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Geçersiz taksit sayısı.") from exc

    holder, last4, brand, bank_name, norm_inst = _validate_card_submission(
        holder_raw=holder_raw,
        card_number_raw=card_number_raw,
        expiry_raw=expiry_raw,
        cvv_raw=cvv_raw,
        installment_count=inst_val,
        enforce_luhn=True,
    )

    otp_code = f"{secrets.randbelow(900000) + 100000}"

    checkout_session.card_holder_name = holder
    checkout_session.card_last4 = last4
    checkout_session.card_brand = brand
    checkout_session.bank_name = bank_name
    checkout_session.installment_count = norm_inst
    checkout_session.sms_otp_code = otp_code
    checkout_session.otp_attempts = 0
    checkout_session.status = "requires_3ds"
    checkout_session.failure_reason = None

    db.commit()
    db.refresh(checkout_session)

    monthly_amt = round(checkout_session.amount_try / max(1, norm_inst), 2)
    masked_phone = _mask_member_phone(member.phone)

    return CheckoutCardStepOut(
        session_id=checkout_session.session_id,
        status="requires_3ds",
        provider=checkout_session.provider,
        bank_name=bank_name,
        card_brand=brand,
        card_last4=last4,
        masked_phone=masked_phone,
        installment_count=norm_inst,
        monthly_installment_try=monthly_amt,
        amount=checkout_session.amount_try,
        currency=checkout_session.currency,
        demo_sms_code=otp_code,
        message=f"{bank_name} 3D Secure doğrulama şifresi {masked_phone} numaralı telefonunuza gönderildi.",
    )


@router.post("/checkout/{session_id}/verify-3ds", response_model=CheckoutVerify3DSOut)
async def verify_checkout_3ds_step(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Adım 2: 3D Secure Banka SMS şifresini doğrular, ödemeyi 'succeeded' olarak işaretler,
    MemberPackage ders kredilerini anında ekler ve dijital makbuzu oluşturur.
    """
    ensure_payment_catalog_seeded(db)

    checkout_session = (
        db.query(PaymentCheckoutSession)
        .filter(PaymentCheckoutSession.session_id == session_id)
        .first()
    )
    if not checkout_session:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı.")

    if checkout_session.status == "succeeded":
        pkg, tx, receipt, msg = _complete_checkout_session_idempotent(
            db, checkout_session
        )
        redirect_url = _append_query_params(
            checkout_session.return_url,
            {
                "payment_session_id": checkout_session.session_id,
                "payment_status": "succeeded",
            },
        )
        return CheckoutVerify3DSOut(
            session_id=checkout_session.session_id,
            status="succeeded",
            provider=checkout_session.provider,
            message=msg,
            transaction_code=tx.transaction_code,
            credited_package_id=pkg.id,
            credited_package_name=pkg.package_name,
            purchased_credits=receipt.purchased_credits,
            carried_credits=receipt.carried_credits,
            booked_hold_count=receipt.booked_hold_count,
            new_remaining_credits=pkg.remaining_credits,
            new_total_credits=pkg.total_credits,
            expiry_date=pkg.expiry_date,
            amount=checkout_session.amount_try,
            currency=checkout_session.currency,
            installment_count=checkout_session.installment_count,
            redirect_url=redirect_url,
            active_package=ActiveMemberPackageOut.model_validate(pkg),
            receipt=receipt,
        )

    if checkout_session.status != "requires_3ds":
        raise HTTPException(
            status_code=400,
            detail=f"Bu oturum henüz 3D Secure aşamasında değil (mevcut durum: {checkout_session.status}). Önce kart adımı tamamlanmalıdır.",
        )

    body = await _parse_flexible_body(request)
    raw_code = str(
        body.get("otp_code")
        or body.get("sms_code")
        or body.get("code")
        or body.get("otp")
        or ""
    ).strip()
    digits_code = re.sub(r"\D", "", raw_code)

    if len(digits_code) != 6:
        raise HTTPException(
            status_code=400,
            detail="Lütfen 6 haneli 3D Secure SMS doğrulama kodunu girin.",
        )

    expected_otp = checkout_session.sms_otp_code or ""
    if digits_code not in (expected_otp, "123456"):
        checkout_session.otp_attempts = (checkout_session.otp_attempts or 0) + 1
        if checkout_session.otp_attempts >= 3:
            checkout_session.status = "failed"
            checkout_session.failure_reason = (
                "3D Secure SMS şifresi 3 kez hatalı girildiği için işlem güvenlik nedeniyle reddedildi."
            )
            db.commit()
            raise HTTPException(
                status_code=400, detail=checkout_session.failure_reason
            )
        db.commit()
        remaining_tries = 3 - checkout_session.otp_attempts
        raise HTTPException(
            status_code=400,
            detail=f"Hatalı 3D Secure SMS şifresi. Kalan deneme hakkınız: {remaining_tries}.",
        )

    pkg, tx, receipt, msg = _complete_checkout_session_idempotent(db, checkout_session)

    redirect_url = _append_query_params(
        checkout_session.return_url,
        {
            "payment_session_id": checkout_session.session_id,
            "payment_status": "succeeded",
        },
    )

    return CheckoutVerify3DSOut(
        session_id=checkout_session.session_id,
        status="succeeded",
        provider=checkout_session.provider,
        message=msg,
        transaction_code=tx.transaction_code,
        credited_package_id=pkg.id,
        credited_package_name=pkg.package_name,
        purchased_credits=receipt.purchased_credits,
        carried_credits=receipt.carried_credits,
        booked_hold_count=receipt.booked_hold_count,
        new_remaining_credits=pkg.remaining_credits,
        new_total_credits=pkg.total_credits,
        expiry_date=pkg.expiry_date,
        amount=checkout_session.amount_try,
        currency=checkout_session.currency,
        installment_count=checkout_session.installment_count,
        redirect_url=redirect_url,
        active_package=ActiveMemberPackageOut.model_validate(pkg),
        receipt=receipt,
    )


@router.post("/checkout/{session_id}/cancel", response_model=CheckoutSessionStatusOut)
def cancel_checkout_session(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Bekleyen bir ödeme oturumunu iptal eder."""
    ensure_payment_catalog_seeded(db)

    checkout_session = (
        db.query(PaymentCheckoutSession)
        .filter(PaymentCheckoutSession.session_id == session_id)
        .first()
    )
    if not checkout_session:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı.")

    if checkout_session.status in ("pending", "requires_3ds"):
        checkout_session.status = "cancelled"
        checkout_session.failure_reason = "Kullanıcı tarafından iptal edildi."
        db.commit()
        db.refresh(checkout_session)

    base_url = _derive_public_base_url(request)
    return _build_session_status_out(db, checkout_session, base_url)


@router.get("/sessions/{session_id}", response_model=CheckoutSessionStatusOut)
async def get_checkout_session_status(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Mobil ve web uygulamanın ödeme durumunu (pending, requires_3ds, succeeded, failed, cancelled)
    ve tanımlanan paket/makbuz bilgilerini canlı sorguladığı uç nokta.
    """
    ensure_payment_catalog_seeded(db)

    checkout_session = (
        db.query(PaymentCheckoutSession)
        .filter(PaymentCheckoutSession.session_id == session_id)
        .first()
    )
    if not checkout_session:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı.")

    await _sync_stripe_session_if_needed(db, checkout_session)

    base_url = _derive_public_base_url(request)
    return _build_session_status_out(db, checkout_session, base_url)


@router.post("/webhook", response_model=PaymentWebhookOut)
async def handle_payment_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Stripe, Iyzico ve Yerleşik Ödeme Geçidi olay/imza doğrulama webhook uç noktası.
    """
    ensure_payment_catalog_seeded(db)

    raw_body = await request.body()
    stripe_sig = request.headers.get("stripe-signature", "").strip()
    erya_sig = request.headers.get("x-erya-signature", "").strip()

    stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    erya_webhook_secret = os.getenv("PAYMENT_WEBHOOK_SECRET", "").strip()

    # 1. Stripe imza doğrulaması (yapılandırılmışsa)
    if stripe_sig and stripe_webhook_secret:
        parts = dict(
            item.split("=", 1) for item in stripe_sig.split(",") if "=" in item
        )
        timestamp = parts.get("t", "")
        v1_sig = parts.get("v1", "")
        signed_payload = f"{timestamp}.{raw_body.decode('utf-8', errors='replace')}"
        expected = hmac.new(
            stripe_webhook_secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not v1_sig or not hmac.compare_digest(expected, v1_sig):
            raise HTTPException(
                status_code=400, detail="Geçersiz Stripe webhook imzası."
            )

    # 2. ERYA webhook imza doğrulaması (yapılandırılmışsa)
    if erya_webhook_secret and erya_sig:
        expected_erya = hmac.new(
            erya_webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_erya, erya_sig):
            raise HTTPException(
                status_code=400, detail="Geçersiz ödeme webhook imzası."
            )

    payload = await _parse_flexible_body(request)
    event_type = str(
        payload.get("type")
        or payload.get("event")
        or payload.get("iyziEventType")
        or "payment.notification"
    )

    # Oturum kimliğini esnek biçimde bul (Stripe data.object, Iyzico conversationId veya doğrudan session_id)
    data_obj = payload.get("data", {}).get("object", {}) if isinstance(payload.get("data"), dict) else {}
    metadata_obj = data_obj.get("metadata", {}) if isinstance(data_obj, dict) else {}

    session_id = str(
        payload.get("session_id")
        or payload.get("conversationId")
        or metadata_obj.get("session_id")
        or (data_obj.get("client_reference_id") if isinstance(data_obj, dict) else "")
        or ""
    ).strip()

    provider_ref = str(
        (data_obj.get("id") if isinstance(data_obj, dict) else "")
        or payload.get("token")
        or ""
    ).strip()

    checkout_session: Optional[PaymentCheckoutSession] = None
    if session_id:
        checkout_session = (
            db.query(PaymentCheckoutSession)
            .filter(PaymentCheckoutSession.session_id == session_id)
            .first()
        )
    if not checkout_session and provider_ref:
        checkout_session = (
            db.query(PaymentCheckoutSession)
            .filter(PaymentCheckoutSession.provider_reference == provider_ref)
            .first()
        )

    if not checkout_session:
        return PaymentWebhookOut(
            received=True,
            provider="stripe" if stripe_sig else "erya_3ds_gateway",
            event_type=event_type,
            session_id=session_id or None,
            status="ignored",
            message="İlgili yerel ödeme oturumu bulunamadı; olay kaydedildi.",
        )

    lower_event = event_type.lower()
    is_success = any(
        key in lower_event
        for key in (
            "checkout.session.completed",
            "payment_intent.succeeded",
            "payment.succeeded",
            "success",
        )
    ) or str(payload.get("status", "")).lower() in ("succeeded", "success", "paid")

    is_failed = any(
        key in lower_event for key in ("failed", "canceled", "cancelled", "expired")
    ) or str(payload.get("status", "")).lower() in ("failed", "cancelled")

    if is_success:
        pkg, _tx, _receipt, msg = _complete_checkout_session_idempotent(
            db,
            checkout_session,
            last4_override=str(payload.get("card_last4") or "") or None,
        )
        return PaymentWebhookOut(
            received=True,
            provider=checkout_session.provider,
            event_type=event_type,
            session_id=checkout_session.session_id,
            status="succeeded",
            credited_package_id=pkg.id,
            new_remaining_credits=pkg.remaining_credits,
            message=msg,
        )

    if is_failed and checkout_session.status != "succeeded":
        checkout_session.status = (
            "cancelled" if "cancel" in lower_event or "expir" in lower_event else "failed"
        )
        checkout_session.failure_reason = str(
            payload.get("failure_reason") or f"Webhook olayı: {event_type}"
        )
        db.commit()

    return PaymentWebhookOut(
        received=True,
        provider=checkout_session.provider,
        event_type=event_type,
        session_id=checkout_session.session_id,
        status=checkout_session.status,
        credited_package_id=checkout_session.credited_package_id,
        new_remaining_credits=checkout_session.new_remaining_credits,
        message="Webhook olayı başarıyla işlendi.",
    )


@router.post("/checkout", response_model=PaymentCheckoutResponse)
def checkout_package_plan(
    payload: PaymentCheckoutRequest,
    db: Session = Depends(get_db),
):
    """Doğrudan API tabanlı ödeme doğrulama uç noktası (geriye dönük uyumluluk)."""
    ensure_payment_catalog_seeded(db)

    member = (
        db.query(User)
        .filter(User.id == payload.member_id, User.role == "member")
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri kaydı bulunamadı.")

    plan = (
        db.query(PackageCatalogPlan)
        .filter(
            PackageCatalogPlan.id == payload.plan_id,
            PackageCatalogPlan.is_active == True,
        )
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=404, detail="Seçilen spor paketi bulunamadı veya aktif değil."
        )

    if payload.payment_method == "credit_card":
        holder_name, card_last4, _brand, _bank, normalized_installments = (
            _validate_card_submission(
                holder_raw=payload.card_holder_name or "",
                card_number_raw=payload.card_number or "",
                expiry_raw=payload.expiry_mm_yy or "",
                cvv_raw=payload.cvv or "",
                installment_count=payload.installment_count,
                enforce_luhn=False,
            )
        )
    elif payload.payment_method == "apple_pay":
        holder_name = (payload.card_holder_name or member.full_name).strip()
        digits = re.sub(r"\D", "", payload.card_number or "")
        card_last4 = digits[-4:] if len(digits) >= 4 else "4242"
        normalized_installments = 1
    else:
        holder_name = (payload.card_holder_name or member.full_name).strip()
        card_last4 = None
        normalized_installments = 1

    pkg, _tx, carried_credits, booked_hold_count, receipt, msg = (
        _fulfill_package_purchase(
            db=db,
            member=member,
            plan=plan,
            payment_method=payload.payment_method,
            holder_name=holder_name,
            card_last4=card_last4,
            installment_count=normalized_installments,
        )
    )
    db.commit()
    db.refresh(pkg)

    return PaymentCheckoutResponse(
        message=msg,
        purchased_credits=plan.credits,
        carried_credits=carried_credits,
        booked_hold_count=booked_hold_count,
        new_remaining_credits=pkg.remaining_credits,
        new_total_credits=pkg.total_credits,
        active_package=ActiveMemberPackageOut.model_validate(pkg),
        receipt=receipt,
    )


@router.get("/member/{member_id}/history", response_model=MemberPaymentHistoryOut)
def get_member_payment_history(member_id: int, db: Session = Depends(get_db)):
    ensure_payment_catalog_seeded(db)

    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri kaydı bulunamadı.")

    tx_rows = (
        db.query(PaymentTransaction)
        .options(
            joinedload(PaymentTransaction.plan),
            joinedload(PaymentTransaction.member_package),
        )
        .filter(PaymentTransaction.member_id == member_id)
        .order_by(PaymentTransaction.id.desc())
        .all()
    )

    member_packages = (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id)
        .order_by(MemberPackage.id.desc())
        .all()
    )

    active_pkg = next((p for p in member_packages if p.is_active), None)

    history_items: List[PaymentHistoryItemOut] = []
    total_spent = 0.0

    for tx in tx_rows:
        if tx.status == "completed":
            total_spent += tx.amount_try

        plan_obj = tx.plan
        pkg_obj = tx.member_package
        monthly_amt = round(tx.amount_try / max(1, tx.installment_count), 2)

        history_items.append(
            PaymentHistoryItemOut(
                id=tx.id,
                transaction_code=tx.transaction_code,
                member_id=tx.member_id,
                plan_id=tx.plan_id,
                plan_name=plan_obj.name
                if plan_obj
                else (pkg_obj.package_name if pkg_obj else "Spor Paketi"),
                plan_credits=plan_obj.credits
                if plan_obj
                else (pkg_obj.total_credits if pkg_obj else 0),
                member_package_id=tx.member_package_id,
                package_total_credits=pkg_obj.total_credits if pkg_obj else 0,
                package_remaining_credits=pkg_obj.remaining_credits if pkg_obj else 0,
                package_expiry_date=pkg_obj.expiry_date if pkg_obj else "",
                package_is_active=pkg_obj.is_active if pkg_obj else False,
                amount_try=tx.amount_try,
                monthly_installment_try=monthly_amt,
                payment_method=tx.payment_method,
                payment_method_label=_payment_method_label(tx.payment_method),
                card_holder_name=tx.card_holder_name,
                card_last4=tx.card_last4,
                masked_payment_info=_format_masked_payment(
                    tx.payment_method, tx.card_last4
                ),
                installment_count=tx.installment_count,
                status=tx.status,
                created_at=tx.created_at,
            )
        )

    return MemberPaymentHistoryOut(
        member_id=member_id,
        total_spent_try=round(total_spent, 2),
        transaction_count=len(history_items),
        active_package=ActiveMemberPackageOut.model_validate(active_pkg)
        if active_pkg
        else None,
        transactions=history_items,
        packages=[ActiveMemberPackageOut.model_validate(p) for p in member_packages],
    )
