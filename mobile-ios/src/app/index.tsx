import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Award,
  Layers,
  LogOut,
  Megaphone,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react-native';
import { API_BASE_URL } from '@/config/api';
import { CleanAppHeader } from '@/components/CleanAppHeader';
import { CompanyPolicyModal } from '@/components/CompanyPolicyModal';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { SlideOverDrawer } from '@/components/SlideOverDrawer';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { AdminControlScreen } from '@/screens/admin/AdminControlScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { GatewayTabKey, PortalGatewayModal } from '@/screens/auth/PortalGatewayModal';
import { MemberRootView } from '@/screens/member/MemberRootView';
import { TrainerRootView } from '@/screens/trainer/TrainerRootView';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import { MemberDrawerRoute, TrainerDrawerRoute } from '@/types/navigation';

export default function AppEntryScreen() {
  const {
    selectedUser,
    selectUser,
    loadingUsers,
    connectionError,
    reloadUsers,
    triggerGlobalRefresh,
    isAuthenticated,
    restoringSession,
    authToken,
    authUser,
    isAdmin,
    activePanel,
    panelConfig,
    switchPanel,
    returnToAdminPanel,
    markPolicyAccepted,
    logout,
  } = useAuthDemo();

  const [memberRoute, setMemberRoute] = useState<MemberDrawerRoute>('home');
  const [trainerRoute, setTrainerRoute] = useState<TrainerDrawerRoute>('schedule');
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);
  const [notifModalVisible, setNotifModalVisible] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [packageSummary, setPackageSummary] = useState<string | null>(null);

  const [gatewayVisible, setGatewayVisible] = useState<boolean>(false);
  const [gatewayInitialTab, setGatewayInitialTab] = useState<GatewayTabKey>('lookup');
  const [gatewayLookupCode, setGatewayLookupCode] = useState<string | undefined>(undefined);

  // Aktif kullanıcı veya panel değiştiğinde modalları ve alt rotaları sıfırla
  useEffect(() => {
    setMemberRoute('home');
    setTrainerRoute('schedule');
    setDrawerVisible(false);
    setQrModalVisible(false);
    setNotifModalVisible(false);
    setPackageSummary(null);
    if (selectedUser?.role === 'trainer') {
      setUnreadCount(0);
    }
  }, [selectedUser?.id, selectedUser?.role, activePanel, isAuthenticated]);

  const handleOpenGateway = useCallback((codeOverride?: string) => {
    setGatewayLookupCode(codeOverride);
    setGatewayInitialTab('lookup');
    setGatewayVisible(true);
  }, []);

  const handleOpenAdminButton = useCallback(() => {
    if (isAdmin) {
      returnToAdminPanel();
    }
  }, [isAdmin, returnToAdminPanel]);

  const handleHeaderNotificationsPress = useCallback(() => {
    if (!selectedUser) return;
    if (selectedUser.role === 'trainer') {
      setTrainerRoute('announcements_profile');
    } else {
      setNotifModalVisible(true);
    }
  }, [selectedUser]);

  const handleHeaderQrPress = useCallback(() => {
    if (!selectedUser) return;
    if (selectedUser.role === 'trainer') {
      handleOpenGateway(`FIT-${1000 + selectedUser.id}`);
    } else {
      setQrModalVisible(true);
    }
  }, [selectedUser, handleOpenGateway]);

  // 1. OTURUM DOĞRULAMA EKRANI (Kaydedilmiş token kontrol edilirken)
  if (restoringSession) {
    return (
      <SafeAreaView style={styles.darkBootSafeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.darkBootCenter}>
          <EryaBrandLogo size={46} showWordmark lightText />
          <ActivityIndicator size="large" color="#C9A452" style={{ marginTop: 22 }} />
          <Text style={styles.darkBootText}>Oturum durumu kontrol ediliyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2. ZORUNLU GİRİŞ KAPISI: Kimlik doğrulanmadıysa doğrudan tam ekran Giriş Ekranı!
  if (!isAuthenticated) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen />
      </>
    );
  }

  // 2.5. TEK SEFERLİK ŞİRKET POLİTİKA & KVKK SÖZLEŞME ONAY KAPISI (Yalnızca üye/eğitmen ilk girişi)
  if (isAuthenticated && !isAdmin && authUser && authUser.policy_accepted === false) {
    return (
      <>
        <StatusBar style="light" />
        <CompanyPolicyModal
          authToken={authToken}
          userId={authUser.user_id ?? authUser.id ?? null}
          userFullName={authUser.full_name}
          userRole={authUser.role}
          onAccepted={(acceptedAt) => {
            markPolicyAccepted(acceptedAt);
          }}
          onLogout={logout}
        />
      </>
    );
  }

  // 3. KİŞİSEL VERİ TAŞIMAYAN ADMIN SİSTEM YÖNETİM MERKEZİ
  if (isAdmin && activePanel === 'admin') {
    return (
      <SafeAreaView style={styles.adminSafeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="light" />
        <AdminControlScreen
          onSelectUser={(u) => {
            selectUser(u);
          }}
          onDataChanged={() => {
            reloadUsers();
            triggerGlobalRefresh();
          }}
        />
      </SafeAreaView>
    );
  }

  // 4. EĞİTMEN VEYA ÜYE PANELİ (Admin canlı önizleme mini-barı dahil)
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="dark" />

      {/* SADECE ADMIN EĞİTMEN/ÜYE PANELİNİ ÖNİZLERKEN GÖRÜNEN CANLI PANEL GEÇİŞ ÇUBUĞU */}
      {isAdmin && (
        <View style={styles.adminPreviewStrip}>
          <TouchableOpacity
            style={styles.returnAdminPill}
            onPress={returnToAdminPanel}
            activeOpacity={0.85}
          >
            <ArrowLeft size={14} color="#090D16" strokeWidth={2.4} />
            <ShieldCheck size={14} color="#090D16" strokeWidth={2.3} />
            <Text style={styles.returnAdminPillText}>Yönetim Paneline Dön</Text>
          </TouchableOpacity>

          <View style={styles.quickPanelSwitchGroup}>
            <TouchableOpacity
              style={[
                styles.quickPanelBtn,
                activePanel === 'trainer' && styles.quickPanelBtnActive,
              ]}
              onPress={() => switchPanel('trainer')}
              activeOpacity={0.82}
            >
              <Award
                size={13}
                color={activePanel === 'trainer' ? '#E5C16C' : '#94A3B8'}
              />
              <Text
                style={[
                  styles.quickPanelBtnText,
                  activePanel === 'trainer' && styles.quickPanelBtnTextActive,
                ]}
              >
                Eğitmen
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickPanelBtn,
                activePanel === 'member' && styles.quickPanelBtnActive,
              ]}
              onPress={() => switchPanel('member')}
              activeOpacity={0.82}
            >
              <Users
                size={13}
                color={activePanel === 'member' ? '#E5C16C' : '#94A3B8'}
              />
              <Text
                style={[
                  styles.quickPanelBtnText,
                  activePanel === 'member' && styles.quickPanelBtnTextActive,
                ]}
              >
                Üye
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Admin tarafından aktif edilen Stüdyo Bilgi Bandı */}
      {panelConfig?.studio_banner_enabled &&
      (panelConfig.studio_banner_title || panelConfig.studio_banner_message) ? (
        <View style={styles.studioInfoStrip}>
          <Megaphone size={14} color={COLORS.primary} />
          <Text style={styles.studioInfoText} numberOfLines={2}>
            {panelConfig.studio_banner_title ? `${panelConfig.studio_banner_title}: ` : ''}
            {panelConfig.studio_banner_message}
          </Text>
        </View>
      ) : null}

      {/* Üst Başlık */}
      {selectedUser ? (
        <CleanAppHeader
          user={selectedUser}
          activeRoute={selectedUser.role === 'trainer' ? trainerRoute : memberRoute}
          unreadNotificationCount={selectedUser.role === 'member' ? unreadCount : 0}
          showQrButton={true}
          onOpenDrawer={() => setDrawerVisible(true)}
          onOpenNotifications={handleHeaderNotificationsPress}
          onOpenQr={handleHeaderQrPress}
        />
      ) : null}

      {/* Ana İçerik */}
      {loadingUsers && !selectedUser ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingTitle}>Panel verileri hazırlanıyor...</Text>
        </View>
      ) : connectionError && !selectedUser ? (
        <View style={styles.centerBox}>
          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <WifiOff size={28} color={COLORS.danger} />
            </View>
            <Text style={styles.errorTitle}>Sunucuya Ulaşılamadı</Text>
            <Text style={styles.errorDesc}>{connectionError}</Text>
            <View style={styles.apiTargetPill}>
              <Text style={styles.apiTarget}>Hedef API: {API_BASE_URL}</Text>
            </View>
            <View style={styles.errorActionsRow}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={reloadUsers}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>Yeniden Dene</Text>
              </TouchableOpacity>
              {isAdmin ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={returnToAdminPanel}
                  activeOpacity={0.85}
                >
                  <Layers size={15} color={COLORS.primary} />
                  <Text style={styles.secondaryBtnText}>Yönetim Paneli</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={logout}
                  activeOpacity={0.85}
                >
                  <LogOut size={15} color={COLORS.danger} />
                  <Text style={[styles.secondaryBtnText, { color: COLORS.danger }]}>
                    Çıkış Yap
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : selectedUser ? (
        selectedUser.role === 'trainer' ? (
          <TrainerRootView
            key={`trainer-${selectedUser.id}`}
            trainer={selectedUser}
            activeRoute={trainerRoute}
            onNavigateRoute={setTrainerRoute}
          />
        ) : (
          <MemberRootView
            key={`member-${selectedUser.id}`}
            member={selectedUser}
            activeRoute={memberRoute}
            onNavigate={setMemberRoute}
            hideInternalHeader={true}
            qrModalVisible={qrModalVisible}
            onOpenQr={() => setQrModalVisible(true)}
            onCloseQr={() => setQrModalVisible(false)}
            notificationsModalVisible={notifModalVisible}
            onOpenNotifications={() => setNotifModalVisible(true)}
            onCloseNotifications={() => setNotifModalVisible(false)}
            onUnreadCountChange={setUnreadCount}
            onPackageSummaryChange={setPackageSummary}
            onOpenGateway={() => handleOpenGateway()}
            onOpenAdmin={isAdmin ? handleOpenAdminButton : undefined}
          />
        )
      ) : (
        <View style={styles.centerBox}>
          <Text style={styles.loadingTitle}>Görüntülenecek profil bulunamadı.</Text>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.retryBtn, { marginTop: 14 }]}
              onPress={returnToAdminPanel}
            >
              <Text style={styles.retryBtnText}>Yönetim Paneline Dön</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Soldan Açılan Yan Menü */}
      {selectedUser && (
        <SlideOverDrawer
          visible={drawerVisible}
          user={selectedUser}
          activeMemberRoute={memberRoute}
          activeTrainerRoute={trainerRoute}
          packageSummaryText={selectedUser.role === 'member' ? packageSummary : null}
          onSelectMemberRoute={(route) => {
            setMemberRoute(route);
          }}
          onSelectTrainerRoute={(route) => {
            setTrainerRoute(route);
          }}
          onOpenQr={handleHeaderQrPress}
          onClose={() => setDrawerVisible(false)}
          onOpenGateway={() => handleOpenGateway()}
          onOpenAdmin={isAdmin ? handleOpenAdminButton : undefined}
          onLogout={logout}
        />
      )}

      {/* Üye Kodu Sorgulama Modalı */}
      <PortalGatewayModal
        asModal={true}
        visible={gatewayVisible}
        initialTab={gatewayInitialTab}
        initialLookupCode={gatewayLookupCode}
        onClose={() => setGatewayVisible(false)}
        onSelectUser={
          isAdmin
            ? (u) => {
                selectUser(u);
                setGatewayVisible(false);
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  darkBootSafeArea: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  darkBootCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  darkBootText: {
    fontFamily: FONTS.sans,
    color: '#94A3B8',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 12,
  },
  adminSafeArea: {
    flex: 1,
    backgroundColor: '#0B111E',
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  adminPreviewStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#23324F',
    gap: 8,
  },
  returnAdminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C9A452',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  returnAdminPillText: {
    fontFamily: FONTS.sans,
    color: '#090D16',
    fontSize: 12,
    fontWeight: '800',
  },
  quickPanelSwitchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickPanelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#18243C',
    borderWidth: 1,
    borderColor: '#293B5C',
  },
  quickPanelBtnActive: {
    backgroundColor: 'rgba(201, 164, 82, 0.16)',
    borderColor: '#C9A452',
  },
  quickPanelBtnText: {
    fontFamily: FONTS.sans,
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  quickPanelBtnTextActive: {
    color: '#E5C16C',
    fontWeight: '800',
  },
  studioInfoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryBorder,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  studioInfoText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: COLORS.background,
  },
  loadingTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 400,
    ...CARD_SHADOW,
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 14,
  },
  errorDesc: {
    fontFamily: FONTS.sans,
    color: COLORS.dangerText,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
  apiTargetPill: {
    marginTop: 12,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  apiTarget: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
});
