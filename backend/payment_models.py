from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class PackageCatalogPlan(Base):
    __tablename__ = "package_catalog_plans"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(60), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    subtitle = Column(String(240), nullable=False, default="")
    credits = Column(Integer, nullable=False)
    duration_days = Column(Integer, nullable=False)
    price_try = Column(Float, nullable=False)
    popular_badge = Column(String(100), nullable=True)
    features_json = Column(Text, nullable=False, default="[]")
    is_active = Column(Boolean, default=True, nullable=False, index=True)


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_code = Column(String(60), unique=True, nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("package_catalog_plans.id"), nullable=False, index=True)
    member_package_id = Column(Integer, ForeignKey("member_packages.id"), nullable=False, index=True)
    amount_try = Column(Float, nullable=False)
    payment_method = Column(String(30), nullable=False)  # 'credit_card' | 'apple_pay' | 'bank_transfer'
    card_holder_name = Column(String(120), nullable=True)
    card_last4 = Column(String(10), nullable=True)
    installment_count = Column(Integer, default=1, nullable=False)
    status = Column(String(20), default="completed", nullable=False, index=True)  # 'completed' | 'failed'
    created_at = Column(String(40), nullable=False)  # ISO 8601 timestamp

    member = relationship("User")
    plan = relationship("PackageCatalogPlan")
    member_package = relationship("MemberPackage")


class PaymentCheckoutSession(Base):
    """
    Gerçek Satın Alma Yönlendirmesi & Ödeme Geçidi Oturumu
    Desteklenen Sağlayıcılar:
    - 'stripe' (STRIPE_SECRET_KEY tanımlıysa gerçek Stripe Checkout Session)
    - 'iyzico' (IYZICO_API_KEY + IYZICO_SECRET_KEY tanımlıysa Iyzico Checkout Form)
    - 'erya_3ds_gateway' (Yerleşik 256-Bit SSL + BKM 3D Secure Banka SMS Doğrulama Geçidi)
    """

    __tablename__ = "payment_checkout_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(80), unique=True, nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("package_catalog_plans.id"), nullable=False, index=True)

    provider = Column(String(40), nullable=False, default="erya_3ds_gateway")
    provider_reference = Column(String(160), nullable=True, index=True)
    external_checkout_url = Column(String(700), nullable=True)

    # 'pending' | 'requires_3ds' | 'succeeded' | 'failed' | 'cancelled'
    status = Column(String(30), nullable=False, default="pending", index=True)

    amount_try = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="TRY")
    installment_count = Column(Integer, nullable=False, default=1)
    payment_method = Column(String(30), nullable=False, default="credit_card")

    card_holder_name = Column(String(120), nullable=True)
    card_last4 = Column(String(10), nullable=True)
    card_brand = Column(String(30), nullable=True)
    bank_name = Column(String(80), nullable=True)

    sms_otp_code = Column(String(12), nullable=True)
    otp_attempts = Column(Integer, nullable=False, default=0)
    failure_reason = Column(String(300), nullable=True)

    return_url = Column(String(700), nullable=True)
    cancel_url = Column(String(700), nullable=True)

    transaction_id = Column(Integer, ForeignKey("payment_transactions.id"), nullable=True, index=True)
    credited_package_id = Column(Integer, ForeignKey("member_packages.id"), nullable=True, index=True)
    purchased_credits = Column(Integer, nullable=False, default=0)
    carried_credits = Column(Integer, nullable=False, default=0)
    booked_hold_count = Column(Integer, nullable=False, default=0)
    new_remaining_credits = Column(Integer, nullable=True)
    new_total_credits = Column(Integer, nullable=True)

    created_at = Column(String(40), nullable=False)
    expires_at = Column(String(40), nullable=False)
    completed_at = Column(String(40), nullable=True)

    member = relationship("User")
    plan = relationship("PackageCatalogPlan")
    transaction = relationship("PaymentTransaction")
    credited_package = relationship("MemberPackage")
