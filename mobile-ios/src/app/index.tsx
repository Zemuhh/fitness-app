import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { API_BASE_URL } from '@/config/api';
import { DemoSwitcherBar } from '@/components/DemoSwitcherBar';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { AdminControlScreen } from '@/screens/admin/AdminControlScreen';
import { GatewayTabKey, PortalGatewayModal } from '@/screens/auth/PortalGatewayModal';
import { MemberRootView } from '@/screens/member/MemberRootView';
import { TrainerRootView } from '@/screens/trainer/TrainerRootView';
import { COLORS } from '@/theme/colors';

export default function AppEntryScreen() {
  const {
    selectedUser,
    selectUser,
    loadingUsers,
    connectionError,
    reloadUsers,
    triggerGlobalRefresh,
  } = useAuthDemo();

  const [gatewayVisible, setGatewayVisible] = useState<boolean>(false);
  const [gatewayInitialTab, setGatewayInitialTab] = useState<GatewayTabKey>('lookup');
  const [adminAuthenticated, setAdminAuthenticated] = useState<boolean>(false);
  const [adminMode, setAdminMode] = useState<boolean>(false);

  const handleOpenGateway = () => {
    setGatewayInitialTab('lookup');
    setGatewayVisible(true);
  };

  const handleOpenAdminButton = () => {
    if (adminMode) {
      setAdminMode(false);
      return;
    }
    if (adminAuthenticated) {
      setAdminMode(true);
    } else {
      setGatewayInitialTab('admin');
      setGatewayVisible(true);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* En üstte kalıcı Athletic Dark Mode Hızlı Rol, ID Sorgu & Admin Barı */}
      <DemoSwitcherBar
        onOpenGateway={handleOpenGateway}
        onOpenAdmin={handleOpenAdminButton}
        adminActive={adminMode}
        onUserSwitched={() => setAdminMode(false)}
      />

      {adminMode ? (
        <AdminControlScreen
          onClose={() => setAdminMode(false)}
          onBack={() => setAdminMode(false)}
          onSelectUser={(u) => {
            selectUser(u);
            setAdminMode(false);
          }}
          onDataChanged={() => {
            reloadUsers();
            triggerGlobalRefresh();
          }}
        />
      ) : loadingUsers && !selectedUser ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingTitle}>Apex Studio Yükleniyor...</Text>
          <Text style={styles.apiSub}>{API_BASE_URL}</Text>
        </View>
      ) : connectionError && !selectedUser ? (
        <View style={styles.centerBox}>
          <View style={styles.errorCard}>
            <WifiOff size={34} color={COLORS.danger} />
            <Text style={styles.errorTitle}>Backend Sunucusuna Ulaşılamadı</Text>
            <Text style={styles.errorDesc}>{connectionError}</Text>
            <Text style={styles.apiTarget}>Hedef API: {API_BASE_URL}</Text>
            <Text style={styles.hintText}>
              Bilgisayarınızda FastAPI sunucusunun 0.0.0.0:8000 portunda açık olduğundan ve
              telefonunuzla aynı Wi-Fi / Hotspot ağında bulunduğunuzdan emin olun.
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={reloadUsers}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>Yeniden Bağlan</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : selectedUser ? (
        selectedUser.role === 'trainer' ? (
          <TrainerRootView key={`trainer-${selectedUser.id}`} trainer={selectedUser} />
        ) : (
          <MemberRootView key={`member-${selectedUser.id}`} member={selectedUser} />
        )
      ) : null}

      {/* Şifresiz FIT-XXXX ID Sorgu, Üye/Eğitmen Girişi & Admin Kapısı Modalı */}
      <PortalGatewayModal
        asModal={true}
        visible={gatewayVisible}
        initialTab={gatewayInitialTab}
        onClose={() => setGatewayVisible(false)}
        onSelectUser={(u) => {
          selectUser(u);
          setGatewayVisible(false);
          setAdminMode(false);
        }}
        onOpenAdmin={() => {
          setAdminAuthenticated(true);
          setGatewayVisible(false);
          setAdminMode(true);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 12,
  },
  apiSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 400,
  },
  errorTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
  },
  errorDesc: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
  apiTarget: {
    color: COLORS.accentVolt,
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 10,
  },
  hintText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#090D16',
    fontSize: 14,
    fontWeight: '800',
  },
});
