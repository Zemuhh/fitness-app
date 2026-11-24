import importlib.util
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "fitness.db")

raw_database_url = (os.getenv("DATABASE_URL") or "").strip()
if raw_database_url:
    if raw_database_url.startswith("postgres://"):
        raw_database_url = "postgresql://" + raw_database_url[len("postgres://") :]
    SQLALCHEMY_DATABASE_URL = raw_database_url
else:
    if os.path.exists(DEFAULT_SQLITE_PATH):
        SQLALCHEMY_DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"
    else:
        SQLALCHEMY_DATABASE_URL = "sqlite:///./fitness.db"

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    _engine_url = SQLALCHEMY_DATABASE_URL
    if _engine_url.startswith("postgresql://"):
        if (
            importlib.util.find_spec("psycopg2") is not None
            and importlib.util.find_spec("psycopg") is None
        ):
            _engine_url = "postgresql+psycopg2://" + _engine_url[len("postgresql://") :]
    engine = create_engine(
        _engine_url,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
