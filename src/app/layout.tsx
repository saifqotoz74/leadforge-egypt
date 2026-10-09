import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LeadForge Egypt | منصة الفرص البيعية المؤهلة لمطوري المواقع في مصر',
  description:
    'منصة SaaS احترافية لمطوري الويب وشركات البرمجة في مصر للحصول على عملاء محتملين مؤهلين (Qualified Web Development Leads) بنظام تقييم ومطابقة قياسي.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${sans.variable} ${mono.variable}`}
      data-density="comfortable"
    >
      <body>{children}</body>
    </html>
  );
}
