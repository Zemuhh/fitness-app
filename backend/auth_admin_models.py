from datetime import datetime
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, inspect, text
from sqlalchemy.engine import Engine

from database import Base
import models  # noqa: F401 - Ensures 'users' and 'daily_wellness' tables are registered in Base.metadata
import payment_models  # noqa: F401 - Ensures payment tables are registered in Base.metadata


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class UserAccessCredential(Base):
    __tablename__ = "user_access_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    access_code = Column(String(40), unique=True, nullable=False, index=True)
    pin_code = Column(String(20), nullable=False, default="1234")
    created_at = Column(String(40), nullable=False, default=_now_iso)


class UserAuthAccount(Base):
    __tablename__ = "user_auth_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    google_sub = Column(String(150), nullable=True, index=True)
    auth_provider = Column(String(30), nullable=False, default="password")  # "password" | "google"
    created_at = Column(String(40), nullable=False, default=_now_iso)
    updated_at = Column(String(40), nullable=False, default=_now_iso)


class AdminAccount(Base):
    __tablename__ = "admin_accounts"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, nullable=False, index=True)
    email = Column(String(150), unique=True, nullable=True, index=True)
    password = Column(String(120), nullable=False, default="")
    password_hash = Column(String(256), nullable=True)
    full_name = Column(String(120), nullable=False, default="Sistem Yöneticisi")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(140), unique=True, nullable=False, index=True)
    account_type = Column(String(20), nullable=False, index=True)  # "admin" | "user"
    admin_id = Column(Integer, nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    role = Column(String(20), nullable=False, index=True)  # "admin" | "trainer" | "member"
    auth_provider = Column(String(30), nullable=False, default="password")  # "password" | "google"
    created_at = Column(String(40), nullable=False, default=_now_iso)
    expires_at = Column(String(40), nullable=False)
    is_revoked = Column(Boolean, nullable=False, default=False)


class GoogleOAuthState(Base):
    __tablename__ = "google_oauth_states"

    id = Column(Integer, primary_key=True, index=True)
    state = Column(String(120), unique=True, nullable=False, index=True)
    code = Column(String(120), unique=True, nullable=True, index=True)
    session_token = Column(String(140), nullable=True)
    redirect_uri = Column(String(600), nullable=True)
    email = Column(String(150), nullable=True)
    full_name = Column(String(140), nullable=True)
    google_sub = Column(String(150), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(String(40), nullable=False, default=_now_iso)
    expires_at = Column(String(40), nullable=False)


class PanelSetting(Base):
    __tablename__ = "panel_settings"

    id = Column(Integer, primary_key=True, index=True)
    admin_panel_enabled = Column(Boolean, nullable=False, default=True)
    trainer_panel_enabled = Column(Boolean, nullable=False, default=True)
    member_panel_enabled = Column(Boolean, nullable=False, default=True)
    default_landing_panel = Column(String(20), nullable=False, default="admin")
    allow_google_login = Column(Boolean, nullable=False, default=True)
    allow_member_booking = Column(Boolean, nullable=False, default=True)
    allow_package_purchase = Column(Boolean, nullable=False, default=True)
    studio_banner_enabled = Column(Boolean, nullable=False, default=True)
    studio_banner_title = Column(
        String(200),
        nullable=False,
        default="ERYA Pilates & Reformer — Yeni Dönem Kayıtları Aktif",
    )
    studio_banner_message = Column(
        Text,
        nullable=False,
        default="Kadınlara özel butik Reformer & Cadillac seanslarımız için güncel ders programı yayındadır.",
    )
    updated_at = Column(String(40), nullable=False, default=_now_iso)


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


def run_sqlite_schema_migrations(db_engine: Engine) -> None:
    """
    Idempotently creates missing tables (including daily_wellness) and adds new columns
    (including users.body_zones, users.referral_code, users.referral_count) on both
    SQLite and PostgreSQL without disturbing existing data.
    """
    Base.metadata.create_all(bind=db_engine)

    is_postgres = db_engine.dialect.name.startswith("postgres")
    bool_false_default = "FALSE" if is_postgres else "0"

    column_migrations = [
        ("users", "email", "VARCHAR(150)"),
        ("users", "body_zones", "TEXT"),
        ("users", "referral_code", "VARCHAR(40)"),
        ("users", "referral_count", "INTEGER NOT NULL DEFAULT 0"),
        ("announcements", "is_pinned", f"BOOLEAN NOT NULL DEFAULT {bool_false_default}"),
        ("admin_accounts", "email", "VARCHAR(150)"),
        ("admin_accounts", "password_hash", "VARCHAR(256)"),
    ]

    inspector = inspect(db_engine)
    existing_tables = set(inspector.get_table_names())

    with db_engine.begin() as conn:
        for table_name, col_name, col_ddl in column_migrations:
            if table_name not in existing_tables:
                continue
            cols = {col["name"] for col in inspector.get_columns(table_name)}
            if col_name not in cols:
                conn.execute(
                    text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_ddl}")
                )
