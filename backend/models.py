from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    phone = Column(String(30), nullable=False)
    role = Column(String(20), nullable=False, index=True)  # 'member' | 'trainer'
    instagram_handle = Column(String(80), nullable=True, index=True)
    notes = Column(Text, nullable=True, default="")

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
