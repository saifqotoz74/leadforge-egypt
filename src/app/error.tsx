'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xs text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger-icon">
          <AlertCircle className="h-6 w-6" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-fg-primary">
            حدث خطأ غير متوقع
          </h2>
          <p className="text-body-sm text-fg-secondary">
            نعتذر، واجه النظام خطأ أثناء معالجة الطلب. يمكنك إعادة المحاولة أو العودة للرئيسية.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => reset()}
            className="w-full sm:w-auto gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t('retry')}</span>
          </Button>

          <Link href="/" className="w-full sm:w-auto">
            <Button variant="secondary" size="md" className="w-full gap-1.5">
              <Home className="h-4 w-4" />
              <span>{t('back')}</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
