from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str
    role: str
    instagram_handle: Optional[str] = None
    notes: Optional[str] = ""


class PackageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    package_name: str
    total_credits: int
    remaining_credits: int
    expiry_date: str
    is_active: bool


class MemberBookingItemOut(BaseModel):
    booking_id: int
    session_id: int
    status: str
    title: str
    date: str
    start_time: str
    end_time: str
    trainer_id: int
    trainer_name: str
    capacity: int
    current_enrolled: int


class AvailableSessionOut(BaseModel):
    id: int
    trainer_id: int
    trainer_name: str
    title: str
    date: str
    start_time: str
    end_time: str
    capacity: int
    current_enrolled: int
    remaining_spots: int
    is_full: bool
    is_booked_by_member: bool
    booking_id: Optional[int] = None


class MemberDashboardOut(BaseModel):
    member: UserOut
    active_package: Optional[PackageOut] = None
    my_bookings: List[MemberBookingItemOut]
    available_sessions: List[AvailableSessionOut]


class BookingCreateRequest(BaseModel):
    member_id: int
    session_id: int


class BookingCancelRequest(BaseModel):
    booking_id: Optional[int] = None
    member_id: Optional[int] = None
    session_id: Optional[int] = None


class BookingActionResponse(BaseModel):
    message: str
    booking_id: int
    status: str
    remaining_credits: int
    session_id: int
    current_enrolled: int
    capacity: int


class AttendeeOut(BaseModel):
    booking_id: int
    member_id: int
    full_name: str
    phone: str
    instagram_handle: Optional[str] = None
    notes: Optional[str] = ""
    package_name: Optional[str] = None
    remaining_credits: int
    total_credits: int
    low_credit_warning: bool
    status: str


class TrainerSessionOut(BaseModel):
    id: int
    trainer_id: int
    trainer_name: str
    title: str
    date: str
    start_time: str
    end_time: str
    capacity: int
    current_enrolled: int
    attendees: List[AttendeeOut]


class TrainerScheduleOut(BaseModel):
    trainer: UserOut
    available_dates: List[str]
    sessions: List[TrainerSessionOut]


class AttendanceUpdateRequest(BaseModel):
    booking_id: int
    status: Literal["booked", "attended", "no_show"]


class MemberNotesUpdateRequest(BaseModel):
    member_id: Optional[int] = None
    notes: str


class InstagramWebhookRequest(BaseModel):
    instagram_handle: str
    message: str


class InstagramWebhookResponse(BaseModel):
    reply: str
    action: Optional[str] = None
    member_name: Optional[str] = None
    session_id: Optional[int] = None
    booking_id: Optional[int] = None
    remaining_credits: Optional[int] = None
