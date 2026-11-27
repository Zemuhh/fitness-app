import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  Calendar,
  CreditCard,
  Gift,
  Home,
  Megaphone,
  QrCode,
  Sparkles,
  User,
  Users,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { CleanAppHeader } from '@/components/CleanAppHeader';
import { DashboardSkeleton, LazyScreenFallback } from '@/components/DashboardSkeleton';
import {
  DrawerMenuItemConfig,
  registerMemberQrOpener,
  SlideOverDrawer,
} from '@/components/SlideOverDrawer';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { COLORS } from '@/theme/colors';
import {
  AnnouncementItem,
  AppUser,
  AvailableSession,
  BookingActionResponse,
  MemberBookingItem,
  MemberDashboardData,
  MemberDashboardSummary,
  MemberDrawerRoute,
  MemberWaitlistItem,
  WaitlistActionResponse,
} from '@/types/fitness';
import { MemberDashboardTab } from '@/screens/member/MemberDashboardTab';

const MemberBookingTab = React.lazy(() =>
  import('@/screens/member/MemberBookingTab').then((m) => ({
    default: m.MemberBookingTab,
  }))
);
const MemberNutritionScreen = React.lazy(() =>
  import('@/screens/member/MemberNutritionScreen').then((m) => ({
    default: m.MemberNutritionScreen,
  }))
);
const MemberReferralScreen = React.lazy(() =>
  import('@/screens/member/MemberReferralScreen').then((m) => ({
    default: m.MemberReferralScreen,
  }))
);
const MemberTrainersScreen = React.lazy(() =>
  import('@/screens/member/MemberTrainersScreen').then((m) => ({
    default: m.MemberTrainersScreen,
  }))
);
const MemberPackageRenewScreen = React.lazy(() =>
  import('@/screens/member/MemberPackageRenewScreen').then((m) => ({
    default: m.MemberPackageRenewScreen,
  }))
);
const MemberNewsScreen = React.lazy(() =>
  import('@/screens/member/MemberNewsScreen').then((m) => ({
    default: m.MemberNewsScreen,
  }))
);
const MemberProgressTab = React.lazy(() =>
  import('@/screens/member/MemberProgressTab').then((m) => ({
    default: m.MemberProgressTab,
  }))
);
const MemberProfileTab = React.lazy(() =>
  import('@/screens/member/MemberProfileTab').then((m) => ({
    default: m.MemberProfileTab,
  }))
);
const MemberQrModal = React.lazy(() =>
  import('@/screens/member/MemberQrTab').then((m) => ({
    default: m.MemberQrModal,
  }))
);
const MemberNotificationsModal = React.lazy(() =>
  import('@/screens/member/MemberQrTab').then((m) => ({
    default: m.MemberNotificationsModal,
  }))
);
const TrainerDetailModal = React.lazy(() =>
  import('@/screens/member/TrainerDetailModal').then((m) => ({
    default: m.TrainerDetailModal,
  }))
);

export const MEMBER_DRAWER_MENU: DrawerMenuItemConfig<MemberDrawerRoute>[] = [
  { key: 'home', Icon: Home, label: 'Ana Sayfa' },
  { key: 'schedule', Icon: Calendar, label: 'Ders Programı' },
  { key: 'nutrition', Icon: Sparkles, label: '🥗 AI Beslenme & Toparlanma' },
  { key: 'referral', Icon: Gift, label: '🎁 Arkadaşını Getir (+1 Ders)' },
  { key: 'packages', Icon: CreditCard, label: 'Paketler' },
  { key: 'qr', Icon: QrCode, label: 'QR Giriş', isQrAction: true },
  { key: 'metrics', Icon: Activity, label: 'Gelişim' },
  { key: 'trainers', Icon: Users, label: 'Eğitmenler' },
  { key: 'news', Icon: Megaphone, label: 'Duyurular' },
  { key: 'profile', Icon: User, label: 'Profil' },
];

export const MEMBER_CONCISE_TITLES: Record<MemberDrawerRoute, string> = {
  home: 'Ana Sayfa',
  schedule: 'Ders Programı',
  nutrition: '🥗 AI Beslenme & Toparlanma',
  referral: '🎁 Arkadaşını Getir (+1 Ders)',
  packages: 'Paketler',
  metrics: 'Gelişim',
  trainers: 'Eğitmenler',
  news: 'Duyurular',
  profile: 'Profil',
};

export interface MemberRootViewProps {
  member: AppUser;
  activeRoute?: MemberDrawerRoute;
  onNavigate?: (route: MemberDrawerRoute) => void;
  onRouteChange?: (route: MemberDrawerRoute) => void;
  hideInternalHeader?: boolean;
  qrModalVisible?: boolean;
  onOpenQr?: () => void;
  onCloseQr?: () => void;
  notificationsModalVisible?: boolean;
  onOpenNotifications?: () => void;
  onCloseNotifications?: () => void;
  onUnreadCountChange?: (count: number) => void;
  onPackageSummaryChange?: (summary: string) => void;
  onOpenGateway?: () => void;
  onOpenAdmin?: () => void;
}

export function MemberRootView({
  member,
  activeRoute,
  onNavigate,
  onRouteChange,
  hideInternalHeader = false,
  qrModalVisible,
  onOpenQr,
  onCloseQr,
  notificationsModalVisible,
  onOpenNotifications,
  onCloseNotifications,
  onUnreadCountChange,
  onPackageSummaryChange,
  onOpenGateway,
  onOpenAdmin,
}: MemberRootViewProps) {
  const { refreshSignal, triggerGlobalRefresh } = useAuthDemo();

  const [internalRoute, setInternalRoute] = useState<MemberDrawerRoute>('home');
  const [internalDrawerOpen, setInternalDrawerOpen] = useState<boolean>(false);
  const [internalQrOpen, setInternalQrOpen] = useState<boolean>(false);
  const [internalNotifOpen, setInternalNotifOpen] = useState<boolean>(false);

  const [summary, setSummary] = useState<MemberDashboardSummary | null>(null);
  const [dashboard, setDashboard] = useState<MemberDashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingFullDashboard, setLoadingFullDashboard] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedMemberIdRef = useRef<number | null>(null);
  const loadedFullMemberIdRef = useRef<number | null>(null);

  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [busySessionId, setBusySessionId] = useState<number | null>(null);
  const [busyWaitlistId, setBusyWaitlistId] = useState<number | null>(null);

  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);

  const [banner, setBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const currentRoute: MemberDrawerRoute = activeRoute ?? internalRoute;
  const showBuiltInChrome = activeRoute === undefined && !hideInternalHeader;

  const isQrOpen = qrModalVisible ?? internalQrOpen;
  const isNotifOpen = notificationsModalVisible ?? internalNotifOpen;

  const handleNavigate = useCallback(
    (nextRoute: MemberDrawerRoute) => {
      setInternalRoute(nextRoute);
      onNavigate?.(nextRoute);
      onRouteChange?.(nextRoute);
    },
    [onNavigate, onRouteChange]
  );

  const handleTriggerOpenQr = useCallback(() => {
    if (onOpenQr && qrModalVisible !== undefined) {
      onOpenQr();
    } else {
      setInternalQrOpen(true);
      onOpenQr?.();
    }
  }, [onOpenQr, qrModalVisible]);

  useEffect(() => {
    registerMemberQrOpener(handleTriggerOpenQr);
    return () => {
      registerMemberQrOpener(null);
    };
  }, [handleTriggerOpenQr]);

  const handleTriggerCloseQr = useCallback(() => {
    setInternalQrOpen(false);
    onCloseQr?.();
  }, [onCloseQr]);

  const handleTriggerOpenNotifications = useCallback(() => {
    if (onOpenNotifications && notificationsModalVisible !== undefined) {
      onOpenNotifications();
    } else {
      setInternalNotifOpen(true);
      onOpenNotifications?.();
    }
  }, [onOpenNotifications, notificationsModalVisible]);

  const handleTriggerCloseNotifications = useCallback(() => {
    setInternalNotifOpen(false);
    onCloseNotifications?.();
  }, [onCloseNotifications]);

  const showBanner = useCallback(
    (type: 'success' | 'warning' | 'error', text: string) => {
      setBanner({ type, text });
      setTimeout(() => {
        setBanner((prev) => (prev?.text === text ? null : prev));
      }, 3800);
    },
    []
  );

  const fetchFullDashboard = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingFullDashboard(true);
      try {
        const dashRes = await apiRequest<MemberDashboardData>(
          `/member/${member.id}/dashboard`
        );
        setDashboard(dashRes);
        loadedFullMemberIdRef.current = dashRes.member.id;
        return dashRes;
      } catch (err: any) {
        if (!silent) {
          const msg =
            err?.message ||
            'Üye verileri yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
          setLoadError(msg);
          showBanner('error', msg);
        }
        return null;
      } finally {
        setLoadingFullDashboard(false);
        setRefreshing(false);
      }
    },
    [member.id, showBanner]
  );

  const fetchSummary = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const summaryRes = await apiRequest<MemberDashboardSummary>(
          `/dashboard/${member.id}/summary`
        );
        setSummary(summaryRes);
        setAnnouncements(
          Array.isArray(summaryRes.announcements) ? summaryRes.announcements : []
        );
        loadedMemberIdRef.current = summaryRes.member.id;
      } catch {
        // Eski sunucu veya geçici hata durumunda mevcut /member/{id}/dashboard + /announcements yoluna düş
        try {
          const [dashRes, annRes] = await Promise.all([
            apiRequest<MemberDashboardData>(`/member/${member.id}/dashboard`),
            apiRequest<AnnouncementItem[]>('/announcements').catch(() => []),
          ]);
          setDashboard(dashRes);
          setAnnouncements(Array.isArray(annRes) ? annRes : []);
          loadedMemberIdRef.current = dashRes.member.id;
          loadedFullMemberIdRef.current = dashRes.member.id;
        } catch (err: any) {
          const msg =
            err?.message ||
            'Üye verileri yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
          setLoadError(msg);
          showBanner('error', msg);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member.id, showBanner]
  );

  const fetchDashboard = useCallback(
    async (silent = false) => {
      const needsFull =
        currentRoute === 'schedule' ||
        currentRoute === 'packages' ||
        currentRoute === 'profile' ||
        isQrOpen ||
        isNotifOpen ||
        loadedFullMemberIdRef.current === member.id;

      if (needsFull) {
        await Promise.all([fetchSummary(silent), fetchFullDashboard(silent)]);
      } else {
        await fetchSummary(silent);
      }
    },
    [currentRoute, fetchFullDashboard, fetchSummary, isNotifOpen, isQrOpen, member.id]
  );

  useEffect(() => {
    const isSilent = loadedMemberIdRef.current === member.id;
    fetchSummary(isSilent);
    if (loadedFullMemberIdRef.current === member.id) {
      fetchFullDashboard(true);
    }
  }, [fetchFullDashboard, fetchSummary, refreshSignal, member.id]);

  // Ders programı, paketler, profil veya QR/bildirim modalları açıldığında tam dashboard verisini on-demand getir
  useEffect(() => {
    const requiresFull =
      currentRoute === 'schedule' ||
      currentRoute === 'packages' ||
      currentRoute === 'profile' ||
      isQrOpen ||
      isNotifOpen;

    if (requiresFull && loadedFullMemberIdRef.current !== member.id) {
      fetchFullDashboard(false);
    }
  }, [currentRoute, fetchFullDashboard, isNotifOpen, isQrOpen, member.id]);

  const activeMember = summary?.member ?? dashboard?.member ?? member;
  const activePackage = summary?.active_package ?? dashboard?.active_package ?? null;

  const unreadCount = useMemo(() => {
    if (dashboard) {
      const activeCount = (dashboard.my_bookings ?? []).filter(
        (b) => b.status === 'booked'
      ).length;
      const waitCount = dashboard.waitlist_items?.length ?? 0;
      return activeCount + waitCount + Math.min(announcements.length, 3);
    }
    const upcomingCount = summary?.upcoming_booking ? 1 : 0;
    return upcomingCount + Math.min(announcements.length, 3);
  }, [dashboard, summary?.upcoming_booking, announcements.length]);

  const packageSummary = useMemo(() => {
    if (!activePackage) return '';
    return `${activePackage.remaining_credits} seans`;
  }, [activePackage]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  useEffect(() => {
    onPackageSummaryChange?.(packageSummary);
  }, [packageSummary, onPackageSummaryChange]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard(true);
  }, [fetchDashboard]);

  const handleCancelBooking = useCallback(
    async (booking: MemberBookingItem) => {
      setBusyBookingId(booking.booking_id);
      try {
        const res = await apiRequest<BookingActionResponse>('/bookings/cancel', {
          method: 'POST',
          body: JSON.stringify({ booking_id: booking.booking_id }),
        });
        const msg = res.promoted_from_waitlist_member_name
          ? `${booking.title} iptal edildi (+1 kredi iade). Yedek listeden ${res.promoted_from_waitlist_member_name} otomatik derse alındı!`
          : `${booking.title} randevunuz iptal edildi. Kalan ders hakkınız: ${res.remaining_credits}`;
        showBanner('success', msg);
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Randevu iptal edilemedi.');
      } finally {
        setBusyBookingId(null);
      }
    },
    [fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const handleBookSession = useCallback(
    async (session: AvailableSession) => {
      setBusySessionId(session.id);
      try {
        const res = await apiRequest<BookingActionResponse>('/bookings/create', {
          method: 'POST',
          body: JSON.stringify({
            member_id: member.id,
            session_id: session.id,
          }),
        });
        showBanner(
          'success',
          `${session.title} dersine kaydınız alındı! Kalan ders hakkınız: ${res.remaining_credits}`
        );
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Derse kayıt olunamadı.');
      } finally {
        setBusySessionId(null);
      }
    },
    [member.id, fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const handleCancelBySession = useCallback(
    async (session: AvailableSession) => {
      setBusySessionId(session.id);
      try {
        const res = await apiRequest<BookingActionResponse>('/bookings/cancel', {
          method: 'POST',
          body: JSON.stringify({
            booking_id: session.booking_id ?? undefined,
            member_id: member.id,
            session_id: session.id,
          }),
        });
        const msg = res.promoted_from_waitlist_member_name
          ? `${session.title} kaydınız iptal edildi (+1 kredi iade). Yedek listeden ${res.promoted_from_waitlist_member_name} otomatik derse alındı!`
          : `${session.title} kaydınız iptal edildi. Kalan ders hakkınız: ${res.remaining_credits}`;
        showBanner('success', msg);
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Kayıt iptal edilemedi.');
      } finally {
        setBusySessionId(null);
      }
    },
    [member.id, fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const handleJoinWaitlist = useCallback(
    async (session: AvailableSession) => {
      setBusySessionId(session.id);
      try {
        const res = await apiRequest<WaitlistActionResponse>('/bookings/waitlist', {
          method: 'POST',
          body: JSON.stringify({
            member_id: member.id,
            session_id: session.id,
          }),
        });
        showBanner(
          'warning',
          `${session.title} için yedek listeye #${res.position}. sıradan yazıldınız!`
        );
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Yedek listeye yazılamadı.');
      } finally {
        setBusySessionId(null);
      }
    },
    [member.id, fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const handleCancelWaitlist = useCallback(
    async (session: AvailableSession) => {
      setBusySessionId(session.id);
      try {
        await apiRequest<WaitlistActionResponse>('/bookings/waitlist/cancel', {
          method: 'POST',
          body: JSON.stringify({
            waitlist_id: session.waitlist_id ?? undefined,
            member_id: member.id,
            session_id: session.id,
          }),
        });
        showBanner('success', `${session.title} yedek listesinden çıkıldı.`);
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Yedek listeden çıkılamadı.');
      } finally {
        setBusySessionId(null);
      }
    },
    [member.id, fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const handleCancelWaitlistItem = useCallback(
    async (item: MemberWaitlistItem) => {
      setBusyWaitlistId(item.waitlist_id);
      try {
        await apiRequest<WaitlistActionResponse>('/bookings/waitlist/cancel', {
          method: 'POST',
          body: JSON.stringify({ waitlist_id: item.waitlist_id }),
        });
        showBanner('success', `${item.title} yedek listesinden çıkıldı.`);
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Yedek listeden çıkılamadı.');
      } finally {
        setBusyWaitlistId(null);
      }
    },
    [fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const memberAccessCode = `FIT-${1000 + member.id}`;
  const remainingCredits =
    summary?.remaining_credits ?? activePackage?.remaining_credits ?? 0;

  return (
    <View style={styles.container}>
      {showBuiltInChrome && (
        <>
          <CleanAppHeader
            user={activeMember}
            activeRoute={currentRoute}
            activePageTitle={MEMBER_CONCISE_TITLES[currentRoute]}
            unreadNotificationCount={unreadCount}
            onOpenDrawer={() => setInternalDrawerOpen(true)}
            onOpenNotifications={handleTriggerOpenNotifications}
            onOpenQr={handleTriggerOpenQr}
          />
          <SlideOverDrawer
            visible={internalDrawerOpen}
            user={activeMember}
            activeMemberRoute={currentRoute}
            packageSummaryText={packageSummary}
            menuItems={MEMBER_DRAWER_MENU}
            onSelectMemberRoute={handleNavigate}
            onOpenQr={handleTriggerOpenQr}
            onClose={() => setInternalDrawerOpen(false)}
            onOpenGateway={onOpenGateway}
            onOpenAdmin={onOpenAdmin}
          />
        </>
      )}

      {banner && (
        <View
          style={[
            styles.bannerBox,
            banner.type === 'success'
              ? styles.bannerSuccess
              : banner.type === 'warning'
              ? styles.bannerWarning
              : styles.bannerError,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              {
                color:
                  banner.type === 'success'
                    ? COLORS.primary
                    : banner.type === 'warning'
                    ? COLORS.warningText
                    : COLORS.dangerText,
              },
            ]}
          >
            {banner.text}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        {loading && !summary && !dashboard ? (
          <DashboardSkeleton />
        ) : !summary && !dashboard ? (
          <View style={styles.centerLoader}>
            <Text style={styles.errorText}>
              {loadError || 'Üye verileri yüklenemedi.'}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchDashboard(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : currentRoute === 'home' ? (
          <MemberDashboardTab
            member={activeMember}
            summary={summary}
            dashboard={dashboard}
            onRefreshParent={() => fetchSummary(true)}
            onNavigate={handleNavigate}
            onOpenQr={handleTriggerOpenQr}
            onCancelBooking={handleCancelBooking}
            busyBookingId={busyBookingId}
          />
        ) : currentRoute === 'schedule' ? (
          !dashboard ? (
            loadingFullDashboard ? (
              <LazyScreenFallback label="Ders takvimi yükleniyor..." />
            ) : (
              <View style={styles.centerLoader}>
                <Text style={styles.errorText}>
                  {loadError || 'Ders takvimi yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.'}
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => fetchFullDashboard(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryBtnText}>Tekrar Dene</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <Suspense fallback={<LazyScreenFallback label="Ders takvimi hazırlanıyor..." />}>
              <MemberBookingTab
                data={dashboard}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                onBookSession={handleBookSession}
                onCancelBySession={handleCancelBySession}
                onJoinWaitlist={handleJoinWaitlist}
                onCancelWaitlist={handleCancelWaitlist}
                onOpenPackageRenew={() => handleNavigate('packages')}
                onOpenTrainerDetail={(tId) => setSelectedTrainerId(tId)}
                busySessionId={busySessionId}
              />
            </Suspense>
          )
        ) : currentRoute === 'nutrition' ? (
          <Suspense fallback={<LazyScreenFallback label="AI Beslenme & Toparlanma yükleniyor..." />}>
            <MemberNutritionScreen
              member={activeMember}
              onNavigate={handleNavigate}
              onShowBanner={showBanner}
            />
          </Suspense>
        ) : currentRoute === 'referral' ? (
          <Suspense fallback={<LazyScreenFallback label="Davet ekranı yükleniyor..." />}>
            <MemberReferralScreen
              member={activeMember}
              activePackage={activePackage}
              onCreditsUpdated={async () => {
                await fetchDashboard(true);
                triggerGlobalRefresh();
              }}
              onNavigate={handleNavigate}
              onShowBanner={showBanner}
            />
          </Suspense>
        ) : currentRoute === 'trainers' ? (
          <Suspense fallback={<LazyScreenFallback label="Eğitmen kadrosu yükleniyor..." />}>
            <MemberTrainersScreen
              member={activeMember}
              onOpenTrainerDetail={(tId) => setSelectedTrainerId(tId)}
            />
          </Suspense>
        ) : currentRoute === 'packages' ? (
          !dashboard ? (
            loadingFullDashboard ? (
              <LazyScreenFallback label="Üyelik paketleri yükleniyor..." />
            ) : (
              <View style={styles.centerLoader}>
                <Text style={styles.errorText}>
                  {loadError || 'Üyelik paketleri yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.'}
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => fetchFullDashboard(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryBtnText}>Tekrar Dene</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <Suspense fallback={<LazyScreenFallback label="Paket mağazası hazırlanıyor..." />}>
              <MemberPackageRenewScreen
                data={dashboard}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                onRenewCompleted={async () => {
                  await fetchDashboard(true);
                }}
                onShowBanner={showBanner}
              />
            </Suspense>
          )
        ) : currentRoute === 'news' ? (
          <Suspense fallback={<LazyScreenFallback label="Stüdyo duyuruları yükleniyor..." />}>
            <MemberNewsScreen onNavigate={handleNavigate} />
          </Suspense>
        ) : currentRoute === 'metrics' ? (
          <Suspense fallback={<LazyScreenFallback label="Gelişim ve vücut haritası yükleniyor..." />}>
            <MemberProgressTab
              member={activeMember}
              onGoToSchedule={() => handleNavigate('schedule')}
              onOpenTrainerDetail={(tId) => setSelectedTrainerId(tId)}
            />
          </Suspense>
        ) : !dashboard ? (
          loadingFullDashboard ? (
            <LazyScreenFallback label="Profil bilgileri yükleniyor..." />
          ) : (
            <View style={styles.centerLoader}>
              <Text style={styles.errorText}>
                {loadError || 'Profil bilgileri yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.'}
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => fetchFullDashboard(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>Tekrar Dene</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <Suspense fallback={<LazyScreenFallback label="Profil ekranı hazırlanıyor..." />}>
            <MemberProfileTab
              data={dashboard}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onOpenPackageRenew={() => handleNavigate('packages')}
              onOpenQr={handleTriggerOpenQr}
              onShowBanner={showBanner}
            />
          </Suspense>
        )}
      </View>

      {/* EĞİTMEN DETAY & AÇIK DERSLER MODALI */}
      {selectedTrainerId !== null ? (
        <Suspense fallback={null}>
          <TrainerDetailModal
            visible={selectedTrainerId !== null}
            trainerId={selectedTrainerId}
            member={activeMember}
            remainingCredits={remainingCredits}
            onClose={() => setSelectedTrainerId(null)}
            onSessionMutated={async () => {
              await fetchDashboard(true);
              triggerGlobalRefresh();
            }}
            onOpenPackageStore={() => {
              setSelectedTrainerId(null);
              handleNavigate('packages');
            }}
          />
        </Suspense>
      ) : null}

      {/* AYDINLIK QR GİRİŞ MODALI */}
      {isQrOpen ? (
        <Suspense fallback={null}>
          <MemberQrModal
            visible={isQrOpen}
            data={dashboard}
            accessCode={memberAccessCode}
            onClose={handleTriggerCloseQr}
            onOpenPackageRenew={() => handleNavigate('packages')}
          />
        </Suspense>
      ) : null}

      {/* AYDINLIK BİLDİRİMLER MODALI */}
      {isNotifOpen ? (
        <Suspense fallback={null}>
          <MemberNotificationsModal
            visible={isNotifOpen}
            dashboard={dashboard}
            announcements={announcements}
            onClose={handleTriggerCloseNotifications}
            onGoToSchedule={() => handleNavigate('schedule')}
            onGoToNews={() => handleNavigate('news')}
            onGoToProfile={() => handleNavigate('profile')}
            onCancelBooking={handleCancelBooking}
            onCancelWaitlistItem={handleCancelWaitlistItem}
            busyBookingId={busyBookingId}
            busyWaitlistId={busyWaitlistId}
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
  body: {
    flex: 1,
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loaderText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.dangerText,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  bannerBox: {
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  bannerWarning: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  bannerError: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  bannerText: {
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
});
