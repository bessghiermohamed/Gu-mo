"use client";

/**
 * شارة الرُتبة (round 92, owner request): شعار + اسم رُتبة كالألعاب +
 * رقم النقاط، تظهر بجانب اسم الطالب في قسم الفوج، وتتغير تلقائياً مع
 * تقدّم نقاط نشاطه المحسوبة على جهازه (انظر lib/gamification).
 *
 * تعليمات المالك الصريحة: «لا حاجة لكتابة شرح لهذه الميزة للطالب» —
 * لذلك الشارة صامتة تماماً: لا فقرة، لا تلميح، لا tooltip يشرح النقاط.
 * الخصوصية: القراءة من localStorage فقط، بلا أي طلب شبكة.
 */

import * as React from "react";
import {
  BookOpen,
  Crown,
  Medal,
  Sprout,
  Star,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  computeActivity,
  rankFor,
  type ActivitySnapshot,
  type RankIconName,
} from "@/lib/gamification";

/** تحويل الاسم الرمزي في lib/gamification إلى أيقونة lucide */
const RANK_ICONS: Record<RankIconName, LucideIcon> = {
  sprout: Sprout,
  book: BookOpen,
  zap: Zap,
  medal: Medal,
  star: Star,
  trophy: Trophy,
  crown: Crown,
};

/** لقطة النشاط بعد الإقلاع — null قبل الـ effect فيتفق رسم الخادم مع أول
 *  رسم للعميل (نمط التسوية المؤجلة نفسه المستعمل في بقية التطبيق، بلا
 *  كتابة حالة متزامنة داخل الـ effect). */
export function useActivityRank(): ActivitySnapshot | null {
  const [snap, setSnap] = React.useState<ActivitySnapshot | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setSnap(computeActivity()), 0);
    return () => clearTimeout(t);
  }, []);
  return snap;
}

/** الشارة الصامتة: شعار الرُتبة + اسمها + عدد النقاط — لا شيء غير ذلك */
export function RankBadge({
  snap,
  compact = false,
}: {
  snap: ActivitySnapshot;
  compact?: boolean;
}) {
  const rank = rankFor(snap.points);
  const Icon = RANK_ICONS[rank.icon];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold shrink-0 ${rank.chip} ${
        compact ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-xs"
      }`}
    >
      <Icon aria-hidden="true" className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {rank.name}
      <span className="font-black tabular-nums opacity-60" dir="ltr">
        {snap.points}
      </span>
    </span>
  );
}
