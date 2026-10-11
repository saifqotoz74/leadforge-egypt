'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BrandWordmark } from '@/components/ui/BrandWordmark';
import {
  LayoutDashboard,
  Compass,
  Kanban,
  CreditCard,
  Settings,
  ShieldAlert,
  Database,
  CopyCheck,
  CheckCircle2,
  Sliders,
  Scale,
  Globe2,
  Users2,
  Package,
  FileSpreadsheet,
  BarChart3,
  LogOut,
  X,
} from 'lucide-react';

export interface SidebarProps {
  isAdmin?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  userName?: string;
  userEmail?: string;
  userInitials?: string;
  onLogout?: () => void | Promise<void>;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isAdmin = false,
  isOpen = false,
  onClose,
  userName,
  userEmail,
  userInitials,
  onLogout,
  className = '',
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');

  const displayName = userName || tCommon('defaultUser');
  const displayInitials = userInitials || displayName.slice(0, 2).toUpperCase();

  const handleLogoutClick = async () => {
    if (onClose) onClose();
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

  const developerNavGroups = [
    {
      items: [
        { href: '/dashboard', label: tNav('dashboard'), icon: LayoutDashboard },
        { href: '/leads', label: tNav('exploreLeads'), icon: Compass },
        { href: '/my-leads', label: tNav('pipeline'), icon: Kanban },
      ],
    },
    {
      title: tNav('settings'),
      items: [
        { href: '/subscription', label: tNav('credits'), icon: CreditCard },
        { href: '/settings', label: tNav('settings'), icon: Settings },
      ],
    },
  ];

  const adminNavGroups = [
    {
      items: [
        { href: '/admin', label: tNav('adminOverview'), icon: ShieldAlert },
        { href: '/admin/leads', label: tNav('adminLeads'), icon: Database },
        { href: '/admin/duplicates', label: tNav('adminDuplicates'), icon: CopyCheck },
        { href: '/admin/quality', label: tNav('adminQuality'), icon: CheckCircle2 },
      ],
    },
    {
      title: tNav('adminEngines'),
      items: [
        { href: '/admin/matching', label: tNav('adminMatching'), icon: Sliders },
        { href: '/admin/rules', label: tNav('adminRules'), icon: Scale },
        { href: '/admin/sources', label: tNav('adminSources'), icon: Globe2 },
      ],
    },
    {
      title: tNav('adminManagement'),
      items: [
        { href: '/admin/users', label: tNav('adminUsers'), icon: Users2 },
        { href: '/admin/plans', label: tNav('adminPlans'), icon: Package },
        { href: '/admin/reports', label: tNav('adminReports'), icon: FileSpreadsheet },
        { href: '/admin/analytics', label: tNav('adminAnalytics'), icon: BarChart3 },
      ],
    },
  ];

  const navGroups = isAdmin ? adminNavGroups : developerNavGroups;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-overlay lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 start-0 z-50 w-64 border-e border-line bg-surface transition-transform duration-300 ease-in-out flex flex-col lg:static lg:translate-x-0 ${
          isOpen
            ? 'translate-x-0 visible'
            : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full max-lg:invisible max-lg:pointer-events-none'
        } ${className}`}
      >
        {/* Wordmark Header per Spec 7.16: 64px high */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <BrandWordmark size="md" href={isAdmin ? '/admin' : '/dashboard'} />
            {isAdmin && (
              <span className="px-1.5 py-0.5 rounded text-caption font-medium bg-subtle text-fg-secondary border border-line">
                {tNav('admin')}
              </span>
            )}
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-fg-muted hover:text-fg-primary lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={tCommon('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="flex flex-col gap-1">
              {group.title && (
                <span className="px-3 mb-1 text-caption font-medium text-fg-muted">
                  {group.title}
                </span>
              )}

              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`h-nav px-3 rounded-md flex items-center gap-3 text-label transition-colors font-medium ${
                      isActive
                        ? 'bg-brand-soft text-fg-brand font-semibold'
                        : 'text-fg-secondary hover:bg-subtle hover:text-fg-primary'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom User Section (Desktop Sidebar & Mobile Drawer) */}
        <div className="border-t border-line p-4 shrink-0 flex flex-col gap-2 bg-surface">
          <div className="flex items-center gap-3 px-2 py-1">
            <div
              className="h-9 w-9 shrink-0 rounded-full bg-brand-soft text-brand flex items-center justify-center font-semibold text-caption select-none border border-line-brand"
              aria-hidden="true"
            >
              <bdi dir="auto">{displayInitials}</bdi>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-fg-primary break-words">
                <bdi dir="auto">{displayName}</bdi>
              </p>
              {userEmail && (
                <p className="text-caption text-fg-secondary break-all">
                  <span className="ltr-iso">{userEmail}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 pt-1 border-t border-line">
            <Link
              href="/settings"
              onClick={onClose}
              className={`h-9 px-3 rounded-md flex items-center gap-2.5 text-body-sm font-medium transition-colors ${
                pathname === '/settings'
                  ? 'bg-brand-soft text-fg-brand font-semibold'
                  : 'text-fg-secondary hover:bg-subtle hover:text-fg-primary'
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{tNav('settings')}</span>
            </Link>

            <button
              type="button"
              onClick={handleLogoutClick}
              className="h-9 px-3 rounded-md flex items-center gap-2.5 text-body-sm font-medium text-danger-text hover:bg-danger-bg transition-colors w-full text-start"
            >
              <LogOut className="h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              <span>{tNav('logout')}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

