import json
import os
import re
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session, joinedload

from models import Booking, ClassSession, MemberPackage, User


def normalize_handle(handle: str) -> str:
    h = (handle or "").strip().lower()
    if not h:
        return ""
    return h if h.startswith("@") else f"@{h}"


def find_member_by_handle(db: Session, handle: str) -> Optional[User]:
    norm = normalize_handle(handle)
    if not norm:
        return None
    members = db.query(User).filter(User.role == "member").all()
    for m in members:
        if m.instagram_handle and normalize_handle(m.instagram_handle) == norm:
            return m
    return None


def get_active_package(db: Session, member_id: int) -> Optional[MemberPackage]:
    return (
        db.query(MemberPackage)
        .filter(MemberPackage.member_id == member_id, MemberPackage.is_active == True)
        .order_by(MemberPackage.id.desc())
        .first()
    )


def format_day_word_tr(target_date: str) -> str:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    if target_date == today.strftime("%Y-%m-%d"):
        return "bugün"
    if target_date == tomorrow.strftime("%Y-%m-%d"):
        return "yarın"
    return target_date


def try_llm_parse_intent(message: str, today_iso: str, tomorrow_iso: str) -> Optional[Dict[str, Any]]:
    """
    Eğer ortam değişkenlerinde GEMINI_API_KEY veya OPENAI_API_KEY tanımlıysa
    LLM Function Calling kullanarak mesajdaki niyeti ayrıştırır.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    system_prompt = (
        f"Sen bir fitness stüdyosunun Türkçe Instagram DM asistanısın. "
        f"Bugünün tarihi: {today_iso}, Yarının tarihi: {tomorrow_iso}. "
        f"Kullanıcının mesajından niyetini (intent: 'book' | 'cancel' | 'credits' | 'list'), "
        f"hedef tarihi (target_date: YYYY-MM-DD), hedef saati (start_time: HH:MM) ve "
        f"varsa ders anahtar kelimesini (keyword: örn 'grup', 'pt', 'pilates') çıkar."
    )

    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"role": "user", "parts": [{"text": f"{system_prompt}\nMesaj: {message}"}]}],
                "tools": [
                    {
                        "functionDeclarations": [
                            {
                                "name": "handle_fitness_dm",
                                "description": "Müşterinin Instagram DM talebini yapılandırılmış komuta çevirir.",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "intent": {
                                            "type": "STRING",
                                            "enum": ["book", "cancel", "credits", "list"],
                                        },
                                        "target_date": {"type": "STRING"},
                                        "start_time": {"type": "STRING"},
                                        "keyword": {"type": "STRING"},
                                    },
                                    "required": ["intent"],
                                },
                            }
                        ]
                    }
                ],
                "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
            }
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                    for p in parts:
                        if "functionCall" in p:
                            return p["functionCall"].get("args", {})
        except Exception:
            pass

    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}"}
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "handle_fitness_dm",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "intent": {
                                        "type": "string",
                                        "enum": ["book", "cancel", "credits", "list"],
                                    },
                                    "target_date": {"type": "string"},
                                    "start_time": {"type": "string"},
                                    "keyword": {"type": "string"},
                                },
                                "required": ["intent"],
                            },
                        },
                    }
                ],
                "tool_choice": {"type": "function", "function": {"name": "handle_fitness_dm"}},
            }
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    tool_calls = data["choices"][0]["message"].get("tool_calls", [])
                    if tool_calls:
                        return json.loads(tool_calls[0]["function"]["arguments"])
        except Exception:
            pass

    return None


def fallback_turkish_nlp_parse(message: str, today_iso: str, tomorrow_iso: str, day_after_iso: str) -> Dict[str, Any]:
    """
    API anahtarı olmadığında çalışan akıllı Türkçe anahtar kelime, gün ve saat ayrıştırıcı.
    """
    lower = (
        message.replace("İ", "i")
        .replace("I", "ı")
        .lower()
        .strip()
    )

    # 1. Tarih tespiti
    target_date: Optional[str] = None
    explicit_iso = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", lower)
    if explicit_iso:
        target_date = explicit_iso.group(1)
    elif "yarın" in lower or "yarin" in lower:
        target_date = tomorrow_iso
    elif "öbür gün" in lower or "ertesi gün" in lower:
        target_date = day_after_iso
    elif "bugün" in lower or "bugun" in lower or "bu akşam" in lower:
        target_date = today_iso

    # 2. Saat tespiti (örn: 19:00, 19.00, saat 19, 19'da, 19 daki)
    start_time: Optional[str] = None
    hm_match = re.search(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\b", lower)
    if hm_match:
        hh = int(hm_match.group(1))
        mm = int(hm_match.group(2))
        start_time = f"{hh:02d}:{mm:02d}"
    else:
        hour_only = re.search(r"(?:saat\s*|akşam\s*)(\d{1,2})\b", lower)
        if not hour_only:
            hour_only = re.search(r"\b([01]?\d|2[0-3])\s*(?:'da|'de|'ta|'te|'daki|'deki|da|de|dersi)\b", lower)
        if hour_only:
            hh = int(hour_only.group(1))
            if "akşam" in lower and 1 <= hh <= 11:
                hh += 12
            if 0 <= hh <= 23:
                start_time = f"{hh:02d}:00"

    # 3. Ders türü anahtar kelimesi
    keyword: Optional[str] = None
    if "fonksiyonel" in lower or "grup" in lower:
        keyword = "grup"
    elif "pilates" in lower or "reformer" in lower:
        keyword = "pilates"
    elif "birebir" in lower or re.search(r"\bpt\b", lower) or "özel" in lower:
        keyword = "pt"

    # 4. Niyet (Intent) tespiti
    cancel_words = ["iptal", "siler misin", "çıkar mısın", "gelemeyeceğim", "vazgeçtim", "gelemem"]
    book_words = [
        "kayıt",
        "kaydol",
        "yazar mısın",
        "yazabilir misin",
        "ekler misin",
        "katılmak",
        "geleceğim",
        "yer ayır",
        "beni yaz",
        "alabilir miyim",
    ]
    credit_words = ["kaç ders", "kalan ders", "kalan hak", "kredim", "paketim"]

    if any(w in lower for w in cancel_words):
        intent = "cancel"
    elif any(w in lower for w in credit_words) and not any(w in lower for w in book_words):
        intent = "credits"
    elif any(w in lower for w in book_words) or start_time is not None:
        intent = "book"
    else:
        intent = "list"

    return {
        "intent": intent,
        "target_date": target_date,
        "start_time": start_time,
        "keyword": keyword,
    }


def match_session(
    sessions: List[ClassSession],
    target_date: Optional[str],
    start_time: Optional[str],
    keyword: Optional[str],
) -> Tuple[Optional[ClassSession], List[ClassSession]]:
    candidates = sessions
    if target_date:
        candidates = [s for s in candidates if s.date == target_date]
    if start_time:
        time_filtered = [s for s in candidates if s.start_time == start_time]
        if time_filtered:
            candidates = time_filtered
        else:
            return None, candidates

    if keyword:
        kw = keyword.lower()
        kw_filtered = [
            s
            for s in candidates
            if (kw == "grup" and ("grup" in s.title.lower() or "fonksiyonel" in s.title.lower()))
            or (kw == "pilates" and "pilates" in s.title.lower())
            or (kw == "pt" and ("pt" in s.title.lower() or "birebir" in s.title.lower()))
        ]
        if kw_filtered:
            candidates = kw_filtered

    if len(candidates) == 1:
        return candidates[0], candidates
    if len(candidates) > 1 and (start_time or keyword):
        return candidates[0], candidates
    return None, candidates


def process_instagram_dm(db: Session, instagram_handle: str, message: str) -> Dict[str, Any]:
    member = find_member_by_handle(db, instagram_handle)
    if not member:
        return {
            "reply": (
                f"Merhaba! '{instagram_handle}' hesabına tanımlı bir stüdyo üyeliği bulamadık. "
                "Lütfen kayıtlı Instagram kullanıcı adınızı kontrol edin veya resepsiyonumuzla iletişime geçin."
            ),
            "action": "member_not_found",
            "member_name": None,
            "session_id": None,
            "booking_id": None,
            "remaining_credits": None,
        }

    today = date.today()
    today_iso = today.strftime("%Y-%m-%d")
    tomorrow_iso = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after_iso = (today + timedelta(days=2)).strftime("%Y-%m-%d")

    parsed = try_llm_parse_intent(message, today_iso, tomorrow_iso)
    if not parsed:
        parsed = fallback_turkish_nlp_parse(message, today_iso, tomorrow_iso, day_after_iso)

    intent = parsed.get("intent", "list")
    target_date = parsed.get("target_date") or today_iso
    start_time = parsed.get("start_time")
    keyword = parsed.get("keyword")

    pkg = get_active_package(db, member.id)
    all_sessions = (
        db.query(ClassSession)
        .options(joinedload(ClassSession.trainer))
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
        .all()
    )

    # 1. Kalan kredi sorgusu
    if intent == "credits":
        if not pkg:
            return {
                "reply": f"Sayın {member.full_name}, şu anda aktif bir ders paketiniz bulunmuyor.",
                "action": "credits_info",
                "member_name": member.full_name,
                "session_id": None,
                "booking_id": None,
                "remaining_credits": 0,
            }
        return {
            "reply": (
                f"Sayın {member.full_name}, '{pkg.package_name}' kapsamında "
                f"kalan ders hakkınız: {pkg.remaining_credits} / {pkg.total_credits} (Son geçerlilik: {pkg.expiry_date})."
            ),
            "action": "credits_info",
            "member_name": member.full_name,
            "session_id": None,
            "booking_id": None,
            "remaining_credits": pkg.remaining_credits,
        }

    # 2. Randevu iptali
    if intent == "cancel":
        member_bookings = (
            db.query(Booking)
            .options(joinedload(Booking.session))
            .filter(Booking.member_id == member.id, Booking.status == "booked")
            .all()
        )
        target_booking: Optional[Booking] = None
        for b in member_bookings:
            if parsed.get("target_date") and b.session.date != parsed["target_date"]:
                continue
            if start_time and b.session.start_time != start_time:
                continue
            target_booking = b
            break

        if not target_booking:
            return {
                "reply": (
                    f"Sayın {member.full_name}, belirttiğiniz gün/saatte iptal edilebilecek aktif bir randevunuz bulunamadı."
                ),
                "action": "cancel_not_found",
                "member_name": member.full_name,
                "session_id": None,
                "booking_id": None,
                "remaining_credits": pkg.remaining_credits if pkg else 0,
            }

        s_obj = target_booking.session
        target_booking.status = "cancelled"
        s_obj.current_enrolled = max(0, s_obj.current_enrolled - 1)
        if pkg:
            pkg.remaining_credits += 1
        db.commit()
        if pkg:
            db.refresh(pkg)

        day_word = format_day_word_tr(s_obj.date)
        rem = pkg.remaining_credits if pkg else 0
        return {
            "reply": (
                f"Sayın {member.full_name}, {day_word} {s_obj.start_time} {s_obj.title} ders kaydınız iptal edildi "
                f"ve +1 ders krediniz iade edildi. Güncel kalan ders hakkınız: {rem}"
            ),
            "action": "cancelled",
            "member_name": member.full_name,
            "session_id": s_obj.id,
            "booking_id": target_booking.id,
            "remaining_credits": rem,
        }

    # 3. Kayıt oluşturma
    if intent == "book":
        matched, same_day_list = match_session(
            all_sessions,
            parsed.get("target_date") or today_iso,
            start_time,
            keyword,
        )

        # Eğer tarih belirtilmediyse ve bugünde bulunamadıysa tüm seanslarda saati ara
        if not matched and not parsed.get("target_date") and start_time:
            matched, same_day_list = match_session(all_sessions, None, start_time, keyword)

        if not matched:
            open_summary = ", ".join(
                f"{format_day_word_tr(s.date)} {s.start_time} {s.title} ({s.current_enrolled}/{s.capacity})"
                for s in all_sessions
                if s.current_enrolled < s.capacity
            )
            return {
                "reply": (
                    f"Sayın {member.full_name}, istediğiniz gün/saatte uygun bir ders bulamadık. "
                    f"Müsait derslerimiz: {open_summary or 'Şu an açık kontenjan bulunmuyor.'}"
                ),
                "action": "session_not_found",
                "member_name": member.full_name,
                "session_id": None,
                "booking_id": None,
                "remaining_credits": pkg.remaining_credits if pkg else 0,
            }

        existing = (
            db.query(Booking)
            .filter(
                Booking.session_id == matched.id,
                Booking.member_id == member.id,
                Booking.status.in_(["booked", "attended"]),
            )
            .first()
        )
        if existing:
            return {
                "reply": (
                    f"Sayın {member.full_name}, {format_day_word_tr(matched.date)} {matched.start_time} "
                    f"{matched.title} dersine zaten aktif kaydınız bulunuyor. "
                    f"Kalan ders hakkınız: {pkg.remaining_credits if pkg else 0}"
                ),
                "action": "already_booked",
                "member_name": member.full_name,
                "session_id": matched.id,
                "booking_id": existing.id,
                "remaining_credits": pkg.remaining_credits if pkg else 0,
            }

        if matched.current_enrolled >= matched.capacity:
            alt = [
                f"{format_day_word_tr(s.date)} {s.start_time} {s.title}"
                for s in all_sessions
                if s.current_enrolled < s.capacity
            ]
            alt_text = f" Alternatif açık dersler: {', '.join(alt[:3])}" if alt else ""
            return {
                "reply": (
                    f"Sayın {member.full_name}, maalesef {format_day_word_tr(matched.date)} {matched.start_time} "
                    f"{matched.title} dersimizin kontenjanı doludur ({matched.current_enrolled}/{matched.capacity}).{alt_text}"
                ),
                "action": "session_full",
                "member_name": member.full_name,
                "session_id": matched.id,
                "booking_id": None,
                "remaining_credits": pkg.remaining_credits if pkg else 0,
            }

        if not pkg or pkg.remaining_credits <= 0:
            return {
                "reply": (
                    f"Sayın {member.full_name}, paketinizde yeterli ders kredisi bulunmadığı için kaydınız oluşturulamadı."
                ),
                "action": "no_credits",
                "member_name": member.full_name,
                "session_id": matched.id,
                "booking_id": None,
                "remaining_credits": 0,
            }

        cancelled_prev = (
            db.query(Booking)
            .filter(
                Booking.session_id == matched.id,
                Booking.member_id == member.id,
                Booking.status == "cancelled",
            )
            .first()
        )
        if cancelled_prev:
            cancelled_prev.status = "booked"
            cancelled_prev.package_id = pkg.id
            booking_obj = cancelled_prev
        else:
            booking_obj = Booking(
                session_id=matched.id,
                member_id=member.id,
                package_id=pkg.id,
                status="booked",
            )
            db.add(booking_obj)

        pkg.remaining_credits -= 1
        matched.current_enrolled += 1
        db.commit()
        db.refresh(booking_obj)
        db.refresh(pkg)
        db.refresh(matched)

        day_word = format_day_word_tr(matched.date)
        return {
            "reply": (
                f"Sayın {member.full_name}, {day_word} {matched.start_time} {matched.title} dersine "
                f"kaydınız oluşturuldu. Kalan ders hakkınız: {pkg.remaining_credits}"
            ),
            "action": "booked",
            "member_name": member.full_name,
            "session_id": matched.id,
            "booking_id": booking_obj.id,
            "remaining_credits": pkg.remaining_credits,
        }

    # 4. Genel program bilgisi
    day_sessions = [s for s in all_sessions if s.date == target_date and s.current_enrolled < s.capacity]
    if not day_sessions:
        day_sessions = [s for s in all_sessions if s.current_enrolled < s.capacity]

    lines = ", ".join(
        f"{format_day_word_tr(s.date)} {s.start_time} {s.title} ({s.capacity - s.current_enrolled} kişilik yer var)"
        for s in day_sessions[:4]
    )
    return {
        "reply": (
            f"Sayın {member.full_name}, müsait derslerimiz: {lines or 'Şu an açık ders bulunmuyor.'} "
            "Kayıt olmak istediğiniz gün ve saati yazmanız yeterli!"
        ),
        "action": "list_sessions",
        "member_name": member.full_name,
        "session_id": None,
        "booking_id": None,
        "remaining_credits": pkg.remaining_credits if pkg else 0,
    }
