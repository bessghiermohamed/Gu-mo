"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * round 56 — «إشعارات خارج المتصفح» 4th-session pre-prompt.
 *
 * The owner asked: notifications outside the browser should be either
 * enabled automatically (handled in pushBoot when permission is already
 * granted) or asked for «في الجلسة الرابعة». This card is that ask: a
 * DESIGNED explanation card (never the raw browser dialog as a first
 * impression) that appears once the session counter reaches 4 — the
 * first three sessions stay clean for onboarding + the mandatory tour.
 *
 * «ليس الآن» is remembered forever (the toggle in الإعدادات stays the
 * way back); «تفعيل الإشعارات» triggers the real browser permission ask
 * from a user gesture (as required by browsers).
 */
interface Props {
  open: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}

export function TalibPushPermissionPrompt({ open, onActivate, onDismiss }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* non-blocking dim — taps pass through via pointer-events-none */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/25 pointer-events-none"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-labelledby="push-prompt-title"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[71] flex justify-center px-4 pb-4"
          >
            <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="push-prompt-title" className="font-black text-sm">
                    لا تفوّت نتيجة تبليغك أو إعلاناً مهماً
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    بإذنٍ واحد تصلك الإشعارات خارج المتصفح — حتى والتطبيق غير
                    مفتوح — مثل بقية تطبيقاتك. حلّ التبليغ الذي أرسلته،
                    الإعلانات الجديدة، ومواعيد الاختبارات.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="إغلاق"
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-10 font-bold"
                  onClick={onActivate}
                >
                  <BellRing className="w-4 h-4 ml-1" />
                  تفعيل الإشعارات
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 px-4 text-muted-foreground"
                  onClick={onDismiss}
                >
                  ليس الآن
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
