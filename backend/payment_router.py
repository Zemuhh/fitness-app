import json
import re
import secrets
from datetime import date, datetime, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from database import Base, engine, get_db
from models import Booking, MemberPackage, User
from payment_models import PackageCatalogPlan, PaymentTransaction

router = APIRouter(prefix="/payments", tags=["Payments & Package Purchases"])

PaymentMethodLiteral = Literal["credit_card", "apple_pay", "bank_transfer"]


# ============================================================================
# PYDANTIC ŞEMALARI (ÖDEME & PAKET MAĞAZASI)
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


class PaymentCheckoutRequest(BaseModel):
    member_id: int
    plan_id: int
    payment_method: PaymentMethodLiteral = "credit_card"
    card_holder_name: Optional[str] = None
    card_number: Optional[str] = None
    expiry_mm_yy: Optional[str] = None
    cvv: Optional[str] = None
    installment_count: int = Field(default=1)


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
        "code": "PT-START-4",
        "name": "4 Ders Başlangıç PT",
        "subtitle": "Birebir form analizi ve temel atletik adaptasyon paketi",
        "credits": 4,
        "duration_days": 30,
        "price_try": 3600.0,
        "popular_badge": None,
        "features": [
            "4 Birebir Reformer veya Fonksiyonel PT Dersi",
            "Detaylı Postür & Vücut Kompozisyon Analizi",
            "Mobil Uygulamadan Anında Randevu & İptal",
            "30 Gün Esnek Kullanım Süresi",
        ],
    },
    {
        "code": "PT-PERF-8",
        "name": "8 Ders Performans Paketi",
        "subtitle": "Düzenli kuvvet gelişimi, mobilite ve yüksek yağ yakımı",
        "credits": 8,
        "duration_days": 45,
        "price_try": 6400.0,
        "popular_badge": "🔥 En Çok Tercih Edilen",
        "features": [
            "8 Ders Reformer Pilates & Atletik PT Erişimi",
            "Sakatlık Önleyici Kişisel Egzersiz Programlama",
            "Öncelikli Akşam Seansı Rezervasyon Avantajı",
            "Kalan Kredileri Yeni Pakete Devretme Garantisi",
        ],
    },
    {
        "code": "PT-PRO-12",
        "name": "12 Ders Pro Atlet Paketi",
        "subtitle": "Yüksek yoğunluklu periyodizasyon ve sürdürülebilir kondisyon",
        "credits": 12,
        "duration_days": 60,
        "price_try": 8700.0,
        "popular_badge": "⚡ Yüksek Performans",
        "features": [
            "12 Ders Tüm Stüdyo & Özel Koçluk Seansları",
            "Aylık Atletik Gelişim & Kuvvet Takip Raporu",
            "Antrenman Öncesi/Sonrası Toparlanma Rehberi",
            "60 Gün Uzun Geçerlilik + Kredi Koruma",
        ],
    },
    {
        "code": "PT-VIP-20",
        "name": "20 Ders VIP Özel Koçluk",
        "subtitle": "Baş eğitmen eşliğinde tam kapsamlı VIP fiziksel dönüşüm",
        "credits": 20,
        "duration_days": 90,
        "price_try": 13000.0,
        "popular_badge": "👑 Maksimum Avantaj",
        "features": [
            "20 Ders VIP 1-1 Koçluk & Reformer Master Seansları",
            "Haftalık Biyomekanik Takip & Özel Not Yönetimi",
            "1 Ücretsiz Misafir Deneme Dersi Hakkı",
            "En Düşük Ders Başı Ücret + 90 Gün Geçerlilik",
        ],
    },
]


def ensure_payment_catalog_seeded(db: Session) -> None:
    """Ödeme tablolarını oluşturur ve katalog boşsa 4 profesyonel spor paketini ekler."""
    Base.metadata.create_all(bind=engine)

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
        "credit_card": "Kredi / Banka Kartı",
        "apple_pay": "Apple Pay (Prototip)",
        "bank_transfer": "Havale / FAST",
    }
    return labels.get(method, method)


def _format_masked_payment(method: str, card_last4: Optional[str]) -> str:
    if method == "credit_card":
        suffix = card_last4 or "0000"
        return f"•••• •••• •••• {suffix}"
    if method == "apple_pay":
        suffix = card_last4 if card_last4 and card_last4.isdigit() else "Apple Pay"
        return f" Pay • Dijital Cüzdan ({suffix})"
    return "TR42 •••• FAST Anında Onay"


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


def _validate_prototype_payment(
    payload: PaymentCheckoutRequest, member_full_name: str
) -> tuple[str, Optional[str], int]:
    """
    Prototip ödeme doğrulaması yapar.
    Asla tam kart numarasını kaydetmez; yalnızca maskelenmiş son 4 haneyi döndürür.
    """
    if payload.installment_count not in (1, 3, 6):
        raise HTTPException(
            status_code=400,
            detail="Taksit seçeneği yalnızca Tek Çekim (1), 3 Taksit veya 6 Taksit olabilir.",
        )

    if payload.payment_method == "credit_card":
        holder = (payload.card_holder_name or "").strip()
        if len(holder) < 3:
            raise HTTPException(
                status_code=400,
                detail="Lütfen kart üzerindeki ad ve soyad bilgisini eksiksiz girin.",
            )

        digits = re.sub(r"\D", "", payload.card_number or "")
        if len(digits) < 12 or len(digits) > 19:
            raise HTTPException(
                status_code=400,
                detail="Kart numarası geçersiz. Lütfen 12-16 haneli kart numaranızı kontrol edin.",
            )

        expiry_raw = (payload.expiry_mm_yy or "").strip()
        expiry_match = re.match(r"^(0[1-9]|1[0-2])\s*/\s*(\d{2}|\d{4})$", expiry_raw)
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

        cvv_digits = re.sub(r"\D", "", payload.cvv or "")
        if len(cvv_digits) not in (3, 4):
            raise HTTPException(
                status_code=400,
                detail="CVV güvenlik kodu 3 veya 4 haneli olmalıdır.",
            )

        return holder.upper(), digits[-4:], payload.installment_count

    if payload.payment_method == "apple_pay":
        holder = (payload.card_holder_name or member_full_name).strip()
        digits = re.sub(r"\D", "", payload.card_number or "")
        last4 = digits[-4:] if len(digits) >= 4 else "4242"
        return holder, last4, 1

    # bank_transfer (Havale / FAST)
    holder = (payload.card_holder_name or member_full_name).strip()
    return holder, None, 1


# ============================================================================
# ENDPOINT'LER
# ============================================================================


@router.get("/plans", response_model=List[PackageCatalogPlanOut])
def list_package_plans(db: Session = Depends(get_db)):
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


@router.post("/checkout", response_model=PaymentCheckoutResponse)
def checkout_package_plan(
    payload: PaymentCheckoutRequest,
    db: Session = Depends(get_db),
):
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
        .filter(PackageCatalogPlan.id == payload.plan_id, PackageCatalogPlan.is_active == True)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Seçilen spor paketi bulunamadı veya aktif değil.")

    holder_name, card_last4, normalized_installments = _validate_prototype_payment(
        payload, member.full_name
    )

    # Üyenin mevcut aktif paketlerini kontrol et; kalan ders kredisini yakma, yeni pakete devret!
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

    # Üyenin mevcut 'booked' randevularını yeni paket oluşturulmadan önce bul (iptal iadesi taşmasını önler)
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

    # Üyenin ileri tarihli 'booked' randevularını yeni aktif pakete bağla ki iptal/yoklama senkron kalsın
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
        payment_method=payload.payment_method,
        card_holder_name=holder_name,
        card_last4=card_last4,
        installment_count=normalized_installments,
        status="completed",
        created_at=created_iso,
    )
    db.add(transaction)
    db.commit()
    db.refresh(new_member_package)
    db.refresh(transaction)

    monthly_installment = round(plan.price_try / max(1, normalized_installments), 2)
    method_label = _payment_method_label(payload.payment_method)
    masked_info = _format_masked_payment(payload.payment_method, card_last4)

    if carried_credits > 0:
        msg = (
            f"{plan.name} başarıyla tanımlandı! Önceki paketinizden {carried_credits} ders devredildi; "
            f"kullanılabilir bakiyeniz {new_remaining_credits} ders (toplam paket hakkı: {new_total_credits} ders)."
        )
    else:
        msg = (
            f"{plan.name} başarıyla tanımlandı! Kullanılabilir {new_remaining_credits} ders krediniz "
            f"(toplam paket hakkı: {new_total_credits} ders) hazır."
        )

    receipt = DigitalReceiptOut(
        transaction_id=transaction.id,
        transaction_code=transaction.transaction_code,
        member_id=member.id,
        member_name=member.full_name,
        plan_id=plan.id,
        plan_code=plan.code,
        plan_name=plan.name,
        member_package_id=new_member_package.id,
        amount_try=transaction.amount_try,
        monthly_installment_try=monthly_installment,
        payment_method=transaction.payment_method,
        payment_method_label=method_label,
        card_holder_name=transaction.card_holder_name,
        card_last4=transaction.card_last4,
        masked_payment_info=masked_info,
        installment_count=transaction.installment_count,
        purchased_credits=plan.credits,
        carried_credits=carried_credits,
        booked_hold_count=booked_hold_count,
        new_remaining_credits=new_remaining_credits,
        new_total_credits=new_total_credits,
        expiry_date=new_member_package.expiry_date,
        status=transaction.status,
        created_at=transaction.created_at,
    )

    return PaymentCheckoutResponse(
        message=msg,
        purchased_credits=plan.credits,
        carried_credits=carried_credits,
        booked_hold_count=booked_hold_count,
        new_remaining_credits=new_remaining_credits,
        new_total_credits=new_total_credits,
        active_package=ActiveMemberPackageOut.model_validate(new_member_package),
        receipt=receipt,
    )


@router.get("/member/{member_id}/history", response_model=MemberPaymentHistoryOut)
def get_member_payment_history(member_id: int, db: Session = Depends(get_db)):
    ensure_payment_catalog_seeded(db)

    member = (
        db.query(User)
        .filter(User.id == member_id, User.role == "member")
        .first()
    )
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
                plan_name=plan_obj.name if plan_obj else (pkg_obj.package_name if pkg_obj else "Spor Paketi"),
                plan_credits=plan_obj.credits if plan_obj else (pkg_obj.total_credits if pkg_obj else 0),
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
                masked_payment_info=_format_masked_payment(tx.payment_method, tx.card_last4),
                installment_count=tx.installment_count,
                status=tx.status,
                created_at=tx.created_at,
            )
        )

    return MemberPaymentHistoryOut(
        member_id=member_id,
        total_spent_try=round(total_spent, 2),
        transaction_count=len(history_items),
        active_package=ActiveMemberPackageOut.model_validate(active_pkg) if active_pkg else None,
        transactions=history_items,
        packages=[ActiveMemberPackageOut.model_validate(p) for p in member_packages],
    )
