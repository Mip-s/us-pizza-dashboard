// POS Uptime Monitor translations. Key = the English text in the code (t('...')); missing entries fall back to English.
// Placeholders like {n} must stay as they are. Alert texts from worker/core.js are matched in alertText() (App.js).
const ms = {
  'CRITICAL DOWN': 'GANGGUAN KRITIKAL', DEGRADED: 'TERJEJAS', HEALTHY: 'SIHAT', UNMONITORED: 'TIDAK DIPANTAU',
  'Operations Team': 'Pasukan Operasi', 'Area Manager': 'Pengurus Kawasan', 'Outlet Manager': 'Pengurus Cawangan', 'Food Delivery': 'Penghantaran Makanan',
  'Still fully down': 'Masih rosak sepenuhnya', 'Fully down': 'Rosak sepenuhnya', 'Still partially down': 'Masih rosak sebahagian', 'Partially down': 'Rosak sebahagian',
  '✅ {systems} back online.': '✅ {systems} kembali dalam talian.',
  '🚨 CRITICAL OUTAGE: {name} cannot take any orders — POS is completely down ({systems}). Dispatch immediately to restore service.':
    '🚨 GANGGUAN KRITIKAL: {name} tidak boleh menerima pesanan — POS rosak sepenuhnya ({systems}). Hantar bantuan segera untuk memulihkan perkhidmatan.',
  '🚨 CRITICAL OUTAGE: {name} has multiple channels completely down: {systems}. Dispatch immediately to restore service.':
    '🚨 GANGGUAN KRITIKAL: {name} mempunyai beberapa saluran yang rosak sepenuhnya: {systems}. Hantar bantuan segera untuk memulihkan perkhidmatan.',
  '✅ RESOLVED: {name} has recovered to normal operations. All channels online.': '✅ SELESAI: {name} telah pulih seperti biasa. Semua saluran dalam talian.',
  'INFO: {name} status is {status}': 'INFO: status {name} ialah {status}',
  '⚠️ DEGRADED SERVICE: {name} is operating at reduced capacity.': '⚠️ PERKHIDMATAN TERJEJAS: {name} beroperasi pada kapasiti berkurang.',
  Language: 'Bahasa', 'Live operations': 'Operasi langsung', Operations: 'Operasi', 'Sign in with your admin or manager account.': 'Log masuk dengan akaun pentadbir atau pengurus anda.',
  Email: 'E-mel', Password: 'Kata laluan', 'Signing in…': 'Sedang log masuk…', 'Sign in': 'Log masuk', 'Click to dismiss': 'Klik untuk tutup', 'Close notification': 'Tutup pemberitahuan',
  'On iPhone, tap Share → "Add to Home Screen" first, then open the app from your Home Screen to enable alerts.':
    'Pada iPhone, ketik Kongsi → "Tambah ke Skrin Utama" dahulu, kemudian buka aplikasi dari Skrin Utama untuk menghidupkan amaran.',
  'Notification permission was not granted.': 'Kebenaran pemberitahuan tidak diberikan.',
  'Could not enable notifications. Please try again.': 'Gagal menghidupkan pemberitahuan. Sila cuba lagi.',
  'Could not disable notifications. Please try again.': 'Gagal mematikan pemberitahuan. Sila cuba lagi.',
  'Live status service is not reachable. (Running locally? Start the Worker with "npx wrangler dev" too.)':
    'Perkhidmatan status langsung tidak dapat dicapai. (Berjalan secara setempat? Mulakan Worker dengan "npx wrangler dev" juga.)',
  'Could not load live status: {error}': 'Gagal memuatkan status langsung: {error}', 'Refreshing…': 'Menyegar semula…', 'Release to refresh': 'Lepaskan untuk segar semula',
  'Pull to refresh': 'Tarik untuk segar semula', '← Operations Hub': '← Hab Operasi', 'Real-time visibility across every outlet in your network.': 'Paparan masa nyata bagi setiap cawangan dalam rangkaian anda.',
  'Monitoring active': 'Pemantauan aktif', 'Updates automatically': 'Dikemas kini secara automatik', 'Refresh outlet and channel status now': 'Segar semula status cawangan dan saluran sekarang',
  Refresh: 'Segar semula', 'Add to Home Screen first (iOS requirement)': 'Tambah ke Skrin Utama dahulu (keperluan iOS)', 'Working…': 'Sedang diproses…', 'Alerts on': 'Amaran dihidupkan',
  'Enable alerts (install first)': 'Hidupkan amaran (pasang dahulu)', 'Enable alerts': 'Hidupkan amaran', 'Signed in': 'Telah log masuk', 'Sign out': 'Log keluar',
  'A new version of the dashboard is available.': 'Versi baharu papan pemuka tersedia.', 'Update now': 'Kemas kini sekarang', 'Network overview': 'Gambaran rangkaian',
  "Today's health snapshot": 'Status kesihatan hari ini', '{n} of {total} outlets monitored': '{n} daripada {total} cawangan dipantau', 'Critical outages': 'Gangguan kritikal',
  'Degraded service': 'Perkhidmatan terjejas', 'Healthy outlets': 'Cawangan sihat', 'Search outlets by name, code or area…': 'Cari cawangan mengikut nama, kod atau kawasan…',
  'Search outlets': 'Cari cawangan', '1 match': '1 padanan', '{n} matches': '{n} padanan', 'Filter by status': 'Tapis mengikut status', 'All outlets': 'Semua cawangan',
  'Loading outlets…': 'Memuatkan cawangan…', 'No outlets found': 'Tiada cawangan ditemui', 'Nothing matches "{q}". Try another name or clear the search.': 'Tiada yang sepadan dengan "{q}". Cuba nama lain atau kosongkan carian.',
  'Try selecting a different status filter.': 'Cuba pilih penapis status yang lain.', 'Unknown Outlet': 'Cawangan tidak diketahui', '{n} down': '{n} rosak', 'n/a': 't/b',
  'not monitored': 'tidak dipantau', '{n}/{total} down': '{n}/{total} rosak', 'no recent data': 'tiada data terkini', '{n}/{total} ok': '{n}/{total} ok', down: 'rosak', normal: 'normal',
  'seen {time}': 'dilihat {time}', 'All systems at {name} are operational': 'Semua sistem di {name} beroperasi', 'All systems at this outlet are operational': 'Semua sistem di cawangan ini beroperasi',
  'Last update': 'Kemas kini terakhir', 'Checking session…': 'Menyemak sesi…', 'Loading your access profile…': 'Memuatkan profil akses anda…', '{n} outlets': '{n} cawangan',
};

const zh = {
  'CRITICAL DOWN': '严重故障', DEGRADED: '部分受影响', HEALTHY: '正常', UNMONITORED: '未监控',
  'Operations Team': '运营团队', 'Area Manager': '区域经理', 'Outlet Manager': '分店经理', 'Food Delivery': '外卖平台',
  'Still fully down': '仍完全故障', 'Fully down': '完全故障', 'Still partially down': '仍部分故障', 'Partially down': '部分故障',
  '✅ {systems} back online.': '✅ {systems} 已恢复在线。',
  '🚨 CRITICAL OUTAGE: {name} cannot take any orders — POS is completely down ({systems}). Dispatch immediately to restore service.':
    '🚨 严重故障：{name} 无法接单 —— POS 完全故障（{systems}）。请立即派人恢复服务。',
  '🚨 CRITICAL OUTAGE: {name} has multiple channels completely down: {systems}. Dispatch immediately to restore service.':
    '🚨 严重故障：{name} 多个渠道完全故障：{systems}。请立即派人恢复服务。',
  '✅ RESOLVED: {name} has recovered to normal operations. All channels online.': '✅ 已解决：{name} 已恢复正常运营，所有渠道在线。',
  'INFO: {name} status is {status}': '信息：{name} 状态为 {status}',
  '⚠️ DEGRADED SERVICE: {name} is operating at reduced capacity.': '⚠️ 服务受影响：{name} 运营能力下降。',
  Language: '语言', 'Live operations': '实时运营', Operations: '运营', 'Sign in with your admin or manager account.': '请使用管理员或经理账户登录。',
  Email: '邮箱', Password: '密码', 'Signing in…': '正在登录…', 'Sign in': '登录', 'Click to dismiss': '点击关闭', 'Close notification': '关闭通知',
  'On iPhone, tap Share → "Add to Home Screen" first, then open the app from your Home Screen to enable alerts.':
    '在 iPhone 上，请先点击“分享”→“添加到主屏幕”，然后从主屏幕打开应用以开启提醒。',
  'Notification permission was not granted.': '未获得通知权限。',
  'Could not enable notifications. Please try again.': '无法开启通知，请重试。',
  'Could not disable notifications. Please try again.': '无法关闭通知，请重试。',
  'Live status service is not reachable. (Running locally? Start the Worker with "npx wrangler dev" too.)':
    '无法连接实时状态服务。（本地运行？请同时用 "npx wrangler dev" 启动 Worker。）',
  'Could not load live status: {error}': '无法加载实时状态：{error}', 'Refreshing…': '正在刷新…', 'Release to refresh': '松开即可刷新',
  'Pull to refresh': '下拉刷新', '← Operations Hub': '← 运营中心', 'Real-time visibility across every outlet in your network.': '实时掌握您网络中每家分店的状况。',
  'Monitoring active': '监控已启用', 'Updates automatically': '自动更新', 'Refresh outlet and channel status now': '立即刷新分店和渠道状态',
  Refresh: '刷新', 'Add to Home Screen first (iOS requirement)': '请先添加到主屏幕（iOS 要求）', 'Working…': '处理中…', 'Alerts on': '提醒已开启',
  'Enable alerts (install first)': '开启提醒（请先安装）', 'Enable alerts': '开启提醒', 'Signed in': '已登录', 'Sign out': '退出登录',
  'A new version of the dashboard is available.': '仪表板有新版本可用。', 'Update now': '立即更新', 'Network overview': '网络概览',
  "Today's health snapshot": '今日状况概览', '{n} of {total} outlets monitored': '已监控 {total} 家分店中的 {n} 家', 'Critical outages': '严重故障',
  'Degraded service': '服务受影响', 'Healthy outlets': '正常分店', 'Search outlets by name, code or area…': '按名称、代码或地区搜索分店…',
  'Search outlets': '搜索分店', '1 match': '1 个结果', '{n} matches': '{n} 个结果', 'Filter by status': '按状态筛选', 'All outlets': '所有分店',
  'Loading outlets…': '正在加载分店…', 'No outlets found': '未找到分店', 'Nothing matches "{q}". Try another name or clear the search.': '没有与“{q}”匹配的结果。请尝试其他名称或清除搜索。',
  'Try selecting a different status filter.': '请尝试选择其他状态筛选。', 'Unknown Outlet': '未知分店', '{n} down': '{n} 个故障', 'n/a': '无',
  'not monitored': '未监控', '{n}/{total} down': '{n}/{total} 故障', 'no recent data': '无最新数据', '{n}/{total} ok': '{n}/{total} 正常', down: '故障', normal: '正常',
  'seen {time}': '最后在线 {time}', 'All systems at {name} are operational': '{name} 的所有系统运行正常', 'All systems at this outlet are operational': '此分店的所有系统运行正常',
  'Last update': '最后更新', 'Checking session…': '正在检查会话…', 'Loading your access profile…': '正在加载您的访问权限…', '{n} outlets': '{n} 家分店',
};

const my = {
  'CRITICAL DOWN': 'အရေးကြီး ပျက်နေ', DEGRADED: 'တစ်စိတ်တစ်ပိုင်း ထိခိုက်', HEALTHY: 'ကောင်းမွန်', UNMONITORED: 'မစောင့်ကြည့်ရသေး',
  'Operations Team': 'လုပ်ငန်းအဖွဲ့', 'Area Manager': 'ဒေသမန်နေဂျာ', 'Outlet Manager': 'ဆိုင်ခွဲမန်နေဂျာ', 'Food Delivery': 'အစားအစာ ပို့ဆောင်မှု',
  'Still fully down': 'လုံးဝ ပျက်နေဆဲ', 'Fully down': 'လုံးဝ ပျက်နေ', 'Still partially down': 'တစ်စိတ်တစ်ပိုင်း ပျက်နေဆဲ', 'Partially down': 'တစ်စိတ်တစ်ပိုင်း ပျက်နေ',
  '✅ {systems} back online.': '✅ {systems} ပြန်လည် အွန်လိုင်းဖြစ်ပြီ။',
  '🚨 CRITICAL OUTAGE: {name} cannot take any orders — POS is completely down ({systems}). Dispatch immediately to restore service.':
    '🚨 အရေးကြီး ပျက်ယွင်းမှု- {name} သည် အော်ဒါ မလက်ခံနိုင်ပါ — POS လုံးဝ ပျက်နေသည် ({systems})။ ဝန်ဆောင်မှု ပြန်ရရန် ချက်ချင်း လူလွှတ်ပါ။',
  '🚨 CRITICAL OUTAGE: {name} has multiple channels completely down: {systems}. Dispatch immediately to restore service.':
    '🚨 အရေးကြီး ပျက်ယွင်းမှု- {name} တွင် ချန်နယ်များစွာ လုံးဝ ပျက်နေသည်- {systems}။ ဝန်ဆောင်မှု ပြန်ရရန် ချက်ချင်း လူလွှတ်ပါ။',
  '✅ RESOLVED: {name} has recovered to normal operations. All channels online.': '✅ ဖြေရှင်းပြီး- {name} ပုံမှန်အတိုင်း ပြန်လည်လည်ပတ်နေပြီ။ ချန်နယ်အားလုံး အွန်လိုင်း။',
  'INFO: {name} status is {status}': 'အချက်အလက်- {name} ၏ အခြေအနေမှာ {status}',
  '⚠️ DEGRADED SERVICE: {name} is operating at reduced capacity.': '⚠️ ဝန်ဆောင်မှု ထိခိုက်- {name} သည် စွမ်းဆောင်ရည် လျော့နည်းစွာ လည်ပတ်နေသည်။',
  Language: 'ဘာသာစကား', 'Live operations': 'တိုက်ရိုက် လုပ်ငန်း', Operations: 'လုပ်ငန်း', 'Sign in with your admin or manager account.': 'သင်၏ စီမံခန့်ခွဲသူ သို့မဟုတ် မန်နေဂျာ အကောင့်ဖြင့် ဝင်ရောက်ပါ။',
  Email: 'အီးမေးလ်', Password: 'စကားဝှက်', 'Signing in…': 'ဝင်ရောက်နေသည်…', 'Sign in': 'ဝင်ရောက်ရန်', 'Click to dismiss': 'ပိတ်ရန် နှိပ်ပါ', 'Close notification': 'အသိပေးချက် ပိတ်ရန်',
  'On iPhone, tap Share → "Add to Home Screen" first, then open the app from your Home Screen to enable alerts.':
    'iPhone တွင် Share → "Add to Home Screen" ကို ဦးစွာနှိပ်ပြီး သတိပေးချက်ဖွင့်ရန် ပင်မမျက်နှာပြင်မှ အက်ပ်ကို ဖွင့်ပါ။',
  'Notification permission was not granted.': 'အသိပေးချက် ခွင့်ပြုချက် မရရှိပါ။',
  'Could not enable notifications. Please try again.': 'အသိပေးချက်များ ဖွင့်၍မရပါ။ ထပ်စမ်းကြည့်ပါ။',
  'Could not disable notifications. Please try again.': 'အသိပေးချက်များ ပိတ်၍မရပါ။ ထပ်စမ်းကြည့်ပါ။',
  'Live status service is not reachable. (Running locally? Start the Worker with "npx wrangler dev" too.)':
    'တိုက်ရိုက်အခြေအနေ ဝန်ဆောင်မှုကို ဆက်သွယ်၍ မရပါ။ (စက်တွင်းတွင် run နေပါသလား။ Worker ကို "npx wrangler dev" ဖြင့်လည်း စတင်ပါ။)',
  'Could not load live status: {error}': 'တိုက်ရိုက်အခြေအနေကို ဖွင့်၍မရပါ- {error}', 'Refreshing…': 'ပြန်လည်ဖွင့်နေသည်…', 'Release to refresh': 'ပြန်လည်ဖွင့်ရန် လွှတ်ပါ',
  'Pull to refresh': 'ပြန်လည်ဖွင့်ရန် ဆွဲချပါ', '← Operations Hub': '← လုပ်ငန်းဗဟို', 'Real-time visibility across every outlet in your network.': 'သင့်ကွန်ရက်ရှိ ဆိုင်ခွဲတိုင်းကို အချိန်နှင့်တပြေးညီ မြင်နိုင်သည်။',
  'Monitoring active': 'စောင့်ကြည့်နေသည်', 'Updates automatically': 'အလိုအလျောက် အပ်ဒိတ်လုပ်သည်', 'Refresh outlet and channel status now': 'ဆိုင်ခွဲနှင့် ချန်နယ် အခြေအနေကို ယခု ပြန်လည်ဖွင့်ရန်',
  Refresh: 'ပြန်လည်ဖွင့်ရန်', 'Add to Home Screen first (iOS requirement)': 'ပင်မမျက်နှာပြင်သို့ ဦးစွာထည့်ပါ (iOS လိုအပ်ချက်)', 'Working…': 'လုပ်ဆောင်နေသည်…', 'Alerts on': 'သတိပေးချက် ဖွင့်ထားသည်',
  'Enable alerts (install first)': 'သတိပေးချက် ဖွင့်ရန် (ဦးစွာ ထည့်သွင်းပါ)', 'Enable alerts': 'သတိပေးချက် ဖွင့်ရန်', 'Signed in': 'ဝင်ရောက်ထားသည်', 'Sign out': 'ထွက်ရန်',
  'A new version of the dashboard is available.': 'ဒက်ရှ်ဘုတ် ဗားရှင်းအသစ် ရနိုင်ပါပြီ။', 'Update now': 'ယခု အပ်ဒိတ်လုပ်ရန်', 'Network overview': 'ကွန်ရက် ခြုံငုံသုံးသပ်ချက်',
  "Today's health snapshot": 'ယနေ့ အခြေအနေ အကျဉ်း', '{n} of {total} outlets monitored': 'ဆိုင်ခွဲ {total} ခုအနက် {n} ခု စောင့်ကြည့်ထားသည်', 'Critical outages': 'အရေးကြီး ပျက်ယွင်းမှုများ',
  'Degraded service': 'ဝန်ဆောင်မှု ထိခိုက်', 'Healthy outlets': 'ကောင်းမွန်သော ဆိုင်ခွဲများ', 'Search outlets by name, code or area…': 'အမည်၊ ကုဒ် သို့မဟုတ် ဒေသဖြင့် ဆိုင်ခွဲ ရှာရန်…',
  'Search outlets': 'ဆိုင်ခွဲများ ရှာရန်', '1 match': 'ကိုက်ညီမှု 1 ခု', '{n} matches': 'ကိုက်ညီမှု {n} ခု', 'Filter by status': 'အခြေအနေအလိုက် စစ်ထုတ်ရန်', 'All outlets': 'ဆိုင်ခွဲအားလုံး',
  'Loading outlets…': 'ဆိုင်ခွဲများ ဖွင့်နေသည်…', 'No outlets found': 'ဆိုင်ခွဲ မတွေ့ပါ', 'Nothing matches "{q}". Try another name or clear the search.': '"{q}" နှင့် ကိုက်ညီသည် မရှိပါ။ အခြားအမည်ဖြင့် ရှာပါ သို့မဟုတ် ရှာဖွေမှုကို ဖယ်ရှားပါ။',
  'Try selecting a different status filter.': 'အခြား အခြေအနေ စစ်ထုတ်မှုကို ရွေးကြည့်ပါ။', 'Unknown Outlet': 'အမည်မသိ ဆိုင်ခွဲ', '{n} down': '{n} ခု ပျက်နေ', 'n/a': 'မရှိ',
  'not monitored': 'မစောင့်ကြည့်ရသေး', '{n}/{total} down': '{n}/{total} ပျက်နေ', 'no recent data': 'မကြာသေးမီ ဒေတာ မရှိ', '{n}/{total} ok': '{n}/{total} ကောင်း', down: 'ပျက်နေ', normal: 'ပုံမှန်',
  'seen {time}': '{time} တွင် တွေ့ခဲ့', 'All systems at {name} are operational': '{name} ရှိ စနစ်အားလုံး အလုပ်လုပ်နေသည်', 'All systems at this outlet are operational': 'ဤဆိုင်ခွဲရှိ စနစ်အားလုံး အလုပ်လုပ်နေသည်',
  'Last update': 'နောက်ဆုံး အပ်ဒိတ်', 'Checking session…': 'ဆက်ရှင်ကို စစ်ဆေးနေသည်…', 'Loading your access profile…': 'သင်၏ ဝင်ရောက်ခွင့် ပရိုဖိုင်ကို ဖွင့်နေသည်…', '{n} outlets': 'ဆိုင်ခွဲ {n} ခု',
};

const STRINGS = { ms, zh, my };
export default STRINGS;
