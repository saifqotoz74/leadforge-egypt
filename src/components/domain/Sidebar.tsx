'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  X,
} from 'lucide-react';

export interface SidebarProps {
  isAdmin?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isAdmin = false,
  isOpen = false,
  onClose,
  className = '',
}) => {
  const pathname = usePathname();
  const tNav = useTranslations('nav');

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
          className="fixed inset-0 z-40 bg-inverse/50 lg:hidden transition-opacity"
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
          <Link
            href={isAdmin ? '/admin' : '/dashboard'}
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            <span className="font-bold text-xl text-fg-primary tracking-tight">
              LeadForge
            </span>
            {isAdmin && (
              <span className="px-1.5 py-0.5 rounded text-caption font-medium bg-subtle text-fg-secondary border border-line">
                {tNav('admin')}
              </span>
            )}
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-fg-muted hover:text-fg-primary lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="إغلاق القائمة"
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
      </aside>
    </>
  );
};
