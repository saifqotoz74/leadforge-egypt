'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Compass, CreditCard, LogIn, UserPlus } from 'lucide-react';

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              LeadForge <span className="text-emerald-600">Egypt</span>
            </span>
            <p className="text-xs text-slate-500">فرص مبيعات مؤهلة لمطوري المواقع</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-700 hover:text-emerald-600"
          >
            الرئيسية
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-emerald-600"
          >
            <CreditCard className="h-4 w-4" />
            الباقات والأسعار
          </Link>
          <Link
            href="/leads"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-emerald-600"
          >
            <Compass className="h-4 w-4" />
            استكشاف الفرص
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
