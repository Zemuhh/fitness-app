from typing import List
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(150), nullable=True, index=True)
    phone = Column(String(30), nullable=False)
    role = Column(String(20), nullable=False, index=True)  # 'member' | 'trainer'
    instagram_handle = Column(String(80), nullable=True, index=True)
    notes = Column(Text, nullable=True, default="")

    # Ticari Kulüp Genişletme Alanları
    avatar_url = Column(String(500), nullable=True)
    specialty = Column(String(200), nullable=True)
    bio = Column(Text, nullable=True)
    rating = Column(Float, nullable=True, default=4.9)
    experience_years = Column(Integer, nullable=True, default=5)
    streak_days = Column(Integer, nullable=False, default=0)

    # Bildirim Tercihleri
    notify_reminders = Column(Boolean, nullable=False, default=True)
    notify_waitlist = Column(Boolean, nullable=False, default=True)
    notify_campaigns = Column(Boolean, nullable=False, default=False)

    packages = relationship(
        "MemberPackage",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    trained_sessions = relationship(
        "ClassSession",
        back_populates="trainer",
        cascade="all, delete-orphan",
    )
    bookings = relationship(
        "Booking",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    body_metrics = relationship(
        "BodyMetrics",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    waitlist_entries = relationship(
        "Waitlist",
        back_populates="member",
        cascade="all, delete-orphan",
    )

    @property
    def certificates(self) -> List[str]:
        if self.role != "trainer":
            return []
        raw_bio = self.bio or ""
        for line in raw_bio.splitlines():
            stripped = line.strip()
            if stripped.lower().startswith("sertifikalar:"):
                cert_part = stripped.split(":", 1)[1].strip()
                items = [c.strip() for c in cert_part.split("|") if c.strip()]
                if items:
                    return items
        if self.specialty:
            return [f"{self.specialty} Uzmanlık Sertifikası", "Kidemli Antrenör Lisansı"]
        return ["Profesyonel Spor Eğitmenliği Sertifikası"]


class MemberPackage(Base):
    __tablename__ = "member_packages"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    package_name = Column(String(150), nullable=False)
    total_credits = Column(Integer, nullable=False)
    remaining_credits = Column(Integer, nullable=False)
    expiry_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    is_active = Column(Boolean, default=True, nullable=False)

    member = relationship("User", back_populates="packages")
    bookings = relationship("Booking", back_populates="package")


class ClassSession(Base):
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    category = Column(String(60), nullable=False, default="Fonksiyonel")  # 'Birebir PT' | 'Reformer' | 'Fonksiyonel' | 'Boks'
    room = Column(String(80), nullable=True, default="Ana Stüdyo")
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    start_time = Column(String(10), nullable=False)  # HH:MM
    end_time = Column(String(10), nullable=False)  # HH:MM
    capacity = Column(Integer, nullable=False)
    current_enrolled = Column(Integer, default=0, nullable=False)

    trainer = relationship("User", back_populates="trained_sessions")
    bookings = relationship(
        "Booking",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    waitlist_entries = relationship(
        "Waitlist",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    package_id = Column(Integer, ForeignKey("member_packages.id"), nullable=False)
    status = Column(String(20), default="booked", nullable=False)  # 'booked' | 'attended' | 'cancelled' | 'no_show'

    session = relationship("ClassSession", back_populates="bookings")
    member = relationship("User", back_populates="bookings")
    package = relationship("MemberPackage", back_populates="bookings")


class BodyMetrics(Base):
    __tablename__ = "body_metrics"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    weight_kg = Column(Float, nullable=False)
    body_fat_pct = Column(Float, nullable=False)
    muscle_mass_kg = Column(Float, nullable=False)
    trainer_comment = Column(Text, nullable=True, default="")

    member = relationship("User", back_populates="body_metrics")


class Waitlist(Base):
    __tablename__ = "waitlist"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(String(40), nullable=False)  # YYYY-MM-DD HH:MM:SS

    session = relationship("ClassSession", back_populates="waitlist_entries")
    member = relationship("User", back_populates="waitlist_entries")


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), nullable=False)
    content = Column(Text, nullable=False)
    tag = Column(String(60), nullable=False)  # 'Kulüp Haberleri' | 'Kurallar & Bilgilendirme' | 'Kampanyalar'
    date = Column(String(20), nullable=False)  # YYYY-MM-DD
    is_pinned = Column(Boolean, default=False, nullable=False)
