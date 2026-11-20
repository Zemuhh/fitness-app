import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Download, X } from 'lucide-react-native';
import { FONTS } from '@/theme/colors';

const PWA_BANNER_DISMISSED_KEY = 'fitclub_pwa_banner_dismissed_v1';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const standaloneMedia =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches);
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const androidTwa =
    typeof document !== 'undefined' &&
    document.referrer.includes('android-app://');

  return Boolean(standaloneMedia || iosStandalone || androidTwa);
}

function isMobileWebEnvironment(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|EdgiOS/i.test(ua);
  const ipadDesktopMode =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  const mobileViewport = window.innerWidth <= 480;

  return mobileUa || ipadDesktopMode || mobileViewport;
}

function readDismissedFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(PWA_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissedFlag(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(PWA_BANNER_DISMISSED_KEY, '1');
  } catch {
    // ignore private mode / storage quota errors
  }
}

export const PwaInstallBanner: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const evaluateVisibility = (hasInstallPrompt = false) => {
      if (isRunningStandalone() || readDismissedFlag()) {
        setVisible(false);
        return;
      }
      if (hasInstallPrompt || isMobileWebEnvironment()) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    evaluateVisibility(false);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (!isRunningStandalone() && !readDismissedFlag()) {
        setVisible(true);
      }
    };

    const handleAppInstalled = () => {
      writeDismissedFlag();
      setDeferredPrompt(null);
      setVisible(false);
    };

    const handleResize = () => {
      evaluateVisibility(Boolean(deferredPrompt));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('resize', handleResize);
    };
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    writeDismissedFlag();
    setVisible(false);
  }, []);

  const handleInstallPress = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        writeDismissedFlag();
        setVisible(false);
      }
      setDeferredPrompt(null);
    } catch {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  if (Platform.OS !== 'web' || !visible) {
    return null;
  }

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.bannerCard}>
        <TouchableOpacity
          style={styles.contentTouchable}
          activeOpacity={deferredPrompt ? 0.78 : 1}
          onPress={deferredPrompt ? handleInstallPress : undefined}
          accessibilityRole={deferredPrompt ? 'button' : 'text'}
        >
          <View style={styles.accentBar} />
          <View style={styles.textBlock}>
            <Text style={styles.messageText}>
              📲{' '}
              <Text style={styles.messageBold}>Uygulamayı Telefonuna Kur:</Text>{' '}
              Paylaş butonuna basıp &apos;Ana Ekrana Ekle&apos;yi seçerek tam ekran
              kullanabilirsin
            </Text>
            {deferredPrompt ? (
              <View style={styles.installChip}>
                <Download size={12} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.installChipText}>Hemen Kur</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
          activeOpacity={0.75}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Kurulum rehberini kapat"
        >
          <X size={16} color="#64748B" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    zIndex: 999,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  contentTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#0D9488',
    marginRight: 10,
  },
  textBlock: {
    flex: 1,
    gap: 6,
  },
  messageText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    lineHeight: 17.5,
    color: '#1E293B',
    fontWeight: '500',
  },
  messageBold: {
    fontFamily: FONTS.sans,
    fontWeight: '700',
    color: '#0F766E',
  },
  installChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0D9488',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  installChipText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});

export default PwaInstallBanner;
