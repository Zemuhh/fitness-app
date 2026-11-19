from datetime import date, timedelta
from sqlalchemy.orm import Session

from models import Booking, ClassSession, MemberPackage, User


def seed_initial_data(db: Session) -> None:
    """Veritabanı boşsa ilk çalıştırmada örnek eğitmen, müşteri, paket, ders ve kayıtları ekler."""
    if db.query(User).count() > 0:
        return

    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)

    today_str = today.strftime("%Y-%m-%d")
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")
    day_after_str = day_after.strftime("%Y-%m-%d")

    # 1. Eğitmenler (2 Eğitmen)
    burak = User(
        full_name="Burak Hoca",
        phone="0532 100 10 01",
        role="trainer",
        instagram_handle="@burakhoca",
        notes="PT & Fonksiyonel Antrenman Baş Eğitmeni",
    )
    selin = User(
        full_name="Selin Hoca",
        phone="0532 100 20 02",
        role="trainer",
        instagram_handle="@selinhoca",
        notes="Klinik & Reformer Pilates Eğitmeni",
    )

    # 2. Müşteriler (4 Müşteri - sakatlık ve seviye notlarıyla)
    ahmet = User(
        full_name="Ahmet Yılmaz",
        phone="0533 210 34 11",
        role="member",
        instagram_handle="@ahmetyilmaz",
        notes="Sol diz menisküs hassasiyeti var, derin squat ve sıçrama hareketlerinden kaçınılmalı.",
    )
    zeynep = User(
        full_name="Zeynep Kaya",
        phone="0535 442 18 22",
        role="member",
        instagram_handle="@zeynepkaya",
        notes="Bel fıtığı başlangıcı (L4-L5), core stabilizasyon odaklı çalışılıyor.",
    )
    mert = User(
        full_name="Mert Demir",
        phone="0542 819 60 33",
        role="member",
        instagram_handle="@mertdemir",
        notes="Sağ omuz impingement geçmişi var, baş üstü press açısına dikkat edilmeli.",
    )
    elif_member = User(
        full_name="Elif Şahin",
        phone="0505 731 92 44",
        role="member",
        instagram_handle="@elifsahin",
        notes="Başlangıç seviyesi, postür analizi yapıldı; mobilite ağırlıklı ilerliyor.",
    )

    db.add_all([burak, selin, ahmet, zeynep, mert, elif_member])
    db.flush()

    # 3. Aktif Müşteri Paketleri
    pkg_ahmet = MemberPackage(
        member_id=ahmet.id,
        package_name="10'lu PT & Grup Karma Paket",
        total_credits=10,
        remaining_credits=7,
        expiry_date=(today + timedelta(days=45)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_zeynep = MemberPackage(
        member_id=zeynep.id,
        package_name="12'li Reformer Pilates Paketi",
        total_credits=12,
        remaining_credits=2,  # Paket bitiyor uyarısını göstermek için 2 kredi
        expiry_date=(today + timedelta(days=20)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_mert = MemberPackage(
        member_id=mert.id,
        package_name="8'li Fonksiyonel Grup Paketi",
        total_credits=8,
        remaining_credits=5,
        expiry_date=(today + timedelta(days=30)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_elif = MemberPackage(
        member_id=elif_member.id,
        package_name="10'lu Stüdyo Grup Paketi",
        total_credits=10,
        remaining_credits=1,  # Paket bitiyor uyarısını göstermek için 1 kredi
        expiry_date=(today + timedelta(days=14)).strftime("%Y-%m-%d"),
        is_active=True,
    )

    db.add_all([pkg_ahmet, pkg_zeynep, pkg_mert, pkg_elif])
    db.flush()

    # 4. Ders Seansları (Bugün, Yarın ve Ertesi Gün)
    s1_today_pt = ClassSession(
        trainer_id=burak.id,
        title="Birebir PT",
        date=today_str,
        start_time="18:00",
        end_time="19:00",
        capacity=1,
        current_enrolled=1,
    )
    s2_today_group = ClassSession(
        trainer_id=burak.id,
        title="Fonksiyonel Grup",
        date=today_str,
        start_time="19:00",
        end_time="20:00",
        capacity=4,
        current_enrolled=3,
    )
    s3_today_pilates = ClassSession(
        trainer_id=selin.id,
        title="Reformer Pilates (Birebir)",
        date=today_str,
        start_time="20:00",
        end_time="21:00",
        capacity=1,
        current_enrolled=1,
    )
    s4_tomorrow_pilates_full = ClassSession(
        trainer_id=selin.id,
        title="Reformer Pilates Grup",
        date=tomorrow_str,
        start_time="11:00",
        end_time="12:00",
        capacity=4,
        current_enrolled=4,  # 4/4 Dolu rozeti senaryosu için
    )
    s5_tomorrow_group = ClassSession(
        trainer_id=burak.id,
        title="Fonksiyonel Grup",
        date=tomorrow_str,
        start_time="19:00",
        end_time="20:00",
        capacity=4,
        current_enrolled=2,  # 2/4 Dolu + Instagram DM "Yarın 19:00 grup dersi" senaryosu için açık
    )
    s6_day_after_pilates = ClassSession(
        trainer_id=selin.id,
        title="Core & Mobilite Pilates",
        date=day_after_str,
        start_time="18:30",
        end_time="19:30",
        capacity=4,
        current_enrolled=1,
    )

    db.add_all([
        s1_today_pt,
        s2_today_group,
        s3_today_pilates,
        s4_tomorrow_pilates_full,
        s5_tomorrow_group,
        s6_day_after_pilates,
    ])
    db.flush()

    # 5. Örnek Ders Kayıtları (Bookings)
    bookings = [
        # s1: Bugün 18:00 Birebir PT (Burak Hoca) -> Mert (1/1)
        Booking(session_id=s1_today_pt.id, member_id=mert.id, package_id=pkg_mert.id, status="booked"),
        # s2: Bugün 19:00 Fonksiyonel Grup (Burak Hoca) -> Zeynep, Mert, Elif (3/4)
        Booking(session_id=s2_today_group.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="booked"),
        Booking(session_id=s2_today_group.id, member_id=mert.id, package_id=pkg_mert.id, status="booked"),
        Booking(session_id=s2_today_group.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        # s3: Bugün 20:00 Reformer Pilates Birebir (Selin Hoca) -> Ahmet (1/1)
        Booking(session_id=s3_today_pilates.id, member_id=ahmet.id, package_id=pkg_ahmet.id, status="booked"),
        # s4: Yarın 11:00 Reformer Pilates Grup (Selin Hoca) -> Ahmet, Zeynep, Mert, Elif (4/4 Dolu)
        Booking(session_id=s4_tomorrow_pilates_full.id, member_id=ahmet.id, package_id=pkg_ahmet.id, status="booked"),
        Booking(session_id=s4_tomorrow_pilates_full.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="booked"),
        Booking(session_id=s4_tomorrow_pilates_full.id, member_id=mert.id, package_id=pkg_mert.id, status="booked"),
        Booking(session_id=s4_tomorrow_pilates_full.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        # s5: Yarın 19:00 Fonksiyonel Grup (Burak Hoca) -> Zeynep, Elif (2/4)
        Booking(session_id=s5_tomorrow_group.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="booked"),
        Booking(session_id=s5_tomorrow_group.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        # s6: +2 Gün 18:30 Core & Mobilite Pilates (Selin Hoca) -> Zeynep (1/4)
        Booking(session_id=s6_day_after_pilates.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="booked"),
    ]

    db.add_all(bookings)
    db.commit()
