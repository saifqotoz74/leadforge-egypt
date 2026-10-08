import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        {children}
      </body>
    </html>
  );
}
