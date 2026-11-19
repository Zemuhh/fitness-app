from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session

from models import (
    Announcement,
    BodyMetrics,
    Booking,
    ClassSession,
    MemberPackage,
    User,
    Waitlist,
)


def seed_initial_data(db: Session) -> None:
    """Veritabanı boşsa ERYA PİLATES REFORMER başlangıç verilerini yükler ve ek müşteri kayıtlarını tamamlar."""
    if db.query(User).count() > 0:
        seed_additional_customers(db)
        return

    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)

    today_str = today.strftime("%Y-%m-%d")
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")
    day_after_str = day_after.strftime("%Y-%m-%d")

    past_7_str = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    past_4_str = (today - timedelta(days=4)).strftime("%Y-%m-%d")
    past_2_str = (today - timedelta(days=2)).strftime("%Y-%m-%d")

    m3_str = (today - timedelta(days=90)).strftime("%Y-%m-%d")
    m2_str = (today - timedelta(days=60)).strftime("%Y-%m-%d")
    m1_str = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    m0_str = (today - timedelta(days=2)).strftime("%Y-%m-%d")

    # =========================================================================
    # 1. ERYA PİLATES REFORMER EĞİTMEN KADROSU (Kadınlara Özel Butik Stüdyo)
    # =========================================================================
    seher = User(
        full_name="Seher Hoca",
        phone="0551 497 90 09",
        role="trainer",
        instagram_handle="@eryapilatesreformer",
        notes="Klinik Reformer, Skolyoz & Postür Baş Eğitmeni",
        avatar_url="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80",
        specialty="Klinik Reformer & Skolyoz",
        bio=(
            "ERYA Pilates & Reformer baş eğitmeni. Duruş bozukluklarının giderilmesi, skolyoz ve bel-boyun "
            "hassasiyetlerinde omurga hizalaması, derin core aktivasyonu ve kişiye özel Reformer & Cadillac "
            "programlamasında birebir yakın ilgiyle çalışmaktadır.\n"
            "Sertifikalar: Comprehensive Reformer & Cadillac Pilates | Klinik Postür & Skolyoz Biyomekaniği | Omurga Sağlığı Uzmanlığı"
        ),
        rating=5.0,
        experience_years=8,
        streak_days=0,
    )
    selin = User(
        full_name="Selin Hoca",
        phone="0551 497 90 10",
        role="trainer",
        instagram_handle="@eryapilates06",
        notes="Cadillac Tower & Esneklik Pilates Eğitmeni",
        avatar_url="https://images.unsplash.com/photo-1594381898411-846e7d193883?auto=format&fit=crop&w=600&q=80",
        specialty="Cadillac & Trapeze Tower",
        bio=(
            "Cadillac Trapeze Tower, omurga dekompresyonu ve akıcı mobilite serileri uzmanı. Nefes-hareket "
            "uyumuyla esnekliğin artırılması, sıkılaşma ve zarif beden kontrolü odaklı grup ve bireysel seanslar yönetir.\n"
            "Sertifikalar: Balanced Body Cadillac & Tower | Fasya & Akıcı Mobilite Eğitmenliği | Nefes ve Pelvik Taban Kontrolü"
        ),
        rating=4.9,
        experience_years=7,
        streak_days=0,
    )
    ipek = User(
        full_name="İpek Hoca",
        phone="0551 497 90 11",
        role="trainer",
        instagram_handle="@ipekpilates",
        notes="Düet, Trio & Sıkılaşma Reformer Eğitmeni",
        avatar_url="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=600&q=80",
        specialty="Düet & Sıkılaşma Reformer",
        bio=(
            "Dinamik Reformer akışları, alt gövde-kalça şekillendirme (toning), kilo kontrolü ve yüksek enerjili "
            "6-7 kişilik butik grup ile Düet/Trio Reformer derslerinde uzmanlaşmıştır.\n"
            "Sertifikalar: Modern Reformer & Toning Specialist | Prenatal & Postnatal Pilates | Fonksiyonel Core & Denge"
        ),
        rating=4.9,
        experience_years=6,
        streak_days=0,
    )

    # =========================================================================
    # 2. ERYA STÜDYO ÜYELERİ (5 Kadın Üye - Gerçekçi Postür & Hassasiyet Notları)
    # =========================================================================
    zeynep = User(
        full_name="Zeynep Kaya",
        phone="0535 442 18 22",
        role="member",
        instagram_handle="@zeynepkaya",
        notes="L4-L5 bel fıtığı başlangıcı var; aşırı lomber ekstansiyondan kaçınılıp pelvik tilt ve derin core odaklı çalışılmalı.",
        avatar_url="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
        streak_days=6,
        notify_reminders=True,
        notify_waitlist=True,
        notify_campaigns=True,
    )
    elif_member = User(
        full_name="Elif Şahin",
        phone="0505 731 92 44",
        role="member",
        instagram_handle="@elifsahin",
        notes="Masa başı çalışmaya bağlı boyun düzleşmesi ve üst sırt gerginliği; torakal açılma ve omuz kuşağı mobilitesi öncelikli.",
        avatar_url="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=80",
        streak_days=4,
        notify_reminders=True,
        notify_waitlist=True,
        notify_campaigns=False,
    )
    defne = User(
        full_name="Defne Yıldız",
        phone="0533 210 34 11",
        role="member",
        instagram_handle="@defneyildiz",
        notes="Sağ omuz hassasiyeti mevcut; yüksek yay dirençli kol serilerinde orta-hafif yay (sarı/mavi) tercih edilmeli.",
        avatar_url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
        streak_days=5,
        notify_reminders=True,
        notify_waitlist=True,
        notify_campaigns=True,
    )
    merve = User(
        full_name="Merve Arslan",
        phone="0542 819 60 33",
        role="member",
        instagram_handle="@mervearslan",
        notes="Hafif torakal skolyoz (S-eğriliği) takibi yapılıyor; asimetrik uzama ve nefes rotasyonu egzersizleri uygulanıyor.",
        avatar_url="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80",
        streak_days=3,
        notify_reminders=True,
        notify_waitlist=False,
        notify_campaigns=True,
    )
    irem = User(
        full_name="İrem Korkmaz",
        phone="0530 615 48 55",
        role="member",
        instagram_handle="@iremkorkmaz",
        notes="İleri seviye Reformer & Cadillac kontrolü; sıkılaşma ve esneklik odaklı tam seri çalışabiliyor.",
        avatar_url="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80",
        streak_days=7,
        notify_reminders=True,
        notify_waitlist=True,
        notify_campaigns=True,
    )

    db.add_all([seher, selin, ipek, zeynep, elif_member, defne, merve, irem])
    db.flush()

    # =========================================================================
    # 3. ERYA ÜYE PAKETLERİ (8 Seans & 16 Seans Gerçek Stüdyo Kurgusu)
    # =========================================================================
    pkg_zeynep_past = MemberPackage(
        member_id=zeynep.id,
        package_name="8 Seans Başlangıç Reformer Paketi",
        total_credits=8,
        remaining_credits=0,
        expiry_date=(today - timedelta(days=15)).strftime("%Y-%m-%d"),
        is_active=False,
    )
    pkg_zeynep = MemberPackage(
        member_id=zeynep.id,
        package_name="8 Seans Grup Reformer Paketi",
        total_credits=8,
        remaining_credits=6,
        expiry_date=(today + timedelta(days=38)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_elif = MemberPackage(
        member_id=elif_member.id,
        package_name="12 Seans Klinik Reformer & Cadillac",
        total_credits=12,
        remaining_credits=2,  # Paket bitiyor uyarısı (<= 2)
        expiry_date=(today + timedelta(days=18)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_defne = MemberPackage(
        member_id=defne.id,
        package_name="8 Seans Düet Reformer Paketi",
        total_credits=8,
        remaining_credits=5,
        expiry_date=(today + timedelta(days=32)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_merve = MemberPackage(
        member_id=merve.id,
        package_name="8 Seans Skolyoz & Postür Bireysel Paket",
        total_credits=8,
        remaining_credits=1,  # Paket bitiyor uyarısı (<= 2)
        expiry_date=(today + timedelta(days=14)).strftime("%Y-%m-%d"),
        is_active=True,
    )
    pkg_irem = MemberPackage(
        member_id=irem.id,
        package_name="16 Seans VIP Reformer & Cadillac Paketi",
        total_credits=16,
        remaining_credits=12,
        expiry_date=(today + timedelta(days=55)).strftime("%Y-%m-%d"),
        is_active=True,
    )

    db.add_all([pkg_zeynep_past, pkg_zeynep, pkg_elif, pkg_defne, pkg_merve, pkg_irem])
    db.flush()

    # =========================================================================
    # 4. SON 3 AYLIK POSTÜR, SIKILAŞMA & VÜCUT ANALİZİ GEÇMİŞİ
    # =========================================================================
    metrics_data = [
        # Zeynep Kaya
        BodyMetrics(
            member_id=zeynep.id,
            date=m3_str,
            weight_kg=62.4,
            body_fat_pct=26.5,
            muscle_mass_kg=23.1,
            trainer_comment="Postür ve L4-L5 bel stabilizasyon değerlendirmesi tamamlandı. Haftada 2 gün Reformer başlandı.",
        ),
        BodyMetrics(
            member_id=zeynep.id,
            date=m2_str,
            weight_kg=61.2,
            body_fat_pct=25.1,
            muscle_mass_kg=23.6,
            trainer_comment="Bel çevresi hassasiyeti %60 azaldı, pelvik kontrol ve diyafram nefesi çok daha dengeli.",
        ),
        BodyMetrics(
            member_id=zeynep.id,
            date=m1_str,
            weight_kg=60.1,
            body_fat_pct=23.8,
            muscle_mass_kg=24.1,
            trainer_comment="6 haftalık düzenli seri yakalandı! Derin karın kaslarında sıkılaşma ve dik duruş belirginleşti.",
        ),
        BodyMetrics(
            member_id=zeynep.id,
            date=m0_str,
            weight_kg=59.2,
            body_fat_pct=22.1,
            muscle_mass_kg=24.8,
            trainer_comment=(
                "Harika ilerleme Zeynep! Omurga esnekliği, dik duruş ve core dayanıklılığı hedef seviyeye ulaştı. "
                "Haftada 2 Reformer + 1 Cadillac esneme düzenine zarafetle devam edelim."
            ),
        ),
        # Elif Şahin
        BodyMetrics(
            member_id=elif_member.id,
            date=m3_str,
            weight_kg=66.8,
            body_fat_pct=29.4,
            muscle_mass_kg=22.4,
            trainer_comment="Masa başı duruş analizi ve nefes koordinasyonu üzerine adaptasyon programı başlatıldı.",
        ),
        BodyMetrics(
            member_id=elif_member.id,
            date=m2_str,
            weight_kg=65.5,
            body_fat_pct=28.0,
            muscle_mass_kg=22.8,
            trainer_comment="Boyun ve üst sırt gerginliğinde belirgin rahatlama sağlandı.",
        ),
        BodyMetrics(
            member_id=elif_member.id,
            date=m1_str,
            weight_kg=64.4,
            body_fat_pct=26.9,
            muscle_mass_kg=23.2,
            trainer_comment="Grup Reformer derslerine adaptasyon çok güzel, sıkılaşma istikrarlı ilerliyor.",
        ),
        BodyMetrics(
            member_id=elif_member.id,
            date=m0_str,
            weight_kg=63.1,
            body_fat_pct=25.3,
            muscle_mass_kg=23.9,
            trainer_comment="Son 3 ayda -3.7 kg incelme ve omuz hizasında gözle görülür dikleşme! Yeni paketle Cadillac serilerini artıracağız.",
        ),
        # Defne Yıldız
        BodyMetrics(
            member_id=defne.id,
            date=m3_str,
            weight_kg=58.6,
            body_fat_pct=24.2,
            muscle_mass_kg=22.5,
            trainer_comment="Sağ omuz mobilite değerlendirmesi yapıldı, kürek kemiği stabilizasyon serisi eklendi.",
        ),
        BodyMetrics(
            member_id=defne.id,
            date=m1_str,
            weight_kg=57.8,
            body_fat_pct=22.9,
            muscle_mass_kg=23.1,
            trainer_comment="Düet Reformer seanslarıyla alt gövde ve core direncinde net artış yakalandı.",
        ),
        BodyMetrics(
            member_id=defne.id,
            date=m0_str,
            weight_kg=57.2,
            body_fat_pct=21.6,
            muscle_mass_kg=23.7,
            trainer_comment="Omuz açıları tamamen rahatladı, uzun ve zarif kas formu harika ilerliyor!",
        ),
        # Merve Arslan
        BodyMetrics(
            member_id=merve.id,
            date=m2_str,
            weight_kg=61.0,
            body_fat_pct=25.8,
            muscle_mass_kg=22.9,
            trainer_comment="Skolyoz yönlü asimetrik esneme ve omurga uzama protokolü Seher Hoca eşliğinde başlatıldı.",
        ),
        BodyMetrics(
            member_id=merve.id,
            date=m0_str,
            weight_kg=59.9,
            body_fat_pct=24.1,
            muscle_mass_kg=23.6,
            trainer_comment="Omuz-kalça simetrisinde çok güzel dengelenme var, sırt ağrıları minimuma indi.",
        ),
        # İrem Korkmaz
        BodyMetrics(
            member_id=irem.id,
            date=m2_str,
            weight_kg=56.4,
            body_fat_pct=21.2,
            muscle_mass_kg=23.8,
            trainer_comment="İleri seviye Cadillac Trapeze ve kontrol serileriyle tam gövde sıkılaşma planlandı.",
        ),
        BodyMetrics(
            member_id=irem.id,
            date=m0_str,
            weight_kg=55.6,
            body_fat_pct=19.4,
            muscle_mass_kg=24.6,
            trainer_comment="Mükemmel denge, nefes ve kontrol! Stüdyomuzun bu ayki en istikrarlı üyesi.",
        ),
    ]
    db.add_all(metrics_data)
    db.flush()

    # =========================================================================
    # 5. ERYA PİLATES REFORMER STÜDYO DUYURULARI & REHBERİ
    # =========================================================================
    announcements = [
        Announcement(
            title="ERYA Pilates Çalışma Saatleri & Stüdyo Kuralları",
            content=(
                "Kadınlara özel butik stüdyomuz Eryaman Port AVM D:2/2C adresinde her gün 09:00 - 22:00 saatleri "
                "arasında hizmetinizdedir. Hijyen ve ekipman konforumuz gereği tüm Reformer ve Cadillac seanslarında "
                "kaydırmaz tabanlı pilates çorabı ve kişisel havlu kullanımı zorunludur."
            ),
            tag="Kurallar & Bilgilendirme",
            date=today_str,
        ),
        Announcement(
            title="MultiSport Kart Anlaşmamız Aktiftir!",
            content=(
                "ERYA Pilates & Reformer olarak MultiSport anlaşmalı stüdyoyuz! MultiSport kartınızla grup Reformer "
                "seanslarımıza katılabilir, müsait kontenjanlar için uygulama üzerinden veya 0551 497 90 09 WhatsApp "
                "hattımızdan kaydınızı oluşturabilirsiniz."
            ),
            tag="Kampanyalar",
            date=today_str,
        ),
        Announcement(
            title="Rezervasyon & 4 Saat Öncesinden Ücretsiz İptal Kuralı",
            content=(
                "Seans iptallerinizi ders saatine en geç 4 saat kala uygulama üzerinden tek dokunuşla yapabilirsiniz. "
                "Zamanında iptal edilen dersin 1 seans hakkı anında paketinize iade edilir ve yedek sıradaki ilk üyemiz "
                "otomatik olarak derse onaylanır."
            ),
            tag="Kurallar & Bilgilendirme",
            date=(today - timedelta(days=1)).strftime("%Y-%m-%d"),
        ),
        Announcement(
            title="Seher Hoca ile Skolyoz, Postür & Omurga Sağlığı Seansları",
            content=(
                "Duruş bozukluklarının giderilmesi, bel-boyun hassasiyeti ve skolyoz desteğine yönelik bireysel "
                "Reformer & Cadillac değerlendirme seanslarımız için sabah 10:00 ve akşam 18:30 kontenjanlarımız açılmıştır."
            ),
            tag="Kulüp Haberleri",
            date=(today - timedelta(days=2)).strftime("%Y-%m-%d"),
        ),
        Announcement(
            title="8 Seans Grup, Düet ve Trio Reformer Paket Avantajları!",
            content=(
                "Dengeyle güçlenip zarafetle parlamak isteyen üyelerimiz için 6-7 kişilik ferah kemerli aynalı "
                "stüdyomuzda 8 Seans Grup Reformer (3.000 TL), Düet ve Trio paketlerimizde kalan hakları devretme "
                "garantisiyle kayıtlarımız devam ediyor."
            ),
            tag="Kampanyalar",
            date=(today - timedelta(days=3)).strftime("%Y-%m-%d"),
        ),
        Announcement(
            title="Cumartesi 'Nefes, Kontrol & Derin Core' Atölyesi",
            content=(
                "GÜÇ • DENGE • NEFES • KONTROL • ZİHİN felsefemizle bu Cumartesi 14:00'te tüm aktif üyelerimize "
                "özel ücretsiz Diyafram Nefesi ve Pelvik Stabilizasyon mini atölyemize davetlisiniz."
            ),
            tag="Kulüp Haberleri",
            date=(today - timedelta(days=4)).strftime("%Y-%m-%d"),
        ),
    ]
    db.add_all(announcements)
    db.flush()

    # =========================================================================
    # 6. DERS SEANSLARI (Geçmiş 3 Tamamlanmış + Bugün/Yarın/+2 Gün 10 Aktif Seans)
    # =========================================================================
    p1_past_reformer = ClassSession(
        trainer_id=seher.id,
        title="Grup Reformer: Postür & Core",
        category="Grup Reformer",
        room="Kemerli Ayna Reformer Salonu",
        date=past_7_str,
        start_time="19:00",
        end_time="20:00",
        capacity=6,
        current_enrolled=3,
    )
    p2_past_cadillac = ClassSession(
        trainer_id=selin.id,
        title="Cadillac Tower & Omurga Esneme",
        category="Cadillac & Tower",
        room="Cadillac & Trapeze Alanı",
        date=past_4_str,
        start_time="18:30",
        end_time="19:30",
        capacity=4,
        current_enrolled=3,
    )
    p3_past_toning = ClassSession(
        trainer_id=ipek.id,
        title="Reformer Sıkılaşma & Denge Akışı",
        category="Grup Reformer",
        room="Kemerli Ayna Reformer Salonu",
        date=past_2_str,
        start_time="20:00",
        end_time="21:00",
        capacity=6,
        current_enrolled=3,
    )

    # Bugün, Yarın ve +2 Gün Aktif Seanslar
    s1_today_private = ClassSession(
        trainer_id=seher.id,
        title="Bireysel Klinik Reformer & Skolyoz",
        category="Bireysel Reformer",
        room="VIP Özel Reformer Odası",
        date=today_str,
        start_time="17:30",
        end_time="18:30",
        capacity=1,
        current_enrolled=1,
    )
    s2_today_group = ClassSession(
        trainer_id=seher.id,
        title="Akşam Grup Reformer: Dik Duruş & Core",
        category="Grup Reformer",
        room="Kemerli Ayna Reformer Salonu",
        date=today_str,
        start_time="19:00",
        end_time="20:00",
        capacity=6,
        current_enrolled=4,
    )
    s3_today_cadillac = ClassSession(
        trainer_id=selin.id,
        title="Cadillac & Trapeze Tower (Bireysel)",
        category="Cadillac & Tower",
        room="Cadillac & Trapeze Alanı",
        date=today_str,
        start_time="20:00",
        end_time="21:00",
        capacity=1,
        current_enrolled=1,
    )
    # ÖZEL SENARYO 1: 6/6 Dolu ve Zeynep Kaya kayıtlı DEĞİL -> Zeynep'te "Yedek Listeye Yazıl" butonu görünür!
    s4_today_full = ClassSession(
        trainer_id=ipek.id,
        title="Trio Reformer: Sıkılaşma & Kontrol",
        category="Düet & Trio",
        room="Kemerli Ayna Reformer Salonu",
        date=today_str,
        start_time="20:30",
        end_time="21:30",
        capacity=3,
        current_enrolled=3,
    )
    # ÖZEL SENARYO 2: Dolu seans, Zeynep kayıtlı VE yedek listede İrem Korkmaz bekliyor!
    s5_tomorrow_full = ClassSession(
        trainer_id=seher.id,
        title="Sabah Grup Reformer & Nefes",
        category="Grup Reformer",
        room="Kemerli Ayna Reformer Salonu",
        date=tomorrow_str,
        start_time="10:30",
        end_time="11:30",
        capacity=4,
        current_enrolled=4,
    )
    s6_tomorrow_duet = ClassSession(
        trainer_id=ipek.id,
        title="Düet Reformer Pilates",
        category="Düet & Trio",
        room="Kemerli Ayna Reformer Salonu",
        date=tomorrow_str,
        start_time="18:00",
        end_time="19:00",
        capacity=2,
        current_enrolled=1,
    )
    s7_tomorrow_group = ClassSession(
        trainer_id=selin.id,
        title="Grup Reformer: Esneklik & Zarafet",
        category="Grup Reformer",
        room="Kemerli Ayna Reformer Salonu",
        date=tomorrow_str,
        start_time="19:00",
        end_time="20:00",
        capacity=6,
        current_enrolled=3,
    )
    s8_day_after_private_open = ClassSession(
        trainer_id=seher.id,
        title="Bireysel Postür Analizi & Reformer",
        category="Bireysel Reformer",
        room="VIP Özel Reformer Odası",
        date=day_after_str,
        start_time="17:00",
        end_time="18:00",
        capacity=1,
        current_enrolled=0,
    )
    s9_day_after_cadillac = ClassSession(
        trainer_id=selin.id,
        title="Cadillac Tower & Derin Core",
        category="Cadillac & Tower",
        room="Cadillac & Trapeze Alanı",
        date=day_after_str,
        start_time="18:30",
        end_time="19:30",
        capacity=4,
        current_enrolled=2,
    )
    s10_day_after_group = ClassSession(
        trainer_id=ipek.id,
        title="Akşam Grup Reformer: Tüm Beden Sıkılaşma",
        category="Grup Reformer",
        room="Kemerli Ayna Reformer Salonu",
        date=day_after_str,
        start_time="20:00",
        end_time="21:00",
        capacity=6,
        current_enrolled=2,
    )

    all_seeded_sessions = [
        p1_past_reformer,
        p2_past_cadillac,
        p3_past_toning,
        s1_today_private,
        s2_today_group,
        s3_today_cadillac,
        s4_today_full,
        s5_tomorrow_full,
        s6_tomorrow_duet,
        s7_tomorrow_group,
        s8_day_after_private_open,
        s9_day_after_cadillac,
        s10_day_after_group,
    ]
    db.add_all(all_seeded_sessions)
    db.flush()

    # =========================================================================
    # 7. SEANS KAYITLARI (Bookings - %100 Kontenjan Tutarlı)
    # =========================================================================
    bookings = [
        # Geçmiş Tamamlanmış Seanslar (status='attended')
        Booking(session_id=p1_past_reformer.id, member_id=zeynep.id, package_id=pkg_zeynep_past.id, status="attended"),
        Booking(session_id=p1_past_reformer.id, member_id=defne.id, package_id=pkg_defne.id, status="attended"),
        Booking(session_id=p1_past_reformer.id, member_id=irem.id, package_id=pkg_irem.id, status="attended"),

        Booking(session_id=p2_past_cadillac.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="attended"),
        Booking(session_id=p2_past_cadillac.id, member_id=elif_member.id, package_id=pkg_elif.id, status="attended"),
        Booking(session_id=p2_past_cadillac.id, member_id=merve.id, package_id=pkg_merve.id, status="attended"),

        Booking(session_id=p3_past_toning.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="attended"),
        Booking(session_id=p3_past_toning.id, member_id=defne.id, package_id=pkg_defne.id, status="attended"),
        Booking(session_id=p3_past_toning.id, member_id=irem.id, package_id=pkg_irem.id, status="attended"),

        # Aktif / Gelecek Seanslar (status='booked')
        # s1: Bugün 17:30 Bireysel Klinik Reformer (Seher Hoca) -> Merve (1/1)
        Booking(session_id=s1_today_private.id, member_id=merve.id, package_id=pkg_merve.id, status="booked"),
        # s2: Bugün 19:00 Akşam Grup Reformer (Seher Hoca) -> Zeynep, Elif, Defne, İrem (4/6)
        Booking(session_id=s2_today_group.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="booked"),
        Booking(session_id=s2_today_group.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        Booking(session_id=s2_today_group.id, member_id=defne.id, package_id=pkg_defne.id, status="booked"),
        Booking(session_id=s2_today_group.id, member_id=irem.id, package_id=pkg_irem.id, status="booked"),
        # s3: Bugün 20:00 Cadillac & Trapeze Tower Bireysel (Selin Hoca) -> Elif (1/1)
        Booking(session_id=s3_today_cadillac.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        # s4: Bugün 20:30 Trio Reformer (İpek Hoca) -> Elif, Defne, Merve (3/3 DOLU - Zeynep YOK -> Yedek Liste testi!)
        Booking(session_id=s4_today_full.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        Booking(session_id=s4_today_full.id, member_id=defne.id, package_id=pkg_defne.id, status="booked"),
        Booking(session_id=s4_today_full.id, member_id=merve.id, package_id=pkg_merve.id, status="booked"),
        # s5: Yarın 10:30 Sabah Grup Reformer (Seher Hoca) -> Zeynep, Elif, Defne, Merve (4/4 DOLU + İrem Waitlist!)
        Booking(session_id=s5_tomorrow_full.id, member_id=zeynep.id, package_id=pkg_zeynep.id, status="booked"),
        Booking(session_id=s5_tomorrow_full.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        Booking(session_id=s5_tomorrow_full.id, member_id=defne.id, package_id=pkg_defne.id, status="booked"),
        Booking(session_id=s5_tomorrow_full.id, member_id=merve.id, package_id=pkg_merve.id, status="booked"),
        # s6: Yarın 18:00 Düet Reformer (İpek Hoca) -> Defne (1/2)
        Booking(session_id=s6_tomorrow_duet.id, member_id=defne.id, package_id=pkg_defne.id, status="booked"),
        # s7: Yarın 19:00 Grup Reformer (Selin Hoca) -> Elif, Defne, İrem (3/6)
        Booking(session_id=s7_tomorrow_group.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        Booking(session_id=s7_tomorrow_group.id, member_id=defne.id, package_id=pkg_defne.id, status="booked"),
        Booking(session_id=s7_tomorrow_group.id, member_id=irem.id, package_id=pkg_irem.id, status="booked"),
        # s8: +2 Gün 17:00 Bireysel Postür Analizi & Reformer (Seher Hoca) -> Boş (0/1)
        # s9: +2 Gün 18:30 Cadillac Tower & Derin Core (Selin Hoca) -> Elif, İrem (2/4)
        Booking(session_id=s9_day_after_cadillac.id, member_id=elif_member.id, package_id=pkg_elif.id, status="booked"),
        Booking(session_id=s9_day_after_cadillac.id, member_id=irem.id, package_id=pkg_irem.id, status="booked"),
        # s10: +2 Gün 20:00 Akşam Grup Reformer (İpek Hoca) -> Defne, İrem (2/6)
        Booking(session_id=s10_day_after_group.id, member_id=defne.id, package_id=pkg_defne.id, status="booked"),
        Booking(session_id=s10_day_after_group.id, member_id=irem.id, package_id=pkg_irem.id, status="booked"),
    ]
    db.add_all(bookings)
    db.flush()

    enrolled_counter = {}
    for b in bookings:
        if b.status != "cancelled":
            enrolled_counter[b.session_id] = enrolled_counter.get(b.session_id, 0) + 1
    for sess in all_seeded_sessions:
        sess.current_enrolled = enrolled_counter.get(sess.id, 0)

    # =========================================================================
    # 8. YEDEK LİSTE (Waitlist) - Yarın 10:30 Dolu Reformer Seansında İrem Bekliyor
    # =========================================================================
    waitlist_seed = Waitlist(
        session_id=s5_tomorrow_full.id,
        member_id=irem.id,
        created_at=(datetime.now() - timedelta(minutes=35)).strftime("%Y-%m-%d %H:%M:%S"),
    )
    db.add(waitlist_seed)

    db.commit()
    seed_additional_customers(db)


def seed_additional_customers(db: Session) -> None:
    """
    Mevcut veya yeni veritabanına idempotent olarak e-posta eşleşmelerini tamamlar ve
    8 yeni gerçekçi Türk müşteri (farklı kredi durumları, sakatlık/hamilelik/skolyoz notları,
    ders randevuları, yoklama geçmişleri ve vücut ölçümleri ile) ekler.
    """
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")
    tomorrow_str = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after_str = (today + timedelta(days=2)).strftime("%Y-%m-%d")
    day_3_str = (today + timedelta(days=3)).strftime("%Y-%m-%d")
    past_5_str = (today - timedelta(days=5)).strftime("%Y-%m-%d")
    past_3_str = (today - timedelta(days=3)).strftime("%Y-%m-%d")
    m1_str = (today - timedelta(days=35)).strftime("%Y-%m-%d")
    m0_str = (today - timedelta(days=3)).strftime("%Y-%m-%d")

    dirty = False

    # 1. Mevcut eğitmen ve üyelere kurumsal/kişisel e-posta tanımla (yoksa)
    legacy_emails = {
        "Seher Hoca": "seher@eryapilates.com",
        "Selin Hoca": "selin@eryapilates.com",
        "İpek Hoca": "ipek@eryapilates.com",
        "Zeynep Kaya": "zeynep@eryapilates.com",
        "Elif Şahin": "elif@eryapilates.com",
        "Defne Yıldız": "defne@eryapilates.com",
        "Merve Arslan": "merve@eryapilates.com",
        "İrem Korkmaz": "irem@eryapilates.com",
    }
    all_existing = db.query(User).all()
    by_name = {u.full_name: u for u in all_existing}
    by_email = {u.email.lower(): u for u in all_existing if u.email}

    for full_name, email_val in legacy_emails.items():
        u = by_name.get(full_name)
        if u and not u.email and email_val.lower() not in by_email:
            u.email = email_val
            by_email[email_val.lower()] = u
            dirty = True

    # 2. Yeni eklenecek 8 çeşitli müşteri profili
    extra_customers_spec = [
        {
            "full_name": "Ayşe Demir",
            "email": "ayse.demir@gmail.com",
            "phone": "0532 614 82 19",
            "instagram_handle": "@aysedemir",
            "avatar_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
            "streak_days": 5,
            "notes": "L5-S1 bel fıtığı rehabilitasyonu sonrası doktor onaylı Reformer; lomber fleksiyon ve ani rotasyon kısıtlı, nötr omurga ve derin core stabilizasyon odaklı.",
            "pkg_name": "12 Seans Klinik Reformer & Omurga Paketi",
            "total_credits": 12,
            "remaining_credits": 9,
            "expiry_days": 42,
            "metrics": [
                (m1_str, 64.2, 27.4, 22.9, "Bel fıtığı sonrası omurga nötr pozisyon ve pelvik kontrol adaptasyonu başlatıldı."),
                (m0_str, 62.8, 25.6, 23.5, "Bel ağrısı şikayetleri belirgin azaldı, core korseleme kuvveti çok iyi ilerliyor."),
            ],
        },
        {
            "full_name": "Burcu Yılmaz",
            "email": "burcu.yilmaz@gmail.com",
            "phone": "0544 392 17 65",
            "instagram_handle": "@burcuyilmaz",
            "avatar_url": "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80",
            "streak_days": 3,
            "notes": "Sol diz iç menisküs hassasiyeti (Grade 1); derin squat ve yüksek dirençli Footwork serilerinde diz açısı 90 dereceyi geçmemeli, orta-hafif yay kullanılmalı.",
            "pkg_name": "8 Seans Grup Reformer Paketi",
            "total_credits": 8,
            "remaining_credits": 2,  # Düşük kredi uyarısı (<= 2)
            "expiry_days": 12,
            "metrics": [
                (m1_str, 60.5, 24.8, 23.0, "Sol diz kuadriseps-hamstring dengesi ve kalça stabilizasyon ölçümü yapıldı."),
                (m0_str, 59.4, 23.5, 23.6, "Diz çevresi kas desteği güçlendi, merdiven inip çıkmada hassasiyet kalmadı."),
            ],
        },
        {
            "full_name": "Ceren Öztürk",
            "email": "ceren.ozturk@gmail.com",
            "phone": "0536 728 45 90",
            "instagram_handle": "@cerenozturk",
            "avatar_url": "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80",
            "streak_days": 4,
            "notes": "Hamile Pilatesi (Prenatal 22. hafta, kadın doğum doktor onaylı); sırtüstü uzun süreli yatıştan kaçınılmalı, eğimli kama (wedge) yastık ve pelvik taban nefesiyle çalışılmalı.",
            "pkg_name": "8 Seans Hamile (Prenatal) Bireysel Reformer",
            "total_credits": 8,
            "remaining_credits": 6,
            "expiry_days": 35,
            "metrics": [
                (m1_str, 63.0, 26.2, 22.6, "2. trimester başlangıç postür, pelvik taban ve diyafram nefesi değerlendirmesi."),
                (m0_str, 64.1, 26.5, 22.8, "Sırt ve bel konforu harika korunuyor, ödem kontrolü ve mobilite çok dengeli."),
            ],
        },
        {
            "full_name": "Pelin Karaca",
            "email": "pelin.karaca@gmail.com",
            "phone": "0507 518 33 41",
            "instagram_handle": "@pelinkaraca",
            "avatar_url": "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=600&q=80",
            "streak_days": 8,
            "notes": "Torakolomber skolyoz (14 derece C-eğriliği) ve sağ skapula kanatlaşması; Cadillac dekompresyon, rotasyonel nefes ve tek taraflı uzama egzersizleri uygulanıyor.",
            "pkg_name": "16 Seans VIP Reformer & Cadillac Paketi",
            "total_credits": 16,
            "remaining_credits": 14,
            "expiry_days": 60,
            "metrics": [
                (m1_str, 57.3, 22.4, 22.7, "Skolyoz açısal simetri ve skapular stabilizasyon programı başlatıldı."),
                (m0_str, 56.8, 21.1, 23.4, "Omuz hizası ve torakal rotasyon simetrisinde gözle görülür iyileşme sağlandı."),
            ],
        },
        {
            "full_name": "Aslı Aydıner",
            "email": "asli.aydiner@gmail.com",
            "phone": "0533 847 29 10",
            "instagram_handle": "@asliaydiner",
            "avatar_url": "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80",
            "streak_days": 2,
            "notes": "Servikal düzleşme ve C5-C6 boyun fıtığı hassasiyeti; baş-boyun kaldırmalı (chest lift) serilerde boyun destek yastığı kullanılmalı, üst trapez aşırı yüklenmemeli.",
            "pkg_name": "8 Seans Düet Reformer Paketi",
            "total_credits": 8,
            "remaining_credits": 1,  # Son 1 ders kredisi uyarısı!
            "expiry_days": 9,
            "metrics": [
                (m1_str, 59.8, 25.4, 22.1, "Masa başı boyun düzleşmesi ve üst sırt mobilite değerlendirmesi."),
                (m0_str, 58.9, 24.0, 22.7, "Kürek kemiği depresyon kontrolü gelişti, boyun tutukluğu azaldı."),
            ],
        },
        {
            "full_name": "Gizem Aksoy",
            "email": "gizem.aksoy@gmail.com",
            "phone": "0541 295 64 78",
            "instagram_handle": "@gizemaksoy",
            "avatar_url": "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=600&q=80",
            "streak_days": 4,
            "notes": "Doğum sonrası (Postnatal 5. ay) 2 parmak diastasis recti toparlanma süreci; klasik crunch/mekik yasak, transversus abdominis korseleme öncelikli.",
            "pkg_name": "8 Seans Postnatal & Core Reformer Paketi",
            "total_credits": 8,
            "remaining_credits": 5,
            "expiry_days": 28,
            "metrics": [
                (m1_str, 67.5, 30.2, 22.3, "Postnatal karın duvarı (diastasis recti) ve pelvik taban toparlanma başlangıcı."),
                (m0_str, 65.4, 28.4, 23.0, "Karın açıklığı 1 parmağa geriledi, bel desteği ve sıkılaşma harika ilerliyor."),
            ],
        },
        {
            "full_name": "Ece Kılıç",
            "email": "ece.kilic@gmail.com",
            "phone": "0538 912 06 53",
            "instagram_handle": "@ecekilic",
            "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
            "streak_days": 6,
            "notes": "Sağ kalça piriformis gerginliği ve siyatik hassasiyeti; Feet in Straps serilerinde dış rotasyon kontrollü tutulmalı, seans sonu derin gluteal esnetme uygulanmalı.",
            "pkg_name": "8 Seans Grup Reformer Paketi",
            "total_credits": 8,
            "remaining_credits": 7,
            "expiry_days": 36,
            "metrics": [
                (m1_str, 55.9, 22.8, 22.4, "Kalça mobilitesi ve hamstring esneklik ölçümü tamamlandı."),
                (m0_str, 55.2, 21.5, 23.1, "Sağ kalça hareket açıklığı eşitlendi, uzun kas formu çok zarif."),
            ],
        },
        {
            "full_name": "Melis Erdoğan",
            "email": "melis.erdogan@gmail.com",
            "phone": "0553 604 71 28",
            "instagram_handle": "@meliserdogan",
            "avatar_url": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80",
            "streak_days": 1,
            "notes": "El bileği karpal tünel hassasiyeti; dört ayak (quadruped) ve plank serilerinde el bileğine yük bindirmemek için önkol desteği veya elcik aparatı kullanılmalı.",
            "pkg_name": "8 Seans Başlangıç Reformer Paketi",
            "total_credits": 8,
            "remaining_credits": 0,  # Paket kredisi bitmiş -> yenileme adayı
            "expiry_days": 5,
            "metrics": [
                (m1_str, 61.7, 26.8, 22.0, "Başlangıç Reformer adaptasyon ve el bileği modifikasyon planlaması."),
                (m0_str, 60.4, 25.2, 22.6, "İlk 8 seanslık paket başarıyla tamamlandı, yeni paket yenilemesi bekleniyor."),
            ],
        },
    ]

    newly_created_members = []
    pkg_by_member_id = {}

    for spec in extra_customers_spec:
        existing_u = by_email.get(spec["email"].lower()) or by_name.get(spec["full_name"])
        if existing_u:
            continue

        new_member = User(
            full_name=spec["full_name"],
            email=spec["email"],
            phone=spec["phone"],
            role="member",
            instagram_handle=spec["instagram_handle"],
            notes=spec["notes"],
            avatar_url=spec["avatar_url"],
            streak_days=spec["streak_days"],
            notify_reminders=True,
            notify_waitlist=True,
            notify_campaigns=True,
        )
        db.add(new_member)
        db.flush()

        pkg = MemberPackage(
            member_id=new_member.id,
            package_name=spec["pkg_name"],
            total_credits=spec["total_credits"],
            remaining_credits=spec["remaining_credits"],
            expiry_date=(today + timedelta(days=spec["expiry_days"])).strftime("%Y-%m-%d"),
            is_active=True,
        )
        db.add(pkg)
        db.flush()

        for m_date, w_kg, fat_pct, mus_kg, comment in spec["metrics"]:
            db.add(
                BodyMetrics(
                    member_id=new_member.id,
                    date=m_date,
                    weight_kg=w_kg,
                    body_fat_pct=fat_pct,
                    muscle_mass_kg=mus_kg,
                    trainer_comment=comment,
                )
            )

        newly_created_members.append(new_member)
        pkg_by_member_id[new_member.id] = pkg
        by_name[new_member.full_name] = new_member
        by_email[spec["email"].lower()] = new_member
        dirty = True

    if newly_created_members:
        trainers = db.query(User).filter(User.role == "trainer").order_by(User.id.asc()).all()
        t_seher = trainers[0] if len(trainers) > 0 else None
        t_selin = trainers[1] if len(trainers) > 1 else t_seher
        t_ipek = trainers[2] if len(trainers) > 2 else t_seher

        if t_seher:
            extra_past_1 = ClassSession(
                trainer_id=t_seher.id,
                title="Klinik Reformer: Bel & Omurga Stabilizasyonu",
                category="Grup Reformer",
                room="Kemerli Ayna Reformer Salonu",
                date=past_5_str,
                start_time="11:00",
                end_time="12:00",
                capacity=6,
                current_enrolled=0,
            )
            extra_past_2 = ClassSession(
                trainer_id=t_selin.id,
                title="Cadillac Dekompresyon & Skolyoz Akışı",
                category="Cadillac & Tower",
                room="Cadillac & Trapeze Alanı",
                date=past_3_str,
                start_time="14:00",
                end_time="15:00",
                capacity=6,
                current_enrolled=0,
            )
            extra_up_1 = ClassSession(
                trainer_id=t_seher.id,
                title="Öğle Grup Reformer: Omurga & Core Kontrolü",
                category="Grup Reformer",
                room="Kemerli Ayna Reformer Salonu",
                date=today_str,
                start_time="13:00",
                end_time="14:00",
                capacity=6,
                current_enrolled=0,
            )
            extra_up_2 = ClassSession(
                trainer_id=t_ipek.id,
                title="Prenatal & Postnatal Özel Reformer",
                category="Düet & Trio",
                room="VIP Özel Reformer Odası",
                date=tomorrow_str,
                start_time="12:00",
                end_time="13:00",
                capacity=4,
                current_enrolled=0,
            )
            extra_up_3 = ClassSession(
                trainer_id=t_selin.id,
                title="Cadillac Tower: Esneklik & Kalça Mobilitesi",
                category="Cadillac & Tower",
                room="Cadillac & Trapeze Alanı",
                date=day_after_str,
                start_time="15:00",
                end_time="16:00",
                capacity=6,
                current_enrolled=0,
            )
            extra_up_4 = ClassSession(
                trainer_id=t_ipek.id,
                title="Sabah Grup Reformer: Tüm Beden Tonlama",
                category="Grup Reformer",
                room="Kemerli Ayna Reformer Salonu",
                date=day_3_str,
                start_time="10:30",
                end_time="11:30",
                capacity=6,
                current_enrolled=0,
            )
            new_sessions = [
                extra_past_1,
                extra_past_2,
                extra_up_1,
                extra_up_2,
                extra_up_3,
                extra_up_4,
            ]
            db.add_all(new_sessions)
            db.flush()

            new_bookings = []
            # Attended past records for all 8 new members
            for idx, m in enumerate(newly_created_members):
                pkg = pkg_by_member_id[m.id]
                target_past = extra_past_1 if idx < 5 else extra_past_2
                new_bookings.append(
                    Booking(
                        session_id=target_past.id,
                        member_id=m.id,
                        package_id=pkg.id,
                        status="attended",
                    )
                )
            # Second attended record for first 4 new members
            for m in newly_created_members[:4]:
                pkg = pkg_by_member_id[m.id]
                new_bookings.append(
                    Booking(
                        session_id=extra_past_2.id,
                        member_id=m.id,
                        package_id=pkg.id,
                        status="attended",
                    )
                )

            # Upcoming 'booked' records for members with active credits
            # extra_up_1 (today 13:00): Ayşe, Burcu, Pelin, Aslı, Ece (5/6)
            for name in ["Ayşe Demir", "Burcu Yılmaz", "Pelin Karaca", "Aslı Aydıner", "Ece Kılıç"]:
                m = by_name.get(name)
                if m and m.id in pkg_by_member_id:
                    new_bookings.append(
                        Booking(
                            session_id=extra_up_1.id,
                            member_id=m.id,
                            package_id=pkg_by_member_id[m.id].id,
                            status="booked",
                        )
                    )
            # extra_up_2 (tomorrow 12:00 Prenatal & Postnatal): Ceren, Gizem (2/4)
            for name in ["Ceren Öztürk", "Gizem Aksoy"]:
                m = by_name.get(name)
                if m and m.id in pkg_by_member_id:
                    new_bookings.append(
                        Booking(
                            session_id=extra_up_2.id,
                            member_id=m.id,
                            package_id=pkg_by_member_id[m.id].id,
                            status="booked",
                        )
                    )
            # extra_up_3 (+2 day 15:00 Cadillac): Ayşe, Pelin, Ece (3/6)
            for name in ["Ayşe Demir", "Pelin Karaca", "Ece Kılıç"]:
                m = by_name.get(name)
                if m and m.id in pkg_by_member_id:
                    new_bookings.append(
                        Booking(
                            session_id=extra_up_3.id,
                            member_id=m.id,
                            package_id=pkg_by_member_id[m.id].id,
                            status="booked",
                        )
                    )
            # extra_up_4 (+3 day 10:30): Ceren, Pelin, Gizem (3/6)
            for name in ["Ceren Öztürk", "Pelin Karaca", "Gizem Aksoy"]:
                m = by_name.get(name)
                if m and m.id in pkg_by_member_id:
                    new_bookings.append(
                        Booking(
                            session_id=extra_up_4.id,
                            member_id=m.id,
                            package_id=pkg_by_member_id[m.id].id,
                            status="booked",
                        )
                    )

            db.add_all(new_bookings)
            db.flush()

            counts = {}
            for b in new_bookings:
                if b.status != "cancelled":
                    counts[b.session_id] = counts.get(b.session_id, 0) + 1
            for s in new_sessions:
                s.current_enrolled = counts.get(s.id, 0)

    if dirty:
        db.commit()
