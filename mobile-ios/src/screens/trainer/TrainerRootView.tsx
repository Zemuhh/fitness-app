import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ClipboardCheck, MessageSquareText } from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { COLORS } from '@/theme/colors';
import { AppUser, TrainerScheduleData } from '@/types/fitness';
import { TrainerScheduleTab } from '@/screens/trainer/TrainerScheduleTab';
import { InstagramDmSimulatorTab } from '@/screens/trainer/InstagramDmSimulatorTab';

type TrainerTabKey = 'schedule' | 'instagram';

interface Props {
  trainer: AppUser;
}

export function TrainerRootView({ trainer }: Props) {
  const { refreshSignal, triggerGlobalRefresh, reloadUsers } = useAuthDemo();
  const [activeTab, setActiveTab] = useState<TrainerTabKey>('schedule');
  const [schedule, setSchedule] = useState<TrainerScheduleData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showBanner = useCallback((type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  }, []);

  const fetchSchedule = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await apiRequest<TrainerScheduleData>(`/trainer/${trainer.id}/schedule`);
        setSchedule(res);
      } catch (err: any) {
        showBanner('error', err?.message || 'Eğitmen takvimi yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [trainer.id, showBanner]
  );

  useEffect(() => {
    fetchSchedule(false);
  }, [fetchSchedule, refreshSignal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSchedule(true);
  }, [fetchSchedule]);

  const handleMarkAttendance = useCallback(
    async (bookingId: number, status: 'attended' | 'no_show') => {
      setBusyBookingId(bookingId);
      try {
        await apiRequest('/trainer/attendance', {
          method: 'POST',
          body: JSON.stringify({ booking_id: bookingId, status }),
        });
        showBanner(
          'success',
          status === 'attended'
            ? 'Yoklama "✅ Geldi" olarak kaydedildi.'
            : 'Yoklama "❌ Gelmedi" olarak kaydedildi.'
        );
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
        showBanner('success', 'Müşteri sakatlık / antrenman notu güncellendi.');
        await fetchSchedule(true);
        await reloadUsers();
      } catch (err: any) {
        showBanner('error', err?.message || 'Not kaydedilemedi.');
      } finally {
        setSavingNote(false);
      }
    },
    [fetchSchedule, reloadUsers, showBanner]
  );

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
        {activeTab === 'instagram' ? (
          <InstagramDmSimulatorTab onBookingMutated={() => fetchSchedule(true)} />
        ) : loading || !schedule ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={COLORS.trainerAccent} />
            <Text style={styles.loaderText}>Eğitmen kontrol paneli yükleniyor...</Text>
          </View>
        ) : (
          <TrainerScheduleTab
            data={schedule}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onMarkAttendance={handleMarkAttendance}
            onSaveMemberNote={handleSaveMemberNote}
            busyBookingId={busyBookingId}
            savingNote={savingNote}
          />
        )}
      </View>

      {/* Athletic Dark Mode Eğitmen Alt Sekme Barı */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('schedule')}
          activeOpacity={0.82}
        >
          <View
            style={[
              styles.tabIconPill,
              activeTab === 'schedule' && styles.tabIconPillScheduleActive,
            ]}
          >
            <ClipboardCheck
              size={19}
              color={
                activeTab === 'schedule' ? COLORS.trainerAccent : COLORS.textMuted
              }
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'schedule' && styles.tabLabelScheduleActive,
            ]}
          >
            Takvim & Hızlı Yoklama
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('instagram')}
          activeOpacity={0.82}
        >
          <View
            style={[
              styles.tabIconPill,
              activeTab === 'instagram' && styles.tabIconPillIgActive,
            ]}
          >
            <MessageSquareText
              size={19}
              color={activeTab === 'instagram' ? COLORS.accentVolt : COLORS.textMuted}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'instagram' && styles.tabLabelIgActive,
            ]}
          >
            Instagram DM Bot Simülatörü
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
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
    borderColor: COLORS.trainerAccent,
  },
  bannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
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
    paddingHorizontal: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabIconPill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tabIconPillScheduleActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
  },
  tabIconPillIgActive: {
    backgroundColor: 'rgba(163, 230, 53, 0.14)',
  },
  tabLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  tabLabelScheduleActive: {
    color: '#A5B4FC',
    fontWeight: '800',
  },
  tabLabelIgActive: {
    color: COLORS.accentVolt,
    fontWeight: '800',
  },
});
