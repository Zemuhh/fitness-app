import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Menu, QrCode } from 'lucide-react-native';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { COLORS, FONTS } from '@/theme/colors';
import { AppUser } from '@/types/fitness';
import { MemberDrawerRoute, TrainerDrawerRoute } from '@/types/navigation';

export interface CleanAppHeaderProps {
  user: AppUser;
  activePageTitle?: string;
  activeRoute?: MemberDrawerRoute | TrainerDrawerRoute;
  unreadNotificationCount?: number;
  showQrButton?: boolean;
  onOpenDrawer: () => void;
  onOpenNotifications?: () => void;
  onOpenQr?: () => void;
}

const CONCISE_MEMBER_ROUTE_TITLES: Record<MemberDrawerRoute, string> = {
  home: 'Ana Sayfa',
  schedule: 'Ders Programı',
  nutrition: 'AI Beslenme & Toparlanma',
  referral: 'Arkadaşını Getir (+1 Ders)',
  trainers: 'Eğitmenler',
  packages: 'Paketlerim',
  news: 'Duyurular',
  metrics: 'Gelişim',
  profile: 'Profil',
};

const CONCISE_TRAINER_ROUTE_TITLES: Record<TrainerDrawerRoute, string> = {
  schedule: 'Ders Programı',
  crm: 'Üyeler',
  create_session: 'Yeni Ders',
  instagram_ai: 'DM Asistanı',
  announcements_profile: 'Duyurular',
};

const LEGACY_TITLE_TO_CONCISE: Record<string, string> = {
  'Ana Sayfa & Stüdyo Özeti': 'Ana Sayfa',
  'Seans Takvimi & Rezervasyon': 'Ders Programı',
  '🥗 AI Beslenme & Toparlanma': 'AI Beslenme & Toparlanma',
  '🎁 Arkadaşını Getir (+1 Ders)': 'Arkadaşını Getir (+1 Ders)',
  'Eğitmen Kadromuz': 'Eğitmenler',
  'Paketlerim & Ders Haklarım': 'Paketlerim',
  'Paket Yenileme & Üyelik': 'Paketlerim',
  'Stüdyo Rehberi & Duyurular': 'Duyurular',
  'Postür & Vücut Gelişimim': 'Gelişim',
  'Profilim & Bildirimler': 'Profil',
  'Günlük Seanslarım & Yoklama': 'Ders Programı',
  'Üye Postür & Ölçüm Takibi': 'Üyeler',
  'Yeni Seans Vakti Aç': 'Yeni Ders',
  '@eryapilatesreformer DM Asistanı': 'DM Asistanı',
  'Stüdyo Duyuruları & Profilim': 'Duyurular',
};

export function CleanAppHeader({
  user,
  activePageTitle,
  activeRoute,
  unreadNotificationCount = 0,
  showQrButton,
  onOpenDrawer,
  onOpenNotifications,
  onOpenQr,
}: CleanAppHeaderProps) {
  const isTrainer = user.role === 'trainer';

  const resolvedTitle = React.useMemo(() => {
    if (activeRoute) {
      if (isTrainer && activeRoute in CONCISE_TRAINER_ROUTE_TITLES) {
        return CONCISE_TRAINER_ROUTE_TITLES[activeRoute as TrainerDrawerRoute];
      }
      if (!isTrainer && activeRoute in CONCISE_MEMBER_ROUTE_TITLES) {
        return CONCISE_MEMBER_ROUTE_TITLES[activeRoute as MemberDrawerRoute];
      }
    }
    if (activePageTitle && activePageTitle.trim().length > 0) {
      const trimmed = activePageTitle.trim();
      return LEGACY_TITLE_TO_CONCISE[trimmed] || trimmed;
    }
    return isTrainer ? 'Ders Programı' : 'Ana Sayfa';
  }, [activePageTitle, activeRoute, isTrainer]);

  const shouldShowQr = showQrButton ?? Boolean(onOpenQr || !isTrainer);

  return (
    <View style={styles.headerWrapper}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.leftTrigger}
          onPress={onOpenDrawer}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Menüyü aç"
        >
          <View style={styles.menuBtn}>
            <Menu size={19} color={COLORS.textPrimary} strokeWidth={2} />
          </View>

          <EryaBrandLogo size={26} />

          <Text style={styles.pageTitle} numberOfLines={1}>
            {resolvedTitle}
          </Text>
        </TouchableOpacity>

        <View style={styles.rightActions}>
          {onOpenNotifications && (
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={onOpenNotifications}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Bildirimler"
            >
              <Bell size={18} color={COLORS.textSecondary} strokeWidth={1.9} />
              {unreadNotificationCount > 0 && (
                <View style={styles.unreadDot} />
              )}
            </TouchableOpacity>
          )}

          {shouldShowQr && onOpenQr && (
            <TouchableOpacity
              style={[styles.iconActionBtn, styles.qrShortcutBtn]}
              onPress={onOpenQr}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="QR Giriş"
            >
              <QrCode size={18} color={COLORS.primary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 58,
    gap: 12,
  },
  leftTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrShortcutBtn: {
    backgroundColor: COLORS.primaryLight,
  },
  unreadDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.5,
    borderColor: COLORS.backgroundAlt,
  },
});
