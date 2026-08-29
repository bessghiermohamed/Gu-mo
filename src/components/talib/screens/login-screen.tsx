"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { LogIn, UserPlus, Loader2, GraduationCap, Mail, User, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { toast } from "sonner";

export function TalibLoginScreen() {
  const { t } = useI18n();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error(t("auth.errorMissingFields"));
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "signin"
          ? await signIn(fullName, email)
          : await signUp(fullName, email);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          mode === "signin" ? t("auth.loginSuccess") : t("auth.signupSuccess")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-background via-background to-muted/30">
      <div className="w-full max-w-md space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mb-2">
            <img src="/talib/icon.svg" alt="Talib" className="w-14 h-14" />
          </div>
          <h1 className="text-3xl font-black text-primary">
            {t("common.appName")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auth.loginSubtitle")}
          </p>
        </motion.div>

        <Card className="p-1.5 flex gap-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === "signin"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {t("auth.login")}
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === "signup"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {t("auth.signup")}
          </button>
        </Card>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="space-y-4"
        >
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-semibold">
                {t("auth.fullName")}
              </Label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("auth.fullNamePlaceholder")}
                  className="pr-10"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">
                {t("auth.email")}
              </Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="pr-10"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
              <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>
                {mode === "signin"
                  ? "لن يُطلب منك كلمة مرور. يكفي اسمك وبريدك للدخول، وسيتم تذكّر جهازك تلقائياً."
                  : "لن يُطلب منك رقم تسلسلي ولا كلمة مرور. سيُمنح لك رقمك التسلسلي تلقائياً بعد إنشاء الحساب."}
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t("common.loading")}
                </>
              ) : (
                <>
                  {mode === "signin" ? (
                    <LogIn className="w-4 h-4 ml-2" />
                  ) : (
                    <UserPlus className="w-4 h-4 ml-2" />
                  )}
                  {mode === "signin" ? t("auth.loginBtn") : t("auth.signupBtn")}
                </>
              )}
            </Button>
          </Card>
        </motion.form>

        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" />
          <span>طالب | Talib — رفيقك الأكاديمي</span>
        </div>
      </div>
    </div>
  );
}
