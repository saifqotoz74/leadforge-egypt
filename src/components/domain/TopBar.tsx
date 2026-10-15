'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, Bell, Settings, LogOut, CheckCircle2, ExternalLink } from 'lucide-react';
import { CreditChip } from './CreditChip';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { Button } from '@/components/ui/Button';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  type?: string;
  link?: string | null;
}

function formatRelativeTimeAr(dateInput: string | Date): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'الآن';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `منذ ${diffMin} د`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `منذ ${diffHours} س`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `منذ ${diffDays} ي`;
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

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
  userCredits,
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
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

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: n.id }),
        });
      } catch {
        // silent
      }
    }
    setIsNotifOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  // Light polling every 2 minutes for fresh unread badge
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.unreadCount ?? 0);
          if (isNotifOpen) {
            setNotifications(data.notifications || []);
          }
        }
      } catch {
        // silent
      }
    }, 120_000);

    return () => clearInterval(interval);
  }, [isNotifOpen]);

  const isAuthenticated = Boolean(userName || userEmail || userInitials);
  const displayName = userName || (isAuthenticated ? tCommon('defaultUser') : '');
  const displayInitials = userInitials || (displayName ? displayName.slice(0, 2).toUpperCase() : '');

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
        {/* CreditChip for authenticated developers only */}
        {isAuthenticated && !isAdmin && typeof userCredits === 'number' && (
          <CreditChip balance={userCredits} />
        )}

        {/* LanguageSwitcher per Spec 3.8 */}
        <LanguageSwitcher size="sm" />

        {/* Notifications Icon & Dropdown - authenticated only */}
        {isAuthenticated && (
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
              className="absolute end-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-line bg-surface shadow-md z-50 text-start overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-subtle">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-body-sm text-fg-primary">
                    {tCommon('notifications')}
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand text-xs font-semibold tabular-nums ltr-iso">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-caption text-brand hover:underline font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand rounded px-1"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-line">
                {isLoadingNotifs ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center text-fg-muted text-caption space-y-2">
                    <div className="w-5 h-5 border-2 border-line-brand rounded-full animate-spin" />
                    <p>جاري تحميل الإشعارات...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-8 px-4 flex flex-col items-center justify-center text-center">
                    <div className="h-10 w-10 rounded-full bg-brand-soft text-brand flex items-center justify-center mb-2">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <p className="text-body-sm font-semibold text-fg-primary">لا توجد إشعارات جديدة</p>
                    <p className="text-caption text-fg-muted mt-0.5">أنت على اطلاع تام بكافة التحديثات والفرص.</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full p-3.5 text-start transition-colors flex items-start gap-3 hover:bg-subtle focus-visible:outline-none focus-visible:bg-subtle ${
                        n.isRead ? 'bg-surface opacity-80' : 'bg-subtle'
                      }`}
                    >
                      <div className="shrink-0 mt-1.5">
                        {n.isRead ? (
                          <span className="w-2 h-2 rounded-full bg-transparent block" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-brand block shadow-xs" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`text-body-sm line-clamp-1 ${
                              n.isRead ? 'text-fg-secondary font-medium' : 'text-fg-primary font-semibold'
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="text-caption text-fg-muted shrink-0 tabular-nums ltr-iso">
                            {formatRelativeTimeAr(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-caption text-fg-secondary leading-relaxed line-clamp-2">
                          {n.message}
                        </p>
                        {n.link && (
                          <div className="mt-1.5 flex items-center gap-1 text-xs text-brand font-medium">
                            <span>عرض التفاصيل</span>
                            <ExternalLink className="w-3 h-3 rtl:-scale-x-100" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* User Menu Dropdown (authenticated) or Login/Register (unauthenticated) */}
        {isAuthenticated ? (
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
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="secondary" size="sm">
                {tNav('login')}
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="primary" size="sm">
                {tNav('register')}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

