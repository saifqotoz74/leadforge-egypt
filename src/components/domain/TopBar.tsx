import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { CreditChip } from './CreditChip';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export interface TopBarProps {
  onToggleSidebar?: () => void;
  pageTitle?: string;
  userCredits?: number;
  userInitials?: string;
  userName?: string;
  notificationCount?: number;
  isAdmin?: boolean;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  pageTitle,
  userCredits = 150,
  userInitials = 'م س',
  userName = 'محمد سلام',
  notificationCount = 0,
  isAdmin = false,
  className = '',
}) => {
  return (
    <header
      className={`h-16 border-b border-line bg-surface px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 ${className}`}
    >
      {/* Inline-Start: Menu Button (mobile) & Title */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 -ms-2 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-subtle lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="فتح القائمة الجانبية"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {pageTitle && (
          <h2 className="text-body font-semibold text-fg-primary truncate hidden sm:block">
            {pageTitle}
          </h2>
        )}
      </div>

      {/* Inline-End: CreditChip (developers), Notifications, Avatar */}
      <div className="flex items-center gap-3">
        {/* CreditChip for developers only per Spec 7.16 */}
        {!isAdmin && typeof userCredits === 'number' && (
          <CreditChip balance={userCredits} />
        )}

        {/* LanguageSwitcher per Spec 3.8 */}
        <LanguageSwitcher size="sm" />

        {/* Notifications Icon */}
        <button
          type="button"
          className="relative p-2 rounded-full text-fg-secondary hover:text-fg-primary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`التنبيهات (${notificationCount})`}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-danger-fill" />
          )}
        </button>

        {/* Avatar circle 36px, bg-brand-soft, text-brand */}
        <div
          className="h-9 w-9 rounded-full bg-brand-soft text-brand flex items-center justify-center font-semibold text-caption select-none border border-line-brand"
          title={userName}
          role="img"
          aria-label={userName}
        >
          {userInitials}
        </div>
      </div>
    </header>
  );
};
