import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Hash,
  Search,
  User,
  X,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import { AppUser } from '@/types/fitness';
import { PortalLookupResponse } from '@/types/authAdmin';

export type GatewayTabKey = 'lookup' | 'login' | 'admin';

export interface PortalGatewayModalProps {
  visible?: boolean;
  asModal?: boolean;
  initialTab?: GatewayTabKey;
  initialLookupCode?: string;
  onClose?: () => void;
  onSelectUser?: (user: AppUser) => void;
  onOpenAdmin?: () => void;
}

export function PortalGatewayModal({
  visible = false,
  asModal = true,
  initialLookupCode,
  onClose,
  onSelectUser,
}: PortalGatewayModalProps) {
  const { isAdmin } = useAuthDemo();
  const [lookupInput, setLookupInput] = useState<string>(initialLookupCode || '');
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupData, setLookupData] = useState<PortalLookupResponse | null>(null);

  useEffect(() => {
    if (initialLookupCode) {
      setLookupInput(initialLookupCode);
    }
  }, [initialLookupCode]);

  const handleLookup = useCallback(
    async (overrideCode?: string) => {
      const targetCode = (overrideCode ?? lookupInput).trim();
      if (!targetCode) {
        setLookupError('Lütfen FIT-1004 gibi geçerli bir üye kodunu girin.');
        return;
      }
      setLookupLoading(true);
      setLookupError(null);
      try {
        const res = await apiRequest<PortalLookupResponse>(
          `/portal/lookup/${encodeURIComponent(targetCode)}`
        );
        setLookupData(res);
      } catch (err: any) {
        setLookupData(null);
        setLookupError(err?.message || 'Kod sorgulaması sırasında hata oluştu.');
      } finally {
        setLookupLoading(false);
      }
    },
    [lookupInput]
  );

  useEffect(() => {
    if (visible && initialLookupCode) {
      handleLookup(initialLookupCode);
    }
  }, [visible, initialLookupCode, handleLookup]);

  const upcomingBookings = Array.isArray(lookupData?.upcoming_bookings)
    ? lookupData.upcoming_bookings
    : [];

  const content = (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.headerTitle}>Üye Kodu & Kredi Sorgulama</Text>
            <Text style={styles.headerSubtitle}>
              FIT-XXXX üye numarası ile kalan ders ve yaklaşan randevuları görüntüleyin.
            </Text>
          </View>
          {onClose ? (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              <X size={19} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.searchRow}>
              <View style={styles.inputBox}>
                <Hash size={17} color={COLORS.primary} />
                <TextInput
                  value={lookupInput}
                  onChangeText={setLookupInput}
                  placeholder="Örn: FIT-1004"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onSubmitEditing={() => handleLookup()}
                  style={styles.input}
                />
              </View>

              <TouchableOpacity
                style={styles.searchBtn}
                onPress={() => handleLookup()}
                disabled={lookupLoading}
                activeOpacity={0.85}
              >
                {lookupLoading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Search size={16} color={COLORS.white} />
                    <Text style={styles.searchBtnText}>Sorgula</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {lookupError ? (
              <View style={styles.errorBanner}>
                <AlertTriangle size={15} color={COLORS.danger} />
                <Text style={styles.errorText}>{lookupError}</Text>
                {lookupInput.trim().length > 0 ? (
                  <TouchableOpacity
                    style={styles.retryChip}
                    onPress={() => handleLookup()}
                    disabled={lookupLoading}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Tekrar Dene"
                  >
                    <Text style={styles.retryChipText}>Tekrar Dene</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          {lookupData ? (
            <View style={styles.card}>
              <View style={styles.resultTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.codePillText}>{lookupData.access_code}</Text>
                  <Text style={styles.memberName}>{lookupData.full_name}</Text>
                  <Text style={styles.packageLabel}>
                    {lookupData.package_name || 'Aktif Paket Yok'}
                  </Text>
                </View>

                <View style={styles.creditBadge}>
                  <Text style={styles.creditBig}>
                    {lookupData.role === 'member'
                      ? `${lookupData.remaining_credits}/${lookupData.total_credits}`
                      : `${upcomingBookings.length}`}
                  </Text>
                  <Text style={styles.creditSub}>
                    {lookupData.role === 'member' ? 'KALAN DERS' : 'AKTİF SEANS'}
                  </Text>
                </View>
              </View>

              {isAdmin && onSelectUser ? (
                <TouchableOpacity
                  style={styles.inspectBtn}
                  onPress={() => {
                    onSelectUser({
                      id: lookupData.user.id,
                      full_name: lookupData.user.full_name,
                      phone: lookupData.user.phone,
                      role: lookupData.user.role,
                      instagram_handle: lookupData.user.instagram_handle,
                      notes: lookupData.user.notes,
                    });
                    onClose?.();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.inspectBtnText}>Panelde Görüntüle</Text>
                  <ArrowRight size={16} color={COLORS.white} />
                </TouchableOpacity>
              ) : null}

              <View style={styles.upcomingSection}>
                <View style={styles.upcomingHeader}>
                  <Calendar size={16} color={COLORS.primary} />
                  <Text style={styles.upcomingTitle}>
                    Yaklaşan Dersler ({upcomingBookings.length})
                  </Text>
                </View>

                {upcomingBookings.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Dumbbell size={18} color={COLORS.textMuted} />
                    <Text style={styles.emptyText}>Planlanmış aktif randevu bulunmuyor.</Text>
                  </View>
                ) : (
                  upcomingBookings.map((item) => (
                    <View
                      key={`${item.booking_id}-${item.session_id}`}
                      style={styles.lessonRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lessonTitle}>{item.title}</Text>
                        <View style={styles.lessonMetaRow}>
                          <Clock size={12} color={COLORS.primary} />
                          <Text style={styles.lessonMeta}>
                            {item.day_label} • {item.start_time}-{item.end_time}
                          </Text>
                          <User size={12} color={COLORS.secondary} />
                          <Text style={styles.lessonMeta}>{item.trainer_name}</Text>
                        </View>
                      </View>
                      <CheckCircle2 size={16} color={COLORS.success} />
                    </View>
                  ))
                )}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  if (asModal) {
    return (
      <Modal
        visible={Boolean(visible)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 14.5,
    fontWeight: '700',
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    minHeight: 46,
    borderRadius: 14,
    justifyContent: 'center',
  },
  searchBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 12,
    padding: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.dangerText,
    fontSize: 12.5,
    fontWeight: '600',
  },
  retryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  retryChipText: {
    fontFamily: FONTS.sans,
    color: COLORS.dangerText,
    fontSize: 11.5,
    fontWeight: '700',
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  codePillText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  memberName: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  packageLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  creditBadge: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  creditBig: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 19,
    fontWeight: '800',
  },
  creditSub: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 2,
  },
  inspectBtn: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inspectBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  upcomingSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upcomingTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  emptyText: {
    fontFamily: FONTS.sans,
    color: COLORS.textMuted,
    fontSize: 13,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lessonTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  lessonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  lessonMeta: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    marginRight: 6,
  },
});
