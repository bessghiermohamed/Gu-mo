"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  GraduationCap,
  Building2,
  BookOpen,
  Layers,
  Calendar,
  PartyPopper,
  Info,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { toast } from "sonner";

interface Props {
  onComplete: () => void;
  // round 36: change-path mode — re-run the flow from حسابي to switch the
  // user's institution/specialty/track/year at any time (any role, OWNER
  // included). onCancel returns to the profile without saving.
  mode?: "initial" | "change";
  onCancel?: () => void;
}

interface Institution {
  id: number;
  nameAr: string;
  city: string;
  type: string;
}
interface Specialty {
  id: number;
  nameAr: string;
  code: string;
  faculty: string;
}
interface AcademicYear {
  id: number;
  yearName: string;
}
interface AcademicTrack {
  id: number;
  trackNameAr: string;
  code: string;
}

export function TalibOnboardingScreen({ onComplete, mode = "initial", onCancel }: Props) {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const { dir } = useI18n();
  const isChange = mode === "change";

  const [step, setStep] = React.useState(0);
  // 6 steps: identity, institution, specialty, track, year, summary
  // (cohort selection removed — students get assigned later by representative)
  const totalSteps = 6;

  const [institutions, setInstitutions] = React.useState<Institution[]>([]);
  const [specialties, setSpecialties] = React.useState<Specialty[]>([]);
  const [tracks, setTracks] = React.useState<AcademicTrack[]>([]);
  const [years, setYears] = React.useState<AcademicYear[]>([]);

  // fix (R12-22, P0): every fetch failure used to render as an eternal
  // "جارٍ التحميل…" or an empty list — no retry, no logout, the flow was
  // PERMANENTLY stuck (the completion marker is localStorage, so even a
  // reload re-entered the same trap). Failures are now explicit states
  // with a retry button and a logout escape hatch.
  const [instState, setInstState] = React.useState<"loading" | "ok" | "error">("loading");
  const [instTick, setInstTick] = React.useState(0);
  const [specState, setSpecState] = React.useState<"loading" | "ok" | "error">("ok");
  const [specTick, setSpecTick] = React.useState(0);
  const [yearTrackState, setYearTrackState] = React.useState<"loading" | "ok" | "error">("ok");
  const [yearTrackTick, setYearTrackTick] = React.useState(0);

  const [selectedInstitution, setSelectedInstitution] = React.useState<number | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = React.useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);
  const [fullName, setFullName] = React.useState(user?.fullName ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");

  const [saving, setSaving] = React.useState(false);

  // round 36 (change mode): pre-select the user's CURRENT path so the flow
  // starts from where they are — every selection stays explicitly visible
  // and editable (the R12-11 no-silent-default rule is preserved: these are
  // the user's own saved values, restored once, never re-applied).
  // currentScope keeps the ORIGINAL ids for the "مسارك الحالي" hint;
  // preselectRef is consumed field-by-field as each list loads.
  const currentScopeRef = React.useRef<{
    institutionId: number | null; specialtyId: number | null;
    trackId: number | null; yearId: number | null;
  } | null>(
    mode === "change"
      ? {
          institutionId: user?.scopeInstitutionId ?? null,
          specialtyId: user?.scopeSpecialtyId ?? user?.assignedSpecialtyId ?? null,
          trackId: user?.scopeTrackId ?? null,
          yearId: user?.scopeAcademicYearId ?? null,
        }
      : null
  );
  const preselectRef = React.useRef(
    currentScopeRef.current ? { ...currentScopeRef.current } : null
  );

  // round 36 (change mode): resolve the CURRENT path's display names for the
  // hint banner — /api/profile/details returns all six names in both branches.
  const [currentPath, setCurrentPath] = React.useState<{
    institution: string; specialtyName: string; trackName: string; yearName: string;
  } | null>(null);
  React.useEffect(() => {
    if (mode !== "change") return;
    let alive = true;
    fetch("/api/profile/details", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (alive && data.profile) setCurrentPath(data.profile); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mode]);

  React.useEffect(() => {
    let alive = true;
    setInstState("loading");
    fetch("/api/onboarding/institutions")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setInstitutions(data.institutions ?? []);
        // round 36: restore the current institution once (change mode)
        const wanted = preselectRef.current?.institutionId ?? null;
        if (wanted != null && (data.institutions ?? []).some((i: Institution) => i.id === wanted)) {
          setSelectedInstitution(wanted);
        }
        if (preselectRef.current) preselectRef.current.institutionId = null;
        setInstState("ok");
      })
      .catch(() => alive && setInstState("error"));
    return () => { alive = false; };
  }, [instTick]);

  React.useEffect(() => {
    if (!selectedInstitution) return;
    let alive = true;
    setSpecState("loading");
    setSelectedSpecialty(null); // fix (R12-11): no silent default — must TAP
    fetch(`/api/onboarding/specialties?institutionId=${selectedInstitution}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setSpecialties(data.specialties ?? []);
        // round 36: restore the current specialty once (change mode)
        const wanted = preselectRef.current?.specialtyId ?? null;
        if (wanted != null && (data.specialties ?? []).some((s: Specialty) => s.id === wanted)) {
          setSelectedSpecialty(wanted);
        }
        if (preselectRef.current) preselectRef.current.specialtyId = null;
        setSpecState("ok");
      })
      .catch(() => alive && setSpecState("error"));
    return () => { alive = false; };
  }, [selectedInstitution, specTick]);

  React.useEffect(() => {
    if (!selectedSpecialty) return;
    let alive = true;
    setYearTrackState("loading");
    // fix (R12-11): the first year/track of the DB listing used to be
    // silently pre-selected — identity-critical decisions landed in the
    // wrong scope by DB row order. Selection is now EXPLICIT.
    setSelectedYear(null);
    setSelectedTrack(null);
    Promise.all([
      fetch(`/api/onboarding/years?specialtyId=${selectedSpecialty}`).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`/api/onboarding/tracks?specialtyId=${selectedSpecialty}`).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([yearsData, tracksData]) => {
        if (!alive) return;
        setYears(yearsData.years ?? []);
        setTracks(tracksData.tracks ?? []);
        // round 36: restore the current year + track once (change mode) —
        // only if they still exist under the freshly loaded lists
        const wantedYear = preselectRef.current?.yearId ?? null;
        if (wantedYear != null && (yearsData.years ?? []).some((y: AcademicYear) => y.id === wantedYear)) {
          setSelectedYear(wantedYear);
        }
        const wantedTrack = preselectRef.current?.trackId ?? null;
        if (wantedTrack != null && (tracksData.tracks ?? []).some((tr: AcademicTrack) => tr.id === wantedTrack)) {
          setSelectedTrack(wantedTrack);
        }
        if (preselectRef.current) { preselectRef.current.yearId = null; preselectRef.current.trackId = null; }
        setYearTrackState("ok");
      })
      .catch(() => {
        if (!alive) return;
        setYears([]);
        setTracks([]);
        setYearTrackState("error");
      });
    return () => { alive = false; };
  }, [selectedSpecialty, yearTrackTick]);

  function canProceed() {
    switch (step) {
      case 0:
        return fullName.trim().length > 0 && email.trim().length > 0;
      case 1:
        return selectedInstitution !== null;
      case 2:
        return selectedSpecialty !== null;
      case 3:
        // fix: a specialty with NO tracks used to trap the user forever —
        // the next button required a selection that could never be made.
        // Track is now optional when the specialty defines none.
        return tracks.length === 0 || selectedTrack !== null;
      case 4:
        return selectedYear !== null;
      case 5:
        return true;
      default:
        return false;
    }
  }

  async function handleFinish() {
    if (!user) {
      toast.error("يجب تسجيل الدخول أولاً");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          institutionId: selectedInstitution,
          specialtyId: selectedSpecialty,
          trackId: selectedTrack,
          academicYearId: selectedYear,
          // No cohortId — student gets assigned later by representative (matches new Android behavior)
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل حفظ البيانات");
        return;
      }

      onComplete();
    } catch {
      toast.error("خطأ في الشبكة");
    } finally {
      setSaving(false);
    }
  }

  const next = () => setStep((s) => Math.min(s + 1, totalSteps - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/30 px-4 py-6">
      <div className="max-w-2xl mx-auto w-full mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("onboarding.step")} {step + 1} {t("onboarding.of")} {totalSteps}
          </span>
          {/* fix (R12-22): escape hatch — a user trapped in onboarding by a
              persistent network failure can always log out and retry later.
              round 36: in change mode the escape is a CANCEL (back to حسابي,
              nothing saved) — logging out would make no sense here. */}
          {isChange ? (
            <button
              onClick={() => onCancel?.()}
              className="text-xs text-muted-foreground hover:text-red-600 underline underline-offset-4"
            >
              إلغاء والعودة إلى حسابي
            </button>
          ) : (
            <button
              onClick={() => signOut()}
              className="text-xs text-muted-foreground hover:text-red-600 underline underline-offset-4"
            >
              تسجيل الخروج
            </button>
          )}
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{
              width: `${((step + 1) / totalSteps) * 100}%`,
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
        {/* round 36: change-mode hint — the user's CURRENT path is always
            visible so the swap is an informed decision, not a blind redo. */}
        {isChange && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-0.5">
              أنت غيّر مسارك الأكاديمي — مسارك الحالي:
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {[
                currentPath?.institution,
                currentPath?.specialtyName,
                currentPath?.trackName,
                currentPath?.yearName,
              ].filter(Boolean).join(" • ") || "غير محدد بعد"}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: dir === "rtl" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <StepCard
                icon={<GraduationCap className="w-8 h-8 text-primary" />}
                title={t("onboarding.step1Title")}
                subtitle={t("onboarding.welcomeSubtitle")}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t("auth.fullNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("auth.emailPlaceholder")}
                    />
                  </div>
                </div>
              </StepCard>
            )}

            {step === 1 && (
              <StepCard
                icon={<Building2 className="w-8 h-8 text-primary" />}
                title={t("onboarding.step2Title")}
                subtitle={t("onboarding.selectInstitution")}
              >
                <div className="space-y-2">
                  {instState === "loading" && (
                    <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("common.loading")}
                    </p>
                  )}
                  {instState === "error" && (
                    <div className="text-center py-8">
                      <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                      <p className="text-sm font-bold mb-1">تعذّر تحميل قائمة المؤسسات</p>
                      <p className="text-xs text-muted-foreground mb-3">تحقق من اتصالك بالإنترنت ثم أعد المحاولة.</p>
                      <Button variant="outline" size="sm" onClick={() => setInstTick((n) => n + 1)}>
                        <RefreshCw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
                      </Button>
                    </div>
                  )}
                  {instState === "ok" && institutions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      لا توجد مؤسسات مسجّلة بعد — تواصل مع إدارة المنصة.
                    </p>
                  )}
                  {instState === "ok" && institutions.length > 0 && (
                    institutions.map((inst) => (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => setSelectedInstitution(inst.id)}
                        className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                          selectedInstitution === inst.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm">{inst.nameAr}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {inst.type} • {inst.city}
                            </div>
                          </div>
                          {selectedInstitution === inst.id && (
                            <Check className="w-4 h-4 text-primary shrink-0" aria-label="مُحدد" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </StepCard>
            )}

            {step === 2 && (
              <StepCard
                icon={<BookOpen className="w-8 h-8 text-primary" />}
                title={t("onboarding.step3Title")}
                subtitle={t("onboarding.selectSpecialty")}
              >
                <div className="space-y-2">
                  {specState === "loading" && (
                    <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("common.loading")}
                    </p>
                  )}
                  {specState === "error" && (
                    <div className="text-center py-8">
                      <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                      <p className="text-sm font-bold mb-1">تعذّر تحميل قائمة التخصصات</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setSpecTick((n) => n + 1)}>
                        <RefreshCw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
                      </Button>
                    </div>
                  )}
                  {specState === "ok" && specialties.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t("common.noData")}
                    </p>
                  )}
                  {specState === "ok" && specialties.length > 0 && (
                    specialties.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setSelectedSpecialty(sp.id)}
                        className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                          selectedSpecialty === sp.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm">{sp.nameAr}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {sp.faculty} • {sp.code}
                            </div>
                          </div>
                          {selectedSpecialty === sp.id && (
                            <Check className="w-4 h-4 text-primary shrink-0" aria-label="مُحدد" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </StepCard>
            )}

            {step === 3 && (
              <StepCard
                icon={<Layers className="w-8 h-8 text-primary" />}
                title={t("onboarding.step4Title")}
                subtitle={t("onboarding.selectTrack")}
              >
                <div className="space-y-2">
                  {tracks.length === 0 ? (
                    yearTrackState === "error" ? (
                      <div className="text-center py-8">
                        <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                        <p className="text-sm font-bold mb-1">تعذّر تحميل الملامح</p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => setYearTrackTick((n) => n + 1)}>
                          <RefreshCw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
                        </Button>
                      </div>
                    ) : yearTrackState === "loading" ? (
                      <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("common.loading")}
                      </p>
                    ) : (
                      <div className="rounded-lg bg-muted/40 border border-dashed p-4 text-center">
                        <p className="text-sm font-bold">هذا التخصص بلا ملامح</p>
                        <p className="text-xs text-muted-foreground mt-1">يمكنك المتابعة مباشرة — اضغط «التالي».</p>
                      </div>
                    )
                  ) : (
                    tracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => setSelectedTrack(track.id)}
                        className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                          selectedTrack === track.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm">{track.trackNameAr}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {track.code}
                            </div>
                          </div>
                          {selectedTrack === track.id && (
                            <Check className="w-4 h-4 text-primary shrink-0" aria-label="مُحدد" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </StepCard>
            )}

            {step === 4 && (
              <StepCard
                icon={<Calendar className="w-8 h-8 text-primary" />}
                title={t("onboarding.step5Title")}
                subtitle={t("onboarding.selectYear")}
              >
                <div className="space-y-3">
                  {yearTrackState === "loading" && (
                    <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("common.loading")}
                    </p>
                  )}
                  {yearTrackState === "error" && (
                    <div className="text-center py-8">
                      <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                      <p className="text-sm font-bold mb-1">تعذّر تحميل السنوات الدراسية</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setYearTrackTick((n) => n + 1)}>
                        <RefreshCw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
                      </Button>
                    </div>
                  )}
                  {yearTrackState === "ok" && years.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      لا توجد سنوات دراسية معرّفة لهذا التخصص — تواصل مع المشرف.
                    </p>
                  )}
                  {yearTrackState === "ok" && years.length > 0 && (
                    <>
                  <div className="grid grid-cols-2 gap-2">
                    {years.map((y) => (
                      <button
                        key={y.id}
                        type="button"
                        onClick={() => setSelectedYear(y.id)}
                        className={`p-3 rounded-xl border-2 transition-all text-sm font-bold flex items-center justify-between gap-2 ${
                          selectedYear === y.id
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <span>{y.yearName}</span>
                        {selectedYear === y.id && <Check className="w-4 h-4 shrink-0" aria-label="مُحدد" />}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p>
                      ملاحظة: لا يُختار الفوج عند التسجيل. ستبقى بحالة "بلا فوج"
                      وترى محتوى تخصصك الكامل، حتى يُضيفك ممثل الفوج أو المشرف
                      لفوجه يدوياً.
                    </p>
                  </div>
                    </>
                  )}
                </div>
              </StepCard>
            )}

            {step === 5 && (
              <StepCard
                icon={<PartyPopper className="w-8 h-8 text-primary" />}
                title={t("onboarding.step6Title")}
                subtitle={t("onboarding.summary")}
              >
                <div className="space-y-3">
                  <SummaryRow label={t("auth.fullName")} value={fullName} />
                  <SummaryRow label={t("auth.email")} value={email} />
                  <SummaryRow
                    label={t("onboarding.selectInstitution")}
                    value={
                      institutions.find((i) => i.id === selectedInstitution)
                        ?.nameAr ?? "—"
                    }
                  />
                  <SummaryRow
                    label={t("onboarding.selectSpecialty")}
                    value={
                      specialties.find((s) => s.id === selectedSpecialty)
                        ?.nameAr ?? "—"
                    }
                  />
                  <SummaryRow
                    label={t("onboarding.selectTrack")}
                    value={
                      tracks.find((t) => t.id === selectedTrack)?.trackNameAr ??
                      "—"
                    }
                  />
                  <SummaryRow
                    label={t("onboarding.selectYear")}
                    value={
                      years.find((y) => y.id === selectedYear)?.yearName ?? "—"
                    }
                  />
                  <SummaryRow
                    label="الفوج"
                    value={
                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                        بلا فوج (قيد الإلحاق من المشرف)
                      </span>
                    }
                  />
                </div>
              </StepCard>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="max-w-2xl mx-auto w-full mt-6 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={prev}
          disabled={step === 0}
          className="min-w-24"
        >
          {dir === "rtl" ? (
            <ChevronRight className="w-4 h-4 ml-1" />
          ) : (
            <ChevronLeft className="w-4 h-4 mr-1" />
          )}
          {t("common.previous")}
        </Button>

        {step < totalSteps - 1 ? (
          <Button onClick={next} disabled={!canProceed()} className="min-w-24">
            {t("common.next")}
            {dir === "rtl" ? (
              <ChevronLeft className="w-4 h-4 mr-1" />
            ) : (
              <ChevronRight className="w-4 h-4 ml-1" />
            )}
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            disabled={!canProceed() || saving}
            className="min-w-24"
          >
            <Check className="w-4 h-4 ml-1" />
            {isChange ? "حفظ المسار الجديد" : t("onboarding.finish")}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-end">{value || "—"}</span>
    </div>
  );
}
