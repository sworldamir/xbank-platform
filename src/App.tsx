import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3,
  Bell, Building2, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Coins, Copy, CreditCard, Crown, ExternalLink, Eye, FileText, Filter, Gift, Globe,
  Headphones, Landmark, Languages, LayoutDashboard, Lock, LogOut, Menu, MoreHorizontal,
  Plus, Search, Settings, ShieldCheck, Sparkles, Target, Ticket, TrendingDown, TrendingUp,
  Users, Wallet, X, Zap, Briefcase, CircleDollarSign, ClipboardList, Mail, LogIn, UserPlus,
  HandCoins, Rocket, SlidersHorizontal, UserRound, BadgeCheck, CalendarDays,
} from 'lucide-react';

type Locale = 'en' | 'ar' | 'tr';
type StateData = any;
type MarketSnapshot = { provider: string; quoteCurrency: string; status: string; updateIntervalMs: number; updatedAt: string | null; assets: any[] };
const EMPTY_MARKET: MarketSnapshot = { provider: 'Binance Spot', quoteCurrency: 'USDT', status: 'connecting', updateIntervalMs: 1000, updatedAt: null, assets: [] };

function formatMarketPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const price = Number(value);
  const maximumFractionDigits = price >= 100 ? 2 : price >= 1 ? 4 : 8;
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits }).format(price)} USDT`;
}

function marketUpdatedText(value: string | null) {
  if (!value) return 'Waiting for first market update';
  return `Last update ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))}`;
}

function marketStatusLabel(status: string) {
  if (status === 'live') return 'LIVE';
  if (status === 'partial') return 'PARTIAL DATA';
  if (status === 'stale') return 'STALE DATA';
  if (status === 'reconnecting') return 'RECONNECTING';
  return 'CONNECTING';
}

const dictionary: Record<Locale, Record<string, string>> = {
  en: {
    home: 'Home', dashboard: 'Dashboard', markets: 'Markets', investments: 'Investments', lottery: 'Lottery', loans: 'Loans', projects: 'Projects', wallet: 'Wallet', rewards: 'Rewards', support: 'Support', overview: 'Overview', myPortfolio: 'My Portfolio', explore: 'Explore projects', viewAll: 'View all', getStarted: 'Get started', totalBalance: 'Total balance', available: 'Available', invested: 'Invested', locked: 'Locked', totalProfit: 'Total profit', deposit: 'Deposit', withdraw: 'Withdraw', recentActivity: 'Recent activity', yourPortfolio: 'Your portfolio', projectExplorer: 'Project explorer', featuredProjects: 'Featured projects', marketWatch: 'Market watch', topMovers: 'Top movers', globalAccess: 'Global access', support247: '24/7 support', exploreMore: 'Explore more', welcome: 'Welcome back', overviewText: 'Here is what is happening with your portfolio today.', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', amount: 'Amount', network: 'Network', txid: 'Transaction ID (TXID)', submitDeposit: 'Submit deposit request', depositTitle: 'Add funds', depositInfo: 'Requests are manually reviewed. Never transfer assets until the network, token contract and destination address have been independently verified. A submitted request is not a confirmed credit.', copyAddress: 'Copy address', requestSubmitted: 'Request submitted', minimum: 'Minimum', duration: 'Duration', status: 'Status', risk: 'Risk', details: 'Details', profile: 'Profile', missions: 'Missions', level: 'Level', referral: 'Referral program', copyLink: 'Copy invite link', shares: 'Project shares', realEstate: 'Real estate', digitalAssets: 'Digital assets', stocks: 'Stocks & ETFs', cash: 'Cash', viewPortfolio: 'View full portfolio', latestNews: 'Latest updates', card: 'X3 Card', spend: 'Spend. Earn. Anywhere.', joinLottery: 'Explore lottery', logout: 'Sign out', adminPanel: 'Admin panel', demoLabel: 'Account workspace · Restricted financial services', noRealMoney: 'No real deposits, withdrawals or investment returns are processed.', notifications: 'Notifications', search: 'Search', amountRequired: 'Enter an amount', invalidTxid: 'Enter a valid transaction ID', copied: 'Copied to clipboard', projectDetails: 'Project details', simulateInvest: 'Preview investment', investDisclaimer: 'Project allocations are unavailable until the relevant product, custody, funding and regulatory approvals are completed.', community: 'Community', learnMore: 'Learn more', startNow: 'Start now', target: 'Funding target', raised: 'Raised', close: 'Close', save: 'Save changes', cancel: 'Cancel', networkAddress: 'Deposit address', chooseNetwork: 'Choose network', pendingReview: 'Pending review', noDeposits: 'No deposit requests yet.', loanDisclaimer: 'Loan applications are unavailable until lending permissions, funding sources and credit-risk controls are approved.', lotteryDisclaimer: 'Paid lottery entries and prizes remain unavailable until licensing, prize funding and draw controls are approved.', walletLedger: 'Wallet ledger', totalDeposited: 'Total deposited', totalWithdrawn: 'Total withdrawn', bonus: 'Bonus credit', profileComplete: 'Profile completion', referralEarnings: 'Referral rewards', investmentHistory: 'Investment history', comingSoon: 'Coming soon', learn: 'Learn', portfolioPerformance: 'Portfolio performance', today: 'Today', last30Days: 'Last 30 days', thisYear: 'This year', quickActions: 'Quick actions', createDeposit: 'Create a deposit request', browseProjects: 'Browse projects', systemMessage: 'System message', processingTime: 'Deposits are manually reviewed and may take up to 24 hours.',
  },
  ar: {
    home: 'الرئيسية', dashboard: 'لوحة التحكم', markets: 'الأسواق', investments: 'استثماراتي', lottery: 'اليانصيب', loans: 'القروض', projects: 'المشاريع', wallet: 'المحفظة', rewards: 'المكافآت', support: 'الدعم', overview: 'نظرة عامة', myPortfolio: 'محفظتي', explore: 'استكشف المشاريع', viewAll: 'عرض الكل', getStarted: 'ابدأ الآن', totalBalance: 'إجمالي الرصيد', available: 'متاح', invested: 'مستثمر', locked: 'مجمّد', totalProfit: 'إجمالي الأرباح', deposit: 'إيداع', withdraw: 'سحب', recentActivity: 'النشاط الأخير', yourPortfolio: 'محفظتك', projectExplorer: 'استكشاف المشاريع', featuredProjects: 'مشاريع مميزة', marketWatch: 'مراقبة السوق', topMovers: 'الأكثر نشاطاً', globalAccess: 'وصول عالمي', support247: 'دعم على مدار الساعة', exploreMore: 'اكتشف المزيد', welcome: 'مرحباً بعودتك', overviewText: 'إليك ملخص محفظتك اليوم.', pending: 'قيد الانتظار', approved: 'تمت الموافقة', rejected: 'مرفوض', amount: 'المبلغ', network: 'الشبكة', txid: 'معرّف المعاملة', submitDeposit: 'إرسال طلب الإيداع', depositTitle: 'إضافة رصيد', depositInfo: 'لا ترسل أي أصول إلا بعد التحقق المستقل من الشبكة والعقد وعنوان الوجهة وإعلان تفعيل الخدمة رسمياً. تسجيل طلب الإيداع لا يعني تأكيد الاستلام أو إضافة رصيد.', copyAddress: 'نسخ العنوان', requestSubmitted: 'تم إرسال الطلب', minimum: 'الحد الأدنى', duration: 'المدة', status: 'الحالة', risk: 'المخاطر', details: 'التفاصيل', profile: 'الملف الشخصي', missions: 'المهام', level: 'المستوى', referral: 'برنامج الإحالة', copyLink: 'نسخ رابط الدعوة', shares: 'حصص المشاريع', realEstate: 'العقارات', digitalAssets: 'الأصول الرقمية', stocks: 'الأسهم والصناديق', cash: 'النقد', viewPortfolio: 'عرض المحفظة كاملة', latestNews: 'آخر التحديثات', card: 'بطاقة X3', spend: 'أنفق واربح في كل مكان', joinLottery: 'استكشف السحب', logout: 'تسجيل الخروج', adminPanel: 'لوحة الإدارة', demoLabel: 'مساحة الحساب · الخدمات المالية المقيّدة', noRealMoney: 'لا تتم معالجة إيداعات أو عمليات سحب أو عوائد استثمارية حقيقية.', notifications: 'الإشعارات', search: 'بحث', amountRequired: 'أدخل المبلغ', invalidTxid: 'أدخل معرّف معاملة صحيحاً', copied: 'تم النسخ', projectDetails: 'تفاصيل المشروع', simulateInvest: 'معاينة الاستثمار', investDisclaimer: 'تخصيصات المشاريع تأجلت إلى حين استكمال الموافقات التنظيمية والتمويل والحفظ والموافقات الخاصة بالمنتج.', community: 'المجتمع', learnMore: 'اعرف المزيد', startNow: 'ابدأ الآن', target: 'الهدف', raised: 'تم جمعه', close: 'إغلاق', save: 'حفظ التغييرات', cancel: 'إلغاء', networkAddress: 'عنوان الإيداع', chooseNetwork: 'اختر الشبكة', pendingReview: 'بانتظار المراجعة', noDeposits: 'لا توجد طلبات إيداع بعد.', loanDisclaimer: 'طلبات القروض غير متاحة إلى حين اعتماد التراخيص ومصادر التمويل وضوابط مخاطر الائتمان.', lotteryDisclaimer: 'المشاركة المدفوعة والجوائز غير متاحة إلى حين اعتماد الترخيص وتمويل الجوائز وضوابط السحب.', walletLedger: 'سجل المحفظة', totalDeposited: 'إجمالي الإيداعات', totalWithdrawn: 'إجمالي السحوبات', bonus: 'رصيد المكافآت', profileComplete: 'اكتمال الملف الشخصي', referralEarnings: 'مكافآت الإحالة', investmentHistory: 'سجل الاستثمارات', comingSoon: 'قريباً', learn: 'تعلّم', portfolioPerformance: 'أداء المحفظة', today: 'اليوم', last30Days: 'آخر 30 يوماً', thisYear: 'هذا العام', quickActions: 'إجراءات سريعة', createDeposit: 'إنشاء طلب إيداع', browseProjects: 'تصفح المشاريع', systemMessage: 'رسالة النظام', processingTime: 'تتم مراجعة الإيداعات يدوياً وقد تستغرق حتى 24 ساعة.',
  },
  tr: {
    home: 'Ana Sayfa', dashboard: 'Kontrol Paneli', markets: 'Piyasalar', investments: 'Yatırımlar', lottery: 'Çekiliş', loans: 'Krediler', projects: 'Projeler', wallet: 'Cüzdan', rewards: 'Ödüller', support: 'Destek', overview: 'Genel Bakış', myPortfolio: 'Portföyüm', explore: 'Projeleri keşfet', viewAll: 'Tümünü gör', getStarted: 'Başla', totalBalance: 'Toplam bakiye', available: 'Kullanılabilir', invested: 'Yatırılan', locked: 'Bloke', totalProfit: 'Toplam getiri', deposit: 'Para yatır', withdraw: 'Para çek', recentActivity: 'Son hareketler', yourPortfolio: 'Portföyünüz', projectExplorer: 'Proje keşfi', featuredProjects: 'Öne çıkan projeler', marketWatch: 'Piyasa takibi', topMovers: 'Öne çıkanlar', globalAccess: 'Küresel erişim', support247: '7/24 destek', exploreMore: 'Daha fazlasını keşfet', welcome: 'Tekrar hoş geldiniz', overviewText: 'Portföyünüzde bugün olanlar.', pending: 'Beklemede', approved: 'Onaylandı', rejected: 'Reddedildi', amount: 'Tutar', network: 'Ağ', txid: 'İşlem Kimliği (TXID)', submitDeposit: 'Yatırma talebi gönder', depositTitle: 'Bakiye ekle', depositInfo: 'Ağ, token sözleşmesi ve hedef adresi bağımsız olarak doğrulamadan varlık göndermeyin. Bir yatırma talebinin gönderilmesi, ödemenin alındığı veya bakiyeye eklendiği anlamına gelmez.', copyAddress: 'Adresi kopyala', requestSubmitted: 'Talep gönderildi', minimum: 'Minimum', duration: 'Süre', status: 'Durum', risk: 'Risk', details: 'Detaylar', profile: 'Profil', missions: 'Görevler', level: 'Seviye', referral: 'Davet programı', copyLink: 'Davet bağlantısını kopyala', shares: 'Proje payları', realEstate: 'Gayrimenkul', digitalAssets: 'Dijital varlıklar', stocks: 'Hisse senetleri ve ETF', cash: 'Nakit', viewPortfolio: 'Portföyün tamamını gör', latestNews: 'Son güncellemeler', card: 'X3 Kart', spend: 'Harca. Kazan. Her yerde.', joinLottery: 'Çekilişi keşfet', logout: 'Çıkış yap', adminPanel: 'Yönetim paneli', demoLabel: 'Hesap alanı · Kısıtlı finansal hizmetler', noRealMoney: 'Gerçek para yatırma, çekme veya yatırım getirisi işlenmez.', notifications: 'Bildirimler', search: 'Ara', amountRequired: 'Bir tutar girin', invalidTxid: 'Geçerli bir işlem kimliği girin', copied: 'Panoya kopyalandı', projectDetails: 'Proje detayları', simulateInvest: 'Yatırımı önizle', investDisclaimer: 'Proje tahsisleri, ilgili ürün, saklama, fonlama ve mevzuat onayları tamamlanana kadar kullanılamaz.', community: 'Topluluk', learnMore: 'Daha fazla bilgi', startNow: 'Şimdi başla', target: 'Hedef', raised: 'Toplanan', close: 'Kapat', save: 'Değişiklikleri kaydet', cancel: 'İptal', networkAddress: 'Yatırma adresi', chooseNetwork: 'Ağ seçin', pendingReview: 'İnceleme bekliyor', noDeposits: 'Henüz yatırma talebi yok.', loanDisclaimer: 'Kredi başvuruları, gerekli izinler, fon kaynakları ve kredi riski kontrolleri onaylanana kadar kullanılamaz.', lotteryDisclaimer: 'Ücretli çekiliş katılımı ve ödüller; lisans, ödül finansmanı ve çekiliş kontrolleri onaylanana kadar kullanılamaz.', walletLedger: 'Cüzdan hareketleri', totalDeposited: 'Toplam yatırılan', totalWithdrawn: 'Toplam çekilen', bonus: 'Bonus bakiyesi', profileComplete: 'Profil tamamlanma', referralEarnings: 'Davet ödülleri', investmentHistory: 'Yatırım geçmişi', comingSoon: 'Yakında', learn: 'Öğren', portfolioPerformance: 'Portföy performansı', today: 'Bugün', last30Days: 'Son 30 gün', thisYear: 'Bu yıl', quickActions: 'Hızlı işlemler', createDeposit: 'Yatırma talebi oluştur', browseProjects: 'Projeleri incele', systemMessage: 'Sistem mesajı', processingTime: 'Yatırma işlemleri manuel olarak incelenir ve 24 saate kadar sürebilir.',
  },
};

const money = (n: number, locale = 'en') => new Intl.NumberFormat(locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));
const compact = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : money(n);
const dateText = (value: string, locale = 'en') => new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));

let csrfToken = '';

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const method = String(options?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !csrfToken) {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const csrfBody = await csrfResponse.json().catch(() => ({}));
    if (csrfResponse.ok) csrfToken = String(csrfBody.csrfToken || '');
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> || {}) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

type AuthMode = 'welcome' | 'login' | 'register' | 'admin' | 'forgot' | 'reset';

const STAFF_ROLES = ['admin', 'finance', 'support'];

function guestModeForPath(path: string): AuthMode {
  if (path.startsWith('/admin')) return 'admin';
  if (path === '/register') return 'register';
  if (path === '/login' || path === '/verify-email') return 'login';
  if (path === '/forgot-password') return 'forgot';
  if (path === '/reset-password') return 'reset';
  return 'welcome';
}

function AuthPage({ mode, onAuthenticated, message = '' }: { mode: AuthMode; onAuthenticated: (user: any) => void; message?: string }) {
  const [view, setView] = useState<AuthMode>(mode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(message);
  const [notice, setNotice] = useState('');
  const [developmentResetUrl, setDevelopmentResetUrl] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', country: '', referralCode: new URLSearchParams(window.location.search).get('ref') || '' });
  const isAdmin = view === 'admin';
  const navigate = (next: AuthMode, path: string) => {
    setView(next); setError(''); setNotice(''); setDevelopmentResetUrl(''); history.pushState({}, '', path);
  };

  useEffect(() => {
    if (window.location.pathname !== '/verify-email') return;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setError('Verification link is missing its token.'); return; }
    let active = true;
    api<any>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then((result) => { if (active) { window.location.assign('/login?verified=1'); } })
      .catch((err: any) => { if (active) setError(err.message || 'Email verification failed.'); });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      if (view === 'forgot') {
        const result = await api<any>('/api/auth/password/forgot', { method: 'POST', body: JSON.stringify({ identity: form.username || form.email }) });
        setNotice(result.message || 'If the account exists, reset instructions have been sent.');
        setDevelopmentResetUrl(result.developmentResetUrl || '');
        return;
      }
      if (view === 'reset') {
        if (form.password !== confirmPassword) throw new Error('Passwords do not match.');
        const token = new URLSearchParams(window.location.search).get('token') || '';
        const result = await api<any>('/api/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password: form.password }) });
        setNotice(result.message); setForm((current) => ({ ...current, password: '' })); setConfirmPassword('');
        window.location.assign('/login?password-reset=1'); return;
      }
      const result = view === 'register'
        ? await api<any>('/api/auth/register', { method: 'POST', body: JSON.stringify({ ...form, locale: localStorage.getItem('xbank-locale') || 'en' }) })
        : await api<any>('/api/auth/login', { method: 'POST', body: JSON.stringify({ identity: form.username || form.email, password: form.password, adminOnly: isAdmin }) });
      if (result.csrfToken) csrfToken = String(result.csrfToken);
      onAuthenticated(result.user);
    } catch (err: any) { setError(err.message || 'Unable to continue.'); }
    finally { setLoading(false); }
  };

  const cardTitle = isAdmin ? 'Administrator sign in' : view === 'register' ? 'Create your account' : view === 'forgot' ? 'Recover your account' : view === 'reset' ? 'Choose a new password' : 'Sign in to XBank';
  const cardDescription = isAdmin ? 'This private route is restricted to authorised staff.' : view === 'register' ? 'Create an account to access your personal workspace.' : view === 'forgot' ? 'Enter your registered email or username. If an account matches, recovery instructions will be sent.' : view === 'reset' ? 'Choose a strong password that you have not used before.' : 'Use your registered email or username to continue.';
  return <div className="auth-shell" dir="ltr">
    <div className="auth-backdrop" />
    <header className="auth-header"><div className="auth-brand"><span>XB</span><b>XBANK</b></div><div className="auth-header-actions">{!isAdmin && <><button onClick={() => navigate('login','/login')}>Sign in</button><button className="auth-header-primary" onClick={() => navigate('register','/register')}>Create account</button></>}</div></header>
    <main className="auth-main">
      {view === 'welcome' ? <section className="auth-hero">
        <div className="auth-eyebrow"><span/> FINANCIAL WORKSPACE · GLOBAL MARKETS</div>
        <h1>Clarity for every<br/><em>financial decision.</em></h1>
        <p>Manage your account, explore project information and follow digital-asset markets through one multilingual workspace.</p>
        <div className="auth-hero-actions"><button className="auth-cta" onClick={() => navigate('register','/register')}>Create account <ArrowRight size={17}/></button><button className="auth-secondary" onClick={() => navigate('login','/login')}>Sign in <LogIn size={16}/></button></div>
        <div className="auth-features"><span><ShieldCheck size={16}/> Account security</span><span><Globe size={16}/> EN · AR · TR</span><span><Activity size={16}/> Live market data</span></div>
      </section> : <section className="auth-card">
        <div className="auth-card-mark">XB</div>
        <div className="auth-card-eyebrow">{isAdmin ? 'PRIVATE ADMINISTRATION' : view === 'register' ? 'JOIN XBANK' : view === 'forgot' ? 'ACCOUNT RECOVERY' : view === 'reset' ? 'PASSWORD RESET' : 'WELCOME BACK'}</div>
        <h2>{cardTitle}</h2><p>{cardDescription}</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="admin-info-note compact" role="status"><CheckCircle2 size={17}/><p>{notice}{developmentResetUrl && <><br/><a href={developmentResetUrl}>Open development reset link</a></>}</p></div>}
        <form onSubmit={submit} className="auth-form">
          {view === 'register' && <>
            <label>Full name<input autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required minLength={2}/></label>
            <label>Username<input autoComplete="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required minLength={3} maxLength={32}/></label>
            <label>Country<input autoComplete="country-name" value={form.country} onChange={e=>setForm({...form,country:e.target.value})}/></label>
            <label>Referral code <span className="auth-optional">optional</span><input value={form.referralCode} onChange={e=>setForm({...form,referralCode:e.target.value})}/></label>
          </>}
          {view !== 'register' && view !== 'reset' && <label>{isAdmin ? 'Admin username or email' : 'Email or username'}<span className="auth-input-icon"><Mail size={16}/><input autoComplete="username" value={form.username || form.email} onChange={e=>setForm({...form,username:e.target.value,email:e.target.value})} required/></span></label>}
          {view === 'register' && <label>Email address<span className="auth-input-icon"><Mail size={16}/><input type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></span></label>}
          {view !== 'forgot' && <label>Password<input type="password" autoComplete={view === 'register' || view === 'reset' ? 'new-password' : 'current-password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required minLength={view === 'register' || view === 'reset' ? 12 : 1}/>{(view === 'register' || view === 'reset') && <small>At least 12 characters, including uppercase, lowercase and a number.</small>}</label>}
          {view === 'reset' && <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required minLength={12}/></label>}
          <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : isAdmin ? 'Enter administration' : view === 'register' ? 'Create account' : view === 'forgot' ? 'Send recovery instructions' : view === 'reset' ? 'Update password' : 'Sign in'} <ArrowRight size={16}/></button>
        </form>
        {!isAdmin && <div className="auth-switch">
          {view === 'register' ? <>Already registered? <button onClick={() => navigate('login','/login')}>Sign in</button></> : view === 'forgot' || view === 'reset' ? <>Remember your password? <button onClick={() => navigate('login','/login')}>Sign in</button></> : <>New to XBank? <button onClick={() => navigate('register','/register')}>Create account</button></>}
          {view === 'login' && <><span> · </span><button onClick={() => navigate('forgot','/forgot-password')}>Forgot password?</button></>}
        </div>}
        {isAdmin && <div className="auth-switch"><button onClick={() => window.location.assign('/')}>Return to public website</button></div>}
      </section>}
    </main>
    <footer className="auth-footer"><span>© {new Date().getFullYear()} XBank</span><span>Account services are subject to eligibility, verification and applicable terms.</span></footer>
  </div>;
}

function App() {
  const [authUser, setAuthUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const initialPath = window.location.pathname;
  const initialAuthMode: AuthMode = guestModeForPath(initialPath);
  const [guestMode, setGuestMode] = useState<AuthMode>(initialAuthMode);
  const [isAdmin, setIsAdmin] = useState(initialPath.startsWith('/admin'));
  const [locale, setLocale] = useState<Locale>((localStorage.getItem('xbank-locale') as Locale) || 'en');
  const [data, setData] = useState<StateData | null>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot>(EMPTY_MARKET);
  const [loading, setLoading] = useState(true);
  const [sitePage, setSitePage] = useState('dashboard');
  const [adminTab, setAdminTab] = useState('overview');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '100', network: 'BNB Smart Chain', txid: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '20', network: 'BNB Smart Chain', address: '' });
  const [adjustment, setAdjustment] = useState({ userId: '', amount: '25', reason: '', evidenceReference: '' });
  const [projectForm, setProjectForm] = useState({ en: '', ar: '', tr: '', category: 'Infrastructure', minimum: '100', maximum: '5000', target: '250000', duration: '90 days' });
  const [settingsDraft, setSettingsDraft] = useState<any>(null);
  const [search, setSearch] = useState('');

  const t = useCallback((key: string) => dictionary[locale][key] || dictionary.en[key] || key, [locale]);
  const refresh = useCallback(async () => {
    const state = await api<StateData>('/api/state');
    setData(state);
    setSettingsDraft(JSON.parse(JSON.stringify(state.settings)));
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const csrf = await api<any>('/api/auth/csrf');
        csrfToken = String(csrf.csrfToken || '');
        const me = await api<any>('/api/auth/me');
        const isAdminRoute = window.location.pathname.startsWith('/admin');
        const isStaff = STAFF_ROLES.includes(me.user.role);

        // Keep route intent independent from account role. A customer opening
        // /admin/login must see the private admin login, never the customer dashboard.
        if (isStaff !== isAdminRoute) {
          try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
          catch { /* The route remains locked even if the stale cookie cannot be revoked. */ }
          csrfToken = '';
          if (active) {
            setAuthUser(null);
            setData(null);
            setIsAdmin(isAdminRoute);
            setGuestMode(guestModeForPath(window.location.pathname));
          }
          return;
        }

        if (active) {
          setAuthUser(me.user);
          setIsAdmin(isAdminRoute);
          if (['en', 'ar', 'tr'].includes(me.user.locale)) setLocale(me.user.locale as Locale);
        }
      } catch {
        if (active) {
          setAuthUser(null);
          setIsAdmin(window.location.pathname.startsWith('/admin'));
          setGuestMode(guestModeForPath(window.location.pathname));
        }
      } finally {
        if (active) setAuthReady(true);
      }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!authReady || !authUser) return;
    const requestedAdminRoute = window.location.pathname.startsWith('/admin');
    const isStaff = STAFF_ROLES.includes(authUser.role);
    if (requestedAdminRoute === isStaff) return;

    let active = true;
    (async () => {
      // Switching between public and private workspaces always ends the old
      // role's session. The browser must authenticate again in the new area.
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
      catch { /* Fail closed in the UI; the protected API still enforces the role. */ }
      if (!active) return;
      csrfToken = '';
      setAuthUser(null);
      setData(null);
      setIsAdmin(requestedAdminRoute);
      setGuestMode(guestModeForPath(window.location.pathname));
    })();
    return () => { active = false; };
  }, [authReady, authUser, isAdmin]);

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    setLoading(true);
    refresh().catch((e) => setToast(e.message)).finally(() => setLoading(false));
  }, [authUser, refresh]);
  useEffect(() => {
    const source = new EventSource('/api/market/stream');
    source.onmessage = (event) => {
      try { setMarketSnapshot(JSON.parse(event.data) as MarketSnapshot); }
      catch { /* Ignore malformed market events and keep the last valid snapshot. */ }
    };
    source.onerror = () => setMarketSnapshot((current) => ({ ...current, status: current.assets.some((asset) => asset.price != null) ? 'stale' : 'reconnecting' }));
    return () => source.close();
  }, []);
  useEffect(() => { localStorage.setItem('xbank-locale', locale); document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' || isAdmin ? 'rtl' : 'ltr'; }, [locale, isAdmin]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3300); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setIsAdmin(path.startsWith('/admin'));
      setGuestMode(guestModeForPath(path));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
    catch (error: any) { setToast(error.message); }
    csrfToken = '';
    setAuthUser(null);
    setData(null);
    setIsAdmin(false);
    setGuestMode('welcome');
    history.replaceState({}, '', '/');
    setAuthReady(true);
    setLoading(false);
  };
  const openAdmin = () => {
    history.pushState({}, '', '/admin/login');
    setGuestMode('admin');
    setIsAdmin(true);
    setMobileMenu(false);
    document.documentElement.dir = 'rtl';
  };
  // Admins must not be rendered as an arbitrary customer in the public app.
  // Leaving administration signs out the staff session and opens the public landing page.
  const openSite = async () => { await logout(); };
  const notify = (message: string) => setToast(message);
  const user = data?.users?.find((u: any) => u.internalId === authUser?.internalId) || null;
  const currentUser = selectedUser ? data?.users?.find((u: any) => u.id === selectedUser) : user;
  const activeDeposits = data?.deposits?.filter((d: any) => d.status === 'pending') || [];

  const submitDeposit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await api('/api/deposits', { method: 'POST', body: JSON.stringify({ amount: Number(depositForm.amount), network: depositForm.network, txid: depositForm.txid }) });
      await refresh(); setModal(null); setDepositForm((f) => ({ ...f, txid: '' })); notify(result.message);
    } catch (error: any) { notify(error.message); }
  };
  const submitWithdrawal = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await api('/api/withdrawals', { method: 'POST', body: JSON.stringify({ amount: withdrawForm.amount, network: withdrawForm.network, address: withdrawForm.address }) });
      await refresh(); setModal(null); notify(result.message);
    } catch (error: any) { notify(error.message); }
  };

  const reviewDeposit = async (id: string, status: 'approved' | 'rejected') => {
    const rejectionNote = status === 'rejected' ? window.prompt('علت رد درخواست را وارد کنید:') : null;
    if (status === 'rejected' && rejectionNote === null) return;
    const note = status === 'rejected' ? (rejectionNote.trim() || 'مدرک پرداخت قابل تأیید نبود.') : 'TXID، شبکه، قرارداد توکن، مقصد و تسویه خارجی توسط مدیر بررسی شد.';
    let verifiedAmount: string | undefined;
    if (status === 'approved') {
      verifiedAmount = window.prompt('مبلغ واقعی دریافتی پس از بررسی تراکنش در اکسپلورر (DAI) را دقیق وارد کنید:') || undefined;
      if (!verifiedAmount) return;
      if (!window.confirm('آیا تراکنش را در اکسپلورر شبکه بررسی کرده‌اید و دریافت توکن DAI به آدرس صحیح را تأیید می‌کنید؟ این اقدام موجودی داخلی را افزایش می‌دهد.')) return;
    }
    try { const result = await api(`/api/admin/deposits/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note, verifiedAmount, confirmedExternalSettlement: status === 'approved' }) }); await refresh(); notify(result.message); }
    catch (error: any) { notify(error.message); }
  };
  const saveSettings = async () => {
    try {
      const payload = { ...settingsDraft };
      if (typeof payload.levelThresholdsJson === 'string') {
        try { payload.levelThresholds = JSON.parse(payload.levelThresholdsJson); }
        catch { throw new Error('JSON قواعد سطح‌بندی معتبر نیست.'); }
      }
      delete payload.levelThresholdsJson;
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      await refresh(); notify('تنظیمات ذخیره شد.');
    } catch (error: any) { notify(error.message); }
  };
  const updateProject = async (project: any, changes: any) => {
    try { const result = await api(`/api/admin/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(changes) }); await refresh(); notify(result.message); }
    catch (error: any) { notify(error.message); }
  };

  if (!authReady) return <div className="loading-screen"><div className="loader-mark">XB</div><span>Checking your secure session…</span></div>;
  if (!authUser || ['/forgot-password', '/reset-password', '/verify-email'].includes(window.location.pathname)) return <AuthPage key={guestMode} mode={guestMode} onAuthenticated={(nextUser) => {
    const staff = STAFF_ROLES.includes(nextUser.role);
    const adminRoute = window.location.pathname.startsWith('/admin');
    if (staff !== adminRoute) {
      setToast(adminRoute ? 'Use an authorised staff account.' : 'Staff accounts must use the private administration sign-in.');
      return;
    }
    setAuthUser(nextUser);
    setIsAdmin(adminRoute);
    history.replaceState({}, '', adminRoute ? '/admin' : '/dashboard');
  }} />;
  if (isAdmin && !STAFF_ROLES.includes(authUser.role)) return <AuthPage key="admin-login" mode="admin" onAuthenticated={(nextUser) => { if (!STAFF_ROLES.includes(nextUser.role)) return; setAuthUser(nextUser); setIsAdmin(true); history.replaceState({}, '', '/admin'); }} message="This account is not authorised for administration." />;
  if (loading || !data) return <div className="loading-screen"><div className="loader-mark">XB</div><span>Loading your secure workspace…</span></div>;
  if (!isAdmin && !user) return <div className="loading-screen"><div className="loader-mark">XB</div><span>Your account profile could not be loaded.</span><button className="auth-secondary" onClick={logout}>Sign out</button></div>;
  if (isAdmin) return <AdminApp {...{ data, activeDeposits, adminTab, setAdminTab, selectedUser, setSelectedUser, currentUser, authUser, settingsDraft, setSettingsDraft, saveSettings, reviewDeposit, refresh, notify, setModal, setAdjustment, search, setSearch, updateProject, openSite, logout }} />;
  return <>
    <div className={`site-shell ${locale === 'ar' ? 'rtl' : ''}`}>
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu"><Menu size={19}/></button>
        <button className="brand" onClick={() => setSitePage('dashboard')}><span className="brand-symbol">XB</span><span className="brand-name">BANK</span></button>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setSitePage('markets')} title={t('search')}><Search size={17}/></button>
          <label className="language-select"><Globe size={16}/><select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label="Language"><option value="en">EN</option><option value="ar">AR</option><option value="tr">TR</option></select><ChevronDown size={12}/></label>
          <button className="icon-button notification-button" onClick={() => notify('You are all caught up.')} title={t('notifications')}><Bell size={17}/><i/></button>
          <button className="profile-chip" onClick={() => setSitePage('profile')}><span className="avatar">{String(user.name || 'XB').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}</span><span><b>{user.name}</b><small>{t('level')} {user.level}</small></span><ChevronDown size={12}/></button>
          <button className="icon-button" onClick={logout} title={t('logout')}><LogOut size={17}/></button>
        </div>
      </header>
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="side-main">
          <div className="side-label">WORKSPACE</div>

          <SideButton icon={<LayoutDashboard/>} label={t('dashboard')} active={sitePage === 'dashboard'} onClick={() => { setSitePage('dashboard'); setMobileMenu(false); }}/>
          <SideButton icon={<BarChart3/>} label={t('markets')} active={sitePage === 'markets'} onClick={() => setSitePage('markets')}/>
          <SideButton icon={<Briefcase/>} label={t('investments')} active={sitePage === 'investments'} onClick={() => setSitePage('investments')}/>
          <SideButton icon={<Ticket/>} label={t('lottery')} active={sitePage === 'lottery'} onClick={() => setSitePage('lottery')}/>
          <SideButton icon={<HandCoins/>} label={t('loans')} active={sitePage === 'loans'} onClick={() => setSitePage('loans')}/>
          <SideButton icon={<Rocket/>} label={t('projects')} active={sitePage === 'projects'} onClick={() => setSitePage('projects')}/>
          <SideButton icon={<Wallet/>} label={t('wallet')} active={sitePage === 'wallet'} onClick={() => setSitePage('wallet')}/>
          <SideButton icon={<Coins/>} label={t('shares')} active={sitePage === 'shares'} onClick={() => setSitePage('shares')}/><SideButton icon={<Gift/>} label={t('rewards')} active={sitePage === 'rewards'} onClick={() => setSitePage('rewards')}/>
          <SideButton icon={<CircleHelp/>} label={t('support')} active={sitePage === 'support'} onClick={() => setSitePage('support')}/>
        </div>
        <div className="sidebar-bottom"><div className="sidebar-promo"><Sparkles size={16}/><span>BUILD<br/>INVEST<br/>GROW<br/>TOGETHER</span></div><div className="side-brand-mini"><b>XB</b><small>© 2026 XBank</small></div></div>
      </aside>
      <main className="main-area">
        <div className="demo-strip"><ShieldCheck size={13}/><span>SECURE ACCOUNT WORKSPACE</span><span className="demo-sep">•</span><span>Financial services remain disabled until compliance activation.</span>{data.settings.syntheticDemoData && <strong className="synthetic-seed-banner">SYNTHETIC TEST DATA · NOT REAL FUNDS</strong>}</div>
        {sitePage === 'dashboard' && <DashboardPage {...{ data, user, locale, t, setSitePage, setModal, notify, refresh, marketSnapshot }} />}
        {sitePage === 'projects' && <ProjectsPage {...{ data, locale, t, notify, refresh }} />}
        {sitePage === 'wallet' && <WalletPage {...{ data, user, locale, t, setModal, notify }} />}
        {sitePage === 'investments' && <InvestmentsPage {...{ data, user, locale, t }} />}
        {sitePage === 'markets' && <MarketsPage {...{ t, notify, marketSnapshot }} />}
        {sitePage === 'lottery' && <LotteryPage {...{ t, data, locale }} />}
        {sitePage === 'loans' && <LoansPage {...{ t, data, locale }} />}
        {sitePage === 'rewards' && <RewardsPage {...{ user, data, locale, t, notify, refresh }} />}
        {sitePage === 'shares' && <SharesPage {...{ data, t, locale }} />}
        {sitePage === 'profile' && <ProfilePage {...{ user, t, notify, refresh, locale }} />}
        {sitePage === 'support' && <SupportPage {...{ data, t, notify, refresh }} />}
        <footer className="site-footer"><span>XB BANK</span><span>Invest thoughtfully. Build tomorrow.</span><span>Account services · 2026</span></footer>
      </main>
    </div>
    {modal === 'deposit' && <Modal title={t('depositTitle')} onClose={() => setModal(null)}><form className="form-stack" onSubmit={submitDeposit}>
      <p className="modal-intro">{t('depositInfo')}</p>{!data.settings.financialOperationsReady || !data.settings.financialProductsEnabled?.deposits ? <div className="admin-info-note compact"><Lock size={16}/><p>Deposit intake is restricted. Do not transfer assets until the platform has completed its payment, compliance and network verification setup.</p></div> : null}
      <div className="notice-box"><Clock3 size={17}/><span>{t('processingTime')}</span></div>
      <label>{t('amount')} (DAI)<input type="number" min="1" step="0.01" value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} required/></label>
      <label>{t('chooseNetwork')}<select value={depositForm.network} onChange={(e) => setDepositForm({ ...depositForm, network: e.target.value })}><option>BNB Smart Chain</option><option>Base</option></select></label>
      <div className="address-display"><small>{t('networkAddress')} · {depositForm.network}</small><code>{data.settings.depositAddresses.find((a: any) => a.network === depositForm.network && a.active)?.address || 'Address not configured by admin'}</code><button type="button" className="text-button" onClick={() => { const a = data.settings.depositAddresses.find((x: any) => x.network === depositForm.network && x.active)?.address || ''; navigator.clipboard?.writeText(a); notify(t('copied')); }}><Copy size={14}/>{t('copyAddress')}</button><small>DAI token contract</small><code>{data.settings.depositAddresses.find((a: any) => a.network === depositForm.network && a.active)?.token_contract || 'Token contract not configured'}</code><small>Chain ID: {data.settings.depositAddresses.find((a: any) => a.network === depositForm.network && a.active)?.chain_id || (depositForm.network === 'Base' ? 8453 : 56)}</small></div>
      <label>{t('txid')}<input value={depositForm.txid} onChange={(e) => setDepositForm({ ...depositForm, txid: e.target.value })} placeholder="0x + 64 hex characters" required minLength={66} maxLength={66} pattern="0x[a-fA-F0-9]{64}" title="EVM transaction hash must be 0x plus 64 hex characters"/></label>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>{t('cancel')}</button><button type="submit" className="btn btn-primary" disabled={!data.settings.financialOperationsReady || !data.settings.financialProductsEnabled?.deposits}>{t('submitDeposit')}<ArrowRight size={15}/></button></div>
    </form></Modal>}
    {modal === 'withdraw' && <Modal title={t('withdraw')} onClose={() => setModal(null)}>{!data.settings.financialOperationsReady || !data.settings.financialProductsEnabled?.withdrawals ? <div className="admin-info-note compact"><Lock size={16}/><p>Withdrawal requests are currently restricted. No balance will be reserved and no payout can be initiated until the payment, compliance and network controls have been approved.</p></div> : <form className="form-stack" onSubmit={submitWithdrawal}><p className="modal-intro">Withdrawal requests are reserved against your available balance and reviewed by the finance team. A request does not mean that an on-chain payout has been sent.</p><label>{t('amount')} (DAI)<input type="number" min="0.01" step="0.01" value={withdrawForm.amount} onChange={e=>setWithdrawForm({...withdrawForm,amount:e.target.value})} required/></label><label>{t('chooseNetwork')}<select value={withdrawForm.network} onChange={e=>setWithdrawForm({...withdrawForm,network:e.target.value})}><option>BNB Smart Chain</option><option>Base</option></select></label><label>Destination wallet address<input dir="ltr" value={withdrawForm.address} onChange={e=>setWithdrawForm({...withdrawForm,address:e.target.value})} placeholder="0x..." required/></label><div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>{t('cancel')}</button><button type="submit" className="btn btn-primary">Submit request <ArrowRight size={15}/></button></div></form>}</Modal>}
    {modal === 'project' && <Modal title={t('projectDetails')} onClose={() => setModal(null)}><p className="modal-intro">Project participation is restricted until the project has passed compliance review and the platform is authorised to accept subscriptions.</p><div className="notice-box"><ShieldCheck size={17}/><span>Project information only · no funds will be moved.</span></div><button className="btn btn-primary full-width" onClick={() => setModal(null)}>Close <ArrowRight size={15}/></button></Modal>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </>;
}

function SideButton({ icon, label, active, onClick }: any) { return <button className={`side-button ${active ? 'selected' : ''}`} onClick={onClick}><span className="side-icon">{icon}</span><span>{label}</span>{active && <i/>}</button>; }
function Modal({ title, children, onClose }: any) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}><X size={18}/></button></div>{children}</section></div>; }
function StatCard({ icon, label, value, delta, accent = 'blue' }: any) { return <div className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><span>{label}</span><strong>{value}</strong>{delta && <small className="positive"><TrendingUp size={12}/>{delta}</small>}</div>; }
function MiniChart({ height = 36 }: { height?: number }) { return <svg className="mini-chart" viewBox="0 0 120 38" preserveAspectRatio="none" style={{ height }}><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#25d6a1" stopOpacity=".28"/><stop offset="1" stopColor="#25d6a1" stopOpacity="0"/></linearGradient></defs><path d="M0 31 C10 29 11 32 20 24 S32 26 40 20 S51 23 60 15 S75 19 82 10 S98 13 107 5 S115 6 120 2 L120 38 L0 38Z" fill="url(#chartFill)"/><path d="M0 31 C10 29 11 32 20 24 S32 26 40 20 S51 23 60 15 S75 19 82 10 S98 13 107 5 S115 6 120 2" fill="none" stroke="#33d7aa" strokeWidth="1.8"/></svg>; }

function DashboardPage({ data, user, locale, t, setSitePage, setModal, marketSnapshot }: any) {
  const wallet = user.wallet;
  const total = wallet.available + wallet.invested + wallet.locked + wallet.profit + wallet.bonus + wallet.withdrawalPending;
  const projects = data.projects.filter((p: any) => p.status === 'active').slice(0, 3);
  const activity = data.activity.filter((a: any) => a.userId === user.id).slice(0, 5);
  const stats = data.settings.stats;
  return <>
    <section className="dashboard-heading"><div><div className="eyebrow">XBANK · ACCOUNT OVERVIEW</div><h1>{t('welcome')}, {String(user.name || '').split(' ')[0]}</h1><p>{t('overviewText')}</p></div><div className="heading-actions"><button className="btn btn-outline" onClick={() => setSitePage('projects')}><Search size={15}/>{t('explore')}</button><button className="btn btn-primary" onClick={() => setModal('deposit')}><Plus size={16}/>{t('deposit')}</button></div></section>
    <section className="hero-grid"><div className="hero-banner"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-content"><div className="hero-kicker"><span className="live-dot"/> XBank account workspace</div><h2>One workspace.<br/><em>Clear account visibility.</em></h2><p>Review your account activity, explore published projects and follow digital-asset market data.</p><button className="btn btn-light" onClick={() => setSitePage('wallet')}>Open wallet <ArrowRight size={15}/></button><div className="hero-metrics"><div><b>{stats.users.toLocaleString()}</b><small>{stats.displayMode === 'manual' ? 'PUBLISHED USERS' : 'REGISTERED USERS'}</small></div><div><b>{stats.projects.toLocaleString()}</b><small>PUBLISHED PROJECTS</small></div><div><b>{data.projects.filter((p:any)=>p.status==='active').length}</b><small>ACTIVE PROJECTS</small></div></div></div><div className="hero-art"><div className="planet-glow"/><div className="planet"/><div className="rocket-art"><Rocket size={112} strokeWidth={1.1}/></div><div className="starfield">✦　·　✧　　·　✦</div></div><div className="hero-side-copy">ACCOUNT<br/>ACTIVITY<br/>AND<br/>PROJECTS</div></div>
      <div className="market-card"><div className="section-mini-head"><div><span className={marketSnapshot.status === 'live' ? 'live-dot' : 'market-dot-off'}/> MARKET WATCH <span className={`market-feed-status ${marketSnapshot.status}`}>{marketStatusLabel(marketSnapshot.status)}</span></div><button onClick={() => setSitePage('markets')}>View all <ArrowUpRight size={12}/></button></div><div className="market-tabs"><span className="active">Crypto · USDT</span><small>{marketUpdatedText(marketSnapshot.updatedAt)}</small></div>{marketSnapshot.assets.slice(0, 6).map((m: any) => <div className="market-row" key={m.base}><span className={`coin ${m.color}`}>{m.icon}</span><span className="coin-name"><b>{m.base}</b><small>{m.name}</small></span><strong>{formatMarketPrice(m.price)}</strong><small className={m.change24h === null ? '' : m.change24h < 0 ? 'negative' : 'positive'}>{m.change24h === null ? '—' : `${m.change24h > 0 ? '+' : ''}${m.change24h.toFixed(2)}%`}</small></div>)}{marketSnapshot.assets.length === 0 && <div className="market-empty">Waiting for market data feed…</div>}<div className="market-disclaimer">Binance Spot · USDT quote · {marketSnapshot.status === 'live' ? 'Streaming updates' : 'Feed not live'}</div></div>
    </section>
    <div className="stat-grid four"><StatCard icon={<Wallet/>} label={t('totalBalance')} value={money(total, locale)} accent="blue"/><StatCard icon={<Wallet/>} label={t('available')} value={money(wallet.available, locale)} accent="green"/><StatCard icon={<Briefcase/>} label={t('invested')} value={money(wallet.invested, locale)} accent="purple"/><StatCard icon={<Lock/>} label={t('locked')} value={money(wallet.locked, locale)} accent="orange"/></div>
    <section className="overview-grid"><div className="portfolio-card panel-card"><div className="panel-title"><div><span>{t('yourPortfolio')}</span><small>Balances from your account ledger</small></div><button className="icon-button subtle" onClick={() => setSitePage('wallet')}><ArrowUpRight size={16}/></button></div><div className="portfolio-total">{money(total, locale)}</div><div className="portfolio-list">{[{n:'Available',a:wallet.available,i:'$'},{n:'Invested',a:wallet.invested,i:'▦'},{n:'Locked',a:wallet.locked,i:'⌑'},{n:'Accrued profit',a:wallet.profit,i:'↗'},{n:'Bonus',a:wallet.bonus,i:'✦'},{n:'Withdrawal pending',a:wallet.withdrawalPending,i:'◷'}].map(x => <div key={x.n}><span className="portfolio-name"><i>{x.i}</i>{x.n}</span><b>{money(x.a, locale)}</b></div>)}</div><button className="panel-link" onClick={() => setSitePage('wallet')}>{t('viewPortfolio')} <ArrowRight size={12}/></button></div>
      <div className="news-card panel-card"><div className="panel-title"><div><span>{t('recentActivity')}</span><small>Recorded account transactions</small></div><button onClick={() => setSitePage('wallet')}>Open ledger <ArrowUpRight size={12}/></button></div>{activity.length ? activity.map((item:any)=><div className="news-row" key={item.id}><span><Activity size={16}/></span><div><b>{item.description}</b><small>{dateText(item.createdAt, locale)}</small></div><strong className={item.amount>=0?'amount-positive':'amount-negative'}>{item.amount>=0?'+':''}{money(item.amount,locale)}</strong></div>) : <div className="market-empty">No posted account transactions yet.</div>}</div>
      <div className="content-card"><div className="content-card-head"><div><h3>{t('featuredProjects')}</h3><p>Projects published by the platform</p></div><button className="panel-link" onClick={()=>setSitePage('projects')}>View all <ArrowRight size={12}/></button></div>{projects.length ? projects.map((p:any)=><div className="news-row" key={p.id}><span><Building2 size={16}/></span><div><b>{p.title[locale]||p.title.en}</b><small>{p.category} · {p.status}</small></div><span>{money(p.raised,locale)} / {money(p.target,locale)}</span></div>) : <div className="market-empty">No projects have been published yet.</div>}</div>
    </section>
  </>;
}

function PageHeader({ eyebrow, title, desc, action }: any) { return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>{action}</div>; }
function ProjectsPage({ data, locale, t, notify, refresh }: any) {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const categories = ['All', ...Array.from(new Set(data.projects.map((p: any) => p.category)))];
  const projects = data.projects.filter((p: any) => {
    const title = p.title?.[locale] || p.title?.en || '';
    const description = p.description?.[locale] || p.description?.en || '';
    return (category === 'All' || p.category === category) && `${title} ${description}`.toLowerCase().includes(query.toLowerCase());
  });
  const canInvest = Boolean(data.settings?.financialOperationsReady && data.settings?.financialProductsEnabled?.investments && selected?.investmentsEnabled && selected?.status === 'active' && selected?.complianceStatus === 'approved');
  const viewProject = async (project: any) => {
    try {
      await api(`/api/projects/${project.id}/view`, { method: 'POST', body: '{}' });
      await refresh(); setSelected(project); setAmount(String(project.minimum || ''));
    } catch (error: any) { notify(error.message); }
  };
  const react = async (project: any, reaction: 'like' | 'dislike' | 'clear') => {
    try {
      await api(`/api/projects/${project.id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) });
      await refresh(); setSelected({ ...project, userReaction: reaction === 'clear' ? null : reaction });
    } catch (error: any) { notify(error.message); }
  };
  const invest = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    setSubmitting(true);
    try {
      const result = await api('/api/investments', { method: 'POST', body: JSON.stringify({ projectId: selected.id, amount: Number(amount) }) });
      await refresh(); setSelected(null); notify(result.message || `Allocation ${result.investment?.id || ''} recorded.`);
    } catch (error: any) { notify(error.message); }
    finally { setSubmitting(false); }
  };
  return <>
    <PageHeader eyebrow="PROJECTS · EXPLORER" title={t('projectExplorer')} desc="Review published project information, eligibility rules and participation status." />
    <div className="filter-row"><div className="filter-pills">{categories.map((item: string) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div><div className="search-field"><Search size={15}/><input placeholder="Search projects" value={query} onChange={(event) => setQuery(event.target.value)}/></div></div>
    <div className="project-grid">{projects.map((project: any, index: number) => <article className={`project-card project-tone-${index % 4}`} key={project.id}>
      <div className="project-cover"><span>{project.category}</span><div className="project-cover-shape">{index % 2 === 0 ? <Rocket/> : <Building2/>}</div><b>{project.id}</b></div>
      <div className="project-card-body"><div className="project-card-heading"><h3>{project.title?.[locale] || project.title?.en}</h3><span className={`status-pill ${project.status}`}>{project.status}</span></div>
        <p>{project.description?.[locale] || project.description?.en}</p><div className="project-meta"><span>{t('minimum')} <b>{money(project.minimum, locale)}</b></span><span>{t('duration')} <b>{project.duration || '—'}</b></span></div>
        <div className="funding-line"><span>{t('raised')}</span><b>{project.target > 0 ? `${Math.round(project.raised / project.target * 100)}%` : '—'}</b></div>{project.target > 0 && <div className="progress-track"><i style={{ width: `${Math.min(100, project.raised / project.target * 100)}%` }}/></div>}
        <div className="project-card-foot"><small>{project.target > 0 ? `${money(project.raised, locale)} / ${money(project.target, locale)}` : 'Funding target not set'} · {project.views || 0} views</small><button className="btn btn-outline" onClick={() => viewProject(project)}>{t('details')}<ArrowRight size={13}/></button></div>
        <div className="project-actions"><button className={project.userReaction === 'like' ? 'selected' : ''} onClick={() => react(project, project.userReaction === 'like' ? 'clear' : 'like')}><CheckCircle2 size={14}/> {project.likes || 0}</button><button className={project.userReaction === 'dislike' ? 'selected' : ''} onClick={() => react(project, project.userReaction === 'dislike' ? 'clear' : 'dislike')}><X size={14}/> {project.dislikes || 0}</button></div>
      </div></article>)}</div>
    {projects.length === 0 && <EmptyState text="No published projects match your search."/>}
    {selected && <Modal title={selected.title?.[locale] || selected.title?.en} onClose={() => setSelected(null)}>
      <p className="modal-intro">{selected.description?.[locale] || selected.description?.en}</p>
      <div className="detail-line"><span>Category</span><b>{selected.category}</b></div><div className="detail-line"><span>Status</span><b>{selected.status}</b></div><div className="detail-line"><span>Compliance</span><b>{selected.complianceStatus || 'not reviewed'}</b></div><div className="detail-line"><span>Views</span><b>{selected.views || 0}</b></div><div className="detail-line"><span>Likes / dislikes</span><b>{selected.likes || 0} / {selected.dislikes || 0}</b></div>
      {canInvest ? <form className="form-stack" onSubmit={invest}><label>Allocation amount (DAI)<input type="number" min={selected.minimum} max={selected.maximum || undefined} step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} required/></label><div className="admin-info-note compact"><ShieldCheck size={16}/><p>The server re-checks identity, eligibility, project approval, funding cap and available balance inside one database transaction.</p></div><button className="btn btn-primary full-width" disabled={submitting}>{submitting?'Processing…':'Confirm allocation'}</button></form> : <div className="notice-box"><Lock size={16}/><span>Participation is restricted. This project or the platform has not completed all required compliance, payment and legal approvals.</span></div>}
      <button className="btn btn-outline full-width" onClick={() => setSelected(null)}>Close</button>
    </Modal>}
  </>;
}
function WalletPage({ data, user, locale, t, setModal }: any) {
  const [tab,setTab]=useState('all');const history=data.activity.filter((a:any)=>a.userId===user.id);const deposits=data.deposits.filter((d:any)=>d.userId===user.id);const withdrawals=data.withdrawals.filter((w:any)=>w.userId===user.id);
  const total=user.wallet.available+user.wallet.invested+user.wallet.locked+user.wallet.profit+user.wallet.bonus+user.wallet.withdrawalPending;
  return <><PageHeader eyebrow="ACCOUNT · WALLET" title={t('wallet')} desc="Account balances are derived from the platform's financial records. Pending requests are not posted transactions." action={<button className="btn btn-primary" onClick={()=>setModal('deposit')}><Plus size={15}/>{t('deposit')}</button>}/><div className="wallet-overview"><div className="wallet-balance-card"><span>{t('totalBalance')}</span><strong>{money(total,locale)}</strong><small><ShieldCheck size={13}/> Current recorded account balance</small><div className="wallet-actions"><button className="btn btn-light" onClick={()=>setModal('deposit')}><ArrowDownLeft size={15}/>{t('deposit')}</button><button className="btn btn-outline-light" onClick={()=>setModal('withdraw')}><ArrowUpRight size={15}/>{t('withdraw')}</button></div></div><div className="wallet-balance-side"><StatCard icon={<Wallet/>} label={t('available')} value={money(user.wallet.available,locale)} accent="green"/><StatCard icon={<Lock/>} label={t('locked')} value={money(user.wallet.locked,locale)} accent="orange"/><StatCard icon={<BarChart3/>} label={t('invested')} value={money(user.wallet.invested,locale)} accent="blue"/></div></div><section className="content-card"><div className="content-card-head"><div><h3>{t('walletLedger')}</h3><p>Posted transactions recorded on your account.</p></div><div className="filter-pills small-pills">{['all','deposit','withdrawal_reserve','investment_allocation','admin_adjustment'].map(v=><button className={tab===v?'active':''} onClick={()=>setTab(v)} key={v}>{v==='all'?'All':v.replaceAll('_',' ')}</button>)}</div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Reference</th><th>Description</th><th>Date</th><th>Type</th><th>Amount</th></tr></thead><tbody>{history.filter((h:any)=>tab==='all'||h.type===tab).map((h:any)=><tr key={h.id}><td>{h.id}</td><td>{h.description}</td><td>{dateText(h.createdAt,locale)}</td><td><span className={`status-pill ${h.type}`}>{h.type}</span></td><td className={h.amount>=0?'amount-positive':'amount-negative'}>{h.amount>=0?'+':''}{money(h.amount,locale)}</td></tr>)}</tbody></table></div></section><section className="content-card"><div className="content-card-head"><div><h3>Deposit and withdrawal requests</h3><p>Requests are separate from posted ledger entries.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Reference</th><th>Type</th><th>Amount</th><th>Network</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{[...deposits.map((d:any)=>({...d,kind:'Deposit'})),...withdrawals.map((w:any)=>({...w,kind:'Withdrawal'}))].sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).map((r:any)=><tr key={`${r.kind}-${r.id}`}><td>{r.id}</td><td>{r.kind}</td><td>{money(r.amount,locale)}</td><td>{r.network}</td><td><span className={`status-pill ${r.status}`}>{r.status}</span></td><td>{dateText(r.createdAt,locale)}</td></tr>)}</tbody></table></div></section></>;
}
function InvestmentsPage({ data, user, locale, t }: any) { const rows=data.investments.filter((i:any)=>i.userId===user.id); return <><PageHeader eyebrow="PORTFOLIO · ALLOCATIONS" title={t('investments')} desc="Only ledger-backed allocations are shown. No projected or unearned return is included."/><div className="stat-grid three"><StatCard icon={<Briefcase/>} label={t('invested')} value={money(user.wallet.invested,locale)} accent="blue"/><StatCard icon={<ClipboardList/>} label="Recorded allocations" value={String(rows.length)} accent="purple"/><StatCard icon={<Lock/>} label="Participation status" value="Restricted" accent="orange"/></div><div className="investment-list">{rows.map((r:any)=><div className="investment-row" key={r.id}><div className="investment-icon"><Building2/></div><div className="investment-main"><b>{r.projectTitle?.[locale]||r.projectTitle?.en||r.projectId}</b><small>{r.id} · {dateText(r.date,locale)}</small></div><div><small>Allocated</small><b>{money(r.amount,locale)}</b></div><span className={`status-pill ${r.status}`}>{r.status}</span></div>)}</div>{rows.length===0&&<EmptyState text="No investment allocations have been recorded on this account."/>}<div className="disclaimer-wide"><ShieldCheck size={17}/>No return is calculated or credited without an approved, evidenced distribution process.</div></>; }

function LayersIcon() { return <ClipboardList/>; }
function MarketsPage({ t, notify, marketSnapshot }: any) {
  const assets = marketSnapshot.assets || [];
  return <><PageHeader eyebrow="MARKETS · BINANCE SPOT FEED" title={t('markets')} desc="Live Binance Spot ticker stream. Prices are quoted in USDT and 24-hour change is a rolling window." action={<span className={`market-feed-status page-feed-status ${marketSnapshot.status}`}>{marketStatusLabel(marketSnapshot.status)}</span>}/><div className="market-feed-meta"><span><i className={marketSnapshot.status === 'live' ? 'live-dot' : 'market-dot-off'}/>{marketSnapshot.provider} · streaming feed</span><span>{marketUpdatedText(marketSnapshot.updatedAt)}</span><span>Exchange ticker update: ~1 second</span></div><div className="market-page-grid">{assets.map((coin: any) => <div className="market-large-card" key={coin.base}><span className={`coin ${coin.color}`}>{coin.icon}</span><div><b>{coin.name}</b><small>{coin.base}/USDT</small></div><strong>{formatMarketPrice(coin.price)}</strong><span className={`market-change ${coin.change24h === null ? '' : coin.change24h < 0 ? 'negative' : 'positive'}`}>{coin.change24h === null ? '—' : `${coin.change24h > 0 ? '+' : ''}${coin.change24h.toFixed(2)}%`}</span><a className="icon-button" href="https://www.binance.com/en/markets/overview" target="_blank" rel="noreferrer" title="Open Binance market data source"><ExternalLink size={14}/></a></div>)}</div>{assets.length === 0 && <div className="disclaimer-wide">No market prices have arrived yet. The server will reconnect automatically and keep the last valid prices available if the feed temporarily disconnects.</div>}<div className="disclaimer-wide"><ShieldCheck size={17}/>Prices are Binance Spot exchange quotes, not a consolidated global average. Market prices are informational only and are not used to calculate wallet balances or investment returns.</div></>;
}
function LotteryPage({ t, data, locale }: any) {
  const rounds = data.lotteryRounds || [];
  const totalTickets = rounds.reduce((sum:number, round:any) => sum + Number(round.totalTickets || 0), 0);
  const participants = Math.max(0, ...rounds.map((round:any) => Number(round.participants || 0)));
  return <><PageHeader eyebrow="LOTTERY · SAMPLE ROUND REGISTER" title={t('lottery')} desc="Sample round records are shown for interface review. Paid entries, prize collection and winner selection remain disabled."/>
    <div className="loan-panel"><div className="loan-icon"><Lock size={34}/></div><div><h2>Read-only sample data</h2><p>These rounds and ticket counts are synthetic records. No ticket can be purchased and no prize is payable.</p></div><span className="status-pill paused">Restricted</span></div>
    <div className="stat-grid three"><StatCard icon={<Ticket/>} label="Sample rounds" value={String(rounds.length)} accent="blue"/><StatCard icon={<Users/>} label="Highest participant count" value={String(participants)} accent="purple"/><StatCard icon={<ClipboardList/>} label="Sample tickets recorded" value={String(totalTickets)} accent="green"/></div>
    <div className="content-card"><div className="content-card-head"><div><h3>Lottery rounds</h3><p>Entry prices and prizes are sample values only.</p></div><span className="status-pill paused">No paid participation</span></div>
      {rounds.length ? rounds.map((round:any)=><div className="news-row" key={round.id}><span><Ticket size={16}/></span><div><b>{round.title?.[locale] || round.title?.en || round.id}</b><small>{round.id} · {dateText(round.startsAt,locale)} – {dateText(round.endsAt,locale)} · {round.participants} participants · {round.totalTickets} tickets</small><small>Your sample tickets: {round.userTickets || 0} · {round.complianceStatus}</small></div><div className="investment-main"><b>{money(round.prizeAmount,locale)}</b><small>Prize illustration</small><b>{money(round.entryPrice,locale)}</b><small>Entry illustration</small></div><span className={`status-pill ${round.status}`}>{round.status}</span></div>):<EmptyState text="No sample lottery rounds have been seeded."/>}
    </div>
  </>;
}
function LoansPage({ t, data, locale }: any) {
  const rows = data.loanApplications || [];
  return <><PageHeader eyebrow="CREDIT · APPLICATION REGISTER" title={t('loans')} desc="Synthetic application records are shown for interface review. No loan proceeds are issued and no real collateral is held."/>
    <div className="loan-panel"><div className="loan-icon"><Lock size={34}/></div><div><h2>Read-only sample applications</h2><p>Loan origination, collateral locking and repayments are disabled. Amounts below are synthetic examples.</p></div><span className="status-pill paused">Restricted</span></div>
    <div className="content-card"><div className="content-card-head"><div><h3>Loan application history</h3><p>Sample collateral and requested amounts.</p></div></div>
      {rows.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Reference</th><th>Collateral</th><th>Requested</th><th>Term</th><th>Status</th><th>Date</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.id}><td>{row.id}</td><td>{money(row.collateral,locale)}</td><td>{money(row.requested,locale)}</td><td>{row.termMonths} months</td><td><span className={`status-pill ${row.status}`}>{row.status}</span></td><td>{dateText(row.createdAt,locale)}</td></tr>)}</tbody></table></div>:<EmptyState text="No sample loan applications have been seeded."/>}
    </div>
  </>;
}


function RewardsPage({ user, data, locale, t, notify, refresh }: any) {
  const [busy,setBusy]=useState<string|null>(null);
  const inviteLink=`${window.location.origin}/register?ref=${encodeURIComponent(user.referralCode||'')}`;
  const completed=new Set(data.userMissions.filter((m:any)=>m.status==='completed').map((m:any)=>m.code));
  const claim=async(code:string)=>{setBusy(code);try{const result=await api(`/api/missions/${code}/claim`,{method:'POST',body:'{}'});await refresh();notify(result.message)}catch(e:any){notify(e.message)}finally{setBusy(null)}};
  return <><PageHeader eyebrow="ACCOUNT · REFERRALS & MISSIONS" title={t('rewards')} desc="Referral attribution and mission progress are based on your account records. Financial referral rewards remain subject to compliance approval."/><div className="referral-hero"><div><div className="eyebrow">YOUR REFERRAL LINK</div><h2>Invite with your account code.</h2><p>Invitations are attributed at registration. Rewards are not withdrawable until eligibility and compliance review are complete.</p><div className="referral-link"><code>{inviteLink}</code><button onClick={()=>{navigator.clipboard?.writeText(inviteLink);notify(t('copied'))}}><Copy size={14}/>{t('copyLink')}</button></div></div><div className="referral-graphic"><Users size={70}/><b>{user.referralCount}</b><small>DIRECT REFERRALS</small></div></div><div className="stat-grid three"><StatCard icon={<Users/>} label="Direct referrals" value={String(user.referralCount)} accent="blue"/><StatCard icon={<Gift/>} label="Rewards pending compliance" value={String(data.referralRewards.filter((r:any)=>r.status==='pending_compliance').length)} accent="orange"/><StatCard icon={<Crown/>} label={t('level')} value={`Level ${user.level}`} accent="purple"/></div><div className="content-card mission-card"><div className="content-card-head"><div><h3>{t('missions')}</h3><p>Mission completion is checked by the server and points are awarded once.</p></div><span className="status-pill active">{data.missions.filter((m:any)=>m.active).length} active</span></div>{data.missions.filter((m:any)=>m.active).map((m:any)=><div className="mission-row" key={m.code}><div><b>{m.title?.[locale]||m.title?.en||m.code}</b><small>{m.description?.[locale]||m.description?.en} · {m.points} points</small></div><div className="mission-progress"><span>{completed.has(m.code)?'Completed':'Available'}</span></div><button className="btn btn-outline" disabled={completed.has(m.code)||busy===m.code} onClick={()=>claim(m.code)}>{completed.has(m.code)?'Completed':busy===m.code?'Checking…':'Check & claim'}</button></div>)}</div><div className="content-card"><div className="content-card-head"><div><h3>Referral reward history</h3><p>Pending rewards are not included in available wallet funds.</p></div></div>{data.referralRewards.length?data.referralRewards.map((r:any,i:number)=><div className="news-row" key={`${r.referredUserId}-${i}`}><span><Gift size={15}/></span><div><b>{r.referredUserName}</b><small>{r.status} · {dateText(r.createdAt,locale)}</small></div><strong>{money(r.amount,locale)} {r.currency}</strong></div>):<EmptyState text="No referral rewards have been recorded."/>}</div></>;
}
function SharesPage({ data, t, locale }: any) {
  const rows=data.entitlements||[];
  return <><PageHeader eyebrow="PROJECT RIGHTS · ENTITLEMENTS" title={t('shares')} desc="Only entitlements recorded against your account are shown. Legal ownership or income rights require executed agreements and supporting legal references."/><div className="content-card"><div className="content-card-head"><div><h3>{t('shares')}</h3><p>Recorded entitlements and their review status.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Reference</th><th>Project</th><th>Type</th><th>Percentage</th><th>Legal reference</th><th>Status</th><th>Date</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.id}</td><td>{r.projectTitle?.[locale]||r.projectTitle?.en||'—'}</td><td>{r.type}</td><td>{Number(r.percentage).toFixed(4)}%</td><td>{r.legalReference||'—'}</td><td><span className={`status-pill ${r.status}`}>{r.status}</span></td><td>{dateText(r.createdAt,locale)}</td></tr>)}</tbody></table></div>{rows.length===0&&<EmptyState text="No share or revenue entitlements have been assigned to this account."/>}</div><div className="content-card"><div className="content-card-head"><div><h3>Distribution records</h3><p>Sample income distribution review records; none are payable from this screen.</p></div></div>{(data.distributions||[]).length ? (data.distributions||[]).map((r:any)=><div className="news-row" key={r.id}><span><Coins size={15}/></span><div><b>{r.projectTitle?.[locale]||r.projectTitle?.en||r.projectTitle}</b><small>{r.id} · {r.sourceReference} · {dateText(r.createdAt,locale)}</small></div><strong>{money(r.amount,locale)} {r.currency}</strong><span className={`status-pill ${r.status}`}>{r.status}</span></div>):<EmptyState text="No distribution review records have been seeded."/>}</div></>;
}


function ProfilePage({ user, t, notify, refresh, locale }: any) {
  const [form,setForm]=useState({name:user.name||'',country:user.country||'',province:user.province||'',birthDate:user.birthDate||'',walletAddress:user.walletAddress||'',walletNetwork:user.walletNetwork||'',locale:user.locale||locale});
  const [saving,setSaving]=useState(false);
  useEffect(()=>setForm({name:user.name||'',country:user.country||'',province:user.province||'',birthDate:user.birthDate||'',walletAddress:user.walletAddress||'',walletNetwork:user.walletNetwork||'',locale:user.locale||locale}),[user]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);try{const result=await api('/api/profile',{method:'PUT',body:JSON.stringify(form)});await refresh();notify(result.message)}catch(e:any){notify(e.message)}finally{setSaving(false)}};
  return <><PageHeader eyebrow="ACCOUNT · PERSONAL DETAILS" title={t('profile')} desc="Manage the personal and wallet details associated with your account."/><div className="profile-layout"><div className="profile-card"><div className="profile-avatar">{String(user.name||'XB').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}</div><h2>{user.name}</h2><p>{user.email}</p><span className={`status-pill ${user.status}`}>{user.status}</span><div className="profile-level"><div><b>Level {user.level}</b><span>{user.points} points</span></div></div><div className="detail-line"><span>Email verification</span><b>{user.emailVerified?'Verified':'Not verified'}</b></div>{!user.emailVerified && <button type="button" className="btn btn-outline full-width" onClick={async()=>{try{const result=await api('/api/auth/verification/resend',{method:'POST',body:'{}'});notify(result.message)}catch(error:any){notify(error.message)}}}>Resend verification email</button>}<div className="detail-line"><span>Identity status</span><b>{user.identityStatus||'pending'}</b></div></div><div className="content-card profile-details"><h3>Personal information</h3><form className="form-stack" onSubmit={submit}><label>Full name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} minLength={2} required/></label><div className="form-two"><label>Country<input value={form.country} onChange={e=>setForm({...form,country:e.target.value})}/></label><label>Province / State<input value={form.province} onChange={e=>setForm({...form,province:e.target.value})}/></label></div><label>Date of birth<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})}/></label><label>Preferred language<select value={form.locale} onChange={e=>setForm({...form,locale:e.target.value})}><option value="en">English</option><option value="ar">العربية</option><option value="tr">Türkçe</option></select></label><label>BE / EVM wallet address<input dir="ltr" value={form.walletAddress} onChange={e=>setForm({...form,walletAddress:e.target.value})} placeholder="0x..."/></label><label>Wallet network<select value={form.walletNetwork} onChange={e=>setForm({...form,walletNetwork:e.target.value})}><option value="">Select network</option><option>BNB Smart Chain</option><option>Base</option></select></label><div className="form-actions"><button className="btn btn-primary" disabled={saving}>{saving?'Saving…':'Save profile'}</button></div></form><div className="detail-line"><span>Referral code</span><b>{user.referralCode||'—'}</b></div><div className="detail-line"><span>Member since</span><b>{dateText(user.joinedAt,locale)}</b></div><div className="detail-line"><span>Account ID</span><b>{user.id}</b></div></div></div><div className="disclaimer-wide"><Lock size={17}/>Never enter a seed phrase or private key. XBank only stores a public receiving address.</div></>;
}
function SupportPage({ data, t, notify, refresh }: any) {
  const [subject,setSubject]=useState('');const [message,setMessage]=useState('');const [saving,setSaving]=useState(false);
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);try{const result=await api('/api/support/tickets',{method:'POST',body:JSON.stringify({subject,message})});await refresh();notify(`${result.message} ${result.ticket.id}`);setSubject('');setMessage('')}catch(e:any){notify(e.message)}finally{setSaving(false)}};
  return <><PageHeader eyebrow="HELP CENTER · SUPPORT" title={t('support')} desc="Create a support ticket and review the replies linked to your account."/><div className="support-grid"><div className="support-card"><Headphones size={28}/><h3>Contact support</h3><p>Your request receives a tracking reference and is saved to your account.</p><form className="form-stack" onSubmit={submit}><label>Subject<input value={subject} onChange={e=>setSubject(e.target.value)} minLength={4} maxLength={150} required/></label><label>Message<textarea value={message} onChange={e=>setMessage(e.target.value)} minLength={10} maxLength={5000} required rows={5}/></label><button className="btn btn-primary" disabled={saving}>{saving?'Submitting…':'Create support request'}</button></form></div><div className="support-card"><FileText size={28}/><h3>Security guidance</h3><p>Support staff will never need your password, private key, seed phrase or one-time verification code.</p></div></div><div className="content-card"><div className="content-card-head"><div><h3>Your support tickets</h3><p>Status and replies from the support team.</p></div></div>{data.supportTickets.length?data.supportTickets.map((ticket:any)=><div className="support-card" key={ticket.id}><div className="detail-line"><b>{ticket.subject}</b><span className={`status-pill ${ticket.status}`}>{ticket.status}</span></div><p>{ticket.message}</p><small>{ticket.id} · {dateText(ticket.createdAt)}</small>{ticket.replies.map((reply:any,i:number)=><div className="notice-box" key={i}><b>{reply.author}</b><span>{reply.body}</span><small>{dateText(reply.createdAt)}</small></div>)}</div>):<EmptyState text="You have not opened a support ticket."/>}</div></>;
}


function AdminApp(props: any) {
  const { data, activeDeposits, adminTab, setAdminTab, selectedUser, setSelectedUser, currentUser, authUser, settingsDraft, setSettingsDraft, saveSettings, reviewDeposit, refresh, notify, openSite, search, setSearch, updateProject, logout } = props;
  const [localModal, setLocalModal] = useState<string | null>(null);
  const [adj, setAdj] = useState({ userId: data.users[0]?.id || '', amount: '25', reason: '', evidenceReference: '' });
  const [missionForm, setMissionForm] = useState({ code: '', en: '', ar: '', tr: '', points: '10', type: 'manual_review' });
  const [pendingMissionRequests, setPendingMissionRequests] = useState<any[]>([]);
  const [entitlementForm, setEntitlementForm] = useState({ userId: data.users[0]?.id || '', projectId: data.projects[0]?.id || '', type: 'revenue_share', percentage: '5', legalReference: '' });
  const [supportTickets, setSupportTickets] = useState<any[]>(data.supportTickets || []);
  const [supportReply, setSupportReply] = useState<Record<string, string>>({});
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [project, setProject] = useState({ en: '', ar: '', tr: '', category: 'Infrastructure', minimum: '100', maximum: '5000', target: '250000', duration: '90 days' });
  const [depositFilter, setDepositFilter] = useState('pending');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const allAdminTabs = [
    { id: 'overview', label: 'داشبورد', icon: <LayoutDashboard/>, roles: ['admin','finance'] },
    { id: 'users', label: 'مدیریت کاربران', icon: <Users/>, roles: ['admin','finance'] },
    { id: 'deposits', label: 'مدیریت واریزی‌ها', icon: <ArrowDownLeft/>, roles: ['admin','finance'] },
    { id: 'withdrawals', label: 'مدیریت برداشت‌ها', icon: <ArrowUpRight/>, roles: ['admin','finance'] },
    { id: 'loans', label: 'درخواست‌های وام', icon: <HandCoins/>, roles: ['admin','finance'] },
    { id: 'lottery', label: 'مدیریت لاتاری', icon: <Ticket/>, roles: ['admin'] },
    { id: 'projects', label: 'مدیریت پروژه‌ها', icon: <Building2/>, roles: ['admin'] },
    { id: 'missions', label: 'مدیریت مأموریت‌ها', icon: <Target/>, roles: ['admin'] },
    { id: 'entitlements', label: 'حقوق و سهم‌های پروژه', icon: <Briefcase/>, roles: ['admin'] },
    { id: 'support', label: 'پشتیبانی کاربران', icon: <Headphones/>, roles: ['admin','support'] },
    { id: 'reports', label: 'گزارش‌ها و فعالیت‌ها', icon: <BarChart3/>, roles: ['admin','finance'] },
    { id: 'reconciliation', label: 'تطبیق دفتر کل', icon: <ShieldCheck/>, roles: ['admin','finance'] },
    { id: 'settings', label: 'تنظیمات سایت', icon: <Settings/>, roles: ['admin'] },
  ];
  const adminTabs = allAdminTabs.filter((item) => item.roles.includes(authUser?.role));
  useEffect(() => {
    if (adminTabs.length && !adminTabs.some((item) => item.id === adminTab)) setAdminTab(adminTabs[0].id);
  }, [adminTab, authUser?.role]);
  useEffect(() => {
    if (adminTab === 'support' && ['admin','support'].includes(authUser?.role)) {
      api<any>('/api/admin/support').then((result) => setSupportTickets(result.tickets || [])).catch((error) => notify(error.message));
    }
    if (adminTab === 'missions' && authUser?.role === 'admin') {
      api<any>('/api/admin/missions/pending').then((result) => setPendingMissionRequests(result.requests || [])).catch((error) => notify(error.message));
    }
    if (adminTab === 'reconciliation' && ['admin','finance'].includes(authUser?.role)) {
      api<any>('/api/admin/reconciliation').then(setReconciliation).catch((error) => notify(error.message));
    }
  }, [adminTab, authUser?.role]);
  const totalDeposited = Number(data.metrics?.totalDeposited ?? data.users.reduce((sum: number, item: any) => sum + item.wallet.deposited, 0));
  const totalAvailable = Number(data.metrics?.totalAvailable ?? data.users.reduce((sum: number, item: any) => sum + item.wallet.available, 0));
  const totalInvested = Number(data.metrics?.totalInvested ?? data.users.reduce((sum: number, item: any) => sum + item.wallet.invested, 0));
  const filteredUsers = data.users.filter((u: any) => `${u.name} ${u.id} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  const deposits = data.deposits.filter((d: any) => depositFilter === 'all' || d.status === depositFilter);
  const tabTitle = adminTabs.find((x) => x.id === adminTab)?.label || 'مدیریت';

  const reviewMission = async (code: string, userId: string, status: 'completed' | 'rejected') => {
    const note = status === 'rejected' ? window.prompt('علت رد درخواست را وارد کنید:') : null;
    if (status === 'rejected' && note === null) return;
    setSaving(true);
    try {
      const result = await api(`/api/admin/missions/${encodeURIComponent(code)}/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ status, note: note || '' }) });
      const latest = await api<any>('/api/admin/missions/pending');
      setPendingMissionRequests(latest.requests || []);
      await refresh();
      notify(result.message);
    } catch (error: any) { notify(error.message); } finally { setSaving(false); }
  };
  const createEntitlement = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const result = await api('/api/admin/entitlements', { method: 'POST', body: JSON.stringify({ ...entitlementForm, percentage: Number(entitlementForm.percentage) }) });
      await refresh();
      setEntitlementForm((current) => ({ ...current, legalReference: '' }));
      notify(result.message);
    } catch (error: any) { notify(error.message); } finally { setSaving(false); }
  };
  const saveAdjustment = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { const result = await api('/api/admin/adjustments', { method: 'POST', body: JSON.stringify({ userId: adj.userId, amount: Number(adj.amount), reason: adj.reason, evidenceReference: adj.evidenceReference }) }); await refresh(); setLocalModal(null); notify(result.message); }
    catch (error: any) { notify(error.message); } finally { setSaving(false); }
  };
  const createProject = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { const result = await api('/api/admin/projects', { method: 'POST', body: JSON.stringify({ title: { en: project.en, ar: project.ar, tr: project.tr }, description: { en: 'A research concept created from the Persian admin panel.', ar: 'مفهوم بحثي أُنشئ من لوحة الإدارة.', tr: 'Yönetim panelinden oluşturulan araştırma konsepti.' }, category: project.category, minimum: Number(project.minimum), maximum: Number(project.maximum), target: Number(project.target), duration: project.duration }) }); await refresh(); setLocalModal(null); setProject({ en: '', ar: '', tr: '', category: 'Infrastructure', minimum: '100', maximum: '5000', target: '250000', duration: '90 days' }); notify(result.message); }
    catch (error: any) { notify(error.message); } finally { setSaving(false); }
  };
  const updateAddress = (idx: number, field: string, value: any) => setSettingsDraft((prev: any) => ({ ...prev, depositAddresses: prev.depositAddresses.map((a: any, i: number) => i === idx ? { ...a, [field]: value } : a) }));
  const addAddress = () => setSettingsDraft((prev: any) => ({ ...prev, depositAddresses: [...prev.depositAddresses, { id: `addr-${Date.now()}`, network: 'Base', currency: 'DAI', address: '', token_contract: '', active: true }] }));

  return <div className="admin-shell" dir="rtl">
    <aside className="admin-sidebar">
      <button className="admin-brand" onClick={() => setAdminTab('overview')}><span>XB</span><div><b>XBank</b><small>مرکز مدیریت</small></div></button>
      <div className="admin-side-label">مدیریت سیستم</div>
      <nav className="admin-nav">{adminTabs.map((item) => <button key={item.id} className={adminTab === item.id ? 'active' : ''} onClick={() => setAdminTab(item.id)}><span>{item.icon}</span>{item.label}{item.id === 'deposits' && activeDeposits.length > 0 && <i>{activeDeposits.length}</i>}</button>)}</nav>
      <div className="admin-sidebar-bottom"><div className="admin-secure"><ShieldCheck size={18}/><div><b>مرکز مدیریت امن</b><small>کنترل دسترسی مبتنی بر نقش</small></div></div><button className="admin-nav-link" onClick={openSite}><ExternalLink size={16}/>خروج مدیر و مشاهده سایت عمومی</button><div className="admin-operator"><span className="admin-avatar">AD</span><div><b>{authUser?.name || 'کاربر مدیریت'}</b><small>{authUser?.role === 'admin' ? 'مدیر کل' : authUser?.role === 'finance' ? 'مدیر مالی' : 'پشتیبان'}</small></div><button title="خروج امن" onClick={logout}><LogOut size={15}/></button></div></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><div className="admin-breadcrumb">XBank <ChevronLeft size={13}/> پنل مدیریت <ChevronLeft size={13}/> <b>{tabTitle}</b></div><h1>{tabTitle}</h1></div><div className="admin-top-actions"><span className="admin-env"><i/> پنل خصوصی · {authUser?.role === 'admin' ? 'مدیر کل' : authUser?.role === 'finance' ? 'مالی' : 'پشتیبانی'}{data.settings.syntheticDemoData ? ' · داده آزمایشی' : ''}</span><button className="admin-icon-button" onClick={() => notify('اعلان جدیدی وجود ندارد.')}><Bell size={18}/><i/></button><span className="admin-date"><CalendarDays size={15}/> {new Date().toLocaleDateString('fa-IR')}</span></div></header>
      <div className="admin-content">
        {adminTab === 'overview' && <>
          <div className="admin-welcome"><div><span>مرکز عملیات XBank</span><h2>سلام، {authUser?.name || 'مدیر'}</h2><p>خلاصه وضعیت حساب‌ها، درخواست‌ها و رویدادهای نیازمند بررسی.</p></div><div className="welcome-icon"><BarChart3 size={36}/></div></div>
          <div className="admin-stat-grid">{[
            {label:'کل کاربران',value:Number(data.metrics?.totalUsers ?? data.users.length).toLocaleString('fa-IR'),hint:'حساب‌های ثبت‌شده',icon:<Users/>,c:'violet'},
            {label:'مجموع واریزی ثبت‌شده',value:money(totalDeposited,'en'),hint:'ثبت‌شده در پایگاه داده',icon:<ArrowDownLeft/>,c:'green'},
            {label:'موجودی آزاد کاربران',value:money(totalAvailable,'en'),hint:'مانده نمایشی',icon:<Wallet/>,c:'blue'},
            {label:'سرمایه‌گذاری ثبت‌شده',value:money(totalInvested,'en'),hint:'در تمام پروژه‌ها',icon:<BarChart3/>,c:'orange'},
          ].map((s) => <div className="admin-stat-card" key={s.label}><div className={`admin-stat-icon ${s.c}`}>{s.icon}</div><span>{s.label}</span><strong>{s.value}</strong><small>{s.hint}</small></div>)}</div>
          <div className="admin-two-col"><section className="admin-panel"><div className="admin-panel-head"><div><h3>واریزی‌های در انتظار بررسی</h3><p>درخواست‌هایی که نیاز به اقدام مدیر دارند.</p></div><button className="admin-text-action" onClick={() => setAdminTab('deposits')}>مشاهده همه <ArrowLeft size={14}/></button></div>{activeDeposits.length ? <div className="admin-compact-list">{activeDeposits.slice(0,4).map((d: any) => <div className="admin-compact-row" key={d.id}><span className="admin-deposit-icon"><ArrowDownLeft/></span><div className="admin-compact-main"><b>{d.userName}</b><small>{d.id} · {d.network}</small></div><strong>{money(d.amount)}</strong><span className="admin-status pending">در انتظار</span><button className="admin-approve-mini" onClick={() => reviewDeposit(d.id,'approved')} title="تأیید"><Check size={15}/></button></div>)}</div> : <EmptyState text="درخواست واریز در انتظار وجود ندارد."/>}<div className="admin-panel-foot"><span>مهلت هدف بررسی: حداکثر {data.settings.depositNoticeHours} ساعت</span><Clock3 size={14}/></div></section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h3>نمای کلی دارایی‌ها</h3><p>ترکیب مانده‌های ثبت‌شده در حساب‌ها.</p></div><button className="admin-icon-button" onClick={() => setAdminTab('reports')}><ArrowLeft size={15}/></button></div><div className="admin-chart-total"><strong>{money(totalAvailable + totalInvested)}</strong><span>مجموع موجودی آزاد و سرمایه‌گذاری</span></div><div className="admin-balance-bars"><div><span>موجودی آزاد</span><b>{money(totalAvailable)}</b><i><em style={{width:`${totalAvailable + totalInvested > 0 ? totalAvailable / (totalAvailable + totalInvested) * 100 : 0}%`}}/></i></div><div><span>سرمایه‌گذاری ثبت‌شده</span><b>{money(totalInvested)}</b><i><em style={{width:`${totalAvailable + totalInvested > 0 ? totalInvested / (totalAvailable + totalInvested) * 100 : 0}%`}}/></i></div></div><div className="admin-chart-legend"><span><i className="legend-dot blue-dot"/> موجودی آزاد</span><span><i className="legend-dot green-dot"/> سرمایه‌گذاری</span></div></section></div>
          <section className="admin-panel"><div className="admin-panel-head"><div><h3>آخرین فعالیت‌های مدیریتی</h3><p>تاریخچه اقدامات ثبت‌شده در سیستم.</p></div><button className="admin-text-action" onClick={() => setAdminTab('reports')}>گزارش کامل <ArrowLeft size={14}/></button></div><AuditList logs={data.auditLogs.slice(0,4)}/></section>
        </>}
        {adminTab === 'users' && <>
          <div className="admin-toolbar"><div className="admin-search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجو بر اساس نام، شناسه یا ایمیل..."/></div><button className="admin-outline-btn" onClick={() => setSearch('')}><Filter size={15}/>پاک‌کردن فیلتر</button><button className="admin-primary-btn" onClick={() => { setAdj({ userId: currentUser?.id || data.users[0]?.id || '', amount: '25', reason: '', evidenceReference: '' }); setLocalModal('adjust'); }}><Plus size={16}/>ثبت اصلاحیه موجودی</button></div>
          <div className="admin-panel"><div className="admin-panel-head"><div><h3>فهرست کاربران</h3><p>{filteredUsers.length.toLocaleString('fa-IR')} کاربر در نتایج قابل مشاهده</p></div><span className="admin-total-chip">{Number(data.metrics?.totalUsers ?? data.users.length).toLocaleString('fa-IR')} حساب کل</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>کاربر</th><th>شناسه</th><th>کشور</th><th>واریزی کل</th><th>موجودی آزاد</th><th>زیرمجموعه</th><th>سطح</th><th>وضعیت</th><th>جزئیات</th></tr></thead><tbody>{filteredUsers.map((u: any) => <tr key={u.id} className={selectedUser === u.id ? 'row-selected' : ''}><td><div className="table-user"><span>{u.name.split(' ').map((n: string)=>n[0]).join('').slice(0,2)}</span><b>{u.name}</b></div></td><td className="ltr-cell">{u.id}</td><td>{u.country}</td><td>{money(u.wallet.deposited)}</td><td>{money(u.wallet.available)}</td><td>{u.referralCount}</td><td><span className="level-chip">L{u.level}</span></td><td><span className={`admin-status ${u.status}`}>{u.status === 'active' ? 'فعال' : u.status === 'suspended' ? 'تعلیق‌شده' : u.status === 'closed' ? 'بسته‌شده' : 'در انتظار'}</span></td><td><button className="row-detail-btn" onClick={() => setSelectedUser(u.id)}>{selectedUser === u.id ? 'انتخاب شد' : 'مشاهده پرونده'}<ChevronLeft size={13}/></button></td></tr>)}</tbody></table></div></div>
          {currentUser && <UserReport user={currentUser} refresh={refresh} notify={notify} canManageIdentity={authUser?.role==='admin'} canManageStatus={authUser?.role==='admin'} onAdjust={() => { setAdj({ userId: currentUser.id, amount: '25', reason: '', evidenceReference: '' }); setLocalModal('adjust'); }} />}
        </>}
        {adminTab === 'deposits' && <>
          <div className="admin-page-intro"><div><h2>صف بررسی واریزی‌ها</h2><p>تأیید دستی درخواست‌ها پس از بررسی مدارک و اطلاعات تراکنش.</p></div><div className="deposit-sla"><Clock3 size={17}/><span>زمان هدف بررسی: حداکثر {data.settings.depositNoticeHours} ساعت</span></div></div>
          <div className="admin-stat-grid three">{[{label:'در انتظار بررسی',value:data.deposits.filter((d:any)=>d.status==='pending').length,icon:<Clock3/>,c:'orange'},{label:'تأییدشده',value:data.deposits.filter((d:any)=>d.status==='approved').length,icon:<CheckCircle2/>,c:'green'},{label:'ردشده',value:data.deposits.filter((d:any)=>d.status==='rejected').length,icon:<X/>,c:'red'}].map(x=><div className="admin-stat-card small" key={x.label}><div className={`admin-stat-icon ${x.c}`}>{x.icon}</div><span>{x.label}</span><strong>{x.value}</strong></div>)}</div>
          <div className="admin-panel"><div className="admin-panel-head"><div><h3>درخواست‌های واریز</h3><p>وضعیت هر درخواست به‌صورت مستقل ثبت می‌شود.</p></div><div className="admin-filter-tabs">{[{id:'pending',l:'در انتظار'},{id:'approved',l:'تأییدشده'},{id:'rejected',l:'ردشده'},{id:'all',l:'همه'}].map(x=><button className={depositFilter===x.id?'active':''} onClick={()=>setDepositFilter(x.id)} key={x.id}>{x.l}</button>)}</div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>شناسه درخواست</th><th>کاربر</th><th>مبلغ</th><th>شبکه</th><th>TXID</th><th>مقصد ثبت‌شده</th><th>قرارداد توکن</th><th>زمان ثبت</th><th>وضعیت</th><th>اقدام</th></tr></thead><tbody>{deposits.map((d:any)=><tr key={d.id}><td className="ltr-cell">{d.id}</td><td>{d.userName}</td><td><b>{money(d.amount)}</b></td><td>{d.network}</td><td><code className="txid">{d.txid}</code></td><td><code className="txid">{d.depositAddress || 'ثبت نشده'}</code></td><td><code className="txid">{d.tokenContract || 'ثبت نشده'}</code></td><td>{new Date(d.createdAt).toLocaleString('fa-IR')}</td><td><span className={`admin-status ${d.status}`}>{d.status==='pending'?'در انتظار':d.status==='approved'?'تأییدشده':'ردشده'}</span></td><td>{d.status==='pending'?<div className="table-actions"><button className="approve-btn" onClick={()=>reviewDeposit(d.id,'approved')}><Check size={14}/>تأیید</button><button className="reject-btn" onClick={()=>reviewDeposit(d.id,'rejected')}><X size={14}/>رد</button></div>:<span className="muted-cell">{d.note || 'بررسی‌شده'}</span>}</td></tr>)}</tbody></table>{deposits.length===0&&<EmptyState text="درخواستی در این وضعیت وجود ندارد."/>}</div></div>
          <div className="admin-info-note"><ShieldCheck size={18}/><div><b>کنترل واریز</b><p>API سامانه به‌صورت خودکار تراکنش زنجیره را تأیید نمی‌کند. مدیر مالی باید شبکه، Chain ID، قرارداد رسمی توکن، آدرس مقصد، مقدار و وضعیت تراکنش را مستقلاً در اکسپلورر معتبر بررسی کند. تأیید دستی فقط پس از این کنترل مجاز است.</p></div></div>
        </>}
        {adminTab === 'withdrawals' && <>
          <div className="admin-page-intro"><div><h2>مدیریت برداشت‌ها</h2><p>درخواست‌های برداشت رزروشده؛ پرداخت خارجی باید پیش از ثبت TXID انجام شده باشد.</p></div></div>
          <div className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>شناسه</th><th>کاربر</th><th>مبلغ</th><th>شبکه</th><th>آدرس مقصد</th><th>تاریخ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{data.withdrawals.map((w:any)=><tr key={w.id}><td>{w.id}</td><td>{data.users.find((u:any)=>u.id===w.userId)?.name || w.userName}</td><td>{money(w.amount)}</td><td>{w.network}</td><td className="ltr-cell"><code className="txid">{w.address}</code></td><td>{new Date(w.createdAt).toLocaleDateString('fa-IR')}</td><td><span className={`admin-status ${w.status}`}>{w.status==='paid'?'پرداخت‌شده':w.status==='rejected'?'ردشده':w.status==='approved'?'تأییدشده':'در انتظار'}</span></td><td>{w.status==='pending'?<div className="table-actions"><button className="approve-btn" onClick={async()=>{try{const result=await api(`/api/admin/withdrawals/${w.id}`,{method:'PATCH',body:JSON.stringify({status:'approved',note:'درخواست پس از بررسی اولیه تأیید شد؛ پرداخت هنوز انجام نشده است.'})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}><Check size={14}/>تأیید اولیه</button><button className="reject-btn" onClick={async()=>{const note=window.prompt('دلیل رد درخواست:');if(note===null)return;try{const result=await api(`/api/admin/withdrawals/${w.id}`,{method:'PATCH',body:JSON.stringify({status:'rejected',note})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}><X size={14}/>رد</button></div>:w.status==='approved'?<div className="table-actions"><button className="approve-btn" onClick={async()=>{const payoutTxid=window.prompt('پس از پرداخت واقعی در شبکه، TXID کامل EVM (0x + 64 hex) را وارد کنید:');if(!payoutTxid)return;if(!/^0x[a-fA-F0-9]{64}$/.test(payoutTxid.trim())){notify('فرمت TXID معتبر نیست.');return;}if(!window.confirm('تأیید می‌کنید که پرداخت خارجی واقعاً انجام شده و TXID در اکسپلورر بررسی شده است؟'))return;try{const result=await api(`/api/admin/withdrawals/${w.id}`,{method:'PATCH',body:JSON.stringify({status:'paid',payoutTxid,note:'پرداخت خارجی توسط مدیر پس از بررسی TXID ثبت شد.'})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}><Check size={14}/>ثبت پرداخت</button><button className="reject-btn" onClick={async()=>{const note=window.prompt('دلیل رد درخواست:');if(note===null)return;try{const result=await api(`/api/admin/withdrawals/${w.id}`,{method:'PATCH',body:JSON.stringify({status:'rejected',note})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}><X size={14}/>رد و آزادسازی</button></div>:<span className="muted-cell">{w.txid || w.note || 'نهایی‌شده'}</span>}</td></tr>)}</tbody></table>{data.withdrawals.length===0&&<EmptyState text="درخواست برداشتی ثبت نشده است."/>}</div></div>
          <div className="admin-info-note"><Lock size={18}/><div><b>ثبت تسویه خارجی</b><p>پنل هیچ تراکنش بلاکچینی را امضا یا ارسال نمی‌کند. مدیر فقط پس از انجام پرداخت خارج از سامانه، شناسه تراکنش واقعی را ثبت می‌کند.</p></div></div>
        </>}
        {adminTab === 'loans' && ['admin','finance'].includes(authUser?.role) && <>
          <div className="admin-page-intro"><div><h2>درخواست‌های وام</h2><p>سوابق نمونه برای بررسی رابط؛ هیچ وام یا وثیقه واقعی ایجاد نشده است.</p></div><span className="status-pill paused">فقط داده آزمایشی</span></div>
          <div className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>شناسه</th><th>کاربر</th><th>وثیقه نمونه</th><th>مبلغ درخواستی نمونه</th><th>مدت</th><th>وضعیت</th><th>تاریخ</th></tr></thead><tbody>{(data.loanApplications||[]).map((row:any)=><tr key={row.id}><td>{row.id}</td><td>{row.userName}</td><td>{money(row.collateral)}</td><td>{money(row.requested)}</td><td>{row.termMonths} ماه</td><td><span className={`admin-status ${row.status}`}>{row.status==='under_review'?'در حال بررسی':'ثبت‌شده'}</span></td><td>{new Date(row.createdAt).toLocaleDateString('fa-IR')}</td></tr>)}</tbody></table>{!(data.loanApplications||[]).length&&<EmptyState text="درخواست نمونه‌ای وجود ندارد."/>}</div></div>
          <div className="admin-info-note"><Lock size={18}/><div><b>عملیات وام غیرفعال است</b><p>این رکوردها فقط برای نمایش پنل هستند و هیچ وجهی پرداخت نشده یا وثیقه واقعی مسدود نشده است.</p></div></div>
        </>}
        {adminTab === 'lottery' && authUser?.role === 'admin' && <>
          <div className="admin-page-intro"><div><h2>دوره‌های لاتاری</h2><p>نمایش دوره‌ها و آمار بلیت‌های نمونه؛ فروش بلیت و قرعه‌کشی غیرفعال است.</p></div><span className="status-pill paused">بدون مشارکت پولی</span></div>
          <div className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>دوره</th><th>قیمت ورودی نمایشی</th><th>جایزه نمایشی</th><th>شرکت‌کنندگان</th><th>بلیت‌ها</th><th>شروع</th><th>پایان</th><th>وضعیت</th></tr></thead><tbody>{(data.lotteryRounds||[]).map((round:any)=><tr key={round.id}><td>{round.title?.en||round.id}</td><td>{money(round.entryPrice)}</td><td>{money(round.prizeAmount)}</td><td>{round.participants}</td><td>{round.totalTickets}</td><td>{new Date(round.startsAt).toLocaleDateString('fa-IR')}</td><td>{new Date(round.endsAt).toLocaleDateString('fa-IR')}</td><td><span className={`admin-status ${round.status}`}>{round.status==='open'?'باز (نمایشی)':'بسته'}</span></td></tr>)}</tbody></table>{!(data.lotteryRounds||[]).length&&<EmptyState text="دوره نمونه‌ای وجود ندارد."/>}</div></div>
          <div className="admin-info-note"><Lock size={18}/><div><b>قرعه‌کشی واقعی فعال نیست</b><p>دوره‌ها، تعداد شرکت‌کنندگان و بلیت‌ها داده‌های مصنوعی هستند. هیچ برنده یا جایزه قابل پرداختی تعریف نشده است.</p></div></div>
        </>}
        {adminTab === 'projects' && <>
          <div className="admin-toolbar"><div><h2>پروژه‌های ثبت‌شده</h2><p>مدیریت اطلاعات و وضعیت پروژه‌های نمایشی.</p></div><button className="admin-primary-btn" onClick={()=>setLocalModal('project')}><Plus size={16}/>افزودن پروژه</button></div><div className="admin-project-list">{data.projects.map((p:any)=><div className="admin-project-row" key={p.id}><div className="admin-project-art"><Building2/></div><div className="admin-project-main"><b>{p.title.en}</b><small>{p.id} · {p.category} · حداقل {money(p.minimum)}</small><div className="admin-project-progress"><div className="progress-track"><i style={{width:`${Math.min(100,p.raised/Math.max(1,p.target)*100)}%`}}/></div><small>{money(p.raised)} / {money(p.target)}</small></div></div><span className={`admin-status ${p.status}`}>{p.status==='active'?'فعال':p.status==='upcoming'?'آینده':'متوقف'}</span><div className="admin-project-actions"><button className="admin-outline-btn" onClick={()=>{const raw=window.prompt(`تعداد بازدید نمایشی (خالی = آمار واقعی). بازدید واقعی: ${p.actualViews ?? p.views}`,p.viewsOverride ?? p.views ?? '');if(raw===null)return;updateProject(p,{viewsOverride:raw.trim()===''?null:Number(raw)});}}><Eye size={14}/>بازدید: {p.views}</button><button className="admin-outline-btn" onClick={()=>updateProject(p,{featured:!p.featured})}>{p.featured?'حذف از ویژه':'ویژه‌کردن'}</button><select value={p.status} onChange={(e)=>updateProject(p,{status:e.target.value})}><option value="active">فعال</option><option value="upcoming">آینده</option><option value="paused">متوقف</option><option value="completed">تکمیل‌شده</option></select><select value={p.complianceStatus||'not_reviewed'} onChange={(e)=>updateProject(p,{complianceStatus:e.target.value})}><option value="not_reviewed">بررسی‌نشده</option><option value="under_review">در حال بررسی</option><option value="approved">تأیید تطبیق</option><option value="rejected">ردشده</option></select></div></div>)}</div>
        </>}
        {adminTab === 'reports' && <>
          <div className="admin-page-intro"><div><h2>گزارش‌ها و سوابق</h2><p>گزارش مبتنی بر رکوردهای ثبت‌شده در دفتر کل و رویدادهای سامانه.</p></div><button className="admin-outline-btn" onClick={()=>{const rows=[['User','Deposited','Available','Invested'],...data.users.map((u:any)=>[u.name,u.wallet.deposited,u.wallet.available,u.wallet.invested])];const csv=rows.map(r=>r.map((v:any)=>{const text=String(v??'');const safe=/^[=+@\-]/.test(text)?`'${text}`:text;return `\"${safe.replaceAll('\"','\"\"')}\"`;}).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='xbank-user-report.csv';a.click();URL.revokeObjectURL(a.href);notify('گزارش CSV ایجاد شد.');}}><FileText size={15}/>خروجی CSV کاربران</button></div>
          <div className="admin-stat-grid four">{[{l:'مجموع واریزی',v:money(totalDeposited)},{l:'موجودی آزاد',v:money(totalAvailable)},{l:'سرمایه‌گذاری',v:money(totalInvested)},{l:'تعداد تراکنش‌های ثبت‌شده',v:data.activity.length}].map(x=><div className="admin-report-tile" key={x.l}><span>{x.l}</span><b>{x.v}</b></div>)}</div>
          <div className="admin-panel"><div className="admin-panel-head"><div><h3>تاریخچه رویدادها</h3><p>تمام تغییرات مهم مدیریت در این فهرست ثبت می‌شوند.</p></div><button className="admin-outline-btn" onClick={()=>setShowAllLogs(!showAllLogs)}>{showAllLogs?'نمایش کمتر':'نمایش همه'}</button></div><AuditList logs={showAllLogs?data.auditLogs:data.auditLogs.slice(0,8)}/></div>
          <div className="admin-panel"><div className="admin-panel-head"><div><h3>خلاصه کاربران</h3><p>تفکیک موجودی واریزی، آزاد و سرمایه‌گذاری.</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>کاربر</th><th>واریزی</th><th>برداشت</th><th>موجودی آزاد</th><th>سرمایه‌گذاری</th><th>قفل‌شده</th><th>رفرال</th></tr></thead><tbody>{data.users.map((u:any)=><tr key={u.id}><td>{u.name}</td><td>{money(u.wallet.deposited)}</td><td>{money(u.wallet.withdrawn)}</td><td>{money(u.wallet.available)}</td><td>{money(u.wallet.invested)}</td><td>{money(u.wallet.locked)}</td><td>{u.referralCount}</td></tr>)}</tbody></table></div></div>
        </>}
        {adminTab === 'missions' && authUser?.role === 'admin' && <>
          <div className="admin-page-intro"><div><h2>مدیریت مأموریت‌ها</h2><p>شرایط مأموریت و امتیاز را تنظیم کنید؛ تکمیل مأموریت در سرور اعتبارسنجی می‌شود.</p></div></div>
          <section className="admin-panel settings-panel"><div className="admin-panel-head"><div><h3>ایجاد مأموریت جدید</h3><p>برای هر زبان عنوان مستقل ثبت کنید.</p></div></div>
            <form className="form-stack" onSubmit={async(e)=>{e.preventDefault();setSaving(true);try{const result=await api('/api/admin/missions',{method:'POST',body:JSON.stringify({code:missionForm.code,title:{en:missionForm.en,ar:missionForm.ar,tr:missionForm.tr},description:{en:'Complete the server-verified requirement.',ar:'أكمل الشرط الذي يتحقق منه الخادم.',tr:'Sunucu tarafından doğrulanan koşulu tamamlayın.'},points:Number(missionForm.points),type:missionForm.type,active:true})});await refresh();setMissionForm({code:'',en:'',ar:'',tr:'',points:'10',type:'manual_review'});notify(result.message)}catch(error:any){notify(error.message)}finally{setSaving(false)}}}>
              <div className="form-two"><label>شناسه یکتا<input value={missionForm.code} onChange={(e)=>setMissionForm({...missionForm,code:e.target.value})} pattern="[a-z0-9_]{3,60}" required/></label><label>نوع اعتبارسنجی<select value={missionForm.type} onChange={(e)=>setMissionForm({...missionForm,type:e.target.value})}><option value="manual_review">بررسی دستی</option><option value="complete_profile">تکمیل پروفایل</option><option value="verify_email">تأیید ایمیل</option><option value="view_3_projects">مشاهده سه پروژه</option><option value="first_deposit">اولین واریز تأییدشده</option><option value="first_investment">اولین تخصیص تأییدشده</option></select></label></div>
              <div className="form-two"><label>عنوان انگلیسی<input value={missionForm.en} onChange={(e)=>setMissionForm({...missionForm,en:e.target.value})} required/></label><label>عنوان عربی<input value={missionForm.ar} onChange={(e)=>setMissionForm({...missionForm,ar:e.target.value})} required/></label></div>
              <label>عنوان ترکی<input value={missionForm.tr} onChange={(e)=>setMissionForm({...missionForm,tr:e.target.value})} required/></label>
              <label>امتیاز<input type="number" min="0" max="100000" value={missionForm.points} onChange={(e)=>setMissionForm({...missionForm,points:e.target.value})} required/></label>
              <button className="admin-primary-btn" disabled={saving}><Plus size={15}/>ایجاد مأموریت</button>
            </form>
          </section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h3>درخواست‌های تکمیل دستی</h3><p>هر درخواست فقط یک‌بار بررسی می‌شود و امتیاز فقط پس از تأیید مدیریت ثبت خواهد شد.</p></div><button className="admin-outline-btn" onClick={async()=>{try{const latest=await api<any>('/api/admin/missions/pending');setPendingMissionRequests(latest.requests||[])}catch(error:any){notify(error.message)}}}><Activity size={14}/>بروزرسانی</button></div>
            {pendingMissionRequests.length ? pendingMissionRequests.map((request:any)=><div className="news-row" key={`${request.code}-${request.userId}`}><div><b>{request.userName}</b><small>{request.email} · {request.title} · {request.code} · {request.points} امتیاز</small><small>{dateText(request.createdAt)}</small></div><div className="table-actions"><button className="admin-primary-btn" disabled={saving} onClick={()=>reviewMission(request.code,request.userId,'completed')}><Check size={14}/>تأیید</button><button className="admin-outline-btn" disabled={saving} onClick={()=>reviewMission(request.code,request.userId,'rejected')}><X size={14}/>رد</button></div></div>):<EmptyState text="درخواست مأموریت دستی در انتظار بررسی وجود ندارد."/>}
          </section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h3>فهرست مأموریت‌ها</h3><p>فعال/غیرفعال‌سازی از طریق API و ثبت رویداد.</p></div></div>
            {data.missions.map((mission:any)=><div className="news-row" key={mission.code}><div><b>{mission.title?.fa || mission.title?.en || mission.code}</b><small>{mission.code} · {mission.type} · {mission.points} امتیاز</small></div><span className={`status-pill ${mission.active?'active':'paused'}`}>{mission.active?'فعال':'غیرفعال'}</span><button className="admin-outline-btn" onClick={async()=>{try{const result=await api(`/api/admin/missions/${mission.code}`,{method:'PATCH',body:JSON.stringify({active:!mission.active})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}>{mission.active?'غیرفعال‌کردن':'فعال‌کردن'}</button></div>)}
          </section>
        </>}
        {adminTab === 'entitlements' && authUser?.role === 'admin' && <>
          <div className="admin-page-intro"><div><h2>حقوق قراردادی و سهم پروژه</h2><p>ثبت فعلی صرفاً پیش‌نویس است؛ هیچ مالکیت، سود یا تعهد پرداختی را بدون سند اجرایی و تأیید قانونی ایجاد نمی‌کند.</p></div></div>
          <section className="admin-panel settings-panel"><div className="admin-panel-head"><div><h3>ایجاد پیش‌نویس حق پروژه</h3><p>برای هر تخصیص، مرجع قرارداد یا سند حقوقی الزامی است.</p></div></div>
            <form className="form-stack" onSubmit={createEntitlement}>
              <div className="form-two"><label>کاربر<select value={entitlementForm.userId} onChange={(e)=>setEntitlementForm({...entitlementForm,userId:e.target.value})} required>{data.users.filter((u:any)=>u.role==='customer').map((u:any)=><option key={u.id} value={u.id}>{u.name} · {u.id}</option>)}</select></label><label>پروژه<select value={entitlementForm.projectId} onChange={(e)=>setEntitlementForm({...entitlementForm,projectId:e.target.value})} required>{data.projects.map((project:any)=><option key={project.id} value={project.id}>{project.title?.en || project.id}</option>)}</select></label></div>
              <div className="form-two"><label>نوع حق<select value={entitlementForm.type} onChange={(e)=>setEntitlementForm({...entitlementForm,type:e.target.value})}><option value="equity">Equity (پیش‌نویس)</option><option value="revenue_share">Revenue share (پیش‌نویس)</option><option value="contractual_bonus">Contractual bonus (پیش‌نویس)</option></select></label><label>درصد<input type="number" min="0.0001" max="100" step="0.0001" value={entitlementForm.percentage} onChange={(e)=>setEntitlementForm({...entitlementForm,percentage:e.target.value})} required/></label></div>
              <label>مرجع قرارداد / سند حقوقی<input minLength={4} maxLength={200} value={entitlementForm.legalReference} onChange={(e)=>setEntitlementForm({...entitlementForm,legalReference:e.target.value})} placeholder="شماره قرارداد یا شناسه پرونده" required/></label>
              <div className="admin-info-note compact"><ShieldCheck size={16}/><p>این عملیات فقط یک رکورد با وضعیت draft می‌سازد. برای تأیید حقوقی، توزیع درآمد یا پرداخت، قرارداد امضاشده و فرایند مستقل بررسی لازم است.</p></div>
              <button className="admin-primary-btn" disabled={saving || !data.users.some((u:any)=>u.id===entitlementForm.userId) || !data.projects.some((p:any)=>p.id===entitlementForm.projectId)}><Plus size={15}/>ثبت پیش‌نویس</button>
            </form>
          </section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h3>سوابق پیش‌نویس و تخصیص‌ها</h3><p>وضعیت حقوقی هر رکورد جدا از سرمایه‌گذاری و موجودی کاربر است.</p></div></div>
            {data.entitlements.length ? data.entitlements.map((item:any)=><div className="news-row" key={item.id}><div><b>{item.projectTitle?.en || 'Project'}</b><small>{item.id} · {item.type} · {item.legalReference}</small></div><b>{Number(item.percentage).toFixed(4)}%</b><span className={`status-pill ${item.status}`}>{item.status}</span><small>{dateText(item.createdAt)}</small></div>):<EmptyState text="هنوز پیش‌نویس حق پروژه‌ای ثبت نشده است."/>}
          </section>
        </>}
        {adminTab === 'support' && ['admin','support'].includes(authUser?.role) && <>
          <div className="admin-page-intro"><div><h2>پشتیبانی کاربران</h2><p>پیام‌ها و پاسخ‌ها به‌صورت ماندگار در پایگاه داده ثبت می‌شوند.</p></div><button className="admin-outline-btn" onClick={async()=>{try{const result=await api<any>('/api/admin/support');setSupportTickets(result.tickets||[])}catch(error:any){notify(error.message)}}}><Activity size={15}/>بروزرسانی</button></div>
          {supportTickets.length ? supportTickets.map((ticket:any)=><section className="admin-panel" key={ticket.public_id || ticket.id}><div className="admin-panel-head"><div><h3>{ticket.subject}</h3><p>{ticket.public_id || ticket.id} · {ticket.display_name || ticket.userName || ticket.user_public_id || ticket.userId} · {ticket.email || ''}</p></div><span className={`status-pill ${ticket.status}`}>{ticket.status}</span></div><p>{ticket.message}</p><div className="support-thread">{(ticket.replies||[]).map((reply:any,i:number)=><div className="notice-box" key={i}><b>{reply.author}</b><span>{reply.body}</span><small>{dateText(reply.createdAt)}</small></div>)}</div><form className="form-stack" onSubmit={async(e)=>{e.preventDefault();const message=supportReply[ticket.public_id||ticket.id]||'';setSaving(true);try{const result=await api(`/api/admin/support/${ticket.public_id||ticket.id}/replies`,{method:'POST',body:JSON.stringify({message,status:'in_progress'})});const latest=await api<any>('/api/admin/support');setSupportTickets(latest.tickets||[]);setSupportReply({...supportReply,[ticket.public_id||ticket.id]:''});notify(result.message)}catch(error:any){notify(error.message)}finally{setSaving(false)}}}><label>پاسخ مدیر<textarea rows={3} minLength={2} maxLength={5000} value={supportReply[ticket.public_id||ticket.id]||''} onChange={(e)=>setSupportReply({...supportReply,[ticket.public_id||ticket.id]:e.target.value})} required/></label><button className="admin-primary-btn" disabled={saving}><Check size={14}/>ثبت پاسخ</button></form></section>):<EmptyState text="درخواست پشتیبانی ثبت نشده است."/>}
        </>}
        {adminTab === 'reconciliation' && ['admin','finance'].includes(authUser?.role) && <>
          <div className="admin-page-intro"><div><h2>تطبیق کیف پول و دفتر کل</h2><p>مانده‌های ذخیره‌شده کیف پول با جمع ثبت‌های دفتری مقایسه می‌شوند.</p></div><button className="admin-outline-btn" onClick={async()=>{try{setReconciliation(await api('/api/admin/reconciliation'))}catch(error:any){notify(error.message)}}}><Activity size={15}/>اجرای مجدد</button></div>
          <div className="admin-info-note"><ShieldCheck size={18}/><div><b>{reconciliation?.reconciled ? 'تطبیق کامل' : reconciliation ? 'مغایرت شناسایی شد' : 'گزارش هنوز اجرا نشده است'}</b><p>{reconciliation ? `${reconciliation.count} مورد مغایرت ثبت شده است.` : 'برای دریافت آخرین نتیجه، اجرای گزارش را انتخاب کنید.'}</p></div></div>
          {reconciliation?.mismatches?.length ? <div className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>کاربر</th><th>ارز</th><th>مانده کیف پول</th><th>مانده دفتر کل</th><th>سرمایه‌گذاری کیف پول</th><th>سرمایه‌گذاری دفتر کل</th></tr></thead><tbody>{reconciliation.mismatches.map((row:any)=><tr key={`${row.public_id}-${row.currency}`}><td>{row.display_name} · {row.public_id}</td><td>{row.currency}</td><td>{money(Number(row.wallet_available)/100)}</td><td>{money(Number(row.ledger_available)/100)}</td><td>{money(Number(row.wallet_invested)/100)}</td><td>{money(Number(row.ledger_invested)/100)}</td></tr>)}</tbody></table></div></div>:reconciliation?.reconciled?<EmptyState text="هیچ مغایرتی در مانده‌های بررسی‌شده پیدا نشد."/>:null}
        </>}
        {adminTab === 'settings' && settingsDraft && <>
          <div className="admin-page-intro"><div><h2>تنظیمات سایت</h2><p>آدرس‌های شبکه، آمار عمومی و پارامترهای قابل تنظیم.</p></div><button className="admin-primary-btn" onClick={saveSettings}><Check size={16}/>ذخیره همه تنظیمات</button></div>
          <div className="settings-grid"><section className="admin-panel settings-panel"><div className="admin-panel-head"><div><h3>آدرس‌های دریافت واریز</h3><p>این آدرس‌ها در فرم واریز سایت کاربر نمایش داده می‌شوند.</p></div><button className="admin-outline-btn" onClick={addAddress}><Plus size={14}/>افزودن آدرس</button></div>{settingsDraft.depositAddresses.map((a:any,i:number)=><div className="address-setting" key={a.id}><div className="address-setting-head"><b>آدرس دریافت #{i+1}</b><label className="switch-label"><input type="checkbox" checked={a.active} onChange={(e)=>updateAddress(i,'active',e.target.checked)}/><span/>فعال</label></div><label>شبکه<select value={a.network} onChange={(e)=>updateAddress(i,'network',e.target.value)}><option>BNB Smart Chain</option><option>Base</option></select></label><label>ارز<input value="DAI" disabled/></label><label>آدرس کیف پول مقصد<input dir="ltr" value={a.address} onChange={(e)=>updateAddress(i,'address',e.target.value)} placeholder="0x..."/></label><label>قرارداد رسمی توکن DAI در همین شبکه<input dir="ltr" value={a.token_contract||''} onChange={(e)=>updateAddress(i,'token_contract',e.target.value)} placeholder="0x..."/></label></div>)}</section>
            <section className="admin-panel settings-panel"><div className="admin-panel-head"><div><h3>آمار صفحه اصلی</h3><p>این مقادیر به‌عنوان آمار نمایشی در صفحه اصلی سایت استفاده می‌شوند.</p></div></div><label>روش محاسبه آمار<select value={settingsDraft.stats.displayMode} onChange={(e)=>setSettingsDraft({...settingsDraft,stats:{...settingsDraft.stats,displayMode:e.target.value}})}><option value="manual">ورود دستی</option><option value="calculated">محاسبه از داده‌های سیستم</option></select></label><label>تعداد کاربران نمایشی<input type="number" value={settingsDraft.stats.users} onChange={(e)=>setSettingsDraft({...settingsDraft,stats:{...settingsDraft.stats,users:e.target.value}})}/></label><label>حجم کل نمایشی (USD)<input type="number" value={settingsDraft.stats.volume} onChange={(e)=>setSettingsDraft({...settingsDraft,stats:{...settingsDraft.stats,volume:e.target.value}})}/></label><label>تعداد پروژه‌ها<input type="number" value={settingsDraft.stats.projects} onChange={(e)=>setSettingsDraft({...settingsDraft,stats:{...settingsDraft.stats,projects:e.target.value}})}/></label><label>تعداد کشورها<input type="number" value={settingsDraft.stats.countries} onChange={(e)=>setSettingsDraft({...settingsDraft,stats:{...settingsDraft.stats,countries:e.target.value}})}/></label><label>رشد نمایشی روزانه (%)<input type="number" step="0.1" value={settingsDraft.stats.dailyGrowth} onChange={(e)=>setSettingsDraft({...settingsDraft,stats:{...settingsDraft.stats,dailyGrowth:e.target.value}})}/></label></section>
            <section className="admin-panel settings-panel"><div className="admin-panel-head"><div><h3>پارامترهای عملیاتی</h3><p>این مقادیر به‌تنهایی مجوز یا فعال‌سازی عملیات مالی نیستند.</p></div></div><label>زمان هدف بررسی واریز (ساعت)<input type="number" min="1" max="72" value={settingsDraft.depositNoticeHours} onChange={(e)=>setSettingsDraft({...settingsDraft,depositNoticeHours:e.target.value})}/></label><label>حداقل برداشت درخواستی (DAI)<input type="number" min="0" value={settingsDraft.minimumWithdrawal} onChange={(e)=>setSettingsDraft({...settingsDraft,minimumWithdrawal:e.target.value})}/></label><label>درصد پیشنهادی پاداش رفرال (%)<input type="number" min="0" max="50" value={settingsDraft.referralPercent} onChange={(e)=>setSettingsDraft({...settingsDraft,referralPercent:e.target.value})}/></label><label>قواعد امتیاز لازم برای هر سطح (JSON)<textarea rows={8} dir="ltr" value={settingsDraft.levelThresholdsJson ?? JSON.stringify(settingsDraft.levelThresholds || [{level:1,points:0}],null,2)} onChange={(e)=>setSettingsDraft({...settingsDraft,levelThresholdsJson:e.target.value})}/></label><small>آرایه‌ای از level و points؛ سطح ۱ باید صفر امتیاز داشته باشد و امتیاز سطوح بالاتر صعودی باشد. JSON نامعتبر هنگام ذخیره توسط API رد می‌شود.</small><div className="admin-info-note compact"><ShieldCheck size={17}/><p>فعال‌سازی عملیات مالی علاوه بر این تنظیمات، به پیکربندی محیطی و تأییدهای حقوقی نیاز دارد.</p></div></section>
          </div><div className="settings-save-bottom"><button className="admin-primary-btn" onClick={saveSettings}><Check size={16}/>ذخیره تنظیمات</button></div>
        </>}
      </div>
    </main>
    {localModal === 'adjust' && <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setLocalModal(null)}><section className="modal admin-modal" dir="rtl"><div className="modal-head"><h3>ثبت اصلاحیه حساب</h3><button className="icon-button" onClick={()=>setLocalModal(null)}><X size={18}/></button></div><form className="form-stack" onSubmit={saveAdjustment}><div className="admin-info-note compact"><ShieldCheck size={17}/><p>اصلاحیه باید دارای دلیل مستند و شماره مرجع مدرک باشد. عملیات در دفتر کل و گزارش حسابرسی ثبت می‌شود.</p></div><label>انتخاب کاربر<select value={adj.userId} onChange={(e)=>setAdj({...adj,userId:e.target.value})}>{data.users.map((u:any)=><option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}</select></label><label>مبلغ اصلاحیه (+ افزایش / - کاهش)<input type="number" step="0.01" value={adj.amount} onChange={(e)=>setAdj({...adj,amount:e.target.value})} required/></label><label>دلیل اصلاحیه<input value={adj.reason} onChange={(e)=>setAdj({...adj,reason:e.target.value})} placeholder="دلیل مستند اصلاحیه" required/></label><label>شماره مرجع سند / مدرک<input value={adj.evidenceReference} onChange={(e)=>setAdj({...adj,evidenceReference:e.target.value})} minLength={4} required placeholder="شماره تیکت، سند یا رسید"/></label><div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setLocalModal(null)}>انصراف</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'در حال ثبت...':'ثبت اصلاحیه'}</button></div></form></section></div>}
    {localModal === 'project' && <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setLocalModal(null)}><section className="modal admin-modal" dir="rtl"><div className="modal-head"><h3>افزودن پروژه جدید</h3><button className="icon-button" onClick={()=>setLocalModal(null)}><X size={18}/></button></div><form className="form-stack" onSubmit={createProject}><label>عنوان انگلیسی<input value={project.en} onChange={(e)=>setProject({...project,en:e.target.value})} required/></label><label>عنوان عربی<input value={project.ar} onChange={(e)=>setProject({...project,ar:e.target.value})} required/></label><label>عنوان ترکی<input value={project.tr} onChange={(e)=>setProject({...project,tr:e.target.value})} required/></label><label>دسته‌بندی<select value={project.category} onChange={(e)=>setProject({...project,category:e.target.value})}><option>Infrastructure</option><option>Technology</option><option>Real Estate</option><option>Mobility</option></select></label><div className="form-two"><label>حداقل سرمایه<input type="number" value={project.minimum} onChange={(e)=>setProject({...project,minimum:e.target.value})}/></label><label>حداکثر سرمایه<input type="number" value={project.maximum} onChange={(e)=>setProject({...project,maximum:e.target.value})}/></label></div><div className="form-two"><label>هدف تأمین مالی<input type="number" value={project.target} onChange={(e)=>setProject({...project,target:e.target.value})}/></label><label>مدت پروژه<input value={project.duration} onChange={(e)=>setProject({...project,duration:e.target.value})}/></label></div><div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>setLocalModal(null)}>انصراف</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'در حال ایجاد...':'ایجاد پروژه'}</button></div></form></section></div>}
  </div>;
}

function UserReport({ user, onAdjust, refresh, notify, canManageIdentity = false, canManageStatus = false }: any) {
  const w = user.wallet;
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralLoading, setReferralLoading] = useState(false);
  useEffect(() => { let live = true; setReferralLoading(true); api<any>(`/api/admin/users/${user.id}/referrals`).then((result) => { if (live) setReferrals(result.referrals || []); }).catch(() => { if (live) setReferrals([]); }).finally(() => { if (live) setReferralLoading(false); }); return () => { live = false; }; }, [user.id]);
  return <section className="admin-panel user-report"><div className="admin-panel-head"><div><h3>پرونده مالی و فعالیت کاربر</h3><p>گزارش تجمیعی حساب انتخاب‌شده؛ مبالغ از داده‌های ثبت‌شده در سامانه محاسبه می‌شوند.</p></div><div className="table-actions">{canManageIdentity && <button className="admin-outline-btn" onClick={async()=>{const next=window.prompt('وضعیت احراز هویت: pending / verified / rejected',user.identityStatus||'pending');if(!next)return;try{const result=await api(`/api/admin/users/${user.id}/identity`,{method:'PATCH',body:JSON.stringify({status:next})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}><ShieldCheck size={14}/>وضعیت احراز هویت</button>}{canManageStatus && <button className="admin-outline-btn" onClick={async()=>{const next=window.prompt('وضعیت حساب: active / suspended / closed',user.status||'active');if(!next)return;try{const result=await api(`/api/admin/users/${user.id}/status`,{method:'PATCH',body:JSON.stringify({status:next})});await refresh();notify(result.message)}catch(error:any){notify(error.message)}}}><ShieldCheck size={14}/>وضعیت حساب</button>}<button className="admin-primary-btn" onClick={onAdjust}><SlidersHorizontal size={15}/>اصلاحیه موجودی</button></div></div><div className="user-report-identity"><span className="user-report-avatar">{user.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}</span><div><b>{user.name}</b><small>{user.id} · {user.email} · {user.country}</small></div><span className={`admin-status ${user.status}`}>{user.status==='active'?'فعال':user.status==='suspended'?'تعلیق‌شده':user.status==='closed'?'بسته‌شده':'در انتظار'}</span><span className="level-chip">سطح {user.level}</span><span className="admin-status">احراز هویت: {user.identityStatus || 'نامشخص'}</span></div><div className="user-finance-grid">{[{l:'مجموع واریزی',v:w.deposited,c:'green'},{l:'مجموع برداشت',v:w.withdrawn,c:'default'},{l:'موجودی آزاد',v:w.available,c:'blue'},{l:'سرمایه‌گذاری‌شده',v:w.invested,c:'default'},{l:'موجودی مسدود',v:w.locked,c:'orange'},{l:'سود ثبت‌شده',v:w.profit,c:'green'},{l:'اعتبار تشویقی',v:w.bonus,c:'violet'},{l:'تعداد زیرمجموعه',v:user.referralCount,c:'default'}].map(x=><div key={x.l}><span>{x.l}</span><b className={x.c==='green'?'amount-positive':''}>{typeof x.v==='number'&&x.l!=='تعداد زیرمجموعه'?money(x.v):x.v}</b></div>)}</div><div className="user-report-foot"><span><CalendarDays size={14}/> تاریخ عضویت: {new Date(user.joinedAt).toLocaleDateString('fa-IR')}</span><span><Gift size={14}/> امتیاز مأموریت: {user.points.toLocaleString('fa-IR')}</span><span><Users size={14}/> کد معرفی: {user.referralCode || '—'}</span></div><div className="admin-panel-head"><div><h3>درخت زیرمجموعه‌ها</h3><p>شامل زیرمجموعه مستقیم و چندسطحی؛ حداکثر عمق گزارش ۱۰ سطح.</p></div><span className="admin-total-chip">{referrals.length} نفر</span></div>{referralLoading?<p>در حال دریافت شبکه معرفی...</p>:referrals.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>کاربر</th><th>سطح معرفی</th><th>زیرمجموعه مستقیم</th><th>واریزی ثبت‌شده</th><th>موجودی آزاد</th><th>سطح کاربر</th><th>وضعیت</th></tr></thead><tbody>{referrals.map((r:any)=><tr key={r.id}><td><b>{r.name}</b><small>{r.id} · {r.email}</small></td><td>{r.depth}</td><td>{r.directReferrals}</td><td>{money(r.deposited)}</td><td>{money(r.available)}</td><td>L{r.level}</td><td>{r.status}</td></tr>)}</tbody></table></div>:<EmptyState text="زیرمجموعه‌ای برای این کاربر ثبت نشده است."/>}</section>;
}
function AuditList({ logs }: any) { return <div className="audit-list">{logs.map((l:any)=><div className="audit-row" key={l.id}><span className="audit-dot"><Activity size={14}/></span><div><b>{l.action}</b><small>{l.detail}</small></div><span className="audit-actor">{l.actor}</span><time>{new Date(l.createdAt).toLocaleString('fa-IR')}</time></div>)}</div>; }
function EmptyState({ text }: any) { return <div className="empty-state"><ClipboardList size={25}/><span>{text}</span></div>; }

export default App;
