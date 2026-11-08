import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultFile = path.resolve(here, '../data/db.json');
const dataFile = path.resolve(process.env.DATA_FILE || defaultFile);

const seed = {
  settings: {
    brand: 'XBank',
    depositAddresses: [
      { id: 'addr-bsc', network: 'BNB Smart Chain', currency: 'DAI', address: 'DEMO-ONLY-NOT-A-REAL-BNB-WALLET', active: true },
      { id: 'addr-base', network: 'Base', currency: 'DAI', address: 'DEMO-ONLY-NOT-A-REAL-BASE-WALLET', active: true },
    ],
    stats: { users: 15000, volume: 12800000, projects: 120, countries: 180, displayMode: 'manual', dailyGrowth: 0 },
    depositNoticeHours: 24,
    referralPercent: 10,
    minimumWithdrawal: 20,
  },
  users: [
    { id: 'XB-1001', name: 'Alex Morgan', email: 'alex@example.com', country: 'United States', joinedAt: '2026-08-14', level: 30, points: 780, status: 'active', inviter: null, referralCount: 12, wallet: { available: 350, invested: 1200, locked: 500, profit: 180, bonus: 100, withdrawn: 450, deposited: 2500 } },
    { id: 'XB-1002', name: 'Sara Wilson', email: 'sara@example.com', country: 'United Kingdom', joinedAt: '2026-09-02', level: 12, points: 310, status: 'active', inviter: 'XB-1001', referralCount: 3, wallet: { available: 82, invested: 420, locked: 0, profit: 46, bonus: 12, withdrawn: 25, deposited: 520 } },
    { id: 'XB-1003', name: 'Michael Chen', email: 'm.chen@example.com', country: 'Singapore', joinedAt: '2026-09-19', level: 8, points: 180, status: 'active', inviter: 'XB-1001', referralCount: 1, wallet: { available: 41, invested: 250, locked: 100, profit: 22, bonus: 0, withdrawn: 10, deposited: 390 } },
    { id: 'XB-1004', name: 'Emma Laurent', email: 'emma@example.com', country: 'France', joinedAt: '2026-10-03', level: 4, points: 95, status: 'pending', inviter: null, referralCount: 0, wallet: { available: 0, invested: 0, locked: 0, profit: 0, bonus: 0, withdrawn: 0, deposited: 0 } },
  ],
  deposits: [
    { id: 'DP-24018', userId: 'XB-1001', userName: 'Alex Morgan', amount: 250, currency: 'DAI', network: 'BNB Smart Chain', txid: '0x4bd71e9a...2c910a', status: 'pending', createdAt: new Date(Date.now() - 1000 * 60 * 44).toISOString(), note: '' },
    { id: 'DP-24017', userId: 'XB-1002', userName: 'Sara Wilson', amount: 100, currency: 'DAI', network: 'Base', txid: '0x8ae23b17...d71f20', status: 'pending', createdAt: new Date(Date.now() - 1000 * 60 * 170).toISOString(), note: '' },
    { id: 'DP-24016', userId: 'XB-1003', userName: 'Michael Chen', amount: 75, currency: 'DAI', network: 'BNB Smart Chain', txid: '0x9cb12e73...a2f991', status: 'approved', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(), note: 'Demo deposit approved' },
  ],
  withdrawals: [
    { id: 'WD-1104', userId: 'XB-1001', amount: 40, network: 'BNB Smart Chain', status: 'pending', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString() },
  ],
  projects: [
    { id: 'PR-001', category: 'Infrastructure', title: { en: 'Green Energy Grid', ar: 'شبكة الطاقة الخضراء', tr: 'Yeşil Enerji Şebekesi' }, description: { en: 'A clean-energy infrastructure concept focused on distributed solar capacity.', ar: 'مفهوم للبنية التحتية للطاقة النظيفة يركز على الطاقة الشمسية الموزعة.', tr: 'Dağıtık güneş enerjisine odaklanan temiz enerji altyapısı konsepti.' }, minimum: 70, maximum: 5000, duration: '90 days', target: 250000, raised: 164200, status: 'active', risk: 'Medium', featured: true, views: 8420, likes: 328, roiLabel: 'Illustrative target' },
    { id: 'PR-002', category: 'Technology', title: { en: 'NextGen Data Center', ar: 'مركز بيانات الجيل القادم', tr: 'Yeni Nesil Veri Merkezi' }, description: { en: 'A research concept for efficient modular data-center capacity.', ar: 'مفهوم بحثي لسعة مراكز البيانات المعيارية عالية الكفاءة.', tr: 'Verimli modüler veri merkezi kapasitesi için araştırma konsepti.' }, minimum: 250, maximum: 10000, duration: '180 days', target: 600000, raised: 392000, status: 'active', risk: 'High', featured: false, views: 6120, likes: 241, roiLabel: 'Illustrative target' },
    { id: 'PR-003', category: 'Real Estate', title: { en: 'Urban Living Fund', ar: 'صندوق الإسكان الحضري', tr: 'Kentsel Yaşam Fonu' }, description: { en: 'A sample property-development project used to demonstrate portfolio tracking.', ar: 'مشروع عقاري تجريبي لعرض تتبع المحفظة.', tr: 'Portföy takibini göstermek için örnek gayrimenkul projesi.' }, minimum: 500, maximum: 20000, duration: '12 months', target: 1000000, raised: 875000, status: 'active', risk: 'Medium', featured: false, views: 4200, likes: 198, roiLabel: 'Illustrative target' },
    { id: 'PR-004', category: 'Mobility', title: { en: 'EV Charging Network', ar: 'شبكة شحن المركبات الكهربائية', tr: 'Elektrikli Araç Şarj Ağı' }, description: { en: 'A mobility-infrastructure concept for urban charging stations.', ar: 'مفهوم لبنية تحتية لمحطات الشحن في المدن.', tr: 'Şehir içi şarj istasyonları için mobilite altyapısı konsepti.' }, minimum: 100, maximum: 3000, duration: '120 days', target: 180000, raised: 54000, status: 'upcoming', risk: 'Medium', featured: false, views: 1920, likes: 86, roiLabel: 'Illustrative target' },
  ],
  investments: [
    { id: 'IN-501', userId: 'XB-1001', projectId: 'PR-001', amount: 700, status: 'active', date: '2026-09-18', expected: 42, realized: 26 },
    { id: 'IN-502', userId: 'XB-1001', projectId: 'PR-002', amount: 500, status: 'active', date: '2026-10-01', expected: 60, realized: 18 },
    { id: 'IN-503', userId: 'XB-1002', projectId: 'PR-001', amount: 420, status: 'active', date: '2026-10-11', expected: 25, realized: 12 },
  ],
  activity: [
    { id: 'LG-1', userId: 'XB-1001', type: 'deposit', amount: 250, description: 'Demo deposit approved', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString() },
    { id: 'LG-2', userId: 'XB-1001', type: 'investment', amount: -700, description: 'Investment in Green Energy Grid', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString() },
  ],
  auditLogs: [
    { id: 'AU-1', actor: 'مدیر سیستم', action: 'ایجاد نسخه نمایشی', detail: 'داده‌های اولیه برای آزمایش ساخته شد.', createdAt: new Date().toISOString() },
  ],
};

function ensureFile() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2), 'utf8');
}

export function readStore() {
  ensureFile();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

export function writeStore(data) {
  ensureFile();
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, dataFile);
}

export function addAudit(data, action, detail, actor = 'مدیر سیستم') {
  data.auditLogs.unshift({ id: `AU-${Date.now()}`, actor, action, detail, createdAt: new Date().toISOString() });
  data.auditLogs = data.auditLogs.slice(0, 250);
}
