'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter } from '@/components/domain';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { BrandWordmark } from '@/components/ui/BrandWordmark';
import { LogIn, KeyRound, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function LoginPage() {
  const router = useRouter();
  const tAuth = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(tAuth('emptyCredentials'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || tAuth('loginError'));
      } else {
        if (data.user?.role === 'ADMIN') {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
      }
    } catch {
      setError(tAuth('networkError'));
    } finally {
      setLoading(false);
    }
  }

  function fillDemoDeveloper() {
    setEmail('dev@leadforge.eg');
    setPassword('Dev@12345');
    setError(null);
  }

  function fillDemoAdmin() {
    setEmail('admin@leadforge.eg');
    setPassword('Admin@12345');
    setError(null);
  }

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        {/* Template T1 Auth: Centered card 440px, radius-xl (24px via rounded-xl), padding 32, on --bg-page */}
        <div className="w-full max-w-auth rounded-xl border border-line bg-surface p-8 shadow-xs">
          {/* Wordmark Block */}
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <BrandWordmark size="xl" href="/" />
            <h1 className="text-h2 font-bold text-fg-primary">
              {tAuth('loginTitle')}
            </h1>
            <p className="text-body-sm text-fg-secondary">
              {tAuth('welcomeBack')}{' '}
              <span className="font-semibold text-fg-primary ltr-iso" dir="ltr">LeadForge</span>
            </p>
          </div>

          {/* Quick Demo Credentials Box */}
          <div className="mb-6 rounded-xl border border-line bg-subtle p-3.5">
            <p className="text-caption font-semibold text-fg-primary">
              {tAuth('demoAccountsTitle')}:
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={fillDemoDeveloper}
                className="w-full text-caption gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5 text-brand shrink-0" />
                <span>{tAuth('demoDeveloper')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={fillDemoAdmin}
                className="w-full text-caption gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5 text-brand shrink-0" />
                <span>{tAuth('demoAdmin')}</span>
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-6">
              <Banner variant="danger">{error}</Banner>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label={tAuth('emailLabel')}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              dir="ltr"
              className="text-start"
            />

            <Input
              label={tAuth('passwordLabel')}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
              className="text-start"
            />

            <div className="flex justify-end -mt-1">
              <Link
                href="/forgot-password"
                className="text-caption text-brand hover:underline"
              >
                {tAuth('forgotPassword')}
              </Link>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={loading}
                className="w-full"
              >
                <LogIn className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
                <span>{tAuth('submitLogin')}</span>
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-center">
            <p className="text-body-sm text-fg-secondary">
              {tAuth('noAccount')}{' '}
              <Link
                href="/register"
                className="font-semibold text-brand hover:underline"
              >
                {tAuth('goToRegister')}
              </Link>
            </p>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
