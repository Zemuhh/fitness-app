import React, { useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Layers,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import {
  MemberDashboardData,
  MemberPackage,
} from '@/types/fitness';
import {
  formatPackageMonthTr,
  formatTurkishDateLabel,
  getCurrentYearMonth,
  getDaysRemaining,
} from '@/utils/dateHelpers';

export interface MemberPackageRenewScreenProps {
  data: MemberDashboardData;
  refreshing?: boolean;
  onRefresh?: () => void;
  onShowBanner?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

function resolvePackageMonth(pkg: MemberPackage): string | null {
  if (pkg.package_month && pkg.package_month.trim().length > 0) {
    return pkg.package_month.trim();
  }
  if (pkg.created_at && /^\d{4}-\d{2}/.test(pkg.created_at)) {
    return pkg.created_at.slice(0, 7);
  }
  if (pkg.expiry_date && /^\d{4}-\d{2}/.test(pkg.expiry_date)) {
    return pkg.expiry_date.slice(0, 7);
  }
  return null;
}

export function MemberPackageRenewScreen({
  data,
  refreshing = false,
  onRefresh,
}: MemberPackageRenewScreenProps) {
  const currentMonth = useMemo(() => getCurrentYearMonth(), []);
  const currentMonthLabel = useMemo(
    () => formatPackageMonthTr(currentMonth),
    [currentMonth]
  );

  const allPackages = useMemo<MemberPackage[]>(() => {
    const raw =
      Array.isArray(data.all_packages) && data.all_packages.length > 0
        ? data.all_packages
        : data.active_package
        ? [data.active_package]
        : [];

    return [...raw].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const monthA = resolvePackageMonth(a) || '';
      const monthB = resolvePackageMonth(b) || '';
      if (monthA !== monthB) return monthB.localeCompare(monthA);
      return b.id - a.id;
    });
  }, [data.active_package, data.all_packages]);

  const activePkg = useMemo<MemberPackage | null>(() => {
    return data.active_package ?? allPackages.find((p) => p.is_active) ?? null;
  }, [allPackages, data.active_package]);

  const thisMonthPackages = useMemo<MemberPackage[]>(() => {
    return allPackages.filter((pkg) => {
      const m = resolvePackageMonth(pkg);
      return m === currentMonth;
    });
  }, [allPackages, currentMonth]);

  const thisMonthTotalCredits = useMemo(
    () => thisMonthPackages.reduce((sum, p) => sum + (p.total_credits || 0), 0),
    [thisMonthPackages]
  );
  const thisMonthRemainingCredits = useMemo(
    () => thisMonthPackages.reduce((sum, p) => sum + (p.remaining_credits || 0), 0),
    [thisMonthPackages]
  );

  const remaining = activePkg?.remaining_credits ?? 0;
  const total = activePkg?.total_credits ?? 0;
  const used = Math.max(0, total - remaining);
  const progressPct =
    total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const daysLeft = activePkg ? getDaysRemaining(activePkg.expiry_date) : 0;
  const activeMonthStr = activePkg ? resolvePackageMonth(activePkg) : null;

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
      {/* 1. ÜST ÖZET — AKTİF PAKET KARTI */}
      {activePkg ? (
        <View style={styles.activePackageCard}>
          <View style={styles.topRow}>
            <View style={styles.activeStatusBadge}>
              <ShieldCheck size={13} color={COLORS.primary} />
              <Text style={styles.activeStatusText}>AKTİF DERS PAKETİM</Text>
            </View>

            {activeMonthStr ? (
              <View style={styles.monthBadge}>
                <Calendar size={12} color={COLORS.secondary} />
                <Text style={styles.monthBadgeText}>
                  {formatPackageMonthTr(activeMonthStr)}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.activePkgTitle}>{activePkg.package_name}</Text>

          {/* Metrik Kutuları: Kalan / Kullanılan / Toplam */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricBox, styles.metricBoxHighlight]}>
              <Text style={[styles.metricValue, { color: COLORS.primary }]}>
                {remaining}
              </Text>
              <Text style={styles.metricLabel}>Kalan Ders</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: COLORS.secondary }]}>
                {used}
              </Text>
              <Text style={styles.metricLabel}>Kullanılan</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{total}</Text>
              <Text style={styles.metricLabel}>Toplam Ders</Text>
            </View>
          </View>

          {/* İlerleme Çubuğu */}
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>Ders Hakkı Kullanım Durumu</Text>
            <Text
              style={[
                styles.progressPercentText,
                remaining <= 2 && { color: COLORS.warningText },
              ]}
            >
              {remaining} / {total} Ders
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPct}%`,
                  backgroundColor:
                    remaining <= 2 ? COLORS.warning : COLORS.primary,
                },
              ]}
            />
          </View>

          {/* Bitiş Tarihi & Kalan Gün */}
          <View style={styles.expiryStrip}>
            <View style={styles.expiryLeft}>
              <Calendar size={14} color={COLORS.primary} />
              <Text style={styles.expiryLabel}>
                Son Geçerlilik:{' '}
                <Text style={styles.expiryDateStrong}>
                  {formatTurkishDateLabel(activePkg.expiry_date).full}
                </Text>
              </Text>
            </View>
            <View
              style={[
                styles.daysPill,
                daysLeft <= 7 && styles.daysPillWarn,
              ]}
            >
              <Clock
                size={11}
                color={daysLeft <= 7 ? COLORS.warningText : COLORS.primary}
              />
              <Text
                style={[
                  styles.daysPillText,
                  daysLeft <= 7 && { color: COLORS.warningText },
                ]}
              >
                {daysLeft > 0
                  ? `${daysLeft} Gün Kaldı`
                  : daysLeft === 0
                  ? 'Bugün Son Gün'
                  : 'Süresi Doldu'}
              </Text>
            </View>
          </View>

          {/* Admin Paket Notu */}
          {activePkg.package_notes && activePkg.package_notes.trim().length > 0 ? (
            <View style={styles.noteBox}>
              <FileText size={14} color={COLORS.walnut} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noteLabel}>STÜDYO PAKET NOTU</Text>
                <Text style={styles.noteText}>{activePkg.package_notes.trim()}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyActiveCard}>
          <View style={styles.emptyIconCircle}>
            <Package size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyActiveTitle}>Aktif Paketiniz Bulunmuyor</Text>
          <Text style={styles.emptyActiveDesc}>
            Henüz tanımlı aktif ders paketiniz bulunmuyor. Paket tanımlaması için stüdyo
            yönetimiyle iletişime geçebilirsiniz.
          </Text>
        </View>
      )}

      {/* 2. BU AYKİ PAKET ÖZETİ */}
      <View style={styles.monthSummaryCard}>
        <View style={styles.monthSummaryHeader}>
          <View style={styles.monthSummaryLeft}>
            <View style={styles.monthSummaryIconBox}>
              <Sparkles size={16} color={COLORS.secondary} />
            </View>
            <View>
              <Text style={styles.monthSummaryTitle}>Bu Ayki Paket Özeti</Text>
              <Text style={styles.monthSummarySub}>{currentMonthLabel} Dönemi</Text>
            </View>
          </View>
          <View style={styles.monthTotalPill}>
            <Text style={styles.monthTotalPillText}>
              {thisMonthTotalCredits} Ders Hakkı
            </Text>
          </View>
        </View>

        {thisMonthPackages.length > 0 ? (
          <View style={styles.monthSummaryBody}>
            {thisMonthPackages.map((pkg) => (
              <View key={`month-${pkg.id}`} style={styles.monthPkgRow}>
                <CheckCircle2
                  size={15}
                  color={pkg.is_active ? COLORS.primary : COLORS.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.monthPkgName} numberOfLines={1}>
                    {pkg.package_name}
                  </Text>
                  <Text style={styles.monthPkgMeta}>
                    {pkg.remaining_credits} kalan / {pkg.total_credits} toplam ders
                  </Text>
                </View>
                <View
                  style={[
                    styles.miniStatusBadge,
                    pkg.is_active
                      ? styles.miniStatusActive
                      : styles.miniStatusCompleted,
                  ]}
                >
                  <Text
                    style={[
                      styles.miniStatusText,
                      {
                        color: pkg.is_active
                          ? COLORS.success
                          : COLORS.textSecondary,
                      },
                    ]}
                  >
                    {pkg.is_active ? 'Aktif' : 'Tamamlandı'}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={styles.monthSummaryFoot}>
              {currentMonthLabel} döneminde toplam {thisMonthTotalCredits} ders hakkı
              tanımlandı, güncel kalan: {thisMonthRemainingCredits} ders.
            </Text>
          </View>
        ) : (
          <Text style={styles.monthEmptyText}>
            {currentMonthLabel} ayı için henüz yeni tanımlanmış bir ders paketi görünmüyor.
          </Text>
        )}
      </View>

      {/* 3. TÜM PAKETLERİM LİSTESİ */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Layers size={17} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Tüm Paketlerim ({allPackages.length})</Text>
        </View>
        <Text style={styles.sectionHint}>En güncel üstte</Text>
      </View>

      {allPackages.length === 0 ? (
        <View style={styles.emptyListCard}>
          <Package size={24} color={COLORS.textMuted} />
          <Text style={styles.emptyListText}>
            Henüz kayıtlı ders paketi geçmişiniz bulunmuyor.
          </Text>
        </View>
      ) : (
        allPackages.map((pkg) => {
          const pkgMonth = resolvePackageMonth(pkg);
          const pkgUsed = Math.max(0, pkg.total_credits - pkg.remaining_credits);
          const pkgPct =
            pkg.total_credits > 0
              ? Math.max(0, Math.min(100, (pkg.remaining_credits / pkg.total_credits) * 100))
              : 0;

          return (
            <View
              key={pkg.id}
              style={[
                styles.pkgListCard,
                pkg.is_active && styles.pkgListCardActive,
              ]}
            >
              <View style={styles.pkgListTopRow}>
                <View style={styles.pkgBadgesWrap}>
                  <View
                    style={[
                      styles.statusBadge,
                      pkg.is_active
                        ? styles.statusBadgeActive
                        : styles.statusBadgeDone,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color: pkg.is_active
                            ? COLORS.success
                            : COLORS.textSecondary,
                        },
                      ]}
                    >
                      {pkg.is_active ? 'Aktif' : 'Tamamlandı'}
                    </Text>
                  </View>

                  {pkgMonth ? (
                    <View style={styles.periodTag}>
                      <Calendar size={11} color={COLORS.secondary} />
                      <Text style={styles.periodTagText}>
                        {formatPackageMonthTr(pkgMonth)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.pkgListCredits}>
                  {pkg.remaining_credits} / {pkg.total_credits} Ders
                </Text>
              </View>

              <Text style={styles.pkgListTitle}>{pkg.package_name}</Text>

              <View style={styles.pkgListMetaRow}>
                <Text style={styles.pkgListMetaText}>
                  Kullanılan: {pkgUsed} Ders
                </Text>
                <Text style={styles.pkgListMetaDot}>•</Text>
                <Text style={styles.pkgListMetaText}>
                  Bitiş: {formatTurkishDateLabel(pkg.expiry_date).full}
                </Text>
              </View>

              <View style={styles.miniProgressTrack}>
                <View
                  style={[
                    styles.miniProgressFill,
                    {
                      width: `${pkgPct}%`,
                      backgroundColor: pkg.is_active
                        ? COLORS.primary
                        : COLORS.textMuted,
                    },
                  ]}
                />
              </View>

              {pkg.package_notes && pkg.package_notes.trim().length > 0 ? (
                <View style={styles.listNoteRow}>
                  <FileText size={12} color={COLORS.walnut} />
                  <Text style={styles.listNoteText}>{pkg.package_notes.trim()}</Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {/* 4. ALT BİLGİLENDİRME KARTI */}
      <View style={styles.studioInfoCard}>
        <View style={styles.studioInfoIconBox}>
          <Info size={16} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.studioInfoTitle}>Stüdyo Paket Yönetimi</Text>
          <Text style={styles.studioInfoText}>
            Paket tanımlamaları, aylık yenilemeler ve ders hakkı güncellemeleri stüdyo
            yöneticiniz tarafından yapılmaktadır.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 18,
    paddingBottom: 44,
    gap: 14,
  },
  activePackageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 14,
    ...CARD_SHADOW,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activeStatusText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  monthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: COLORS.secondaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  monthBadgeText: {
    fontFamily: FONTS.sans,
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  activePkgTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 3,
  },
  metricBoxHighlight: {
    backgroundColor: COLORS.primarySurface,
    borderColor: COLORS.primaryBorder,
  },
  metricValue: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  progressLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  progressPercentText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
    marginTop: -6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  expiryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  expiryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  expiryLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  expiryDateStrong: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  daysPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  daysPillWarn: {
    backgroundColor: COLORS.warningBg,
  },
  daysPillText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.surfaceHalo,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  noteLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.walnut,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  noteText: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12.8,
    lineHeight: 18,
    fontWeight: '500',
  },
  emptyActiveCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  emptyIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActiveTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyActiveDesc: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  monthSummaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...CARD_SHADOW,
  },
  monthSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  monthSummaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: COLORS.secondaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthSummaryTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  monthSummarySub: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  monthTotalPill: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  monthTotalPillText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  monthSummaryBody: {
    gap: 8,
  },
  monthPkgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthPkgName: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  monthPkgMeta: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  miniStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  miniStatusActive: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successBorder,
  },
  miniStatusCompleted: {
    backgroundColor: COLORS.backgroundAlt,
    borderColor: COLORS.border,
  },
  miniStatusText: {
    fontFamily: FONTS.sans,
    fontSize: 10.5,
    fontWeight: '800',
  },
  monthSummaryFoot: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 2,
  },
  monthEmptyText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionHint: {
    fontFamily: FONTS.sans,
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  emptyListCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  emptyListText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  pkgListCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 9,
    ...CARD_SHADOW,
  },
  pkgListCardActive: {
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.surface,
  },
  pkgListTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pkgBadgesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeActive: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successBorder,
  },
  statusBadgeDone: {
    backgroundColor: COLORS.surfaceElevated,
    borderColor: COLORS.border,
  },
  statusBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '800',
  },
  periodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: COLORS.secondaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  periodTagText: {
    fontFamily: FONTS.sans,
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  pkgListCredits: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  pkgListTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  pkgListMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pkgListMetaText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  pkgListMetaDot: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  miniProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  listNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 2,
  },
  listNoteText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  studioInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.primarySurface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    marginTop: 4,
  },
  studioInfoIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studioInfoTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  studioInfoText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18.5,
    fontWeight: '500',
  },
});
