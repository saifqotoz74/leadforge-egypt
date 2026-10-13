import Link from 'next/link';
import { PublicNavbar } from '@/components/PublicNavbar';
import { ArrowLeft, ArrowUpLeft, BarChart3, CheckCircle2, Clock3, Database, Radar, Sparkles, Target, Zap } from 'lucide-react';

const signals = [
  { label: 'بدون موقع إلكتروني', value: '+30', color: 'text-emerald-300' },
  { label: 'نشاط اجتماعي مستمر', value: '+22', color: 'text-cyan-300' },
  { label: 'تقييم موثوق 4.7 / 5', value: '+18', color: 'text-amber-300' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#070b12] text-slate-100">
      <PublicNavbar />
      <main>
        <section className="relative border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 grid-glow opacity-60" />
          <div className="pointer-events-none absolute -right-32 top-12 size-96 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute left-0 top-64 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3.5 py-2 text-xs font-bold text-emerald-200">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-300" /></span>
                محرك الذكاء التجاري يعمل الآن في مصر
              </div>
              <h1 className="text-4xl font-extrabold leading-[1.25] tracking-tight sm:text-6xl">
                <span className="text-gradient">اعرف العميل المناسب</span><br /> قبل أن يبحث عنك.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
                LeadForge يحوّل إشارات السوق المبعثرة إلى فرص تطوير مواقع حقيقية، مرتبة حسب احتمالية الشراء، مع سبب واضح لكل توصية.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-5 py-3.5 text-sm font-extrabold text-[#071018] shadow-[0_0_30px_rgba(110,231,183,.18)] transition hover:bg-emerald-200">
                  ابدأ مجانًا <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link href="/leads" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.04] px-5 py-3.5 text-sm font-bold text-slate-200 transition hover:bg-white/[.08]">
                  شاهد الفرص الحقيقية <ArrowUpLeft className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs text-slate-500">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> لا بطاقة ائتمانية</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> بيانات موثقة</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> إلغاء في أي وقت</span>
              </div>
            </div>

            <div className="relative lg:mr-auto lg:w-full lg:max-w-[520px]">
              <div className="absolute -inset-5 rounded-[2rem] bg-emerald-300/10 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0d141e]/95 shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div className="flex items-center gap-2"><Radar className="h-4 w-4 text-emerald-300" /><span className="text-xs font-bold text-slate-300">لوحة إشارات السوق</span></div>
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-300" /> مباشر</span>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex items-end justify-between"><div><p className="text-xs text-slate-500">فرص مطابقة لك اليوم</p><p className="mt-1 text-4xl font-extrabold text-white">128</p></div><div className="rounded-lg bg-emerald-300/10 px-2.5 py-1.5 text-xs font-bold text-emerald-300">+18.4% هذا الأسبوع</div></div>
                  <div className="mt-7 flex h-24 items-end gap-2 border-b border-white/10 px-1">
                    {[32, 45, 38, 60, 52, 74, 68, 92, 80, 100, 88, 112].map((height, index) => <div key={index} className="flex-1 rounded-t bg-gradient-to-t from-emerald-400/25 to-cyan-300" style={{ height: `${height / 1.2}%`, opacity: index < 3 ? 0.45 : 0.9 }} />)}
                  </div>
                  <div className="mt-6 rounded-xl border border-emerald-300/15 bg-emerald-300/[.06] p-4">
                    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-md bg-rose-400/15 px-2 py-1 text-[10px] font-extrabold text-rose-300">أولوية عالية</span><span className="text-[10px] text-slate-500">منذ 8 دقائق</span></div><h3 className="mt-3 text-base font-extrabold text-white">عيادة نبض — القاهرة الجديدة</h3><p className="mt-1 text-xs text-slate-500">إشارة شراء: موقع قديم + نشاط اجتماعي متزايد</p></div><div className="text-left"><span className="text-2xl font-extrabold text-emerald-300">91</span><span className="block text-[10px] text-slate-500">درجة التطابق</span></div></div>
                    <div className="mt-4 flex flex-wrap gap-2">{signals.map((signal) => <div key={signal.label} className="rounded-md border border-white/10 bg-black/10 px-2.5 py-1.5 text-[10px] text-slate-400"><span className={`font-bold ${signal.color}`}>{signal.value}</span> {signal.label}</div>)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-[#0a1018] py-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 text-xs font-bold text-slate-500 sm:px-6 lg:justify-between lg:px-8"><span className="flex items-center gap-2"><Database className="h-4 w-4 text-cyan-300" /> 50,000+ نشاط مرصود</span><span className="flex items-center gap-2"><Target className="h-4 w-4 text-emerald-300" /> 10 قواعد تقييم ذكية</span><span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-300" /> تحديثات يومية للسوق</span><span className="flex items-center gap-2"><Zap className="h-4 w-4 text-violet-300" /> قرار أسرع، مبيعات أكثر</span></div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28"><div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-emerald-300">ذكاء عملي، وليس ضوضاء</p><h2 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">كل فرصة تأتيك ومعها الإجابة: لماذا الآن؟</h2><p className="mt-4 text-sm leading-7 text-slate-400">لا نبيعك قائمة أرقام. نراقب الإشارات التي تهم المطور، ثم نرتبها في مساحة عمل تساعدك على التحرك بثقة.</p></div><div className="mt-12 grid gap-4 md:grid-cols-3"><Feature icon={Sparkles} title="إشارات مفهومة" text="نعرض سبب الترشيح بلغة واضحة بدل النتيجة الغامضة." /><Feature icon={BarChart3} title="ترتيب حسب القيمة" text="ركز على الأنشطة الأعلى قابلية للتحول إلى مشروع مدفوع." /><Feature icon={Target} title="مطابقة على مقاسك" text="اختر المدن والتخصصات والخدمات التي تريد نموها." /></div></section>
      </main>
      <footer className="border-t border-white/10 py-7"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8"><p>© {new Date().getFullYear()} LeadForge Egypt. ذكاء مبيعات للسوق المحلي.</p><Link href="/pricing" className="font-bold text-slate-300 hover:text-emerald-300">استكشف الباقات <ArrowLeft className="mr-1 inline h-3 w-3" /></Link></div></footer>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Sparkles; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.03] p-6 transition hover:-translate-y-1 hover:border-emerald-300/30"><div className="flex size-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300"><Icon className="h-5 w-5" /></div><h3 className="mt-5 text-base font-extrabold text-white">{title}</h3><p className="mt-2 text-sm leading-7 text-slate-400">{text}</p></div>;
}

