import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Dumbbell,
  Edit3,
  Flame,
  Hourglass,
  Layers,
  MapPin,
  Percent,
  Phone,
  Play,
  Radio,
  RefreshCw,
  Square,
  Timer,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import {
  BodyZonesApiResponse,
  BodyZonesRecord,
  EnrichedTrainerMemberFields,
  MemberDailyWellness,
  extractBodyZoneAlerts,
  normalizeBodyZones,
} from '@/components/BodyHeatmapCard';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AttendanceStatus,
  TrainerAttendee,
  TrainerMemberCrm,
  TrainerScheduleData,
  TrainerSession,
  WaitlistEntry,
} from '@/types/fitness';
import { MemberAvatar, getCategoryVisuals } from '@/screens/member/MemberAvatar';
import {
  formatTurkishDateLabel,
  getTodayIso,
  getTomorrowIso,
} from '@/utils/dateHelpers';

const TrainerMemberCrmModal = React.lazy(() =>
  import('@/screens/trainer/TrainerMemberCrmModal').then((m) => ({
    default: m.TrainerMemberCrmModal,
  }))
);

interface Props {
  data: TrainerScheduleData;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAttendance: (bookingId: number, status: AttendanceStatus) => Promise<void>;
  onSaveMemberNote: (memberId: number, notes: string) => Promise<void>;
  onGoToCreateSession: () => void;
  busyBookingId: number | null;
  savingNote: boolean;
  focusDate?: string | null;
  onFocusDateConsumed?: () => void;
}

type LiveTimeState = 'live_now' | 'upcoming_soon' | 'upcoming' | 'completed';
type LiveSessionStatus = 'scheduled' | 'in_progress' | 'completed';

interface LiveParticipantItem {
  booking_id: number;
  member_id: number;
  member_name: string;
  member_phone: string;
  status: AttendanceStatus;
  checked_in_at?: string | null;
  notes?: string | null;
  body_zones?: Record<string, string> | null;
  today_energy_status?: 'high' | 'normal' | 'low' | string | null;
  remaining_credits?: number | null;
}

interface LiveSessionItem {
  id: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  room: string;
  capacity: number;
  booked_count: number;
  time_state: LiveTimeState;
  session_status: LiveSessionStatus;
  started_at?: string | null;
  ended_at?: string | null;
  actual_duration_minutes?: number | null;
  attended_count: number;
  no_show_count: number;
  pending_count: number;
  participants: LiveParticipantItem[];
}

interface LiveAttendanceResponse {
  trainer_id: number;
  server_time_iso: string;
  server_date: string;
  server_hhmm: string;
  current_active_session: LiveSessionItem | null;
  today_sessions: LiveSessionItem[];
  upcoming_sessions: LiveSessionItem[];
}

interface RawLiveParticipantItem {
  booking_id: number;
  member_id: number;
  member_name?: string;
  member_phone?: string;
  status?: string;
  checked_in_at?: string | null;
  notes?: string | null;
  body_zones?: Record<string, string> | null;
  today_energy_status?: 'high' | 'normal' | 'low' | string | null;
  remaining_credits?: number | null;
}

interface RawLiveSessionItem {
  id?: number;
  session_id?: number;
  title?: string;
  session_date?: string | null;
  date?: string | null;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number | null;
  room?: string | null;
  capacity?: number;
  booked_count?: number | null;
  current_enrolled?: number | null;
  time_state?: string;
  session_status?: string;
  started_at?: string | null;
  ended_at?: string | null;
  actual_duration_minutes?: number | null;
  attended_count?: number | null;
  no_show_count?: number | null;
  pending_count?: number | null;
  participants?: RawLiveParticipantItem[] | null;
}

interface RawLiveAttendanceResponse {
  trainer_id?: number;
  server_time_iso?: string;
  server_date?: string;
  server_hhmm?: string;
  current_active_session?: RawLiveSessionItem | null;
  today_sessions?: RawLiveSessionItem[] | null;
  upcoming_sessions?: RawLiveSessionItem[] | null;
}

interface SessionLifecycleResponse {
  session_id?: number;
  id?: number;
  session_status?: string;
  started_at?: string | null;
  ended_at?: string | null;
  actual_duration_minutes?: number | null;
  message?: string;
  session?: RawLiveSessionItem | null;
}

const ALL_DATES_KEY = 'ALL';

const FULL_MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const FULL_DAYS_TR = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
];

function triggerLayoutEase() {
  if (Platform.OS !== 'web') {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }
}

function formatClockHhMmSs(dt: Date): string {
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatClockHhMm(dt: Date): string {
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTurkishFullDate(dt: Date): string {
  const day = dt.getDate();
  const month = FULL_MONTHS_TR[dt.getMonth()] || '';
  const weekday = FULL_DAYS_TR[dt.getDay()] || '';
  return `${day} ${month} ${dt.getFullYear()}, ${weekday}`;
}

function parseHhMmToMinutes(hhmm: string): number {
  const cleaned = (hhmm || '').trim().replace('.', ':');
  const match = /^(\d{1,2}):(\d{2})/.exec(cleaned);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseServerDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Safari / iOS WebKit için "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
  const normalized =
    trimmed.includes(' ') && !trimmed.includes('T')
      ? trimmed.replace(' ', 'T')
      : trimmed;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0)
  );
}

function formatIsoToHhMm(iso?: string | null): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (/^\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }
  const parsed = parseServerDateTime(trimmed);
  if (!parsed) return null;
  return formatClockHhMm(parsed);
}

function formatElapsedSince(startedAt?: string | null, now?: Date): string | null {
  if (!startedAt || !now) return null;
  const startDt = parseServerDateTime(startedAt);
  if (!startDt) return null;
  const diffSec = Math.max(0, Math.floor((now.getTime() - startDt.getTime()) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function computeSessionDurationMinutes(
  startTime?: string | null,
  endTime?: string | null,
  explicitDuration?: number | null
): number {
  if (typeof explicitDuration === 'number' && Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.round(explicitDuration);
  }
  const startMin = parseHhMmToMinutes(startTime || '');
  const endMin = parseHhMmToMinutes(endTime || '');
  if (endMin > startMin) {
    return Math.max(15, endMin - startMin);
  }
  if (startMin > 0 && endMin > 0 && endMin < startMin) {
    return Math.max(15, 1440 - startMin + endMin);
  }
  return 55;
}

function normalizeAttendanceStatus(status?: string | null): AttendanceStatus {
  if (status === 'attended' || status === 'no_show' || status === 'booked') {
    return status;
  }
  return 'booked';
}

function normalizeLiveSessionStatus(status?: string | null): LiveSessionStatus {
  if (status === 'in_progress' || status === 'completed' || status === 'scheduled') {
    return status;
  }
  return 'scheduled';
}

function normalizeLiveTimeState(state?: string | null): LiveTimeState {
  if (
    state === 'live_now' ||
    state === 'upcoming_soon' ||
    state === 'upcoming' ||
    state === 'completed'
  ) {
    return state;
  }
  return 'upcoming';
}

function normalizeLiveSession(raw: RawLiveSessionItem): LiveSessionItem {
  const participants: LiveParticipantItem[] = (raw.participants ?? []).map((p) => ({
    booking_id: p.booking_id,
    member_id: p.member_id,
    member_name: p.member_name || 'Üye',
    member_phone: p.member_phone || '',
    status: normalizeAttendanceStatus(p.status),
    checked_in_at: p.checked_in_at ?? null,
    notes: p.notes ?? '',
    body_zones: p.body_zones ?? null,
    today_energy_status: p.today_energy_status ?? 'normal',
    remaining_credits:
      typeof p.remaining_credits === 'number' ? p.remaining_credits : null,
  }));

  const resolvedDate =
    (raw.session_date || raw.date || '').trim() || getTodayIso();
  const startTime = (raw.start_time || '').trim() || '09:00';
  const endTime = (raw.end_time || '').trim() || '10:00';
  const durationMinutes = computeSessionDurationMinutes(
    startTime,
    endTime,
    raw.duration_minutes
  );
  const bookedCount =
    typeof raw.booked_count === 'number'
      ? raw.booked_count
      : typeof raw.current_enrolled === 'number'
      ? raw.current_enrolled
      : participants.length;

  let attended = 0;
  let noShow = 0;
  let pending = 0;
  for (const p of participants) {
    if (p.status === 'attended') attended += 1;
    else if (p.status === 'no_show') noShow += 1;
    else pending += 1;
  }

  return {
    id: raw.id ?? raw.session_id ?? 0,
    title: raw.title || 'Ders Seansı',
    session_date: resolvedDate,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes,
    room: raw.room || 'Ana Stüdyo',
    capacity: typeof raw.capacity === 'number' && raw.capacity > 0 ? raw.capacity : Math.max(1, bookedCount),
    booked_count: bookedCount,
    time_state: normalizeLiveTimeState(raw.time_state),
    session_status: normalizeLiveSessionStatus(raw.session_status),
    started_at: raw.started_at ?? null,
    ended_at: raw.ended_at ?? null,
    actual_duration_minutes:
      typeof raw.actual_duration_minutes === 'number'
        ? raw.actual_duration_minutes
        : null,
    attended_count:
      typeof raw.attended_count === 'number' ? raw.attended_count : attended,
    no_show_count:
      typeof raw.no_show_count === 'number' ? raw.no_show_count : noShow,
    pending_count:
      typeof raw.pending_count === 'number' ? raw.pending_count : pending,
    participants,
  };
}

function normalizeLiveAttendanceResponse(
  raw: RawLiveAttendanceResponse,
  fallbackTrainerId: number
): LiveAttendanceResponse {
  const now = new Date();
  return {
    trainer_id: raw.trainer_id ?? fallbackTrainerId,
    server_time_iso: raw.server_time_iso || now.toISOString(),
    server_date: (raw.server_date || '').trim() || getTodayIso(),
    server_hhmm: (raw.server_hhmm || '').trim() || formatClockHhMm(now),
    current_active_session: raw.current_active_session
      ? normalizeLiveSession(raw.current_active_session)
      : null,
    today_sessions: (raw.today_sessions ?? []).map(normalizeLiveSession),
    upcoming_sessions: (raw.upcoming_sessions ?? []).map(normalizeLiveSession),
  };
}

function recalcSessionCounts(session: LiveSessionItem): LiveSessionItem {
  let attended = 0;
  let noShow = 0;
  let pending = 0;
  for (const p of session.participants) {
    if (p.status === 'attended') attended += 1;
    else if (p.status === 'no_show') noShow += 1;
    else pending += 1;
  }
  return {
    ...session,
    attended_count: attended,
    no_show_count: noShow,
    pending_count: pending,
  };
}

function updateBookingInLiveSession(
  session: LiveSessionItem,
  bookingId: number,
  status: AttendanceStatus,
  checkedInAt?: string | null
): LiveSessionItem {
  let changed = false;
  const nextParticipants = session.participants.map((p) => {
    if (p.booking_id !== bookingId) return p;
    changed = true;
    return {
      ...p,
      status,
      checked_in_at:
        status === 'attended' ? checkedInAt ?? new Date().toISOString() : null,
    };
  });
  if (!changed) return session;
  return recalcSessionCounts({
    ...session,
    participants: nextParticipants,
  });
}

function updateBookingInLiveResponse(
  prev: LiveAttendanceResponse | null,
  bookingId: number,
  status: AttendanceStatus,
  checkedInAt?: string | null
): LiveAttendanceResponse | null {
  if (!prev) return prev;
  return {
    ...prev,
    current_active_session: prev.current_active_session
      ? updateBookingInLiveSession(
          prev.current_active_session,
          bookingId,
          status,
          checkedInAt
        )
      : null,
    today_sessions: prev.today_sessions.map((s) =>
      updateBookingInLiveSession(s, bookingId, status, checkedInAt)
    ),
    upcoming_sessions: prev.upcoming_sessions.map((s) =>
      updateBookingInLiveSession(s, bookingId, status, checkedInAt)
    ),
  };
}

function patchSessionInLiveResponse(
  prev: LiveAttendanceResponse | null,
  sessionId: number,
  updater: (session: LiveSessionItem) => LiveSessionItem
): LiveAttendanceResponse | null {
  if (!prev) return prev;
  const patchOne = (s: LiveSessionItem) => (s.id === sessionId ? updater(s) : s);
  return {
    ...prev,
    current_active_session: prev.current_active_session
      ? patchOne(prev.current_active_session)
      : null,
    today_sessions: prev.today_sessions.map(patchOne),
    upcoming_sessions: prev.upcoming_sessions.map(patchOne),
  };
}

function buildFallbackLiveAttendance(
  schedule: TrainerScheduleData,
  now: Date
): LiveAttendanceResponse {
  const todayIso = getTodayIso();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const toLiveItem = (s: TrainerSession): LiveSessionItem => {
    const startMin = parseHhMmToMinutes(s.start_time);
    const endMin = parseHhMmToMinutes(s.end_time) || startMin + 55;
    const duration = Math.max(15, endMin - startMin);

    let timeState: LiveTimeState = 'upcoming';
    if (s.date < todayIso) {
      timeState = 'completed';
    } else if (s.date === todayIso) {
      if (nowMinutes >= startMin && nowMinutes <= endMin) {
        timeState = 'live_now';
      } else if (startMin > nowMinutes && startMin - nowMinutes <= 45) {
        timeState = 'upcoming_soon';
      } else if (nowMinutes > endMin) {
        timeState = 'completed';
      } else {
        timeState = 'upcoming';
      }
    }

    const participants: LiveParticipantItem[] = s.attendees.map((att) => ({
      booking_id: att.booking_id,
      member_id: att.member_id,
      member_name: att.full_name,
      member_phone: att.phone,
      status: att.status,
      checked_in_at: null,
      notes: att.notes || '',
      body_zones: (att.body_zones as Record<string, string> | null) ?? undefined,
      today_energy_status: att.today_energy_status ?? undefined,
    }));

    return recalcSessionCounts({
      id: s.id,
      title: s.title,
      session_date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      duration_minutes: duration,
      room: s.room || 'Ana Stüdyo',
      capacity: s.capacity,
      booked_count: s.current_enrolled,
      time_state: timeState,
      session_status: timeState === 'completed' ? 'completed' : 'scheduled',
      started_at: null,
      ended_at: null,
      actual_duration_minutes: null,
      attended_count: 0,
      no_show_count: 0,
      pending_count: 0,
      participants,
    });
  };

  const todaySessions = schedule.sessions
    .filter((s) => s.date === todayIso)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(toLiveItem);

  const upcomingSessions = schedule.sessions
    .filter((s) => s.date > todayIso)
    .sort((a, b) =>
      a.date === b.date
        ? a.start_time.localeCompare(b.start_time)
        : a.date.localeCompare(b.date)
    )
    .slice(0, 8)
    .map(toLiveItem);

  const currentActive =
    todaySessions.find(
      (s) => s.time_state === 'live_now' || s.session_status === 'in_progress'
    ) ||
    todaySessions.find(
      (s) => s.time_state === 'upcoming_soon' || s.time_state === 'upcoming'
    ) ||
    null;

  return {
    trainer_id: schedule.trainer.id,
    server_time_iso: now.toISOString(),
    server_date: todayIso,
    server_hhmm: formatClockHhMm(now),
    current_active_session: currentActive,
    today_sessions: todaySessions,
    upcoming_sessions: upcomingSessions,
  };
}

export function TrainerScheduleTab({
  data,
  refreshing,
  onRefresh,
  onMarkAttendance,
  onSaveMemberNote,
  onGoToCreateSession,
  busyBookingId,
  savingNote,
  focusDate,
  onFocusDateConsumed,
}: Props) {
  const trainerId = data.trainer.id;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  // Gerçek zamanlı saat (her saniye güncellenir)
  const [liveClock, setLiveClock] = useState<Date>(() => new Date());

  // Canlı ders & yoklama API verisi
  const [liveData, setLiveData] = useState<LiveAttendanceResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(true);
  const [liveSyncing, setLiveSyncing] = useState<boolean>(false);
  const [usingFallbackLive, setUsingFallbackLive] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Hoca tarafından seçilen aktif canlı yoklama dersi (null = otomatik canlı ders)
  const [selectedLiveSessionId, setSelectedLiveSessionId] = useState<number | null>(null);
  const [classActionBusyId, setClassActionBusyId] = useState<number | null>(null);
  const [markingBookingIds, setMarkingBookingIds] = useState<Record<number, boolean>>({});
  const [liveToast, setLiveToast] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showLiveToast = useCallback((type: 'success' | 'error', text: string) => {
    setLiveToast({ type, text });
    setTimeout(() => {
      setLiveToast((prev) => (prev?.text === text ? null : prev));
    }, 3600);
  }, []);

  // Her saniye gerçek zamanlı saat güncellemesi
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchLiveAttendance = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLiveLoading(true);
      } else {
        setLiveSyncing(true);
      }
      try {
        const res = await apiRequest<RawLiveAttendanceResponse>(
          `/trainer/${trainerId}/live-attendance`
        );
        setLiveData(normalizeLiveAttendanceResponse(res, trainerId));
        setUsingFallbackLive(false);
        setLastSyncedAt(new Date());
      } catch {
        setLiveData((prev) => prev ?? buildFallbackLiveAttendance(data, new Date()));
        setUsingFallbackLive(true);
      } finally {
        setLiveLoading(false);
        setLiveSyncing(false);
      }
    },
    [trainerId, data]
  );

  // İlk yükleme + 30 saniyede bir otomatik canlı yenileme
  useEffect(() => {
    fetchLiveAttendance(false);
    const interval = setInterval(() => {
      fetchLiveAttendance(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveAttendance]);

  // Fallback modundaysa üst schedule verisi değiştiğinde canlı görünümü taze tut
  useEffect(() => {
    if (usingFallbackLive) {
      setLiveData(buildFallbackLiveAttendance(data, new Date()));
    }
  }, [data, usingFallbackLive]);

  const handleCombinedRefresh = useCallback(() => {
    onRefresh();
    fetchLiveAttendance(true);
  }, [onRefresh, fetchLiveAttendance]);

  // Tüm canlı derslerin tekilleştirilmiş haritası
  const allLiveSessions = useMemo(() => {
    if (!liveData) return [] as LiveSessionItem[];
    const map = new Map<number, LiveSessionItem>();
    if (liveData.current_active_session) {
      map.set(liveData.current_active_session.id, liveData.current_active_session);
    }
    for (const s of liveData.today_sessions) {
      map.set(s.id, s);
    }
    for (const s of liveData.upcoming_sessions) {
      if (!map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    return Array.from(map.values());
  }, [liveData]);

  // Sunucunun veya saatin belirlediği varsayılan canlı/sıradaki ders
  const autoMatchedSession = useMemo<LiveSessionItem | null>(() => {
    if (!liveData) return null;
    if (liveData.current_active_session) return liveData.current_active_session;
    const inProgOrLive = liveData.today_sessions.find(
      (s) => s.session_status === 'in_progress' || s.time_state === 'live_now'
    );
    if (inProgOrLive) return inProgOrLive;
    const soonOrUpcoming = liveData.today_sessions.find(
      (s) => s.time_state === 'upcoming_soon' || s.time_state === 'upcoming'
    );
    if (soonOrUpcoming) return soonOrUpcoming;
    if (liveData.today_sessions.length > 0) return liveData.today_sessions[0];
    if (liveData.upcoming_sessions.length > 0) return liveData.upcoming_sessions[0];
    return null;
  }, [liveData]);

  // Ekranda aktif olarak görüntülenen ders (seçili veya otomatik eşleşen)
  const focusedLiveSession = useMemo<LiveSessionItem | null>(() => {
    if (selectedLiveSessionId !== null) {
      const found = allLiveSessions.find((s) => s.id === selectedLiveSessionId);
      if (found) return found;
    }
    return autoMatchedSession;
  }, [selectedLiveSessionId, allLiveSessions, autoMatchedSession]);

  // Mevcut takvim verisinden zengin üye bilgisi (avatar, paket, kredi, instagram) eşleştirme
  const scheduleAttendeeLookup = useMemo(() => {
    const byBooking = new Map<number, TrainerAttendee>();
    const byMember = new Map<number, TrainerAttendee>();
    for (const sess of data.sessions) {
      for (const att of sess.attendees) {
        byBooking.set(att.booking_id, att);
        if (!byMember.has(att.member_id)) {
          byMember.set(att.member_id, att);
        }
      }
    }
    return { byBooking, byMember };
  }, [data.sessions]);

  // Mevcut Tarih Seçici & Tam Takvim State'leri
  const dateOptions = useMemo(() => {
    const set = new Set<string>([todayIso, tomorrowIso, ...data.available_dates]);
    return Array.from(set).sort();
  }, [data.available_dates, todayIso, tomorrowIso]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const hasToday = data.sessions.some((s) => s.date === todayIso);
    if (hasToday) return todayIso;
    const upcoming = data.available_dates.find((d) => d >= todayIso);
    return upcoming || todayIso;
  });

  const [expandedSessionIds, setExpandedSessionIds] = useState<Record<number, boolean>>({});
  const [editingMember, setEditingMember] = useState<{
    member_id: number;
    full_name: string;
    avatar_url?: string | null;
    notes?: string | null;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [selectedCrmMember, setSelectedCrmMember] = useState<
    (TrainerMemberCrm & EnrichedTrainerMemberFields) | null
  >(null);
  const [memberSnapshots, setMemberSnapshots] = useState<
    Record<
      number,
      {
        zones?: BodyZonesRecord;
        wellness?: MemberDailyWellness;
      }
    >
  >({});

  useEffect(() => {
    if (focusDate) {
      setSelectedDate(focusDate);
      onFocusDateConsumed?.();
    }
  }, [focusDate, onFocusDateConsumed]);

  const visibleSessions = useMemo(() => {
    if (selectedDate === ALL_DATES_KEY) {
      return data.sessions;
    }
    return data.sessions.filter((s) => s.date === selectedDate);
  }, [data.sessions, selectedDate]);

  useEffect(() => {
    if (visibleSessions.length > 0) {
      setExpandedSessionIds((prev) => {
        const hasAnyVisible = visibleSessions.some((s) => prev[s.id] !== undefined);
        if (hasAnyVisible) return prev;
        return { ...prev, [visibleSessions[0].id]: true };
      });
    }
  }, [visibleSessions]);

  // Hem canlı yoklama listesindeki hem de görünür takvimdeki katılımcıların bölge haritası & enerji verilerini yedekli çek
  useEffect(() => {
    const memberNeeds = new Map<
      number,
      { needsZones: boolean; needsWellness: boolean }
    >();

    if (focusedLiveSession) {
      for (const p of focusedLiveSession.participants) {
        const existing = memberNeeds.get(p.member_id);
        const hasZones = Boolean(p.body_zones && Object.keys(p.body_zones).length > 0);
        const hasEnergy = Boolean(p.today_energy_status);
        memberNeeds.set(p.member_id, {
          needsZones: (existing?.needsZones ?? false) || !hasZones,
          needsWellness: (existing?.needsWellness ?? false) || !hasEnergy,
        });
      }
    }

    for (const sess of visibleSessions) {
      for (const att of sess.attendees) {
        const enriched = att as TrainerAttendee & EnrichedTrainerMemberFields;
        const existing = memberNeeds.get(att.member_id);
        const hasZones = Boolean(
          enriched.body_zones && Object.keys(enriched.body_zones).length > 0
        );
        const hasEnergy = Boolean(enriched.today_energy_status);
        memberNeeds.set(att.member_id, {
          needsZones: (existing?.needsZones ?? false) || !hasZones,
          needsWellness: (existing?.needsWellness ?? false) || !hasEnergy,
        });
      }
    }

    if (memberNeeds.size === 0) return;

    let cancelled = false;

    const hydrate = async () => {
      await Promise.all(
        Array.from(memberNeeds.entries()).map(async ([memberId, needs]) => {
          let fetchedZones: BodyZonesRecord | undefined;
          let fetchedWellness: MemberDailyWellness | undefined;

          if (needs.needsZones) {
            try {
              const zRes = await apiRequest<BodyZonesApiResponse>(
                `/users/${memberId}/body-zones`
              );
              if (zRes?.zones) {
                fetchedZones = normalizeBodyZones(zRes.zones);
              }
            } catch {
              // sessiz yedek
            }
          }

          if (needs.needsWellness) {
            try {
              fetchedWellness = await apiRequest<MemberDailyWellness>(
                `/wellness/${memberId}/today`
              );
            } catch {
              // sessiz yedek
            }
          }

          if (!cancelled && (fetchedZones || fetchedWellness)) {
            setMemberSnapshots((prev) => ({
              ...prev,
              [memberId]: {
                zones: fetchedZones ?? prev[memberId]?.zones,
                wellness: fetchedWellness ?? prev[memberId]?.wellness,
              },
            }));
          }
        })
      );
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [focusedLiveSession, visibleSessions]);

  const openStudentHeatmapModal = useCallback(
    (att: TrainerAttendee) => {
      const enriched = att as TrainerAttendee & EnrichedTrainerMemberFields;
      const snap = memberSnapshots[att.member_id];
      setSelectedCrmMember({
        id: att.member_id,
        full_name: att.full_name,
        phone: att.phone,
        instagram_handle: att.instagram_handle,
        avatar_url: att.avatar_url,
        streak_days: 0,
        notes: att.notes || '',
        package_name: att.package_name,
        remaining_credits: att.remaining_credits,
        total_credits: att.total_credits,
        low_credit_warning: att.low_credit_warning,
        attended_sessions_count: 0,
        body_zones: snap?.zones ?? enriched.body_zones ?? null,
        today_energy_status:
          snap?.wellness?.energy_status ?? enriched.today_energy_status ?? null,
        today_water_ml: snap?.wellness?.water_ml ?? enriched.today_water_ml ?? null,
        water_goal_ml:
          snap?.wellness?.water_goal_ml ?? enriched.water_goal_ml ?? 3000,
        today_protein_g:
          snap?.wellness?.protein_g ?? enriched.today_protein_g ?? null,
        protein_goal_g:
          snap?.wellness?.protein_goal_g ?? enriched.protein_goal_g ?? 140,
      });
    },
    [memberSnapshots]
  );

  const openLiveParticipantCrmModal = useCallback(
    (p: LiveParticipantItem) => {
      const schedAtt =
        scheduleAttendeeLookup.byBooking.get(p.booking_id) ??
        scheduleAttendeeLookup.byMember.get(p.member_id);
      const snap = memberSnapshots[p.member_id];
      const effectiveZones =
        snap?.zones ??
        (p.body_zones ? normalizeBodyZones(p.body_zones) : undefined) ??
        (schedAtt?.body_zones
          ? normalizeBodyZones(schedAtt.body_zones as Record<string, string>)
          : null);
      const effectiveEnergy =
        snap?.wellness?.energy_status ??
        p.today_energy_status ??
        schedAtt?.today_energy_status ??
        null;

      setSelectedCrmMember({
        id: p.member_id,
        full_name: p.member_name,
        phone: p.member_phone || schedAtt?.phone || '',
        instagram_handle: schedAtt?.instagram_handle ?? null,
        avatar_url: schedAtt?.avatar_url ?? null,
        streak_days: 0,
        notes: p.notes ?? schedAtt?.notes ?? '',
        package_name: schedAtt?.package_name ?? null,
        remaining_credits: schedAtt?.remaining_credits ?? p.remaining_credits ?? 0,
        total_credits: schedAtt?.total_credits ?? 0,
        low_credit_warning: schedAtt?.low_credit_warning ?? false,
        attended_sessions_count: 0,
        body_zones: effectiveZones,
        today_energy_status: effectiveEnergy,
        today_water_ml: snap?.wellness?.water_ml ?? schedAtt?.today_water_ml ?? null,
        water_goal_ml:
          snap?.wellness?.water_goal_ml ?? schedAtt?.water_goal_ml ?? 3000,
        today_protein_g:
          snap?.wellness?.protein_g ?? schedAtt?.today_protein_g ?? null,
        protein_goal_g:
          snap?.wellness?.protein_goal_g ?? schedAtt?.protein_goal_g ?? 140,
      });
    },
    [memberSnapshots, scheduleAttendeeLookup]
  );

  // Derse Gir & Yoklamayı Başlat -> POST /trainer/sessions/{id}/start-class
  const handleStartClass = useCallback(
    async (session: LiveSessionItem) => {
      setClassActionBusyId(session.id);
      const previousLiveData = liveData;
      const optimisticStartedAt = new Date().toISOString();

      triggerLayoutEase();
      setLiveData((prev) =>
        patchSessionInLiveResponse(prev, session.id, (s) => ({
          ...s,
          session_status: 'in_progress',
          time_state: 'live_now',
          started_at: s.started_at || optimisticStartedAt,
        }))
      );

      try {
        const res = await apiRequest<SessionLifecycleResponse>(
          `/trainer/sessions/${session.id}/start-class`,
          { method: 'POST' }
        );
        const startedAt = res?.started_at || optimisticStartedAt;
        const normalizedFromServer =
          res?.session
            ? normalizeLiveSession(res.session)
            : typeof res?.id === 'number' || typeof res?.session_id === 'number'
            ? normalizeLiveSession(res as RawLiveSessionItem)
            : null;
        setLiveData((prev) =>
          patchSessionInLiveResponse(prev, session.id, (s) =>
            normalizedFromServer
              ? {
                  ...s,
                  ...normalizedFromServer,
                  session_status: normalizeLiveSessionStatus(
                    normalizedFromServer.session_status || 'in_progress'
                  ),
                  started_at: normalizedFromServer.started_at || startedAt,
                }
              : {
                  ...s,
                  session_status: normalizeLiveSessionStatus(
                    res?.session_status ?? 'in_progress'
                  ),
                  time_state: 'live_now',
                  started_at: startedAt,
                }
          )
        );
        showLiveToast(
          'success',
          `"${session.title}" dersi başlatıldı — Canlı süre ve yoklama aktif.`
        );
        fetchLiveAttendance(true);
        onRefresh();
      } catch (err: any) {
        setLiveData(previousLiveData);
        showLiveToast(
          'error',
          err?.message || 'Ders başlatılamadı. Lütfen tekrar deneyin.'
        );
      } finally {
        setClassActionBusyId(null);
      }
    },
    [liveData, showLiveToast, fetchLiveAttendance, onRefresh]
  );

  // Dersi Tamamla -> POST /trainer/sessions/{id}/complete-class
  const handleCompleteClass = useCallback(
    async (session: LiveSessionItem) => {
      setClassActionBusyId(session.id);
      const previousLiveData = liveData;
      const optimisticEndedAt = new Date().toISOString();

      triggerLayoutEase();
      setLiveData((prev) =>
        patchSessionInLiveResponse(prev, session.id, (s) => ({
          ...s,
          session_status: 'completed',
          time_state: 'completed',
          ended_at: optimisticEndedAt,
          actual_duration_minutes: s.actual_duration_minutes ?? s.duration_minutes,
        }))
      );

      try {
        const res = await apiRequest<SessionLifecycleResponse>(
          `/trainer/sessions/${session.id}/complete-class`,
          { method: 'POST' }
        );
        const recordedMins =
          res?.actual_duration_minutes ?? session.duration_minutes;
        const normalizedCompleted = res?.session
          ? normalizeLiveSession(res.session)
          : null;
        setLiveData((prev) =>
          patchSessionInLiveResponse(prev, session.id, (s) =>
            normalizedCompleted
              ? {
                  ...s,
                  ...normalizedCompleted,
                  session_status: 'completed',
                  time_state: 'completed',
                  ended_at: normalizedCompleted.ended_at || res?.ended_at || optimisticEndedAt,
                  actual_duration_minutes:
                    normalizedCompleted.actual_duration_minutes ?? recordedMins,
                }
              : {
                  ...s,
                  session_status: normalizeLiveSessionStatus(
                    res?.session_status ?? 'completed'
                  ),
                  time_state: 'completed',
                  ended_at: res?.ended_at || optimisticEndedAt,
                  actual_duration_minutes: recordedMins,
                }
          )
        );
        showLiveToast(
          'success',
          `Ders tamamlandı (${recordedMins} dk aylık hoca saatine işlendi).`
        );
        fetchLiveAttendance(true);
        onRefresh();
      } catch (err: any) {
        setLiveData(previousLiveData);
        showLiveToast(
          'error',
          err?.message || 'Ders tamamlanamadı. Lütfen tekrar deneyin.'
        );
      } finally {
        setClassActionBusyId(null);
      }
    },
    [liveData, showLiveToast, fetchLiveAttendance, onRefresh]
  );

  // Tek dokunuşlu yoklama (Optimistic UI + Hata Geri Alması) -> POST /trainer/attendance/mark
  const handleLiveMarkAttendance = useCallback(
    async (
      bookingId: number,
      currentStatus: AttendanceStatus,
      targetStatus: 'attended' | 'no_show'
    ) => {
      const nextStatus: AttendanceStatus =
        currentStatus === targetStatus ? 'booked' : targetStatus;
      const previousLiveData = liveData;
      const checkedInAt =
        nextStatus === 'attended' ? new Date().toISOString() : null;

      triggerLayoutEase();
      setMarkingBookingIds((prev) => ({ ...prev, [bookingId]: true }));
      setLiveData((prev) =>
        updateBookingInLiveResponse(prev, bookingId, nextStatus, checkedInAt)
      );

      try {
        await apiRequest('/trainer/attendance/mark', {
          method: 'POST',
          body: JSON.stringify({
            booking_id: bookingId,
            status: nextStatus,
          }),
        });

        const msg =
          nextStatus === 'attended'
            ? 'Yoklama "Geldi" olarak kaydedildi.'
            : nextStatus === 'no_show'
            ? 'Yoklama "Gelmedi" olarak kaydedildi.'
            : 'Yoklama "Bekliyor" durumuna alındı.';
        showLiveToast('success', msg);
        fetchLiveAttendance(true);
        onRefresh();
      } catch (err: any) {
        // Optimistic UI hata geri alması
        setLiveData(previousLiveData);
        showLiveToast(
          'error',
          err?.message || 'Yoklama kaydedilemedi, önceki duruma geri alındı.'
        );
      } finally {
        setMarkingBookingIds((prev) => {
          const next = { ...prev };
          delete next[bookingId];
          return next;
        });
      }
    },
    [liveData, showLiveToast, fetchLiveAttendance, onRefresh]
  );

  const handleSelectLiveSession = useCallback((sessionId: number) => {
    triggerLayoutEase();
    setSelectedLiveSessionId(sessionId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const summaryStats = useMemo(() => {
    const totalClasses = visibleSessions.length;
    const totalEnrolled = visibleSessions.reduce((acc, s) => acc + s.current_enrolled, 0);
    const totalCapacity = visibleSessions.reduce((acc, s) => acc + s.capacity, 0);
    const fillRatePct =
      totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
    const totalWaitlist = visibleSessions.reduce(
      (acc, s) => acc + (s.waitlist?.length ?? 0),
      0
    );
    return {
      totalClasses,
      totalEnrolled,
      totalCapacity,
      fillRatePct,
      totalWaitlist,
    };
  }, [visibleSessions]);

  const toggleExpand = (sessionId: number) => {
    triggerLayoutEase();
    setExpandedSessionIds((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  const handleSelectDate = (dt: string) => {
    triggerLayoutEase();
    setSelectedDate(dt);
  };

  const handleAttendancePress = async (
    attendee: TrainerAttendee,
    targetStatus: 'attended' | 'no_show'
  ) => {
    triggerLayoutEase();
    const nextStatus: AttendanceStatus =
      attendee.status === targetStatus ? 'booked' : targetStatus;
    await onMarkAttendance(attendee.booking_id, nextStatus);
    fetchLiveAttendance(true);
  };

  const openEditModal = (member: {
    member_id: number;
    full_name: string;
    avatar_url?: string | null;
    notes?: string | null;
  }) => {
    setEditingMember(member);
    setNoteDraft(member.notes || '');
  };

  const handleConfirmNote = async () => {
    if (!editingMember) return;
    await onSaveMemberNote(editingMember.member_id, noteDraft);
    setEditingMember(null);
    fetchLiveAttendance(true);
  };

  // Canlı ders durumu meta verisi
  const focusedMeta = useMemo(() => {
    if (!focusedLiveSession) return null;
    const isInProgress = focusedLiveSession.session_status === 'in_progress';
    const isCompleted =
      focusedLiveSession.session_status === 'completed' ||
      focusedLiveSession.time_state === 'completed';
    const isLiveNow =
      isInProgress || focusedLiveSession.time_state === 'live_now';
    const isUpcomingSoon = focusedLiveSession.time_state === 'upcoming_soon';

    let badgeText = 'Sıradaki Ders';
    let badgeBg = COLORS.primaryLight;
    let badgeBorder = COLORS.primaryBorder;
    let badgeColor = COLORS.primary;
    let dotColor = COLORS.warning;

    if (isLiveNow) {
      badgeText = isInProgress ? 'Şu An Aktif Ders • Yayında' : 'Şu An Aktif Ders';
      badgeBg = '#ECFDF5';
      badgeBorder = '#86EFAC';
      badgeColor = '#15803D';
      dotColor = '#16A34A';
    } else if (isCompleted) {
      badgeText = 'Tamamlanan Ders';
      badgeBg = COLORS.surfaceElevated;
      badgeBorder = COLORS.borderStrong;
      badgeColor = COLORS.textSecondary;
      dotColor = COLORS.success;
    } else if (isUpcomingSoon) {
      badgeText = 'Sıradaki Ders • Yaklaşıyor';
      badgeBg = '#FFFBEB';
      badgeBorder = '#FCD34D';
      badgeColor = '#B45309';
      dotColor = '#F59E0B';
    }

    const totalP = focusedLiveSession.participants.length;
    const markedP =
      focusedLiveSession.attended_count + focusedLiveSession.no_show_count;
    const completionPct = totalP > 0 ? Math.round((markedP / totalP) * 100) : 0;

    return {
      isInProgress,
      isCompleted,
      isLiveNow,
      isUpcomingSoon,
      badgeText,
      badgeBg,
      badgeBorder,
      badgeColor,
      dotColor,
      totalP,
      markedP,
      completionPct,
    };
  }, [focusedLiveSession]);

  const elapsedLiveStr = useMemo(() => {
    if (!focusedLiveSession || focusedLiveSession.session_status !== 'in_progress') {
      return null;
    }
    return formatElapsedSince(focusedLiveSession.started_at, liveClock);
  }, [focusedLiveSession, liveClock]);

  const startedAtHhMm = useMemo(
    () => formatIsoToHhMm(focusedLiveSession?.started_at),
    [focusedLiveSession?.started_at]
  );

  const endedAtHhMm = useMemo(
    () => formatIsoToHhMm(focusedLiveSession?.ended_at),
    [focusedLiveSession?.ended_at]
  );

  const hasDifferentActiveSession = Boolean(
    autoMatchedSession &&
      focusedLiveSession &&
      autoMatchedSession.id !== focusedLiveSession.id &&
      (autoMatchedSession.time_state === 'live_now' ||
        autoMatchedSession.session_status === 'in_progress')
  );

  const todaySessionsList = liveData?.today_sessions ?? [];
  const upcomingSessionsList = liveData?.upcoming_sessions ?? [];

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleCombinedRefresh}
            tintColor={COLORS.secondary}
          />
        }
      >
        {/* 1. GERÇEK ZAMANLI SAAT & CANLI STÜDYO BARI */}
        <View style={styles.liveClockHeroCard}>
          <View style={styles.liveClockTopRow}>
            <View style={styles.liveClockLeft}>
              <View style={styles.liveSignalPill}>
                <View style={styles.liveSignalDot} />
                <Text style={styles.liveSignalText}>CANLI SAAT • STÜDYO AKIŞI</Text>
              </View>
              <Text style={styles.liveClockTimeText}>
                {formatClockHhMmSs(liveClock)}
              </Text>
              <Text style={styles.liveClockDateText}>
                {formatTurkishFullDate(liveClock)}
              </Text>
            </View>

            <View style={styles.liveClockRight}>
              <TouchableOpacity
                style={styles.liveRefreshIconBtn}
                onPress={() => fetchLiveAttendance(true)}
                activeOpacity={0.8}
                disabled={liveSyncing}
              >
                {liveSyncing ? (
                  <ActivityIndicator size="small" color={COLORS.primaryGlow} />
                ) : (
                  <RefreshCw size={16} color={COLORS.primaryGlow} />
                )}
              </TouchableOpacity>
              <Text style={styles.liveSyncCaption}>
                {lastSyncedAt
                  ? `Senkron ${formatClockHhMm(lastSyncedAt)}`
                  : '30 sn oto-yenile'}
              </Text>
            </View>
          </View>

          {/* Canlı Geri Bildirim Toast */}
          {liveToast && (
            <View
              style={[
                styles.liveToastBanner,
                liveToast.type === 'success'
                  ? styles.liveToastSuccess
                  : styles.liveToastError,
              ]}
            >
              {liveToast.type === 'success' ? (
                <CheckCircle2 size={14} color="#86EFAC" />
              ) : (
                <AlertTriangle size={14} color="#FCA5A5" />
              )}
              <Text
                style={[
                  styles.liveToastText,
                  liveToast.type === 'error' && styles.liveToastTextError,
                ]}
              >
                {liveToast.text}
              </Text>
            </View>
          )}
        </View>

        {/* 2. CANLI DERS & ANLIK YOKLAMA ANA PANELİ */}
        <View
          style={[
            styles.liveAttendanceCard,
            focusedMeta?.isLiveNow && styles.liveAttendanceCardActiveBorder,
          ]}
        >
          <View style={styles.liveCardHeaderRow}>
            <View style={styles.liveCardTitleCluster}>
              <View
                style={[
                  styles.liveCardIconWrap,
                  focusedMeta?.isLiveNow && styles.liveCardIconWrapLive,
                ]}
              >
                <Radio
                  size={16}
                  color={focusedMeta?.isLiveNow ? '#15803D' : COLORS.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.liveCardHeading}>
                  Canlı Ders & Anlık Yoklama
                </Text>
                <Text style={styles.liveCardSubheading}>
                  Saat eşleştirmeli ders girişi ve tek dokunuşlu yoklama
                </Text>
              </View>
            </View>

            {hasDifferentActiveSession && autoMatchedSession && (
              <TouchableOpacity
                style={styles.returnLivePill}
                onPress={() => handleSelectLiveSession(autoMatchedSession.id)}
                activeOpacity={0.85}
              >
                <View style={styles.returnLiveDot} />
                <Text style={styles.returnLiveText}>Aktif Derse Dön</Text>
              </TouchableOpacity>
            )}
          </View>

          {liveLoading && !focusedLiveSession ? (
            <View style={styles.liveLoaderBox}>
              <ActivityIndicator size="small" color={COLORS.secondary} />
              <Text style={styles.liveLoaderText}>
                Saat bazlı canlı ders verisi yükleniyor...
              </Text>
            </View>
          ) : !focusedLiveSession || !focusedMeta ? (
            <View style={styles.liveEmptyBox}>
              <View style={styles.liveEmptyIconWrap}>
                <Calendar size={22} color={COLORS.secondary} />
              </View>
              <Text style={styles.liveEmptyTitle}>
                Şu an planlı canlı ders bulunmuyor
              </Text>
              <Text style={styles.liveEmptySub}>
                Bugün veya yaklaşan günlerde yeni ders oluşturarak canlı saat takibi
                ve yoklama başlatabilirsiniz.
              </Text>
              <TouchableOpacity
                style={styles.emptyCreateBtn}
                onPress={onGoToCreateSession}
                activeOpacity={0.85}
              >
                <CalendarPlus size={15} color={COLORS.white} />
                <Text style={styles.emptyCreateBtnText}>Yeni Ders Oluştur</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Aktif Ders Durum Rozeti & Saat / Salon Özeti */}
              <View style={styles.liveSessionHeroBox}>
                <View style={styles.liveSessionStatusRow}>
                  <View
                    style={[
                      styles.liveStatusPill,
                      {
                        backgroundColor: focusedMeta.badgeBg,
                        borderColor: focusedMeta.badgeBorder,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.liveStatusDot,
                        { backgroundColor: focusedMeta.dotColor },
                      ]}
                    />
                    <Text
                      style={[
                        styles.liveStatusPillText,
                        { color: focusedMeta.badgeColor },
                      ]}
                    >
                      {focusedMeta.badgeText}
                    </Text>
                  </View>

                  <View style={styles.liveDateTagPill}>
                    <Text style={styles.liveDateTagText}>
                      {
                        formatTurkishDateLabel(
                          focusedLiveSession.session_date || getTodayIso()
                        ).primary
                      }
                    </Text>
                  </View>
                </View>

                <Text style={styles.liveSessionTitle}>
                  {focusedLiveSession.title}
                </Text>

                <View style={styles.liveSessionMetaRow}>
                  <View style={styles.liveMetaChipStrong}>
                    <Clock size={13} color={COLORS.secondary} />
                    <Text style={styles.liveMetaChipTimeText}>
                      {focusedLiveSession.start_time} - {focusedLiveSession.end_time}
                    </Text>
                    <Text style={styles.liveMetaChipDurText}>
                      ({focusedLiveSession.duration_minutes} dk)
                    </Text>
                  </View>

                  <View style={styles.roomBadge}>
                    <MapPin size={12} color={COLORS.textSecondary} />
                    <Text style={styles.roomBadgeText} numberOfLines={1}>
                      {focusedLiveSession.room || 'Ana Stüdyo'}
                    </Text>
                  </View>

                  <View style={styles.liveCapChip}>
                    <Users size={12} color={COLORS.primary} />
                    <Text style={styles.liveCapChipText}>
                      {focusedLiveSession.booked_count}/{focusedLiveSession.capacity}
                    </Text>
                  </View>
                </View>

                {/* DERSE GİRİŞ & BİTİŞ KONTROL ALANI */}
                <View style={styles.classControlArea}>
                  {focusedLiveSession.session_status === 'scheduled' ? (
                    <TouchableOpacity
                      style={styles.startClassBtn}
                      onPress={() => handleStartClass(focusedLiveSession)}
                      disabled={classActionBusyId === focusedLiveSession.id}
                      activeOpacity={0.86}
                    >
                      {classActionBusyId === focusedLiveSession.id ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <>
                          <Play size={16} color={COLORS.white} fill={COLORS.white} />
                          <Text style={styles.startClassBtnText}>
                            Derse Gir ve Yoklamayı Başlat
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : focusedLiveSession.session_status === 'in_progress' ? (
                    <View style={styles.inProgressControlBox}>
                      <View style={styles.inProgressTimerRow}>
                        <View style={styles.inProgressBadgeCluster}>
                          <Timer size={15} color="#15803D" />
                          <View>
                            <Text style={styles.inProgressLabel}>
                              Ders Devam Ediyor
                            </Text>
                            <Text style={styles.inProgressSub}>
                              {startedAtHhMm
                                ? `Başlangıç: ${startedAtHhMm}`
                                : 'Canlı süre kaydı aktif'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.elapsedPill}>
                          <View style={styles.elapsedLiveDot} />
                          <Text style={styles.elapsedPillText}>
                            {elapsedLiveStr || '00:00'}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.completeClassBtn}
                        onPress={() => handleCompleteClass(focusedLiveSession)}
                        disabled={classActionBusyId === focusedLiveSession.id}
                        activeOpacity={0.86}
                      >
                        {classActionBusyId === focusedLiveSession.id ? (
                          <ActivityIndicator size="small" color={COLORS.white} />
                        ) : (
                          <>
                            <Square size={14} color={COLORS.white} fill={COLORS.white} />
                            <Text style={styles.completeClassBtnText}>
                              Dersi Tamamla
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.completedControlBanner}>
                      <CheckCircle2 size={17} color={COLORS.success} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.completedBannerTitle}>
                          Ders Tamamlandı & Saat Kaydedildi
                        </Text>
                        <Text style={styles.completedBannerSub}>
                          {startedAtHhMm && endedAtHhMm
                            ? `${startedAtHhMm} - ${endedAtHhMm} • `
                            : ''}
                          Kaydedilen süre:{' '}
                          {focusedLiveSession.actual_duration_minutes ??
                            focusedLiveSession.duration_minutes}{' '}
                          dk
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* CANLI YOKLAMA SAYAÇ ŞERİDİ (Geldi / Gelmedi / Bekliyor) */}
              <View style={styles.counterStripWrap}>
                <View style={styles.counterStripRow}>
                  <View style={[styles.counterCell, styles.counterCellAttended]}>
                    <Text style={[styles.counterNumber, { color: '#15803D' }]}>
                      {focusedLiveSession.attended_count}
                    </Text>
                    <Text style={[styles.counterLabel, { color: '#166534' }]}>
                      Geldi
                    </Text>
                  </View>

                  <View style={[styles.counterCell, styles.counterCellNoShow]}>
                    <Text style={[styles.counterNumber, { color: '#B91C1C' }]}>
                      {focusedLiveSession.no_show_count}
                    </Text>
                    <Text style={[styles.counterLabel, { color: '#991B1B' }]}>
                      Gelmedi
                    </Text>
                  </View>

                  <View style={[styles.counterCell, styles.counterCellPending]}>
                    <Text style={[styles.counterNumber, { color: '#B45309' }]}>
                      {focusedLiveSession.pending_count}
                    </Text>
                    <Text style={[styles.counterLabel, { color: '#92400E' }]}>
                      Bekliyor
                    </Text>
                  </View>
                </View>

                {focusedMeta.totalP > 0 && (
                  <View style={styles.attendanceProgressRow}>
                    <View style={styles.attendanceProgressTrack}>
                      <View
                        style={[
                          styles.attendanceProgressFill,
                          { width: `${focusedMeta.completionPct}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.attendanceProgressLabel}>
                      {focusedMeta.markedP}/{focusedMeta.totalP} yoklama tamamlandı
                    </Text>
                  </View>
                )}
              </View>

              {/* TEK DOKUNUŞLU ÖĞRENCİ YOKLAMA LİSTESİ */}
              <View style={styles.liveParticipantsHeader}>
                <Users size={14} color={COLORS.primary} />
                <Text style={styles.subSectionTitle}>
                  Ders Öğrencileri & Yoklama ({focusedLiveSession.participants.length})
                </Text>
              </View>

              {focusedLiveSession.participants.length === 0 ? (
                <View style={styles.noAttendeeCard}>
                  <Text style={styles.noAttendeeText}>
                    Bu derse henüz kayıtlı öğrenci bulunmuyor.
                  </Text>
                </View>
              ) : (
                <View style={styles.liveParticipantsList}>
                  {focusedLiveSession.participants.map((p) => {
                    const schedAtt =
                      scheduleAttendeeLookup.byBooking.get(p.booking_id) ??
                      scheduleAttendeeLookup.byMember.get(p.member_id);
                    const snap = memberSnapshots[p.member_id];
                    const effectiveZones =
                      snap?.zones ??
                      p.body_zones ??
                      (schedAtt?.body_zones as Record<string, string> | null) ??
                      undefined;
                    const zoneAlerts = extractBodyZoneAlerts(effectiveZones);
                    const hasInjuredZone = zoneAlerts.some(
                      (z) => z.status === 'injured'
                    );
                    const hasWarningZone = zoneAlerts.some(
                      (z) => z.status === 'warning'
                    );
                    const effectiveEnergy =
                      snap?.wellness?.energy_status ??
                      p.today_energy_status ??
                      schedAtt?.today_energy_status ??
                      'normal';
                    const isLowEnergy = effectiveEnergy === 'low';
                    const effectiveNotes = p.notes ?? schedAtt?.notes ?? '';
                    const hasNote = Boolean(
                      effectiveNotes && effectiveNotes.trim().length > 0
                    );
                    const isMarking = Boolean(markingBookingIds[p.booking_id]);
                    const checkedInHhMm = formatIsoToHhMm(p.checked_in_at);
                    const isLowCredit = Boolean(
                      schedAtt &&
                        (schedAtt.low_credit_warning ||
                          schedAtt.remaining_credits <= 2)
                    );

                    return (
                      <View
                        key={p.booking_id}
                        style={[
                          styles.attendeeCard,
                          p.status === 'attended' && styles.liveRowAttendedBg,
                          p.status === 'no_show' && styles.liveRowNoShowBg,
                          hasWarningZone && styles.attendeeCardWarningBorder,
                          hasInjuredZone && styles.attendeeCardInjuredBorder,
                        ]}
                      >
                        {/* Üst Satır: Avatar + Öğrenci Bilgisi (CRM Modal) + Hızlı Harita / Not */}
                        <View style={styles.attendeeHeaderRow}>
                          <TouchableOpacity
                            style={styles.attendeeIdentityTouch}
                            onPress={() => openLiveParticipantCrmModal(p)}
                            activeOpacity={0.8}
                          >
                            <MemberAvatar
                              uri={schedAtt?.avatar_url}
                              name={p.member_name}
                              size={44}
                              borderRadius={14}
                              accentColor={
                                hasInjuredZone
                                  ? '#EF4444'
                                  : hasWarningZone || isLowCredit
                                  ? COLORS.warning
                                  : p.status === 'attended'
                                  ? '#16A34A'
                                  : COLORS.primary
                              }
                            />

                            <View style={styles.attendeeInfoCol}>
                              <View style={styles.attendeeNameInlineWrap}>
                                <Text
                                  style={styles.attendeeName}
                                  numberOfLines={1}
                                >
                                  {p.member_name}
                                </Text>

                                {p.status === 'attended' && checkedInHhMm && (
                                  <View style={styles.checkedInTimePill}>
                                    <Text style={styles.checkedInTimeText}>
                                      {checkedInHhMm} giriş
                                    </Text>
                                  </View>
                                )}

                                {p.status === 'booked' && (
                                  <View style={styles.pendingStatusChip}>
                                    <Text style={styles.pendingStatusChipText}>
                                      Bekliyor
                                    </Text>
                                  </View>
                                )}

                                {zoneAlerts.length > 0 && (
                                  <View
                                    style={[
                                      styles.nameSideAlertDot,
                                      hasInjuredZone
                                        ? styles.nameSideAlertDotRed
                                        : styles.nameSideAlertDotAmber,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.nameSideAlertDotText,
                                        {
                                          color: hasInjuredZone
                                            ? '#B91C1C'
                                            : '#B45309',
                                        },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {zoneAlerts[0].shortText}
                                      {zoneAlerts.length > 1
                                        ? ` +${zoneAlerts.length - 1}`
                                        : ''}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              <View style={styles.contactInlineRow}>
                                <Phone size={11} color={COLORS.textMuted} />
                                <Text
                                  style={styles.attendeeContactText}
                                  numberOfLines={1}
                                >
                                  {p.member_phone || schedAtt?.phone || 'Telefon yok'}
                                  {schedAtt
                                    ? ` • ${schedAtt.remaining_credits}/${
                                        schedAtt.total_credits || '-'
                                      } Kredi`
                                    : typeof p.remaining_credits === 'number'
                                    ? ` • ${p.remaining_credits} Kredi`
                                    : ''}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>

                          <View style={styles.headerBadgesRight}>
                            <TouchableOpacity
                              style={styles.quickHeatmapBtn}
                              onPress={() => openLiveParticipantCrmModal(p)}
                              activeOpacity={0.8}
                            >
                              <Activity size={13} color={COLORS.primary} />
                              <Text style={styles.quickHeatmapBtnText}>Harita</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.quickNoteIconBtn}
                              onPress={() =>
                                openEditModal({
                                  member_id: p.member_id,
                                  full_name: p.member_name,
                                  avatar_url: schedAtt?.avatar_url,
                                  notes: effectiveNotes,
                                })
                              }
                              activeOpacity={0.78}
                            >
                              <Edit3 size={14} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Kas / Sakatlık Bölge Uyarıları (BodyHeatmapCard) */}
                        {zoneAlerts.length > 0 && (
                          <View style={styles.attendeeZoneBadgesWrap}>
                            {zoneAlerts.map((za) => (
                              <TouchableOpacity
                                key={za.zone}
                                style={[
                                  styles.attendeeZoneAlertBadge,
                                  za.status === 'injured'
                                    ? styles.attendeeZoneAlertInjured
                                    : styles.attendeeZoneAlertWarning,
                                ]}
                                onPress={() => openLiveParticipantCrmModal(p)}
                                activeOpacity={0.82}
                              >
                                <Text
                                  style={[
                                    styles.attendeeZoneAlertText,
                                    {
                                      color:
                                        za.status === 'injured'
                                          ? '#B91C1C'
                                          : '#B45309',
                                    },
                                  ]}
                                >
                                  {za.badgeText}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}

                        {/* Düşük Enerji / Uyku Rozeti */}
                        {isLowEnergy && (
                          <TouchableOpacity
                            style={styles.lowEnergyAttendeeBadge}
                            onPress={() => openLiveParticipantCrmModal(p)}
                            activeOpacity={0.84}
                          >
                            <Zap size={14} color="#7C2D12" />
                            <Text style={styles.lowEnergyAttendeeBadgeText}>
                              ⚡ Bugün Enerjisi/Uykusu Düşük - Tempolu Yüklenme
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Sakatlık / Özel Not Kutusu */}
                        {hasNote && (
                          <TouchableOpacity
                            style={styles.injuryWarningBox}
                            onPress={() =>
                              openEditModal({
                                member_id: p.member_id,
                                full_name: p.member_name,
                                avatar_url: schedAtt?.avatar_url,
                                notes: effectiveNotes,
                              })
                            }
                            activeOpacity={0.82}
                          >
                            <AlertTriangle size={15} color={COLORS.warningText} />
                            <Text style={styles.injuryWarningText}>
                              {effectiveNotes}
                            </Text>
                            <View style={styles.editNoteChip}>
                              <Edit3 size={11} color={COLORS.warningText} />
                              <Text style={styles.editNoteChipText}>Düzenle</Text>
                            </View>
                          </TouchableOpacity>
                        )}

                        {/* Tek Dokunuşlu Geldi / Gelmedi Yoklama Butonları */}
                        <View style={styles.liveAttendanceBtnRow}>
                          <TouchableOpacity
                            style={[
                              styles.liveAttBtn,
                              styles.liveAttBtnGreenIdle,
                              p.status === 'attended' && styles.liveAttBtnGreenActive,
                            ]}
                            disabled={isMarking}
                            onPress={() =>
                              handleLiveMarkAttendance(
                                p.booking_id,
                                p.status,
                                'attended'
                              )
                            }
                            activeOpacity={0.85}
                          >
                            {isMarking ? (
                              <ActivityIndicator
                                size="small"
                                color={
                                  p.status === 'attended' ? COLORS.white : '#15803D'
                                }
                              />
                            ) : (
                              <>
                                <Check
                                  size={16}
                                  color={
                                    p.status === 'attended'
                                      ? COLORS.white
                                      : '#15803D'
                                  }
                                />
                                <Text
                                  style={[
                                    styles.liveAttBtnText,
                                    {
                                      color:
                                        p.status === 'attended'
                                          ? COLORS.white
                                          : '#15803D',
                                    },
                                  ]}
                                >
                                  Geldi
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.liveAttBtn,
                              styles.liveAttBtnRedIdle,
                              p.status === 'no_show' && styles.liveAttBtnRedActive,
                            ]}
                            disabled={isMarking}
                            onPress={() =>
                              handleLiveMarkAttendance(
                                p.booking_id,
                                p.status,
                                'no_show'
                              )
                            }
                            activeOpacity={0.85}
                          >
                            {isMarking ? (
                              <ActivityIndicator
                                size="small"
                                color={
                                  p.status === 'no_show' ? COLORS.white : '#B91C1C'
                                }
                              />
                            ) : (
                              <>
                                <XCircle
                                  size={16}
                                  color={
                                    p.status === 'no_show'
                                      ? COLORS.white
                                      : '#B91C1C'
                                  }
                                />
                                <Text
                                  style={[
                                    styles.liveAttBtnText,
                                    {
                                      color:
                                        p.status === 'no_show'
                                          ? COLORS.white
                                          : '#B91C1C',
                                    },
                                  ]}
                                >
                                  Gelmedi
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* 3. BUGÜNÜN DİĞER DERSLERİ & YAKLAŞAN DERSLER (SEÇİLEBİLİR TEMİZ KARTLAR) */}
        {todaySessionsList.length > 0 && (
          <View style={styles.quickSwitchSection}>
            <View style={styles.quickSwitchHeader}>
              <View style={styles.quickSwitchTitleRow}>
                <Clock size={14} color={COLORS.secondary} />
                <Text style={styles.quickSwitchTitle}>
                  Bugünün Dersleri ({todaySessionsList.length})
                </Text>
              </View>
              <Text style={styles.quickSwitchHint}>Yoklama için ders seçin</Text>
            </View>

            <View style={styles.quickSwitchList}>
              {todaySessionsList.map((sess) => {
                const isSelected = focusedLiveSession?.id === sess.id;
                const isLive =
                  sess.session_status === 'in_progress' ||
                  sess.time_state === 'live_now';
                const isDone =
                  sess.session_status === 'completed' ||
                  sess.time_state === 'completed';

                return (
                  <TouchableOpacity
                    key={sess.id}
                    style={[
                      styles.quickSessionCard,
                      isSelected && styles.quickSessionCardSelected,
                    ]}
                    onPress={() => handleSelectLiveSession(sess.id)}
                    activeOpacity={0.84}
                  >
                    <View style={styles.quickSessionTimeCol}>
                      <Text
                        style={[
                          styles.quickSessionStart,
                          isSelected && styles.quickSessionStartSelected,
                        ]}
                      >
                        {sess.start_time}
                      </Text>
                      <Text style={styles.quickSessionEnd}>{sess.end_time}</Text>
                    </View>

                    <View style={styles.quickSessionDivider} />

                    <View style={styles.quickSessionInfoCol}>
                      <View style={styles.quickSessionTopMeta}>
                        <Text
                          style={styles.quickSessionTitle}
                          numberOfLines={1}
                        >
                          {sess.title}
                        </Text>
                        {isLive ? (
                          <View style={styles.miniLiveChip}>
                            <View style={styles.miniLiveDot} />
                            <Text style={styles.miniLiveChipText}>Aktif</Text>
                          </View>
                        ) : isDone ? (
                          <View style={styles.miniDoneChip}>
                            <Text style={styles.miniDoneChipText}>Bitti</Text>
                          </View>
                        ) : (
                          <View style={styles.miniSoonChip}>
                            <Text style={styles.miniSoonChipText}>Sırada</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.quickSessionSub} numberOfLines={1}>
                        {sess.room || 'Ana Stüdyo'} • {sess.attended_count}/
                        {sess.booked_count} geldi • {sess.pending_count} bekliyor
                      </Text>
                    </View>

                    <ChevronRight
                      size={16}
                      color={isSelected ? COLORS.secondary : COLORS.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {upcomingSessionsList.length > 0 && (
          <View style={styles.quickSwitchSection}>
            <View style={styles.quickSwitchHeader}>
              <View style={styles.quickSwitchTitleRow}>
                <Calendar size={14} color={COLORS.primary} />
                <Text style={styles.quickSwitchTitle}>
                  Yaklaşan Dersler ({upcomingSessionsList.length})
                </Text>
              </View>
              <Text style={styles.quickSwitchHint}>Önizleme & hazırlık</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.upcomingHorizontalRow}
            >
              {upcomingSessionsList.map((sess) => {
                const isSelected = focusedLiveSession?.id === sess.id;
                const dtFmt = formatTurkishDateLabel(
                  sess.session_date || getTodayIso()
                );

                return (
                  <TouchableOpacity
                    key={sess.id}
                    style={[
                      styles.upcomingMiniCard,
                      isSelected && styles.upcomingMiniCardSelected,
                    ]}
                    onPress={() => handleSelectLiveSession(sess.id)}
                    activeOpacity={0.84}
                  >
                    <View style={styles.upcomingMiniHeader}>
                      <Text style={styles.upcomingMiniDate}>
                        {dtFmt.primary} • {sess.start_time}
                      </Text>
                      {isSelected && (
                        <View style={styles.selectedTagMini}>
                          <Text style={styles.selectedTagMiniText}>Seçili</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.upcomingMiniTitle} numberOfLines={1}>
                      {sess.title}
                    </Text>
                    <Text style={styles.upcomingMiniMeta} numberOfLines={1}>
                      {sess.room || 'Ana Stüdyo'} • {sess.booked_count}/
                      {sess.capacity} üye
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 4. MEVCUT TAM TAKVİM, TARİH FİLTRESİ & YEDEK LİSTELER */}
        <View style={styles.fullScheduleDividerRow}>
          <View style={styles.fullScheduleDividerLine} />
          <Text style={styles.fullScheduleDividerLabel}>
            TÜM DERS TAKVİMİ & YEDEK LİSTELER
          </Text>
          <View style={styles.fullScheduleDividerLine} />
        </View>

        {/* Yatay Tarih Seçici */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateBar}
        >
          <TouchableOpacity
            style={[
              styles.datePill,
              selectedDate === ALL_DATES_KEY && styles.datePillActive,
            ]}
            onPress={() => handleSelectDate(ALL_DATES_KEY)}
            activeOpacity={0.85}
          >
            <Layers
              size={15}
              color={selectedDate === ALL_DATES_KEY ? COLORS.white : COLORS.secondary}
            />
            <View>
              <Text
                style={[
                  styles.datePillTitle,
                  selectedDate === ALL_DATES_KEY && styles.datePillTitleActive,
                ]}
              >
                Tümü
              </Text>
              <Text
                style={[
                  styles.datePillSub,
                  selectedDate === ALL_DATES_KEY && styles.datePillSubActive,
                ]}
              >
                {data.sessions.length} Ders
              </Text>
            </View>
          </TouchableOpacity>

          {dateOptions.map((dt) => {
            const active = selectedDate === dt;
            const fmt = formatTurkishDateLabel(dt);
            const countOnDate = data.sessions.filter((s) => s.date === dt).length;
            return (
              <TouchableOpacity
                key={dt}
                style={[styles.datePill, active && styles.datePillActive]}
                onPress={() => handleSelectDate(dt)}
                activeOpacity={0.85}
              >
                <View>
                  <Text
                    style={[styles.datePillTitle, active && styles.datePillTitleActive]}
                  >
                    {fmt.primary}
                  </Text>
                  <Text style={[styles.datePillSub, active && styles.datePillSubActive]}>
                    {fmt.secondary} • {countOnDate} Ders
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Günlük Özet Kartı */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryCardHeader}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.headerIconDot}>
                <Clock size={15} color={COLORS.secondary} />
              </View>
              <View>
                <Text style={styles.sectionHeading}>
                  {selectedDate === ALL_DATES_KEY
                    ? `Tüm Ders Akışım (${visibleSessions.length})`
                    : formatTurkishDateLabel(selectedDate).full}
                </Text>
                <Text style={styles.sectionSubText}>
                  Canlı kontenjan, katılımcı notları ve yoklama özeti
                </Text>
              </View>
            </View>

            {summaryStats.totalWaitlist > 0 && (
              <View style={styles.summaryWaitlistChip}>
                <Hourglass size={11} color={COLORS.warningText} />
                <Text style={styles.summaryWaitlistText}>
                  {summaryStats.totalWaitlist} Yedek
                </Text>
              </View>
            )}
          </View>

          <View style={styles.bentoStatsRow}>
            <View style={styles.miniBentoBox}>
              <View style={[styles.bentoIconWrap, { backgroundColor: COLORS.secondaryLight }]}>
                <Dumbbell size={15} color={COLORS.secondary} />
              </View>
              <Text style={styles.bentoStatNumber}>{summaryStats.totalClasses}</Text>
              <Text style={styles.bentoStatLabel} numberOfLines={1}>
                Toplam Ders
              </Text>
            </View>

            <View style={styles.miniBentoBox}>
              <View style={[styles.bentoIconWrap, { backgroundColor: COLORS.primaryLight }]}>
                <Users size={15} color={COLORS.primary} />
              </View>
              <Text style={styles.bentoStatNumber}>
                {summaryStats.totalEnrolled}
                <Text style={styles.bentoStatSubCap}>/{summaryStats.totalCapacity}</Text>
              </Text>
              <Text style={styles.bentoStatLabel} numberOfLines={1}>
                Kayıtlı Üye
              </Text>
            </View>

            <View style={styles.miniBentoBox}>
              <View
                style={[
                  styles.bentoIconWrap,
                  {
                    backgroundColor:
                      summaryStats.fillRatePct >= 80
                        ? COLORS.warningBg
                        : COLORS.primaryLight,
                  },
                ]}
              >
                <Percent
                  size={15}
                  color={
                    summaryStats.fillRatePct >= 80
                      ? COLORS.warningText
                      : COLORS.primary
                  }
                />
              </View>
              <Text
                style={[
                  styles.bentoStatNumber,
                  {
                    color:
                      summaryStats.fillRatePct >= 80
                        ? COLORS.warningText
                        : COLORS.primary,
                  },
                ]}
              >
                %{summaryStats.fillRatePct}
              </Text>
              <Text style={styles.bentoStatLabel} numberOfLines={1}>
                Doluluk Oranı
              </Text>
            </View>
          </View>
        </View>

        {/* Saatlik Ders Kartları & Yoklama Akışı */}
        {visibleSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Calendar size={26} color={COLORS.secondary} />
            </View>
            <Text style={styles.emptyTitle}>Seçili tarihte açık dersiniz bulunmuyor</Text>
            <Text style={styles.emptySub}>
              Üstten farklı bir gün seçebilir veya takviminize hemen yeni bir grup ya da
              birebir PT seansı ekleyebilirsiniz.
            </Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={onGoToCreateSession}
              activeOpacity={0.85}
            >
              <CalendarPlus size={16} color={COLORS.white} />
              <Text style={styles.emptyCreateBtnText}>Bu Güne Yeni Ders Aç</Text>
            </TouchableOpacity>
          </View>
        ) : (
          visibleSessions.map((session: TrainerSession) => {
            const expanded = Boolean(expandedSessionIds[session.id]);
            const isFull = session.current_enrolled >= session.capacity;
            const spotsLeft = Math.max(0, session.capacity - session.current_enrolled);
            const isLastSpot = !isFull && spotsLeft === 1;
            const fillRatio =
              session.capacity > 0
                ? Math.min(1, session.current_enrolled / session.capacity)
                : 0;
            const waitlistCount = session.waitlist?.length ?? 0;
            const catVisual = getCategoryVisuals(session.category);

            return (
              <View
                key={session.id}
                style={[
                  styles.sessionBentoCard,
                  expanded && styles.sessionBentoCardExpanded,
                ]}
              >
                <TouchableOpacity
                  style={styles.sessionHeaderTouch}
                  onPress={() => toggleExpand(session.id)}
                  activeOpacity={0.85}
                >
                  {/* Saat + Doluluk & Yedek Rozetleri */}
                  <View style={styles.sessionTopRow}>
                    <View style={styles.timeAndDateCol}>
                      <View style={styles.timePillBox}>
                        <Clock size={13} color={COLORS.secondary} />
                        <Text style={styles.bigStartTime}>{session.start_time}</Text>
                        <Text style={styles.endTimeSub}>- {session.end_time}</Text>
                      </View>
                      {selectedDate === ALL_DATES_KEY && (
                        <Text style={styles.allModeDateTag}>
                          {formatTurkishDateLabel(session.date).full}
                        </Text>
                      )}
                    </View>

                    <View style={styles.topRightGroup}>
                      {waitlistCount > 0 && (
                        <View style={styles.waitlistCountBadge}>
                          <Text style={styles.waitlistCountBadgeText}>
                            ⏳ {waitlistCount} Yedek
                          </Text>
                        </View>
                      )}

                      <View
                        style={[
                          styles.occupancyBadge,
                          isFull
                            ? styles.occupancyFull
                            : isLastSpot
                            ? styles.occupancyWarn
                            : styles.occupancyOpen,
                        ]}
                      >
                        <Text
                          style={[
                            styles.occupancyBadgeText,
                            {
                              color: isFull
                                ? COLORS.dangerText
                                : isLastSpot
                                ? COLORS.warningText
                                : COLORS.primary,
                            },
                          ]}
                        >
                          {session.current_enrolled}/{session.capacity}{' '}
                          {isFull ? 'Dolu' : 'Kayıt'}
                        </Text>
                      </View>

                      <View style={styles.chevronCircle}>
                        {expanded ? (
                          <ChevronUp size={17} color={COLORS.textSecondary} />
                        ) : (
                          <ChevronDown size={17} color={COLORS.textSecondary} />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Ders Başlığı */}
                  <Text style={styles.sessionTitleText}>{session.title}</Text>

                  {/* Kategori Rozeti + Stüdyo Oda Bilgisi */}
                  <View style={styles.metaChipsRow}>
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor: catVisual.bg,
                          borderColor: catVisual.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.categoryBadgeText, { color: catVisual.color }]}
                      >
                        {catVisual.label}
                      </Text>
                    </View>

                    <View style={styles.roomBadge}>
                      <MapPin size={12} color={COLORS.textSecondary} />
                      <Text style={styles.roomBadgeText} numberOfLines={1}>
                        {session.room || 'Ana Stüdyo'}
                      </Text>
                    </View>
                  </View>

                  {/* Doluluk Çubuğu */}
                  <View style={styles.progressTrackWrap}>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.round(fillRatio * 100)}%`,
                            backgroundColor: isFull
                              ? COLORS.danger
                              : isLastSpot
                              ? COLORS.warning
                              : COLORS.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressHintText}>
                      {expanded
                        ? 'Katılımcı listesini daraltmak için dokunun'
                        : `${session.attendees.length} katılımcı${
                            waitlistCount > 0 ? ` • ${waitlistCount} yedek` : ''
                          } • Yoklama almak için dokunun`}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Açılır Detay: Katılımcılar & Yedek Liste */}
                {expanded && (
                  <View style={styles.expandedContentWrap}>
                    <View style={styles.subSectionHeader}>
                      <Users size={14} color={COLORS.primary} />
                      <Text style={styles.subSectionTitle}>
                        Katılımcı Listesi ({session.attendees.length}/{session.capacity})
                      </Text>
                    </View>

                    {session.attendees.length === 0 ? (
                      <View style={styles.noAttendeeCard}>
                        <Text style={styles.noAttendeeText}>
                          Bu derse henüz kayıtlı üye bulunmuyor.
                        </Text>
                      </View>
                    ) : (
                      session.attendees.map((att) => {
                        const enrichedAtt = att as TrainerAttendee &
                          EnrichedTrainerMemberFields;
                        const snap = memberSnapshots[att.member_id];
                        const effectiveZones = snap?.zones ?? enrichedAtt.body_zones;
                        const zoneAlerts = extractBodyZoneAlerts(effectiveZones);
                        const hasInjuredZone = zoneAlerts.some(
                          (z) => z.status === 'injured'
                        );
                        const hasWarningZone = zoneAlerts.some(
                          (z) => z.status === 'warning'
                        );
                        const effectiveEnergy =
                          snap?.wellness?.energy_status ??
                          enrichedAtt.today_energy_status ??
                          'normal';
                        const isLowEnergy = effectiveEnergy === 'low';

                        const isBusy = busyBookingId === att.booking_id;
                        const isLow = att.low_credit_warning || att.remaining_credits <= 2;
                        const hasNote = Boolean(att.notes && att.notes.trim().length > 0);

                        return (
                          <View
                            key={att.booking_id}
                            style={[
                              styles.attendeeCard,
                              hasWarningZone && styles.attendeeCardWarningBorder,
                              hasInjuredZone && styles.attendeeCardInjuredBorder,
                            ]}
                          >
                            {/* Üst Satır: Avatar + İsim/İletişim (Tıklanabilir Harita/CRM) + Kalan Kredi & Hızlı Harita */}
                            <View style={styles.attendeeHeaderRow}>
                              <TouchableOpacity
                                style={styles.attendeeIdentityTouch}
                                onPress={() => openStudentHeatmapModal(att)}
                                activeOpacity={0.8}
                              >
                                <MemberAvatar
                                  uri={att.avatar_url}
                                  name={att.full_name}
                                  size={44}
                                  borderRadius={14}
                                  accentColor={
                                    hasInjuredZone
                                      ? '#EF4444'
                                      : hasWarningZone || isLow
                                      ? COLORS.warning
                                      : COLORS.primary
                                  }
                                />

                                <View style={styles.attendeeInfoCol}>
                                  <View style={styles.attendeeNameInlineWrap}>
                                    <Text style={styles.attendeeName} numberOfLines={1}>
                                      {att.full_name}
                                    </Text>
                                    {zoneAlerts.length > 0 && (
                                      <View
                                        style={[
                                          styles.nameSideAlertDot,
                                          hasInjuredZone
                                            ? styles.nameSideAlertDotRed
                                            : styles.nameSideAlertDotAmber,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.nameSideAlertDotText,
                                            {
                                              color: hasInjuredZone
                                                ? '#B91C1C'
                                                : '#B45309',
                                            },
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {zoneAlerts[0].shortText}
                                          {zoneAlerts.length > 1
                                            ? ` +${zoneAlerts.length - 1}`
                                            : ''}
                                        </Text>
                                      </View>
                                    )}
                                  </View>

                                  <View style={styles.contactInlineRow}>
                                    <Phone size={11} color={COLORS.textMuted} />
                                    <Text
                                      style={styles.attendeeContactText}
                                      numberOfLines={1}
                                    >
                                      {att.phone}
                                      {att.instagram_handle
                                        ? ` • ${att.instagram_handle}`
                                        : ''}
                                    </Text>
                                  </View>
                                </View>
                              </TouchableOpacity>

                              <View style={styles.headerBadgesRight}>
                                <View
                                  style={[
                                    styles.remainingPill,
                                    isLow
                                      ? styles.remainingPillWarn
                                      : styles.remainingPillOk,
                                  ]}
                                >
                                  {isLow && <Flame size={11} color={COLORS.warningText} />}
                                  <Text
                                    style={[
                                      styles.remainingPillText,
                                      {
                                        color: isLow
                                          ? COLORS.warningText
                                          : COLORS.primary,
                                      },
                                    ]}
                                  >
                                    {att.remaining_credits}/{att.total_credits || '-'} Kredi
                                  </Text>
                                </View>

                                <TouchableOpacity
                                  style={styles.quickHeatmapBtn}
                                  onPress={() => openStudentHeatmapModal(att)}
                                  activeOpacity={0.8}
                                >
                                  <Activity size={13} color={COLORS.primary} />
                                  <Text style={styles.quickHeatmapBtnText}>Harita</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.quickNoteIconBtn}
                                  onPress={() => openEditModal(att)}
                                  activeOpacity={0.78}
                                >
                                  <Edit3 size={14} color={COLORS.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* Kırmızı / Sarı Bölge Uyarıları (Vücut Haritası) */}
                            {zoneAlerts.length > 0 && (
                              <View style={styles.attendeeZoneBadgesWrap}>
                                {zoneAlerts.map((za) => (
                                  <TouchableOpacity
                                    key={za.zone}
                                    style={[
                                      styles.attendeeZoneAlertBadge,
                                      za.status === 'injured'
                                        ? styles.attendeeZoneAlertInjured
                                        : styles.attendeeZoneAlertWarning,
                                    ]}
                                    onPress={() => openStudentHeatmapModal(att)}
                                    activeOpacity={0.82}
                                  >
                                    <Text
                                      style={[
                                        styles.attendeeZoneAlertText,
                                        {
                                          color:
                                            za.status === 'injured'
                                              ? '#B91C1C'
                                              : '#B45309',
                                        },
                                      ]}
                                    >
                                      {za.badgeText}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}

                            {/* Müşteri O Gün "low" Enerji Seçtiyse Otomatik Uyarı Rozeti */}
                            {isLowEnergy && (
                              <TouchableOpacity
                                style={styles.lowEnergyAttendeeBadge}
                                onPress={() => openStudentHeatmapModal(att)}
                                activeOpacity={0.84}
                              >
                                <Zap size={14} color="#7C2D12" />
                                <Text style={styles.lowEnergyAttendeeBadgeText}>
                                  ⚡ Bugün Enerjisi/Uykusu Düşük - Tempolu Yüklenme
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Düşük Kredi Bilgilendirme Etiketi */}
                            {isLow && (
                              <View style={styles.lowCreditBanner}>
                                <Flame size={12} color={COLORS.warningText} />
                                <Text style={styles.lowCreditBannerText}>
                                  Paket yenileme zamanı yaklaştı (Kalan:{' '}
                                  {att.remaining_credits} ders)
                                </Text>
                              </View>
                            )}

                            {/* Kehribar Sakatlık / Özel Not Kutusu */}
                            {hasNote ? (
                              <TouchableOpacity
                                style={styles.injuryWarningBox}
                                onPress={() => openEditModal(att)}
                                activeOpacity={0.82}
                              >
                                <AlertTriangle size={15} color={COLORS.warningText} />
                                <Text style={styles.injuryWarningText}>
                                  {att.notes}
                                </Text>
                                <View style={styles.editNoteChip}>
                                  <Edit3 size={11} color={COLORS.warningText} />
                                  <Text style={styles.editNoteChipText}>Düzenle</Text>
                                </View>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.addNoteSubtleBtn}
                                onPress={() => openEditModal(att)}
                                activeOpacity={0.78}
                              >
                                <Edit3 size={12} color={COLORS.textSecondary} />
                                <Text style={styles.addNoteSubtleText}>
                                  Sakatlık / özel antrenman notu ekle
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Yoklama Aksiyon Butonları */}
                            <View style={styles.thumbActionsRow}>
                              <TouchableOpacity
                                style={[
                                  styles.thumbBtn,
                                  att.status === 'attended' && styles.thumbBtnAttendedActive,
                                ]}
                                disabled={isBusy}
                                onPress={() => handleAttendancePress(att, 'attended')}
                                activeOpacity={0.85}
                              >
                                {isBusy ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={
                                      att.status === 'attended'
                                        ? COLORS.white
                                        : '#15803D'
                                    }
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.thumbBtnText,
                                      att.status === 'attended' &&
                                        styles.thumbBtnTextAttendedActive,
                                    ]}
                                  >
                                    ✅ Geldi
                                  </Text>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[
                                  styles.thumbBtn,
                                  att.status === 'no_show' && styles.thumbBtnNoShowActive,
                                ]}
                                disabled={isBusy}
                                onPress={() => handleAttendancePress(att, 'no_show')}
                                activeOpacity={0.85}
                              >
                                {isBusy ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={
                                      att.status === 'no_show'
                                        ? COLORS.white
                                        : COLORS.danger
                                    }
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.thumbBtnText,
                                      att.status === 'no_show' &&
                                        styles.thumbBtnTextNoShowActive,
                                    ]}
                                  >
                                    ❌ Gelmedi
                                  </Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}

                    {/* Yedek Listede Bekleyenler (Waitlist) */}
                    {waitlistCount > 0 && (
                      <View style={styles.waitlistSectionBox}>
                        <View style={styles.waitlistHeaderRow}>
                          <View style={styles.waitlistTitleCluster}>
                            <Hourglass size={14} color={COLORS.warningText} />
                            <Text style={styles.waitlistTitleText}>
                              Yedek Listede Bekleyenler ({waitlistCount})
                            </Text>
                          </View>
                          <View style={styles.autoPromoteTag}>
                            <Text style={styles.autoPromoteTagText}>
                              Otomatik Terfi Aktif
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.waitlistSubDesc}>
                          Derste iptal olduğunda sıradaki kredili üye otomatik olarak asil
                          listeye alınır.
                        </Text>

                        <View style={styles.waitlistRowsWrap}>
                          {(session.waitlist ?? []).map((w: WaitlistEntry) => (
                            <View key={w.waitlist_id} style={styles.waitlistMemberRow}>
                              <View style={styles.waitlistPositionBadge}>
                                <Text style={styles.waitlistPositionText}>
                                  #{w.position}
                                </Text>
                              </View>

                              <MemberAvatar
                                uri={w.avatar_url}
                                name={w.full_name}
                                size={38}
                                borderRadius={12}
                                accentColor={COLORS.secondary}
                              />

                              <View style={styles.waitlistMemberInfo}>
                                <Text style={styles.waitlistMemberName} numberOfLines={1}>
                                  {w.full_name}
                                </Text>
                                <Text
                                  style={styles.waitlistMemberContact}
                                  numberOfLines={1}
                                >
                                  {w.phone}
                                  {w.instagram_handle ? ` • ${w.instagram_handle}` : ''}
                                </Text>
                              </View>

                              <View style={styles.waitlistCreditBadge}>
                                <Text style={styles.waitlistCreditText}>
                                  {w.remaining_credits}/{w.total_credits || '-'} Kredi
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Hızlı Sakatlık & Özel Antrenman Notu Düzenleme Modalı */}
      <Modal
        visible={Boolean(editingMember)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingMember(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <SafeAreaView style={styles.modalSheet} edges={['bottom']}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderUserRow}>
                {editingMember && (
                  <MemberAvatar
                    uri={editingMember.avatar_url}
                    name={editingMember.full_name}
                    size={44}
                    borderRadius={14}
                    accentColor={COLORS.warning}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Sakatlık & Özel Antrenman Notu</Text>
                  <Text style={styles.modalSubtitle}>{editingMember?.full_name}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setEditingMember(null)}
              >
                <X size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Örn: Sol diz menisküs hassasiyeti var, derin squat ve sıçrama hareketlerinden kaçınılmalı..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingMember(null)}
                disabled={savingNote}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleConfirmNote}
                disabled={savingNote}
              >
                {savingNote ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Notu Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* İnteraktif Vücut Haritası & Öğrenci CRM Detay Modalı */}
      {selectedCrmMember ? (
        <Suspense fallback={null}>
          <TrainerMemberCrmModal
            visible={Boolean(selectedCrmMember)}
            member={selectedCrmMember}
            onClose={() => setSelectedCrmMember(null)}
            onMemberMutated={async () => {
              onRefresh();
              fetchLiveAttendance(true);
            }}
            onZonesMutated={(mid, updatedZones) => {
              setMemberSnapshots((prev) => ({
                ...prev,
                [mid]: {
                  ...prev[mid],
                  zones: updatedZones,
                },
              }));
              setSelectedCrmMember((prev) =>
                prev && prev.id === mid ? { ...prev, body_zones: updatedZones } : prev
              );
            }}
          />
        </Suspense>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 42,
  },

  /* Gerçek Zamanlı Saat Hero Kartı */
  liveClockHeroCard: {
    backgroundColor: COLORS.espresso,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#3B322A',
    gap: 12,
    ...CARD_SHADOW,
  },
  liveClockTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  liveClockLeft: {
    flex: 1,
    gap: 4,
  },
  liveSignalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(229, 193, 108, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229, 193, 108, 0.3)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveSignalDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },
  liveSignalText: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveClockTimeText: {
    color: COLORS.white,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  liveClockDateText: {
    color: '#D4C4AA',
    fontSize: 13,
    fontWeight: '600',
  },
  liveClockRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  liveRefreshIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 193, 108, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveSyncCaption: {
    color: '#A89A8A',
    fontSize: 10.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  liveToastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  liveToastSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.18)',
    borderColor: 'rgba(134, 239, 172, 0.35)',
  },
  liveToastError: {
    backgroundColor: 'rgba(220, 38, 38, 0.22)',
    borderColor: 'rgba(252, 165, 165, 0.4)',
  },
  liveToastText: {
    flex: 1,
    color: '#ECFDF5',
    fontSize: 12,
    fontWeight: '700',
  },
  liveToastTextError: {
    color: '#FEE2E2',
  },

  /* Canlı Ders & Anlık Yoklama Ana Kartı */
  liveAttendanceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  liveAttendanceCardActiveBorder: {
    borderColor: '#86EFAC',
    borderWidth: 1.5,
  },
  liveCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  liveCardTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  liveCardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveCardIconWrapLive: {
    backgroundColor: '#DCFCE7',
  },
  liveCardHeading: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  liveCardSubheading: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  returnLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  returnLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#16A34A',
  },
  returnLiveText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
  },
  liveLoaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  liveLoaderText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  liveEmptyBox: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  liveEmptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveEmptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  liveEmptySub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  liveSessionHeroBox: {
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  liveSessionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  liveStatusPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  liveDateTagPill: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDateTagText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  liveSessionTitle: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  liveSessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  liveMetaChipStrong: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: COLORS.secondaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  liveMetaChipTimeText: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  liveMetaChipDurText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  liveCapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveCapChipText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  /* Derse Giriş & Bitiş Kontrol Stilleri */
  classControlArea: {
    marginTop: 4,
  },
  startClassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#15803D',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  startClassBtnText: {
    color: COLORS.white,
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  inProgressControlBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 15,
    padding: 12,
    gap: 10,
  },
  inProgressTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inProgressBadgeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  inProgressLabel: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  inProgressSub: {
    color: '#15803D',
    fontSize: 11.5,
    fontWeight: '600',
  },
  elapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.espresso,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
  },
  elapsedLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },
  elapsedPillText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  completeClassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  completeClassBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  completedControlBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  completedBannerTitle: {
    color: COLORS.success,
    fontSize: 13,
    fontWeight: '800',
  },
  completedBannerSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },

  /* Canlı Yoklama Sayaç Şeridi */
  counterStripWrap: {
    gap: 8,
  },
  counterStripRow: {
    flexDirection: 'row',
    gap: 8,
  },
  counterCell: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    gap: 2,
  },
  counterCellAttended: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  counterCellNoShow: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  counterCellPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  counterNumber: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  attendanceProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attendanceProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
  },
  attendanceProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#16A34A',
  },
  attendanceProgressLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  /* Canlı Yoklama Öğrenci Satırları */
  liveParticipantsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveParticipantsList: {
    gap: 10,
  },
  liveRowAttendedBg: {
    backgroundColor: '#F7FDF9',
    borderColor: '#BBF7D0',
  },
  liveRowNoShowBg: {
    backgroundColor: '#FEF8F8',
    borderColor: '#FECACA',
  },
  checkedInTimePill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  checkedInTimeText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pendingStatusChip: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pendingStatusChipText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
  },
  liveAttendanceBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  liveAttBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.3,
    paddingVertical: 10,
  },
  liveAttBtnGreenIdle: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  liveAttBtnGreenActive: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
  },
  liveAttBtnRedIdle: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  liveAttBtnRedActive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  liveAttBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
  },

  /* Bugünün Diğer Dersleri & Yaklaşan Dersler */
  quickSwitchSection: {
    marginBottom: 16,
    gap: 10,
  },
  quickSwitchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  quickSwitchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickSwitchTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  quickSwitchHint: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  quickSwitchList: {
    gap: 8,
  },
  quickSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  quickSessionCardSelected: {
    borderColor: COLORS.secondary,
    borderWidth: 1.5,
    backgroundColor: COLORS.secondarySurface,
  },
  quickSessionTimeCol: {
    alignItems: 'center',
    minWidth: 46,
  },
  quickSessionStart: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  quickSessionStartSelected: {
    color: COLORS.secondary,
  },
  quickSessionEnd: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  quickSessionDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  quickSessionInfoCol: {
    flex: 1,
    gap: 3,
  },
  quickSessionTopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickSessionTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  quickSessionSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  miniLiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  miniLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#16A34A',
  },
  miniLiveChipText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '800',
  },
  miniSoonChip: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  miniSoonChipText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  miniDoneChip: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  miniDoneChipText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  upcomingHorizontalRow: {
    gap: 10,
    paddingRight: 6,
  },
  upcomingMiniCard: {
    width: 215,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
    ...CARD_SHADOW,
  },
  upcomingMiniCardSelected: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    backgroundColor: COLORS.primarySurface,
  },
  upcomingMiniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  upcomingMiniDate: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  selectedTagMini: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  selectedTagMiniText: {
    color: COLORS.white,
    fontSize: 9.5,
    fontWeight: '800',
  },
  upcomingMiniTitle: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  upcomingMiniMeta: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },

  /* Bölüm Ayırıcı */
  fullScheduleDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  fullScheduleDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderStrong,
  },
  fullScheduleDividerLabel: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  /* Mevcut Takvim & Kart Stilleri */
  dateBar: {
    gap: 10,
    paddingBottom: 16,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  datePillActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  datePillTitle: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  datePillTitleActive: {
    color: COLORS.white,
  },
  datePillSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  datePillSubActive: {
    color: COLORS.secondaryLight,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...CARD_SHADOW,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconDot: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  summaryWaitlistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  summaryWaitlistText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  bentoStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  miniBentoBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  bentoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoStatNumber: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  bentoStatSubCap: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  bentoStatLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  emptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCreateBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  sessionBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  sessionBentoCardExpanded: {
    borderColor: '#E5C5C9',
  },
  sessionHeaderTouch: {
    gap: 2,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  timeAndDateCol: {
    gap: 4,
  },
  timePillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bigStartTime: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  endTimeSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  allModeDateTag: {
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
    marginTop: 2,
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  waitlistCountBadge: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  waitlistCountBadgeText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  occupancyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  occupancyOpen: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  occupancyWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  occupancyFull: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  occupancyBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  chevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitleText: {
    color: COLORS.textPrimary,
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  metaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roomBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  progressTrackWrap: {
    gap: 7,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressHintText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  expandedContentWrap: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subSectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  noAttendeeCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noAttendeeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  attendeeCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  attendeeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attendeeInfoCol: {
    flex: 1,
    gap: 3,
  },
  attendeeName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  contactInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attendeeContactText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  headerBadgesRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  remainingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  remainingPillOk: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  remainingPillWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  remainingPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  quickNoteIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowCreditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  lowCreditBannerText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '700',
  },
  injuryWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  injuryWarningText: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  editNoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editNoteChipText: {
    color: COLORS.warningText,
    fontSize: 10.5,
    fontWeight: '800',
  },
  addNoteSubtleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addNoteSubtleText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  thumbActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
  },
  thumbBtnAttendedActive: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
  },
  thumbBtnNoShowActive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  thumbBtnText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  thumbBtnTextAttendedActive: {
    color: COLORS.white,
  },
  thumbBtnTextNoShowActive: {
    color: COLORS.white,
  },
  waitlistSectionBox: {
    marginTop: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 15,
    gap: 10,
  },
  waitlistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  waitlistTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  waitlistTitleText: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '800',
  },
  autoPromoteTag: {
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  autoPromoteTagText: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
  },
  waitlistSubDesc: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  waitlistRowsWrap: {
    gap: 8,
  },
  waitlistMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  waitlistPositionBadge: {
    minWidth: 30,
    height: 28,
    borderRadius: 9,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  waitlistPositionText: {
    color: COLORS.warningText,
    fontSize: 12,
    fontWeight: '900',
  },
  waitlistMemberInfo: {
    flex: 1,
    gap: 2,
  },
  waitlistMemberName: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  waitlistMemberContact: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  waitlistCreditBadge: {
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
  },
  waitlistCreditText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(34, 29, 25, 0.36)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 15,
    ...CARD_SHADOW,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalHeaderUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  closeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 14,
    padding: 14,
    minHeight: 110,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  modalSaveBtn: {
    flex: 1.4,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  attendeeCardWarningBorder: {
    borderColor: '#FCD34D',
    borderWidth: 1.4,
  },
  attendeeCardInjuredBorder: {
    borderColor: '#FCA5A5',
    borderWidth: 1.5,
  },
  attendeeIdentityTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  attendeeNameInlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  nameSideAlertDot: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  nameSideAlertDotRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  nameSideAlertDotAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  nameSideAlertDotText: {
    fontSize: 10,
    fontWeight: '800',
  },
  quickHeatmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 32,
  },
  quickHeatmapBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  attendeeZoneBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attendeeZoneAlertBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1.2,
  },
  attendeeZoneAlertInjured: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  attendeeZoneAlertWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  attendeeZoneAlertText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  lowEnergyAttendeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFF7ED',
    borderWidth: 1.2,
    borderColor: '#FB923C',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  lowEnergyAttendeeBadgeText: {
    flex: 1,
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
});
