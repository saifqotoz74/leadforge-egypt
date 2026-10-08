'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Compass,
  Briefcase,
  CreditCard,
  Settings,
  ShieldCheck,
  Bell,
  LogOut,
  Menu,
  X,
  Users,
  Database,
  Sliders,
  BarChart3,
  Layers,
  Coins,
  CheckCheck,
} from 'lucide-react';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: 'DEVELOPER' | 'ADMIN';
  subscription?: {
    credits: number;
    totalCreditsGranted: number;
    plan?: {
      name: string;
      nameEn: string;
    };
  };
  unreadNotifications?: number;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

export function AppShell({
  children,
  isAdminView = false,
}: {
  children: React.ReactNode;
  isAdminView?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (mounted) {
          setUser(data.user);
          setUnreadCount(data.user?.unreadNotifications || 0);
          if (isAdminView && data.user?.role !== 'ADMIN') {
            router.push('/dashboard');
          }
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoadingUser(false);
      }
    }
    loadUser();
    const handleRefreshUser = () => {
      loadUser();
    };
    window.addEventListener('leadforge:user-updated', handleRefreshUser);
    return () => {
      mounted = false;
      window.removeEventListener('leadforge:user-updated', handleRefreshUser);
    };
  }, [isAdminView, router]);

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // ignore
    }
  }

  async function markAllNotificationsRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const developerNav = [
    { href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { href: '/leads', label: 'اكتشف العملاء المحتملين', icon: Compass },
    { href: '/my-leads', label: 'عملائي ومتابعة الصفقات', icon: Briefcase },
    { href: '/subscription', label: 'الاشتراك والرصيد', icon: CreditCard },
    { href: '/settings', label: 'إعدادات المطابقة والحساب', icon: Settings },
  ];

  const adminNav = [
    { href: '/admin', label: 'نظرة عامة (Overview)', icon: LayoutDashboard },
    { href: '/admin/leads', label: 'إدارة العملاء والاستيراد', icon: Briefcase },
    { href: '/admin/quality', label: 'جودة البيانات والتحقق (Quality)', icon: CheckCheck },
    { href: '/admin/duplicates', label: 'مراجعة التكرارات والدمج', icon: ShieldCheck },
    { href: '/admin/matching', label: 'محرك المطابقة والمصحح (Matching)', icon: Compass },
    { href: '/admin/users', label: 'إدارة المطورين والمشتركين', icon: Users },
    { href: '/admin/sources', label: 'مصادر البيانات (Sources)', icon: Database },
    { href: '/admin/rules', label: 'قواعد التقييم (Scoring Rules)', icon: Sliders },
    { href: '/admin/plans', label: 'إدارة الباقات والأسعار', icon: Layers },
    { href: '/admin/reports', label: 'التقارير والإحصائيات', icon: BarChart3 },
  ];

  const navItems = isAdminView ? adminNav : developerNav;

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-600">جاري تحميل مساحة العمل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar Desktop */}
      <aside className="hidden w-72 flex-col border-l border-slate-200 bg-slate-900 text-slate-100 lg:flex">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
          <Link href={isAdminView ? '/admin' : '/dashboard'} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="text-base font-extrabold text-white">LeadForge Egypt</span>
              <span className="block text-xs text-emerald-400">
                {isAdminView ? 'لوحة تحكم الإدارة (Admin)' : 'بوابة مطوري المواقع'}
              </span>
            </div>
          </Link>
        </div>

        {/* Credits Card for Developer */}
        {!isAdminView && user?.subscription && (
          <div className="mx-4 mt-4 rounded-xl border border-slate-800 bg-slate-800/70 p-4">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <Coins className="h-4 w-4 text-amber-400" />
                رصيد النقاط المتاح
              </span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">
                {user.subscription.plan?.nameEn || 'Free'}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-white">
                {user.subscription.credits}
              </span>
              <span className="text-xs text-slate-400">
                / {user.subscription.totalCreditsGranted} نقطة (Lead)
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (user.subscription.credits /
                        Math.max(1, user.subscription.totalCreditsGranted)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1.5 px-3 py-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/admin' &&
                item.href !== '/dashboard' &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {user?.role === 'ADMIN' && (
            <div className="pt-4 mt-4 border-t border-slate-800">
              <Link
                href={isAdminView ? '/dashboard' : '/admin'}
                className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-4 py-3 text-xs font-bold text-amber-300 hover:bg-slate-800"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>
                  {isAdminView
                    ? 'الانتقال إلى واجهة المطور (Developer)'
                    : 'الانتقال إلى لوحة الإدارة (Admin)'}
                </span>
              </Link>
            </div>
          )}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <div className="truncate">
              <p className="truncate text-sm font-bold text-white">{user?.name}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-rose-600 hover:border-rose-600 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h1 className="text-base font-bold text-slate-800 sm:text-lg">
              {navItems.find((i) => i.href === pathname)?.label || 'LeadForge Egypt'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {!isAdminView && user?.subscription && (
              <Link
                href="/subscription"
                className="hidden items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 sm:flex"
              >
                <Coins className="h-4 w-4 text-emerald-600" />
                <span>الرصيد: {user.subscription.credits} نقطة</span>
              </Link>
            )}

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  const nextOpen = !notifOpen;
                  setNotifOpen(nextOpen);
                  if (nextOpen) loadNotifications();
                }}
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                aria-label="الإشعارات"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <span className="text-sm font-bold text-slate-800">الإشعارات والتنبيهات</span>
                    <button
                      onClick={markAllNotificationsRead}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      تعليم الكل كمقروء
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-slate-500">
                        لا توجد إشعارات حاليًا.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 text-xs ${
                            n.isRead ? 'bg-white' : 'bg-emerald-50/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{n.title}</span>
                            {!n.isRead && (
                              <span className="h-2 w-2 rounded-full bg-emerald-600" />
                            )}
                          </div>
                          <p className="mt-1 text-slate-600 leading-relaxed">{n.message}</p>
                          {n.link && (
                            <Link
                              href={n.link}
                              onClick={() => setNotifOpen(false)}
                              className="mt-1.5 inline-block font-semibold text-emerald-600 hover:underline"
                            >
                              عرض التفاصيل ←
                            </Link>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-slate-900 p-4 text-white lg:hidden">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-rose-400 hover:bg-slate-800"
              >
                <LogOut className="h-5 w-5" />
                <span>تسجيل الخروج</span>
              </button>
            </nav>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
