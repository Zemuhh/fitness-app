import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CalendarCheck2,
  CreditCard,
  LayoutDashboard,
  QrCode,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { COLORS } from '@/theme/colors';
import {
  AppUser,
  AvailableSession,
  BookingActionResponse,
  MemberBookingItem,
  MemberDashboardData,
} from '@/types/fitness';
import { MemberDashboardTab } from '@/screens/member/MemberDashboardTab';
import { MemberBookingTab } from '@/screens/member/MemberBookingTab';
import { MemberQrTab } from '@/screens/member/MemberQrTab';
import { PackageStoreScreen } from '@/screens/payment/PackageStoreScreen';

type MemberTabKey = 'dashboard' | 'schedule' | 'qr' | 'store';

interface Props {
  member: AppUser;
}

export function MemberRootView({ member }: Props) {
  const { refreshSignal, triggerGlobalRefresh } = useAuthDemo();
  const [activeTab, setActiveTab] = useState<MemberTabKey>('dashboard');
  const [dashboard, setDashboard] = useState<MemberDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [busySessionId, setBusySessionId] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showBanner = useCallback((type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  }, []);

  const fetchDashboard = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await apiRequest<MemberDashboardData>(`/member/${member.id}/dashboard`);
        setDashboard(res);
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
    fetchDashboard(false);
  }, [fetchDashboard, refreshSignal]);

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
        showBanner(
          'success',
          `${booking.title} randevunuz iptal edildi. Kalan ders hakkınız: ${res.remaining_credits}`
        );
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
      if (!session.booking_id) return;
      setBusySessionId(session.id);
      try {
        const res = await apiRequest<BookingActionResponse>('/bookings/cancel', {
          method: 'POST',
          body: JSON.stringify({ booking_id: session.booking_id }),
        });
        showBanner(
          'success',
          `${session.title} kaydınız iptal edildi. Kalan ders hakkınız: ${res.remaining_credits}`
        );
        await fetchDashboard(true);
        triggerGlobalRefresh();
      } catch (err: any) {
        showBanner('error', err?.message || 'Kayıt iptal edilemedi.');
      } finally {
        setBusySessionId(null);
      }
    },
    [fetchDashboard, showBanner, triggerGlobalRefresh]
  );

  const memberAccessCode = `FIT-${1000 + member.id}`;

  return (
    <View style={styles.container}>
      {banner && (
        <View
          style={[
            styles.bannerBox,
            banner.type === 'success' ? styles.bannerSuccess : styles.bannerError,
          ]}
        >
          <Text style={styles.bannerText}>{banner.text}</Text>
        </View>
      )}

      <View style={styles.body}>
        {activeTab === 'store' ? (
          <PackageStoreScreen
            member={member}
            onPurchaseCompleted={() => {
              fetchDashboard(true);
              triggerGlobalRefresh();
            }}
            onClose={() => setActiveTab('dashboard')}
          />
        ) : loading || !dashboard ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loaderText}>Üyelik bilgileriniz yükleniyor...</Text>
          </View>
        ) : activeTab === 'dashboard' ? (
          <MemberDashboardTab
            data={dashboard}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onCancelBooking={handleCancelBooking}
            busyBookingId={busyBookingId}
            onGoToSchedule={() => setActiveTab('schedule')}
            onOpenPackageStore={() => setActiveTab('store')}
          />
        ) : activeTab === 'schedule' ? (
          <MemberBookingTab
            data={dashboard}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onBookSession={handleBookSession}
            onCancelBySession={handleCancelBySession}
            busySessionId={busySessionId}
          />
        ) : (
          <MemberQrTab data={dashboard} accessCode={memberAccessCode} />
        )}
      </View>

      {/* Athletic Dark Mode 4 Sekmeli Alt Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.82}
        >
          <View
            style={[
              styles.tabIconPill,
              activeTab === 'dashboard' && styles.tabIconPillActive,
            ]}
          >
            <LayoutDashboard
              size={19}
              color={activeTab === 'dashboard' ? COLORS.primary : COLORS.textMuted}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'dashboard' && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            Paketim
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('schedule')}
          activeOpacity={0.82}
        >
          <View
            style={[
              styles.tabIconPill,
              activeTab === 'schedule' && styles.tabIconPillActive,
            ]}
          >
            <CalendarCheck2
              size={19}
              color={activeTab === 'schedule' ? COLORS.primary : COLORS.textMuted}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'schedule' && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            Dersler
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('qr')}
          activeOpacity={0.82}
        >
          <View
            style={[
              styles.tabIconPill,
              activeTab === 'qr' && styles.tabIconPillActive,
            ]}
          >
            <QrCode
              size={19}
              color={activeTab === 'qr' ? COLORS.primary : COLORS.textMuted}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'qr' && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            Giriş QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('store')}
          activeOpacity={0.82}
        >
          <View
            style={[
              styles.tabIconPill,
              activeTab === 'store' && styles.tabIconPillVoltActive,
            ]}
          >
            <CreditCard
              size={19}
              color={activeTab === 'store' ? COLORS.accentVolt : COLORS.textMuted}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'store' && styles.tabLabelVoltActive,
            ]}
            numberOfLines={1}
          >
            Paket Mağazası
          </Text>
        </TouchableOpacity>
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
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: COLORS.primary,
  },
  bannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: COLORS.danger,
  },
  bannerText: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingBottom: 11,
    paddingHorizontal: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabIconPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tabIconPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  tabIconPillVoltActive: {
    backgroundColor: 'rgba(163, 230, 53, 0.14)',
  },
  tabLabel: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  tabLabelVoltActive: {
    color: COLORS.accentVolt,
    fontWeight: '800',
  },
});
