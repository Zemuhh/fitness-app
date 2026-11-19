import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Database,
  Hash,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { AppUser, UserRole } from '@/types/fitness';
import {
  AdminCreateUserResponse,
  AdminDirectoryUser,
  AdminOverviewResponse,
  DataIntakeCollectPayload,
  DataIntakeCollectResponse,
  DataIntakeLogItem,
  IntakeSource,
  TargetDepartment,
} from '@/types/authAdmin';

export interface AdminControlScreenProps {
  onClose?: () => void;
  onBack?: () => void;
  onSelectUser?: (user: AppUser) => void;
  onDataChanged?: () => void;
}

const THEME = {
  bg: '#090D16',
  card: '#131B2E',
  elevated: '#1E293B',
  border: 'rgba(255, 255, 255, 0.08)',
  emerald: '#10B981',
  emeraldSoft: 'rgba(16, 185, 129, 0.14)',
  volt: '#A3E635',
  indigo: '#6366F1',
  indigoSoft: 'rgba(99, 102, 241, 0.16)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  pink: '#EC4899',
  pinkSoft: 'rgba(236, 72, 153, 0.15)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
};

interface SimulationPreset {
  id: string;
  badge: string;
  title: string;
  source: IntakeSource;
  sender_name: string;
  sender_contact: string;
  content: string;
  notes?: string;
  package_credits?: number | null;
}

const SIMULATION_PRESETS: SimulationPreset[] = [
  {
    id: 'ig-book-injury',
    badge: 'Instagram DM',
    title: 'Randevu + Diz Sakatlık Uyarısı Çek',
    source: 'instagram',
    sender_name: 'Ahmet Yılmaz',
    sender_contact: '@ahmetyilmaz',
    content:
      'Hocam yarın 19:00 fonksiyonel grup dersine beni yazar mısınız? Bugün sol diz menisküs ağrım biraz hassas.',
    notes: '',
    package_credits: null,
  },
  {
    id: 'wp-trainer-note',
    badge: 'WhatsApp Hattı',
    title: 'Eğitmen Yoklama Ekranına Fıtık Notu İlet',
    source: 'whatsapp',
    sender_name: 'Zeynep Kaya',
    sender_contact: '0535 442 18 22',
    content:
      'Merhaba, doktorum L4-L5 bel fıtığı kontrolümde ağır rotasyon hareketlerinden kaçınmamı söyledi. Selin Hoca ekranına not düşer misiniz?',
    notes: '',
    package_credits: null,
  },
  {
    id: 'ig-new-lead-member',
    badge: 'Instagram Yeni Üye',
    title: 'Yeni Üye + FIT-ID + 8 Ders + Randevu',
    source: 'instagram',
    sender_name: 'Caner Aydın',
    sender_contact: '@caneraydin_fit',
    content:
      'Merhaba, 8 derslik pakete başlamak ve yarın 19:00 fonksiyonel grup dersine kayıt olmak istiyorum. Sağ omuz hassasiyetim mevcut.',
    notes: 'Sağ omuz hassasiyeti (overhead press dikkat)',
    package_credits: 8,
  },
  {
    id: 'manual-desk-intake',
    badge: 'Manuel Banko',
    title: 'Resepsiyon Manuel Kayıt & Postür Notu',
    source: 'manual',
    sender_name: 'Mert Demir',
    sender_contact: '0542 819 60 33',
    content:
      'Banko görüşmesi: Üyenin bilek mobilite kısıtlılığı değerlendirildi, eğitmen yoklama kartına eklendi.',
    notes: 'Sol el bileği mobilite kısıtlılığı var, şınav tutuşunda paralel bar kullanılmalı.',
    package_credits: null,
  },
];

function getSourceMeta(source: IntakeSource) {
  if (source === 'instagram') {
    return {
      label: 'Instagram',
      color: THEME.pink,
      bg: THEME.pinkSoft,
    };
  }
  if (source === 'whatsapp') {
    return {
      label: 'WhatsApp',
      color: THEME.emerald,
      bg: THEME.emeraldSoft,
    };
  }
  return {
    label: 'Manuel',
    color: THEME.amber,
    bg: THEME.amberSoft,
  };
}

function getDepartmentMeta(dept: TargetDepartment) {
  switch (dept) {
    case 'booking':
      return {
        label: 'Ders Randevu Sistemi',
        short: 'Ders Randevusu',
        color: THEME.emerald,
        bg: THEME.emeraldSoft,
      };
    case 'trainer_note':
      return {
        label: 'Eğitmen Sakatlık / Yoklama Notu',
        short: 'Eğitmen Notu',
        color: THEME.amber,
        bg: THEME.amberSoft,
      };
    case 'member_registry':
      return {
        label: 'Üye Kaydı & FIT-ID Sicili',
        short: 'Üye & ID Atama',
        color: '#A5B4FC',
        bg: THEME.indigoSoft,
      };
    default:
      return {
        label: 'Aday / İletişim Kuyruğu',
        short: 'İletişim Havuzu',
        color: THEME.textSecondary,
        bg: THEME.elevated,
      };
  }
}

export function AdminControlScreen({
  onClose,
  onBack,
  onSelectUser,
  onDataChanged,
}: AdminControlScreenProps) {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Çok Kanallı Veri Çekme & Yönlendirme Formu State
  const [intakeSource, setIntakeSource] = useState<IntakeSource>('instagram');
  const [senderName, setSenderName] = useState<string>('Ahmet Yılmaz');
  const [senderContact, setSenderContact] = useState<string>('@ahmetyilmaz');
  const [intakeContent, setIntakeContent] = useState<string>(
    'Hocam yarın 19:00 fonksiyonel grup dersine beni yazar mısınız? Sol diz menisküs ağrım bugün biraz hassas.'
  );
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [extraNotes, setExtraNotes] = useState<string>('');
  const [intakePackageCredits, setIntakePackageCredits] = useState<number | null>(null);
  const [intakeLoading, setIntakeLoading] = useState<boolean>(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [lastIntakeResult, setLastIntakeResult] =
    useState<DataIntakeCollectResponse | null>(null);

  // Üye ID Rehberi & Yeni Üye Oluşturma State
  const [directorySearch, setDirectorySearch] = useState<string>('');
  const [showCreateUserForm, setShowCreateUserForm] = useState<boolean>(false);
  const [newFullName, setNewFullName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [newIgHandle, setNewIgHandle] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [newCredits, setNewCredits] = useState<number | null>(10);
  const [creatingUser, setCreatingUser] = useState<boolean>(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createdUserBanner, setCreatedUserBanner] =
    useState<AdminCreateUserResponse | null>(null);

  // Log Filtresi
  const [logFilter, setLogFilter] = useState<'all' | IntakeSource>('all');

  const fetchOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<AdminOverviewResponse>('/portal/admin/overview');
      setOverview(data);
    } catch (err: any) {
      setError(err?.message || 'Admin panel verileri yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOverview(true);
  }, [fetchOverview]);

  const executeIntakeCollect = useCallback(
    async (customPayload?: DataIntakeCollectPayload) => {
      const payload: DataIntakeCollectPayload = customPayload ?? {
        source: intakeSource,
        sender_name: senderName.trim(),
        sender_contact: senderContact.trim(),
        content: intakeContent.trim(),
        session_id: selectedSessionId,
        notes: extraNotes.trim() || undefined,
        package_credits: intakePackageCredits,
      };

      if (!payload.sender_name && !payload.sender_contact) {
        setIntakeError('Gönderici adı veya iletişim (@handle / telefon) girilmelidir.');
        return;
      }
      if (!payload.content && !payload.notes && !payload.session_id) {
        setIntakeError('Çekilecek mesaj veya yönlendirilecek veri içeriği girin.');
        return;
      }

      setIntakeLoading(true);
      setIntakeError(null);
      try {
        const res = await apiRequest<DataIntakeCollectResponse>(
          '/portal/intake/collect',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        setLastIntakeResult(res);
        await fetchOverview(true);
        onDataChanged?.();
      } catch (err: any) {
        setIntakeError(err?.message || 'Veri yönlendirme sırasında hata oluştu.');
      } finally {
        setIntakeLoading(false);
      }
    },
    [
      intakeSource,
      senderName,
      senderContact,
      intakeContent,
      selectedSessionId,
      extraNotes,
      intakePackageCredits,
      fetchOverview,
      onDataChanged,
    ]
  );

  const handleApplyPreset = useCallback(
    (preset: SimulationPreset, runImmediately: boolean) => {
      setIntakeSource(preset.source);
      setSenderName(preset.sender_name);
      setSenderContact(preset.sender_contact);
      setIntakeContent(preset.content);
      setExtraNotes(preset.notes || '');
      setIntakePackageCredits(preset.package_credits ?? null);
      setSelectedSessionId(null);
      setIntakeError(null);

      if (runImmediately) {
        executeIntakeCollect({
          source: preset.source,
          sender_name: preset.sender_name,
          sender_contact: preset.sender_contact,
          content: preset.content,
          session_id: null,
          notes: preset.notes || undefined,
          package_credits: preset.package_credits ?? null,
        });
      }
    },
    [executeIntakeCollect]
  );

  const handleCreateUser = useCallback(async () => {
    if (!newFullName.trim() || !newPhone.trim()) {
      setCreateUserError('Ad Soyad ve Telefon alanları zorunludur.');
      return;
    }
    setCreatingUser(true);
    setCreateUserError(null);
    try {
      const res = await apiRequest<AdminCreateUserResponse>('/portal/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newFullName.trim(),
          phone: newPhone.trim(),
          role: newRole,
          instagram_handle: newIgHandle.trim() || undefined,
          notes: newNotes.trim() || '',
          package_credits: newRole === 'member' ? newCredits : null,
          package_duration_days: 30,
        }),
      });
      setCreatedUserBanner(res);
      setNewFullName('');
      setNewPhone('');
      setNewIgHandle('');
      setNewNotes('');
      setShowCreateUserForm(false);
      await fetchOverview(true);
      onDataChanged?.();
    } catch (err: any) {
      setCreateUserError(err?.message || 'Yeni üye kaydı oluşturulamadı.');
    } finally {
      setCreatingUser(false);
    }
  }, [
    newFullName,
    newPhone,
    newRole,
    newIgHandle,
    newNotes,
    newCredits,
    fetchOverview,
    onDataChanged,
  ]);

  const filteredUsers = useMemo(() => {
    const list = overview?.users || [];
    const q = directorySearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.access_code.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        (u.instagram_handle || '').toLowerCase().includes(q)
    );
  }, [overview, directorySearch]);

  const filteredLogs = useMemo(() => {
    const logs = overview?.recent_logs || [];
    if (logFilter === 'all') return logs;
    return logs.filter((l) => l.source === logFilter);
  }, [overview, logFilter]);

  const handleExit = onClose || onBack;

  if (loading && !overview) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={THEME.emerald} />
        <Text style={styles.loadingText}>Admin Kontrol & Veri Merkezi Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.rootContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Üst Başlık Çubuğu */}
      <View style={styles.headerBar}>
        <View style={{ flex: 1 }}>
          <View style={styles.adminLivePill}>
            <ShieldCheck size={12} color="#A5B4FC" />
            <Text style={styles.adminLivePillText}>ADMIN KONTROL & VERİ MERKEZİ</Text>
          </View>
          <Text style={styles.headerTitle}>Stüdyo Yönetim & Veri Yönlendirme</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleRefresh}
            activeOpacity={0.8}
          >
            <RefreshCw size={17} color={THEME.textPrimary} />
          </TouchableOpacity>

          {handleExit ? (
            <TouchableOpacity
              style={styles.exitBtn}
              onPress={handleExit}
              activeOpacity={0.85}
            >
              <ArrowLeft size={15} color={THEME.textPrimary} />
              <Text style={styles.exitBtnText}>Çıkış</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={THEME.emerald}
          />
        }
      >
        {error ? (
          <View style={styles.errorCard}>
            <AlertTriangle size={18} color={THEME.danger} />
            <Text style={styles.errorCardText}>{error}</Text>
          </View>
        ) : null}

        {/* 1. ÜST BENTO KPI KARTLARI */}
        {overview ? (
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Users size={16} color={THEME.emerald} />
                <Text style={styles.kpiLabel}>ÜYE & EĞİTMEN</Text>
              </View>
              <Text style={styles.kpiValue}>
                {overview.stats.total_members}{' '}
                <Text style={styles.kpiValueSub}>
                  Üye • {overview.stats.total_trainers} Hoca
                </Text>
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Calendar size={16} color={THEME.volt} />
                <Text style={styles.kpiLabel}>AKTİF RANDEVU</Text>
              </View>
              <Text style={styles.kpiValue}>
                {overview.stats.active_bookings_count}{' '}
                <Text style={styles.kpiValueSub}>
                  Kayıt • {overview.stats.total_remaining_credits} Kredi
                </Text>
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Database size={16} color="#A5B4FC" />
                <Text style={styles.kpiLabel}>ÇEKİLEN VERİ</Text>
              </View>
              <Text style={styles.kpiValue}>
                {overview.stats.total_intake_logs}{' '}
                <Text style={styles.kpiValueSub}>
                  IG:{overview.channel_counts.instagram || 0} WP:
                  {overview.channel_counts.whatsapp || 0}
                </Text>
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                overview.stats.low_credit_members_count > 0 && {
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                },
              ]}
            >
              <View style={styles.kpiTopRow}>
                <AlertTriangle size={16} color={THEME.amber} />
                <Text style={styles.kpiLabel}>KRİTİK KREDİ</Text>
              </View>
              <Text style={[styles.kpiValue, { color: THEME.amber }]}>
                {overview.stats.low_credit_members_count}{' '}
                <Text style={styles.kpiValueSub}>Azalan Paket</Text>
              </Text>
            </View>
          </View>
        ) : null}

        {/* 2. INSTAGRAM / WHATSAPP / MANUEL VERİ ÇEKME & YÖNLENDİRME PANELİ */}
        <View style={[styles.bentoCard, styles.intakeEngineCard]}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.engineIconBox}>
                <Zap size={18} color={THEME.volt} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  Çok Kanallı Veri Çekme & Birim Yönlendirme Motoru
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Instagram, WhatsApp veya Manuel gelen veriyi çekip Üye ID, Eğitmen Sakatlık Notu
                  ve Ders Randevusu birimlerine otomatik dağıtır.
                </Text>
              </View>
            </View>
          </View>

          {/* Kanal Seçici: Instagram | WhatsApp | Manuel */}
          <Text style={styles.fieldLabel}>1. VERİ KAYNAĞI KANALI SEÇİN</Text>
          <View style={styles.channelSwitchRow}>
            {(['instagram', 'whatsapp', 'manual'] as IntakeSource[]).map((ch) => {
              const meta = getSourceMeta(ch);
              const active = intakeSource === ch;
              return (
                <TouchableOpacity
                  key={ch}
                  style={[
                    styles.channelTab,
                    active && {
                      backgroundColor: meta.bg,
                      borderColor: meta.color,
                    },
                  ]}
                  onPress={() => setIntakeSource(ch)}
                  activeOpacity={0.85}
                >
                  <MessageCircle
                    size={14}
                    color={active ? meta.color : THEME.textSecondary}
                  />
                  <Text
                    style={[
                      styles.channelTabText,
                      active && { color: THEME.textPrimary, fontWeight: '800' },
                    ]}
                  >
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tek Tıkla Simülasyon Kartları */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            2. TEK TIKLA ÖRNEK IG / WHATSAPP VERİSİ ÇEKME SİMÜLASYONU
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsScrollRow}
          >
            {SIMULATION_PRESETS.map((preset) => {
              const sMeta = getSourceMeta(preset.source);
              return (
                <View key={preset.id} style={styles.presetCard}>
                  <View style={styles.presetTopRow}>
                    <View style={[styles.presetBadge, { backgroundColor: sMeta.bg }]}>
                      <Text style={[styles.presetBadgeText, { color: sMeta.color }]}>
                        {preset.badge}
                      </Text>
                    </View>
                    <Text style={styles.presetContact}>{preset.sender_contact}</Text>
                  </View>

                  <Text style={styles.presetTitle}>{preset.title}</Text>
                  <Text style={styles.presetPreview} numberOfLines={2}>
                    "{preset.content}"
                  </Text>

                  <View style={styles.presetBtnRow}>
                    <TouchableOpacity
                      style={styles.presetFillBtn}
                      onPress={() => handleApplyPreset(preset, false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.presetFillBtnText}>Forma Doldur</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.presetRunBtn}
                      onPress={() => handleApplyPreset(preset, true)}
                      disabled={intakeLoading}
                      activeOpacity={0.85}
                    >
                      <Zap size={12} color="#04130D" />
                      <Text style={styles.presetRunBtnText}>Hemen Çek</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Detaylı Veri Giriş Formu */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
            3. DETAYLI VERİ GİRİŞİ & HEDEF SEANS SEÇİMİ
          </Text>

          <View style={styles.twoColRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Gönderici Adı Soyadı</Text>
              <TextInput
                value={senderName}
                onChangeText={setSenderName}
                placeholder="Örn: Ahmet Yılmaz"
                placeholderTextColor={THEME.textMuted}
                style={styles.inputBox}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>@handle / Telefon / FIT-ID</Text>
              <TextInput
                value={senderContact}
                onChangeText={setSenderContact}
                placeholder="@kullanici veya 05xx"
                placeholderTextColor={THEME.textMuted}
                autoCapitalize="none"
                style={styles.inputBox}
              />
            </View>
          </View>

          <Text style={[styles.miniLabel, { marginTop: 10 }]}>
            Çekilen Mesaj / Talep İçeriği (NLP ile Saat & Sakatlık Analiz Edilir)
          </Text>
          <TextInput
            value={intakeContent}
            onChangeText={setIntakeContent}
            placeholder="Örn: Yarın 19:00 grup dersine katılmak istiyorum, bel hassasiyetim var..."
            placeholderTextColor={THEME.textMuted}
            multiline
            numberOfLines={3}
            style={[styles.inputBox, styles.multilineInput]}
          />

          {/* Ders Seansı Seçici */}
          {overview && overview.sessions.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.miniLabel}>
                Ders Randevu Yönlendirmesi (Otomatik NLP veya Doğrudan Seans Seç):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sessionPillsRow}
              >
                <TouchableOpacity
                  style={[
                    styles.sessionPill,
                    selectedSessionId === null && styles.sessionPillActive,
                  ]}
                  onPress={() => setSelectedSessionId(null)}
                >
                  <Sparkles
                    size={12}
                    color={selectedSessionId === null ? THEME.emerald : THEME.textSecondary}
                  />
                  <Text
                    style={[
                      styles.sessionPillText,
                      selectedSessionId === null && { color: THEME.textPrimary },
                    ]}
                  >
                    Mesajdan Otomatik Bul
                  </Text>
                </TouchableOpacity>

                {overview.sessions.map((s) => {
                  const isSel = selectedSessionId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.sessionPill,
                        isSel && styles.sessionPillActive,
                        s.is_full && { opacity: 0.6 },
                      ]}
                      onPress={() => setSelectedSessionId(isSel ? null : s.id)}
                    >
                      <Text
                        style={[
                          styles.sessionPillText,
                          isSel && { color: THEME.textPrimary, fontWeight: '800' },
                        ]}
                      >
                        {s.day_label.split(' ')[0]} {s.start_time} • {s.title} (
                        {s.current_enrolled}/{s.capacity})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Ek Eğitmen Notu & Opsiyonel Paket Kredisi */}
          <Text style={[styles.miniLabel, { marginTop: 10 }]}>
            Eğitmen Yoklama Ekranına Özel / Sakatlık Notu (Opsiyonel)
          </Text>
          <TextInput
            value={extraNotes}
            onChangeText={setExtraNotes}
            placeholder="Örn: Sağ omuz impingement, baş üstü press dikkat..."
            placeholderTextColor={THEME.textMuted}
            style={styles.inputBox}
          />

          <View style={styles.creditAssignRow}>
            <Text style={styles.miniLabel}>Başlangıç / Ek Kredi Tanımla:</Text>
            <View style={styles.creditPillsWrap}>
              {[null, 4, 8, 12].map((val) => {
                const active = intakePackageCredits === val;
                return (
                  <TouchableOpacity
                    key={`cred-${String(val)}`}
                    style={[
                      styles.creditMiniPill,
                      active && styles.creditMiniPillActive,
                    ]}
                    onPress={() => setIntakePackageCredits(val)}
                  >
                    <Text
                      style={[
                        styles.creditMiniPillText,
                        active && { color: '#04130D', fontWeight: '800' },
                      ]}
                    >
                      {val === null ? 'Yok' : `+${val} Ders`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {intakeError ? (
            <View style={styles.inlineErrorBox}>
              <AlertTriangle size={15} color={THEME.danger} />
              <Text style={styles.inlineErrorText}>{intakeError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.collectSubmitBtn}
            onPress={() => executeIntakeCollect()}
            disabled={intakeLoading}
            activeOpacity={0.88}
          >
            {intakeLoading ? (
              <ActivityIndicator size="small" color="#04130D" />
            ) : (
              <>
                <Send size={16} color="#04130D" />
                <Text style={styles.collectSubmitBtnText}>
                  Veriyi Çek, Analiz Et & İlgili Birimlere Gönder
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* CANLI YÖNLENDİRME SONUÇ KARTI */}
          {lastIntakeResult ? (
            <View style={styles.liveResultCard}>
              <View style={styles.liveResultHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <CheckCircle2 size={19} color={THEME.emerald} />
                  <Text style={styles.liveResultTitle}>
                    Canlı Veri Dağıtım & Yönlendirme Raporu
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setLastIntakeResult(null)}>
                  <X size={16} color={THEME.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Atanan / Eşleşen FIT-XXXX Kodu */}
              <View style={styles.routedMemberBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routedMemberName}>
                    {lastIntakeResult.user.full_name}{' '}
                    {lastIntakeResult.is_new_user ? '(Yeni Kayıt)' : '(Mevcut Üye)'}
                  </Text>
                  <Text style={styles.routedMemberSub}>
                    Kalan Ders Hakkı: {lastIntakeResult.remaining_credits} /{' '}
                    {lastIntakeResult.total_credits}
                  </Text>
                </View>
                <View style={styles.assignedCodePill}>
                  <Text style={styles.assignedCodePillText}>
                    {lastIntakeResult.assigned_access_code}
                  </Text>
                </View>
              </View>

              {/* Birim Dağıtım Matrisi */}
              <View style={styles.deptMatrix}>
                {(
                  [
                    'booking',
                    'trainer_note',
                    'member_registry',
                  ] as TargetDepartment[]
                ).map((deptKey) => {
                  const active = lastIntakeResult.routed_departments.includes(deptKey);
                  const dMeta = getDepartmentMeta(deptKey);
                  return (
                    <View
                      key={deptKey}
                      style={[
                        styles.deptStatusCard,
                        active && {
                          borderColor: dMeta.color,
                          backgroundColor: dMeta.bg,
                        },
                      ]}
                    >
                      <View style={styles.deptStatusTop}>
                        <CheckCircle2
                          size={14}
                          color={active ? dMeta.color : THEME.textMuted}
                        />
                        <Text
                          style={[
                            styles.deptStatusTitle,
                            active && { color: THEME.textPrimary },
                          ]}
                        >
                          {dMeta.short}
                        </Text>
                      </View>
                      <Text style={styles.deptStatusState}>
                        {active ? '✓ İletildi' : '— İşlem Yok'}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {lastIntakeResult.booking_result ? (
                <View style={styles.resultDetailLine}>
                  <Calendar size={14} color={THEME.emerald} />
                  <Text style={styles.resultDetailText}>
                    {lastIntakeResult.booking_result.message}
                  </Text>
                </View>
              ) : null}

              {lastIntakeResult.notes_updated && lastIntakeResult.updated_notes ? (
                <View style={styles.resultDetailLine}>
                  <AlertTriangle size={14} color={THEME.amber} />
                  <Text style={[styles.resultDetailText, { color: '#FDE68A' }]}>
                    Eğitmen Yoklama Notu: {lastIntakeResult.updated_notes}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.resultSummaryFooter}>
                {lastIntakeResult.action_summary}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 3. ÜYE ID (FIT-XXXX) REHBERİ & YENİ ÜYE / ID OLUŞTURMA */}
        <View style={styles.bentoCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Hash size={18} color="#A5B4FC" />
              <Text style={styles.sectionTitle}>Üye ID (FIT-XXXX) Rehberi & Kayıt</Text>
            </View>

            <TouchableOpacity
              style={styles.newMemberToggleBtn}
              onPress={() => {
                setShowCreateUserForm((prev) => !prev);
                setCreateUserError(null);
              }}
              activeOpacity={0.85}
            >
              {showCreateUserForm ? (
                <>
                  <X size={14} color="#FFFFFF" />
                  <Text style={styles.newMemberToggleText}>Kapat</Text>
                </>
              ) : (
                <>
                  <UserPlus size={14} color="#FFFFFF" />
                  <Text style={styles.newMemberToggleText}>Yeni Üye & ID</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {createdUserBanner ? (
            <View style={styles.createdBanner}>
              <CheckCircle2 size={16} color={THEME.emerald} />
              <Text style={styles.createdBannerText}>{createdUserBanner.message}</Text>
            </View>
          ) : null}

          {/* Yeni Üye / Eğitmen + FIT-XXXX Oluşturma Formu */}
          {showCreateUserForm ? (
            <View style={styles.createFormBox}>
              <Text style={styles.createFormTitle}>
                Manuel Yeni Üye / Eğitmen & Otomatik FIT-XXXX Atama
              </Text>

              <View style={styles.roleSwitchRow}>
                <TouchableOpacity
                  style={[
                    styles.roleOptionBtn,
                    newRole === 'member' && styles.roleOptionBtnActive,
                  ]}
                  onPress={() => setNewRole('member')}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      newRole === 'member' && { color: '#04130D', fontWeight: '800' },
                    ]}
                  >
                    Müşteri (Üye)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.roleOptionBtn,
                    newRole === 'trainer' && styles.roleOptionBtnIndigo,
                  ]}
                  onPress={() => setNewRole('trainer')}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      newRole === 'trainer' && { color: '#FFFFFF', fontWeight: '800' },
                    ]}
                  >
                    Eğitmen (Trainer)
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Ad Soyad *</Text>
                  <TextInput
                    value={newFullName}
                    onChangeText={setNewFullName}
                    placeholder="Örn: Deniz Arslan"
                    placeholderTextColor={THEME.textMuted}
                    style={styles.inputBox}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Telefon *</Text>
                  <TextInput
                    value={newPhone}
                    onChangeText={setNewPhone}
                    placeholder="0532 xxx xx xx"
                    placeholderTextColor={THEME.textMuted}
                    keyboardType="phone-pad"
                    style={styles.inputBox}
                  />
                </View>
              </View>

              <Text style={[styles.miniLabel, { marginTop: 8 }]}>
                Instagram Kullanıcı Adı (Opsiyonel)
              </Text>
              <TextInput
                value={newIgHandle}
                onChangeText={setNewIgHandle}
                placeholder="@denizarslan"
                placeholderTextColor={THEME.textMuted}
                autoCapitalize="none"
                style={styles.inputBox}
              />

              {newRole === 'member' ? (
                <View style={styles.creditAssignRow}>
                  <Text style={styles.miniLabel}>Başlangıç Paketi:</Text>
                  <View style={styles.creditPillsWrap}>
                    {[4, 8, 10, 12].map((c) => (
                      <TouchableOpacity
                        key={`new-c-${c}`}
                        style={[
                          styles.creditMiniPill,
                          newCredits === c && styles.creditMiniPillActive,
                        ]}
                        onPress={() => setNewCredits(c)}
                      >
                        <Text
                          style={[
                            styles.creditMiniPillText,
                            newCredits === c && { color: '#04130D', fontWeight: '800' },
                          ]}
                        >
                          {c} Ders
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              <Text style={[styles.miniLabel, { marginTop: 8 }]}>
                Sakatlık / Seviye / Uzmanlık Notu
              </Text>
              <TextInput
                value={newNotes}
                onChangeText={setNewNotes}
                placeholder="Eğitmen yoklama ekranında görünecek özel not..."
                placeholderTextColor={THEME.textMuted}
                style={styles.inputBox}
              />

              {createUserError ? (
                <View style={styles.inlineErrorBox}>
                  <AlertTriangle size={15} color={THEME.danger} />
                  <Text style={styles.inlineErrorText}>{createUserError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.saveNewUserBtn}
                onPress={handleCreateUser}
                disabled={creatingUser}
                activeOpacity={0.88}
              >
                {creatingUser ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Plus size={16} color="#FFFFFF" />
                    <Text style={styles.saveNewUserBtnText}>
                      Kaydet & Otomatik FIT-XXXX ID Ata
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Rehber Arama Kutusu */}
          <View style={styles.directorySearchWrap}>
            <Search size={15} color={THEME.textMuted} />
            <TextInput
              value={directorySearch}
              onChangeText={setDirectorySearch}
              placeholder="İsim, FIT-XXXX kodu, @handle veya telefon ara..."
              placeholderTextColor={THEME.textMuted}
              style={styles.directorySearchInput}
            />
          </View>

          {/* Kullanıcı ve FIT-XXXX Kartları */}
          {filteredUsers.map((u: AdminDirectoryUser) => {
            const isTrainer = u.role === 'trainer';
            return (
              <View key={`dir-${u.id}`} style={styles.directoryUserCard}>
                <View style={styles.directoryTopRow}>
                  <View style={styles.fitCodeTag}>
                    <Text style={styles.fitCodeTagText}>{u.access_code}</Text>
                  </View>

                  <View
                    style={[
                      styles.dirRoleBadge,
                      {
                        backgroundColor: isTrainer
                          ? THEME.indigoSoft
                          : THEME.emeraldSoft,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isTrainer ? '#A5B4FC' : THEME.emerald,
                        fontSize: 10.5,
                        fontWeight: '800',
                      }}
                    >
                      {isTrainer ? 'EĞİTMEN' : `KALAN: ${u.remaining_credits}/${u.total_credits} DERS`}
                    </Text>
                  </View>

                  {onSelectUser ? (
                    <TouchableOpacity
                      style={styles.jumpUserBtn}
                      onPress={() => {
                        onSelectUser({
                          id: u.id,
                          full_name: u.full_name,
                          phone: u.phone,
                          role: u.role,
                          instagram_handle: u.instagram_handle,
                          notes: u.notes,
                        });
                        handleExit?.();
                      }}
                    >
                      <Text style={styles.jumpUserBtnText}>Aç</Text>
                      <ArrowRight size={12} color={THEME.textPrimary} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Text style={styles.dirUserName}>{u.full_name}</Text>
                <Text style={styles.dirUserContact}>
                  {u.phone}
                  {u.instagram_handle ? ` • ${u.instagram_handle}` : ''} • PIN: {u.pin_code}
                </Text>

                {u.notes ? (
                  <View style={styles.dirNoteBox}>
                    <AlertTriangle size={12} color={THEME.amber} />
                    <Text style={styles.dirNoteText} numberOfLines={2}>
                      {u.notes}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* 4. CANLI VERİ ÇEKME & YÖNLENDİRME GEÇMİŞİ (DataIntakeLog) */}
        <View style={styles.bentoCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Activity size={18} color={THEME.emerald} />
              <Text style={styles.sectionTitle}>Canlı Veri Akışı (DataIntakeLog)</Text>
            </View>
            <ClipboardList size={17} color={THEME.textMuted} />
          </View>

          {/* Kanal Filtresi */}
          <View style={styles.logFilterRow}>
            {(
              [
                { key: 'all', label: 'Tümü' },
                { key: 'instagram', label: 'Instagram' },
                { key: 'whatsapp', label: 'WhatsApp' },
                { key: 'manual', label: 'Manuel' },
              ] as const
            ).map((f) => {
              const active = logFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.logFilterPill, active && styles.logFilterPillActive]}
                  onPress={() => setLogFilter(f.key)}
                >
                  <Text
                    style={[
                      styles.logFilterText,
                      active && { color: '#04130D', fontWeight: '800' },
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {filteredLogs.length === 0 ? (
            <Text style={styles.emptyLogText}>Bu filtrede henüz veri kaydı bulunmuyor.</Text>
          ) : (
            filteredLogs.map((log: DataIntakeLogItem) => {
              const sMeta = getSourceMeta(log.source);
              const dMeta = getDepartmentMeta(log.target_department);
              return (
                <View key={`log-${log.id}`} style={styles.logItemCard}>
                  <View style={styles.logTopRow}>
                    <View style={[styles.logSourceBadge, { backgroundColor: sMeta.bg }]}>
                      <Text style={[styles.logSourceText, { color: sMeta.color }]}>
                        {sMeta.label}
                      </Text>
                    </View>

                    <View style={[styles.logDeptBadge, { backgroundColor: dMeta.bg }]}>
                      <Text style={[styles.logDeptText, { color: dMeta.color }]}>
                        → {dMeta.short}
                      </Text>
                    </View>

                    {log.assigned_access_code ? (
                      <Text style={styles.logAccessCode}>{log.assigned_access_code}</Text>
                    ) : null}
                  </View>

                  <Text style={styles.logSenderLine}>
                    {log.sender_name}{' '}
                    <Text style={styles.logContactSpan}>({log.sender_contact})</Text>
                  </Text>

                  <Text style={styles.logPayloadText}>"{log.message_or_payload}"</Text>

                  <View style={styles.logSummaryRow}>
                    <CheckCircle2 size={12} color={THEME.emerald} />
                    <Text style={styles.logSummaryText}>{log.action_summary}</Text>
                  </View>

                  <Text style={styles.logTimeText}>{log.created_at}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default AdminControlScreen;

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    gap: 10,
  },
  adminLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: THEME.indigoSoft,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9,
    marginBottom: 4,
  },
  adminLivePillText: {
    color: '#C7D2FE',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: THEME.textPrimary,
    fontSize: 18.5,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.elevated,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  exitBtnText: {
    color: THEME.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 42,
    gap: 16,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.dangerSoft,
    padding: 14,
    borderRadius: 16,
  },
  errorCardText: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  kpiLabel: {
    color: THEME.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValue: {
    color: THEME.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiValueSub: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  bentoCard: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  intakeEngineCard: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  engineIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(163, 230, 53, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  fieldLabel: {
    color: THEME.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  channelSwitchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  channelTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: THEME.elevated,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  channelTabText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  presetsScrollRow: {
    gap: 10,
    paddingRight: 6,
  },
  presetCard: {
    width: 248,
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: 'space-between',
  },
  presetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  presetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  presetBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  presetContact: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  presetTitle: {
    color: THEME.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  presetPreview: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 10,
  },
  presetBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetFillBtn: {
    flex: 1,
    backgroundColor: THEME.card,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  presetFillBtnText: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  presetRunBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: THEME.emerald,
    paddingVertical: 8,
    borderRadius: 10,
  },
  presetRunBtnText: {
    color: '#04130D',
    fontSize: 11.5,
    fontWeight: '800',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  miniLabel: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 5,
  },
  inputBox: {
    backgroundColor: THEME.elevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: THEME.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  sessionPillsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.elevated,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  sessionPillActive: {
    backgroundColor: THEME.emeraldSoft,
    borderColor: THEME.emerald,
  },
  sessionPillText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  creditAssignRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  creditPillsWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  creditMiniPill: {
    backgroundColor: THEME.elevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  creditMiniPillActive: {
    backgroundColor: THEME.volt,
    borderColor: THEME.volt,
  },
  creditMiniPillText: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  inlineErrorBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.dangerSoft,
    padding: 10,
    borderRadius: 12,
  },
  inlineErrorText: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 12.5,
    fontWeight: '600',
  },
  collectSubmitBtn: {
    marginTop: 14,
    backgroundColor: THEME.emerald,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  collectSubmitBtnText: {
    color: '#04130D',
    fontSize: 14,
    fontWeight: '800',
  },
  liveResultCard: {
    marginTop: 16,
    backgroundColor: '#0E1729',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1.5,
    borderColor: THEME.emerald,
    gap: 10,
  },
  liveResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveResultTitle: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  routedMemberBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.elevated,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  routedMemberName: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  routedMemberSub: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  assignedCodePill: {
    backgroundColor: 'rgba(163, 230, 53, 0.16)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
  },
  assignedCodePillText: {
    color: THEME.volt,
    fontSize: 13,
    fontWeight: '800',
  },
  deptMatrix: {
    flexDirection: 'row',
    gap: 8,
  },
  deptStatusCard: {
    flex: 1,
    backgroundColor: THEME.elevated,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  deptStatusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  deptStatusTitle: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
  deptStatusState: {
    color: THEME.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
  },
  resultDetailLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 9,
    borderRadius: 10,
  },
  resultDetailText: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  resultSummaryFooter: {
    color: THEME.emerald,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  newMemberToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.indigo,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
  },
  newMemberToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  createdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.emeraldSoft,
    padding: 11,
    borderRadius: 12,
    marginBottom: 12,
  },
  createdBannerText: {
    flex: 1,
    color: THEME.emerald,
    fontSize: 12.5,
    fontWeight: '700',
  },
  createFormBox: {
    backgroundColor: '#0E1627',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  createFormTitle: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  roleSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  roleOptionBtn: {
    flex: 1,
    backgroundColor: THEME.elevated,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  roleOptionBtnActive: {
    backgroundColor: THEME.emerald,
    borderColor: THEME.emerald,
  },
  roleOptionBtnIndigo: {
    backgroundColor: THEME.indigo,
    borderColor: THEME.indigo,
  },
  roleOptionText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  saveNewUserBtn: {
    marginTop: 12,
    backgroundColor: THEME.indigo,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveNewUserBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  directorySearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.elevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  directorySearchInput: {
    flex: 1,
    paddingVertical: 10,
    color: THEME.textPrimary,
    fontSize: 13,
  },
  directoryUserCard: {
    backgroundColor: THEME.elevated,
    borderRadius: 15,
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  directoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  fitCodeTag: {
    backgroundColor: THEME.card,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  fitCodeTagText: {
    color: THEME.volt,
    fontSize: 11.5,
    fontWeight: '800',
  },
  dirRoleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  jumpUserBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: THEME.card,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  jumpUserBtnText: {
    color: THEME.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  dirUserName: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  dirUserContact: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  dirNoteBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.amberSoft,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },
  dirNoteText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 11.5,
    fontWeight: '600',
  },
  logFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  logFilterPill: {
    backgroundColor: THEME.elevated,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  logFilterPillActive: {
    backgroundColor: THEME.emerald,
    borderColor: THEME.emerald,
  },
  logFilterText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyLogText: {
    color: THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  logItemCard: {
    backgroundColor: THEME.elevated,
    borderRadius: 15,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  logSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  logSourceText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  logDeptBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  logDeptText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  logAccessCode: {
    marginLeft: 'auto',
    color: THEME.volt,
    fontSize: 11.5,
    fontWeight: '800',
  },
  logSenderLine: {
    color: THEME.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  logContactSpan: {
    color: THEME.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  logPayloadText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    fontStyle: 'italic',
  },
  logSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 7,
  },
  logSummaryText: {
    flex: 1,
    color: THEME.emerald,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
  },
  logTimeText: {
    color: THEME.textMuted,
    fontSize: 10.5,
    marginTop: 5,
    textAlign: 'right',
  },
});
