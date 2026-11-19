from datetime import datetime
from sqlalchemy import Column, ForeignKey, Integer, String, Text

from database import Base
import models  # noqa: F401 - Ensures 'users' table is registered in Base.metadata


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class UserAccessCredential(Base):
    __tablename__ = "user_access_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    access_code = Column(String(40), unique=True, nullable=False, index=True)
    pin_code = Column(String(20), nullable=False, default="1234")
    created_at = Column(String(40), nullable=False, default=_now_iso)


class AdminAccount(Base):
    __tablename__ = "admin_accounts"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, nullable=False, index=True)
    password = Column(String(120), nullable=False, default="admin123")
    full_name = Column(String(120), nullable=False)


class DataIntakeLog(Base):
    __tablename__ = "data_intake_logs"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(30), nullable=False, index=True)  # "instagram" | "whatsapp" | "manual"
    sender_name = Column(String(120), nullable=False)
    sender_contact = Column(String(100), nullable=False)  # telefon veya @handle
    message_or_payload = Column(Text, nullable=False)
    target_department = Column(
        String(50), nullable=False, index=True
    )  # "booking" | "trainer_note" | "member_registry" | "lead_queue"
    routed_user_id = Column(Integer, nullable=True, index=True)
    assigned_access_code = Column(String(40), nullable=True)
    action_summary = Column(Text, nullable=False)
    created_at = Column(String(40), nullable=False, default=_now_iso)
