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
    is_revoked = Column(Boolean, nullable=False, default=False, index=True)


class GoogleOAuthState(Base):
    __tablename__ = "google_oauth_states"

    id = Column(Integer, primary_key=True, index=True)
    state = Column(String(120), unique=True, nullable=False, index=True)
    code = Column(String(120), unique=True, nullable=True, index=True)
    session_token = Column(String(140), nullable=True)
    redirect_uri = Column(String(600), nullable=True)
    email = Column(String(150), nullable=True, index=True)
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
        ("users", "policy_accepted", f"BOOLEAN NOT NULL DEFAULT {bool_false_default}"),
        ("users", "policy_accepted_at", "VARCHAR(40)"),
        ("users", "policy_version", "VARCHAR(20) NOT NULL DEFAULT 'v1.0'"),
        ("users", "policy_file_path", "VARCHAR(260)"),
        ("users", "last_login_at", "VARCHAR(40)"),
        ("users", "login_count", "INTEGER NOT NULL DEFAULT 0"),
        ("class_sessions", "started_at", "VARCHAR(40)"),
        ("class_sessions", "ended_at", "VARCHAR(40)"),
        ("class_sessions", "actual_duration_minutes", "INTEGER"),
        ("class_sessions", "session_status", "VARCHAR(30) NOT NULL DEFAULT 'scheduled'"),
        ("bookings", "checked_in_at", "VARCHAR(40)"),
        ("announcements", "is_pinned", f"BOOLEAN NOT NULL DEFAULT {bool_false_default}"),
        ("admin_accounts", "email", "VARCHAR(150)"),
        ("admin_accounts", "password_hash", "VARCHAR(256)"),
        ("member_packages", "package_month", "VARCHAR(20)"),
        ("member_packages", "package_notes", "TEXT DEFAULT ''"),
        ("member_packages", "created_at", "VARCHAR(40)"),
    ]

    inspector = inspect(db_engine)
    existing_tables = set(inspector.get_table_names())

    index_migrations = [
        ("ix_users_email", "users", ("email",)),
        ("ix_users_role", "users", ("role",)),
        ("ix_users_instagram_handle", "users", ("instagram_handle",)),
        ("ix_users_referral_code", "users", ("referral_code",)),
        ("ix_member_packages_member_id", "member_packages", ("member_id",)),
        ("ix_member_packages_is_active", "member_packages", ("is_active",)),
        ("ix_member_packages_member_active", "member_packages", ("member_id", "is_active")),
        ("idx_member_packages_package_month", "member_packages", ("package_month",)),
        ("ix_class_sessions_trainer_id", "class_sessions", ("trainer_id",)),
        ("ix_class_sessions_date", "class_sessions", ("date",)),
        ("ix_class_sessions_session_status", "class_sessions", ("session_status",)),
        ("ix_class_sessions_date_start", "class_sessions", ("date", "start_time")),
        ("ix_bookings_session_id", "bookings", ("session_id",)),
        ("ix_bookings_member_id", "bookings", ("member_id",)),
        ("ix_bookings_package_id", "bookings", ("package_id",)),
        ("ix_bookings_status", "bookings", ("status",)),
        ("ix_bookings_member_status", "bookings", ("member_id", "status")),
        ("ix_bookings_session_status", "bookings", ("session_id", "status")),
        ("ix_body_metrics_member_id", "body_metrics", ("member_id",)),
        ("ix_body_metrics_date", "body_metrics", ("date",)),
        ("ix_body_metrics_member_date", "body_metrics", ("member_id", "date")),
        ("ix_waitlist_session_id", "waitlist", ("session_id",)),
        ("ix_waitlist_member_id", "waitlist", ("member_id",)),
        ("ix_announcements_date", "announcements", ("date",)),
        ("ix_announcements_is_pinned", "announcements", ("is_pinned",)),
        ("ix_daily_wellness_member_id", "daily_wellness", ("member_id",)),
        ("ix_daily_wellness_date", "daily_wellness", ("date",)),
        ("ix_daily_wellness_member_date", "daily_wellness", ("member_id", "date")),
        ("ix_nutrition_meal_logs_member_id", "nutrition_meal_logs", ("member_id",)),
        ("ix_nutrition_meal_logs_date", "nutrition_meal_logs", ("date",)),
        ("ix_nutrition_meal_logs_member_date", "nutrition_meal_logs", ("member_id", "date")),
        ("ix_admin_accounts_email", "admin_accounts", ("email",)),
        ("ix_auth_sessions_user_id", "auth_sessions", ("user_id",)),
        ("ix_auth_sessions_is_revoked", "auth_sessions", ("is_revoked",)),
        ("ix_google_oauth_states_email", "google_oauth_states", ("email",)),
        ("ix_package_catalog_plans_is_active", "package_catalog_plans", ("is_active",)),
        ("ix_payment_transactions_member_id", "payment_transactions", ("member_id",)),
        ("ix_payment_transactions_plan_id", "payment_transactions", ("plan_id",)),
        ("ix_payment_transactions_member_package_id", "payment_transactions", ("member_package_id",)),
        ("ix_payment_transactions_status", "payment_transactions", ("status",)),
        ("ix_payment_checkout_sessions_session_id", "payment_checkout_sessions", ("session_id",)),
        ("ix_payment_checkout_sessions_member_id", "payment_checkout_sessions", ("member_id",)),
        ("ix_payment_checkout_sessions_plan_id", "payment_checkout_sessions", ("plan_id",)),
        ("ix_payment_checkout_sessions_status", "payment_checkout_sessions", ("status",)),
        ("ix_payment_checkout_sessions_transaction_id", "payment_checkout_sessions", ("transaction_id",)),
        ("ix_payment_checkout_sessions_credited_package_id", "payment_checkout_sessions", ("credited_package_id",)),
    ]

    with db_engine.begin() as conn:
        table_cols_cache = {}
        for table_name, col_name, col_ddl in column_migrations:
            if table_name not in existing_tables:
                continue
            if table_name not in table_cols_cache:
                table_cols_cache[table_name] = {
                    col["name"] for col in inspector.get_columns(table_name)
                }
            if col_name not in table_cols_cache[table_name]:
                conn.execute(
                    text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_ddl}")
                )
                table_cols_cache[table_name].add(col_name)

        for idx_name, table_name, col_names in index_migrations:
            if table_name not in existing_tables:
                continue
            if table_name not in table_cols_cache:
                table_cols_cache[table_name] = {
                    col["name"] for col in inspector.get_columns(table_name)
                }
            if all(c in table_cols_cache[table_name] for c in col_names):
                cols_sql = ", ".join(col_names)
                conn.execute(
                    text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table_name} ({cols_sql})")
                )
