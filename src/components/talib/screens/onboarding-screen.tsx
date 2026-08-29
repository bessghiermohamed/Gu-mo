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
  Users,
  PartyPopper,
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
interface Cohort {
  id: number;
  groupName: string;
  subGroup: string;
}

const TRACKS = [
  "أستاذ التعليم الابتدائي",
  "أستاذ التعليم المتوسط",
  "أستاذ التعليم الثانوي",
  "أستاذ مساعد",
] as const;

export function TalibOnboardingScreen({ onComplete }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dir } = useI18n();

  const [step, setStep] = React.useState(0);
  const totalSteps = 6;

  const [institutions, setInstitutions] = React.useState<Institution[]>([]);
  const [specialties, setSpecialties] = React.useState<Specialty[]>([]);
  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [cohorts, setCohorts] = React.useState<Cohort[]>([]);

  const [selectedInstitution, setSelectedInstitution] = React.useState<number | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = React.useState<number | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);
  const [selectedCohort, setSelectedCohort] = React.useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = React.useState<string>(TRACKS[0]);
  const [fullName, setFullName] = React.useState(user?.fullName ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");

  const [saving, setSaving] = React.useState(false);

  // Fetch institutions
  React.useEffect(() => {
    fetch("/api/onboarding/institutions")
      .then((r) => r.json())
      .then((data) => setInstitutions(data.institutions ?? []))
      .catch(() => setInstitutions([]));
  }, []);

  // Fetch specialties when institution changes
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

  // Fetch years when specialty changes
  React.useEffect(() => {
    if (!selectedSpecialty) return;
    fetch(`/api/onboarding/years?specialtyId=${selectedSpecialty}`)
      .then((r) => r.json())
      .then((data) => {
        setYears(data.years ?? []);
        if (data.years?.length > 0) {
          setSelectedYear(data.years[0].id);
        }
      })
      .catch(() => setYears([]));
  }, [selectedSpecialty]);

  // Fetch cohorts when year changes
  React.useEffect(() => {
    if (!selectedSpecialty || !selectedYear) return;
    fetch(
      `/api/onboarding/cohorts?specialtyId=${selectedSpecialty}&academicYearId=${selectedYear}`
    )
      .then((r) => r.json())
      .then((data) => {
        setCohorts(data.cohorts ?? []);
        if (data.cohorts?.length > 0) {
          setSelectedCohort(data.cohorts[0].id);
        }
      })
      .catch(() => setCohorts([]));
  }, [selectedSpecialty, selectedYear]);

  function canProceed() {
    switch (step) {
      case 0:
        return fullName.trim().length > 0 && email.trim().length > 0;
      case 1:
        return selectedInstitution !== null;
      case 2:
        return selectedSpecialty !== null;
      case 3:
        return selectedTrack.length > 0;
      case 4:
        return selectedYear !== null && selectedCohort !== null;
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
          academicYearId: selectedYear,
          cohortId: selectedCohort,
          track: selectedTrack,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل حفظ البيانات");
        return;
      }

      onComplete();
    } catch (e) {
      toast.error("خطأ في الشبكة");
    } finally {
      setSaving(false);
    }
  }

  const next = () => setStep((s) => Math.min(s + 1, totalSteps - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/30 px-4 py-6">
      {/* Progress indicator */}
      <div className="max-w-2xl mx-auto w-full mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("onboarding.step")} {step + 1} {t("onboarding.of")} {totalSteps}
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round(((step + 1) / totalSteps) * 100)}%
          </span>
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
                        <div className="font-bold text-sm">{inst.nameAr}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {inst.type} • {inst.city}
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
                        <div className="font-bold text-sm">{sp.nameAr}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {sp.faculty} • {sp.code}
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
                  {TRACKS.map((track) => (
                    <button
                      key={track}
                      type="button"
                      onClick={() => setSelectedTrack(track)}
                      className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                        selectedTrack === track
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="font-bold text-sm">{track}</div>
                    </button>
                  ))}
                </div>
              </StepCard>
            )}

            {step === 4 && (
              <StepCard
                icon={<Calendar className="w-8 h-8 text-primary" />}
                title={t("onboarding.step5Title")}
                subtitle={t("onboarding.selectYear") + " + " + t("onboarding.selectGroup")}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("onboarding.selectYear")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {years.map((y) => (
                        <button
                          key={y.id}
                          type="button"
                          onClick={() => setSelectedYear(y.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-sm font-bold ${
                            selectedYear === y.id
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {y.yearName}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("onboarding.selectGroup")}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {cohorts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCohort(c.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-sm font-bold ${
                            selectedCohort === c.id
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {c.groupName}
                        </button>
                      ))}
                    </div>
                    {cohorts.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        لا توجد أفواج متاحة لهذه السنة. تواصل مع الإدارة لإضافة فوج.
                      </p>
                    )}
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
                    value={institutions.find((i) => i.id === selectedInstitution)?.nameAr ?? "-"}
                  />
                  <SummaryRow
                    label={t("onboarding.selectSpecialty")}
                    value={specialties.find((s) => s.id === selectedSpecialty)?.nameAr ?? "-"}
                  />
                  <SummaryRow label={t("onboarding.selectTrack")} value={selectedTrack} />
                  <SummaryRow
                    label={t("onboarding.selectYear")}
                    value={years.find((y) => y.id === selectedYear)?.yearName ?? "-"}
                  />
                  <SummaryRow
                    label={t("onboarding.selectGroup")}
                    value={cohorts.find((c) => c.id === selectedCohort)?.groupName ?? "-"}
                  />
                </div>
              </StepCard>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-end">{value || "—"}</span>
    </div>
  );
}
