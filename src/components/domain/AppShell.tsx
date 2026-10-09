'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface AppShellProps {
  children: React.ReactNode;
  isAdmin?: boolean;
  pageTitle?: string;
  userCredits?: number;
  userName?: string;
  userInitials?: string;
  density?: 'comfortable' | 'compact';
  className?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  isAdmin = false,
  pageTitle,
  userCredits,
  userName,
  userInitials,
  density = 'comfortable',
  className = '',
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div
      data-density={density}
      className={`min-h-screen bg-page flex flex-row ${className}`}
    >
      {/* Sidebar Frame */}
      <Sidebar
        isAdmin={isAdmin}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          isAdmin={isAdmin}
          pageTitle={pageTitle}
          userCredits={userCredits}
          userName={userName}
          userInitials={userInitials}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
