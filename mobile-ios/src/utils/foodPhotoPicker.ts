import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface NativeFormDataImage {
  uri: string;
  name: string;
  type: string;
}

export interface PickedFoodPhoto {
  previewUri: string;
  thumbnailDataUri?: string | null;
  fileName: string;
  mimeType: string;
  formDataValue: Blob | NativeFormDataImage;
}

export interface NativePickResult {
  cancelled: boolean;
  photo?: PickedFoodPhoto;
  error?: string;
}

function sanitizeJpegFileName(raw?: string | null): string {
  const base = (raw || 'tabak-fotografi').trim();
  const withoutExt = base.replace(/\.[a-z0-9]+$/i, '') || 'tabak-fotografi';
  const safe = withoutExt.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
  return `${safe || 'tabak-fotografi'}.jpg`;
}

/**
 * iOS & Android native fotoğraf seçici (expo-image-picker).
 * İzinleri kontrol eder ve reddedildiğinde Türkçe uyarı döndürür.
 */
export async function pickNativeFoodPhoto(
  source: 'camera' | 'gallery'
): Promise<NativePickResult> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        return {
          cancelled: false,
          error:
            'Kamera izni verilmedi. Öğün fotoğrafı çekmek için cihaz ayarlarından kamera erişimine izin verin.',
        };
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        exif: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return { cancelled: true };
      }

      const asset = result.assets[0];
      const fileName = sanitizeJpegFileName(asset.fileName || 'kamera-ogun');
      return {
        cancelled: false,
        photo: {
          previewUri: asset.uri,
          thumbnailDataUri: null,
          fileName,
          mimeType: 'image/jpeg',
          formDataValue: {
            uri: asset.uri,
            name: fileName,
            type: 'image/jpeg',
          },
        },
      };
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return {
        cancelled: false,
        error:
          'Galeri izni verilmedi. Fotoğraf seçmek için cihaz ayarlarından fotoğraf arşivi erişimine izin verin.',
      };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
      exif: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { cancelled: true };
    }

    const asset = result.assets[0];
    const fileName = sanitizeJpegFileName(asset.fileName || 'galeri-ogun');
    return {
      cancelled: false,
      photo: {
        previewUri: asset.uri,
        thumbnailDataUri: null,
        fileName,
        mimeType: 'image/jpeg',
        formDataValue: {
          uri: asset.uri,
          name: fileName,
          type: 'image/jpeg',
        },
      },
    };
  } catch {
    return {
      cancelled: false,
      error:
        source === 'camera'
          ? 'Kamera açılamadı. Lütfen tekrar deneyin veya galeriden fotoğraf seçin.'
          : 'Galeri açılamadı. Lütfen tekrar deneyin.',
    };
  }
}

function canvasToBlobAsync(
  canvas: any,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(
          (blob: Blob | null) => resolve(blob),
          mimeType,
          quality
        );
        return;
      }
      resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/data:([^;]+);base64/i);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const atobFn = (globalThis as any).atob;
    if (typeof atobFn !== 'function') return null;
    const binary = atobFn(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function wrapBlobAsFile(blob: Blob, fileName: string): Blob {
  try {
    const FileCtor = (globalThis as any).File;
    if (typeof FileCtor === 'function') {
      return new FileCtor([blob], fileName, { type: 'image/jpeg' });
    }
  } catch {
    // Fallback to raw Blob
  }
  return blob;
}

/**
 * Web / PWA tarayıcısında seçilen fotoğrafı HTML <canvas> ile
 * maksimum 1280px & JPEG 0.7 kalitesinde sıkıştırıp Blob/File üretir.
 */
export function compressWebImageForUpload(
  file: any,
  maxDim = 1280,
  quality = 0.7
): Promise<PickedFoodPhoto> {
  return new Promise((resolve, reject) => {
    const fileName = sanitizeJpegFileName(file?.name || 'tabak-fotografi');
    const FileReaderCtor = (globalThis as any).FileReader;
    if (!FileReaderCtor) {
      reject(new Error('Görsel okuyucu bu tarayıcı ortamında kullanılamıyor.'));
      return;
    }

    const reader = new FileReaderCtor();
    reader.onerror = () => reject(new Error('Seçilen fotoğraf okunamadı.'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        reject(new Error('Fotoğraf verisi boş görünüyor.'));
        return;
      }

      const ImageCtor = (globalThis as any).Image;
      const doc = (globalThis as any).document;
      if (!ImageCtor || !doc) {
        const fallbackBlob =
          file instanceof Blob ? file : dataUrlToBlob(rawDataUrl);
        if (!fallbackBlob) {
          reject(new Error('Fotoğraf yükleme için hazırlanamadı.'));
          return;
        }
        resolve({
          previewUri: rawDataUrl,
          thumbnailDataUri: null,
          fileName,
          mimeType: 'image/jpeg',
          formDataValue: wrapBlobAsFile(fallbackBlob, fileName),
        });
        return;
      }

      const img = new ImageCtor();
      img.onerror = () => {
        const fallbackBlob =
          file instanceof Blob ? file : dataUrlToBlob(rawDataUrl);
        if (!fallbackBlob) {
          reject(new Error('Fotoğraf işlenemedi. Lütfen farklı bir görsel seçin.'));
          return;
        }
        resolve({
          previewUri: rawDataUrl,
          thumbnailDataUri: null,
          fileName,
          mimeType: 'image/jpeg',
          formDataValue: wrapBlobAsFile(fallbackBlob, fileName),
        });
      };

      img.onload = async () => {
        try {
          const origW = Number(img.naturalWidth || img.width || 0);
          const origH = Number(img.naturalHeight || img.height || 0);
          if (!origW || !origH) {
            const fallbackBlob =
              file instanceof Blob ? file : dataUrlToBlob(rawDataUrl);
            if (!fallbackBlob) {
              reject(new Error('Fotoğraf boyutları okunamadı.'));
              return;
            }
            resolve({
              previewUri: rawDataUrl,
              thumbnailDataUri: null,
              fileName,
              mimeType: 'image/jpeg',
              formDataValue: wrapBlobAsFile(fallbackBlob, fileName),
            });
            return;
          }

          const longest = Math.max(origW, origH);
          const scale = longest > maxDim ? maxDim / longest : 1;
          const targetW = Math.max(1, Math.round(origW * scale));
          const targetH = Math.max(1, Math.round(origH * scale));

          const canvas = doc.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            const fallbackBlob =
              file instanceof Blob ? file : dataUrlToBlob(rawDataUrl);
            if (!fallbackBlob) {
              reject(new Error('Görsel sıkıştırma başarısız oldu.'));
              return;
            }
            resolve({
              previewUri: rawDataUrl,
              thumbnailDataUri: null,
              fileName,
              mimeType: 'image/jpeg',
              formDataValue: wrapBlobAsFile(fallbackBlob, fileName),
            });
            return;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          let blob = await canvasToBlobAsync(canvas, 'image/jpeg', quality);
          if (!blob && compressedDataUrl) {
            blob = dataUrlToBlob(compressedDataUrl);
          }
          if (!blob && file instanceof Blob) {
            blob = file;
          }
          if (!blob) {
            reject(new Error('Sıkıştırılmış görsel oluşturulamadı.'));
            return;
          }

          // Öğün geçmişi için hafif küçük önizleme (max 240px)
          let thumbnailDataUri: string | null = null;
          try {
            const thumbScale = longest > 240 ? 240 / longest : 1;
            const thumbCanvas = doc.createElement('canvas');
            thumbCanvas.width = Math.max(1, Math.round(origW * thumbScale));
            thumbCanvas.height = Math.max(1, Math.round(origH * thumbScale));
            const thumbCtx = thumbCanvas.getContext('2d');
            if (thumbCtx) {
              thumbCtx.fillStyle = '#FFFFFF';
              thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
              thumbCtx.drawImage(
                img,
                0,
                0,
                thumbCanvas.width,
                thumbCanvas.height
              );
              thumbnailDataUri = thumbCanvas.toDataURL('image/jpeg', 0.65);
            }
          } catch {
            thumbnailDataUri = null;
          }

          resolve({
            previewUri: compressedDataUrl || rawDataUrl,
            thumbnailDataUri,
            fileName,
            mimeType: 'image/jpeg',
            formDataValue: wrapBlobAsFile(blob, fileName),
          });
        } catch {
          const fallbackBlob =
            file instanceof Blob ? file : dataUrlToBlob(rawDataUrl);
          if (!fallbackBlob) {
            reject(new Error('Fotoğraf sıkıştırılırken hata oluştu.'));
            return;
          }
          resolve({
            previewUri: rawDataUrl,
            thumbnailDataUri: null,
            fileName,
            mimeType: 'image/jpeg',
            formDataValue: wrapBlobAsFile(fallbackBlob, fileName),
          });
        }
      };

      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Hazır örnek tabak görseli (data URI) için FormData uyumlu PickedFoodPhoto üretir.
 */
export function buildPickedPhotoFromDataUri(
  dataUri: string,
  fileName: string
): PickedFoodPhoto {
  const safeName = sanitizeJpegFileName(fileName);
  if (Platform.OS === 'web') {
    const blob = dataUrlToBlob(dataUri);
    if (blob) {
      return {
        previewUri: dataUri,
        thumbnailDataUri: dataUri,
        fileName: safeName,
        mimeType: 'image/jpeg',
        formDataValue: wrapBlobAsFile(blob, safeName),
      };
    }
  }
  return {
    previewUri: dataUri,
    thumbnailDataUri: dataUri,
    fileName: safeName,
    mimeType: 'image/jpeg',
    formDataValue: {
      uri: dataUri,
      name: safeName,
      type: 'image/jpeg',
    },
  };
}

/**
 * POST /nutrition/analyze-photo multipart/form-data gövdesini oluşturur.
 */
export function buildFoodVisionFormData(
  photo: PickedFoodPhoto,
  memberId: number,
  note?: string
): FormData {
  const formData = new FormData();
  if (Platform.OS === 'web' && photo.formDataValue instanceof Blob) {
    formData.append('image', photo.formDataValue, photo.fileName);
  } else {
    formData.append('image', photo.formDataValue as any);
  }
  formData.append('member_id', String(memberId));
  const trimmedNote = (note || '').trim();
  if (trimmedNote) {
    formData.append('note', trimmedNote);
  }
  return formData;
}
