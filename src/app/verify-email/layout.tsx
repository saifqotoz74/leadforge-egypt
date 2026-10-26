import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'تأكيد البريد الإلكتروني | LeadForge Egypt',
  robots: {
    index: false,
    follow: false,
  },
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
