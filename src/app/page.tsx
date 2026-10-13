import React from 'react';
import Link from 'next/link';
import { PublicNavbar } from '@/components/PublicNavbar';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Target,
  Filter,
  Star,
  Globe,
  Phone,
  Lock,
  ArrowLeft,
  Sliders,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>منصة فرص مبيعات مؤهلة 100% بالقواعد القياسية (Rule-Based Qualification)</span>
              </div>

              <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
                لا تبحث في قوائم عشوائية.. احصل على{' '}
                <span className="text-emerald-600">فرص بيع مؤهلة</span> لتطوير المواقع في مصر
              </h1>

              <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
                تساعد <strong>LeadForge Egypt</strong> مطوري الويب المستقلين (Freelancers) وشركات
                البرمجة الصغيرة في مصر على الوصول الفوري للأنشطة التجارية الحقيقية التي تفتقر لموقع
                إلكتروني أو تمتلك مواقع قديمة تحتاج لتطوير، مع تواجد اجتماعي نشط وتقييمات قوية.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  <span>ابدأ مجانًا (3 فرص هدية)</span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <span>تجربة الحسابات التجريبية (Demo)</span>
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-6 text-center sm:text-right">
                <div>
                  <span className="block text-2xl font-extrabold text-slate-900">+50</span>
                  <span className="text-xs font-semibold text-slate-500">
                    نشاط تجاري مؤهل في قاعدة البيانات
                  </span>
                </div>
                <div>
                  <span className="block text-2xl font-extrabold text-emerald-600">10 قواعد</span>
                  <span className="text-xs font-semibold text-slate-500">
                    تقييم وفحص فني شفاف لكل عميل
                  </span>
                </div>
                <div>
                  <span className="block text-2xl font-extrabold text-slate-900">10 محافظات</span>
                  <span className="text-xs font-semibold text-slate-500">
                    القاهرة، الجيزة، الإسكندرية، الدلتا والمزيد
                  </span>
                </div>
              </div>
            </div>

            {/* Live Sample Qualification Card */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-800">
                      HOT — 91/100
                    </span>
                    <h3 className="mt-2 text-xl font-extrabold text-slate-900">
                      ABC Dental Clinic — عيادة دار الأسنان
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      القاهرة • عيادات الأسنان (Dental Clinic)
                    </p>
                  </div>
                  <div className="text-left">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      4.7 (320 تقييم)
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 text-xs">
                  <div>
                    <span className="text-slate-400">الموقع الإلكتروني:</span>
                    <p className="mt-0.5 flex items-center gap-1 font-bold text-rose-600">
                      <XCircle className="h-4 w-4" />
                      غير متوفر (No website)
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">رقم الهاتف:</span>
                    <p className="mt-0.5 flex items-center gap-1 font-bold text-emerald-700">
                      <Phone className="h-4 w-4" />✓ متاح وموثق
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">فيسبوك (Facebook):</span>
                    <p className="mt-0.5 font-bold text-blue-600">✓ متاح ونشط</p>
                  </div>
                  <div>
                    <span className="text-slate-400">إنستجرام (Instagram):</span>
                    <p className="mt-0.5 font-bold text-pink-600">✓ متاح ونشط</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-extrabold text-slate-800">
                    لماذا حصل هذا العميل على 91/100؟ (Qualification):
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs font-semibold text-slate-700">
                    <li className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        لا يمتلك موقعًا إلكترونيًا (No website detected)
                      </span>
                      <span className="font-extrabold text-emerald-700">+30</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        نشاط تجاري موثق وموجود فعليًا (Business verified)
                      </span>
                      <span className="font-extrabold text-emerald-700">+20</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        تواجد اجتماعي نشط على فيسبوك وإنستجرام
                      </span>
                      <span className="font-extrabold text-emerald-700">+20</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        رقم الهاتف متاح + تقييمات جوجل مرتفعة (320)
                      </span>
                      <span className="font-extrabold text-emerald-700">+21</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars Section */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
              كيف نحول البيانات الخام إلى فرص مبيعات جاهزة للتعاقد؟
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              جميع عمليات الفحص، منع التكرار، التقييم، والمطابقة تتم عبر محركات قواعد قياسية دقيقة
              (Deterministic Rule Engines) بدون أي تخمين عشوائي.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Sliders className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">
                محرك تقييم قياسي (Scoring Engine)
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                تقييم كل نشاط من 100 نقطة بناءً على 10 شروط قابلة للتعديل، مع توضيح تفصيلي لسبب
                حصول العميل على كل نقطة.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">
                فاحص المواقع الفني (Website Analyzer)
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                يفحص حالة HTTP، شهادة HTTPS/SSL، توافق الهواتف (Mobile Viewport)، سرعة الاستجابة،
                والبنية البرمجية لاكتشاف المواقع القديمة التي تحتاج إعادة تصميم.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">
                محرك مطابقة المطورين (Matching Engine)
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                حدد خدماتك، المدن المستهدفة، التخصصات (عيادات، مطاعم، عقارات)، والحد الأدنى
                للميزانية ليظهر لك العملاء المطابقون لملفك.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">
                فرص حصرية أو مشتركة (Ownership)
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                اختر بين الفرص المشتركة بحد أقصى للمشترين أو الفرص الحصرية (Exclusive Leads) التي
                تُباع لمطور واحد فقط وتُغلق فورًا.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-slate-500">
            © {new Date().getFullYear()} LeadForge Egypt — منصة فرص مبيعات تطوير المواقع في مصر.
          </p>
          <div className="flex gap-6 text-xs font-bold text-slate-600">
            <Link href="/pricing" className="hover:text-emerald-600">
              الأسعار والباقات
            </Link>
            <Link href="/login" className="hover:text-emerald-600">
              تسجيل الدخول
            </Link>
            <Link href="/register" className="hover:text-emerald-600">
              إنشاء حساب مطور
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
