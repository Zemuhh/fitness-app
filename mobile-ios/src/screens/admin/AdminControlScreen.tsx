import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  Layers,
  LogOut,
  Megaphone,
  Pin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { FONTS } from '@/theme/colors';
import { AppUser } from '@/types/fitness';
import {
  ActivePanelMode,
  AdminAnnouncementItem,
  AdminClassSessionItem,
  AdminMemberItem,
  AdminPanelConfig,
  AdminPaymentItem,
  AdminSystemOverview,
  AdminTrainerItem,
} from '@/types/authAdmin';
import { addMinutesToHhMm, getTodayIso, getUpcomingIsoDates } from '@/utils/dateHelpers';

export interface AdminControlScreenProps {
  onClose?: () => void;
  onBack?: () => void;
  onSelectUser?: (user: AppUser) => void;
  onDataChanged?: () => void;
}

type AdminPrimaryTab = 'paneller' | 'haberler' | 'ogretmenler' | 'sistem';
type SystemSubTab = 'musteriler' | 'dersler' | 'odemeler';

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
  indigo: '#818CF8',
  indigoSoft: 'rgba(129, 140, 248, 0.14)',
  rose: '#F472B6',
  roseSoft: 'rgba(244, 114, 182, 0.14)',
  amber: '#FBBF24',
  amberSoft: 'rgba(251, 191, 36, 0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  text: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  darkInk: '#090D16',
};

const NEWS_TAGS = [
  'Kulüp Haberleri',
  'Kampanyalar',
  'Kurallar & Bilgilendirme',
  'Yeni Ders',
] as const;

const SESSION_CATEGORIES = [
  { label: 'Grup Reformer', room: 'Kemerli Ayna Reformer Salonu', cap: 6 },
  { label: 'Bireysel Reformer', room: 'VIP Özel Reformer Odası', cap: 1 },
  { label: 'Cadillac & Tower', room: 'Cadillac & Trapeze Alanı', cap: 2 },
  { label: 'Düet & Trio', room: 'Kemerli Ayna Reformer Salonu', cap: 2 },
] as const;

const DEFAULT_PANEL_CONFIG: AdminPanelConfig = {
  admin_panel_enabled: true,
  trainer_panel_enabled: true,
  member_panel_enabled: true,
  default_landing_panel: 'admin',
  allow_google_login: true,
  allow_member_booking: true,
  allow_package_purchase: true,
  studio_banner_enabled: false,
  studio_banner_title: '',
  studio_banner_message: '',
};

export function AdminControlScreen({
  onSelectUser,
  onDataChanged,
}: AdminControlScreenProps) {
  const {
    authRequest,
    switchPanel,
    logout,
    reloadUsers,
    reloadPanelConfig,
    triggerGlobalRefresh,
  } = useAuthDemo();

  const [activeTab, setActiveTab] = useState<AdminPrimaryTab>('paneller');
  const [systemSubTab, setSystemSubTab] = useState<SystemSubTab>('musteriler');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Ana Veri Havuzları
  const [overview, setOverview] = useState<AdminSystemOverview | null>(null);
  const [panelForm, setPanelForm] = useState<AdminPanelConfig>(DEFAULT_PANEL_CONFIG);
  const [announcements, setAnnouncements] = useState<AdminAnnouncementItem[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainerItem[]>([]);
  const [members, setMembers] = useState<AdminMemberItem[]>([]);
  const [sessions, setSessions] = useState<AdminClassSessionItem[]>([]);
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);

  // Sekme 1: Panel Geçiş & Ayar State
  const [selectedPreviewTrainerId, setSelectedPreviewTrainerId] = useState<number | null>(null);
  const [selectedPreviewMemberId, setSelectedPreviewMemberId] = useState<number | null>(null);
  const [savingPanels, setSavingPanels] = useState<boolean>(false);

  // Sekme 2: Haber Yayınlama State
  const [editingNewsId, setEditingNewsId] = useState<number | null>(null);
  const [newsTitle, setNewsTitle] = useState<string>('');
  const [newsTag, setNewsTag] = useState<string>('Kulüp Haberleri');
  const [newsContent, setNewsContent] = useState<string>('');
  const [newsPinned, setNewsPinned] = useState<boolean>(false);
  const [savingNews, setSavingNews] = useState<boolean>(false);

  // Sekme 3: Yeni Öğretmen Sisteme Girme State
  const [editingTrainerId, setEditingTrainerId] = useState<number | null>(null);
  const [trFullName, setTrFullName] = useState<string>('');
  const [trSpecialty, setTrSpecialty] = useState<string>('Klinik Reformer & Postür Uzmanı');
  const [trEmail, setTrEmail] = useState<string>('');
  const [trUsername, setTrUsername] = useState<string>('');
  const [trPassword, setTrPassword] = useState<string>('');
  const [trPhone, setTrPhone] = useState<string>('');
  const [trNotes, setTrNotes] = useState<string>('');
  const [savingTrainer, setSavingTrainer] = useState<boolean>(false);

  // Sekme 4A: Müşteri Arama, Yeni Müşteri & Kredi Düzenleme State
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [showAddMemberForm, setShowAddMemberForm] = useState<boolean>(false);
  const [memFullName, setMemFullName] = useState<string>('');
  const [memPhone, setMemPhone] = useState<string>('');
  const [memEmail, setMemEmail] = useState<string>('');
  const [memUsername, setMemUsername] = useState<string>('');
  const [memPassword, setMemPassword] = useState<string>('');
  const [memNotes, setMemNotes] = useState<string>('');
  const [memPackageName, setMemPackageName] = useState<string>('8 Seans Grup Reformer Paketi');
  const [memCredits, setMemCredits] = useState<string>('8');
  const [savingMember, setSavingMember] = useState<boolean>(false);

  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editMemberNotes, setEditMemberNotes] = useState<string>('');
  const [editMemberSetCredits, setEditMemberSetCredits] = useState<string>('');
  const [editMemberPkgName, setEditMemberPkgName] = useState<string>('');
  const [busyMemberActionId, setBusyMemberActionId] = useState<number | null>(null);

  // Sekme 4B: Ders Seansı Oluşturma State
  const upcomingDates = useMemo(() => getUpcomingIsoDates(10), []);
  const [showAddSessionForm, setShowAddSessionForm] = useState<boolean>(false);
  const [sessTrainerId, setSessTrainerId] = useState<number | null>(null);
  const [sessCategory, setSessCategory] = useState<string>('Grup Reformer');
  const [sessTitle, setSessTitle] = useState<string>('Grup Reformer: Core & Duruş');
  const [sessRoom, setSessRoom] = useState<string>('Kemerli Ayna Reformer Salonu');
  const [sessDate, setSessDate] = useState<string>(upcomingDates[1] || getTodayIso());
  const [sessStartTime, setSessStartTime] = useState<string>('18:00');
  const [sessCapacity, setSessCapacity] = useState<string>('6');
  const [savingSession, setSavingSession] = useState<boolean>(false);

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  const loadAllAdminData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [
          overviewRes,
          panelsRes,
          newsRes,
          trainersRes,
          membersRes,
          sessionsRes,
          paymentsRes,
        ] = await Promise.allSettled([
          authRequest<AdminSystemOverview>('/admin/overview'),
          authRequest<AdminPanelConfig>('/admin/panels'),
          authRequest<AdminAnnouncementItem[]>('/admin/announcements'),
          authRequest<AdminTrainerItem[]>('/admin/trainers'),
          authRequest<AdminMemberItem[]>('/admin/members'),
          authRequest<AdminClassSessionItem[]>('/admin/sessions'),
          authRequest<AdminPaymentItem[]>('/admin/payments'),
        ]);

        if (overviewRes.status === 'fulfilled' && overviewRes.value) {
          setOverview(overviewRes.value);
          if (overviewRes.value.panel_config && panelsRes.status !== 'fulfilled') {
            setPanelForm({ ...DEFAULT_PANEL_CONFIG, ...overviewRes.value.panel_config });
          }
        }

        if (panelsRes.status === 'fulfilled' && panelsRes.value) {
          setPanelForm({ ...DEFAULT_PANEL_CONFIG, ...panelsRes.value });
        }

        if (newsRes.status === 'fulfilled' && Array.isArray(newsRes.value)) {
          setAnnouncements(newsRes.value);
        } else {
          try {
            const pubNews = await authRequest<AdminAnnouncementItem[]>('/announcements');
            if (Array.isArray(pubNews)) setAnnouncements(pubNews);
          } catch {
            // ignore
          }
        }

        if (trainersRes.status === 'fulfilled' && Array.isArray(trainersRes.value)) {
          const list = trainersRes.value;
          setTrainers(list);
          setSelectedPreviewTrainerId((prev) =>
            prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null
          );
          setSessTrainerId((prev) =>
            prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null
          );
        }

        if (membersRes.status === 'fulfilled' && Array.isArray(membersRes.value)) {
          const list = membersRes.value;
          setMembers(list);
          setSelectedPreviewMemberId((prev) =>
            prev && list.some((m) => m.id === prev) ? prev : list[0]?.id ?? null
          );
        }

        if (sessionsRes.status === 'fulfilled' && Array.isArray(sessionsRes.value)) {
          setSessions(sessionsRes.value);
        }

        if (paymentsRes.status === 'fulfilled' && Array.isArray(paymentsRes.value)) {
          setPayments(paymentsRes.value);
        } else if (
          overviewRes.status === 'fulfilled' &&
          Array.isArray(overviewRes.value?.recent_payments)
        ) {
          setPayments(overviewRes.value.recent_payments);
        }
      } catch (err: any) {
        showNotice('error', err?.message || 'Yönetim verileri yüklenirken hata oluştu.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authRequest, showNotice]
  );

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllAdminData(true);
  }, [loadAllAdminData]);

  const notifySystemUpdated = useCallback(() => {
    reloadUsers();
    reloadPanelConfig();
    triggerGlobalRefresh();
    onDataChanged?.();
  }, [onDataChanged, reloadPanelConfig, reloadUsers, triggerGlobalRefresh]);

  // ---------------------------------------------------------------------------
  // 1. PANEL GEÇİŞ & PANEL AYARLARI İŞLEMLERİ
  // ---------------------------------------------------------------------------
  const handleEnterTrainerPanel = useCallback(
    (trainerItem?: AdminTrainerItem) => {
      const target =
        trainerItem ||
        trainers.find((t) => t.id === selectedPreviewTrainerId) ||
        trainers[0];
      if (!target) {
        showNotice('error', 'Önizlenecek eğitmen bulunamadı. Önce eğitmen ekleyin.');
        return;
      }
      const appTrainer: AppUser = {
        id: target.id,
        full_name: target.full_name,
        phone: target.phone || '',
        role: 'trainer',
        instagram_handle: target.instagram_handle ?? null,
        notes: target.notes ?? '',
        avatar_url: target.avatar_url ?? null,
        specialty: target.specialty ?? null,
      };
      onSelectUser?.(appTrainer);
      switchPanel('trainer', appTrainer);
    },
    [onSelectUser, selectedPreviewTrainerId, showNotice, switchPanel, trainers]
  );

  const handleEnterMemberPanel = useCallback(
    (memberItem?: AdminMemberItem) => {
      const target =
        memberItem ||
        members.find((m) => m.id === selectedPreviewMemberId) ||
        members[0];
      if (!target) {
        showNotice('error', 'Önizlenecek müşteri bulunamadı.');
        return;
      }
      const appMember: AppUser = {
        id: target.id,
        full_name: target.full_name,
        phone: target.phone || '',
        role: 'member',
        instagram_handle: target.instagram_handle ?? null,
        notes: target.notes ?? '',
      };
      onSelectUser?.(appMember);
      switchPanel('member', appMember);
    },
    [members, onSelectUser, selectedPreviewMemberId, showNotice, switchPanel]
  );

  const handleSavePanelConfig = useCallback(async () => {
    setSavingPanels(true);
    try {
      const updated = await authRequest<AdminPanelConfig>('/admin/panels', {
        method: 'PUT',
        body: JSON.stringify(panelForm),
      });
      setPanelForm({ ...DEFAULT_PANEL_CONFIG, ...updated });
      notifySystemUpdated();
      showNotice('success', 'Panel ve sistem görünürlük ayarları güncellendi.');
    } catch (err: any) {
      showNotice('error', err?.message || 'Panel ayarları kaydedilemedi.');
    } finally {
      setSavingPanels(false);
    }
  }, [authRequest, notifySystemUpdated, panelForm, showNotice]);

  // ---------------------------------------------------------------------------
  // 2. YENİ HABER YAYINLAMA İŞLEMLERİ
  // ---------------------------------------------------------------------------
  const resetNewsForm = useCallback(() => {
    setEditingNewsId(null);
    setNewsTitle('');
    setNewsTag('Kulüp Haberleri');
    setNewsContent('');
    setNewsPinned(false);
  }, []);

  const handleSaveAnnouncement = useCallback(async () => {
    if (!newsTitle.trim() || !newsContent.trim()) {
      showNotice('error', 'Haber başlığı ve içerik metni zorunludur.');
      return;
    }
    setSavingNews(true);
    try {
      const payload = {
        title: newsTitle.trim(),
        content: newsContent.trim(),
        tag: newsTag,
        is_pinned: newsPinned,
      };
      if (editingNewsId) {
        await authRequest(`/admin/announcements/${editingNewsId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showNotice('success', 'Duyuru güncellendi.');
      } else {
        await authRequest('/admin/announcements', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showNotice('success', 'Yeni haber tüm üye ve eğitmen panellerinde yayınlandı.');
      }
      resetNewsForm();
      await loadAllAdminData(true);
      notifySystemUpdated();
    } catch (err: any) {
      showNotice('error', err?.message || 'Duyuru kaydedilemedi.');
    } finally {
      setSavingNews(false);
    }
  }, [
    authRequest,
    editingNewsId,
    loadAllAdminData,
    newsContent,
    newsPinned,
    newsTag,
    newsTitle,
    notifySystemUpdated,
    resetNewsForm,
    showNotice,
  ]);

  const handleTogglePinNews = useCallback(
    async (item: AdminAnnouncementItem) => {
      try {
        await authRequest(`/admin/announcements/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: item.title,
            content: item.content,
            tag: item.tag,
            is_pinned: !item.is_pinned,
          }),
        });
        await loadAllAdminData(true);
        notifySystemUpdated();
      } catch (err: any) {
        showNotice('error', err?.message || 'Sabitleme durumu değiştirilemedi.');
      }
    },
    [authRequest, loadAllAdminData, notifySystemUpdated, showNotice]
  );

  const handleDeleteNews = useCallback(
    async (id: number) => {
      try {
        await authRequest(`/admin/announcements/${id}`, { method: 'DELETE' });
        if (editingNewsId === id) resetNewsForm();
        await loadAllAdminData(true);
        notifySystemUpdated();
        showNotice('success', 'Haber yayından kaldırıldı.');
      } catch (err: any) {
        showNotice('error', err?.message || 'Haber silinemedi.');
      }
    },
    [authRequest, editingNewsId, loadAllAdminData, notifySystemUpdated, resetNewsForm, showNotice]
  );

  // ---------------------------------------------------------------------------
  // 3. YENİ ÖĞRETMEN SİSTEME GİRME İŞLEMLERİ
  // ---------------------------------------------------------------------------
  const resetTrainerForm = useCallback(() => {
    setEditingTrainerId(null);
    setTrFullName('');
    setTrSpecialty('Klinik Reformer & Postür Uzmanı');
    setTrEmail('');
    setTrUsername('');
    setTrPassword('');
    setTrPhone('');
    setTrNotes('');
  }, []);

  const handleSaveTrainer = useCallback(async () => {
    if (!trFullName.trim()) {
      showNotice('error', 'Öğretmen Ad Soyad alanı zorunludur.');
      return;
    }
    if (!editingTrainerId && !trPassword.trim()) {
      showNotice('error', 'Yeni öğretmenin giriş yapabilmesi için şifre belirleyin.');
      return;
    }
    setSavingTrainer(true);
    try {
      const payload: Record<string, any> = {
        full_name: trFullName.trim(),
        specialty: trSpecialty.trim() || 'Reformer Pilates Eğitmeni',
        email: trEmail.trim() || undefined,
        username: trUsername.trim() || undefined,
        phone: trPhone.trim() || '0532 000 00 00',
        bio: trNotes.trim() || undefined,
        notes: trNotes.trim() || '',
      };
      if (trPassword.trim()) {
        payload.password = trPassword.trim();
      }

      if (editingTrainerId) {
        await authRequest(`/admin/trainers/${editingTrainerId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showNotice('success', 'Öğretmen bilgileri güncellendi.');
      } else {
        await authRequest('/admin/trainers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showNotice('success', 'Yeni öğretmen ve giriş hesabı sisteme kaydedildi.');
      }
      resetTrainerForm();
      await loadAllAdminData(true);
      notifySystemUpdated();
    } catch (err: any) {
      showNotice('error', err?.message || 'Öğretmen kaydedilemedi.');
    } finally {
      setSavingTrainer(false);
    }
  }, [
    authRequest,
    editingTrainerId,
    loadAllAdminData,
    notifySystemUpdated,
    resetTrainerForm,
    showNotice,
    trEmail,
    trFullName,
    trNotes,
    trPassword,
    trPhone,
    trSpecialty,
    trUsername,
  ]);

  const handleDeleteTrainer = useCallback(
    async (id: number) => {
      try {
        await authRequest(`/admin/trainers/${id}`, { method: 'DELETE' });
        if (editingTrainerId === id) resetTrainerForm();
        await loadAllAdminData(true);
        notifySystemUpdated();
        showNotice('success', 'Eğitmen kaydı silindi.');
      } catch (err: any) {
        showNotice('error', err?.message || 'Eğitmen silinemedi.');
      }
    },
    [
      authRequest,
      editingTrainerId,
      loadAllAdminData,
      notifySystemUpdated,
      resetTrainerForm,
      showNotice,
    ]
  );

  // ---------------------------------------------------------------------------
  // 4. MÜŞTERİLER, KREDİLER & SEANSLAR İŞLEMLERİ
  // ---------------------------------------------------------------------------
  const handleCreateMember = useCallback(async () => {
    if (!memFullName.trim()) {
      showNotice('error', 'Müşteri Ad Soyad alanı zorunludur.');
      return;
    }
    setSavingMember(true);
    try {
      const parsedCredits = Math.max(0, parseInt(memCredits || '8', 10) || 8);
      await authRequest('/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          full_name: memFullName.trim(),
          phone: memPhone.trim() || '0530 000 00 00',
          email: memEmail.trim() || undefined,
          username: memUsername.trim() || undefined,
          password: memPassword.trim() || undefined,
          notes: memNotes.trim() || '',
          package_name: memPackageName.trim() || '8 Seans Grup Reformer Paketi',
          credits: parsedCredits,
          duration_days: 45,
        }),
      });
      setMemFullName('');
      setMemPhone('');
      setMemEmail('');
      setMemUsername('');
      setMemPassword('');
      setMemNotes('');
      setShowAddMemberForm(false);
      await loadAllAdminData(true);
      notifySystemUpdated();
      showNotice('success', 'Yeni müşteri ve ders paketi sisteme eklendi.');
    } catch (err: any) {
      showNotice('error', err?.message || 'Müşteri oluşturulamadı.');
    } finally {
      setSavingMember(false);
    }
  }, [
    authRequest,
    loadAllAdminData,
    memCredits,
    memEmail,
    memFullName,
    memNotes,
    memPackageName,
    memPassword,
    memPhone,
    memUsername,
    notifySystemUpdated,
    showNotice,
  ]);

  const handleAdjustMemberCredits = useCallback(
    async (memberId: number, delta: number) => {
      setBusyMemberActionId(memberId);
      try {
        await authRequest(`/admin/members/${memberId}/credits`, {
          method: 'POST',
          body: JSON.stringify({ credits_delta: delta }),
        });
        await loadAllAdminData(true);
        notifySystemUpdated();
        showNotice(
          'success',
          delta > 0
            ? `Müşteri paketine +${delta} ders kredisi eklendi.`
            : `Müşteri paketinden ${Math.abs(delta)} ders kredisi düşüldü.`
        );
      } catch (err: any) {
        showNotice('error', err?.message || 'Kredi güncellenemedi.');
      } finally {
        setBusyMemberActionId(null);
      }
    },
    [authRequest, loadAllAdminData, notifySystemUpdated, showNotice]
  );

  const handleSaveMemberDetailsAndCredits = useCallback(
    async (member: AdminMemberItem) => {
      setBusyMemberActionId(member.id);
      try {
        await authRequest(`/admin/members/${member.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            notes: editMemberNotes,
          }),
        });

        const parsedRemaining = parseInt(editMemberSetCredits, 10);
        if (!Number.isNaN(parsedRemaining) && parsedRemaining >= 0) {
          await authRequest(`/admin/members/${member.id}/credits`, {
            method: 'POST',
            body: JSON.stringify({
              package_name: editMemberPkgName.trim() || member.package_name || 'Grup Reformer Paketi',
              set_remaining_credits: parsedRemaining,
              total_credits: Math.max(parsedRemaining, member.total_credits || parsedRemaining),
              duration_days: 45,
            }),
          });
        }

        setEditingMemberId(null);
        await loadAllAdminData(true);
        notifySystemUpdated();
        showNotice('success', `${member.full_name} kaydı ve paket bilgileri güncellendi.`);
      } catch (err: any) {
        showNotice('error', err?.message || 'Müşteri bilgileri kaydedilemedi.');
      } finally {
        setBusyMemberActionId(null);
      }
    },
    [
      authRequest,
      editMemberNotes,
      editMemberPkgName,
      editMemberSetCredits,
      loadAllAdminData,
      notifySystemUpdated,
      showNotice,
    ]
  );

  const handleDeleteMember = useCallback(
    async (member: AdminMemberItem) => {
      setBusyMemberActionId(member.id);
      try {
        await authRequest(`/admin/members/${member.id}`, { method: 'DELETE' });
        await loadAllAdminData(true);
        notifySystemUpdated();
        showNotice('success', `${member.full_name} sistemden silindi.`);
      } catch (err: any) {
        showNotice('error', err?.message || 'Müşteri silinemedi.');
      } finally {
        setBusyMemberActionId(null);
      }
    },
    [authRequest, loadAllAdminData, notifySystemUpdated, showNotice]
  );

  const handleCreateSession = useCallback(async () => {
    const targetTrainerId = sessTrainerId || trainers[0]?.id;
    if (!targetTrainerId) {
      showNotice('error', 'Ders atamak için sistemde en az bir eğitmen bulunmalıdır.');
      return;
    }
    if (!sessTitle.trim()) {
      showNotice('error', 'Ders başlığı zorunludur.');
      return;
    }
    setSavingSession(true);
    try {
      const cap = Math.max(1, parseInt(sessCapacity || '6', 10) || 6);
      await authRequest('/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          trainer_id: targetTrainerId,
          title: sessTitle.trim(),
          category: sessCategory,
          room: sessRoom.trim() || 'Ana Stüdyo',
          date: sessDate,
          start_time: sessStartTime,
          end_time: addMinutesToHhMm(sessStartTime, 50),
          capacity: cap,
        }),
      });
      setShowAddSessionForm(false);
      await loadAllAdminData(true);
      notifySystemUpdated();
      showNotice('success', 'Yeni ders seansı takvime eklendi.');
    } catch (err: any) {
      showNotice('error', err?.message || 'Ders seansı oluşturulamadı.');
    } finally {
      setSavingSession(false);
    }
  }, [
    authRequest,
    loadAllAdminData,
    notifySystemUpdated,
    sessCapacity,
    sessCategory,
    sessDate,
    sessRoom,
    sessStartTime,
    sessTitle,
    sessTrainerId,
    showNotice,
    trainers,
  ]);

  const handleDeleteSession = useCallback(
    async (sessionId: number) => {
      try {
        await authRequest(`/admin/sessions/${sessionId}`, { method: 'DELETE' });
        await loadAllAdminData(true);
        notifySystemUpdated();
        showNotice('success', 'Ders seansı takvimden kaldırıldı.');
      } catch (err: any) {
        showNotice('error', err?.message || 'Ders seansı silinemedi.');
      }
    },
    [authRequest, loadAllAdminData, notifySystemUpdated, showNotice]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name.toLocaleLowerCase('tr-TR').includes(q) ||
        (m.email || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (m.phone || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (m.access_code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (m.notes || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [memberSearch, members]);

  // ---------------------------------------------------------------------------
  // SEKME RENDER FONKSİYONLARI
  // ---------------------------------------------------------------------------
  const renderPanelsTab = () => (
    <View style={styles.sectionStack}>
      {/* Canlı Panel Değiştirici Kartı */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.goldSoft }]}>
            <Layers size={18} color={UI.goldBright} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Canlı Panel Geçiş Merkezi</Text>
            <Text style={styles.cardSub}>
              Oturumunuzdan çıkmadan Yönetim, Eğitmen ve Üye panelleri arasında anında geçiş yapın.
            </Text>
          </View>
        </View>

        {/* 1. Yönetim Paneli Aktif Durumu */}
        <View style={[styles.panelSwitchCard, styles.panelSwitchCardActive]}>
          <View style={{ flex: 1 }}>
            <View style={styles.inlineBadgeGold}>
              <ShieldCheck size={12} color={UI.goldBright} />
              <Text style={styles.inlineBadgeGoldText}>ŞU AN AKTİF MERKEZ</Text>
            </View>
            <Text style={styles.panelCardTitle}>Sistem Yönetim Paneli</Text>
            <Text style={styles.panelCardDesc}>
              Kişisel üye verisi taşımayan tam yetkili stüdyo kontrol merkezi.
            </Text>
          </View>
        </View>

        {/* 2. Eğitmen Paneline Geç */}
        <View style={styles.panelSwitchCard}>
          <Text style={styles.panelCardTitle}>Eğitmen Paneli Önizleme & Kontrol</Text>
          <Text style={styles.panelCardDesc}>
            İncelemek istediğiniz öğretmeni seçerek günlük ders ve yoklama ekranına geçin:
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
          >
            {trainers.map((tr) => {
              const selected = selectedPreviewTrainerId === tr.id;
              return (
                <TouchableOpacity
                  key={tr.id}
                  style={[styles.selectChip, selected && styles.selectChipIndigo]}
                  onPress={() => setSelectedPreviewTrainerId(tr.id)}
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      styles.selectChipText,
                      selected && { color: UI.indigo, fontWeight: '800' },
                    ]}
                  >
                    {tr.full_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
            onPress={() => handleEnterTrainerPanel()}
            activeOpacity={0.85}
          >
            <Eye size={16} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
              Eğitmen Paneline Geç
            </Text>
            <ArrowRight size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* 3. Üye Paneline Geç */}
        <View style={styles.panelSwitchCard}>
          <Text style={styles.panelCardTitle}>Üye Paneli Önizleme & Kontrol</Text>
          <Text style={styles.panelCardDesc}>
            Herhangi bir müşterinin kredi halkasını, takvimini ve paket ekranını canlı görüntüleyin:
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
          >
            {members.map((m) => {
              const selected = selectedPreviewMemberId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.selectChip, selected && styles.selectChipGold]}
                  onPress={() => setSelectedPreviewMemberId(m.id)}
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      styles.selectChipText,
                      selected && { color: UI.goldBright, fontWeight: '800' },
                    ]}
                  >
                    {m.full_name} ({m.remaining_credits}/{m.total_credits})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleEnterMemberPanel()}
            activeOpacity={0.85}
          >
            <Eye size={16} color={UI.darkInk} />
            <Text style={styles.actionBtnText}>Üye Paneline Geç</Text>
            <ArrowRight size={16} color={UI.darkInk} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sistem & Panel Görünürlük Ayarları */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.indigoSoft }]}>
            <Sliders size={18} color={UI.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Panel & Modül Yetki Ayarları</Text>
            <Text style={styles.cardSub}>
              Uygulama genelindeki giriş, rezervasyon, satın alma ve duyuru bandı ayarlarını yönetin.
            </Text>
          </View>
        </View>

        {[
          {
            key: 'trainer_panel_enabled' as const,
            title: 'Eğitmen Paneli Aktif',
            desc: 'Öğretmenlerin ders takvimi ve yoklama ekranlarına erişimi',
          },
          {
            key: 'member_panel_enabled' as const,
            title: 'Üye Paneli Aktif',
            desc: 'Müşterilerin kredi ve seans ekranlarına erişimi',
          },
          {
            key: 'allow_google_login' as const,
            title: 'Google ile Giriş Seçeneği',
            desc: 'Giriş ekranında Google OAuth butonunu göster',
          },
          {
            key: 'allow_member_booking' as const,
            title: 'Online Ders Rezervasyonu',
            desc: 'Üyelerin uygulama içinden ders seçip kredi kullanabilmesi',
          },
          {
            key: 'allow_package_purchase' as const,
            title: 'Online Paket Satın Alma',
            desc: 'Üyelerin ödeme sayfasına yönlendirilerek paket yenileyebilmesi',
          },
          {
            key: 'studio_banner_enabled' as const,
            title: 'Üst Stüdyo Bilgi Bandı',
            desc: 'Giriş ve uygulama üst alanında özel bilgilendirme mesajı göster',
          },
        ].map((row) => (
          <View key={row.key} style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>{row.title}</Text>
              <Text style={styles.toggleDesc}>{row.desc}</Text>
            </View>
            <Switch
              value={Boolean(panelForm[row.key])}
              onValueChange={(val) =>
                setPanelForm((prev) => ({ ...prev, [row.key]: val }))
              }
              trackColor={{ false: '#26344E', true: UI.gold }}
              thumbColor="#FFFFFF"
            />
          </View>
        ))}

        {panelForm.studio_banner_enabled && (
          <View style={styles.bannerFieldsWrap}>
            <Text style={styles.inputLabel}>Duyuru Bandı Başlığı</Text>
            <TextInput
              value={panelForm.studio_banner_title}
              onChangeText={(v) =>
                setPanelForm((prev) => ({ ...prev, studio_banner_title: v }))
              }
              placeholder="Örn: Bayram Çalışma Saatleri"
              placeholderTextColor={UI.textMuted}
              style={styles.input}
            />
            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Duyuru Bandı Mesajı</Text>
            <TextInput
              value={panelForm.studio_banner_message}
              onChangeText={(v) =>
                setPanelForm((prev) => ({ ...prev, studio_banner_message: v }))
              }
              placeholder="Kısa bilgilendirme metni..."
              placeholderTextColor={UI.textMuted}
              style={styles.input}
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, { marginTop: 16 }]}
          onPress={handleSavePanelConfig}
          disabled={savingPanels}
          activeOpacity={0.86}
        >
          {savingPanels ? (
            <ActivityIndicator size="small" color={UI.darkInk} />
          ) : (
            <>
              <CheckCircle2 size={16} color={UI.darkInk} />
              <Text style={styles.actionBtnText}>Panel Ayarlarını Kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderNewsTab = () => (
    <View style={styles.sectionStack}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.goldSoft }]}>
            <Megaphone size={18} color={UI.goldBright} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {editingNewsId ? 'Haberi Düzenle' : 'Yeni Haber & Duyuru Yayınla'}
            </Text>
            <Text style={styles.cardSub}>
              Yayınladığınız haberler tüm üye ve eğitmen ekranlarında anında görünür.
            </Text>
          </View>
          {editingNewsId ? (
            <TouchableOpacity style={styles.cancelEditPill} onPress={resetNewsForm}>
              <X size={14} color={UI.textSec} />
              <Text style={styles.cancelEditText}>Vazgeç</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.inputLabel}>Haber Başlığı</Text>
        <TextInput
          value={newsTitle}
          onChangeText={setNewsTitle}
          placeholder="Örn: Pazar Sabahı Cadillac & Esneme Grubu Açıldı"
          placeholderTextColor={UI.textMuted}
          style={styles.input}
        />

        <Text style={[styles.inputLabel, { marginTop: 12 }]}>Kategori Etiketi</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {NEWS_TAGS.map((tag) => {
            const active = newsTag === tag;
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.selectChip, active && styles.selectChipGold]}
                onPress={() => setNewsTag(tag)}
              >
                <Text
                  style={[
                    styles.selectChipText,
                    active && { color: UI.goldBright, fontWeight: '800' },
                  ]}
                >
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.inputLabel, { marginTop: 12 }]}>Haber İçeriği</Text>
        <TextInput
          value={newsContent}
          onChangeText={setNewsContent}
          placeholder="Üyelerinize iletmek istediğiniz detaylı duyuru metnini yazın..."
          placeholderTextColor={UI.textMuted}
          multiline
          numberOfLines={4}
          style={[styles.input, styles.textArea]}
        />

        <View style={[styles.toggleRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>En Üste Sabitle</Text>
            <Text style={styles.toggleDesc}>Duyuru listesinin en başında vurgulu göster</Text>
          </View>
          <Switch
            value={newsPinned}
            onValueChange={setNewsPinned}
            trackColor={{ false: '#26344E', true: UI.gold }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, { marginTop: 14 }]}
          onPress={handleSaveAnnouncement}
          disabled={savingNews}
          activeOpacity={0.86}
        >
          {savingNews ? (
            <ActivityIndicator size="small" color={UI.darkInk} />
          ) : (
            <>
              <Megaphone size={16} color={UI.darkInk} />
              <Text style={styles.actionBtnText}>
                {editingNewsId ? 'Değişiklikleri Kaydet' : 'Haberi Şimdi Yayınla'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Mevcut Haberler Listesi */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Yayındaki Duyurular ({announcements.length})</Text>

        {announcements.length === 0 ? (
          <Text style={styles.emptyListText}>Henüz yayınlanmış bir duyuru bulunmuyor.</Text>
        ) : (
          announcements.map((item) => (
            <View key={item.id} style={styles.listItemCard}>
              <View style={styles.listItemTopRow}>
                <View style={styles.rowWrap}>
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>{item.tag}</Text>
                  </View>
                  {item.is_pinned ? (
                    <View style={styles.pinnedPill}>
                      <Pin size={11} color={UI.goldBright} />
                      <Text style={styles.pinnedPillText}>Sabit</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.dateMetaText}>{item.date}</Text>
              </View>

              <Text style={styles.listItemTitle}>{item.title}</Text>
              <Text style={styles.listItemBody}>{item.content}</Text>

              <View style={styles.itemActionsRow}>
                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={() => handleTogglePinNews(item)}
                >
                  <Pin size={13} color={UI.goldBright} />
                  <Text style={styles.smallBtnText}>
                    {item.is_pinned ? 'Sabiti Kaldır' : 'Sabitle'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={() => {
                    setEditingNewsId(item.id);
                    setNewsTitle(item.title);
                    setNewsTag(item.tag || 'Kulüp Haberleri');
                    setNewsContent(item.content);
                    setNewsPinned(Boolean(item.is_pinned));
                  }}
                >
                  <Edit3 size={13} color={UI.indigo} />
                  <Text style={[styles.smallBtnText, { color: UI.indigo }]}>Düzenle</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallBtn, styles.smallBtnDanger]}
                  onPress={() => handleDeleteNews(item.id)}
                >
                  <Trash2 size={13} color={UI.danger} />
                  <Text style={[styles.smallBtnText, { color: UI.danger }]}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );

  const renderTrainersTab = () => (
    <View style={styles.sectionStack}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: UI.indigoSoft }]}>
            <Award size={18} color={UI.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {editingTrainerId ? 'Öğretmen Bilgilerini Düzenle' : 'Yeni Öğretmen Sisteme Gir'}
            </Text>
            <Text style={styles.cardSub}>
              Eklediğiniz öğretmen anında kendi şifresiyle giriş yapabilir ve derslere atanabilir.
            </Text>
          </View>
          {editingTrainerId ? (
            <TouchableOpacity style={styles.cancelEditPill} onPress={resetTrainerForm}>
              <X size={14} color={UI.textSec} />
              <Text style={styles.cancelEditText}>Vazgeç</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Ad Soyad *</Text>
            <TextInput
              value={trFullName}
              onChangeText={setTrFullName}
              placeholder="Örn: Derya Hoca"
              placeholderTextColor={UI.textMuted}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Uzmanlık Alanı</Text>
            <TextInput
              value={trSpecialty}
              onChangeText={setTrSpecialty}
              placeholder="Klinik Reformer & Cadillac"
              placeholderTextColor={UI.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={[styles.twoCol, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>E-posta Adresi</Text>
            <TextInput
              value={trEmail}
              onChangeText={setTrEmail}
              placeholder="derya@eryapilates.com"
              placeholderTextColor={UI.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
            <TextInput
              value={trUsername}
              onChangeText={setTrUsername}
              placeholder="deryahoca"
              placeholderTextColor={UI.textMuted}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
        </View>

        <View style={[styles.twoCol, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>
              {editingTrainerId ? 'Yeni Şifre (Opsiyonel)' : 'Giriş Şifresi *'}
            </Text>
            <TextInput
              value={trPassword}
              onChangeText={setTrPassword}
              placeholder={editingTrainerId ? 'Değiştirmek için yazın' : 'En az 4 karakter'}
              placeholderTextColor={UI.textMuted}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Telefon</Text>
            <TextInput
              value={trPhone}
              onChangeText={setTrPhone}
              placeholder="0532 000 00 00"
              placeholderTextColor={UI.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>
        </View>

        <Text style={[styles.inputLabel, { marginTop: 10 }]}>Kısa Biyografi / Sertifika Notu</Text>
        <TextInput
          value={trNotes}
          onChangeText={setTrNotes}
          placeholder="Örn: Hamile pilatesi, skolyoz rehabilitasyonu ve ileri Reformer eğitmeni."
          placeholderTextColor={UI.textMuted}
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.actionBtn, { marginTop: 16 }]}
          onPress={handleSaveTrainer}
          disabled={savingTrainer}
          activeOpacity={0.86}
        >
          {savingTrainer ? (
            <ActivityIndicator size="small" color={UI.darkInk} />
          ) : (
            <>
              <UserPlus size={16} color={UI.darkInk} />
              <Text style={styles.actionBtnText}>
                {editingTrainerId ? 'Öğretmen Kaydını Güncelle' : 'Öğretmeni Sisteme Kaydet'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Mevcut Eğitmen Kadrosu */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Kayıtlı Eğitmen Kadrosu ({trainers.length})</Text>
        {trainers.map((tr) => (
          <View key={tr.id} style={styles.listItemCard}>
            <View style={styles.listItemTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemTitle}>{tr.full_name}</Text>
                <Text style={styles.trainerSpecText}>
                  {tr.specialty || 'Reformer Pilates Eğitmeni'}
                </Text>
              </View>
              {tr.access_code ? (
                <View style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{tr.access_code}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.metaLine}>
              Giriş: {tr.email || tr.username || tr.phone} • Tel: {tr.phone || '-'} • Aktif Seans:{' '}
              {tr.active_sessions_count ?? 0}
            </Text>
            {tr.bio || tr.notes ? (
              <Text style={styles.notePreviewText} numberOfLines={2}>
                {tr.bio || tr.notes}
              </Text>
            ) : null}

            <View style={styles.itemActionsRow}>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => handleEnterTrainerPanel(tr)}
              >
                <Eye size={13} color={UI.goldBright} />
                <Text style={styles.smallBtnText}>Panelini Aç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => {
                  setEditingTrainerId(tr.id);
                  setTrFullName(tr.full_name);
                  setTrSpecialty(tr.specialty || '');
                  setTrEmail(tr.email || '');
                  setTrUsername(tr.username || '');
                  setTrPassword('');
                  setTrPhone(tr.phone || '');
                  setTrNotes(tr.bio || tr.notes || '');
                }}
              >
                <Edit3 size={13} color={UI.indigo} />
                <Text style={[styles.smallBtnText, { color: UI.indigo }]}>Düzenle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, styles.smallBtnDanger]}
                onPress={() => handleDeleteTrainer(tr.id)}
              >
                <Trash2 size={13} color={UI.danger} />
                <Text style={[styles.smallBtnText, { color: UI.danger }]}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderSystemTab = () => (
    <View style={styles.sectionStack}>
      {/* Üst Özet Metrik Kartları */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>MÜŞTERİ & HOCA</Text>
          <Text style={styles.kpiVal}>
            {overview?.total_members ?? members.length} Üye •{' '}
            {overview?.total_trainers ?? trainers.length} Eğitmen
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>TOPLAM AKTİF KREDİ</Text>
          <Text style={[styles.kpiVal, { color: UI.emerald }]}>
            {overview?.total_remaining_credits ??
              members.reduce((acc, m) => acc + (m.remaining_credits || 0), 0)}{' '}
            Ders
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>AKTİF RANDEVU & DERS</Text>
          <Text style={styles.kpiVal}>
            {overview?.active_bookings_count ?? 0} Kayıt •{' '}
            {overview?.total_sessions ?? sessions.length} Seans
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>PAKET SATIŞ CİROSU</Text>
          <Text style={[styles.kpiVal, { color: UI.goldBright }]}>
            {(overview?.total_revenue_try ?? 0).toLocaleString('tr-TR')} TL
          </Text>
        </View>
      </View>

      {/* Alt Bölüm Seçici: Müşteriler | Ders Programı | Paket Ödemeleri */}
      <View style={styles.subSegmentBar}>
        {[
          { key: 'musteriler' as const, label: `Müşteriler (${members.length})`, Icon: Users },
          { key: 'dersler' as const, label: `Seanslar (${sessions.length})`, Icon: Calendar },
          { key: 'odemeler' as const, label: `Ödemeler (${payments.length})`, Icon: CreditCard },
        ].map((seg) => {
          const active = systemSubTab === seg.key;
          const SegIcon = seg.Icon;
          return (
            <TouchableOpacity
              key={seg.key}
              style={[styles.subSegmentBtn, active && styles.subSegmentBtnActive]}
              onPress={() => setSystemSubTab(seg.key)}
              activeOpacity={0.84}
            >
              <SegIcon size={14} color={active ? UI.darkInk : UI.textSec} />
              <Text
                style={[styles.subSegmentText, active && styles.subSegmentTextActive]}
                numberOfLines={1}
              >
                {seg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 4A: MÜŞTERİ TABLOSU & PAKET KREDİ YÖNETİMİ */}
      {systemSubTab === 'musteriler' && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Müşteri Tablosu & Paket Kredileri</Text>
              <Text style={styles.cardSub}>
                Tüm müşterileri görüntüleyin, yeni müşteri ekleyin, sakatlık notu ve kredi tanımlayın.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => setShowAddMemberForm((prev) => !prev)}
            >
              {showAddMemberForm ? (
                <X size={15} color={UI.darkInk} />
              ) : (
                <Plus size={15} color={UI.darkInk} />
              )}
              <Text style={styles.headerAddBtnText}>
                {showAddMemberForm ? 'Kapat' : 'Yeni Müşteri'}
              </Text>
            </TouchableOpacity>
          </View>

          {showAddMemberForm && (
            <View style={styles.inlineCreateBox}>
              <Text style={styles.inlineCreateTitle}>Yeni Müşteri & Paket Kaydı</Text>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Ad Soyad *</Text>
                  <TextInput
                    value={memFullName}
                    onChangeText={setMemFullName}
                    placeholder="Örn: Seda Yalçın"
                    placeholderTextColor={UI.textMuted}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Telefon</Text>
                  <TextInput
                    value={memPhone}
                    onChangeText={setMemPhone}
                    placeholder="0533 000 00 00"
                    placeholderTextColor={UI.textMuted}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={[styles.twoCol, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>E-posta</Text>
                  <TextInput
                    value={memEmail}
                    onChangeText={setMemEmail}
                    placeholder="seda@eposta.com"
                    placeholderTextColor={UI.textMuted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Giriş Şifresi</Text>
                  <TextInput
                    value={memPassword}
                    onChangeText={setMemPassword}
                    placeholder="Varsayılan: Erya2026!"
                    placeholderTextColor={UI.textMuted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={[styles.twoCol, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Paket Adı</Text>
                  <TextInput
                    value={memPackageName}
                    onChangeText={setMemPackageName}
                    placeholder="8 Seans Grup Reformer"
                    placeholderTextColor={UI.textMuted}
                    style={styles.input}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <Text style={styles.inputLabel}>Ders Kredisi</Text>
                  <TextInput
                    value={memCredits}
                    onChangeText={setMemCredits}
                    keyboardType="number-pad"
                    placeholder="8"
                    placeholderTextColor={UI.textMuted}
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginTop: 8 }]}>
                Sağlık / Postür / Sakatlık Notu
              </Text>
              <TextInput
                value={memNotes}
                onChangeText={setMemNotes}
                placeholder="Örn: Bel fıtığı başlangıcı, kontrollü core çalışması..."
                placeholderTextColor={UI.textMuted}
                style={styles.input}
              />

              <TouchableOpacity
                style={[styles.actionBtn, { marginTop: 12 }]}
                onPress={handleCreateMember}
                disabled={savingMember}
              >
                {savingMember ? (
                  <ActivityIndicator size="small" color={UI.darkInk} />
                ) : (
                  <>
                    <UserPlus size={15} color={UI.darkInk} />
                    <Text style={styles.actionBtnText}>Müşteriyi Tabloya Ekle</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Arama Kutusu */}
          <View style={styles.searchBar}>
            <Search size={16} color={UI.textMuted} />
            <TextInput
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="İsim, e-posta, telefon, FIT kodu veya sakatlık notu ara..."
              placeholderTextColor={UI.textMuted}
              style={styles.searchInput}
            />
            {memberSearch ? (
              <TouchableOpacity onPress={() => setMemberSearch('')}>
                <X size={15} color={UI.textSec} />
              </TouchableOpacity>
            ) : null}
          </View>

          {filteredMembers.map((m) => {
            const isEditing = editingMemberId === m.id;
            const isBusy = busyMemberActionId === m.id;
            return (
              <View
                key={m.id}
                style={[
                  styles.listItemCard,
                  m.low_credit_warning && { borderColor: 'rgba(251, 191, 36, 0.45)' },
                ]}
              >
                <View style={styles.listItemTopRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowWrap}>
                      <Text style={styles.listItemTitle}>{m.full_name}</Text>
                      {m.access_code ? (
                        <View style={styles.tagPill}>
                          <Text style={styles.tagPillText}>{m.access_code}</Text>
                        </View>
                      ) : null}
                      {m.low_credit_warning ? (
                        <View style={styles.lowCreditPill}>
                          <Text style={styles.lowCreditPillText}>Azalan Kredi</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.metaLine}>
                      {m.email || m.username || '-'} • {m.phone || '-'}
                    </Text>
                  </View>

                  <View style={styles.creditCountBadge}>
                    <Text
                      style={[
                        styles.creditCountValue,
                        m.low_credit_warning && { color: UI.amber },
                      ]}
                    >
                      {m.remaining_credits}/{m.total_credits}
                    </Text>
                    <Text style={styles.creditCountLabel}>KALAN</Text>
                  </View>
                </View>

                <Text style={styles.packageMetaLine}>
                  Paket: {m.package_name || 'Aktif Paket Yok'}
                  {m.expiry_date ? ` • Bitiş: ${m.expiry_date}` : ''} • Randevu:{' '}
                  {m.upcoming_bookings_count ?? 0}
                </Text>

                {m.notes ? (
                  <View style={styles.healthNoteBox}>
                    <Text style={styles.healthNoteText}>Not: {m.notes}</Text>
                  </View>
                ) : null}

                {/* Hızlı Kredi Artır / Azalt ve Paneli Aç Aksiyonları */}
                <View style={styles.itemActionsRow}>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={isBusy}
                    onPress={() => handleAdjustMemberCredits(m.id, 1)}
                  >
                    <Text style={[styles.smallBtnText, { color: UI.emerald }]}>+1 Ders</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={isBusy}
                    onPress={() => handleAdjustMemberCredits(m.id, 8)}
                  >
                    <Text style={[styles.smallBtnText, { color: UI.emerald }]}>+8 Paket</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={isBusy}
                    onPress={() => handleAdjustMemberCredits(m.id, -1)}
                  >
                    <Text style={[styles.smallBtnText, { color: UI.amber }]}>-1 Ders</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => {
                      if (isEditing) {
                        setEditingMemberId(null);
                      } else {
                        setEditingMemberId(m.id);
                        setEditMemberNotes(m.notes || '');
                        setEditMemberSetCredits(String(m.remaining_credits ?? 0));
                        setEditMemberPkgName(m.package_name || '8 Seans Grup Reformer Paketi');
                      }
                    }}
                  >
                    <Edit3 size={12} color={UI.indigo} />
                    <Text style={[styles.smallBtnText, { color: UI.indigo }]}>Düzenle</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => handleEnterMemberPanel(m)}
                  >
                    <Eye size={12} color={UI.goldBright} />
                    <Text style={styles.smallBtnText}>Üye Paneli</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallBtn, styles.smallBtnDanger]}
                    disabled={isBusy}
                    onPress={() => handleDeleteMember(m)}
                  >
                    <Trash2 size={12} color={UI.danger} />
                  </TouchableOpacity>
                </View>

                {isEditing && (
                  <View style={styles.memberEditDrawer}>
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Paket Adı</Text>
                        <TextInput
                          value={editMemberPkgName}
                          onChangeText={setEditMemberPkgName}
                          style={styles.input}
                        />
                      </View>
                      <View style={{ width: 110 }}>
                        <Text style={styles.inputLabel}>Kalan Kredi</Text>
                        <TextInput
                          value={editMemberSetCredits}
                          onChangeText={setEditMemberSetCredits}
                          keyboardType="number-pad"
                          style={styles.input}
                        />
                      </View>
                    </View>
                    <Text style={[styles.inputLabel, { marginTop: 8 }]}>
                      Eğitmen / Sakatlık Notu
                    </Text>
                    <TextInput
                      value={editMemberNotes}
                      onChangeText={setEditMemberNotes}
                      placeholder="Sakatlık veya postür notu..."
                      placeholderTextColor={UI.textMuted}
                      style={styles.input}
                    />
                    <TouchableOpacity
                      style={[styles.actionBtn, { marginTop: 10, minHeight: 42 }]}
                      onPress={() => handleSaveMemberDetailsAndCredits(m)}
                      disabled={isBusy}
                    >
                      <Text style={styles.actionBtnText}>Kaydet</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* 4B: DERS PROGRAMI & SEANS YÖNETİMİ */}
      {systemSubTab === 'dersler' && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Ders Programı & Seans Yönetimi</Text>
              <Text style={styles.cardSub}>
                Yeni grup veya bireysel ders açın, mevcut seansları yönetin.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => setShowAddSessionForm((prev) => !prev)}
            >
              {showAddSessionForm ? (
                <X size={15} color={UI.darkInk} />
              ) : (
                <CalendarPlus size={15} color={UI.darkInk} />
              )}
              <Text style={styles.headerAddBtnText}>
                {showAddSessionForm ? 'Kapat' : 'Yeni Seans'}
              </Text>
            </TouchableOpacity>
          </View>

          {showAddSessionForm && (
            <View style={styles.inlineCreateBox}>
              <Text style={styles.inlineCreateTitle}>Yeni Ders Seansı Planla</Text>

              <Text style={styles.inputLabel}>Eğitmen Seçin</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsRow}
              >
                {trainers.map((tr) => {
                  const active = (sessTrainerId ?? trainers[0]?.id) === tr.id;
                  return (
                    <TouchableOpacity
                      key={tr.id}
                      style={[styles.selectChip, active && styles.selectChipIndigo]}
                      onPress={() => setSessTrainerId(tr.id)}
                    >
                      <Text
                        style={[
                          styles.selectChipText,
                          active && { color: UI.indigo, fontWeight: '800' },
                        ]}
                      >
                        {tr.full_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Kategori</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsRow}
              >
                {SESSION_CATEGORIES.map((cat) => {
                  const active = sessCategory === cat.label;
                  return (
                    <TouchableOpacity
                      key={cat.label}
                      style={[styles.selectChip, active && styles.selectChipGold]}
                      onPress={() => {
                        setSessCategory(cat.label);
                        setSessTitle(`${cat.label} Seansı`);
                        setSessRoom(cat.room);
                        setSessCapacity(String(cat.cap));
                      }}
                    >
                      <Text
                        style={[
                          styles.selectChipText,
                          active && { color: UI.goldBright, fontWeight: '800' },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Ders Başlığı</Text>
              <TextInput
                value={sessTitle}
                onChangeText={setSessTitle}
                style={styles.input}
              />

              <View style={[styles.twoCol, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Tarih (YYYY-MM-DD)</Text>
                  <TextInput
                    value={sessDate}
                    onChangeText={setSessDate}
                    style={styles.input}
                  />
                </View>
                <View style={{ width: 95 }}>
                  <Text style={styles.inputLabel}>Saat</Text>
                  <TextInput
                    value={sessStartTime}
                    onChangeText={setSessStartTime}
                    placeholder="18:00"
                    style={styles.input}
                  />
                </View>
                <View style={{ width: 85 }}>
                  <Text style={styles.inputLabel}>Kontenjan</Text>
                  <TextInput
                    value={sessCapacity}
                    onChangeText={setSessCapacity}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, { marginTop: 12 }]}
                onPress={handleCreateSession}
                disabled={savingSession}
              >
                {savingSession ? (
                  <ActivityIndicator size="small" color={UI.darkInk} />
                ) : (
                  <Text style={styles.actionBtnText}>Seansı Takvime Ekle</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {sessions.length === 0 ? (
            <Text style={styles.emptyListText}>Kayıtlı ders seansı bulunamadı.</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={styles.listItemCard}>
                <View style={styles.listItemTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listItemTitle}>{s.title}</Text>
                    <Text style={styles.metaLine}>
                      {s.date} • {s.start_time}-{s.end_time} • {s.trainer_name}
                    </Text>
                  </View>
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>
                      {s.current_enrolled}/{s.capacity} Kayıt
                    </Text>
                  </View>
                </View>
                <View style={styles.itemActionsRow}>
                  <Text style={[styles.dateMetaText, { flex: 1 }]}>
                    Salon: {s.room || 'Ana Stüdyo'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.smallBtnDanger]}
                    onPress={() => handleDeleteSession(s.id)}
                  >
                    <Trash2 size={12} color={UI.danger} />
                    <Text style={[styles.smallBtnText, { color: UI.danger }]}>İptal / Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* 4C: SON PAKET ÖDEMELERİ */}
      {systemSubTab === 'odemeler' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Son Paket Ödemeleri ({payments.length})</Text>
          <Text style={styles.cardSub}>
            Online ödeme geçidi üzerinden veya stüdyodan gerçekleşen paket satın alımları.
          </Text>

          {payments.length === 0 ? (
            <Text style={styles.emptyListText}>Henüz ödeme hareketi bulunmuyor.</Text>
          ) : (
            payments.map((p) => {
              const amountVal = p.amount_try ?? p.amount ?? 0;
              return (
                <View key={`${p.id}-${p.transaction_code || p.session_id}`} style={styles.listItemCard}>
                  <View style={styles.listItemTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemTitle}>
                        {p.member_name || `Üye #${p.member_id}`}
                      </Text>
                      <Text style={styles.metaLine}>
                        {p.package_name || p.plan_name || 'Ders Paketi'}
                      </Text>
                    </View>
                    <Text style={[styles.listItemTitle, { color: UI.emerald }]}>
                      {amountVal.toLocaleString('tr-TR')} TL
                    </Text>
                  </View>
                  <Text style={styles.dateMetaText}>
                    Durum: {p.status} • Kod: {p.transaction_code || p.session_id || `#${p.id}`} •{' '}
                    {p.created_at}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );

  if (loading && !overview && members.length === 0) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={UI.gold} />
        <Text style={styles.loadingText}>Sistem Yönetim Merkezi Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Üst Yönetici Başlık Barı — Kişisel Üye/Sporcu Bilgisi Taşımaz */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <EryaBrandLogo size={34} lightText />
          <View style={{ flex: 1 }}>
            <View style={styles.zeroProfileBadge}>
              <ShieldCheck size={11} color={UI.goldBright} />
              <Text style={styles.zeroProfileBadgeText}>SİSTEM YÖNETİM MERKEZİ</Text>
            </View>
            <Text style={styles.topHeaderTitle} numberOfLines={1}>
              Tam Yetkili Stüdyo Kontrolü
            </Text>
          </View>
        </View>

        <View style={styles.topHeaderRight}>
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={handleRefresh}
            accessibilityLabel="Verileri yenile"
          >
            <RefreshCw size={16} color={UI.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={logout}
            activeOpacity={0.85}
            accessibilityLabel="Çıkış Yap"
          >
            <LogOut size={15} color={UI.danger} />
            <Text style={styles.logoutBtnText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ana 4 Sekme Navigasyonu */}
      <View style={styles.primaryTabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.primaryTabsScroll}
        >
          {[
            { key: 'paneller' as const, label: 'Panelleri Değiştir', Icon: Layers },
            { key: 'haberler' as const, label: 'Yeni Haber Yayınla', Icon: Megaphone },
            { key: 'ogretmenler' as const, label: 'Yeni Öğretmen Ekle', Icon: Award },
            { key: 'sistem' as const, label: 'Müşteriler & Sistem', Icon: Users },
          ].map((tab) => {
            const active = activeTab === tab.key;
            const TabIcon = tab.Icon;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.primaryTabBtn, active && styles.primaryTabBtnActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.85}
              >
                <TabIcon size={15} color={active ? UI.darkInk : UI.textSec} />
                <Text style={[styles.primaryTabText, active && styles.primaryTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Geri Bildirim Bandı */}
      {feedback ? (
        <View
          style={[
            styles.feedbackBanner,
            feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess,
          ]}
        >
          {feedback.type === 'error' ? (
            <AlertTriangle size={15} color={UI.danger} />
          ) : (
            <CheckCircle2 size={15} color={UI.emerald} />
          )}
          <Text style={styles.feedbackText}>{feedback.text}</Text>
        </View>
      ) : null}

      {/* Sekme İçeriği */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={UI.gold}
          />
        }
      >
        {activeTab === 'paneller' && renderPanelsTab()}
        {activeTab === 'haberler' && renderNewsTab()}
        {activeTab === 'ogretmenler' && renderTrainersTab()}
        {activeTab === 'sistem' && renderSystemTab()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: UI.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: UI.surface,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    gap: 10,
  },
  topHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zeroProfileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: UI.goldSoft,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  zeroProfileBadgeText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  topHeaderTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 15.5,
    fontWeight: '800',
    marginTop: 3,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: UI.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
  },
  logoutBtnText: {
    fontFamily: FONTS.sans,
    color: UI.danger,
    fontSize: 12.5,
    fontWeight: '800',
  },
  primaryTabsWrap: {
    backgroundColor: UI.surface,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },
  primaryTabsScroll: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  primaryTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: UI.elevated,
    borderWidth: 1,
    borderColor: UI.border,
  },
  primaryTabBtnActive: {
    backgroundColor: UI.gold,
    borderColor: UI.goldBright,
  },
  primaryTabText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryTabTextActive: {
    color: UI.darkInk,
    fontWeight: '800',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: UI.emeraldSoft,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  feedbackError: {
    backgroundColor: UI.dangerSoft,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  feedbackText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 12.5,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
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
    fontWeight: '800',
  },
  cardSub: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  panelSwitchCard: {
    backgroundColor: UI.elevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    marginTop: 12,
  },
  panelSwitchCardActive: {
    borderColor: UI.goldBorder,
    backgroundColor: 'rgba(201, 164, 82, 0.08)',
  },
  inlineBadgeGold: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: UI.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  inlineBadgeGoldText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 10,
    fontWeight: '800',
  },
  panelCardTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 14.5,
    fontWeight: '800',
  },
  panelCardDesc: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
    marginTop: 3,
    lineHeight: 17,
  },
  pillsRow: {
    gap: 8,
    paddingVertical: 10,
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
  },
  selectChipGold: {
    backgroundColor: UI.goldSoft,
    borderColor: UI.gold,
  },
  selectChipIndigo: {
    backgroundColor: UI.indigoSoft,
    borderColor: UI.indigo,
  },
  selectChipText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
    fontWeight: '600',
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },
  toggleTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 13.5,
    fontWeight: '700',
  },
  toggleDesc: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    marginTop: 2,
  },
  bannerFieldsWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: UI.elevated,
    borderWidth: 1,
    borderColor: UI.border,
  },
  inputLabel: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '700',
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
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: UI.elevated,
    borderWidth: 1,
    borderColor: UI.border,
  },
  cancelEditText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyListText: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  listItemCard: {
    backgroundColor: UI.elevated,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    marginTop: 12,
  },
  listItemTopRow: {
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
  tagPill: {
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagPillText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 11,
    fontWeight: '700',
  },
  pinnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: UI.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pinnedPillText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  lowCreditPill: {
    backgroundColor: UI.amberSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lowCreditPillText: {
    fontFamily: FONTS.sans,
    color: UI.amber,
    fontSize: 10.5,
    fontWeight: '800',
  },
  dateMetaText: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 11.5,
  },
  listItemTitle: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 4,
  },
  listItemBody: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 5,
  },
  trainerSpecText: {
    fontFamily: FONTS.sans,
    color: UI.indigo,
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
  },
  metaLine: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    marginTop: 4,
  },
  packageMetaLine: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    marginTop: 6,
  },
  notePreviewText: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  healthNoteBox: {
    marginTop: 8,
    backgroundColor: UI.amberSoft,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  healthNoteText: {
    fontFamily: FONTS.sans,
    color: UI.amber,
    fontSize: 12,
    fontWeight: '600',
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  smallBtnDanger: {
    backgroundColor: UI.dangerSoft,
    borderColor: 'rgba(248, 113, 113, 0.25)',
  },
  smallBtnText: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 11.5,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiBox: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: UI.surface,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 16,
    padding: 14,
  },
  kpiLabel: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  kpiVal: {
    fontFamily: FONTS.sans,
    color: UI.text,
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 5,
  },
  subSegmentBar: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: UI.surface,
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
  },
  subSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  subSegmentBtnActive: {
    backgroundColor: UI.gold,
  },
  subSegmentText: {
    fontFamily: FONTS.sans,
    color: UI.textSec,
    fontSize: 12,
    fontWeight: '700',
  },
  subSegmentTextActive: {
    color: UI.darkInk,
    fontWeight: '800',
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: UI.gold,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
  },
  headerAddBtnText: {
    fontFamily: FONTS.sans,
    color: UI.darkInk,
    fontSize: 12,
    fontWeight: '800',
  },
  inlineCreateBox: {
    backgroundColor: UI.elevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.goldBorder,
    marginBottom: 14,
  },
  inlineCreateTitle: {
    fontFamily: FONTS.sans,
    color: UI.goldBright,
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 10,
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
  creditCountBadge: {
    backgroundColor: UI.input,
    borderWidth: 1,
    borderColor: UI.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  creditCountValue: {
    fontFamily: FONTS.sans,
    color: UI.emerald,
    fontSize: 14.5,
    fontWeight: '800',
  },
  creditCountLabel: {
    fontFamily: FONTS.sans,
    color: UI.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  memberEditDrawer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
});
