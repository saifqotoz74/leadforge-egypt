'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, Compass, CreditCard, LogIn, UserPlus } from 'lucide-react';

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b12]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 text-[#071018] shadow-[0_0_24px_rgba(52,211,153,.28)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-white">
              LeadForge <span className="text-emerald-300">Egypt</span>
            </span>
            <p className="text-xs text-slate-500">ذكاء مبيعات عملي للسوق المصري</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-300 hover:text-emerald-300"
          >
            الرئيسية
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-emerald-300"
          >
            <CreditCard className="h-4 w-4" />
            الباقات والأسعار
          </Link>
          <Link
            href="/leads"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-emerald-300"
          >
            <Compass className="h-4 w-4" />
            استكشاف الفرص
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[.08]"
          >
            <LogIn className="h-4 w-4" />
            تسجيل الدخول
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <UserPlus className="h-4 w-4" />
            حساب مطور جديد
          </Link>
        </div>
      </div>
    </header>
  );
}
