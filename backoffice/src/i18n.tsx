import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from './api';

export type Lang = 'en' | 'ar';

function stored(): Lang {
  try { return localStorage.getItem('nabd-lang') === 'ar' ? 'ar' : 'en'; } catch { return 'en'; }
}
let current: Lang = stored();

/** Translate an English phrase. Unknown phrases (and data from the server such as product names) stay as they are. */
export function t(en: string, vars: Record<string, string | number> = {}): string {
  let s = (current === 'ar' ? AR[en] : undefined) ?? en;
  for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

export function dateLocale(): string {
  return current === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
}

export function errText(err: unknown): string {
  return err instanceof ApiError ? t(err.message) : t('Something went wrong.');
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => undefined });
export const useLang = () => useContext(Ctx);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  const setLang = (l: Lang) => {
    current = l;
    try { localStorage.setItem('nabd-lang', l); } catch { /* storage may be blocked */ }
    setLangState(l);
  };
  // Re-mounting on change makes every screen re-read its text and flips the layout direction.
  return <Ctx.Provider value={{ lang, setLang }}><Fragment key={lang}>{children}</Fragment></Ctx.Provider>;
}

export function LangSwitch({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useLang();
  return (
    <button className="btn btn-ghost" type="button" style={style} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}

const AR: Record<string, string> = {
  'Customers': 'العملاء',
  'Add customer': 'إضافة عميل',
  'Customer list': 'قائمة العملاء',
  'Search customers': 'بحث عن عميل',
  'Search name, phone or card number': 'ابحث بالاسم أو الهاتف أو رقم البطاقة',
  'Customer': 'العميل',
  'Phone': 'الهاتف',
  'Points': 'النقاط',
  'Owes': 'المستحق عليه',
  'Edit customer': 'تعديل العميل',
  'New customer': 'عميل جديد',
  'Details': 'التفاصيل',
  'Statement': 'كشف الحساب',
  'Address': 'العنوان',
  'Birthday': 'تاريخ الميلاد',
  'Credit limit, USD': 'سقف الدين بالدولار',
  '0 means no buying on account.': 'صفر يعني عدم الشراء بالدين.',
  'Notes': 'ملاحظات',
  'Active': 'فعّال',
  'Receive a payment': 'استلام دفعة',
  'Record payment': 'تسجيل الدفعة',
  'Adjust points': 'تعديل النقاط',
  'Adjust': 'تعديل',
  'Payment recorded.': 'تم تسجيل الدفعة.',
  'Points adjusted.': 'تم تعديل النقاط.',
  'Method': 'الطريقة',
  'Cash': 'نقداً',
  'Card': 'بطاقة',
  'Transfer': 'تحويل',
  'Other': 'أخرى',
  'Reason': 'السبب',
  'Print': 'طباعة',
  'From': 'من',
  'To': 'إلى',
  'Sale': 'بيع',
  'Payment': 'دفعة',
  'Refund': 'استرجاع',
  'Adjustment': 'تعديل',
  'Date': 'التاريخ',
  'Type': 'النوع',
  'Receipt': 'الإيصال',
  'Amount': 'المبلغ',
  'Balance': 'الرصيد',
  'Opening balance': 'الرصيد الافتتاحي',
  'Closing balance': 'الرصيد الختامي',
  'Statement for {name}': 'كشف حساب {name}',
  'Promotions and loyalty': 'العروض والولاء',
  'Add promotion': 'إضافة عرض',
  'Promotions': 'العروض',
  'Promotion': 'العرض',
  'Rule': 'القاعدة',
  'Dates': 'التواريخ',
  'Always': 'دائماً',
  'Off': 'متوقف',
  'Edit': 'تعديل',
  'Loyalty points': 'نقاط الولاء',
  'Customers earn and spend points': 'يكسب العملاء النقاط ويصرفونها',
  'Points earned per $1 spent': 'النقاط المكتسبة لكل دولار',
  'Value of one point, in cents': 'قيمة النقطة بالسنت',
  'Save loyalty rules': 'حفظ قواعد الولاء',
  'Mix and match bundle': 'حزمة اختر وامزج',
  'Percent off': 'خصم بنسبة مئوية',
  'Buy more, cheapest free': 'اشترِ أكثر والأرخص مجاناً',
  'Switched on': 'مفعّل',
  'Switch off': 'إيقاف',
  'Save': 'حفظ',
  'Starts': 'يبدأ',
  'Ends': 'ينتهي',
  'Products in this promotion': 'منتجات هذا العرض',
  'Edit promotion': 'تعديل العرض',
  'New promotion': 'عرض جديد',
  'Details ': 'التفاصيل',
  'Color': 'اللون', 'Green': 'أخضر', 'Blue': 'أزرق', 'Red': 'أحمر', 'Purple': 'بنفسجي',
  'Product picture': 'صورة المنتج', 'Change picture': 'تغيير الصورة', 'Add picture': 'إضافة صورة', 'Remove picture': 'إزالة الصورة',
  'That file could not be used as a picture.': 'تعذّر استخدام هذا الملف كصورة.',
  // general
  'Something went wrong.': 'حدث خطأ ما.',
  'Cannot reach the server. Check your connection and try again.': 'تعذّر الوصول إلى الخادم. تحقق من الاتصال وحاول مجدداً.',
  'Try again': 'حاول مجدداً',
  'Loading {what}…': 'جارٍ تحميل {what}…',
  'Loading…': 'جارٍ التحميل…',
  'Cancel': 'إلغاء',
  'Close': 'إغلاق',
  'Never': 'أبداً',
  'Just now': 'الآن',
  '{n} min ago': 'منذ {n} دقيقة',
  'Yes': 'نعم',
  'No': 'لا',
  'With PIN': 'برمز PIN',
  'Name': 'الاسم',
  'Email': 'البريد الإلكتروني',
  'Password': 'كلمة المرور',
  // server messages
  'The email or password is not right.': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'Sign in again: your session is missing or expired.': 'سجّل الدخول من جديد: انتهت الجلسة أو غير موجودة.',
  'Your role does not allow this action.': 'دورك لا يسمح بهذا الإجراء.',
  'That value already exists.': 'هذه القيمة موجودة مسبقاً.',
  'That item is still in use.': 'هذا العنصر لا يزال قيد الاستخدام.',
  'Check the highlighted fields.': 'تحقق من الحقول المحددة.',
  // roles and permissions
  'Cashier': 'أمين الصندوق',
  'Supervisor': 'مشرف',
  'Store manager': 'مدير المتجر',
  'Head office': 'المكتب الرئيسي',
  'Sell and take payment': 'البيع وقبض الدفعات',
  'Apply a discount over 5%': 'تطبيق خصم يزيد عن 5%',
  'Process a return': 'تنفيذ مرتجع',
  "Close another cashier's shift": 'إغلاق وردية أمين صندوق آخر',
  'Change prices': 'تغيير الأسعار',
  'Manage products': 'إدارة المنتجات',
  'Manage users and roles': 'إدارة المستخدمين والأدوار',
  'Manage stores and tills': 'إدارة المتاجر والصناديق',
  'View reports and dashboard': 'عرض التقارير ولوحة المعلومات',
  // login and layout
  'Sign in to the back office': 'تسجيل الدخول إلى لوحة الإدارة',
  'Sign in': 'تسجيل الدخول',
  'Signing in…': 'جارٍ تسجيل الدخول…',
  'Sign out': 'تسجيل الخروج',
  'Back office': 'لوحة الإدارة',
  'Dashboard': 'لوحة المعلومات',
  'Products': 'المنتجات',
  'Stores and tills': 'المتاجر والصناديق',
  'Shifts': 'الورديات',
  'Users and roles': 'المستخدمون والأدوار',
  // dashboard
  'All stores, today': 'جميع المتاجر، اليوم',
  'the dashboard': 'لوحة المعلومات',
  'Sales today': 'مبيعات اليوم',
  'Transactions': 'العمليات',
  'Average basket': 'متوسط السلة',
  'Sales divided by transactions': 'المبيعات مقسومة على عدد العمليات',
  'Tills online': 'الصناديق المتصلة',
  '{n} of {m}': '{n} من {m}',
  'All tills reporting': 'جميع الصناديق متصلة',
  '{n} not reporting': '{n} غير متصل',
  'Sales by hour': 'المبيعات حسب الساعة',
  'USD, all stores': 'بالدولار، جميع المتاجر',
  'Needs attention': 'يحتاج إلى انتباه',
  'Nothing needs attention right now.': 'لا شيء يحتاج إلى انتباه الآن.',
  'Top products today': 'أكثر المنتجات مبيعاً اليوم',
  'Product': 'المنتج',
  'Category': 'الفئة',
  'Units': 'الوحدات',
  'Sales': 'المبيعات',
  'No sales yet today.': 'لا مبيعات بعد اليوم.',
  'last week': 'الأسبوع الماضي',
  '{p} vs {label}': '{p} مقارنة بـ{label}',
  'No data for {label}': 'لا بيانات لـ{label}',
  // products
  'Add product': 'إضافة منتج',
  'Edit product': 'تعديل منتج',
  'New product': 'منتج جديد',
  '{n} products': '{n} منتج',
  'Product list': 'قائمة المنتجات',
  'Search products': 'بحث في المنتجات',
  'Search name or barcode': 'ابحث بالاسم أو الباركود',
  'All': 'الكل',
  'products': 'المنتجات',
  'Barcode': 'الباركود',
  'Price': 'السعر',
  'Stock': 'المخزون',
  'No product matches. Check the spelling or clear the filters.': 'لا يوجد منتج مطابق. تحقق من الإملاء أو امسح عوامل التصفية.',
  'Inactive': 'غير نشط',
  'Showing {n} of {total}': 'عرض {n} من {total}',
  'Previous': 'السابق',
  'Next': 'التالي',
  'Page {p} of {n}': 'الصفحة {p} من {n}',
  'Enter a name.': 'أدخل اسماً.',
  'Enter a price like 2.50.': 'أدخل سعراً مثل 2.50.',
  'VAT must be between 0 and 100.': 'يجب أن تكون الضريبة بين 0 و100.',
  'Use a whole number.': 'استخدم عدداً صحيحاً.',
  'No category': 'بدون فئة',
  ', barcode {code}': '، الباركود {code}',
  'Close panel': 'إغلاق اللوحة',
  'Saved. Tills pick this up on their next sync.': 'تم الحفظ. تلتقط الصناديق هذا التغيير عند مزامنتها التالية.',
  'Price, USD': 'السعر بالدولار',
  'Price, LBP': 'السعر بالليرة',
  'From the rate of {rate}': 'حسب سعر الصرف {rate}',
  'VAT, %': 'الضريبة %',
  'Reorder level': 'حد إعادة الطلب',
  'Active, can be sold': 'نشط، يمكن بيعه',
  'A price change reaches every till on its next sync. Tills that are offline keep the old price until they reconnect.': 'يصل تغيير السعر إلى كل صندوق عند مزامنته التالية. الصناديق غير المتصلة تحتفظ بالسعر القديم حتى تعود للاتصال.',
  'Saving…': 'جارٍ الحفظ…',
  'Save changes': 'حفظ التغييرات',
  'Discard': 'تجاهل',
  // tills
  'Register a till': 'تسجيل صندوق',
  '{stores} stores, {tills} tills, {online} online': '{stores} متاجر، {tills} صناديق، {online} متصلة',
  'Store': 'المتجر',
  'Till name': 'اسم الصندوق',
  'Register': 'تسجيل',
  'All online': 'الجميع متصل',
  '{online} of {tills} tills online, {waiting} sales waiting': '{online} من {tills} صناديق متصلة، {waiting} عمليات بيع بالانتظار',
  'Tills': 'الصناديق',
  'tills': 'الصناديق',
  'Till': 'الصندوق',
  'Status': 'الحالة',
  'Waiting to upload': 'بانتظار الرفع',
  'Last sync': 'آخر مزامنة',
  'App': 'التطبيق',
  'Cashier app': 'تطبيق الصندوق',
  'Online': 'متصل',
  'Offline since {when}': 'غير متصل منذ {when}',
  'Not connected yet': 'لم يتصل بعد',
  'Copy setup': 'نسخ الإعداد',
  // shifts
  'Drawer counts compared with what the sales say should be there': 'مقارنة عدّ الدرج بما يفترض أن تقوله المبيعات',
  'shifts': 'الورديات',
  'No shifts yet.': 'لا ورديات بعد.',
  'Opened': 'فُتحت',
  'Cash, USD': 'نقداً بالدولار',
  'Cash, LBP': 'نقداً بالليرة',
  'Note': 'ملاحظة',
  'Open': 'مفتوحة',
  'Matches': 'مطابقة',
  'Needs review': 'تحتاج مراجعة',
  // users
  '{users} users, {roles} roles': '{users} مستخدمين، {roles} أدوار',
  'Invite user': 'دعوة مستخدم',
  'Invite a user': 'دعوة مستخدم',
  'Role': 'الدور',
  'All stores': 'جميع المتاجر',
  'At least 8 characters': '8 أحرف على الأقل',
  'PIN': 'رمز PIN',
  '4 to 6 digits, used at the till': 'من 4 إلى 6 أرقام، يُستخدم عند الصندوق',
  'Invite': 'دعوة',
  'What each role can do': 'ما يستطيع كل دور فعله',
  'roles': 'الأدوار',
  'Permission': 'الصلاحية',
  'Users': 'المستخدمون',
  'users': 'المستخدمون',
  'Sign-in': 'تسجيل الدخول',
  'Last active': 'آخر نشاط',
  'Deactivate': 'إلغاء التفعيل',
  'Activate': 'تفعيل',
};
