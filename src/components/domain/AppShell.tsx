'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  } | null>(null);

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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

