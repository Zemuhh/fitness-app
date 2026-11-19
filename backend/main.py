from contextlib import asynccontextmanager
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload

import auth_admin_models  # noqa: F401
import payment_models  # noqa: F401
from auth_admin_router import ensure_portal_initialized, router as portal_router
from database import Base, SessionLocal, engine, get_db
from instagram_service import process_instagram_dm
from models import Booking, ClassSession, MemberPackage, User
from payment_router import ensure_payment_catalog_seeded, router as payment_router
from schemas import (
    AttendanceUpdateRequest,
    AttendeeOut,
    AvailableSessionOut,
    BookingActionResponse,
    BookingCancelRequest,
    BookingCreateRequest,
    InstagramWebhookRequest,
    InstagramWebhookResponse,
    MemberBookingItemOut,
    MemberDashboardOut,
    MemberNotesUpdateRequest,
    PackageOut,
    TrainerScheduleOut,
    TrainerSessionOut,
    UserOut,
)
from seed import seed_initial_data

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
        ensure_portal_initialized(db)
        ensure_payment_catalog_seeded(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Fitness Randevu & Stüdyo Yönetim API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portal_router)
app.include_router(payment_router)


def get_active_package_for_member(db: Session, member_id: int) -> Optional[MemberPackage]:
    return (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id, MemberPackage.is_active == True)
        .order_by(MemberPackage.id.desc())
        .first()
    )


def create_booking_internal(db: Session, member_id: int, session_id: int) -> BookingActionResponse:
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    session_obj = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Ders seansı bulunamadı.")

    existing_active = (
        db.query(Booking)
        .filter(
            Booking.session_id == session_id,
            Booking.member_id == member_id,
            Booking.status.in_(["booked", "attended"]),
        )
        .first()
    )
    if existing_active:
        raise HTTPException(status_code=400, detail="Bu derse zaten aktif bir kaydınız bulunuyor.")

    if session_obj.current_enrolled >= session_obj.capacity:
        raise HTTPException(status_code=400, detail="Bu dersin kontenjanı dolmuştur.")

    package = get_active_package_for_member(db, member_id)
    if not package:
        raise HTTPException(status_code=400, detail="Aktif bir üyelik paketiniz bulunmuyor.")

    if package.remaining_credits <= 0:
        raise HTTPException(status_code=400, detail="Paketinizde kalan ders kredisi bulunmuyor.")

    cancelled_booking = (
        db.query(Booking)
        .filter(
            Booking.session_id == session_id,
            Booking.member_id == member_id,
            Booking.status == "cancelled",
        )
        .first()
    )

    if cancelled_booking:
        cancelled_booking.status = "booked"
        cancelled_booking.package_id = package.id
        booking = cancelled_booking
    else:
        booking = Booking(
            session_id=session_id,
            member_id=member_id,
            package_id=package.id,
            status="booked",
        )
        db.add(booking)

    package.remaining_credits -= 1
    session_obj.current_enrolled += 1

    db.commit()
    db.refresh(booking)
    db.refresh(package)
    db.refresh(session_obj)

    return BookingActionResponse(
        message="Derse kaydınız başarıyla oluşturuldu.",
        booking_id=booking.id,
        status=booking.status,
        remaining_credits=package.remaining_credits,
        session_id=session_obj.id,
        current_enrolled=session_obj.current_enrolled,
        capacity=session_obj.capacity,
    )


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "FitnessSystem Backend"}


@app.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.role.asc(), User.id.asc()).all()
    return users


@app.get("/member/{member_id}/dashboard", response_model=MemberDashboardOut)
def get_member_dashboard(member_id: int, db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == member_id, User.role == "member").first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    active_package = get_active_package_for_member(db, member_id)

    member_bookings_q = (
        db.query(Booking)
        .options(joinedload(Booking.session).joinedload(ClassSession.trainer))
        .filter(Booking.member_id == member_id, Booking.status != "cancelled")
        .all()
    )

    member_bookings_sorted = sorted(
        member_bookings_q,
        key=lambda b: (b.session.date, b.session.start_time),
    )

    my_bookings: List[MemberBookingItemOut] = []
    booked_session_map = {}
    for b in member_bookings_sorted:
        s = b.session
        booked_session_map[s.id] = b.id
        my_bookings.append(
            MemberBookingItemOut(
                booking_id=b.id,
                session_id=s.id,
                status=b.status,
                title=s.title,
                date=s.date,
                start_time=s.start_time,
                end_time=s.end_time,
                trainer_id=s.trainer_id,
                trainer_name=s.trainer.full_name if s.trainer else "Eğitmen",
                capacity=s.capacity,
                current_enrolled=s.current_enrolled,
            )
        )

    all_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    available_sessions: List[AvailableSessionOut] = []
    for s in all_sessions:
        remaining_spots = max(0, s.capacity - s.current_enrolled)
        b_id = booked_session_map.get(s.id)
        available_sessions.append(
            AvailableSessionOut(
                id=s.id,
                trainer_id=s.trainer_id,
                trainer_name=s.trainer.full_name if s.trainer else "Eğitmen",
                title=s.title,
                date=s.date,
                start_time=s.start_time,
                end_time=s.end_time,
                capacity=s.capacity,
                current_enrolled=s.current_enrolled,
                remaining_spots=remaining_spots,
                is_full=remaining_spots == 0,
                is_booked_by_member=b_id is not None,
                booking_id=b_id,
            )
        )

    return MemberDashboardOut(
        member=UserOut.model_validate(member),
        active_package=PackageOut.model_validate(active_package) if active_package else None,
        my_bookings=my_bookings,
        available_sessions=available_sessions,
    )


@app.post("/bookings/create", response_model=BookingActionResponse)
def create_booking(payload: BookingCreateRequest, db: Session = Depends(get_db)):
    return create_booking_internal(db, payload.member_id, payload.session_id)


@app.post("/bookings/cancel", response_model=BookingActionResponse)
def cancel_booking(payload: BookingCancelRequest, db: Session = Depends(get_db)):
    booking = None
    if payload.booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    elif payload.member_id is not None and payload.session_id is not None:
        booking = (
            db.query(Booking)
            .filter(
                Booking.member_id == payload.member_id,
                Booking.session_id == payload.session_id,
                Booking.status == "booked",
            )
            .first()
        )

    if not booking:
        raise HTTPException(status_code=404, detail="İptal edilecek randevu bulunamadı.")

    if booking.status == "cancelled":
        raise HTTPException(status_code=400, detail="Bu randevu zaten iptal edilmiş.")

    if booking.status in ("attended", "no_show"):
        raise HTTPException(status_code=400, detail="Yoklaması tamamlanmış ders iptal edilemez.")

    session_obj = db.query(ClassSession).filter(ClassSession.id == booking.session_id).first()
    package = db.query(MemberPackage).filter(MemberPackage.id == booking.package_id).first()
    if not package:
        package = get_active_package_for_member(db, booking.member_id)

    booking.status = "cancelled"
    if session_obj:
        session_obj.current_enrolled = max(0, session_obj.current_enrolled - 1)
    if package:
        package.remaining_credits += 1

    db.commit()
    db.refresh(booking)
    if package:
        db.refresh(package)
    if session_obj:
        db.refresh(session_obj)

    return BookingActionResponse(
        message="Randevunuz iptal edildi ve 1 ders krediniz paketinize iade edildi.",
        booking_id=booking.id,
        status=booking.status,
        remaining_credits=package.remaining_credits if package else 0,
        session_id=session_obj.id if session_obj else booking.session_id,
        current_enrolled=session_obj.current_enrolled if session_obj else 0,
        capacity=session_obj.capacity if session_obj else 0,
    )


@app.get("/trainer/{trainer_id}/schedule", response_model=TrainerScheduleOut)
def get_trainer_schedule(
    trainer_id: int,
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD tarih filtresi (opsiyonel)"),
    db: Session = Depends(get_db),
):
    trainer = db.query(User).filter(User.id == trainer_id, User.role == "trainer").first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Eğitmen bulunamadı.")

    all_trainer_dates_rows = (
        db.query(ClassSession.date)
        .filter(ClassSession.trainer_id == trainer_id)
        .distinct()
        .order_by(ClassSession.date.asc())
        .all()
    )
    available_dates = [r[0] for r in all_trainer_dates_rows]

    query = (
        db.query(ClassSession)
        .options(
            joinedload(ClassSession.bookings).joinedload(Booking.member),
            joinedload(ClassSession.bookings).joinedload(Booking.package),
        )
        .filter(ClassSession.trainer_id == trainer_id)
    )
    if date:
        query = query.filter(ClassSession.date == date)

    sessions = query.order_by(ClassSession.date.asc(), ClassSession.start_time.asc()).all()

    session_items: List[TrainerSessionOut] = []
    for s in sessions:
        attendees: List[AttendeeOut] = []
        active_bookings = [b for b in s.bookings if b.status != "cancelled"]
        active_bookings.sort(key=lambda b: b.id)

        for b in active_bookings:
            m = b.member
            pkg = b.package or get_active_package_for_member(db, b.member_id)
            rem = pkg.remaining_credits if pkg else 0
            tot = pkg.total_credits if pkg else 0
            attendees.append(
                AttendeeOut(
                    booking_id=b.id,
                    member_id=m.id,
                    full_name=m.full_name,
                    phone=m.phone,
                    instagram_handle=m.instagram_handle,
                    notes=m.notes or "",
                    package_name=pkg.package_name if pkg else None,
                    remaining_credits=rem,
                    total_credits=tot,
                    low_credit_warning=(rem <= 2),
                    status=b.status,
                )
            )

        session_items.append(
            TrainerSessionOut(
                id=s.id,
                trainer_id=trainer.id,
                trainer_name=trainer.full_name,
                title=s.title,
                date=s.date,
                start_time=s.start_time,
                end_time=s.end_time,
                capacity=s.capacity,
                current_enrolled=s.current_enrolled,
                attendees=attendees,
            )
        )

    return TrainerScheduleOut(
        trainer=UserOut.model_validate(trainer),
        available_dates=available_dates,
        sessions=session_items,
    )


@app.post("/trainer/attendance")
def update_attendance(payload: AttendanceUpdateRequest, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı.")

    if booking.status == "cancelled":
        raise HTTPException(status_code=400, detail="İptal edilmiş kayda yoklama girilemez.")

    booking.status = payload.status
    db.commit()
    db.refresh(booking)

    return {
        "message": "Yoklama durumu güncellendi.",
        "booking_id": booking.id,
        "status": booking.status,
    }


@app.put("/trainer/member/{member_id}/notes", response_model=UserOut)
def update_member_notes_by_id(
    member_id: int,
    payload: MemberNotesUpdateRequest,
    db: Session = Depends(get_db),
):
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    member.notes = payload.notes.strip()
    db.commit()
    db.refresh(member)
    return UserOut.model_validate(member)


@app.post("/trainer/notes", response_model=UserOut)
def update_member_notes_post(
    payload: MemberNotesUpdateRequest,
    db: Session = Depends(get_db),
):
    if payload.member_id is None:
        raise HTTPException(status_code=400, detail="member_id zorunludur.")

    member = db.query(User).filter(User.id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    member.notes = payload.notes.strip()
    db.commit()
    db.refresh(member)
    return UserOut.model_validate(member)


@app.post("/instagram/webhook", response_model=InstagramWebhookResponse)
def instagram_webhook(
    payload: InstagramWebhookRequest,
    db: Session = Depends(get_db),
):
    result = process_instagram_dm(db, payload.instagram_handle, payload.message)
    return InstagramWebhookResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
