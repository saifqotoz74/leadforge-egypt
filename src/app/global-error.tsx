'use client';

import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-subtle flex items-center justify-center p-4 font-sans antialiased text-fg-primary">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xs text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger-icon">
            <AlertCircle className="h-6 w-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-fg-primary">
              حدث خطأ غير متوقع في النظام
            </h2>
            <p className="text-body-sm text-fg-secondary">
              نعتذر، واجهت المنصة خطأ تقنياً غير متوقع. يرجى إعادة المحاولة.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-fg-on-brand font-medium text-body-sm hover:bg-brand-hover transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
