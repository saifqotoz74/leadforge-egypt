'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter } from '@/components/domain';
import { BrandWordmark } from '@/components/ui/BrandWordmark';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import {
  CheckCircle2,
  AlertCircle,
  Mail,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tVerify = useTranslations('verifyEmail');

  const [verifying, setVerifying] = useState(Boolean(token));
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Resend state
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Auto-verify when token is in URL
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }

    let isMounted = true;
    async function executeVerification() {
      setVerifying(true);
      setErrorMsg(null);
      setErrorCode(null);

      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (isMounted) {
          if (res.ok) {
            setSuccess(true);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('leadforge:user-updated'));
            }
          } else {
            setSuccess(false);
            setErrorMsg(data.error || tVerify('errorFallback'));
            setErrorCode(data.code || 'VERIFICATION_FAILED');
          }
        }
      } catch {
        if (isMounted) {
          setSuccess(false);
          setErrorMsg(tVerify('networkError'));
          setErrorCode('NETWORK_ERROR');
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    }

    executeVerification();
    return () => {
      isMounted = false;
    };
  }, [token, tVerify]);

  // Handle countdown timer for resend
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/verify-email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendSuccess(true);
        setCooldownSeconds(60);
      } else if (res.status === 429 && data.retryAfterSeconds) {
        setCooldownSeconds(data.retryAfterSeconds);
      } else {
        setErrorMsg(data.error || tVerify('resendFailed'));
      }
    } catch {
      setErrorMsg(tVerify('networkError'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-8 shadow-xs text-start">
      <div className="flex flex-col items-center text-center gap-3 mb-6">
        <BrandWordmark size="xl" href="/" />
      </div>

      {verifying && (
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <Spinner size="lg" className="text-brand" />
          <h2 className="text-h3 font-semibold text-fg-primary">
            {tVerify('verifyingTitle')}
          </h2>
          <p className="text-body-sm text-fg-secondary">
            {tVerify('verifyingDesc')}
          </p>
        </div>
      )}

      {!verifying && success && (
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div className="h-16 w-16 rounded-full bg-brand-soft flex items-center justify-center text-brand border border-line-brand">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>

          <h2 className="text-h2 font-bold text-fg-primary">
            {tVerify('successTitle')}
          </h2>

          <p className="text-body text-fg-secondary">
            {tVerify('successDesc')}
          </p>

          <div className="w-full pt-4 space-y-3">
            <Link href="/leads" className="w-full">
              <Button variant="primary" size="lg" fullWidth className="gap-2">
                <span>{tVerify('exploreLeadsCta')}</span>
                <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
              </Button>
            </Link>

            <Link href="/dashboard" className="w-full block">
              <Button variant="secondary" size="md" fullWidth>
                <span>{tVerify('goToDashboardCta')}</span>
              </Button>
            </Link>
          </div>
        </div>
      )}

      {!verifying && !success && (
        <div className="space-y-6">
          {errorMsg && (
            <div className="p-4 rounded-xl border border-danger-border bg-danger-bg text-danger-text text-body-sm flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-danger-icon shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{tVerify('errorTitle')}</p>
                <p className="text-caption text-danger-text mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {!token && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="h-14 w-14 rounded-full bg-subtle flex items-center justify-center text-brand border border-line">
                <Mail className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="text-h2 font-bold text-fg-primary">
                {tVerify('requiredTitle')}
              </h2>
              <p className="text-body-sm text-fg-secondary">
                {tVerify('requiredDesc')}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-line bg-subtle p-5 space-y-4">
            <h3 className="text-body font-semibold text-fg-primary">
              {tVerify('requestNewLinkTitle')}
            </h3>
            <p className="text-caption text-fg-secondary">
              {tVerify('requestNewLinkDesc')}
            </p>

            {resendSuccess ? (
              <div className="p-3.5 rounded-lg border border-line-brand bg-brand-soft text-brand text-body-sm flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-brand shrink-0" />
                <span>{tVerify('resendSuccess')}</span>
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                <Input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder={tVerify('resendPlaceholder')}
                  dir="ltr"
                  className="text-start"
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  fullWidth
                  isLoading={resendLoading}
                  disabled={cooldownSeconds > 0}
                >
                  {cooldownSeconds > 0 ? (
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span className="ltr-iso tabular-nums">
                        {tVerify('resendCooldown', { seconds: cooldownSeconds })}
                      </span>
                    </span>
                  ) : (
                    <span>{tVerify('resendAction')}</span>
                  )}
                </Button>
              </form>
            )}
          </div>

          <div className="text-center pt-2">
            <Link href="/leads" className="text-caption text-brand hover:underline">
              {tVerify('backToLeads')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-12">
              <Spinner size="lg" className="text-brand" />
            </div>
          }
        >
          <VerifyEmailContent />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
}
