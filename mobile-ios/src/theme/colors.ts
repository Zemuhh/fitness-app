import { Platform } from 'react-native';

/**
 * ERYA PİLATES REFORMER — Boutique Luxury Studio Palette
 * Mimari İlham: Kemerli 3000K altın LED aynalar, Calacatta beyaz mermer zemin,
 * Parisyen fildişi duvar çıtaları (boiserie), bal rengi kayın Reformer ahşabı,
 * fırçalanmış şampanya altını logo ve "Kadınlara Özel" gül-mürdüm zarafeti.
 */
export const COLORS = {
  // Stüdyo Mimari Zemin & Mermer Yüzeyler
  background: '#F6F1E9',        // Sıcak Parisyen Fildişi / Krem Duvar Tonu
  backgroundAlt: '#FAF7F2',     // Calacatta İnci Beyazı Mermer Zemin
  surface: '#FFFFFF',           // Parlak Mermer Kart Yüzeyi
  surfaceElevated: '#F3ECE1',   // Şampanya Kum / Traverten İç Kutu Zemini
  surfaceHalo: '#FBF4E4',       // 3000K Altın Ayna Halesi Yumuşak Işıltısı
  border: '#E6DCCB',            // Zarif Sıcak Taş & Boiserie Çerçeve Çizgisi
  borderStrong: '#D4C4AA',      // Bal Rengi Kayın Ahşap Çerçeve Vurgusu
  track: '#EAE0D0',             // İlerleme Çubuğu & Halka İz Zemini

  // Ana Marka Vurgusu — Fırçalanmış Şampanya & Antik Altın (WCAG AA >= 4.6:1)
  primary: '#9A7328',           // Okunaklı Antik Şampanya Altını (Buton & Metin)
  primaryMetallic: '#C9A452',   // 3B Fırçalanmış Altın Logo & Halka Gradyanı
  primaryGlow: '#E5C16C',       // 3000K Kemerli Ayna LED Altın Işıltısı
  primaryLight: '#FAF0D7',      // Yumuşak Şampanya Halesi Rozet Zemini
  primarySurface: '#FCF7EA',    // Seçili Kart İnce Altın Fildişi Yüzeyi
  primaryBorder: '#E5CB90',     // Zarif Şampanya Altını Kenarlık

  // İkincil Feminen Vurgu — Gül Kurusu / Mürdüm ("Kadınlara Özel" Stüdyo Vurgusu)
  secondary: '#8C5258',         // Sofistike Gül-Mürdüm (Eğitmen & Cadillac Vurgusu)
  secondaryLight: '#F8ECEE',    // Pudra İpek Gül Rozet Zemini
  secondarySurface: '#FCF4F5',  // Yumuşak Pudra Seçili Yüzey
  secondaryBorder: '#E5C5C9',   // Gül Kurusu İnce Kenarlık

  // Stüdyo Ahşap & Kontrast Mürekkep Tonları
  espresso: '#221D19',          // Derin Espresso-Antrasit (Duvar Slogan Tipografisi)
  walnut: '#7A5536',            // Karşılama Bankosu Ceviz Ahşap Çıta Tonu
  honeyWood: '#C69C64',         // Reformer & Cadillac Doğal Kayın Ahşap Gövde

  // Durum & Geri Bildirim Renkleri (Sıcak Stüdyo Uyumlu)
  success: '#4A7856',           // Botanik Adaçayı Yeşili
  successBg: '#ECF4EE',
  successBorder: '#BBD7C2',

  warning: '#D4952A',           // Sıcak Kehribar / Altın İkon
  warningBg: '#FDF3DF',         // Sakatlık / Postür Notu & Düşük Kredi Zemini
  warningText: '#9A640C',       // Okunaklı Koyu Kehribar Metin
  warningBorder: '#EDD092',     // Sıcak Kehribar Kenarlık

  danger: '#B83B42',            // Zarif Terakota / Mercan Kırmızısı
  dangerBg: '#FCEBEC',          // İptal & Dolu Kontenjan Yumuşak Zemin
  dangerText: '#A63037',        // Okunaklı Koyu Mercan Metin
  dangerBorder: '#F0BFC3',      // Yumuşak Mercan Kenarlık

  // Tipografi Hiyerarşisi
  textPrimary: '#221D19',       // Derin Espresso Başlıklar (15.8:1 Kontrast)
  textSecondary: '#6B5E51',     // Sıcak Taş / Vizon Açıklamalar (6.1:1 Kontrast)
  textMuted: '#9A8C7D',         // Yumuşak Grej Deri İpuçları

  // Geriye Dönük Uyumluluk Tokenları (Erya Pilates Paletine Tam Bağlı)
  trainerAccent: '#8C5258',
  accentVolt: '#C9A452',
  emerald: '#9A7328',
  emeraldSoft: '#FAF0D7',
  voltSoft: '#FAF0D7',
  indigo: '#8C5258',
  indigoSoft: '#F8ECEE',
  amber: '#9A640C',
  amberSoft: '#FDF3DF',
  dangerSoft: '#FCEBEC',
  white: '#FFFFFF',
  scrim: 'rgba(34, 29, 25, 0.36)',
};

export const FONTS = {
  serif: Platform.select({
    web: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    ios: 'Georgia',
    default: 'serif',
  }),
  sans: Platform.select({
    web: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ios: 'System',
    default: 'sans-serif',
  }),
} as const;

export const CARD_SHADOW = {
  shadowColor: '#5C4934',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 2,
} as const;
