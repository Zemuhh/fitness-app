import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Activity,
  Calendar,
  CreditCard,
  Home,
  Megaphone,
  QrCode,
  User,
  Users,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { CleanAppHeader } from '@/components/CleanAppHeader';
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
  MemberDrawerRoute,
  MemberWaitlistItem,
  WaitlistActionResponse,
} from '@/types/fitness';
import { MemberDashboardTab } from '@/screens/member/MemberDashboardTab';
import { MemberBookingTab } from '@/screens/member/MemberBookingTab';
import { MemberTrainersScreen } from '@/screens/member/MemberTrainersScreen';
import { MemberPackageRenewScreen } from '@/screens/member/MemberPackageRenewScreen';
import { MemberNewsScreen } from '@/screens/member/MemberNewsScreen';
import { MemberProgressTab } from '@/screens/member/MemberProgressTab';
import { MemberProfileTab } from '@/screens/member/MemberProfileTab';
import {
  MemberNotificationsModal,
  MemberQrModal,
} from '@/screens/member/MemberQrTab';
import { TrainerDetailModal } from '@/screens/member/TrainerDetailModal';

export const MEMBER_DRAWER_MENU: DrawerMenuItemConfig<MemberDrawerRoute>[] = [
  { key: 'home', Icon: Home, label: 'Ana Sayfa' },
  { key: 'schedule', Icon: Calendar, label: 'Ders Programı' },
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

  const [dashboard, setDashboard] = useState<MemberDashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const loadedMemberIdRef = useRef<number | null>(null);

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

  const fetchDashboard = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [dashRes, annRes] = await Promise.all([
          apiRequest<MemberDashboardData>(`/member/${member.id}/dashboard`),
          apiRequest<AnnouncementItem[]>('/announcements').catch(() => []),
        ]);
        setDashboard(dashRes);
        setAnnouncements(annRes);
        loadedMemberIdRef.current = dashRes.member.id;
      } catch (err: any) {
        showBanner('error', err?.message || 'Üye verileri yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member.id, showBanner]
  );

  useEffect(() => {
    const isSilent = loadedMemberIdRef.current === member.id;
    fetchDashboard(isSilent);
  }, [fetchDashboard, refreshSignal, member.id]);

  const unreadCount = useMemo(() => {
    const activeCount = (dashboard?.my_bookings ?? []).filter(
      (b) => b.status === 'booked'
    ).length;
    const waitCount = dashboard?.waitlist_items?.length ?? 0;
    return activeCount + waitCount + Math.min(announcements.length, 3);
  }, [dashboard?.my_bookings, dashboard?.waitlist_items, announcements.length]);

  const packageSummary = useMemo(() => {
    const pkg = dashboard?.active_package;
    if (!pkg) return '';
    return `${pkg.remaining_credits} seans`;
  }, [dashboard?.active_package]);

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
  const remainingCredits = dashboard?.active_package?.remaining_credits ?? 0;

  return (
    <View style={styles.container}>
      {showBuiltInChrome && (
        <>
          <CleanAppHeader
            user={dashboard?.member ?? member}
            activeRoute={currentRoute}
            activePageTitle={MEMBER_CONCISE_TITLES[currentRoute]}
            unreadNotificationCount={unreadCount}
            onOpenDrawer={() => setInternalDrawerOpen(true)}
            onOpenNotifications={handleTriggerOpenNotifications}
            onOpenQr={handleTriggerOpenQr}
          />
          <SlideOverDrawer
            visible={internalDrawerOpen}
            user={dashboard?.member ?? member}
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
        {loading || !dashboard ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loaderText}>Stüdyo deneyiminiz hazırlanıyor...</Text>
          </View>
        ) : currentRoute === 'home' ? (
          <MemberDashboardTab
            member={dashboard.member}
            dashboard={dashboard}
            onRefreshParent={() => fetchDashboard(true)}
            onNavigate={handleNavigate}
            onOpenQr={handleTriggerOpenQr}
            onCancelBooking={handleCancelBooking}
            busyBookingId={busyBookingId}
          />
        ) : currentRoute === 'schedule' ? (
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
        ) : currentRoute === 'trainers' ? (
          <MemberTrainersScreen
            member={dashboard.member}
            onOpenTrainerDetail={(tId) => setSelectedTrainerId(tId)}
          />
        ) : currentRoute === 'packages' ? (
          <MemberPackageRenewScreen
            data={dashboard}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onRenewCompleted={async () => {
              await fetchDashboard(true);
            }}
            onShowBanner={showBanner}
          />
        ) : currentRoute === 'news' ? (
          <MemberNewsScreen onNavigate={handleNavigate} />
        ) : currentRoute === 'metrics' ? (
          <MemberProgressTab
            member={dashboard.member}
            onGoToSchedule={() => handleNavigate('schedule')}
            onOpenTrainerDetail={(tId) => setSelectedTrainerId(tId)}
          />
        ) : (
          <MemberProfileTab
            data={dashboard}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onOpenPackageRenew={() => handleNavigate('packages')}
            onOpenQr={handleTriggerOpenQr}
            onShowBanner={showBanner}
          />
        )}
      </View>

      {/* EĞİTMEN DETAY & AÇIK DERSLER MODALI */}
      <TrainerDetailModal
        visible={selectedTrainerId !== null}
        trainerId={selectedTrainerId}
        member={dashboard?.member ?? member}
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

      {/* AYDINLIK QR GİRİŞ MODALI */}
      <MemberQrModal
        visible={isQrOpen}
        data={dashboard}
        accessCode={memberAccessCode}
        onClose={handleTriggerCloseQr}
        onOpenPackageRenew={() => handleNavigate('packages')}
      />

      {/* AYDINLIK BİLDİRİMLER MODALI */}
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
