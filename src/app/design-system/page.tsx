'use client';

import React, { useState } from 'react';
import {
  OpportunityBadge,
  LeadTemperature,
  QualityIndicator,
  QualityState,
  OwnershipTag,
  OwnershipType,
  StageBadge,
  PipelineStage,
  ScorePair,
  ScoreBreakdown,
  CreditChip,
  LeadCard,
  LeadRow,
  PurchaseConfirm,
  PackageCard,
  PipelineColumn,
  PipelineCard,
  MergeCompare,
  RuleWeightEditor,
  Stepper,
  StatTile,
  DealTimeline,
  LedgerTable,
  MatchRow,
} from '@/components/domain';

import {
  Button,
  IconButton,
  Input,
  Textarea,
  Select,
  MultiSelect,
  Checkbox,
  Radio,
  Switch,
  Dialog,
  Drawer,
  Popover,
  Tooltip,
  Toast,
  Banner,
  LockedField,
  Tabs,
  Pagination,
  EmptyState,
  Skeleton,
  Avatar,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Spinner,
  NumberStepper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  ChipList,
  BarList,
  BrandWordmark,
} from '@/components/ui';

import {
  Search,
  ArrowRight,
  HelpCircle,
  Copy,
  Sliders,
  Check,
  AlertTriangle,
  Info,
  Shield,
  Layers,
  Palette,
  Type,
  Maximize2,
  TrendingUp,
  Coins,
  Users,
} from 'lucide-react';

export default function DesignSystemPage() {
  // Density and Direction toggles
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');

  // Interactive component states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseModalState, setPurchaseModalState] = useState<'idle' | 'insufficient_balance' | 'success'>('idle');
  const [isScoreDrawerOpen, setIsScoreDrawerOpen] = useState(false);
  const [numberStepperVal, setNumberStepperVal] = useState(5);

  // Active toast simulation
  const [activeToast, setActiveToast] = useState<{ message: string; variant: 'success' | 'error' | 'info' } | null>(null);

  // Form states
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');
  const [selectValue, setSelectValue] = useState('cairo');
  const [selectedCities, setSelectedCities] = useState(['القاهرة', 'الجيزة']);
  const [checkboxVal, setCheckboxVal] = useState(true);
  const [radioVal, setRadioVal] = useState('opt1');
  const [switchVal, setSwitchVal] = useState(true);

  // Tab & Filter states
  const [activeTab, setActiveTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Stepper state
  const [stepperIndex, setStepperIndex] = useState(0);

  const showToast = (message: string, variant: 'success' | 'error' | 'info' = 'success') => {
    setActiveToast({ message, variant });
  };

  return (
    <div
      dir={direction}
      data-density={density}
      className="min-h-screen bg-page text-fg-primary p-4 sm:p-8 lg:p-12 transition-all font-sans"
    >
      {/* Toast Render if active */}
      {activeToast && (
        <div className="fixed top-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto">
            <Toast
              message={activeToast.message}
              variant={activeToast.variant}
              onClose={() => setActiveToast(null)}
            />
          </div>
        </div>
      )}

      {/* Dev-Only Banner & Top Control Panel */}
      <div className="max-w-7xl mx-auto mb-10">
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-brand" />
              <h1 className="text-h2 font-bold tracking-tight">
                دليل نظام التصميم — LeadForge Egypt Design System
              </h1>
            </div>
            <p className="text-body-sm text-fg-secondary">
              توثيق مرئي حي لجميع الرموز والمكونات الأولية ومكونات النطاق في بيئة التطوير (Dev-Only).
            </p>
          </div>

          {/* Interactive Mode Switches per Spec 12 & Phase 4 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-line bg-subtle p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setDensity('comfortable')}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                  density === 'comfortable'
                    ? 'bg-surface text-fg-primary shadow-xs font-semibold'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                مريح (Comfortable)
              </button>
              <button
                type="button"
                onClick={() => setDensity('compact')}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                  density === 'compact'
                    ? 'bg-surface text-fg-primary shadow-xs font-semibold'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                مدمج (Compact)
              </button>
            </div>

            <div className="inline-flex items-center rounded-lg border border-line bg-subtle p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setDirection('rtl')}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                  direction === 'rtl'
                    ? 'bg-surface text-fg-primary shadow-xs font-semibold'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                RTL (العربية)
              </button>
              <button
                type="button"
                onClick={() => setDirection('ltr')}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                  direction === 'ltr'
                    ? 'bg-surface text-fg-primary shadow-xs font-semibold'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                LTR (English Test)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        {/* ========================================================= */}
        {/* 1. COLOR TOKENS & CONTRAST RATIOS                         */}
        {/* ========================================================= */}
        <section className="flex flex-col gap-6" id="colors">
          <div className="border-b border-line pb-3">
            <h2 className="text-h2 font-bold text-fg-primary flex items-center gap-2">
              <Palette className="h-6 w-6 text-fg-brand" />
              <span>1. لوحة الألوان ورموز التصميم الدلالية (Tokens & Contrast)</span>
            </h2>
            <p className="text-body-sm text-fg-secondary mt-1">
              عائلة التيل المصرية والمحايدات الدافئة. لا يوجد أخضر، لا يوجد بنفسجي، لا توجد تدرجات لونية.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-label font-semibold text-fg-secondary mb-3">
                عائلة التيل (Egyptian Teal Palette — Primary Brand)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                {[
                  { name: '50', hex: '#f0fdfa', text: 'text-teal-900', bg: 'bg-teal-50', ratio: '17.8:1' },
                  { name: '100', hex: '#ccfbf1', text: 'text-teal-900', bg: 'bg-teal-100', ratio: '15.2:1' },
                  { name: '200', hex: '#99f6e4', text: 'text-teal-900', bg: 'bg-teal-200', ratio: '12.4:1' },
                  { name: '300', hex: '#5eead4', text: 'text-teal-900', bg: 'bg-teal-300', ratio: '9.8:1' },
                  { name: '400', hex: '#2dd4bf', text: 'text-teal-950', bg: 'bg-teal-400', ratio: '7.6:1' },
                  { name: '500', hex: '#14b8a6', text: 'text-white', bg: 'bg-teal-500', ratio: '3.8:1' },
                  { name: '600', hex: '#0d9488', text: 'text-white', bg: 'bg-teal-600', ratio: '5.2:1 (AA)' },
                  { name: '700', hex: '#0f766e', text: 'text-white', bg: 'bg-teal-700', ratio: '7.1:1 (AAA)' },
                  { name: '800', hex: '#115e59', text: 'text-white', bg: 'bg-teal-800', ratio: '9.4:1 (AAA)' },
                  { name: '900', hex: '#134e4a', text: 'text-white', bg: 'bg-teal-900', ratio: '11.8:1 (AAA)' },
                ].map((c) => (
                  <div key={c.name} className="flex flex-col gap-1">
                    <div
                      className={`h-16 rounded-lg ${c.bg} ${c.text} flex flex-col justify-between p-2 shadow-xs border border-line/40`}
                    >
                      <span className="text-caption font-bold">{c.name}</span>
                      <span className="text-caption font-mono opacity-80">{c.hex}</span>
                    </div>
                    <span className="text-caption text-fg-muted text-center">{c.ratio}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-label font-semibold text-fg-secondary mb-3">
                المحايدات الدافئة (Warm Sand Neutrals — Surfaces & Borders)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                {[
                  { name: '50', hex: '#fbfaf8', text: 'text-sand-900', bg: 'bg-sand-50' },
                  { name: '100', hex: '#f7f5f0', text: 'text-sand-900', bg: 'bg-sand-100' },
                  { name: '200', hex: '#eee9df', text: 'text-sand-900', bg: 'bg-sand-200' },
                  { name: '300', hex: '#dfd7c7', text: 'text-sand-900', bg: 'bg-sand-300' },
                  { name: '400', hex: '#c8bba4', text: 'text-sand-950', bg: 'bg-sand-400' },
                  { name: '500', hex: '#ac9a7f', text: 'text-white', bg: 'bg-sand-500' },
                  { name: '600', hex: '#8f7b62', text: 'text-white', bg: 'bg-sand-600' },
                  { name: '700', hex: '#71604c', text: 'text-white', bg: 'bg-sand-700' },
                  { name: '800', hex: '#524638', text: 'text-white', bg: 'bg-sand-800' },
                  { name: '900', hex: '#332b22', text: 'text-white', bg: 'bg-sand-900' },
                ].map((c) => (
                  <div key={c.name} className="flex flex-col gap-1">
                    <div
                      className={`h-16 rounded-lg ${c.bg} ${c.text} flex flex-col justify-between p-2 shadow-xs border border-line/40`}
                    >
                      <span className="text-caption font-bold">{c.name}</span>
                      <span className="text-caption font-mono opacity-80">{c.hex}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Semantic surface tokens */}
            <div>
              <h3 className="text-label font-semibold text-fg-secondary mb-3">
                المساحات والأسطح الوظيفية (Semantic Surfaces)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-page border border-line flex flex-col gap-1">
                  <span className="text-caption font-semibold">--bg-page</span>
                  <span className="text-caption text-fg-muted font-mono">خلفية الصفحة العامة</span>
                </div>
                <div className="p-4 rounded-lg bg-surface border border-line shadow-xs flex flex-col gap-1">
                  <span className="text-caption font-semibold">--bg-surface</span>
                  <span className="text-caption text-fg-muted font-mono">البطاقات والحاويات</span>
                </div>
                <div className="p-4 rounded-lg bg-subtle border border-line flex flex-col gap-1">
                  <span className="text-caption font-semibold">--bg-subtle</span>
                  <span className="text-caption text-fg-muted font-mono">الحقول ورؤوس الجداول</span>
                </div>
                <div className="p-4 rounded-lg bg-brand-soft border border-line flex flex-col gap-1 text-fg-brand">
                  <span className="text-caption font-semibold">--bg-brand-soft</span>
                  <span className="text-caption text-fg-muted font-mono">التمييز التفاعلي</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 2. TYPOGRAPHY SCALE & NUMBERS                            */}
        {/* ========================================================= */}
        <section className="flex flex-col gap-6" id="typography">
          <div className="border-b border-line pb-3">
            <h2 className="text-h2 font-bold text-fg-primary flex items-center gap-2">
              <Type className="h-6 w-6 text-fg-brand" />
              <span>2. مقياس الطباعة والخطوط (Typography Scale)</span>
            </h2>
            <p className="text-body-sm text-fg-secondary mt-1">
              خط IBM Plex Sans Arabic للنصوص و IBM Plex Mono للأرقام الجدولية والمعادلات.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">Display (clamp 32px – 56px, 700)</span>
              <div className="text-display font-bold">بوابة صفقات وخدمات الأعمال في مصر</div>
            </div>

            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">H1 (clamp 26px – 32px, 700)</span>
              <div className="text-h1 font-bold">لوحة إدارة الفرص والشركات المؤهلة</div>
            </div>

            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">H2 (24px, 600)</span>
              <div className="text-h2 font-semibold">استعراض الفرص والتحقق من البيانات</div>
            </div>

            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">H3 (20px, 600)</span>
              <div className="text-h3 font-semibold">تفاصيل نشاط الشركة وتقييم الفرصة</div>
            </div>

            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">H4 (18px, 600)</span>
              <div className="text-h4 font-semibold">مستشفى الكوثر التخصصي — التجمع الخامس</div>
            </div>

            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">Body (16px, 400, line-height 1.7)</span>
              <p className="text-body text-fg-secondary max-w-[70ch]">
                نظام LeadForge يعتمد على معايير حتمية صارمة لاكتشاف واحتساب جودة الفرص التجارية دون أي تخمينات عشوائية أو أيقونات ذكاء اصطناعي مضللة.
              </p>
            </div>

            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-caption text-fg-muted font-mono">Body Small & Label (14px, 500 / 400)</span>
              <div className="flex items-center gap-4">
                <span className="text-label font-medium text-fg-primary">تصنيف النشاط التجاري</span>
                <span className="text-body-sm text-fg-secondary">القاهرة الجديدة، التجمع الأول</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-caption text-fg-muted font-mono">Caption (12px, 400) & Tabular Numerals (.ltr-iso)</span>
              <div className="flex items-center gap-4 text-caption text-fg-muted">
                <span>تم التحديث منذ 3 أيام</span>
                <span className="ltr-iso font-mono font-semibold text-fg-primary tabular-nums">
                  +150 نقطة / 01012345678
                </span>
              </div>
            </div>

            {/* BRAND WORDMARK SHOWCASE */}
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <span className="text-caption text-fg-muted font-mono">شعار وهوية المنصة (Brand Wordmark — LeadForge)</span>
              <div className="flex flex-wrap items-baseline gap-6 p-4 rounded-lg border border-line bg-subtle">
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-fg-muted">XL (30px)</span>
                  <BrandWordmark size="xl" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-fg-muted">LG (24px)</span>
                  <BrandWordmark size="lg" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-fg-muted">MD (20px) + Subtitle</span>
                  <BrandWordmark size="md" subtitle="فرص مبيعات مؤهلة" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-fg-muted">SM (16px)</span>
                  <BrandWordmark size="sm" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 3. PRIMITIVES SHOWCASE (PHASE 2)                         */}
        {/* ========================================================= */}
        <section className="flex flex-col gap-6" id="primitives">
          <div className="border-b border-line pb-3">
            <h2 className="text-h2 font-bold text-fg-primary flex items-center gap-2">
              <Sliders className="h-6 w-6 text-fg-brand" />
              <span>3. المكونات الأولية (UI Primitives in All States)</span>
            </h2>
            <p className="text-body-sm text-fg-secondary mt-1">
              جميع عناصر الواجهة الأساسية: أزرار، حقول إدخال، نوافذ منبثقة، جداول، وتبويبات.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {/* BUTTONS */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">الأزرار (Button Variants & Sizes)</h3>
              
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg">تأكيد الشراء (Primary LG)</Button>
                <Button variant="primary" size="md">زر أساسي (MD)</Button>
                <Button variant="primary" size="sm">زر صغير (SM)</Button>
                <Button variant="primary" size="md" isLoading>جاري المعالجة</Button>
                <Button variant="primary" size="md" disabled>معطّل</Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button variant="secondary" size="md">زر ثانوي (Secondary)</Button>
                <Button variant="ghost" size="md">زر شفاف (Ghost)</Button>
                <Button variant="danger" size="md">حذف السجل (Danger)</Button>
                <Button variant="link" size="md">رابط نصي (Link)</Button>
                <IconButton aria-label="نسخ الكود" size="md">
                  <Copy className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            {/* FORM CONTROLS */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">حقول الاستمارات والإدخال (Form Controls)</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Input
                  label="اسم النشاط التجاري"
                  placeholder="مثال: عيادات النور"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  helperText="الاسم التجاري المسجل في البطاقة الضريبية."
                />

                <Input
                  label="رقم الهاتف المصري"
                  placeholder="01012345678"
                  error="أدخل رقم هاتف مصري صحيح يبدأ بـ 01."
                  dir="ltr"
                />

                <Select
                  label="المحافظة"
                  value={selectValue}
                  onChange={(e) => setSelectValue(e.target.value)}
                  options={[
                    { value: 'cairo', label: 'القاهرة' },
                    { value: 'giza', label: 'الجيزة' },
                    { value: 'alex', label: 'الإسكندرية' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <MultiSelect
                  label="المدن والمناطق المستهدفة"
                  options={[
                    { value: 'cairo', label: 'القاهرة' },
                    { value: 'giza', label: 'الجيزة' },
                    { value: 'new_cairo', label: 'القاهرة الجديدة' },
                    { value: 'maadi', label: 'المعادي' },
                    { value: 'zayed', label: 'الشيخ زايد' },
                  ]}
                  value={selectedCities}
                  onChange={setSelectedCities}
                />

                <Textarea
                  label="ملاحظات المطور (اختياري)"
                  placeholder="أدخل أي ملاحظات إضافية حول الصفقة..."
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-8 pt-3 border-t border-line">
                <Checkbox
                  id="chk1"
                  label="تفعيل التنبيهات الفورية"
                  checked={checkboxVal}
                  onChange={(e) => setCheckboxVal(e.target.checked)}
                />

                <Radio
                  name="radioGroup"
                  value="opt1"
                  label="خيار رئيسي"
                  checked={radioVal === 'opt1'}
                  onChange={() => setRadioVal('opt1')}
                />

                <Radio
                  name="radioGroup"
                  value="opt2"
                  label="خيار بديل"
                  checked={radioVal === 'opt2'}
                  onChange={() => setRadioVal('opt2')}
                />

                <Switch
                  checked={switchVal}
                  onChange={(e) => setSwitchVal(e.target.checked)}
                  label="تطبيق الفلترة التلقائية"
                />

                <div className="flex items-center gap-3">
                  <span className="text-body-sm text-fg-secondary">العداد الرقمي (NumberStepper):</span>
                  <NumberStepper
                    value={numberStepperVal}
                    onChange={setNumberStepperVal}
                    min={1}
                    max={20}
                    step={1}
                  />
                  <NumberStepper
                    value={numberStepperVal}
                    onChange={setNumberStepperVal}
                    min={1}
                    max={20}
                    step={1}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* BANNERS & NOTIFICATIONS */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">اللافتات والتنبيهات (Banners & Feedback)</h3>

              <Banner variant="info">
                <span>تخضع جميع الفرص في هذا القسم للمراجعة الآلية والفحص الدوري.</span>
              </Banner>

              <Banner variant="warning">
                <span>رصيدك الحالي أقل من سعر بعض الفرص الحصرية. يمكنك شحن رصيدك للمتابعة.</span>
              </Banner>

              <Banner variant="danger">
                <span>تعذّر الاتصال بخادم المزامنة. يرجى التحقق من الاتصال وإعادة المحاولة.</span>
              </Banner>

              <div className="pt-2 flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => showToast('تم نسخ رقم الهاتف بنجاح.', 'success')}
                >
                  إطلاق إشعار نجاح (Toast)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => showToast('حدث خطأ أثناء الاتصال.', 'error')}
                >
                  إطلاق إشعار خطأ (Toast)
                </Button>
              </div>
            </div>

            {/* LOCKED FIELD DEMO */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-3">
              <h3 className="text-h3 font-semibold text-fg-primary">حماية البيانات المغلقة (LockedField)</h3>
              <p className="text-body-sm text-fg-secondary">
                تُعرض حقول الاتصال معتمة مع أيقونة القفل للفرص التي لم يتم شراؤها بعد.
              </p>

              <div className="max-w-md flex flex-col gap-3 p-4 rounded-lg bg-subtle border border-line">
                <div className="flex items-center justify-between">
                  <span className="text-caption text-fg-secondary">رقم الهاتف:</span>
                  <LockedField type="phone" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-caption text-fg-secondary">البريد الإلكتروني:</span>
                  <LockedField type="email" />
                </div>
              </div>
            </div>

            {/* TABS & PAGINATION */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">التبويبات والترقيم (Tabs & Pagination)</h3>

              <div>
                <span className="text-caption text-fg-muted mb-2 block">نمط الخط السفلي (Underline Tabs):</span>
                <Tabs
                  variant="underline"
                  tabs={[
                    { id: 'all', label: 'جميع الفرص' },
                    { id: 'hot', label: 'فرص ساخنة' },
                    { id: 'exclusive', label: 'فرص حصرية' },
                  ]}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                />
              </div>

              <div>
                <span className="text-caption text-fg-muted mb-2 block">نمط الكبسولات المقسمة (Segmented Pills):</span>
                <Tabs
                  variant="segmented"
                  tabs={[
                    { id: 'grid', label: 'عرض كشبكة' },
                    { id: 'table', label: 'عرض كجدول' },
                  ]}
                  activeTab="grid"
                  onChange={() => {}}
                />
              </div>

              <div className="pt-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={8}
                  totalItems={80}
                  pageSize={10}
                  onPageChange={setCurrentPage}
                />
              </div>
            </div>

            {/* AVATAR & BADGES */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">الصور الرمزية والشارات (Avatar & Badges)</h3>

              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="text-body-sm text-fg-secondary">الصور الرمزية (Avatar):</span>
                  <Avatar name="محمد سلام" size="sm" />
                  <Avatar name="سيف قطز" size="md" />
                  <Avatar name="شركة النور" size="lg" />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm text-fg-secondary">الشارات (Badges):</span>
                  <Badge variant="neutral">افتراضي (Neutral)</Badge>
                  <Badge variant="brand">علامة تجارية (Brand)</Badge>
                  <Badge variant="warning">تحذير (Warning)</Badge>
                  <Badge variant="danger">خطر (Danger)</Badge>
                  <Badge variant="outline">إطار (Outline)</Badge>
                </div>
              </div>
            </div>

            {/* CHIP LIST (+N OVERFLOW WITH TOOLTIP) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                قوائم الرقاقات المتقدمة (ChipList — +N Overflow with Tooltip)
              </h3>
              <p className="text-body-sm text-fg-secondary">
                عرض الرقاقات والوسوم مع معالجة ذكية للفيض عبر شارة +N وتلميح توضيحي تفاعلي عند التحويم.
              </p>

              <div className="flex flex-col gap-4">
                <div>
                  <span className="text-caption text-fg-muted mb-2 block">قائمة قياسية بدون فيض (Standard):</span>
                  <ChipList
                    chips={['تطوير مواقع الويب', 'تطبيقات الهواتف', 'منصات التجارة الإلكترونية']}
                    maxVisible={3}
                  />
                </div>

                <div>
                  <span className="text-caption text-fg-muted mb-2 block">قائمة مع فيض وتلميح تفاعلي (+N Overflow):</span>
                  <ChipList
                    chips={[
                      'محافظة القاهرة',
                      'محافظة الجيزة',
                      'الإسكندرية',
                      'المنصورة',
                      'طنطا',
                      'أسيوط',
                      'بورسعيد',
                    ]}
                    maxVisible={3}
                  />
                </div>
              </div>
            </div>

            {/* CARDS */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">البطاقات (Card Variants & Subcomponents)</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>بطاقة قياسية مع ترويسة</CardTitle>
                      <CardDescription>تحتوي على ترويسة، محتوى، وتذييل منظم</CardDescription>
                    </div>
                    <Badge variant="brand">نشط</Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-body-sm text-fg-secondary">
                      هذا محتوى البطاقة القياسية المبنية باستخدام مصفوفة الحشو والتسطيح الخاصة بالديزاين سيستم.
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between items-center">
                    <span className="text-caption text-fg-muted">تحديث: منذ 5 دقائق</span>
                    <Button variant="secondary" size="sm">عرض التفاصيل</Button>
                  </CardFooter>
                </Card>

                <Card
                  interactive
                  onClick={() => showToast('تم النقر على البطاقة التفاعلية', 'info')}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-label font-bold text-fg-primary">بطاقة تفاعلية (Interactive Card)</span>
                      <ArrowRight className="h-4 w-4 text-fg-muted rtl:-scale-x-100" />
                    </div>
                    <p className="text-body-sm text-fg-secondary">
                      تدعم حالات التحويم `hover:border-line-strong` والتركيز للوحة المفاتيح تلقائياً.
                    </p>
                  </div>
                </Card>
              </div>
            </div>

            {/* BAR LIST (CONVERSION FUNNEL) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                مخطط معدلات التحويل والمؤشرات البيانية (BarList — Conversion Funnel)
              </h3>
              <p className="text-body-sm text-fg-secondary">
                مسار تحويل متدرج بشرائط 6px ملونة بنمط العلامة التجارية لحساب معدلات الإنجاز.
              </p>

              <div className="max-w-xl">
                <BarList
                  items={[
                    { label: 'تم الشراء', value: 42, percentage: 100 },
                    { label: 'تم التواصل', value: 36, percentage: 86 },
                    { label: 'تم الرد والتفاعل', value: 24, percentage: 57 },
                    { label: 'اجتماع مجدول', value: 14, percentage: 33 },
                    { label: 'تمت الصفقة بنجاح', value: 8, percentage: 19 },
                  ]}
                  maxValue={42}
                  showPercentage={true}
                />
              </div>
            </div>

            {/* GENERIC TABLE */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">مكون الجدول الأساسي (Generic Accessible Table)</h3>
              <p className="text-body-sm text-fg-secondary">
                مبني بخصائص منطقية ومحاذاة أرقام جدولية Western Arabic (`tabular-nums`).
              </p>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>معرف العملية</TableHead>
                      <TableHead>نوع العملية</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead isNumeric>النقاط</TableHead>
                      <TableHead isNumeric>الرصيد النهائي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><span className="ltr-iso font-mono font-medium">TX-8012</span></TableCell>
                      <TableCell>شراء باقة نمو</TableCell>
                      <TableCell><Badge variant="brand" size="sm">مكتمل</Badge></TableCell>
                      <TableCell isNumeric><span className="ltr-iso font-mono font-bold text-fg-brand">+500</span></TableCell>
                      <TableCell isNumeric><span className="ltr-iso font-mono">500</span></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><span className="ltr-iso font-mono font-medium">TX-8013</span></TableCell>
                      <TableCell>شراء فرصة حصرية (مستشفى الشروق)</TableCell>
                      <TableCell><Badge variant="neutral" size="sm">معتمد</Badge></TableCell>
                      <TableCell isNumeric><span className="ltr-iso font-mono font-bold text-danger-text">-60</span></TableCell>
                      <TableCell isNumeric><span className="ltr-iso font-mono">440</span></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* EMPTY STATES */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">حالات الفراغ (EmptyState Variants)</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-line rounded-lg bg-surface">
                  <EmptyState
                    variant="no-results"
                    title="لم يتم العثور على نتائج"
                    description="جرب ضبط معايير التصفية أو إزالة الكلمات المحددة للبحث."
                    action={{
                      label: 'إعادة ضبط الفلاتر',
                      onClick: () => showToast('تمت إعادة ضبط الفلاتر', 'info'),
                    }}
                  />
                </div>
                <div className="border border-line rounded-lg bg-surface">
                  <EmptyState
                    variant="first-use"
                    title="لا توجد صفقات في المتابعة بعد"
                    description="قم بشراء فرص جديدة من صفحة استكشاف الفرص لإضافتها إلى خط سيرك."
                    action={{
                      label: 'استكشاف الفرص الآن',
                      onClick: () => showToast('الانتقال لسوق الفرص', 'info'),
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SKELETON & SPINNERS */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">مؤشرات التحميل والهيكل العظمي (Skeleton & Spinner)</h3>

              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 w-full flex flex-col gap-3">
                  <span className="text-caption text-fg-secondary">هيكل تحميل البطاقات (Card Skeleton):</span>
                  <div className="p-4 rounded-lg border border-line bg-surface flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <Skeleton circle width={40} height={40} />
                      <div className="flex flex-col gap-1.5 flex-1">
                        <Skeleton height={14} width="60%" />
                        <Skeleton height={10} width="40%" />
                      </div>
                    </div>
                    <Skeleton height={32} width="100%" />
                    <Skeleton height={16} width="80%" />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <span className="text-caption text-fg-secondary">مؤشرات الدوران (Spinners):</span>
                  <div className="flex items-center gap-6 p-4 rounded-lg border border-line bg-surface">
                    <Spinner size="sm" />
                    <Spinner size="md" />
                    <Spinner size="lg" />
                  </div>
                </div>
              </div>
            </div>

            {/* MODALS, DRAWERS & POPOVERS DEMO */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">النوافذ المنبثقة والقوائم (Dialogs, Drawers & Popovers)</h3>

              <div className="flex flex-wrap items-center gap-4">
                <Button variant="secondary" onClick={() => setIsDialogOpen(true)}>
                  فتح نافذة حوار (Dialog)
                </Button>

                <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
                  فتح درج جانبي (Drawer)
                </Button>

                <Popover
                  trigger={
                    <Button variant="ghost">
                      فتح قائمة منبثقة (Popover)
                    </Button>
                  }
                  content={
                    <div className="p-3 flex flex-col gap-2 min-w-48 text-start">
                      <span className="text-label font-bold text-fg-primary">خيارات الفرز</span>
                      <button className="text-body-sm text-start py-1 hover:text-fg-brand">الأعلى تقييماً أولاً</button>
                      <button className="text-body-sm text-start py-1 hover:text-fg-brand">الأحدث إضافة</button>
                      <button className="text-body-sm text-start py-1 hover:text-fg-brand">الأقل سعراً</button>
                    </div>
                  }
                />

                <Tooltip content="تلميح يوضح آلية حساب النقاط للفرص الحصرية">
                  <span className="inline-flex items-center gap-1 text-body-sm text-fg-secondary cursor-help border-b border-dashed border-line-strong">
                    <HelpCircle className="h-4 w-4" />
                    <span>تلميح توضيحي (Tooltip)</span>
                  </span>
                </Tooltip>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 4. DOMAIN COMPONENTS SHOWCASE (PHASE 3)                    */}
        {/* ========================================================= */}
        <section className="flex flex-col gap-6" id="domain">
          <div className="border-b border-line pb-3">
            <h2 className="text-h2 font-bold text-fg-primary flex items-center gap-2">
              <Shield className="h-6 w-6 text-fg-brand" />
              <span>4. مكونات النطاق المخصصة (Domain Components & Enums)</span>
            </h2>
            <p className="text-body-sm text-fg-secondary mt-1">
              مطابقة دقيقة مع الـ Enums الحقيقية في قاعدة البيانات (AUDIT.md).
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {/* ENUM SHOWCASE: OPPORTUNITY TIER */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">
                شارات درجات الفرص والحرارة (LeadTemperature — Spec 6.1)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border border-line bg-subtle flex flex-col gap-2">
                  <span className="text-caption font-mono text-fg-muted">COLD (1/4 dots)</span>
                  <OpportunityBadge temperature="COLD" score={25} />
                </div>
                <div className="p-4 rounded-lg border border-line bg-subtle flex flex-col gap-2">
                  <span className="text-caption font-mono text-fg-muted">WARM (2/4 dots)</span>
                  <OpportunityBadge temperature="WARM" score={58} />
                </div>
                <div className="p-4 rounded-lg border border-line bg-subtle flex flex-col gap-2">
                  <span className="text-caption font-mono text-fg-muted">HOT (3/4 dots)</span>
                  <OpportunityBadge temperature="HOT" score={84} />
                </div>
                <div className="p-4 rounded-lg border border-line bg-subtle flex flex-col gap-2">
                  <span className="text-caption font-mono text-fg-muted">PREMIUM (4/4 dots)</span>
                  <OpportunityBadge temperature="PREMIUM" score={96} />
                </div>
              </div>
            </div>

            {/* ENUM SHOWCASE: QUALITY & FRESHNESS */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">
                مؤشرات جودة وحداثة البيانات (Freshness & Verification — Spec 6.2)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">FRESH</span>
                  <QualityIndicator status="FRESH" timestamp={new Date()} />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">AGING</span>
                  <QualityIndicator status="AGING" timestamp={new Date(Date.now() - 86400000 * 5)} />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">STALE</span>
                  <QualityIndicator status="STALE" timestamp={new Date(Date.now() - 86400000 * 45)} />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">VERY_STALE</span>
                  <QualityIndicator status="VERY_STALE" timestamp={new Date(Date.now() - 86400000 * 90)} />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">UNVERIFIED</span>
                  <QualityIndicator status="UNVERIFIED" />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">VERIFIED</span>
                  <QualityIndicator status="VERIFIED" timestamp={new Date()} />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">REVERIFYING</span>
                  <QualityIndicator status="REVERIFYING" />
                </div>
                <div className="p-3 rounded-lg border border-line bg-subtle flex flex-col gap-1">
                  <span className="text-caption font-mono text-fg-muted">UNKNOWN</span>
                  <QualityIndicator status="UNKNOWN" />
                </div>
              </div>
            </div>

            {/* ENUM SHOWCASE: OWNERSHIP & STAGES */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-fg-primary">
                نوع التوزيع ومراحل الصفقات (Ownership & Pipeline Stages — Spec 6.3 & 6.4)
              </h3>
              
              <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-line">
                <OwnershipTag type="EXCLUSIVE" />
                <OwnershipTag type="SHARED" seatsRemaining={2} maxSeats={3} />
                <OwnershipTag type="SHARED" seatsRemaining={0} maxSeats={3} />
                <CreditChip balance={280} />
                <CreditChip balance={5} />
              </div>

              <div>
                <span className="text-caption text-fg-muted mb-2 block">حالات الصفقات في خط سير المبيعات (PipelineStatus):</span>
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage="NEW" />
                  <StageBadge stage="CLAIMED" />
                  <StageBadge stage="CONTACTED" />
                  <StageBadge stage="INTERESTED" />
                  <StageBadge stage="MEETING" />
                  <StageBadge stage="PROPOSAL_SENT" />
                  <StageBadge stage="NEGOTIATION" />
                  <StageBadge stage="WON" />
                  <StageBadge stage="LOST" />
                  <StageBadge stage="INVALID" />
                </div>
              </div>
            </div>

            {/* SCORE PAIR & SCORE BREAKDOWN */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                كتل تقييم الفرصة وتفكيك القواعد (ScorePair & ScoreBreakdown — Spec 7.9)
              </h3>

              <ScorePair
                opportunityScore={85}
                temperature="HOT"
                qualityScore={90}
                qualityStatus="VERIFIED"
                freshnessTimestamp={new Date()}
                onWhyClick={() => setIsScoreDrawerOpen(true)}
              />

              <div className="max-w-2xl">
                <ScoreBreakdown
                  totalScore={85}
                  rules={[
                    { label: 'النشاط لا يمتلك موقعاً إلكترونياً مسجلاً', points: 30, maxWeight: 35 },
                    { label: 'تقييم ممتاز على خرائط جوجل مع تفاعل نشط', points: 25, maxWeight: 30 },
                    { label: 'يمتلك النشاط أكثر من فرعين تجاريين', points: 20, maxWeight: 25 },
                    { label: 'رقم هاتف محمول مخصص للتواصل المباشر', points: 15, maxWeight: 20 },
                    { label: 'تحديث بيانات الموقع منذ أكثر من 90 يوماً', points: -5, maxWeight: 20 },
                  ]}
                />
              </div>
            </div>

            {/* LEAD CARD & LEAD ROW */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                بطاقة الفرصة وصف الجدول (LeadCard & LeadRow — Spec 7.8)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <LeadCard
                  id="lead-1"
                  companyName="مستشفى الشروق التخصصي"
                  category="رعاية صحية ومستشفيات"
                  location="القاهرة الجديدة"
                  temperature="HOT"
                  score={88}
                  ownershipType="EXCLUSIVE"
                  qualityStatus="VERIFIED"
                  qualityTimestamp={new Date()}
                  price={60}
                  signals={['بدون موقع', 'تقييمات مرتفعة', 'عدة فروع']}
                  onViewLead={() => setIsPurchaseModalOpen(true)}
                />

                <LeadCard
                  id="lead-2"
                  companyName="سلسلة مطاعم كرم الشام"
                  category="مطاعم ومأكولات"
                  location="مدينة نصر"
                  temperature="PREMIUM"
                  score={95}
                  ownershipType="SHARED"
                  seatsRemaining={2}
                  maxSeats={3}
                  qualityStatus="FRESH"
                  qualityTimestamp={new Date()}
                  price={45}
                  signals={['طلب متزايد', 'توسع سريع']}
                  onViewLead={() => setIsPurchaseModalOpen(true)}
                />

                <LeadCard
                  id="lead-3"
                  companyName="مكتب الأندلس للمحاماة والاستشارات"
                  category="خدمات قانونية"
                  location="المعادي"
                  temperature="WARM"
                  score={62}
                  ownershipType="EXCLUSIVE"
                  qualityStatus="AGING"
                  qualityTimestamp={new Date(Date.now() - 86400000 * 10)}
                  price={35}
                  signals={['بدون بريد تجاري']}
                  onViewLead={() => setIsPurchaseModalOpen(true)}
                />
              </div>

              <div className="pt-4 overflow-x-auto border border-line rounded-lg bg-surface">
                <table className="w-full text-start">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary">
                      <th className="px-4 py-2.5 text-start">اسم النشاط</th>
                      <th className="px-4 py-2.5 text-start">درجة الفرصة</th>
                      <th className="px-4 py-2.5 text-start">الجودة</th>
                      <th className="px-4 py-2.5 text-start">التوزيع</th>
                      <th className="px-4 py-2.5 text-end">السعر</th>
                      <th className="px-4 py-2.5 text-end">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LeadRow
                      id="lead-tbl-1"
                      companyName="مستشفى الشروق التخصصي"
                      category="رعاية صحية"
                      location="القاهرة الجديدة"
                      temperature="HOT"
                      score={88}
                      ownershipType="EXCLUSIVE"
                      qualityStatus="VERIFIED"
                      qualityTimestamp={new Date()}
                      price={60}
                      onViewLead={() => setIsPurchaseModalOpen(true)}
                    />
                    <LeadRow
                      id="lead-tbl-2"
                      companyName="سلسلة مطاعم كرم الشام"
                      category="مطاعم"
                      location="مدينة نصر"
                      temperature="PREMIUM"
                      score={95}
                      ownershipType="SHARED"
                      seatsRemaining={1}
                      maxSeats={3}
                      qualityStatus="FRESH"
                      qualityTimestamp={new Date()}
                      price={45}
                      onViewLead={() => setIsPurchaseModalOpen(true)}
                    />
                  </tbody>
                </table>
              </div>
            </div>

            {/* MATCH ROW (SPEC 6.2 & ADDENDUM 3.7) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                صفوف الفرص المتطابقة (MatchRow — Spec 6.2 & Addendum 3.7)
              </h3>
              <p className="text-body-sm text-fg-secondary">
                العنصر الأساسي لصفحة لوحة التحكم الذهبية: تسلسل هرمي دقيق، رقاقات أسباب المطابقة المنظمة، وشارة الجودة والفرصة.
              </p>

              <div className="flex flex-col divide-y divide-line border border-line rounded-lg bg-surface">
                <MatchRow
                  lead={{
                    id: 'ds-match-1',
                    businessName: 'مستشفى الشروق التخصصي',
                    category: 'HEALTHCARE',
                    city: 'CAIRO',
                    score: 96,
                    temperature: 'PREMIUM',
                    websiteStatus: 'NO_WEBSITE',
                    freshnessStatus: 'FRESH',
                    verificationStatus: 'VERIFIED',
                    matchStrength: 98,
                  }}
                  categoryLabel="رعاية صحية"
                  cityLabel="القاهرة"
                  websiteStatusLabel="بدون موقع إلكتروني"
                />

                <MatchRow
                  lead={{
                    id: 'ds-match-2',
                    businessName: 'سلسلة مطاعم كرم الشام',
                    category: 'RESTAURANTS',
                    city: 'GIZA',
                    score: 84,
                    temperature: 'HOT',
                    websiteStatus: 'NEEDS_REDESIGN',
                    freshnessStatus: 'VERIFIED',
                    matchStrength: 89,
                  }}
                  categoryLabel="مطاعم ومأكولات"
                  cityLabel="الجيزة"
                  websiteStatusLabel="يحتاج إلى تطوير"
                />

                <MatchRow
                  lead={{
                    id: 'ds-match-3',
                    businessName: 'مكتب الأندلس للمحاماة والاستشارات القانونية',
                    category: 'LEGAL',
                    city: 'ALEXANDRIA',
                    score: 65,
                    temperature: 'WARM',
                    websiteStatus: 'POOR_MOBILE',
                    freshnessStatus: 'AGING',
                    matchStrength: 74,
                  }}
                  categoryLabel="خدمات قانونية"
                  cityLabel="الإسكندرية"
                  websiteStatusLabel="غير متوافق مع الموبايل"
                />

                <MatchRow
                  lead={{
                    id: 'ds-match-4',
                    businessName: 'ورشة النيل للهندسة والحدادة',
                    category: 'MANUFACTURING',
                    city: 'MANSOURA',
                    score: 42,
                    temperature: 'COLD',
                    websiteStatus: 'ACTIVE',
                    freshnessStatus: 'UNVERIFIED',
                    matchStrength: 52,
                  }}
                  categoryLabel="صناعة وتوريدات"
                  cityLabel="المنصورة"
                  websiteStatusLabel="موقع نشط"
                />
              </div>
            </div>

            {/* PACKAGE CARDS (HOSTINGER CALIBRATION) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                باقات شحن الرصيد (PackageCard — Hostinger Calibration Layout)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <PackageCard
                  id="pkg-basic"
                  name="الباقة الأساسية"
                  points={50}
                  priceEGP={500}
                  features={[
                    '50 نقطة صالحة لكافة الفرص',
                    'وصول فوري لبيانات الاتصال',
                    'دعم فني عبر البريد الإلكتروني',
                  ]}
                  onSelectPackage={() => showToast('تم اختيار الباقة الأساسية', 'info')}
                />

                <PackageCard
                  id="pkg-pro"
                  name="الباقة الاحترافية"
                  points={200}
                  priceEGP={1600}
                  isRecommended
                  recommendedReason="الأنسب للشركات المستقلة وفرق المبيعات النشطة"
                  features={[
                    '200 نقطة مع أفضل قيمة لكل نقطة',
                    'أولوية الوصول للفرص الحصرية المميزة',
                    'تنبيهات فورية بمجرد توفر فرص مطابقة',
                    'دعم فني مباشر عبر واتساب',
                  ]}
                  onSelectPackage={() => showToast('تم اختيار الباقة الاحترافية', 'success')}
                />

                <PackageCard
                  id="pkg-growth"
                  name="باقة النمو المتقدم"
                  points={500}
                  priceEGP={3500}
                  features={[
                    '500 نقطة مخصصة لفرق العمل الكبيرة',
                    'تصدير مباشر لبيانات الاتصال إلى CRM',
                    'مستشار حساب مخصص',
                    'ضمان استرداد النقاط في حال تعذر الوصول',
                  ]}
                  onSelectPackage={() => showToast('تم اختيار باقة النمو', 'info')}
                />
              </div>
            </div>

            {/* PIPELINE & KANBAN */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                لوحة متابعة الصفقات (Pipeline Columns & Cards — Spec 7.13)
              </h3>

              <div className="flex gap-4 overflow-x-auto pb-4">
                <PipelineColumn title="تم الشراء (جديدة)" count={2}>
                  <PipelineCard
                    lead={{
                      id: 'p-1',
                      businessName: 'مستشفى الشروق',
                      temperature: 'HOT',
                      score: 88,
                      stage: 'CLAIMED',
                      lastActivityDate: new Date(),
                    }}
                    stages={['CLAIMED', 'CONTACTED', 'MEETING', 'WON']}
                  />
                  <PipelineCard
                    lead={{
                      id: 'p-2',
                      businessName: 'معامل البرج فرع زايد',
                      temperature: 'WARM',
                      score: 72,
                      stage: 'CLAIMED',
                      lastActivityDate: new Date(Date.now() - 86400000 * 2),
                    }}
                    stages={['CLAIMED', 'CONTACTED', 'MEETING', 'WON']}
                  />
                </PipelineColumn>

                <PipelineColumn title="تم التواصل" count={1}>
                  <PipelineCard
                    lead={{
                      id: 'p-3',
                      businessName: 'كرم الشام مدينة نصر',
                      temperature: 'PREMIUM',
                      score: 95,
                      stage: 'CONTACTED',
                      lastActivityDate: new Date(Date.now() - 86400000),
                    }}
                    stages={['CLAIMED', 'CONTACTED', 'MEETING', 'WON']}
                  />
                </PipelineColumn>

                <PipelineColumn title="اجتماع مجدول" count={1}>
                  <PipelineCard
                    lead={{
                      id: 'p-4',
                      businessName: 'الأندلس للاستشارات',
                      temperature: 'WARM',
                      score: 65,
                      stage: 'MEETING',
                      lastActivityDate: new Date(),
                    }}
                    stages={['CLAIMED', 'CONTACTED', 'MEETING', 'WON']}
                  />
                </PipelineColumn>
              </div>
            </div>

            {/* DUPLICATE MERGE COMPARE */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                مقارنة السجلات المكررة للإدارة (MergeCompare — Spec 7.14)
              </h3>

              <MergeCompare
                recordA={{
                  id: 'REC-001',
                  businessName: 'مستشفى الشروق التخصصي',
                  phone: '01012345678',
                  email: 'info@shorouk-hospital.com',
                  category: 'مستشفيات ورعاية صحية',
                  city: 'القاهرة الجديدة',
                  address: 'شارع التسعين الشمالي، التجمع الخامس',
                  source: 'سجل تجاري إلكتروني',
                }}
                recordB={{
                  id: 'REC-002',
                  businessName: 'مستشفى الشروق التخصصي فرع التجمع',
                  phone: '01012345678',
                  email: 'contact@shoroukhospital.eg',
                  category: 'مستشفيات',
                  city: 'القاهرة',
                  address: 'التسعين الشمالي، بجوار مجمع البنوك',
                  source: 'خرائط جوجل',
                }}
                matchLevel="المستوى الرابع (مطابقة دقيقة برقم الهاتف)"
                ruleMatched="RULE_EXACT_PHONE_MATCH"
                onMerge={(target) => showToast(`تم اعتماد السجل (${target}) ودمج البيانات`, 'success')}
                onNotDuplicate={() => showToast('تم تأكيد أن السجلين لنشاطين مختلفين', 'info')}
                onSkip={() => showToast('تم تخطي المراجعة مؤقتاً', 'info')}
              />
            </div>

            {/* RULE WEIGHT EDITOR */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                محرر أوزان القواعد الحتمية (RuleWeightEditor — Spec 7.14)
              </h3>

              <RuleWeightEditor
                initialRules={[
                  {
                    id: 'r1',
                    name: 'عدم وجود موقع إلكتروني',
                    conditionDescription: 'النشاط لا يمتلك رابط موقع مسجل وصالح',
                    expressionCode: 'websiteStatus == NONE',
                    weight: 30,
                    originalWeight: 30,
                  },
                  {
                    id: 'r2',
                    name: 'تقييم خرائط جوجل أعلى من 4.2',
                    conditionDescription: 'عدد التقييمات أكثر من 15 مع متوسط إيجابي',
                    expressionCode: 'rating >= 4.2 && reviews >= 15',
                    weight: 25,
                    originalWeight: 25,
                  },
                  {
                    id: 'r3',
                    name: 'تعدد الفروع التجارية',
                    conditionDescription: 'النشاط يمتلك فرعين تجاريين أو أكثر',
                    expressionCode: 'branchCount >= 2',
                    weight: 20,
                    originalWeight: 20,
                  },
                ]}
                onSave={async () => {
                  showToast('تم حفظ أوزان القواعد وتحديث محرك التقييم بنجاح', 'success');
                }}
              />
            </div>

            {/* STEPPER ONBOARDING */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                خطوات الإعداد والتهيئة (Stepper — Spec 7.15)
              </h3>

              <Stepper
                currentStep={stepperIndex}
                onNext={() => setStepperIndex((prev) => Math.min(2, prev + 1))}
                onPrev={() => setStepperIndex((prev) => Math.max(0, prev - 1))}
                steps={[
                  {
                    title: 'تحديد التخصص والخدمات التي تقدمها',
                    helper: 'اختر مجالات خبرتك البرمجية ليتم ربطك بالشركات التي تحتاج خدماتك بالتحديد.',
                    content: (
                      <div className="flex flex-col gap-3 py-2">
                        <Checkbox id="s1" label="تطوير المواقع والمنصات الإلكترونية" checked />
                        <Checkbox id="s2" label="تطبيقات الهواتف الذكية (iOS & Android)" checked />
                        <Checkbox id="s3" label="أنظمة إدارة وتخطيط الموارد (ERP & CRM)" />
                      </div>
                    ),
                  },
                  {
                    title: 'تحديد النطاق الجغرافي المستهدف',
                    helper: 'اختر المحافظات والمدن التي تفضل العمل مع عملاء بداخلها.',
                    content: (
                      <div className="flex flex-col gap-3 py-2">
                        <Checkbox id="g1" label="محافظة القاهرة" checked />
                        <Checkbox id="g2" label="محافظة الجيزة" checked />
                        <Checkbox id="g3" label="محافظة الإسكندرية" />
                      </div>
                    ),
                  },
                  {
                    title: 'مراجعة الفرص المتطابقة مع ملفك',
                    helper: 'تم فحص قاعدة البيانات وتصفية الفرص المناسبة لمجالك الجغرافي والتقني.',
                    content: (
                      <div className="p-4 rounded-lg bg-subtle border border-line text-body-sm text-fg-primary">
                        تم العثور على <strong className="text-fg-brand font-semibold">18 فرصة نشطة</strong> تطابق خياراتك بالكامل.
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            {/* STAT TILES (SPEC 7.14 & DASHBOARD GOLDEN REFERENCE) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                مربعات الإحصائيات الحيوية (StatTile — Spec 7.14 & Dashboard Golden Reference)
              </h3>
              <p className="text-body-sm text-fg-secondary">
                مقسمة إلى مجموعتين متناسقتين مع عناوين نطاق توضيحية بدون اقتطاع نصي وأرقام بنمط Plex Sans Tabular.
              </p>

              {/* Group 1: لحسابك */}
              <div className="flex flex-col gap-3">
                <span className="text-caption font-semibold text-fg-secondary">
                  لحسابك (Your account)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatTile
                    label="الفرص المطابقة"
                    value={213}
                    unit="فرصة"
                    statusText="تطابق ملفك ونطاقك الجغرافي"
                  />
                  <StatTile
                    label="الفرص المشتراة"
                    value={18}
                    unit="فرصة"
                    statusText="تم شراؤها وجارٍ التواصل معها"
                  />
                  <StatTile
                    label="رصيد النقاط"
                    value={420}
                    unit="نقطة"
                    statusText="رصيدك المتبقي الحالي للاستخدام"
                  />
                </div>
              </div>

              {/* Group 2: على مستوى المنصة */}
              <div className="flex flex-col gap-3">
                <span className="text-caption font-semibold text-fg-secondary">
                  على مستوى المنصة (Across the platform)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatTile
                    label="فرص ساخنة"
                    value={226}
                    unit="فرصة"
                    statusText="الدرجة 70 فأكثر"
                  />
                  <StatTile
                    label="فرص دافئة"
                    value={412}
                    unit="فرصة"
                    statusText="الدرجة من 50 إلى 69"
                  />
                  <StatTile
                    label="مضافة هذا الأسبوع"
                    value={250}
                    unit="فرصة"
                    statusText="آخر 7 أيام"
                  />
                </div>
              </div>

              {/* Alert variant */}
              <div className="flex flex-col gap-3 pt-2">
                <span className="text-caption font-semibold text-fg-secondary">
                  حالة التنبيه عند الخروج عن النطاق (Out-of-Range Alert)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatTile
                    label="فرص تتطلب إعادة التحقق"
                    value={18}
                    unit="فرصة"
                    statusText="تجاوزت الحد المسموح (يحتاج مراجعة)"
                    isOutOfRange={true}
                  />
                </div>
              </div>
            </div>

            {/* DEAL TIMELINE (SPEC 7.13) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                سجل نشاط الصفقة والخط الزمني (DealTimeline — Spec 7.13)
              </h3>
              <p className="text-body-sm text-fg-secondary">
                متابعة تواصل العميل، إضافة ملاحظات مؤرخة، وإمكانية الإبلاغ عن رقم خاطئ لاسترداد النقاط.
              </p>

              <DealTimeline
                events={[
                  {
                    id: 'ev-1',
                    type: 'STATUS_CHANGE',
                    author: 'النظام الآلي',
                    content: 'تم شراء الفرصة حصرياً بواسطة فريق المبيعات ونقلها لمرحلة (تم الشراء)',
                    createdAt: new Date(Date.now() - 86400000 * 2),
                  },
                  {
                    id: 'ev-2',
                    type: 'NOTE',
                    author: 'محمد سلام (مدير الحساب)',
                    content: 'تم الاتصال بالمدير التنفيذي د. أحمد. أبدى اهتماماً كبيراً بتطوير منصة حجز إلكترونية للمستشفى وطلب إرسال العرض المالي الأسبوع القادم.',
                    createdAt: new Date(Date.now() - 86400000 * 1),
                  },
                  {
                    id: 'ev-3',
                    type: 'STATUS_CHANGE',
                    author: 'محمد سلام',
                    content: 'تم تحديث حالة الصفقة من (تم التواصل) إلى (مهتم)',
                    createdAt: new Date(),
                  },
                ]}
                onAddNote={async (content) => {
                  showToast(`تمت إضافة الملاحظة: "${content.slice(0, 30)}..."`, 'success');
                }}
                onReportWrongNumber={async () => {
                  showToast('تم رفع بلاغ الرقم الخاطئ إلى الإدارة للمراجعة', 'info');
                }}
              />
            </div>

            {/* LEDGER TABLE (SPEC 7.11) */}
            <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-6">
              <h3 className="text-h3 font-semibold text-fg-primary">
                سجل حركات الرصيد غير القابل للتعديل (LedgerTable — Spec 7.11)
              </h3>
              <p className="text-body-sm text-fg-secondary">
                سجل محاسبي حتمي غير قابل للتعديل أو الحذف، يدعم تدقيق العمليات والمصادقة.
              </p>

              <LedgerTable
                showImmutabilityNotice={true}
                entries={[
                  {
                    id: 'TXN-9021',
                    createdAt: new Date(Date.now() - 86400000 * 7),
                    type: 'BONUS',
                    description: 'مكافأة التسجيل والتحقق من الحساب الجديد',
                    amount: 50,
                    balanceAfter: 50,
                  },
                  {
                    id: 'TXN-9022',
                    createdAt: new Date(Date.now() - 86400000 * 5),
                    type: 'PURCHASE',
                    description: 'شحن رصيد إلكتروني — باقة المحترفين (200 نقطة)',
                    amount: 200,
                    balanceAfter: 250,
                  },
                  {
                    id: 'TXN-9023',
                    createdAt: new Date(Date.now() - 86400000 * 3),
                    type: 'CLAIM',
                    description: 'شراء فرصة حصرية: مستشفى الشروق التخصصي',
                    amount: -60,
                    balanceAfter: 190,
                  },
                  {
                    id: 'TXN-9024',
                    createdAt: new Date(Date.now() - 86400000 * 1),
                    type: 'CLAIM',
                    description: 'شراء مقعد في فرصة مشتركة: سلسلة مطاعم كرم الشام',
                    amount: -45,
                    balanceAfter: 145,
                  },
                  {
                    id: 'TXN-9025',
                    createdAt: new Date(),
                    type: 'REFUND',
                    description: 'استرداد نقاط صفقة ملغاة بعد التحقق من خطأ الرقم',
                    amount: 35,
                    balanceAfter: 180,
                  },
                ]}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ========================================================= */}
      {/* INTERACTIVE MODALS & DRAWERS                              */}
      {/* ========================================================= */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="نافذة حوار تأكيدية (Dialog Modal)"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsDialogOpen(false);
                showToast('تم تنفيذ الإجراء بنجاح', 'success');
              }}
            >
              تأكيد الإجراء
            </Button>
          </div>
        }
      >
        <p className="text-body-sm text-fg-secondary">
          هذه نافذة حوار قياسية تلتزم بقيود التصميم (لا تتجاوز الحدود القصوى، خلفية معتمة، وإمكانية الإغلاق بزر Esc أو النقر خارج النافذة).
        </p>
      </Dialog>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="درج جانبي تفاعلي (Slide-over Drawer)"
      >
        <div className="p-6 flex flex-col gap-4">
          <p className="text-body-sm text-fg-secondary">
            لوحة جانبية للمراجعات التفصيلية مثل تفكيك درجات التقييم وتاريخ الاتصال.
          </p>
          <div className="p-4 rounded-lg bg-subtle border border-line flex flex-col gap-2">
            <span className="text-label font-bold">معلومات السجل</span>
            <span className="text-body-sm text-fg-muted">سجل نشط وموثق بالكامل</span>
          </div>
          <Button variant="secondary" onClick={() => setIsDrawerOpen(false)}>
            إغلاق الدرج
          </Button>
        </div>
      </Drawer>

      <PurchaseConfirm
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        lead={{
          id: 'lead-sample',
          name: 'مستشفى الشروق التخصصي',
          temperature: 'HOT',
          score: 88,
          ownershipType: 'EXCLUSIVE',
          price: 60,
          phone: '01012345678',
          email: 'admin@shorouk-hospital.com',
        }}
        userBalance={purchaseModalState === 'insufficient_balance' ? 30 : 180}
        onConfirmPurchase={async () => {
          await new Promise((res) => setTimeout(res, 800));
        }}
        onTopUpRedirect={() => showToast('الانتقال إلى صفحة شحن الرصيد', 'info')}
      />

      <Drawer
        isOpen={isScoreDrawerOpen}
        onClose={() => setIsScoreDrawerOpen(false)}
        title="لماذا هذه الدرجة؟"
      >
        <div className="p-6">
          <ScoreBreakdown
            totalScore={85}
            rules={[
              { label: 'النشاط لا يمتلك موقعاً إلكترونياً مسجلاً', points: 30, maxWeight: 35 },
              { label: 'تقييم ممتاز على خرائط جوجل مع تفاعل نشط', points: 25, maxWeight: 30 },
              { label: 'يمتلك النشاط أكثر من فرعين تجاريين', points: 20, maxWeight: 25 },
              { label: 'رقم هاتف محمول مخصص للتواصل المباشر', points: 15, maxWeight: 20 },
              { label: 'تحديث بيانات الموقع منذ أكثر من 90 يوماً', points: -5, maxWeight: 20 },
            ]}
          />
        </div>
      </Drawer>
    </div>
  );
}
