import fs from 'fs';
import path from 'path';

const AR_PATH = 'src/messages/ar.json';
const EN_PATH = 'src/messages/en.json';

const ar = JSON.parse(fs.readFileSync(AR_PATH, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys = keys.concat(getAllKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const arKeys = getAllKeys(ar);
const enKeys = getAllKeys(en);
const arKeySet = new Set(arKeys);
const enKeySet = new Set(enKeys);

console.log('=== LOCALIZATION KEY COUNTS ===');
console.log('ar.json total keys:', arKeys.length);
console.log('en.json total keys:', enKeys.length);

const arNamespaces = Object.keys(ar);
const enNamespaces = Object.keys(en);
console.log('ar.json top-level namespaces count:', arNamespaces.length);
console.log('en.json top-level namespaces count:', enNamespaces.length);

const missingInEn = arKeys.filter(k => !enKeySet.has(k));
const missingInAr = enKeys.filter(k => !arKeySet.has(k));
console.log('Missing in en.json count:', missingInEn.length);
console.log('Missing in ar.json count:', missingInAr.length);

console.log('\nTop-level namespaces in ar.json:');
console.log(arNamespaces.sort().join(', '));

// Now search for all Arabic labels cited in Section 10 and Section 15
// Let's create an inverted map of values in ar.json
function getAllValues(obj, prefix = '') {
  let values = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      values = values.concat(getAllValues(obj[k], fullKey));
    } else if (typeof obj[k] === 'string') {
      values.push({ key: fullKey, value: obj[k] });
    }
  }
  return values;
}

const allArValues = getAllValues(ar);

const targetLabels = [
  // Section 10.4
  "فرصة",
  "درجة الفرصة",
  "درجة الجودة",
  "نقاط",
  "رصيد النقاط",
  "كشف الحساب",
  "فتح بيانات العميل",
  "شراء الفرصة",
  "حصري",
  "مشترك",
  "خصم زيارة ميدانية",
  "استكشاف الفرص",
  "مسار الصفقات",
  "ساخنة",
  "دافئة",
  "باردة",
  "مميزة",
  "الإبلاغ عن رقم خاطئ",
  "تم التعاقد",
  "لم تكتمل",
  "السجلات المتعثرة",
  "الإيقاف التلقائي للمصدر",
  "منع التكرار",
  "دمج السجلات",
  // Section 15.1 - 15.6
  "الحداثة",
  "التحقق",
  "التوثيق",
  "شحن الرصيد",
  "فرصة حصرية",
  "فرصة مشتركة",
  "المطابقة",
  "شروط الأهلية",
  "دمج",
  "إلغاء الدمج",
  "مصدر البيانات",
  "المتابعة والتواصل",
  "سجل المراجعة",
  "جديدة",
  "تم الشراء",
  "تم التواصل",
  "تم الرد",
  "مهتم",
  "اجتماع مجدول",
  "عرض أسعار",
  "تفاوض",
  "غير مهتم",
  "بيانات غير صالحة",
  "ممتازة",
  "جيدة",
  "تحتاج توثيق",
  "شراء باقة",
  "استرداد نقاط",
  "مكافأة",
  "تعديل إداري",
  "انتهاء صلاحية",
  "تصحيح رصيد",
  "إنستاباي",
  "فودافون كاش",
  "تحويل بنكي",
  "فوري",
  "باي موب",
  "رقم الهاتف غير صحيح",
  "النشاط التجاري مغلق",
  "يمتلك موقعاً حديثاً بالفعل",
  "غير مهتم بخدمات الويب",
  "عميل مكرر",
  "تصنيف النشاط غير صحيح",
  "الموقع الجغرافي غير صحيح"
];

console.log('\n=== VERIFYING CITED ARABIC LABELS ===');
let foundCount = 0;
let missingLabels = [];

for (const label of targetLabels) {
  // Check exact value match or containment
  const exactMatches = allArValues.filter(v => v.value.trim() === label);
  const substringMatches = allArValues.filter(v => v.value.includes(label));
  
  if (exactMatches.length > 0) {
    foundCount++;
    console.log(`[EXACT MATCH] "${label}" found at: ${exactMatches.map(m => m.key).slice(0, 3).join(', ')}${exactMatches.length > 3 ? '...' : ''}`);
  } else if (substringMatches.length > 0) {
    foundCount++;
    console.log(`[SUBSTRING MATCH] "${label}" found within: ${substringMatches.map(m => `${m.key} ("${m.value}")`).slice(0, 2).join(', ')}`);
  } else {
    missingLabels.push(label);
    console.log(`[NOT FOUND] "${label}" NOT found in ar.json!`);
  }
}

console.log(`\nFound: ${foundCount} / ${targetLabels.length}`);
console.log(`Missing count: ${missingLabels.length}`);
if (missingLabels.length > 0) {
  console.log('Missing labels:', missingLabels);
}
