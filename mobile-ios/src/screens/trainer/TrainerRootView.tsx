import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CalendarPlus,
  Megaphone,
  MessageCircle,
  Users,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { CleanAppHeader } from '@/components/CleanAppHeader';
import {
  DrawerMenuItemConfig,
  SlideOverDrawer,
} from '@/components/SlideOverDrawer';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AppUser,
  AttendanceStatus,
  TrainerScheduleData,
  TrainerSession,
} from '@/types/fitness';
import { TrainerDrawerRoute } from '@/types/navigation';
import { TrainerScheduleTab } from '@/screens/trainer/TrainerScheduleTab';
import { TrainerStudentsCrmTab } from '@/screens/trainer/TrainerStudentsCrmTab';
import { TrainerCreateSessionTab } from '@/screens/trainer/TrainerCreateSessionTab';
import { InstagramDmSimulatorTab } from '@/screens/trainer/InstagramDmSimulatorTab';
import { TrainerAnnouncementsProfileTab } from '@/screens/trainer/TrainerAnnouncementsProfileTab';

export const TRAINER_DRAWER_MENU: DrawerMenuItemConfig<TrainerDrawerRoute>[] = [
  { key: 'schedule', Icon: Calendar, label: 'Ders Programı' },
  { key: 'crm', Icon: Users, label: 'Üyeler' },
  { key: 'create_session', Icon: CalendarPlus, label: 'Yeni Ders' },
  ...(__DEV__
    ? [
        {
          key: 'instagram_ai' as TrainerDrawerRoute,
          Icon: MessageCircle,
          label: 'DM Asistanı',
        },
      ]
    : []),
  { key: 'announcements_profile', Icon: Megaphone, label: 'Duyurular' },
];

export const TRAINER_CONCISE_TITLES: Record<TrainerDrawerRoute, string> = {
  schedule: 'Ders Programı',
  crm: 'Üyeler',
  create_session: 'Yeni Ders',
  instagram_ai: 'DM Asistanı',
  announcements_profile: 'Duyurular',
};

export interface Props {
  trainer: AppUser;
  activeRoute?: TrainerDrawerRoute;
  onNavigateRoute?: (route: TrainerDrawerRoute) => void;
}

export function TrainerRootView({
  trainer,
  activeRoute,
  onNavigateRoute,
}: Props) {
  const { refreshSignal, triggerGlobalRefresh, reloadUsers } = useAuthDemo();
  const [internalRoute, setInternalRoute] = useState<TrainerDrawerRoute>('schedule');
  const [fallbackDrawerOpen, setFallbackDrawerOpen] = useState<boolean>(false);

  const [schedule, setSchedule] = useState<TrainerScheduleData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState<boolean>(false);
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const rawRoute: TrainerDrawerRoute = activeRoute ?? internalRoute;
  const currentRoute: TrainerDrawerRoute =
    !__DEV__ && rawRoute === 'instagram_ai' ? 'schedule' : rawRoute;
  const isStandalone = activeRoute === undefined;

  const navigateRoute = useCallback(
    (route: TrainerDrawerRoute) => {
      setInternalRoute(route);
      onNavigateRoute?.(route);
    },
    [onNavigateRoute]
  );

  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showBanner = useCallback((type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  }, []);

  const fetchSchedule = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const res = await apiRequest<TrainerScheduleData>(
          `/trainer/${trainer.id}/schedule`
        );
        setSchedule(res);
      } catch (err: any) {
        const msg =
          err?.message ||
          'Eğitmen takvimi yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
        setLoadError(msg);
        showBanner('error', msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [trainer.id, showBanner]
  );

  useEffect(() => {
    fetchSchedule(Boolean(schedule && schedule.trainer.id === trainer.id));
  }, [fetchSchedule, refreshSignal, trainer.id]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSchedule(true);
  }, [fetchSchedule]);

  const handleMarkAttendance = useCallback(
    async (bookingId: number, status: AttendanceStatus) => {
      setBusyBookingId(bookingId);
      try {
        await apiRequest('/trainer/attendance', {
          method: 'POST',
          body: JSON.stringify({ booking_id: bookingId, status }),
        });

        const msg =
          status === 'attended'
            ? 'Yoklama "✅ Geldi" olarak kaydedildi.'
            : status === 'no_show'
            ? 'Yoklama "❌ Gelmedi" olarak kaydedildi.'
            : 'Yoklama durumu beklemede olarak güncellendi.';

        showBanner('success', msg);
        await fetchSchedule(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Yoklama güncellenemedi.');
      } finally {
        setBusyBookingId(null);
      }
    },
    [fetchSchedule, showBanner, triggerGlobalRefresh]
  );

  const handleSaveMemberNote = useCallback(
    async (memberId: number, notes: string) => {
      setSavingNote(true);
      try {
        await apiRequest(`/trainer/member/${memberId}/notes`, {
          method: 'PUT',
          body: JSON.stringify({ member_id: memberId, notes }),
        });
        showBanner('success', 'Öğrenci sakatlık / özel antrenman notu güncellendi.');
        await fetchSchedule(true);
        await reloadUsers();
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Not kaydedilemedi.');
      } finally {
        setSavingNote(false);
      }
    },
    [fetchSchedule, reloadUsers, showBanner, triggerGlobalRefresh]
  );

  const handleSessionCreated = useCallback(
    async (_created: TrainerSession) => {
      await fetchSchedule(true);
    },
    [fetchSchedule]
  );

  const handleJumpToScheduleDate = useCallback(
    (dateIso: string) => {
      setFocusDate(dateIso);
      navigateRoute('schedule');
    },
    [navigateRoute]
  );

  return (
    <View style={styles.container}>
      {isStandalone && (
        <>
          <CleanAppHeader
            user={trainer}
            activeRoute={currentRoute}
            activePageTitle={TRAINER_CONCISE_TITLES[currentRoute]}
            showQrButton={false}
            onOpenDrawer={() => setFallbackDrawerOpen(true)}
          />
          <SlideOverDrawer
            visible={fallbackDrawerOpen}
            user={trainer}
            activeTrainerRoute={currentRoute}
            menuItems={TRAINER_DRAWER_MENU}
            onSelectTrainerRoute={navigateRoute}
            onClose={() => setFallbackDrawerOpen(false)}
          />
        </>
      )}

      {banner && (
        <View
          style={[
            styles.bannerBox,
            banner.type === 'success' ? styles.bannerSuccess : styles.bannerError,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              {
                color:
                  banner.type === 'success' ? COLORS.primary : COLORS.dangerText,
              },
            ]}
          >
            {banner.text}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        {currentRoute === 'crm' ? (
          <TrainerStudentsCrmTab
            onShowBanner={showBanner}
            onScheduleSyncNeeded={() => fetchSchedule(true)}
          />
        ) : currentRoute === 'create_session' ? (
          <TrainerCreateSessionTab
            trainer={trainer}
            existingSessions={schedule?.sessions ?? []}
            onSessionCreated={handleSessionCreated}
            onViewInSchedule={handleJumpToScheduleDate}
            onShowBanner={showBanner}
          />
        ) : __DEV__ && currentRoute === 'instagram_ai' ? (
          <InstagramDmSimulatorTab
            onBookingMutated={() => fetchSchedule(true)}
            onNavigateRoute={navigateRoute}
          />
        ) : currentRoute === 'announcements_profile' ? (
          <TrainerAnnouncementsProfileTab
            trainer={trainer}
            schedule={schedule}
            onGoToCreateSession={() => navigateRoute('create_session')}
            onViewDateInSchedule={handleJumpToScheduleDate}
            onShowBanner={showBanner}
          />
        ) : loading && !schedule ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <Text style={styles.loaderText}>Eğitmen stüdyo paneli hazırlanıyor...</Text>
          </View>
        ) : !schedule ? (
          <View style={styles.centerLoader}>
            <Text style={styles.errorText}>
              {loadError || 'Eğitmen takvimi yüklenemedi.'}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchSchedule(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TrainerScheduleTab
            data={schedule}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onMarkAttendance={handleMarkAttendance}
            onSaveMemberNote={handleSaveMemberNote}
            onGoToCreateSession={() => navigateRoute('create_session')}
            busyBookingId={busyBookingId}
            savingNote={savingNote}
            focusDate={focusDate}
            onFocusDateConsumed={() => setFocusDate(null)}
          />
        )}
      </View>
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
    backgroundColor: COLORS.background,
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
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    ...CARD_SHADOW,
  },
  bannerSuccess: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  bannerError: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
