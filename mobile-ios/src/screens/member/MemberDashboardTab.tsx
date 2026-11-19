import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react-native';
import { ActivityRing } from '@/components/ActivityRing';
import { COLORS } from '@/theme/colors';
import { MemberBookingItem, MemberDashboardData } from '@/types/fitness';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';

interface Props {
  data: MemberDashboardData;
  refreshing: boolean;
  onRefresh: () => void;
  onCancelBooking: (booking: MemberBookingItem) => Promise<void>;
  busyBookingId: number | null;
  onGoToSchedule: () => void;
  onOpenPackageStore?: () => void;
}

export function MemberDashboardTab({
  data,
  refreshing,
  onRefresh,
  onCancelBooking,
  busyBookingId,
  onGoToSchedule,
  onOpenPackageStore,
}: Props) {
  const pkg = data.active_package;
  const remaining = pkg?.remaining_credits ?? 0;
  const total = pkg?.total_credits ?? 0;
  const isLow = remaining <= 2;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleAnimatedCancel = async (booking: MemberBookingItem) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await onCancelBooking(booking);
  };

  const upcomingBookings = data.my_bookings;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {/* Hero Kredi & Paket Bento Kartı */}
        <View style={styles.heroBentoCard}>
          <View style={styles.heroMainRow}>
            {/* Sol Bilgi Sütunu */}
            <View style={styles.heroLeftCol}>
              <View
                style={[
                  styles.membershipBadge,
                  !pkg?.is_active && styles.membershipBadgeInactive,
                ]}
              >
                <ShieldCheck
                  size={13}
                  color={pkg?.is_active ? COLORS.primary : COLORS.warning}
                />
                <Text
                  style={[
                    styles.membershipBadgeText,
                    !pkg?.is_active && { color: COLORS.warning },
                  ]}
                >
                  {pkg?.is_active ? 'Aktif Üyelik' : 'Paket Bekleniyor'}
                </Text>
              </View>

              <Text style={styles.packageTitle} numberOfLines={2}>
                {pkg ? pkg.package_name : 'Tanımlı Paket Bulunamadı'}
              </Text>

              <View style={styles.expiryRow}>
                <Calendar size={13} color={COLORS.textSecondary} />
                <Text style={styles.expiryText}>
                  {pkg
                    ? `Bitiş: ${formatTurkishDateLabel(pkg.expiry_date).full}`
                    : 'Yeni bir paket seçerek başlayın'}
                </Text>
              </View>

              <View style={styles.memberMetaChip}>
                <Dumbbell size={13} color={COLORS.accentVolt} />
                <Text style={styles.memberMetaName} numberOfLines={1}>
                  {data.member.full_name}
                  {data.member.instagram_handle ? ` • ${data.member.instagram_handle}` : ''}
                </Text>
              </View>

              {isLow && (
                <View style={styles.lowWarningBadge}>
                  <AlertTriangle size={13} color={COLORS.warning} />
                  <Text style={styles.lowWarningText}>Paketiniz Azalıyor</Text>
                </View>
              )}
            </View>

            {/* Sağ Parlayan Neon Activity Progress Ring */}
            <View style={styles.heroRightCol}>
              <ActivityRing remaining={remaining} total={total} size={132} strokeWidth={12} />
            </View>
          </View>

          {/* Opsiyonel Paket Satın Al / Yenile Aksiyon Butonu */}
          {onOpenPackageStore && (
            <TouchableOpacity
              style={[
                styles.storeActionButton,
                isLow && styles.storeActionButtonUrgent,
              ]}
              onPress={onOpenPackageStore}
              activeOpacity={0.86}
            >
              <Sparkles
                size={16}
                color={isLow ? '#090D16' : COLORS.accentVolt}
              />
              <Text
                style={[
                  styles.storeActionButtonText,
                  isLow && { color: '#090D16' },
                ]}
              >
                Paket Satın Al / Yenile
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Hızlı Özet Metrik Şeridi */}
        <View style={styles.quickMetricsRow}>
          <View style={styles.metricMiniBento}>
            <Flame size={16} color={COLORS.accentVolt} />
            <View>
              <Text style={styles.metricNumeric}>
                {remaining}/{total}
              </Text>
              <Text style={styles.metricLabel}>Kalan Kredi</Text>
            </View>
          </View>

          <View style={styles.metricMiniBento}>
            <Calendar size={16} color={COLORS.primary} />
            <View>
              <Text style={styles.metricNumeric}>{upcomingBookings.length}</Text>
              <Text style={styles.metricLabel}>Aktif Randevu</Text>
            </View>
          </View>
        </View>

        {/* Yaklaşan Randevularım Başlığı */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Yaklaşan Randevularım</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{upcomingBookings.length}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={onGoToSchedule} activeOpacity={0.8}>
            <Text style={styles.scheduleLinkText}>+ Yeni Ders Seç</Text>
          </TouchableOpacity>
        </View>

        {/* Randevu Kartları */}
        {upcomingBookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Dumbbell size={26} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Henüz aktif randevunuz yok</Text>
            <Text style={styles.emptySubtitle}>
              Antrenman ritminizi korumak için ders programından hemen yerinizi ayırtın.
            </Text>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={onGoToSchedule}
              activeOpacity={0.85}
            >
              <Calendar size={15} color="#090D16" />
              <Text style={styles.ctaButtonText}>Ders Programına Göz At</Text>
            </TouchableOpacity>
          </View>
        ) : (
          upcomingBookings.map((item) => {
            const dateInfo = formatTurkishDateLabel(item.date);
            const isBusy = busyBookingId === item.booking_id;
            const canCancel = item.status === 'booked';

            return (
              <View key={item.booking_id} style={styles.bookingCard}>
                <View style={styles.bookingHeaderRow}>
                  <View style={styles.timeCluster}>
                    <Clock size={14} color={COLORS.primary} />
                    <Text style={styles.athleticTimeText}>
                      {item.start_time} - {item.end_time}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'attended'
                        ? styles.statusAttended
                        : item.status === 'no_show'
                        ? styles.statusNoShow
                        : styles.statusBooked,
                    ]}
                  >
                    {item.status === 'attended' ? (
                      <CheckCircle2 size={13} color={COLORS.primary} />
                    ) : null}
                    <Text
                      style={[
                        styles.statusBadgeText,
                        item.status === 'attended'
                          ? { color: COLORS.primary }
                          : item.status === 'no_show'
                          ? { color: COLORS.danger }
                          : { color: COLORS.accentVolt },
                      ]}
                    >
                      {item.status === 'attended'
                        ? 'Tamamlandı'
                        : item.status === 'no_show'
                        ? 'Gelmedi'
                        : 'Onaylı Kayıt'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.bookingTitle}>{item.title}</Text>

                <View style={styles.bookingMetaStrip}>
                  <View style={styles.metaItem}>
                    <Calendar size={13} color={COLORS.textSecondary} />
                    <Text style={styles.metaText}>{dateInfo.full}</Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Users size={13} color={COLORS.trainerAccent} />
                    <Text style={styles.metaText}>{item.trainer_name}</Text>
                    <Text style={styles.capacityInline}>
                      • {item.current_enrolled}/{item.capacity}
                    </Text>
                  </View>
                </View>

                {canCancel && (
                  <TouchableOpacity
                    style={[styles.cancelButton, isBusy && { opacity: 0.6 }]}
                    disabled={isBusy}
                    onPress={() => handleAnimatedCancel(item)}
                    activeOpacity={0.82}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={COLORS.danger} />
                    ) : (
                      <>
                        <XCircle size={15} color={COLORS.danger} />
                        <Text style={styles.cancelButtonText}>
                          Randevuyu İptal Et (+1 Kredi İade)
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  heroBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 14,
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroLeftCol: {
    flex: 1,
    gap: 8,
  },
  heroRightCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.30)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  membershipBadgeInactive: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  membershipBadgeText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  packageTitle: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expiryText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  memberMetaChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  memberMetaName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 170,
  },
  lowWarningBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  lowWarningText: {
    color: COLORS.warning,
    fontSize: 11.5,
    fontWeight: '800',
  },
  storeActionButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(163, 230, 53, 0.40)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  storeActionButtonUrgent: {
    backgroundColor: COLORS.accentVolt,
    borderColor: COLORS.accentVolt,
  },
  storeActionButtonText: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  quickMetricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  metricMiniBento: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricNumeric: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: {
    color: COLORS.accentVolt,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scheduleLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    paddingVertical: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  ctaButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  ctaButtonText: {
    color: '#090D16',
    fontSize: 13.5,
    fontWeight: '800',
  },
  bookingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  bookingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  athleticTimeText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBooked: {
    backgroundColor: 'rgba(163, 230, 53, 0.12)',
    borderColor: 'rgba(163, 230, 53, 0.28)',
  },
  statusAttended: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.30)',
  },
  statusNoShow: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.30)',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  bookingTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  bookingMetaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  capacityInline: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cancelButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.55)',
    borderRadius: 12,
    paddingVertical: 11,
  },
  cancelButtonText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '800',
  },
});
