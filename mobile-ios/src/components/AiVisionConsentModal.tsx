import React from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Info, ShieldCheck, Sparkles } from 'lucide-react-native';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';

export const AI_VISION_CONSENT_STORAGE_KEY = 'erya_ai_vision_consent_v1';
const AI_VISION_CONSENT_VALUE = 'accepted';

let memoryConsentAccepted = false;

export function isAiVisionConsentAcceptedSync(): boolean {
  if (memoryConsentAccepted) return true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const val = window.localStorage.getItem(AI_VISION_CONSENT_STORAGE_KEY);
      if (val === AI_VISION_CONSENT_VALUE) {
        memoryConsentAccepted = true;
        return true;
      }
    } catch {
      // Ignore storage quota or private mode errors
    }
  }
  return false;
}

export async function getAiVisionConsentAccepted(): Promise<boolean> {
  if (isAiVisionConsentAcceptedSync()) return true;
  if (Platform.OS === 'web') return false;
  try {
    const val = await AsyncStorage.getItem(AI_VISION_CONSENT_STORAGE_KEY);
    if (val === AI_VISION_CONSENT_VALUE) {
      memoryConsentAccepted = true;
      return true;
    }
  } catch {
    // Ignore native storage read errors
  }
  return false;
}

export function markAiVisionConsentAcceptedSync(): void {
  memoryConsentAccepted = true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        AI_VISION_CONSENT_STORAGE_KEY,
        AI_VISION_CONSENT_VALUE
      );
    } catch {
      // Ignore storage quota or private mode errors
    }
  }
}

export async function saveAiVisionConsentAccepted(): Promise<void> {
  markAiVisionConsentAcceptedSync();
  if (Platform.OS !== 'web') {
    try {
      await AsyncStorage.setItem(
        AI_VISION_CONSENT_STORAGE_KEY,
        AI_VISION_CONSENT_VALUE
      );
    } catch {
      // Ignore native storage write errors
    }
  }
}

export interface AiVisionConsentModalProps {
  visible: boolean;
  onCancel: () => void;
  onAccept: () => void;
}

export function AiVisionConsentModal({
  visible,
  onCancel,
  onAccept,
}: AiVisionConsentModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <SafeAreaView
        style={styles.backdrop}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Sparkles size={22} color={COLORS.primary} strokeWidth={1.8} />
          </View>

          <View style={styles.eyebrowPill}>
            <ShieldCheck size={12} color={COLORS.primary} />
            <Text style={styles.eyebrowText}>GİZLİLİK & VERİ İŞLEME ONAYI</Text>
          </View>

          <Text style={styles.title}>Yapay Zeka Veri Paylaşım Onayı</Text>

          <Text style={styles.bodyText}>
            Yüklediğiniz öğün fotoğrafı kalori analizi amacıyla harici yapay zeka
            servisiyle işlenecektir. Devam etmek istiyor musunuz?
          </Text>

          <View style={styles.infoBox}>
            <Info size={15} color={COLORS.textSecondary} strokeWidth={1.7} />
            <Text style={styles.infoText}>
              Fotoğraflarınız yalnızca tahmini kalori ve makro besin analizi
              amacıyla işlenir; tıbbi tanı veya tedavi yerine geçmez ve reklam
              amacıyla üçüncü taraflarla paylaşılmaz.
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Vazgeç"
            >
              <Text style={styles.cancelBtnText}>Vazgeç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={onAccept}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel="Onayla ve Devam Et"
            >
              <Text style={styles.acceptBtnText}>Onayla ve Devam Et</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 12,
    ...CARD_SHADOW,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  eyebrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 5,
    backgroundColor: COLORS.primarySurface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  eyebrowText: {
    fontFamily: FONTS.sans,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: COLORS.primary,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 27,
  },
  bodyText: {
    fontFamily: FONTS.sans,
    fontSize: 13.8,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 20.5,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    lineHeight: 17.5,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 0.85,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1.35,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  acceptBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
});
