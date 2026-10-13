'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, Bell, Settings, LogOut } from 'lucide-react';
import { CreditChip } from './CreditChip';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export interface TopBarProps {
  onToggleSidebar?: () => void;
  pageTitle?: string;
  userCredits?: number;
  userInitials?: string;
  userName?: string;
  userEmail?: string;
  notificationCount?: number;
  isAdmin?: boolean;
  onLogout?: () => void | Promise<void>;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  pageTitle,
  userCredits = 150,
  userInitials,
  userName,
  userEmail,
  notificationCount = 0,
  isAdmin = false,
  onLogout,
  className = '',
}) => {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(notificationCount);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; message: string; createdAt: string; isRead: boolean }>
  >([]);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUnreadCount(notificationCount);
  }, [notificationCount]);

  useEffect(() => {
    if (!isNotifOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotifOpen]);

  const handleToggleNotifs = async () => {
    const nextState = !isNotifOpen;
    setIsNotifOpen(nextState);
    if (nextState) {
      setIsLoadingNotifs(true);
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch {
        // silent fallback
      } finally {
        setIsLoadingNotifs(false);
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // silent
    }
  };

  const displayName = userName || tCommon('defaultUser');
  const displayInitials = userInitials || displayName.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleLogoutClick = async () => {
    setIsMenuOpen(false);
    if (onLogout) {
      await onLogout();
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <header
      className={`h-16 border-b border-line bg-surface px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 ${className}`}
    >
      {/* Inline-Start: Menu Button (mobile) & Title */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 -ms-2 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-subtle lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand min-h-11 min-w-11 flex items-center justify-center"
            aria-label={tCommon('menu')}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {pageTitle && (
          <h2 className="text-body font-semibold text-fg-primary truncate hidden sm:block" title={pageTitle}> {/* design-allow: truncate */}
            {pageTitle}
          </h2>
        )}
      </div>

      {/* Inline-End: CreditChip (developers), LanguageSwitcher, Notifications, User Menu */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-2 lg:gap-4">
        {/* CreditChip for developers only per Spec 7.16 */}
        {!isAdmin && typeof userCredits === 'number' && (
          <CreditChip balance={userCredits} />
        )}

        {/* LanguageSwitcher per Spec 3.8 */}
        <LanguageSwitcher size="sm" />

        {/* Notifications Icon & Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={handleToggleNotifs}
            className="relative p-2 rounded-full text-fg-secondary hover:text-fg-primary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand min-h-11 min-w-11 flex items-center justify-center"
            aria-label={`${tCommon('notifications')} (${unreadCount})`}
            aria-expanded={isNotifOpen}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2.5 end-2.5 h-2 w-2 rounded-full bg-danger-fill" />
            )}
          </button>

          {isNotifOpen && (
            <div
              className="absolute end-0 top-full mt-2 w-80 sm:w-96 rounded-lg border border-line bg-surface p-3 shadow-lg z-50 text-start"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                <span className="font-semibold text-body-sm text-fg-primary">
                  {tCommon('notifications')}
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-caption text-brand hover:underline font-medium"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {isLoadingNotifs ? (
                  <div className="py-6 text-center text-fg-muted text-caption">جاري التحميل...</div>
                ) : notifications.length === 0 ? (
                  <div className="py-6 text-center text-fg-muted text-caption">لا توجد إشعارات حالياً</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-2 rounded-md text-caption transition-colors ${
                        n.isRead ? 'bg-surface text-fg-secondary' : 'bg-brand-soft/40 text-fg-primary font-medium'
                      }`}
                    >
                      <div className="font-semibold text-fg-primary mb-0.5">{n.title}</div>
                      <div className="text-fg-secondary text-caption leading-relaxed">{n.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="h-10 w-10 sm:h-9 sm:w-9 rounded-full bg-brand-soft text-brand flex items-center justify-center font-semibold text-caption select-none border border-line-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title={displayName}
            aria-label={tNav('userMenu')}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
          >
            <bdi dir="auto">{displayInitials}</bdi>
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              aria-label={tNav('userMenu')}
              className="absolute end-0 top-full mt-2 w-60 rounded-lg border border-line bg-surface p-1.5 shadow-md z-50"
            >
              <div className="px-3 py-2 border-b border-line mb-1">
                <p className="text-body-sm font-semibold text-fg-primary break-words">
                  <bdi dir="auto">{displayName}</bdi>
                </p>
                {userEmail && (
                  <p className="text-caption text-fg-secondary break-all mt-0.5">
                    <span className="ltr-iso">{userEmail}</span>
                  </p>
                )}
              </div>

              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-body-sm font-medium text-fg-secondary hover:bg-subtle hover:text-fg-primary transition-colors"
              >
                <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{tNav('settings')}</span>
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={handleLogoutClick}
                className="flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-body-sm font-medium text-danger-text hover:bg-danger-bg transition-colors text-start"
              >
                <LogOut className="h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                <span>{tNav('logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

