---
name: app-store-auditor
description: React Native / Expo Fitness & SaaS uygulamalarını Apple App Store Review Guidelines kurallarına göre denetler, red risklerini raporlar ve otomatik düzeltir.
---

# App Store Auditor — Apple App Store Review Guidelines Denetim & Otomatik Düzeltme Skill'i

Bu skill, React Native / Expo (mobil iOS) ve FastAPI / SQLAlchemy (backend) mimarisine sahip Fitness & SaaS uygulamalarını **Apple App Store Review Guidelines** kurallarına göre uçtan uca denetler, kesin red (KRİTİK) ve uyarı (ORTA) bulgularını sınıflandırır, eksikleri kod üzerinde otomatik olarak düzeltir ve inceleme ekibine gönderilecek hazır **App Review Information** notunu üretir.

---

## Çalışma Protokolü

1. **Tam Tarama (Audit):** Aşağıdaki **7 Zorunlu Denetim Maddesi** boyunca `/backend` ve `/mobile-ios` klasörlerini sistematik biçimde tara.
2. **Risk Sınıflandırması:**
   - **KRİTİK (Kesin Red Riski):** Apple inceleme ekibinin uygulamayı doğrudan reddetmesine yol açan ihlaller (ör. canlı build'de Demo/Test butonları, eksik `DELETE /auth/me` hesap silme akışı, fiziksel hizmet dışı dijital özellik satışı izlenimi, eksik `app.json` izin açıklamaları veya `ITSAppUsesNonExemptEncryption`, erişilemeyen Gizlilik Politikası).
   - **ORTA (Uyarı / Kalite Riski):** İnceleme notu veya kullanıcı deneyimi kaynaklı gecikme/red riskleri (ör. eksik sağlık sorumluluk reddi, bazı ekranlarda `SafeAreaView` veya `KeyboardAvoidingView` eksikliği, ham teknik hata mesajları, boş liste çökme ihtimali).
3. **Otomatik Düzeltme (Auto-Fix):** Raporlanan tüm KRİTİK ve ORTA bulguları kodda doğrudan düzelt. Koyu tema tasarım sistemini (`#0F172A` arka plan, `#10B981` zümrüt yeşili, `#6366F1` indigo vurgu, iOS HIG uyumlu yuvarlatılmış kartlar) ve mevcut iş kurallarını koru.
4. **Doğrulama (Verification):** Backend API endpoint'lerini (özellikle `DELETE /auth/me`) ve mobil TypeScript derlemesini (`npx tsc --noEmit`) çalıştırarak sıfır hata olduğunu kanıtla.
5. **App Review Notes Üretimi:** İnceleme ekibinin (App Review) uygulamayı sorunsuz test edebilmesi için hazır İngilizce **App Review Information** metnini çıktının sonuna ekle.

---

## 7 Zorunlu Denetim Maddesi (Audit Checklist) & Otomatik Düzeltme Kuralları

### 1. Kural 2.1 — App Completeness (Demo / Test / Placeholder Temizliği & Hata Yönetimi)
- **Ne Kontrol Edilir?**
  - `/mobile-ios/src` içinde `"Demo"`, `"Test Kartı"`, `"Hızlı Test Girişi"`, `"Simülasyon"`, `"Simulator"`, `"TODO"`, `"FIXME"`, `"Lorem ipsum"`, `"Placeholder"` geçen tüm metin, buton, sekme ve bileşenler taranır.
  - Teknik/ham hata mesajlarının (`Failed to fetch`, `Network request failed`, `500 Internal Server Error`, `TypeError`, `JSON Parse error`) doğrudan kullanıcıya gösterilip gösterilmediği kontrol edilir.
- **Otomatik Düzeltme Kuralı:**
  - Canlı üretim derlemesinde (`!__DEV__`) görünmemesi gereken tüm demo giriş butonları, test kartı otomatik doldurma araçları, hızlı rol değiştirme çubukları ve simülatör sekmeleri `{__DEV__ && (...)}` koşuluna alınır veya üretimden tamamen kaldırılır.
  - `"Simülasyon"`, `"Demo"` gibi kullanıcıya dönük etiketler üretim modunda gerçekçi, profesyonel Türkçe ifadelere dönüştürülür veya gizlenir.
  - API istemcisi (`src/config/api.ts`) ve ekranlardaki hata yakalama blokları, ham teknik metinler yerine anlaşılır Türkçe uyarı mesajları (*"Bağlantı kurulamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin."*) gösterecek şekilde normalize edilir; kritik veri yükleme ekranlarında **"Tekrar Dene"** butonu bulundurulur.

### 2. Kural 5.1.1(v) — Zorunlu Hesap Silme Akışı (Account Deletion)
- **Ne Kontrol Edilir?**
  - `/backend` tarafında kimliği doğrulanmış kullanıcının kendi hesabını ve ilişkili kişisel verilerini/randevularını kalıcı olarak silebileceği `DELETE /auth/me` endpoint'inin varlığı doğrulanır.
  - `/mobile-ios` tarafında üye (ve varsa eğitmen) Profil/Ayarlar ekranında erişilebilir, açık onay modalı (`"Hesabımı Kalıcı Olarak Sil"`) içeren, backend'e `DELETE /auth/me` çağrısı yapan ve başarılı olduğunda oturumu güvenli biçimde kapatıp giriş ekranına döndüren çalışan bir akış olduğu doğrulanır.
- **Otomatik Düzeltme Kuralı:**
  - Backend'de `DELETE /auth/me` yoksa eklenir:
    - Geçerli Bearer token ile mevcut kullanıcıyı doğrular.
    - Kullanıcının bağlı tüm kayıtlarını (randevular/bookings, paketler/packages, ödeme siparişleri, antrenman/ölçüm logları, beslenme/kalori logları, vücut/sakatlık notları, yönlendirme/referral kayıtları, oturum token'ları, imzalanmış politika kayıtları vb.) foreign-key çakışması yaratmadan tek bir veritabanı transaction'ı içinde siler (veya ilgili kurumsal kayıtları anonimleştirip kullanıcıyı siler) ve aktif derslerdeki `current_enrolled` sayacını tutarlı şekilde günceller.
  - Mobilde Profil/Ayarlar ekranında **"Hesabımı Kalıcı Olarak Sil"** butonu yoksa eklenir:
    - Kırmızı tehlike vurgulu (destructive) buton ve geri alınamaz işlem uyarısı içeren onay modalı açar.
    - Onay verildiğinde `DELETE /auth/me` isteğini gönderir, loading göstergesi sunar, hata olursa kullanıcı dostu Türkçe mesaj gösterir, başarılıysa yerel oturumu temizleyip giriş ekranına yönlendirir.

### 3. Kural 3.1.3(e) — Fiziksel Hizmet Ödeme Uyumu (Goods and Services Outside of the App — Iyzico)
- **Ne Kontrol Edilir?**
  - Paket mağazası, yenileme ve Iyzico ödeme ekranlarındaki tüm başlık, açıklama, kart alt metni ve buton yazıları taranır.
  - Ödemelerin yalnızca **"Stüdyoda Yüz Yüze Yapılan Fiziksel Antrenman / PT / Pilates Dersleri"** için alındığının açıkça belirtildiği kontrol edilir.
  - AI Beslenme Analizi, Vücut Haritası, İlerleme Takibi veya uygulama içi diğer dijital araçların ücretli satıldığı veya ek dijital abonelik gerektirdiği izlenimi veren metinler aranır.
- **Otomatik Düzeltme Kuralı:**
  - Ödeme ve paket ekranlarına görünür bir fiziksel hizmet bilgilendirme kartı/dipnotu eklenir: *"Bu ödeme yalnızca stüdyoda yüz yüze gerçekleştirilen fiziksel antrenman, PT ve reformer pilates ders paketleri içindir."*
  - AI Beslenme ve benzeri uygulama içi dijital özellikler için *"Tüm aktif kulüp üyelerine ücretsiz dahil"* ibaresi eklenir; dijital içerik satışı çağrıştıran ifadeler temizlenir.

### 4. Kural 1.4.1 — Sağlık & Beslenme Sorumluluk Reddi (Physical Harm / Medical Disclaimer)
- **Ne Kontrol Edilir?**
  - AI Beslenme / Kalori ekranı, Vücut / Sakatlık Haritası bileşeni/ekranı ve sağlık verisi gösteren diğer ekranlar taranır.
  - Ekranların alt kısmında açık, şık ve okunabilir bir tıbbi sorumluluk reddi notu olup olmadığı denetlenir.
- **Otomatik Düzeltme Kuralı:**
  - Eksik ekranların alt kısmına temaya uyumlu, okunabilir bir bilgilendirme kutusu eklenir:
    > *"Bilgilendirme: Bu alandaki analizler ve notlar yalnızca spor/fitness takibi amaçlıdır; tıbbi tanı, tedavi veya doktor tavsiyesi yerine geçmez."*

### 5. Kural 5.1.1 & 5.1.2 — iOS `app.json`, Sistem İzinleri & Gizlilik Politikası (KVKK)
- **Ne Kontrol Edilir?**
  - `/mobile-ios/app.json` dosyasında:
    - `expo.ios.bundleIdentifier` (ters DNS formatında, ör. `com.eryapilates.fitness`)
    - `expo.ios.buildNumber` (string formatında, ör. `"1"`)
    - `expo.ios.supportsTablet` (boolean)
    - `expo.ios.infoPlist.ITSAppUsesNonExemptEncryption: false`
    - Kullanılan tüm native izinler için net, amaca uygun Türkçe açıklamalar (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` vb. — kodda `expo-camera`, `expo-image-picker`, `expo-barcode-scanner` vb. paket kullanımına göre).
  - Uygulama içinde hem **Giriş/Kayıt ekranında** hem de **Profil/Ayarlar ekranında** tek dokunuşla açılabilen eksiksiz **"Gizlilik Politikası (KVKK)"** ve **"Kullanım Koşulları"** modalı veya sayfası bulunduğu doğrulanır.
- **Otomatik Düzeltme Kuralı:**
  - `app.json` içindeki eksik iOS alanları ve `infoPlist` anahtarları tamamlanır.
    - Örnek kamera açıklaması: `"Salon QR kod girişi ve öğün fotoğrafı analizi için kamera erişimi gereklidir."`
    - Örnek galeri açıklaması: `"Öğün fotoğrafı yükleme ve profil fotoğrafı seçimi için fotoğraf arşivi erişimi gereklidir."`
  - Ortak bir `LegalDocumentsModal` (veya genişletilmiş KVKK & Kullanım Koşulları modalı) oluşturulup hem Giriş/Kayıt ekranına hem de Profil ekranlarına (Üye ve Eğitmen) bağlanır.

### 6. Kural 4.0 & 4.2 — Tasarım, SafeArea, Klavye & Çökme Koruması
- **Ne Kontrol Edilir?**
  - Tüm kök ekranların ve tam ekran modalların `SafeAreaView` (tercihen `react-native-safe-area-context`) veya güvenli üst/alt inset koruması kullandığı (iPhone çentik / Dynamic Island / Home Indicator uyumu) kontrol edilir.
  - `TextInput` içeren tüm ekran ve modalların `KeyboardAvoidingView` (`behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`) ve/veya kaydırılabilir `ScrollView` (`keyboardShouldPersistTaps="handled"`) ile sarıldığı doğrulanır.
  - Liste render'larında (`map`, `FlatList`, `SectionList`) null/undefined dizilere karşı koruma (`(items ?? [])`) ve boş durum (Empty State) bileşenlerinin bulunduğu denetlenir.
- **Otomatik Düzeltme Kuralı:**
  - Eksik ekranlara `SafeAreaView` ve `KeyboardAvoidingView` eklenir.
  - Potansiyel `undefined.map(...)` veya eksik boş liste korumaları güvenli fallback'lerle kapatılır.

### 7. App Store Connect Review Notları Üretici (App Review Information)
- Denetim tamamlandığında kullanıcıya doğrudan App Store Connect > **App Review Information > Notes** alanına yapıştırabileceği, İngilizce ve profesyonel bir inceleme metni üretilir. Bu metin mutlaka şunları içerir:
  1. **Demo Member Credentials:** İnceleme ekibinin giriş yapıp tüm özellikleri test edebileceği aktif demo üye (ve gerekiyorsa eğitmen) bilgileri.
  2. **Guideline 3.1.3(e) Physical Services Explanation (Iyzico):** Uygulama içindeki paket satın alımlarının yalnızca fiziksel spor stüdyosunda yüz yüze verilen PT ve Reformer Pilates dersleri için olduğu, uygulama içi dijital özelliklerin (AI Beslenme, Vücut Haritası, İlerleme Takibi) hiçbir ek ücret veya IAP olmaksızın tüm aktif kulüp üyelerine ücretsiz sunulduğu açıklaması.
  3. **Guideline 5.1.1(v) Account Deletion Path:** İnceleme ekibinin hesap silme akışını uygulama içinde adım adım nerede bulacağı (`Profile > Hesabımı Kalıcı Olarak Sil`).
  4. **Guideline 1.4.1 Health Disclaimer Note:** Beslenme ve vücut haritası özelliklerinin yalnızca fitness takibi amaçlı olduğu ve tıbbi tavsiye niteliği taşımadığı bilgisi.

---

## Raporlama Formatı

Denetim çıktısı her zaman şu bölümleri içermelidir:
1. **Denetim Özeti Tablosu** (7 Kural x Durum: Geçti / Düzeltildi / Risk)
2. **KRİTİK (Kesin Red) Bulguları ve Yapılan Düzeltmeler**
3. **ORTA (Uyarı) Bulguları ve Yapılan Düzeltmeler**
4. **Doğrulama & Test Sonuçları** (Backend endpoint testleri + Mobil TypeScript kontrolü)
5. **Hazır App Store Connect — App Review Information (İngilizce)**
