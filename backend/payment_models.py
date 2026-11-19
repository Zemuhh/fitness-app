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
    is_active = Column(Boolean, default=True, nullable=False)


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
    status = Column(String(20), default="completed", nullable=False)  # 'completed' | 'failed'
    created_at = Column(String(40), nullable=False)  # ISO 8601 timestamp

    member = relationship("User")
    plan = relationship("PackageCatalogPlan")
    member_package = relationship("MemberPackage")
