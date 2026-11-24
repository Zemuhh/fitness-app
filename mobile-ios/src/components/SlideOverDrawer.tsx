import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  Calendar,
  CalendarPlus,
  CreditCard,
  Gift,
  Home,
  LayoutGrid,
  LogOut,
  LucideIcon,
  Megaphone,
  MessageCircle,
  QrCode,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { FONTS } from '@/theme/colors';
import { AppUser, MemberDashboardData } from '@/types/fitness';
import { MemberDrawerRoute, TrainerDrawerRoute } from '@/types/navigation';
import { MemberAvatar } from '@/screens/member/MemberAvatar';

export interface DrawerMenuItemConfig<T extends string = string> {
  key: T | 'qr';
  Icon: LucideIcon;
  label: string;
  isQrAction?: boolean;
}

export interface SlideOverDrawerProps {
  visible: boolean;
  user: AppUser;
  activeMemberRoute?: MemberDrawerRoute;
  activeTrainerRoute?: TrainerDrawerRoute;
  activeRoute?: MemberDrawerRoute | TrainerDrawerRoute;
  packageSummaryText?: string | null;
  menuItems?: DrawerMenuItemConfig<any>[];
  onSelectMemberRoute?: (route: MemberDrawerRoute) => void;
  onSelectTrainerRoute?: (route: TrainerDrawerRoute) => void;
  onSelectRoute?: (route: any) => void;
  onOpenQr?: () => void;
  onClose: () => void;
  onOpenGateway?: () => void;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
  onUserSwitched?: (newUser: AppUser) => void;
}

type ExtendedAuthContext = ReturnType<typeof useAuthDemo> & {
  isAuthenticated?: boolean;
  authUser?: {
    id: number | null;
    full_name: string;
    role: 'member' | 'trainer' | 'admin' | string;
    email?: string | null;
    username?: string | null;
  } | null;
  isAdmin?: boolean;
  activePanel?: 'admin' | 'trainer' | 'member';
  switchPanel?: (panel: 'admin' | 'trainer' | 'member', targetUser?: AppUser) => void;
  returnToAdminPanel?: () => void;
  logout?: () => Promise<void> | void;
};

// Lightweight bridge so tapping "QR Giriş" in the drawer opens MemberQrModal
// even when SlideOverDrawer is mounted at the top-level screen without onOpenQr.
let registeredMemberQrOpener: (() => void) | null = null;

export function registerMemberQrOpener(fn: (() => void) | null) {
  registeredMemberQrOpener = fn;
}

export const DEFAULT_MEMBER_DRAWER_ITEMS: DrawerMenuItemConfig<MemberDrawerRoute>[] = [
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

export const DEFAULT_TRAINER_DRAWER_ITEMS: DrawerMenuItemConfig<TrainerDrawerRoute>[] = [
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

// Soft eye-friendly dark slate palette
const DRAWER_THEME = {
  bg: '#0F172A',
  surfaceSoft: '#162033',
  divider: 'rgba(148, 163, 184, 0.10)',
  scrim: 'rgba(2, 6, 23, 0.56)',
  textActive: '#F1F5F9',
  textMuted: '#94A3B8',
  textSubtle: '#64748B',
  iconMuted: '#94A3B8',
  memberAccent: '#34D399',
  memberActiveBg: 'rgba(16, 185, 129, 0.11)',
  trainerAccent: '#818CF8',
  trainerActiveBg: 'rgba(99, 102, 241, 0.13)',
} as const;

function formatCalmCreditHint(summary?: string | null): string | null {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (!trimmed || trimmed.toLowerCase().includes('tanımlı değil')) return null;
  const slashMatch = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
  if (slashMatch) {
    return `${slashMatch[1]} seans`;
  }
  const numMatch = trimmed.match(/(\d+)\s*seans/i);
  if (numMatch) {
    return `${numMatch[1]} seans`;
  }
  return trimmed.length <= 18 ? trimmed : null;
}

export function SlideOverDrawer({
  visible,
  user,
  activeMemberRoute,
  activeTrainerRoute,
  activeRoute,
  packageSummaryText,
  menuItems,
  onSelectMemberRoute,
  onSelectTrainerRoute,
  onSelectRoute,
  onOpenQr,
  onClose,
  onOpenGateway,
  onOpenAdmin,
  onLogout,
}: SlideOverDrawerProps) {
  const authCtx = useAuthDemo() as ExtendedAuthContext;
  const { refreshSignal } = authCtx;

  const windowWidth = Dimensions.get('window').width;
  const drawerWidth = Math.min(Math.round(windowWidth * 0.82), 308);

  const [rendered, setRendered] = useState<boolean>(visible);
  const [fetchedCredits, setFetchedCredits] = useState<string | null>(null);

  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const userRoleStr = String(user?.role || '');
  const isAdminSession = Boolean(
    authCtx.isAdmin ||
      authCtx.authUser?.role === 'admin' ||
      userRoleStr === 'admin'
  );
  const isTrainer =
    userRoleStr === 'trainer' ||
    (userRoleStr === 'admin' && authCtx.activePanel === 'trainer');

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -drawerWidth,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setRendered(false);
        }
      });
    }
  }, [visible, rendered, drawerWidth, translateX, backdropOpacity]);

  useEffect(() => {
    if (!visible || isTrainer || isAdminSession || packageSummaryText || !user?.id) {
      return;
    }
    let active = true;
    apiRequest<MemberDashboardData>(`/member/${user.id}/dashboard`)
      .then((res) => {
        if (!active) return;
        if (res.active_package) {
          setFetchedCredits(`${res.active_package.remaining_credits} seans`);
        } else {
          setFetchedCredits(null);
        }
      })
      .catch(() => {
        if (active) setFetchedCredits(null);
      });
    return () => {
      active = false;
    };
  }, [visible, user?.id, isTrainer, isAdminSession, packageSummaryText, refreshSignal]);

  const calmSubLabel = useMemo(() => {
    if (isTrainer) return 'Eğitmen';
    const creditHint = formatCalmCreditHint(packageSummaryText) || fetchedCredits;
    return creditHint ? `Üye · ${creditHint}` : 'Üye';
  }, [isTrainer, packageSummaryText, fetchedCredits]);

  const currentActiveKey: string = isTrainer
    ? activeTrainerRoute || (activeRoute as string) || 'schedule'
    : activeMemberRoute || (activeRoute as string) || 'home';

  const resolvedMenuItems: DrawerMenuItemConfig<any>[] = useMemo(() => {
    const base =
      menuItems && menuItems.length > 0
        ? menuItems
        : isTrainer
        ? DEFAULT_TRAINER_DRAWER_ITEMS
        : DEFAULT_MEMBER_DRAWER_ITEMS;
    return __DEV__ ? base : base.filter((item) => item.key !== 'instagram_ai');
  }, [menuItems, isTrainer]);

  const handlePressItem = useCallback(
    (item: DrawerMenuItemConfig<any>) => {
      if (item.isQrAction || item.key === 'qr') {
        onClose();
        const triggerQr = onOpenQr || registeredMemberQrOpener;
        if (triggerQr) {
          setTimeout(() => triggerQr(), 160);
        }
        return;
      }

      if (isTrainer) {
        onSelectTrainerRoute?.(item.key as TrainerDrawerRoute);
      } else {
        onSelectMemberRoute?.(item.key as MemberDrawerRoute);
      }
      onSelectRoute?.(item.key);
      onClose();
    },
    [isTrainer, onClose, onOpenQr, onSelectMemberRoute, onSelectTrainerRoute, onSelectRoute]
  );

  const canOpenAdminPanel = Boolean(
    isAdminSession &&
      (authCtx.returnToAdminPanel || authCtx.switchPanel || onOpenAdmin)
  );

  const handleReturnToAdmin = useCallback(() => {
    onClose();
    setTimeout(() => {
      if (authCtx.returnToAdminPanel) {
        authCtx.returnToAdminPanel();
      } else if (authCtx.switchPanel) {
        authCtx.switchPanel('admin');
      } else {
        onOpenAdmin?.();
      }
    }, 150);
  }, [authCtx, onClose, onOpenAdmin]);

  const hasLogoutAction = Boolean(onLogout || authCtx.logout || onOpenGateway);

  const handleLogoutPress = useCallback(() => {
    onClose();
    setTimeout(() => {
      if (onLogout) {
        onLogout();
      } else if (authCtx.logout) {
        void authCtx.logout();
      } else {
        onOpenGateway?.();
      }
    }, 150);
  }, [authCtx, onClose, onLogout, onOpenGateway]);

  if (!rendered) {
    return null;
  }

  const accentColor = isTrainer
    ? DRAWER_THEME.trainerAccent
    : DRAWER_THEME.memberAccent;
  const activeRowBg = isTrainer
    ? DRAWER_THEME.trainerActiveBg
    : DRAWER_THEME.memberActiveBg;

  const hasPersonalIdentity =
    !isAdminSession && Boolean(user?.full_name && user.full_name.trim().length > 0);

  return (
    <Modal
      transparent
      visible={rendered}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlayRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width: drawerWidth,
              transform: [{ translateX }],
            },
          ]}
        >
          <SafeAreaView style={styles.drawerSafeArea} edges={['top', 'bottom', 'left']}>
            {/* Sakin, Minimal Marka & Rol Başlığı */}
            <View style={styles.headerSection}>
              <View style={styles.brandRow}>
                <EryaBrandLogo size={28} showWordmark compact lightText />
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Menüyü kapat"
                >
                  <X size={18} color={DRAWER_THEME.textMuted} strokeWidth={1.9} />
                </TouchableOpacity>
              </View>

              {hasPersonalIdentity ? (
                <View style={styles.compactUserRow}>
                  <MemberAvatar
                    uri={user.avatar_url}
                    name={user.full_name}
                    size={34}
                    borderRadius={11}
                    accentColor={accentColor}
                  />
                  <View style={styles.compactUserTextCol}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {user.full_name}
                    </Text>
                    <Text style={styles.userMeta} numberOfLines={1}>
                      {calmSubLabel}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.panelPreviewRow}>
                  <View
                    style={[
                      styles.previewDot,
                      { backgroundColor: accentColor },
                    ]}
                  />
                  <Text style={styles.panelPreviewText}>
                    {isTrainer ? 'Eğitmen Görünümü' : 'Üye Görünümü'}
                  </Text>
                </View>
              )}
            </View>

            {/* Göz Yormayan Sadeleştirilmiş Menü Listesi */}
            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {resolvedMenuItems.map((item) => {
                const isActive = !item.isQrAction && currentActiveKey === item.key;
                const IconComp = item.Icon;

                return (
                  <TouchableOpacity
                    key={String(item.key)}
                    style={[
                      styles.menuRow,
                      isActive && { backgroundColor: activeRowBg },
                    ]}
                    onPress={() => handlePressItem(item)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <View
                      style={[
                        styles.activeAccentBar,
                        isActive && { backgroundColor: accentColor },
                      ]}
                    />

                    <IconComp
                      size={19}
                      color={isActive ? accentColor : DRAWER_THEME.iconMuted}
                      strokeWidth={isActive ? 2.1 : 1.8}
                    />

                    <Text
                      style={[
                        styles.menuLabel,
                        isActive && styles.menuLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Sakin, Tek Satırlık Alt Bölüm */}
            {(canOpenAdminPanel || hasLogoutAction) && (
              <View style={styles.footerSection}>
                {canOpenAdminPanel && (
                  <TouchableOpacity
                    style={styles.footerRow}
                    onPress={handleReturnToAdmin}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                  >
                    <LayoutGrid
                      size={18}
                      color={DRAWER_THEME.trainerAccent}
                      strokeWidth={1.85}
                    />
                    <Text style={styles.footerAdminText}>Yönetim Paneli</Text>
                  </TouchableOpacity>
                )}

                {hasLogoutAction && (
                  <TouchableOpacity
                    style={styles.footerRow}
                    onPress={handleLogoutPress}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                  >
                    <LogOut
                      size={18}
                      color={DRAWER_THEME.textMuted}
                      strokeWidth={1.85}
                    />
                    <Text style={styles.footerLogoutText}>Çıkış Yap</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: DRAWER_THEME.scrim,
  },
  drawerPanel: {
    height: '100%',
    backgroundColor: DRAWER_THEME.bg,
    borderRightWidth: 1,
    borderRightColor: DRAWER_THEME.divider,
    shadowColor: '#020617',
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 14,
  },
  drawerSafeArea: {
    flex: 1,
    backgroundColor: DRAWER_THEME.bg,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: DRAWER_THEME.divider,
    gap: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: DRAWER_THEME.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  compactUserTextCol: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontFamily: FONTS.sans,
    color: DRAWER_THEME.textActive,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  userMeta: {
    fontFamily: FONTS.sans,
    color: DRAWER_THEME.textSubtle,
    fontSize: 12,
    fontWeight: '500',
  },
  panelPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  panelPreviewText: {
    fontFamily: FONTS.sans,
    color: DRAWER_THEME.textMuted,
    fontSize: 12.5,
    fontWeight: '500',
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 4,
  },
  menuRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 50,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  activeAccentBar: {
    position: 'absolute',
    left: 4,
    width: 3,
    height: 20,
    borderRadius: 99,
    backgroundColor: 'transparent',
  },
  menuLabel: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: DRAWER_THEME.textMuted,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  menuLabelActive: {
    color: DRAWER_THEME.textActive,
    fontWeight: '600',
  },
  footerSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: DRAWER_THEME.divider,
    gap: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  footerAdminText: {
    fontFamily: FONTS.sans,
    color: '#CBD5E1',
    fontSize: 14.5,
    fontWeight: '500',
  },
  footerLogoutText: {
    fontFamily: FONTS.sans,
    color: DRAWER_THEME.textMuted,
    fontSize: 14.5,
    fontWeight: '500',
  },
});
