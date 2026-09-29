// Push notification wording per language (the user's hub language setting, profiles.preferred_language).
// Key = the English template used in core.js; English is the key itself, so English output never changes.
// Placeholders like {name} must stay as they are.
export const LANGS = ['en', 'ms', 'zh', 'my'];
export const pickLang = (l) => (LANGS.includes(l) ? l : 'en');

const ms = {
  '✅ BACK ONLINE · {name}': '✅ KEMBALI DALAM TALIAN · {name}',
  '🚨 ALL SYSTEMS DOWN (NO SIGNAL) · {name}': '🚨 SEMUA SISTEM ROSAK (TIADA ISYARAT) · {name}',
  '✅ {back} BACK UP · {icon} {still} STILL DOWN · {name}': '✅ {back} PULIH · {icon} {still} MASIH ROSAK · {name}',
  '✅ {back} BACK UP · {icon} {status} · {name}': '✅ {back} PULIH · {icon} {status} · {name}',
  '🚨 ALL SYSTEMS DOWN · {name}': '🚨 SEMUA SISTEM ROSAK · {name}',
  '{icon} {what} DOWN · {name}': '{icon} {what} ROSAK · {name}',
  'CRITICAL DOWN': 'GANGGUAN KRITIKAL', DEGRADED: 'TERJEJAS', HEALTHY: 'SIHAT', UNMONITORED: 'TIDAK DIPANTAU',
  'Unknown Outlet': 'Cawangan tidak diketahui', 'Food Delivery': 'Penghantaran Makanan',
  '✅ {systems} back online. ': '✅ {systems} kembali dalam talian. ',
  '🚨 CRITICAL OUTAGE: {name} cannot take any orders -- POS is completely down ({systems}). Dispatch immediately to restore service.':
    '🚨 GANGGUAN KRITIKAL: {name} tidak boleh menerima pesanan — POS rosak sepenuhnya ({systems}). Hantar bantuan segera untuk memulihkan perkhidmatan.',
  '🚨 CRITICAL OUTAGE: {name} has multiple channels completely down: {systems}. Dispatch immediately to restore service.':
    '🚨 GANGGUAN KRITIKAL: {name} mempunyai beberapa saluran yang rosak sepenuhnya: {systems}. Hantar bantuan segera untuk memulihkan perkhidmatan.',
  '⚠️ DEGRADED SERVICE: {name} is operating at reduced capacity.': '⚠️ PERKHIDMATAN TERJEJAS: {name} beroperasi pada kapasiti berkurang.',
  'Still fully down': 'Masih rosak sepenuhnya', 'Fully down': 'Rosak sepenuhnya', 'Still partially down': 'Masih rosak sebahagian', 'Partially down': 'Rosak sebahagian',
  '✅ RESOLVED: {name} has recovered to normal operations. All channels online.': '✅ SELESAI: {name} telah pulih seperti biasa. Semua saluran dalam talian.',
  'INFO: {name} status is {status}': 'INFO: status {name} ialah {status}',
};

const zh = {
  '✅ BACK ONLINE · {name}': '✅ 已恢复在线 · {name}',
  '🚨 ALL SYSTEMS DOWN (NO SIGNAL) · {name}': '🚨 所有系统故障（无信号）· {name}',
  '✅ {back} BACK UP · {icon} {still} STILL DOWN · {name}': '✅ {back} 已恢复 · {icon} {still} 仍故障 · {name}',
  '✅ {back} BACK UP · {icon} {status} · {name}': '✅ {back} 已恢复 · {icon} {status} · {name}',
  '🚨 ALL SYSTEMS DOWN · {name}': '🚨 所有系统故障 · {name}',
  '{icon} {what} DOWN · {name}': '{icon} {what} 故障 · {name}',
  'CRITICAL DOWN': '严重故障', DEGRADED: '部分受影响', HEALTHY: '正常', UNMONITORED: '未监控',
  'Unknown Outlet': '未知分店', 'Food Delivery': '外卖平台',
  '✅ {systems} back online. ': '✅ {systems} 已恢复在线。',
  '🚨 CRITICAL OUTAGE: {name} cannot take any orders -- POS is completely down ({systems}). Dispatch immediately to restore service.':
    '🚨 严重故障：{name} 无法接单 —— POS 完全故障（{systems}）。请立即派人恢复服务。',
  '🚨 CRITICAL OUTAGE: {name} has multiple channels completely down: {systems}. Dispatch immediately to restore service.':
    '🚨 严重故障：{name} 多个渠道完全故障：{systems}。请立即派人恢复服务。',
  '⚠️ DEGRADED SERVICE: {name} is operating at reduced capacity.': '⚠️ 服务受影响：{name} 运营能力下降。',
  'Still fully down': '仍完全故障', 'Fully down': '完全故障', 'Still partially down': '仍部分故障', 'Partially down': '部分故障',
  '✅ RESOLVED: {name} has recovered to normal operations. All channels online.': '✅ 已解决：{name} 已恢复正常运营，所有渠道在线。',
  'INFO: {name} status is {status}': '信息：{name} 状态为 {status}',
};

const my = {
  '✅ BACK ONLINE · {name}': '✅ ပြန်လည် အွန်လိုင်း · {name}',
  '🚨 ALL SYSTEMS DOWN (NO SIGNAL) · {name}': '🚨 စနစ်အားလုံး ပျက်နေ (အချက်ပြမှု မရှိ) · {name}',
  '✅ {back} BACK UP · {icon} {still} STILL DOWN · {name}': '✅ {back} ပြန်ကောင်းပြီ · {icon} {still} ပျက်နေဆဲ · {name}',
  '✅ {back} BACK UP · {icon} {status} · {name}': '✅ {back} ပြန်ကောင်းပြီ · {icon} {status} · {name}',
  '🚨 ALL SYSTEMS DOWN · {name}': '🚨 စနစ်အားလုံး ပျက်နေ · {name}',
  '{icon} {what} DOWN · {name}': '{icon} {what} ပျက်နေ · {name}',
  'CRITICAL DOWN': 'အရေးကြီး ပျက်နေ', DEGRADED: 'တစ်စိတ်တစ်ပိုင်း ထိခိုက်', HEALTHY: 'ကောင်းမွန်', UNMONITORED: 'မစောင့်ကြည့်ရသေး',
  'Unknown Outlet': 'အမည်မသိ ဆိုင်ခွဲ', 'Food Delivery': 'အစားအစာ ပို့ဆောင်မှု',
  '✅ {systems} back online. ': '✅ {systems} ပြန်လည် အွန်လိုင်းဖြစ်ပြီ။ ',
  '🚨 CRITICAL OUTAGE: {name} cannot take any orders -- POS is completely down ({systems}). Dispatch immediately to restore service.':
    '🚨 အရေးကြီး ပျက်ယွင်းမှု- {name} သည် အော်ဒါ မလက်ခံနိုင်ပါ — POS လုံးဝ ပျက်နေသည် ({systems})။ ဝန်ဆောင်မှု ပြန်ရရန် ချက်ချင်း လူလွှတ်ပါ။',
  '🚨 CRITICAL OUTAGE: {name} has multiple channels completely down: {systems}. Dispatch immediately to restore service.':
    '🚨 အရေးကြီး ပျက်ယွင်းမှု- {name} တွင် ချန်နယ်များစွာ လုံးဝ ပျက်နေသည်- {systems}။ ဝန်ဆောင်မှု ပြန်ရရန် ချက်ချင်း လူလွှတ်ပါ။',
  '⚠️ DEGRADED SERVICE: {name} is operating at reduced capacity.': '⚠️ ဝန်ဆောင်မှု ထိခိုက်- {name} သည် စွမ်းဆောင်ရည် လျော့နည်းစွာ လည်ပတ်နေသည်။',
  'Still fully down': 'လုံးဝ ပျက်နေဆဲ', 'Fully down': 'လုံးဝ ပျက်နေ', 'Still partially down': 'တစ်စိတ်တစ်ပိုင်း ပျက်နေဆဲ', 'Partially down': 'တစ်စိတ်တစ်ပိုင်း ပျက်နေ',
  '✅ RESOLVED: {name} has recovered to normal operations. All channels online.': '✅ ဖြေရှင်းပြီး- {name} ပုံမှန်အတိုင်း ပြန်လည်လည်ပတ်နေပြီ။ ချန်နယ်အားလုံး အွန်လိုင်း။',
  'INFO: {name} status is {status}': 'အချက်အလက်- {name} ၏ အခြေအနေမှာ {status}',
};

const STRINGS = { ms, zh, my };

export function tr(lang, en, vars) {
  let s = (lang !== 'en' && STRINGS[lang]?.[en]) || en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
