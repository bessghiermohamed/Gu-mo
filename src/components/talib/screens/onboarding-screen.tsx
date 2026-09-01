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

export function TalibOnboardingScreen({ onComplete }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dir } = useI18n();

  const [step, setStep] = React.useState(0);
  // 6 steps: identity, institution, specialty, track, year, summary
  // (cohort selection removed — students get assigned later by representative)
  const totalSteps = 6;

  const [institutions, setInstitutions] = React.useState<Institution[]>([]);
  const [specialties, setSpecialties] = React.useState<Specialty[]>([]);
  const [tracks, setTracks] = React.useState<AcademicTrack[]>([]);
  const [years, setYears] = React.useState<AcademicYear[]>([]);

  const [selectedInstitution, setSelectedInstitution] = React.useState<number | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = React.useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);
  const [fullName, setFullName] = React.useState(user?.fullName ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");

  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/onboarding/institutions")
      .then((r) => r.json())
      .then((data) => setInstitutions(data.institutions ?? []))
      .catch(() => setInstitutions([]));
  }, []);

  React.useEffect(() => {
    if (!selectedInstitution) return;
    fetch(`/api/onboarding/specialties?institutionId=${selectedInstitution}`)
      .then((r) => r.json())
      .then((data) => {
        setSpecialties(data.specialties ?? []);
        if (data.specialties?.length > 0) {
          setSelectedSpecialty(data.specialties[0].id);
        }
      })
      .catch(() => setSpecialties([]));
  }, [selectedInstitution]);

  React.useEffect(() => {
    if (!selectedSpecialty) return;
    Promise.all([
      fetch(`/api/onboarding/years?specialtyId=${selectedSpecialty}`).then((r) => r.json()),
      fetch(`/api/onboarding/tracks?specialtyId=${selectedSpecialty}`).then((r) => r.json()),
    ])
      .then(([yearsData, tracksData]) => {
        setYears(yearsData.years ?? []);
        setTracks(tracksData.tracks ?? []);
        if (yearsData.years?.length > 0) setSelectedYear(yearsData.years[0].id);
        if (tracksData.tracks?.length > 0) setSelectedTrack(tracksData.tracks[0].id);
      })
      .catch(() => {
        setYears([]);
        setTracks([]);
      });
  }, [selectedSpecialty]);

  function canProceed() {
    switch (step) {
      case 0:
        return fullName.trim().length > 0 && email.trim().length > 0;
      case 1:
        return selectedInstitution !== null;
      case 2:
        return selectedSpecialty !== null;
      case 3:
        return selectedTrack !== null;
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
          {/* fix L-1 (round 4): raw technical percentages (83%, 100%) removed —
              the "step X of 6" counter above is the user-friendly indicator. */}
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
                  {institutions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t("common.loading")}
                    </p>
                  ) : (
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
                  {specialties.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t("common.noData")}
                    </p>
                  ) : (
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
                    <p className="text-sm text-muted-foreground text-center py-8">
                      لا توجد ملامح متاحة لهذا التخصص
                    </p>
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
            {t("onboarding.finish")}
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
