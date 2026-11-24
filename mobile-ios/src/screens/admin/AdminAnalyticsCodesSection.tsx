import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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
  Award,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { FONTS } from '@/theme/colors';

// ---------------------------------------------------------------------------
// Yerel API Tip Tanımları (src/types/* dosyalarına dokunulmaz)
// ---------------------------------------------------------------------------

export interface MonthlyAnalyticsSummary {
  total_trainer_hours: number;
  total_sessions_scheduled: number;
  total_sessions_entered: number;
  total_registered_members: number;
  logged_in_members_count: number;
  active_members_count: number;
  passive_members_count: number;
  worked_with_members_count: number;
  total_member_hours: number;
  policy_signed_count: number;
  policy_pending_count: number;
}

export interface MonthlyTrainerAnalytics {
  trainer_id: number;
  full_name: string;
  specialty: string;
  access_code: string;
  sessions_scheduled: number;
  sessions_entered: number;
  sessions_completed: number;
  total_hours_taught: number;
  total_attended_students: number;
  total_no_show_students: number;
  attendance_rate_pct: number;
  unique_members_trained: number;
}

export interface MonthlyMemberAnalytics {
  member_id: number;
  full_name: string;
  phone: string;
  access_code: string;
  status: 'active' | 'passive';
  has_logged_in: boolean;
  last_login_at: string | null;
  login_count: number;
  attended_sessions: number;
  no_show_sessions: number;
  total_hours_attended: number;
  remaining_credits: number;
  policy_accepted: boolean;
  policy_accepted_at: string | null;
}

export interface MonthlyAnalyticsResponse {
  month: string;
  month_label: string;
  summary: MonthlyAnalyticsSummary;
  trainers: MonthlyTrainerAnalytics[];
  members: MonthlyMemberAnalytics[];
}

export interface AdminAccessCodeRecord {
  user_id: number;
  full_name: string;
  role: string;
  phone: string;
  access_code: string;
  is_active: boolean;
  last_login_at: string | null;
  login_count: number;
  policy_accepted: boolean;
  policy_accepted_at: string | null;
  remaining_credits: number;
}

export interface CreateWithCodeResponse {
  user_id?: number;
  id?: number;
  full_name?: string;
  role?: string;
  phone?: string;
  access_code: string;
  remaining_credits?: number;
  message?: string;
}

export interface RegenerateCodeResponse {
  user_id?: number;
  id?: number;
  full_name?: string;
  access_code: string;
  message?: string;
}

export interface AdminPolicyRecord {
  user_id: number;
  full_name: string;
  role: string;
  access_code: string;
  policy_accepted: boolean;
  policy_accepted_at: string | null;
  policy_version: string;
  file_name: string | null;
  file_exists: boolean;
  file_size_bytes: number;
}

export interface AdminPoliciesResponse {
  storage_folder: string;
  signed_count: number;
  pending_count: number;
  records: AdminPolicyRecord[];
}

export interface AdminPolicyDocumentResponse {
  user_id: number;
  full_name: string;
  file_name: string;
  accepted_at: string | null;
  content: string;
}

// ---------------------------------------------------------------------------
// Koyu Lüks Admin Tema Paleti (AdminControlScreen ile birebir uyumlu)
// ---------------------------------------------------------------------------

const UI = {
  bg: '#0B111E',
  surface: '#121B2E',
  elevated: '#18243C',
  input: '#0E1626',
  border: '#23324F',
  borderStrong: '#32476E',
  gold: '#C9A452',
  goldBright: '#E5C16C',
  goldSoft: 'rgba(201, 164, 82, 0.14)',
  goldBorder: 'rgba(201, 164, 82, 0.36)',
  emerald: '#34D399',
  emeraldSoft: 'rgba(52, 211, 153, 0.14)',
  emeraldBorder: 'rgba(52, 211, 153, 0.34)',
  indigo: '#818CF8',
  indigoSoft: 'rgba(129, 140, 248, 0.14)',
  indigoBorder: 'rgba(129, 140, 248, 0.34)',
  amber: '#FBBF24',
  amberSoft: 'rgba(251, 191, 36, 0.14)',
  amberBorder: 'rgba(251, 191, 36, 0.34)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  dangerBorder: 'rgba(248, 113, 113, 0.34)',
  text: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  darkInk: '#090D16',
};

const TURKISH_MONTHS = [
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

function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const parts = ym.split('-');
  const year = parseInt(parts[0] || '', 10) || new Date().getFullYear();
  const monthIdx = (parseInt(parts[1] || '', 10) || 1) - 1;
  const date = new Date(year, monthIdx + deltaMonths, 1);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, '0');
  return `${nextY}-${nextM}`;
}

function formatMonthLabelFallback(ym: string): string {
  const parts = ym.split('-');
  const year = parseInt(parts[0] || '', 10);
  const monthNum = parseInt(parts[1] || '', 10);
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) return ym;
  return `${TURKISH_MONTHS[monthNum - 1]} ${year}`;
}

function formatHours(value: number | null | undefined): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(1).replace('.', ',');
}

function formatDateTimeTr(iso: string | null | undefined): string {
  if (!iso) return 'Henüz yok';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.replace('T', ' ').slice(0, 16);
  }
}

function formatFileSize(bytes: number | null | undefined): string {
  const safe = typeof bytes === 'number' && bytes > 0 ? bytes : 0;
  if (safe === 0) return '0 B';
  if (safe < 1024) return `${safe} B`;
  return `${(safe / 1024).toFixed(1)} KB`;
}

function getRoleLabel(role: string): string {
  if (role === 'trainer') return 'Eğitmen';
  if (role === 'admin') return 'Yönetici';
  return 'Üye';
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below
    }
    try {
      if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (copied) return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

function useAuthorizedRequest() {
  const { authToken } = useAuthDemo();

  return useCallback(
    async <T,>(endpoint: string, options: RequestInit = {}): Promise<T> => {
      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> | undefined),
      };
      if (authToken && !headers.Authorization) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      return apiRequest<T>(endpoint, {
        ...options,
        headers,
      });
    },
    [authToken]
  );
}

// ===========================================================================
// MODÜL A: AYLIK RAPORLAR & ANALİTİK (HOCA & ÜYE)
// ===========================================================================

type MemberActivityFilter = 'all' | 'active' | 'passive' | 'logged_in';

export function AdminMonthlyAnalyticsView() {
  const authorizedRequest = useAuthorizedRequest();

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth);
  const [data, setData] = useState<MonthlyAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [memberFilter, setMemberFilter] = useState<MemberActivityFilter>('all');
  const [memberSearch, setMemberSearch] = useState<string>('');

  const fetchMonthlyReport = useCallback(
    async (monthKey: string, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const res = await authorizedRequest<MonthlyAnalyticsResponse>(
          `/admin/analytics/monthly?month=${encodeURIComponent(monthKey)}`
        );
        setData(res);
      } catch (err: any) {
        setErrorText(err?.message || 'Aylık analitik verileri alınamadı.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authorizedRequest]
  );

  useEffect(() => {
    fetchMonthlyReport(selectedMonth, false);
  }, [fetchMonthlyReport, selectedMonth]);

  const monthLabel = data?.month_label || formatMonthLabelFallback(selectedMonth);
  const currentYm = useMemo(() => getCurrentYearMonth(), []);
  const summary = data?.summary;
  const trainers = data?.trainers ?? [];
  const members = data?.members ?? [];

  const memberFilterCounts = useMemo(() => {
    let active = 0;
    let passive = 0;
    let loggedIn = 0;
    for (const m of members) {
      if (m.status === 'active') active += 1;
      else passive += 1;
      if (m.has_logged_in) loggedIn += 1;
    }
    return {
      all: members.length,
      active,
      passive,
      logged_in: loggedIn,
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase('tr-TR');
    return members.filter((m) => {
      if (memberFilter === 'active' && m.status !== 'active') return false;
      if (memberFilter === 'passive' && m.status !== 'passive') return false;
      if (memberFilter === 'logged_in' && !m.has_logged_in) return false;

      if (!q) return true;
      return (
        (m.full_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (m.phone || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (m.access_code || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [memberFilter, memberSearch, members]);

  const maxTrainerHours = useMemo(() => {
    return trainers.reduce((acc, t) => Math.max(acc, t.total_hours_taught || 0), 0);
  }, [trainers]);

  return (
    <View style={styles.sectionStack}>
      {/* Ay Seçici Çubuğu */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.goldSoft }]}>
            <BarChart3 size={20} color={UI.goldBright} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Aylık Raporlar & Analitik</Text>
            <Text style={styles.cardSub}>
              Eğitmen ders saatleri, üye giriş aktivitesi ve aylık katılım performansı.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => fetchMonthlyReport(selectedMonth, true)}
            disabled={refreshing || loading}
            accessibilityLabel="Raporu yenile"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={UI.goldBright} />
            ) : (
              <RefreshCw size={16} color={UI.text} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.monthPickerBar}>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => setSelectedMonth((prev) => shiftYearMonth(prev, -1))}
            activeOpacity={0.85}
          >
            <ChevronLeft size={16} color={UI.text} />
            <Text style={styles.monthNavBtnText}>Önceki Ay</Text>
          </TouchableOpacity>

          <View style={styles.monthCenterBox}>
            <Text style={styles.monthCenterLabel}>{monthLabel}</Text>
            <Text style={styles.monthCenterCode}>{selectedMonth}</Text>
          </View>

          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => setSelectedMonth((prev) => shiftYearMonth(prev, 1))}
            activeOpacity={0.85}
          >
            <Text style={styles.monthNavBtnText}>Sonraki Ay</Text>
            <ChevronRight size={16} color={UI.text} />
          </TouchableOpacity>
        </View>

        {selectedMonth !== currentYm && (
          <TouchableOpacity
            style={styles.todayMonthChip}
            onPress={() => setSelectedMonth(currentYm)}
          >
            <Text style={styles.todayMonthChipText}>Bu Aya Dön ({formatMonthLabelFallback(currentYm)})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hata Kutusu */}
      {errorText ? (
        <View style={styles.errorBanner}>
          <AlertTriangle size={16} color={UI.danger} />
          <Text style={styles.errorBannerText}>{errorText}</Text>
          <TouchableOpacity
            style={styles.retryPill}
            onPress={() => fetchMonthlyReport(selectedMonth, false)}
          >
            <Text style={styles.retryPillText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Yükleniyor */}
      {loading && !data ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={UI.gold} />
          <Text style={styles.loadingCardText}>{monthLabel} raporu hazırlanıyor...</Text>
        </View>
      ) : summary ? (
        <>
          {/* Üst Özet Metrik Kartları */}
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { borderColor: UI.goldBorder }]}>
              <View style={styles.kpiTopRow}>
                <Text style={styles.kpiLabel}>TOPLAM HOCA DERS SAATİ</Text>
                <Clock size={15} color={UI.goldBright} />
              </View>
              <Text style={[styles.kpiBigValue, { color: UI.goldBright }]}>
                {formatHours(summary.total_trainer_hours)} sa
              </Text>
              <Text style={styles.kpiSubLine}>
                Girilen Ders:{' '}
                <Text style={styles.kpiSubStrong}>{summary.total_sessions_entered}</Text> /{' '}
                {summary.total_sessions_scheduled} planlı
              </Text>
            </View>

            <View style={[styles.kpiCard, { borderColor: UI.indigoBorder }]}>
              <View style={styles.kpiTopRow}>
                <Text style={styles.kpiLabel}>GİRİŞ YAPAN ÜYE</Text>
                <UserCheck size={15} color={UI.indigo} />
              </View>
              <Text style={[styles.kpiBigValue, { color: UI.indigo }]}>
                {summary.logged_in_members_count}
                <Text style={styles.kpiDenom}> / {summary.total_registered_members}</Text>
              </Text>
              <Text style={styles.kpiSubLine}>
                Uygulamaya giriş yapan kayıtlı üye
              </Text>
            </View>

            <View style={[styles.kpiCard, { borderColor: UI.emeraldBorder }]}>
              <View style={styles.kpiTopRow}>
                <Text style={styles.kpiLabel}>AKTİF / PASİF ÜYE</Text>
                <Activity size={15} color={UI.emerald} />
              </View>
              <View style={styles.splitMetricRow}>
                <Text style={[styles.kpiBigValue, { color: UI.emerald }]}>
                  {summary.active_members_count}
                </Text>
                <Text style={styles.splitSlash}>/</Text>
                <Text style={[styles.kpiBigValue, { color: UI.amber }]}>
                  {summary.passive_members_count}
                </Text>
              </View>
              <Text style={styles.kpiSubLine}>
                {summary.active_members_count} aktif · {summary.passive_members_count} pasif üye
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Text style={styles.kpiLabel}>BU AY ÇALIŞILAN ÜYE</Text>
                <Users size={15} color={UI.textSec} />
              </View>
              <Text style={styles.kpiBigValue}>{summary.worked_with_members_count}</Text>
              <Text style={styles.kpiSubLine}>
                Toplam Üye Ders Saati:{' '}
                <Text style={[styles.kpiSubStrong, { color: UI.emerald }]}>
                  {formatHours(summary.total_member_hours)} sa
                </Text>
              </Text>
            </View>
          </View>

          {/* Sözleşme Özet Şeridi */}
          <View style={styles.policyStrip}>
            <View style={styles.policyStripLeft}>
              <ShieldCheck size={15} color={UI.emerald} />
              <Text style={styles.policyStripText}>
                Politika Sözleşmesi Durumu:
              </Text>
            </View>
            <View style={styles.rowWrap}>
              <View style={styles.emeraldPill}>
                <Text style={styles.emeraldPillText}>
                  {summary.policy_signed_count} Onaylı
                </Text>
              </View>
              <View style={styles.amberPill}>
                <Text style={styles.amberPillText}>
                  {summary.policy_pending_count} Bekleyen
                </Text>
              </View>
            </View>
          </View>

          {/* Hoca Aylık Ders Saatleri Bölümü */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: UI.indigoSoft }]}>
                <Award size={20} color={UI.indigo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Hoca Aylık Ders Saatleri ({trainers.length})
                </Text>
                <Text style={styles.cardSub}>
                  {monthLabel} dönemi eğitmen bazlı verilen ders saati, yoklama ve katılım oranı.
                </Text>
              </View>
            </View>

            {trainers.length === 0 ? (
              <Text style={styles.emptyText}>
                Bu ay için eğitmen ders kaydı bulunmuyor.
              </Text>
            ) : (
              trainers.map((tr) => {
                const attendancePct = Math.max(
                  0,
                  Math.min(100, Math.round(tr.attendance_rate_pct || 0))
                );
                const barColor =
                  attendancePct >= 75
                    ? UI.emerald
                    : attendancePct >= 50
                    ? UI.goldBright
                    : UI.amber;
                const hoursRatio =
                  maxTrainerHours > 0
                    ? Math.min(100, Math.round(((tr.total_hours_taught || 0) / maxTrainerHours) * 100))
                    : 0;

                return (
                  <View key={tr.trainer_id} style={styles.itemCard}>
                    <View style={styles.itemTopRow}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.rowWrap}>
                          <Text style={styles.itemTitle}>{tr.full_name}</Text>
                          {tr.access_code ? (
                            <View style={styles.codePill}>
                              <Text style={styles.codePillText}>{tr.access_code}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.trainerSpecialty}>
                          {tr.specialty || 'Reformer Pilates Eğitmeni'}
                        </Text>
                      </View>

                      <View style={styles.hoursBadge}>
                        <Text style={styles.hoursBadgeVal}>
                          {formatHours(tr.total_hours_taught)} sa
                        </Text>
                        <Text style={styles.hoursBadgeLbl}>
                          {tr.sessions_entered} DERS
                        </Text>
                      </View>
                    </View>

                    {/* Eğitmen Metrik Satırı */}
                    <View style={styles.miniMetricsGrid}>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Girilen / Planlı</Text>
                        <Text style={styles.miniMetricValue}>
                          {tr.sessions_entered} / {tr.sessions_scheduled}
                        </Text>
                      </View>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Farklı Üye</Text>
                        <Text style={styles.miniMetricValue}>{tr.unique_members_trained}</Text>
                      </View>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Katılan</Text>
                        <Text style={[styles.miniMetricValue, { color: UI.emerald }]}>
                          {tr.total_attended_students}
                        </Text>
                      </View>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Gelmeyen</Text>
                        <Text style={[styles.miniMetricValue, { color: UI.amber }]}>
                          {tr.total_no_show_students}
                        </Text>
                      </View>
                    </View>

                    {/* Katılım Oranı İlerleme Çubuğu */}
                    <View style={styles.progressWrap}>
                      <View style={styles.progressHeaderRow}>
                        <Text style={styles.progressLabel}>
                          Katılım Oranı (Yoklama Başarısı)
                        </Text>
                        <Text style={[styles.progressPct, { color: barColor }]}>
                          %{attendancePct}
                        </Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${attendancePct}%`, backgroundColor: barColor },
                          ]}
                        />
                      </View>
                      {hoursRatio > 0 && (
                        <Text style={styles.progressFootNote}>
                          Tamamlanan seans: {tr.sessions_completed} · Aylık yoğunluk payı: %{hoursRatio}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Üye Aktivite & Çalışma Saatleri Bölümü */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: UI.emeraldSoft }]}>
                <Users size={20} color={UI.emerald} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Üye Aktivite & Çalışma Saatleri ({filteredMembers.length})
                </Text>
                <Text style={styles.cardSub}>
                  Üyelerin aktif/pasif durumu, son giriş bilgisi, aylık ders saati ve kalan kredisi.
                </Text>
              </View>
            </View>

            {/* Filtre Çipleri */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              {[
                { key: 'all' as const, label: `Tümü (${memberFilterCounts.all})` },
                { key: 'active' as const, label: `Aktif (${memberFilterCounts.active})` },
                { key: 'passive' as const, label: `Pasif (${memberFilterCounts.passive})` },
                { key: 'logged_in' as const, label: `Giriş Yapan (${memberFilterCounts.logged_in})` },
              ].map((chip) => {
                const selected = memberFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.filterChip, selected && styles.filterChipActive]}
                    onPress={() => setMemberFilter(chip.key)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selected && styles.filterChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Üye Arama Kutusu */}
            <View style={styles.searchBar}>
              <Search size={15} color={UI.textMuted} />
              <TextInput
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Üye adı, telefon veya giriş kodu ile ara..."
                placeholderTextColor={UI.textMuted}
                style={styles.searchInput}
              />
              {memberSearch ? (
                <TouchableOpacity onPress={() => setMemberSearch('')}>
                  <X size={15} color={UI.textSec} />
                </TouchableOpacity>
              ) : null}
            </View>

            {filteredMembers.length === 0 ? (
              <Text style={styles.emptyText}>
                Seçili filtre veya arama kriterine uyan üye bulunamadı.
              </Text>
            ) : (
              filteredMembers.map((m) => {
                const isActive = m.status === 'active';
                return (
                  <View key={m.member_id} style={styles.itemCard}>
                    <View style={styles.itemTopRow}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.rowWrap}>
                          <Text style={styles.itemTitle}>{m.full_name}</Text>
                          <View style={isActive ? styles.emeraldPill : styles.mutedPill}>
                            <Text
                              style={isActive ? styles.emeraldPillText : styles.mutedPillText}
                            >
                              {isActive ? 'Aktif' : 'Pasif'}
                            </Text>
                          </View>
                          <View style={m.policy_accepted ? styles.emeraldPill : styles.amberPill}>
                            <Text
                              style={
                                m.policy_accepted ? styles.emeraldPillText : styles.amberPillText
                              }
                            >
                              {m.policy_accepted ? 'Politika Onaylı' : 'Politika Bekliyor'}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.metaLine}>
                          {m.phone || 'Telefon yok'}
                          {m.access_code ? ` · Kod: ${m.access_code}` : ''}
                        </Text>
                        <Text style={styles.subMetaLine}>
                          Son Giriş:{' '}
                          {m.has_logged_in
                            ? `${formatDateTimeTr(m.last_login_at)} (${m.login_count} giriş)`
                            : 'Henüz giriş yapmadı'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.miniMetricsGrid}>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Katıldığı Ders</Text>
                        <Text style={[styles.miniMetricValue, { color: UI.goldBright }]}>
                          {m.attended_sessions}
                        </Text>
                      </View>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Ders Saati</Text>
                        <Text style={[styles.miniMetricValue, { color: UI.emerald }]}>
                          {formatHours(m.total_hours_attended)} sa
                        </Text>
                      </View>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Gelmediği</Text>
                        <Text
                          style={[
                            styles.miniMetricValue,
                            { color: m.no_show_sessions > 0 ? UI.danger : UI.textSec },
                          ]}
                        >
                          {m.no_show_sessions}
                        </Text>
                      </View>
                      <View style={styles.miniMetricBox}>
                        <Text style={styles.miniMetricLabel}>Kalan Kredi</Text>
                        <Text
                          style={[
                            styles.miniMetricValue,
                            { color: m.remaining_credits <= 2 ? UI.amber : UI.text },
                          ]}
                        >
                          {m.remaining_credits}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ===========================================================================
// MODÜL B: GİRİŞ KODLARI & ŞİRKET POLİTİKA SÖZLEŞMELERİ
// ===========================================================================

export interface AdminCodesPoliciesViewProps {
  onDataChanged?: () => void;
}

type RoleFilter = 'all' | 'member' | 'trainer';
type PolicyFilter = 'all' | 'signed' | 'pending';

export function AdminCodesPoliciesView({ onDataChanged }: AdminCodesPoliciesViewProps) {
  const authorizedRequest = useAuthorizedRequest();

  const [codes, setCodes] = useState<AdminAccessCodeRecord[]>([]);
  const [policies, setPolicies] = useState<AdminPoliciesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Yeni Üye & Kod Oluşturma Formu
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [role, setRole] = useState<'member' | 'trainer'>('member');
  const [initialCredits, setInitialCredits] = useState<string>('8');
  const [customCode, setCustomCode] = useState<string>('');
  const [specialty, setSpecialty] = useState<string>('Reformer Pilates Eğitmeni');
  const [notes, setNotes] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  // Yeni üretilen büyük kopyalanabilir kod kartı
  const [createdBanner, setCreatedBanner] = useState<{
    fullName: string;
    role: string;
    accessCode: string;
  } | null>(null);

  // Erişim kodları arama, filtre ve kopyalama state
  const [codeSearch, setCodeSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [regeneratingUserId, setRegeneratingUserId] = useState<number | null>(null);

  // Politika arşivi filtre & belge modal state
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('all');
  const [docModalVisible, setDocModalVisible] = useState<boolean>(false);
  const [docLoading, setDocLoading] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<AdminPolicyDocumentResponse | null>(null);
  const [activeDocUserId, setActiveDocUserId] = useState<number | null>(null);
  const [docCopied, setDocCopied] = useState<boolean>(false);

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => {
      setNotice((prev) => (prev?.text === text ? null : prev));
    }, 4200);
  }, []);

  const loadCodesAndPolicies = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const [codesRes, policiesRes] = await Promise.allSettled([
          authorizedRequest<AdminAccessCodeRecord[]>('/admin/access-codes'),
          authorizedRequest<AdminPoliciesResponse>('/admin/policies'),
        ]);

        if (codesRes.status === 'fulfilled' && Array.isArray(codesRes.value)) {
          setCodes(codesRes.value);
        } else if (codesRes.status === 'rejected') {
          showNotice(
            'error',
            codesRes.reason?.message || 'Erişim kodları listesi yüklenemedi.'
          );
        }

        if (policiesRes.status === 'fulfilled' && policiesRes.value) {
          setPolicies(policiesRes.value);
        } else if (policiesRes.status === 'rejected') {
          showNotice(
            'error',
            policiesRes.reason?.message || 'Politika sözleşme arşivi yüklenemedi.'
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authorizedRequest, showNotice]
  );

  useEffect(() => {
    loadCodesAndPolicies(false);
  }, [loadCodesAndPolicies]);

  const handleCopyCode = useCallback(
    async (code: string, key: string) => {
      const ok = await copyTextToClipboard(code);
      setCopiedCodeKey(key);
      setTimeout(() => {
        setCopiedCodeKey((prev) => (prev === key ? null : prev));
      }, 2200);
      showNotice(
        'success',
        ok
          ? `Giriş kodu panoya kopyalandı: ${code}`
          : `Giriş kodu hazır (manuel kopyalayın): ${code}`
      );
    },
    [showNotice]
  );

  const handleCreateMemberWithCode = useCallback(async () => {
    if (!fullName.trim()) {
      showNotice('error', 'Lütfen ad ve soyad girin.');
      return;
    }

    setCreating(true);
    try {
      const parsedCredits = Math.max(0, parseInt(initialCredits || '0', 10) || 0);
      const payload: Record<string, any> = {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        role,
        custom_code: customCode.trim() ? customCode.trim().toUpperCase() : undefined,
        notes: notes.trim() || undefined,
      };
      if (role === 'member') {
        payload.initial_credits = parsedCredits;
      } else {
        payload.specialty = specialty.trim() || 'Reformer Pilates Eğitmeni';
      }

      const res = await authorizedRequest<CreateWithCodeResponse>(
        '/admin/members/create-with-code',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      const generatedCode = res.access_code || customCode.trim().toUpperCase();
      setCreatedBanner({
        fullName: res.full_name || fullName.trim(),
        role: res.role || role,
        accessCode: generatedCode,
      });

      setFullName('');
      setPhone('');
      setCustomCode('');
      setNotes('');
      if (role === 'member') {
        setInitialCredits('8');
      }

      showNotice(
        'success',
        `${res.full_name || 'Kullanıcı'} oluşturuldu. Özel kod: ${generatedCode}`
      );
      await loadCodesAndPolicies(true);
      onDataChanged?.();
    } catch (err: any) {
      showNotice('error', err?.message || 'Yeni üye ve giriş kodu oluşturulamadı.');
    } finally {
      setCreating(false);
    }
  }, [
    authorizedRequest,
    customCode,
    fullName,
    initialCredits,
    loadCodesAndPolicies,
    notes,
    onDataChanged,
    phone,
    role,
    showNotice,
    specialty,
  ]);

  const handleRegenerateCode = useCallback(
    async (record: AdminAccessCodeRecord) => {
      setRegeneratingUserId(record.user_id);
      try {
        const res = await authorizedRequest<RegenerateCodeResponse>(
          `/admin/users/${record.user_id}/regenerate-code`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        );

        const nextCode = res.access_code;
        setCodes((prev) =>
          prev.map((item) =>
            item.user_id === record.user_id ? { ...item, access_code: nextCode } : item
          )
        );
        setCreatedBanner({
          fullName: record.full_name,
          role: record.role,
          accessCode: nextCode,
        });
        showNotice(
          'success',
          `${record.full_name} için yeni giriş kodu üretildi: ${nextCode}`
        );
        await loadCodesAndPolicies(true);
        onDataChanged?.();
      } catch (err: any) {
        showNotice('error', err?.message || 'Yeni erişim kodu üretilemedi.');
      } finally {
        setRegeneratingUserId(null);
      }
    },
    [authorizedRequest, loadCodesAndPolicies, onDataChanged, showNotice]
  );

  const openPolicyDocument = useCallback(
    async (userId: number) => {
      setActiveDocUserId(userId);
      setDocModalVisible(true);
      setDocLoading(true);
      setDocError(null);
      setActiveDoc(null);
      setDocCopied(false);
      try {
        const doc = await authorizedRequest<AdminPolicyDocumentResponse>(
          `/admin/policies/${userId}/document`
        );
        setActiveDoc(doc);
      } catch (err: any) {
        setDocError(err?.message || 'Sözleşme belgesi sunucudan okunamadı.');
      } finally {
        setDocLoading(false);
      }
    },
    [authorizedRequest]
  );

  const handleCopyDocumentText = useCallback(async () => {
    if (!activeDoc?.content) return;
    await copyTextToClipboard(activeDoc.content);
    setDocCopied(true);
    setTimeout(() => setDocCopied(false), 2000);
  }, [activeDoc]);

  const filteredCodes = useMemo(() => {
    const q = codeSearch.trim().toLocaleLowerCase('tr-TR');
    return codes.filter((item) => {
      if (roleFilter !== 'all' && item.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (item.full_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (item.phone || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (item.access_code || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [codeSearch, codes, roleFilter]);

  const filteredPolicies = useMemo(() => {
    const records = policies?.records ?? [];
    return records.filter((rec) => {
      if (policyFilter === 'signed') return rec.policy_accepted;
      if (policyFilter === 'pending') return !rec.policy_accepted;
      return true;
    });
  }, [policies, policyFilter]);

  return (
    <View style={styles.sectionStack}>
      {/* Yerel Bildirim Bandı */}
      {notice ? (
        <View
          style={[
            styles.noticeBanner,
            notice.type === 'error' ? styles.noticeError : styles.noticeSuccess,
          ]}
        >
          {notice.type === 'error' ? (
            <AlertTriangle size={15} color={UI.danger} />
          ) : (
            <CheckCircle2 size={15} color={UI.emerald} />
          )}
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      {/* Yeni Oluşturulan / Yenilenen Büyük Kopyalanabilir Kod Kartı */}
      {createdBanner ? (
        <View style={styles.createdCodeCard}>
          <View style={styles.createdCodeHeader}>
            <View style={styles.emeraldPill}>
              <CheckCircle2 size={12} color={UI.emerald} />
              <Text style={styles.emeraldPillText}>ÖZEL GİRİŞ KODU HAZIR</Text>
            </View>
            <TouchableOpacity
              onPress={() => setCreatedBanner(null)}
              style={styles.dismissBtn}
              accessibilityLabel="Kapat"
            >
              <X size={15} color={UI.textSec} />
            </TouchableOpacity>
          </View>

          <Text style={styles.createdCodePerson}>
            {createdBanner.fullName} · {getRoleLabel(createdBanner.role)}
          </Text>
          <Text style={styles.createdCodeHint}>
            Bu kodu WhatsApp veya SMS ile kullanıcıya iletebilirsiniz.
          </Text>

          <View style={styles.bigCodeDisplayBox}>
            <Text selectable style={styles.bigCodeDisplayText}>
              {createdBanner.accessCode}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleCopyCode(createdBanner.accessCode, 'created-banner')}
            activeOpacity={0.85}
          >
            {copiedCodeKey === 'created-banner' ? (
              <Check size={16} color={UI.darkInk} />
            ) : (
              <Copy size={16} color={UI.darkInk} />
            )}
            <Text style={styles.actionBtnText}>
              {copiedCodeKey === 'created-banner' ? 'Kod Kopyalandı' : 'Giriş Kodunu Kopyala'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 1. Müşteriye Özel Giriş Kodu Oluşturma Formu */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.goldSoft }]}>
            <UserPlus size={20} color={UI.goldBright} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Müşteriye Özel Giriş Kodu Oluştur</Text>
            <Text style={styles.cardSub}>
              Yeni üye veya eğitmen ekleyin; benzersiz giriş kodu anında üretilsin.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => loadCodesAndPolicies(true)}
            disabled={refreshing}
            accessibilityLabel="Kodları ve sözleşmeleri yenile"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={UI.goldBright} />
            ) : (
              <RefreshCw size={16} color={UI.text} />
            )}
          </TouchableOpacity>
        </View>

        {/* Rol Seçici */}
        <Text style={styles.inputLabel}>Kullanıcı Rolü</Text>
        <View style={styles.roleSwitchRow}>
          <TouchableOpacity
            style={[styles.roleSwitchBtn, role === 'member' && styles.roleSwitchBtnActive]}
            onPress={() => setRole('member')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleSwitchText,
                role === 'member' && styles.roleSwitchTextActive,
              ]}
            >
              Üye
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleSwitchBtn, role === 'trainer' && styles.roleSwitchBtnActive]}
            onPress={() => setRole('trainer')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleSwitchText,
                role === 'trainer' && styles.roleSwitchTextActive,
              ]}
            >
              Eğitmen
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.twoCol, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Ad Soyad *</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Örn. Selin Arslan"
              placeholderTextColor={UI.textMuted}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Telefon</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="0532 000 00 00"
              placeholderTextColor={UI.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>
        </View>

        <View style={[styles.twoCol, { marginTop: 10 }]}>
          {role === 'member' ? (
            <View style={{ width: 135 }}>
              <Text style={styles.inputLabel}>Başlangıç Kredisi</Text>
              <TextInput
                value={initialCredits}
                onChangeText={setInitialCredits}
                placeholder="8"
                placeholderTextColor={UI.textMuted}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Uzmanlık Alanı</Text>
              <TextInput
                value={specialty}
                onChangeText={setSpecialty}
                placeholder="Reformer & Klinik Pilates"
                placeholderTextColor={UI.textMuted}
                style={styles.input}
              />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Özel Kod (Opsiyonel)</Text>
            <TextInput
              value={customCode}
              onChangeText={(txt) => setCustomCode(txt.toUpperCase())}
              placeholder="Boşsa otomatik üretilir"
              placeholderTextColor={UI.textMuted}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
        </View>

        <Text style={[styles.inputLabel, { marginTop: 10 }]}>
          Not (Opsiyonel)
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={
            role === 'member'
              ? 'Sakatlık, postür veya paket notu...'
              : 'Eğitmen sertifika / uzmanlık notu...'
          }
          placeholderTextColor={UI.textMuted}
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.actionBtn, { marginTop: 14 }]}
          onPress={handleCreateMemberWithCode}
          disabled={creating}
          activeOpacity={0.85}
        >
          {creating ? (
            <ActivityIndicator size="small" color={UI.darkInk} />
          ) : (
            <>
              <KeyRound size={16} color={UI.darkInk} />
              <Text style={styles.actionBtnText}>
                {role === 'member' ? 'Üye & Kod Oluştur' : 'Eğitmen & Kod Oluştur'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 2. Erişim Kodları Listesi */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.indigoSoft }]}>
            <KeyRound size={20} color={UI.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              Erişim Kodları Listesi ({filteredCodes.length})
            </Text>
            <Text style={styles.cardSub}>
              Tüm üye ve eğitmenlerin özel giriş kodlarını kopyalayın veya yenileyin.
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {[
            { key: 'all' as const, label: `Tümü (${codes.length})` },
            {
              key: 'member' as const,
              label: `Üyeler (${codes.filter((c) => c.role === 'member').length})`,
            },
            {
              key: 'trainer' as const,
              label: `Eğitmenler (${codes.filter((c) => c.role === 'trainer').length})`,
            },
          ].map((chip) => {
            const active = roleFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setRoleFilter(chip.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchBar}>
          <Search size={15} color={UI.textMuted} />
          <TextInput
            value={codeSearch}
            onChangeText={setCodeSearch}
            placeholder="İsim, telefon veya erişim kodu ara..."
            placeholderTextColor={UI.textMuted}
            style={styles.searchInput}
          />
          {codeSearch ? (
            <TouchableOpacity onPress={() => setCodeSearch('')}>
              <X size={15} color={UI.textSec} />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading && codes.length === 0 ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color={UI.gold} />
            <Text style={styles.inlineLoadingText}>Erişim kodları yükleniyor...</Text>
          </View>
        ) : filteredCodes.length === 0 ? (
          <Text style={styles.emptyText}>Kayıtlı erişim kodu bulunamadı.</Text>
        ) : (
          filteredCodes.map((item) => {
            const copyKey = `code-${item.user_id}`;
            const isCopied = copiedCodeKey === copyKey;
            const isRegenerating = regeneratingUserId === item.user_id;
            const isTrainer = item.role === 'trainer';

            return (
              <View key={item.user_id} style={styles.itemCard}>
                <View style={styles.itemTopRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowWrap}>
                      <Text style={styles.itemTitle}>{item.full_name}</Text>
                      <View style={isTrainer ? styles.indigoPill : styles.goldPill}>
                        <Text
                          style={isTrainer ? styles.indigoPillText : styles.goldPillText}
                        >
                          {getRoleLabel(item.role)}
                        </Text>
                      </View>
                      <View
                        style={item.policy_accepted ? styles.emeraldPill : styles.amberPill}
                      >
                        <Text
                          style={
                            item.policy_accepted
                              ? styles.emeraldPillText
                              : styles.amberPillText
                          }
                        >
                          {item.policy_accepted ? 'Sözleşme Onaylı' : 'Onay Bekliyor'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.metaLine}>
                      {item.phone || 'Telefon yok'}
                      {!isTrainer ? ` · Kalan Kredi: ${item.remaining_credits}` : ''}
                    </Text>
                    <Text style={styles.subMetaLine}>
                      Son Giriş:{' '}
                      {item.last_login_at
                        ? `${formatDateTimeTr(item.last_login_at)} (${item.login_count} kez)`
                        : 'Henüz giriş yapmadı'}
                    </Text>
                  </View>
                </View>

                <View style={styles.codeActionRow}>
                  <View style={styles.codeHighlightBox}>
                    <KeyRound size={14} color={UI.goldBright} />
                    <Text selectable style={styles.codeHighlightText}>
                      {item.access_code || 'KOD YOK'}
                    </Text>
                  </View>

                  <View style={styles.codeBtnsWrap}>
                    <TouchableOpacity
                      style={[styles.smallBtn, isCopied && styles.smallBtnSuccess]}
                      onPress={() => handleCopyCode(item.access_code, copyKey)}
                      disabled={!item.access_code}
                    >
                      {isCopied ? (
                        <Check size={13} color={UI.emerald} />
                      ) : (
                        <Copy size={13} color={UI.goldBright} />
                      )}
                      <Text
                        style={[
                          styles.smallBtnText,
                          isCopied && { color: UI.emerald },
                        ]}
                      >
                        {isCopied ? 'Kopyalandı' : 'Kopyala'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => handleRegenerateCode(item)}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? (
                        <ActivityIndicator size="small" color={UI.indigo} />
                      ) : (
                        <RefreshCw size={13} color={UI.indigo} />
                      )}
                      <Text style={[styles.smallBtnText, { color: UI.indigo }]}>
                        Yeni Kod Üret
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* 3. Şirket Politika Sözleşmeleri Arşivi */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.emeraldSoft }]}>
            <FileText size={20} color={UI.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Şirket Politika Sözleşmeleri Arşivi</Text>
            <Text style={styles.cardSub}>
              İlk girişte dijital onaylanan KVKK & Stüdyo Politika sözleşmelerinin dosya arşivi.
            </Text>
          </View>
        </View>

        {/* Klasör Yolu ve Sayaç Özeti */}
        <View style={styles.archiveInfoBox}>
          <View style={styles.archiveFolderRow}>
            <FolderOpen size={15} color={UI.goldBright} />
            <Text style={styles.archiveFolderLabel}>Arşiv Klasörü:</Text>
            <Text selectable style={styles.archiveFolderPath} numberOfLines={1}>
              {policies?.storage_folder || 'signed_policies/'}
            </Text>
          </View>

          <View style={styles.archiveStatsRow}>
            <View style={styles.archiveStatChip}>
              <Text style={styles.archiveStatLabel}>Onaylayan</Text>
              <Text style={[styles.archiveStatVal, { color: UI.emerald }]}>
                {policies?.signed_count ?? 0}
              </Text>
            </View>
            <View style={styles.archiveStatChip}>
              <Text style={styles.archiveStatLabel}>Bekleyen</Text>
              <Text style={[styles.archiveStatVal, { color: UI.amber }]}>
                {policies?.pending_count ?? 0}
              </Text>
            </View>
          </View>
        </View>

        {/* Politika Filtreleri */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {[
            { key: 'all' as const, label: `Tümü (${policies?.records?.length ?? 0})` },
            { key: 'signed' as const, label: `Onaylı (${policies?.signed_count ?? 0})` },
            { key: 'pending' as const, label: `Bekleyen (${policies?.pending_count ?? 0})` },
          ].map((chip) => {
            const active = policyFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setPolicyFilter(chip.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading && !policies ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color={UI.gold} />
            <Text style={styles.inlineLoadingText}>Sözleşme arşivi yükleniyor...</Text>
          </View>
        ) : filteredPolicies.length === 0 ? (
          <Text style={styles.emptyText}>
            Bu filtreye uygun sözleşme kaydı bulunamadı.
          </Text>
        ) : (
          filteredPolicies.map((rec) => {
            const canViewDoc = rec.policy_accepted && rec.file_exists;
            return (
              <View key={rec.user_id} style={styles.itemCard}>
                <View style={styles.itemTopRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowWrap}>
                      <Text style={styles.itemTitle}>{rec.full_name}</Text>
                      <View style={rec.role === 'trainer' ? styles.indigoPill : styles.goldPill}>
                        <Text
                          style={
                            rec.role === 'trainer' ? styles.indigoPillText : styles.goldPillText
                          }
                        >
                          {getRoleLabel(rec.role)}
                        </Text>
                      </View>
                      <View style={rec.policy_accepted ? styles.emeraldPill : styles.amberPill}>
                        <Text
                          style={
                            rec.policy_accepted ? styles.emeraldPillText : styles.amberPillText
                          }
                        >
                          {rec.policy_accepted ? 'Onaylandı' : 'Onay Bekliyor'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.metaLine}>
                      Kod: {rec.access_code || '-'} · Sürüm: {rec.policy_version || '-'}
                    </Text>

                    {rec.policy_accepted ? (
                      <Text style={styles.subMetaLine}>
                        Dosya: {rec.file_name || 'kayıtlı'} ({formatFileSize(rec.file_size_bytes)}) ·{' '}
                        {formatDateTimeTr(rec.policy_accepted_at)}
                      </Text>
                    ) : (
                      <Text style={styles.subMetaLine}>
                        Kullanıcı ilk girişinde sözleşmeyi onayladığında dosya otomatik arşivlenir.
                      </Text>
                    )}
                  </View>
                </View>

                {rec.policy_accepted ? (
                  <View style={styles.policyActionBar}>
                    <TouchableOpacity
                      style={[
                        styles.viewDocBtn,
                        !canViewDoc && { opacity: 0.6 },
                      ]}
                      onPress={() => openPolicyDocument(rec.user_id)}
                      activeOpacity={0.85}
                    >
                      <FileText size={14} color={UI.goldBright} />
                      <Text style={styles.viewDocBtnText}>Belgeyi Görüntüle</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {/* Sözleşme Belgesi Görüntüleme Modalı */}
      <Modal
        visible={docModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDocModalVisible(false)}
      >
        <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>ONAYLANMIŞ POLİTİKA SÖZLEŞMESİ</Text>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {activeDoc?.full_name || 'Sözleşme Belgesi'}
                </Text>
                {activeDoc ? (
                  <Text style={styles.modalMeta}>
                    {activeDoc.file_name} · {formatDateTimeTr(activeDoc.accepted_at)}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setDocModalVisible(false)}
                accessibilityLabel="Kapat"
              >
                <X size={18} color={UI.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {docLoading ? (
                <View style={styles.modalCenterState}>
                  <ActivityIndicator size="large" color={UI.gold} />
                  <Text style={styles.loadingCardText}>Sözleşme dosyası yükleniyor...</Text>
                </View>
              ) : docError ? (
                <View style={styles.modalCenterState}>
                  <AlertTriangle size={24} color={UI.danger} />
                  <Text style={styles.errorBannerText}>{docError}</Text>
                  {activeDocUserId !== null && (
                    <TouchableOpacity
                      style={[styles.retryPill, { marginTop: 12 }]}
                      onPress={() => openPolicyDocument(activeDocUserId)}
                    >
                      <Text style={styles.retryPillText}>Tekrar Dene</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <ScrollView
                  style={styles.docScroll}
                  contentContainerStyle={styles.docScrollContent}
                  showsVerticalScrollIndicator
                >
                  <Text selectable style={styles.docContentText}>
                    {activeDoc?.content || 'Belge içeriği boş.'}
                  </Text>
                </ScrollView>
              )}
            </View>

            <View style={styles.modalFooter}>
              {activeDoc?.content ? (
                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={handleCopyDocumentText}
                >
                  {docCopied ? (
                    <Check size={14} color={UI.emerald} />
                  ) : (
                    <Copy size={14} color={UI.goldBright} />
                  )}
                  <Text
                    style={[
                      styles.smallBtnText,
                      docCopied && { color: UI.emerald },
                    ]}
                  >
                    {docCopied ? 'Metin Kopyalandı' : 'Metni Kopyala'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}

              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setDocModalVisible(false)}
              >
                <Text style={styles.modalDoneBtnText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stiller
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sectionStack: {
    gap: 16,
  },
  card: {
    backgroundColor: UI.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: UI.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardSub: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: UI.elevated,
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: UI.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 8,
  },
  monthNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  monthNavBtnText: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 12,
    fontWeight: '600',
  },
  monthCenterBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCenterLabel: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 15,
    fontWeight: '700',
  },
  monthCenterCode: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  todayMonthChip: {
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: UI.goldSoft,
    borderWidth: 1,
    borderColor: UI.goldBorder,
  },
  todayMonthChipText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 11.5,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: UI.dangerSoft,
    borderWidth: 1,
    borderColor: UI.dangerBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 12.5,
    fontWeight: '600',
  },
  retryPill: {
    backgroundColor: UI.elevated,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryPillText: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 11.5,
    fontWeight: '700',
  },
  loadingCard: {
    backgroundColor: UI.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingCardText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 13,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 155,
    backgroundColor: UI.surface,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 16,
    padding: 14,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  kpiLabel: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  kpiBigValue: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  kpiDenom: {
    fontSize: 13.5,
    fontWeight: '600',
    color: UI.textMuted,
  },
  splitMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  splitSlash: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  kpiSubLine: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 11.5,
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  kpiSubStrong: {
    color: UI.text,
    fontWeight: '700',
  },
  policyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: UI.surface,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  policyStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  policyStripText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: UI.elevated,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    marginTop: 12,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 14.5,
    fontWeight: '700',
  },
  trainerSpecialty: {
    fontFamily: FONTS.sans,
    color: UI.indigo,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  metaLine: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  subMetaLine: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 11.5,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  hoursBadge: {
    backgroundColor: UI.goldSoft,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 74,
  },
  hoursBadgeVal: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  hoursBadgeLbl: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  miniMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  miniMetricBox: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 70,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  miniMetricLabel: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  miniMetricValue: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 13.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 3,
  },
  progressWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 11.5,
    fontWeight: '600',
  },
  progressPct: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: UI.input,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI.border,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressFootNote: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 11,
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  filterChipsRow: {
    gap: 8,
    paddingBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
  },
  filterChipActive: {
    backgroundColor: UI.gold,
    borderColor: UI.goldBright,
  },
  filterChipText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  filterChipTextActive: {
    color: UI.darkInk,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 13,
    paddingVertical: 8,
  },
  emptyText: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 13,
    marginTop: 12,
  },
  codePill: {
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  codePillText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 10.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emeraldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: UI.emeraldSoft,
    borderWidth: 1,
    borderColor: UI.emeraldBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  emeraldPillText: {
    fontFamily: FONTS.sans,
    color: UI.emerald,
    fontSize: 10.5,
    fontWeight: '700',
  },
  amberPill: {
    backgroundColor: UI.amberSoft,
    borderWidth: 1,
    borderColor: UI.amberBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  amberPillText: {
    fontFamily: FONTS.sans,
    color: UI.amber,
    fontSize: 10.5,
    fontWeight: '700',
  },
  indigoPill: {
    backgroundColor: UI.indigoSoft,
    borderWidth: 1,
    borderColor: UI.indigoBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  indigoPillText: {
    fontFamily: FONTS.sans,
    color: UI.indigo,
    fontSize: 10.5,
    fontWeight: '700',
  },
  goldPill: {
    backgroundColor: UI.goldSoft,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  goldPillText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 10.5,
    fontWeight: '700',
  },
  mutedPill: {
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mutedPillText: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1,
  },
  noticeSuccess: {
    backgroundColor: UI.emeraldSoft,
    borderColor: UI.emeraldBorder,
  },
  noticeError: {
    backgroundColor: UI.dangerSoft,
    borderColor: UI.dangerBorder,
  },
  noticeText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 12.5,
    fontWeight: '600',
  },
  createdCodeCard: {
    backgroundColor: UI.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: UI.gold,
  },
  createdCodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dismissBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: UI.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createdCodePerson: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 15.5,
    fontWeight: '700',
  },
  createdCodeHint: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    marginTop: 3,
  },
  bigCodeDisplayBox: {
    marginVertical: 14,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigCodeDisplayText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2.5,
    fontVariant: ['tabular-nums'],
  },
  roleSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: UI.input,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.border,
  },
  roleSwitchBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleSwitchBtnActive: {
    backgroundColor: UI.gold,
  },
  roleSwitchText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 13,
    fontWeight: '600',
  },
  roleSwitchTextActive: {
    color: UI.darkInk,
    fontWeight: '700',
  },
  inputLabel: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 13.5,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: UI.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  actionBtnText: {
    fontFamily: FONTS.sans,
    color: UI.darkInk,
    fontSize: 13.5,
    fontWeight: '800',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  inlineLoadingText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
  },
  codeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
  codeHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  codeHighlightText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
    fontVariant: ['tabular-nums'],
  },
  codeBtnsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },
  smallBtnSuccess: {
    backgroundColor: UI.emeraldSoft,
    borderColor: UI.emeraldBorder,
  },
  smallBtnText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 11.5,
    fontWeight: '700',
  },
  archiveInfoBox: {
    backgroundColor: UI.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  archiveFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  archiveFolderLabel: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '600',
  },
  archiveFolderPath: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 12,
    fontWeight: '700',
  },
  archiveStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  archiveStatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  archiveStatLabel: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '600',
  },
  archiveStatVal: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  policyActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
  viewDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI.goldSoft,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewDocBtnText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 9, 18, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '88%',
    backgroundColor: UI.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: UI.elevated,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },
  modalEyebrow: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  modalTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  modalMeta: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 11.5,
    marginTop: 3,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    flexShrink: 1,
    minHeight: 220,
    backgroundColor: UI.bg,
  },
  modalCenterState: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  docScroll: {
    maxHeight: 460,
  },
  docScrollContent: {
    padding: 16,
  },
  docContentText: {
    fontFamily: Platform.select({
      web: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      ios: 'Menlo',
      default: 'monospace',
    }),
    color: UI.text,
    fontSize: 12.5,
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: UI.elevated,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
  modalDoneBtn: {
    backgroundColor: UI.gold,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  modalDoneBtnText: {
    fontFamily: FONTS.sans,
    color: UI.darkInk,
    fontSize: 13,
    fontWeight: '700',
  },
});
