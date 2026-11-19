import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Dumbbell,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react-native';
import { COLORS } from '@/theme/colors';
import { useAuthDemo } from '@/context/AuthDemoContext';

export interface DemoSwitcherBarProps {
  onOpenGateway?: () => void;
  onOpenAdmin?: () => void;
  adminActive?: boolean;
  onUserSwitched?: () => void;
}

export function DemoSwitcherBar({
  onOpenGateway,
  onOpenAdmin,
  adminActive = false,
  onUserSwitched,
}: DemoSwitcherBarProps) {
  const { users, selectedUser, selectUser, reloadUsers, loadingUsers } = useAuthDemo();

  const isTrainer = selectedUser?.role === 'trainer';

  return (
    <View style={styles.wrapper}>
      {/* Üst Satır: Marka / Aktif Mod + Hızlı Portal & Admin Aksiyonları */}
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: adminActive
                  ? 'rgba(163, 230, 53, 0.16)'
                  : isTrainer
                  ? COLORS.indigoSoft
                  : COLORS.emeraldSoft,
              },
            ]}
          >
            <Sparkles
              size={13}
              color={
                adminActive
                  ? COLORS.accentVolt
                  : isTrainer
                  ? COLORS.trainerAccent
                  : COLORS.primary
              }
            />
          </View>
          <View>
            <Text style={styles.switcherTitle}>APEX STUDIO</Text>
            {selectedUser && (
              <Text
                style={[
                  styles.modeSubText,
                  {
                    color: adminActive
                      ? COLORS.accentVolt
                      : isTrainer
                      ? '#A5B4FC'
                      : COLORS.primary,
                  },
                ]}
              >
                {adminActive
                  ? 'ADMİN & VERİ MERKEZİ'
                  : isTrainer
                  ? 'EĞİTMEN PANELİ'
                  : 'ÜYE PANELİ'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rightActions}>
          {onOpenGateway && (
            <TouchableOpacity
              onPress={onOpenGateway}
              style={styles.quickPortalBtn}
              activeOpacity={0.82}
              accessibilityLabel="ID Sorgu ve Giriş Kapısı"
            >
              <Search size={12} color={COLORS.accentVolt} />
              <Text style={styles.quickPortalBtnText}>🔍 ID Sorgu / Giriş</Text>
            </TouchableOpacity>
          )}

          {onOpenAdmin && (
            <TouchableOpacity
              onPress={onOpenAdmin}
              style={[
                styles.quickAdminBtn,
                adminActive && styles.quickAdminBtnActive,
              ]}
              activeOpacity={0.82}
              accessibilityLabel="Admin ve Veri Merkezi"
            >
              <ShieldCheck
                size={12}
                color={adminActive ? '#090D16' : '#C7D2FE'}
              />
              <Text
                style={[
                  styles.quickAdminBtnText,
                  adminActive && styles.quickAdminBtnTextActive,
                ]}
              >
                🛡️ Admin & Veri
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={reloadUsers}
            style={styles.refreshBtn}
            activeOpacity={0.75}
            accessibilityLabel="Kullanıcıları yenile"
          >
            <RefreshCw
              size={13}
              color={loadingUsers ? COLORS.primary : COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Alt Satır: Hızlı Rol & Kullanıcı Değiştirici Çipleri */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {users.map((u) => {
          const active = !adminActive && selectedUser?.id === u.id;
          const userIsTrainer = u.role === 'trainer';
          const accent = userIsTrainer ? COLORS.trainerAccent : COLORS.primary;
          const rolePrefix = userIsTrainer ? 'Eğitmen' : 'Üye';

          return (
            <TouchableOpacity
              key={u.id}
              onPress={() => {
                selectUser(u);
                onUserSwitched?.();
              }}
              activeOpacity={0.82}
              style={[
                styles.chip,
                active && {
                  backgroundColor: accent,
                  borderColor: accent,
                },
              ]}
            >
              {userIsTrainer ? (
                <Dumbbell
                  size={12}
                  color={active ? COLORS.white : COLORS.trainerAccent}
                />
              ) : (
                <UserCheck
                  size={12}
                  color={active ? '#090D16' : COLORS.primary}
                />
              )}
              <Text
                style={[
                  styles.chipText,
                  active &&
                    (userIsTrainer
                      ? styles.chipTextActiveTrainer
                      : styles.chipTextActiveMember),
                ]}
              >
                {rolePrefix}: {u.full_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingTop: 8,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 9,
    gap: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switcherTitle: {
    color: COLORS.textPrimary,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modeSubText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickPortalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(163, 230, 53, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  quickPortalBtnText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  quickAdminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.38)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  quickAdminBtnActive: {
    backgroundColor: COLORS.accentVolt,
    borderColor: COLORS.accentVolt,
  },
  quickAdminBtnText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  quickAdminBtnTextActive: {
    color: '#090D16',
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsContainer: {
    paddingHorizontal: 14,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActiveMember: {
    color: '#090D16',
    fontWeight: '800',
  },
  chipTextActiveTrainer: {
    color: COLORS.white,
    fontWeight: '800',
  },
});
