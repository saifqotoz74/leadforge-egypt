'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar, PublicFooter } from '@/components/domain';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import {
  ALL_CITIES,
  DEVELOPER_SERVICES,
} from '@/lib/constants';
import { ShieldCheck, UserPlus, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function RegisterPage() {
  const router = useRouter();
  const tAuth = useTranslations('auth');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<string[]>(['Website Development']);
  const [locations, setLocations] = useState<string[]>(['القاهرة', 'الجيزة']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleItem(list: string[], item: string, setter: (val: string[]) => void) {
    if (list.includes(item)) {
      if (list.length > 1) setter(list.filter((x) => x !== item));
    } else {
      setter([...list, item]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError(tAuth('emptyCredentials'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          companyName: companyName.trim() || undefined,
          phone: phone.trim() || undefined,
          services,
          locations,
          niches: ['Dental', 'Medical', 'Restaurant'],
          leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
          minBudget: 5000,
          leadType: 'BOTH',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || tAuth('networkError'));
      } else {
        router.push('/onboarding');
      }
    } catch {
      setError(tAuth('networkError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        {/* Template T1 Auth / Register: Centered card max-w-auth (520px), radius-xl (rounded-xl), padding 32, on --bg-page */}
        <div className="w-full max-w-auth rounded-xl border border-line bg-surface p-8 shadow-xs">
          {/* Wordmark Block */}
          <div className="flex flex-col items-center text-center gap-2 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-fg-inverted shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-h2 font-bold text-fg-primary">
              {tAuth('registerTitle')}
            </h1>
            <p className="text-body-sm text-fg-secondary">
              {tAuth('registerSubtitleLead')}
            </p>
          </div>

          {error && (
            <div className="mb-6">
              <Banner variant="danger">{error}</Banner>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={tAuth('nameLabel')}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أحمد محمد"
              />

              <Input
                label={`${tAuth('companyLabel')} (${tAuth('optional')})`}
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="استوديو البرمجة"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={tAuth('emailLabel')}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmed@example.com"
                dir="ltr"
                className="text-start"
              />

              <Input
                label={`${tAuth('phoneLabel')} (${tAuth('optional')})`}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                dir="ltr"
                className="text-start"
              />
            </div>

            <Input
              label={tAuth('passwordLabel')}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
              className="text-start"
              helperText={tAuth('passwordHelper')}
            />

            {/* Quick Service Selection */}
            <div className="flex flex-col gap-2 pt-1">
              <label className="text-label text-fg-primary">
                {tAuth('servicesTitle')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DEVELOPER_SERVICES.slice(0, 5).map((service) => {
                  const selected = services.includes(service.value);
                  return (
                    <button
                      key={service.value}
                      type="button"
                      onClick={() => toggleItem(services, service.value, setServices)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                        selected
                          ? 'border-brand bg-brand-soft text-brand font-semibold'
                          : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span>{service.labelAr}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Location Selection */}
            <div className="flex flex-col gap-2 pt-1">
              <label className="text-label text-fg-primary">
                {tAuth('locationsTitle')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CITIES.slice(0, 6).map((city) => {
                  const selected = locations.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggleItem(locations, city, setLocations)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-medium border transition-colors ${
                        selected
                          ? 'border-brand bg-brand-soft text-brand font-semibold'
                          : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span>{city}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={loading}
                className="w-full"
              >
                <UserPlus className="h-4 w-4 me-2 rtl:-scale-x-100" />
                <span>{tAuth('submitRegisterAndContinue')}</span>
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-center">
            <p className="text-body-sm text-fg-secondary">
              {tAuth('haveAccount')}{' '}
              <Link
                href="/login"
                className="font-semibold text-brand hover:underline"
              >
                {tAuth('goToLogin')}
              </Link>
            </p>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
