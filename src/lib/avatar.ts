"use client";

import * as React from "react";

// ═══ الصورة الشخصية (round 75) ═══
// منطق واحد مشترك لكل الشاشات:
//   • حسابي تعرض الصورة فقط (بلا شارات ولا أزرار فوقها — بطلب المالك)
//   • الإعدادات (الترس) تُديرها: رفع من الجهاز / تغيير / إزالة
//   • الرئيسية تستعملها كخلفية لبانر الترحيب والمعلومات أمامه
// التخزين محلي في جهاز الطالب بمفتاح لكل مستخدم (بلا رفع ولا خادم)،
// يعمل بعد الانقطاع مثل بقية التجربة. أي تغيير يبثّ حدثاً محلياً
// تتحدث به كل الشاشات المركّبة فوراً عبر useAvatar.

export const AVATAR_CHANGED_EVENT = "talib:avatar-changed";

const AVATAR_SIZE = 640;
const AVATAR_JPEG_QUALITY = 0.85;

export function avatarKeyFor(userId: string | number): string {
  return `talib:avatar:${userId}`;
}

/** قراءة آمنة (SSR + تخزين معطّل) — null حين لا توجد صورة */
export function loadAvatar(
  userId: string | number | null | undefined,
): string | null {
  if (userId == null || userId === "" || typeof window === "undefined") return null;
  try {
    return localStorage.getItem(avatarKeyFor(userId));
  } catch {
    return null;
  }
}

export function saveAvatar(userId: string | number, dataUrl: string): boolean {
  try {
    localStorage.setItem(avatarKeyFor(userId), dataUrl);
    return true;
  } catch {
    return false; // الحصة ممتلئة أو التخزين معطّل
  }
}

export function removeAvatarKey(userId: string | number): void {
  try {
    localStorage.removeItem(avatarKeyFor(userId));
  } catch {
    // المفتاح غير موجود أصلاً أو التخزين معطّل — لا شيء يُفعل
  }
}

export function notifyAvatarChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AVATAR_CHANGED_EVENT));
}

/**
 * رفع من الجهاز → قصّ مركزي مربع + تصغير (٦٤٠px / JPEG — حِدّة تكفي
 * خلفية البانر الممتدة ولا تُثقل التخزين المحلي ≈ ١٠٠KB).
 * يُعيد data URL جاهزاً للتخزين، أو يفشل برسالة:
 *   INVALID_TYPE / READ_FAILED / DECODE_FAILED
 */
export function processAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("INVALID_TYPE"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("DECODE_FAILED"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("DECODE_FAILED"));
          return;
        }
        // قصّ مركزي مربع ثم تصغير — حجم صغير يصلح للتخزين المحلي
        const side = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE,
        );
        resolve(canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * hook مشترك — يقرأ صورة المستخدم ويُحدّثها فوراً عند أي تغيير
 * من أي شاشة (حدث محلي) أو من تبويب آخر (حدث storage).
 * useSyncExternalStore بدل setState داخل effect — بلا انزلاق حالة
 * وبلا مخالفة قاعدة react-hooks/set-state-in-effect.
 */
function subscribeToAvatarChanges(onChange: () => void): () => void {
  window.addEventListener(AVATAR_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AVATAR_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAvatar(
  userId: string | number | null | undefined,
): string | null {
  return React.useSyncExternalStore(
    subscribeToAvatarChanges,
    () => loadAvatar(userId),
    () => null, // server snapshot — الشاشات تُعرض بعد جلسة مسجلة
  );
}
