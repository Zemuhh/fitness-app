import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ExternalLink,
  FileText,
  Globe,
  Info,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';

const EXTERNAL_PRIVACY_URL = 'https://fitness-appp.onrender.com/privacy';
const EXTERNAL_DELETE_ACCOUNT_URL = 'https://fitness-appp.onrender.com/delete-account';

export type LegalDocumentTab = 'privacy' | 'terms';

export interface LegalDocumentsModalProps {
  visible: boolean;
  initialTab?: LegalDocumentTab;
  onClose: () => void;
}

interface LegalSection {
  title: string;
  body: string;
}

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: '1. Veri Sorumlusu ve Kapsam',
    body: 'ERYA Pilates & Reformer Stüdyosu ("ERYA") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verilerinizin güvenliğine ve gizliliğine önem veriyoruz. Bu aydınlatma metni, mobil uygulamamız üzerinden işlenen verilerin kapsamını, amaçlarını ve yasal haklarınızı açıklar.',
  },
  {
    title: '2. İşlenen Kişisel Veriler ve Amaçları',
    body: 'Üyelik, ders rezervasyonu ve stüdyo içi fiziksel eğitim hizmetlerinin yürütülmesi amacıyla ad-soyad, telefon numarası, e-posta, erişim kodu, ders/paket geçmişi ile kendi tercihinizle paylaştığınız antrenman hassasiyet notları, vücut ölçümleri ve isteğe bağlı öğün kayıtları işlenmektedir.',
  },
  {
    title: '3. Cihaz İzinleri (Kamera ve Fotoğraf Arşivi)',
    body: 'Kamera izni yalnızca salon QR kod girişi ve isteğe bağlı öğün fotoğrafı analizi için; fotoğraf arşivi izni ise profil/öğün görseli seçimi ve QR giriş kartınızı kaydetmek için talep edilir. İzinler yalnızca ilgili özelliği kullandığınızda etkinleşir ve cihaz ayarlarından dilediğiniz zaman kapatılabilir.',
  },
  {
    title: '4. Yapay Zeka Öğün Analizi ve Harici İşleme',
    body: 'AI Beslenme & Toparlanma özelliğini isteğe bağlı olarak kullandığınızda yüklediğiniz öğün fotoğrafları, kalori ve makro besin tahmini üretebilmek amacıyla harici yapay zeka servisiyle şifreli bağlantı üzerinden işlenir. Bu görseller yalnızca beslenme takibi amacıyla kullanılır; tıbbi tanı veya tedavi yerine geçmez, reklam veya üçüncü taraf pazarlama amaçlarıyla paylaşılmaz. İlk kullanım öncesinde açık onayınız alınır.',
  },
  {
    title: '5. Veri Güvenliği ve Ödeme Altyapısı',
    body: 'Tüm veri iletişimi şifreli HTTPS bağlantısı üzerinden gerçekleştirilir. Kişisel verileriniz reklam veya pazarlama amacıyla üçüncü taraflara satılmaz. Fiziksel stüdyo ders paketi ödemeleri PCI-DSS uyumlu ödeme kuruluşu altyapısı üzerinden işlenir; kart bilgileriniz uygulama sunucularında saklanmaz.',
  },
  {
    title: '6. KVKK Haklarınız ve Hesap Silme Hakkı',
    body: 'KVKK Madde 11 kapsamında verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini talep etme hakkına sahipsiniz. Hesabınızı ve ilişkili tüm kişisel verilerinizi (randevular, paket kayıtları, ölçümler, beslenme ve profil kayıtları) uygulama içindeki Profil > "Hesabımı Kalıcı Olarak Sil" adımıyla dilediğiniz zaman kalıcı olarak silebilirsiniz.',
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Fiziksel Stüdyo Hizmetleri ve Paket Kapsamı',
    body: 'ERYA Pilates & Reformer uygulaması üzerinden görüntülenen ve satın alınan tüm ücretli paketler yalnızca stüdyoda yüz yüze gerçekleştirilen fiziksel Reformer Pilates, Cadillac ve Personal Training (PT) dersleri içindir. Uygulama içi beslenme takibi, ilerleme grafikleri ve vücut haritası araçları tüm aktif kulüp üyelerine hiçbir ek ücret olmaksızın ücretsiz olarak sunulur.',
  },
  {
    title: '2. Rezervasyon, Ders Kredisi ve İptal Kuralları',
    body: 'Bir derse kayıt olunduğunda aktif üyelik paketinizdeki kalan ders kredisi 1 azalır ve ders kontenjanına kaydınız eklenir. Ders saatinden en geç 4 saat öncesine kadar yapılan iptallerde ders krediniz hesabınıza otomatik iade edilir ve boşalan kontenjan yedek listedeki sıradaki üyeye açılır.',
  },
  {
    title: '3. Sağlık ve Tıbbi Sorumluluk Reddi',
    body: 'Bilgilendirme: Bu alandaki analizler ve notlar yalnızca spor/fitness takibi amaçlıdır; tıbbi tanı, tedavi veya doktor tavsiyesi yerine geçmez. Fiziksel egzersiz programına başlamadan önce kronik rahatsızlık, hamilelik veya sakatlık durumunuz hakkında hekiminize danışmanız ve eğitmenlerinizi bilgilendirmeniz gerekmektedir.',
  },
  {
    title: '4. Hesap Güvenliği ve Üyelik Sonlandırma',
    body: 'Size özel tanımlanan erişim kodu ve hesap bilgileri kişiseldir; üçüncü kişilerle paylaşılmamalıdır. Stüdyo hijyen, zamanlama ve güvenlik kurallarına uyulması beklenir. Üyeliğinizi ve uygulama hesabınızı dilediğiniz zaman Profil ekranındaki "Hesabımı Kalıcı Olarak Sil" seçeneği ile kalıcı olarak sonlandırabilirsiniz.',
  },
];

export function LegalDocumentsModal({
  visible,
  initialTab = 'privacy',
  onClose,
}: LegalDocumentsModalProps) {
  const [activeTab, setActiveTab] = useState<LegalDocumentTab>(initialTab);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const handleOpenExternalUrl = useCallback(async (url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      } catch {
        // Fallback below
      }
    }
    try {
      await WebBrowser.openBrowserAsync(url);
      return;
    } catch {
      // Fallback to system browser
    }
    try {
      await Linking.openURL(url);
    } catch {
      // Ignore if device cannot open URL
    }
  }, []);

  const sections = activeTab === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconBox}>
              {activeTab === 'privacy' ? (
                <ShieldCheck size={18} color={COLORS.primary} />
              ) : (
                <FileText size={18} color={COLORS.primary} />
              )}
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle}>Yasal Belgeler & KVKK</Text>
              <Text style={styles.headerSubtitle}>
                ERYA Pilates & Reformer Stüdyosu
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Yasal belgeleri kapat"
          >
            <X size={19} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'privacy' && styles.tabBtnActive,
              ]}
              onPress={() => setActiveTab('privacy')}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'privacy' }}
              accessibilityLabel="Gizlilik Politikası (KVKK)"
            >
              <ShieldCheck
                size={14}
                color={activeTab === 'privacy' ? COLORS.white : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'privacy' && styles.tabBtnTextActive,
                ]}
              >
                Gizlilik Politikası (KVKK)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'terms' && styles.tabBtnActive,
              ]}
              onPress={() => setActiveTab('terms')}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'terms' }}
              accessibilityLabel="Kullanım Koşulları"
            >
              <FileText
                size={14}
                color={activeTab === 'terms' ? COLORS.white : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'terms' && styles.tabBtnTextActive,
                ]}
              >
                Kullanım Koşulları
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.metaStrip}>
            <Info size={14} color={COLORS.primary} />
            <Text style={styles.metaText}>
              {activeTab === 'privacy'
                ? '6698 Sayılı KVKK Aydınlatma ve Gizlilik Politikası • Güncel Sürüm'
                : 'Üyelik, Fiziksel Stüdyo Hizmetleri ve Kullanım Koşulları • Güncel Sürüm'}
            </Text>
          </View>

          {sections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}

          <View style={styles.deletionNoticeBox}>
            <Trash2 size={15} color={COLORS.secondary} />
            <Text style={styles.deletionNoticeText}>
              Hesap ve veri silme talebinizi uygulama içerisinden dilediğiniz zaman
              Profil ekranındaki &quot;Hesabımı Kalıcı Olarak Sil&quot; seçeneği ile
              anında gerçekleştirebilirsiniz.
            </Text>
          </View>

          <View style={styles.externalLinksCard}>
            <View style={styles.externalLinksHeader}>
              <Globe size={14} color={COLORS.primary} />
              <Text style={styles.externalLinksTitle}>
                Çevrimiçi Yasal Sayfalar
              </Text>
            </View>

            <TouchableOpacity
              style={styles.externalLinkRow}
              onPress={() => handleOpenExternalUrl(EXTERNAL_PRIVACY_URL)}
              activeOpacity={0.82}
              accessibilityRole="link"
              accessibilityLabel="Web üzerinde Gizlilik Politikası sayfasını aç"
            >
              <Text style={styles.externalLinkText}>
                Gizlilik Politikası (Web)
              </Text>
              <ExternalLink size={14} color={COLORS.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.externalLinkRow}
              onPress={() => handleOpenExternalUrl(EXTERNAL_DELETE_ACCOUNT_URL)}
              activeOpacity={0.82}
              accessibilityRole="link"
              accessibilityLabel="Web üzerinde Hesap Silme Rehberi sayfasını aç"
            >
              <Text style={styles.externalLinkText}>
                Hesap &amp; Veri Silme Politikası (Web)
              </Text>
              <ExternalLink size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={onClose}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="Anladım, Kapat"
          >
            <Text style={styles.confirmBtnText}>Anladım, Kapat</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
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
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
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
  tabBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tabBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  tabBtnTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primarySurface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 7,
    ...CARD_SHADOW,
  },
  sectionTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  sectionBody: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13.2,
    lineHeight: 20,
    fontWeight: '500',
  },
  deletionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.secondarySurface,
    borderWidth: 1,
    borderColor: COLORS.secondaryBorder,
    borderRadius: 14,
    padding: 13,
  },
  deletionNoticeText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12.2,
    lineHeight: 18,
    fontWeight: '600',
  },
  externalLinksCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    ...CARD_SHADOW,
  },
  externalLinksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  externalLinksTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  externalLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  externalLinkText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 12.8,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.white,
    fontSize: 14.5,
    fontWeight: '800',
  },
});
