'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface AppShellProps {
  children: React.ReactNode;
  isAdmin?: boolean;
  pageTitle?: string;
  isTopLevel?: boolean;
  userCredits?: number;
  userName?: string;
  userEmail?: string;
  userInitials?: string;
  notificationCount?: number;
  density?: 'comfortable' | 'compact';
  className?: string;
}

function computeInitials(name?: string, email?: string): string {
  const source = (name || email || '').trim();
  if (!source) return 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]} ${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  isAdmin = false,
  pageTitle,
  isTopLevel = false,
  userCredits,
  userName,
  userEmail,
  userInitials,
  notificationCount,
  density = 'comfortable',
  className = '',
}) => {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<{
    name?: string;
    email?: string;
    credits?: number;
    unreadNotifications?: number;
    emailVerified?: string | Date | null;
  } | null>(null);

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleSendVerificationEmail = async () => {
    setResendingVerification(true);
    try {
      const res = await fetch('/api/auth/verify-email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setResendSent(true);
        setResendCooldown(60);
      } else if (res.status === 429 && data.retryAfterSeconds) {
        setResendCooldown(data.retryAfterSeconds);
      }
    } catch {
      // Ignored in offline/preview
    } finally {
      setResendingVerification(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        if (active && data?.user) {
          setSessionUser({
            name: data.user.name,
            email: data.user.email,
            credits: data.user.subscription?.credits,
            unreadNotifications: data.user.unreadNotifications,
            emailVerified: data.user.emailVerified,
          });
        }
      } catch {
        // Ignore in unauthenticated or static preview contexts
      }
    }
    loadUser();
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  const isAuth = Boolean(userName || userEmail || sessionUser);
  const resolvedName = userName || sessionUser?.name || (isAuth ? tCommon('defaultUser') : '');
  const resolvedEmail = userEmail || sessionUser?.email || '';
  const resolvedInitials =
    userInitials || (isAuth ? computeInitials(sessionUser?.name || userName, resolvedEmail) : undefined);
  const resolvedCredits =
    typeof userCredits === 'number'
      ? userCredits
      : typeof sessionUser?.credits === 'number'
      ? sessionUser.credits
      : undefined;
  const resolvedNotifications =
    typeof notificationCount === 'number'
      ? notificationCount
      : sessionUser?.unreadNotifications ?? 0;

  return (
    <div
      data-density={density}
      className={`min-h-screen bg-page flex flex-row overflow-x-hidden ${className}`}
    >
      {/* Sidebar Frame */}
      <Sidebar
        isAdmin={isAdmin}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        userName={resolvedName}
        userEmail={resolvedEmail}
        userInitials={resolvedInitials}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          isAdmin={isAdmin}
          pageTitle={isTopLevel ? undefined : pageTitle}
          userCredits={resolvedCredits}
          userName={resolvedName}
          userEmail={resolvedEmail}
          userInitials={resolvedInitials}
          notificationCount={resolvedNotifications}
          onLogout={handleLogout}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        {sessionUser && sessionUser.emailVerified === null && !bannerDismissed && (
          <div className="bg-warning-bg border-b border-warning-border px-4 py-2.5 text-body-sm text-warning-text flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning-icon shrink-0" />
              <span>
                {tCommon('emailBannerUnverified')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSendVerificationEmail}
                disabled={resendingVerification || resendCooldown > 0}
                className="text-caption font-semibold text-brand hover:underline disabled:opacity-60 cursor-pointer"
              >
                {resendCooldown > 0 ? (
                  <span className="ltr-iso tabular-nums">
                    {tCommon('resendCooldownAction', { seconds: resendCooldown })}
                  </span>
                ) : resendSent ? (
                  tCommon('resendSuccessAction')
                ) : (
                  tCommon('resendVerificationAction')
                )}
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="text-caption text-fg-muted hover:text-fg-primary ps-2 cursor-pointer"
                aria-label={tCommon('closeBannerAria')}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

