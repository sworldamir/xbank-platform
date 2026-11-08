import crypto from 'node:crypto';
import readline from 'node:readline';
import { pool, withTransaction } from '../server/db.mjs';
import { assertPasswordPolicy, hashPassword } from '../server/security.mjs';

const SEED_VERSION = 'xbank-site-seed-v1';
const DEMO_NOTE = 'SYNTHETIC TEST DATA — NOT A REAL PAYMENT, INVESTMENT, LOAN OR PRIZE.';

function uuid(key) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(`xbank:${SEED_VERSION}:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const minor = (value) => String(Math.round(Number(value) * 100));
const isoDaysAgo = (days) => new Date(Date.now() - days * 86_400_000);
const publicId = (key) => `XB-DEMO-${String(key).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28)}`;
const reference = (key) => `SEED-${String(key).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}`;

function promptLine(question, defaultValue = '') {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (value) => { rl.close(); resolve(value.trim() || defaultValue); });
  });
}
function promptSecret(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Run npm run seed:site in an interactive PowerShell terminal.'));
      return;
    }
    process.stdout.write(question);
    let value = '';
    const onData = (buffer) => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\u0003') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData);
          process.stdout.write('\n'); reject(new Error('Cancelled.')); return;
        }
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData);
          process.stdout.write('\n'); resolve(value); return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData);
  });
}

const people = [
  { key:'argon', username:'Argon', name:'Argon', email:'argon@example.test', country:'United Kingdom', province:'London', locale:'en', birth:'1994-03-18', parent:null, points:2900, level:30 },
  { key:'amina', username:'amina.rahman', name:'Amina Rahman', email:'amina.rahman@example.test', country:'United Arab Emirates', province:'Dubai', locale:'ar', birth:'1996-05-12', parent:'argon', points:1450, level:15 },
  { key:'daniel', username:'daniel.foster', name:'Daniel Foster', email:'daniel.foster@example.test', country:'United Kingdom', province:'Manchester', locale:'en', birth:'1992-11-06', parent:'argon', points:1180, level:12 },
  { key:'elif', username:'elif.demir', name:'Elif Demir', email:'elif.demir@example.test', country:'Turkey', province:'Istanbul', locale:'tr', birth:'1998-02-24', parent:'argon', points:980, level:10 },
  { key:'omar', username:'omar.haddad', name:'Omar Haddad', email:'omar.haddad@example.test', country:'Jordan', province:'Amman', locale:'ar', birth:'1991-07-09', parent:'argon', points:760, level:8 },
  { key:'lucas', username:'lucas.meyer', name:'Lucas Meyer', email:'lucas.meyer@example.test', country:'Germany', province:'Berlin', locale:'en', birth:'1995-09-30', parent:'argon', points:620, level:7 },
  { key:'sofia', username:'sofia.rossi', name:'Sofia Rossi', email:'sofia.rossi@example.test', country:'Italy', province:'Milan', locale:'en', birth:'1997-12-15', parent:'argon', points:540, level:6 },
  { key:'lina', username:'lina.farouk', name:'Lina Farouk', email:'lina.farouk@example.test', country:'Egypt', province:'Cairo', locale:'ar', birth:'1999-03-21', parent:'amina', points:430, level:5 },
  { key:'yusuf', username:'yusuf.nasser', name:'Yusuf Nasser', email:'yusuf.nasser@example.test', country:'Jordan', province:'Irbid', locale:'ar', birth:'1993-06-17', parent:'amina', points:380, level:4 },
  { key:'emily', username:'emily.ward', name:'Emily Ward', email:'emily.ward@example.test', country:'Canada', province:'Toronto', locale:'en', birth:'1996-08-11', parent:'daniel', points:510, level:6 },
  { key:'noah', username:'noah.brooks', name:'Noah Brooks', email:'noah.brooks@example.test', country:'United States', province:'Austin', locale:'en', birth:'1994-01-27', parent:'daniel', points:290, level:3 },
  { key:'deniz', username:'deniz.kaya', name:'Deniz Kaya', email:'deniz.kaya@example.test', country:'Turkey', province:'Ankara', locale:'tr', birth:'1998-04-02', parent:'elif', points:630, level:7 },
  { key:'zeynep', username:'zeynep.arslan', name:'Zeynep Arslan', email:'zeynep.arslan@example.test', country:'Turkey', province:'Izmir', locale:'tr', birth:'1997-10-19', parent:'elif', points:260, level:3 },
  { key:'layla', username:'layla.mansour', name:'Layla Mansour', email:'layla.mansour@example.test', country:'United Arab Emirates', province:'Abu Dhabi', locale:'ar', birth:'1995-02-03', parent:'omar', points:720, level:8 },
  { key:'karim', username:'karim.saleh', name:'Karim Saleh', email:'karim.saleh@example.test', country:'Egypt', province:'Alexandria', locale:'ar', birth:'1992-12-22', parent:'omar', points:310, level:4 },
  { key:'jonas', username:'jonas.weber', name:'Jonas Weber', email:'jonas.weber@example.test', country:'Germany', province:'Munich', locale:'en', birth:'1990-05-28', parent:'lucas', points:480, level:5 },
  { key:'mia', username:'mia.fischer', name:'Mia Fischer', email:'mia.fischer@example.test', country:'Germany', province:'Hamburg', locale:'en', birth:'1999-07-14', parent:'lucas', points:230, level:3 },
  { key:'mateo', username:'mateo.conti', name:'Mateo Conti', email:'mateo.conti@example.test', country:'Italy', province:'Rome', locale:'en', birth:'1991-10-08', parent:'sofia', points:570, level:6 },
  { key:'giulia', username:'giulia.bianchi', name:'Giulia Bianchi', email:'giulia.bianchi@example.test', country:'Italy', province:'Naples', locale:'en', birth:'1998-06-25', parent:'sofia', points:190, level:2 },
  { key:'samir', username:'samir.ali', name:'Samir Ali', email:'samir.ali@example.test', country:'Morocco', province:'Casablanca', locale:'ar', birth:'1993-09-16', parent:'lina', points:140, level:2 },
  { key:'hadi', username:'hadi.omar', name:'Hadi Omar', email:'hadi.omar@example.test', country:'Qatar', province:'Doha', locale:'ar', birth:'1996-11-01', parent:'yusuf', points:110, level:2 },
  { key:'ayse', username:'ayse.yilmaz', name:'Ayse Yilmaz', email:'ayse.yilmaz@example.test', country:'Turkey', province:'Bursa', locale:'tr', birth:'2000-01-09', parent:'deniz', points:90, level:1 },
  { key:'ethan', username:'ethan.clark', name:'Ethan Clark', email:'ethan.clark@example.test', country:'United Kingdom', province:'Bristol', locale:'en', birth:'1997-04-13', parent:'emily', points:170, level:2 },
];

const projectDefinitions = [
  { key:'solar-grid', category:'Renewable Energy', duration:'180 days', minimum:50, maximum:5000, target:250000, status:'active', risk:'Moderate', featured:true, views:18420,
    title:{en:'Solar Grid Infrastructure',ar:'البنية التحتية لشبكة الطاقة الشمسية',tr:'Güneş Enerjisi Şebekesi Altyapısı'},
    description:{en:'A synthetic project profile for utility-scale solar infrastructure and grid modernisation.',ar:'ملف مشروع تجريبي للبنية التحتية للطاقة الشمسية وتحديث الشبكات.',tr:'Şebeke ölçeğinde güneş enerjisi altyapısı ve modernizasyonu için örnek proje profili.'} },
  { key:'logistics-hub', category:'Logistics', duration:'12 months', minimum:100, maximum:10000, target:500000, status:'active', risk:'Moderate', featured:true, views:12750,
    title:{en:'Regional Logistics Hub',ar:'مركز الخدمات اللوجستية الإقليمي',tr:'Bölgesel Lojistik Merkezi'},
    description:{en:'Synthetic operating profile for a regional warehousing and fulfilment hub.',ar:'ملف تشغيلي تجريبي لمركز تخزين وتجهيز إقليمي.',tr:'Bölgesel depolama ve sipariş hazırlama merkezi için örnek işletme profili.'} },
  { key:'data-centre', category:'Digital Infrastructure', duration:'24 months', minimum:250, maximum:25000, target:750000, status:'active', risk:'Elevated', featured:true, views:9720,
    title:{en:'Edge Data Centre Network',ar:'شبكة مراكز البيانات الطرفية',tr:'Uç Veri Merkezi Ağı'},
    description:{en:'Synthetic project profile covering modular data-centre capacity and connectivity.',ar:'ملف تجريبي لسعة مراكز البيانات المعيارية والاتصال.',tr:'Modüler veri merkezi kapasitesi ve bağlantı altyapısı için örnek proje profili.'} },
  { key:'ev-charging', category:'Mobility', duration:'9 months', minimum:75, maximum:8000, target:180000, status:'active', risk:'Moderate', featured:false, views:8340,
    title:{en:'EV Charging Corridor',ar:'ممر شحن المركبات الكهربائية',tr:'Elektrikli Araç Şarj Koridoru'},
    description:{en:'Synthetic rollout profile for a multi-city electric-vehicle charging corridor.',ar:'ملف تجريبي لنشر ممر شحن للمركبات الكهربائية في عدة مدن.',tr:'Çok şehirli elektrikli araç şarj koridoru için örnek yaygınlaştırma profili.'} },
  { key:'water-reuse', category:'Utilities', duration:'18 months', minimum:100, maximum:12000, target:320000, status:'upcoming', risk:'Moderate', featured:false, views:6250,
    title:{en:'Water Reuse Programme',ar:'برنامج إعادة استخدام المياه',tr:'Su Yeniden Kullanım Programı'},
    description:{en:'Synthetic programme profile for industrial water recovery and reuse systems.',ar:'ملف برنامج تجريبي لاستعادة المياه الصناعية وإعادة استخدامها.',tr:'Endüstriyel su geri kazanımı ve yeniden kullanımı için örnek program.'} },
  { key:'agri-supply', category:'Agriculture', duration:'120 days', minimum:40, maximum:3000, target:95000, status:'active', risk:'Elevated', featured:false, views:4190,
    title:{en:'Agricultural Supply Network',ar:'شبكة الإمداد الزراعي',tr:'Tarım Tedarik Ağı'},
    description:{en:'Synthetic supply-chain profile for storage, inputs and regional distribution.',ar:'ملف تجريبي لسلسلة توريد تشمل التخزين والمدخلات والتوزيع الإقليمي.',tr:'Depolama, girdiler ve bölgesel dağıtımı içeren örnek tedarik zinciri profili.'} },
  { key:'battery-storage', category:'Energy Storage', duration:'15 months', minimum:150, maximum:15000, target:420000, status:'completed', risk:'Moderate', featured:false, views:16300,
    title:{en:'Battery Storage Pilot',ar:'مشروع تجريبي لتخزين البطاريات',tr:'Batarya Depolama Pilot Projesi'},
    description:{en:'Synthetic historical profile for a completed grid-scale battery storage pilot.',ar:'ملف تاريخي تجريبي لمشروع مكتمل لتخزين البطاريات على نطاق الشبكة.',tr:'Tamamlanmış şebeke ölçekli batarya depolama pilotu için örnek geçmiş kayıt.'} },
  { key:'port-automation', category:'Infrastructure', duration:'20 months', minimum:200, maximum:20000, target:600000, status:'paused', risk:'High', featured:false, views:5340,
    title:{en:'Port Automation Systems',ar:'أنظمة أتمتة الموانئ',tr:'Liman Otomasyon Sistemleri'},
    description:{en:'Synthetic project profile paused pending a governance and technical review.',ar:'ملف مشروع تجريبي متوقف لحين مراجعة الحوكمة والجوانب التقنية.',tr:'Yönetişim ve teknik inceleme bekleyen duraklatılmış örnek proje.'} },
];

function localizedMission(en, ar, tr) { return { en, ar, tr }; }
const missions = [
  { code:'complete_profile', type:'complete_profile', points:100, oneTime:true, title:localizedMission('Complete your profile','أكمل ملفك الشخصي','Profilinizi tamamlayın'), description:localizedMission('Add your personal details and wallet preferences.','أضف بياناتك الشخصية وتفضيلات المحفظة.','Kişisel bilgilerinizi ve cüzdan tercihlerinizi ekleyin.') },
  { code:'verify_email', type:'verify_email', points:100, oneTime:true, title:localizedMission('Verify your email','تحقق من بريدك الإلكتروني','E-postanızı doğrulayın'), description:localizedMission('Confirm ownership of the email address.','أكد ملكيتك لعنوان البريد الإلكتروني.','E-posta adresinin size ait olduğunu doğrulayın.') },
  { code:'view_3_projects', type:'view_3_projects', points:150, oneTime:true, title:localizedMission('Explore three projects','استكشف ثلاثة مشاريع','Üç projeyi keşfedin'), description:localizedMission('Review three different project profiles.','راجع ثلاثة ملفات مشاريع مختلفة.','Üç farklı proje profilini inceleyin.') },
  { code:'first_deposit', type:'first_deposit', points:250, oneTime:true, title:localizedMission('First reviewed deposit','أول إيداع تمت مراجعته','İlk incelenen yatırma'), description:localizedMission('Submit a deposit request for review.','أرسل طلب إيداع للمراجعة.','İnceleme için para yatırma talebi gönderin.') },
  { code:'first_investment', type:'first_investment', points:300, oneTime:true, title:localizedMission('First project allocation','أول تخصيص لمشروع','İlk proje tahsisi'), description:localizedMission('Review the first sample allocation record.','راجع أول سجل تخصيص تجريبي.','İlk örnek tahsis kaydını inceleyin.') },
];

async function postLedger(client, key, type, description, userId, debitAccount, creditAccount, amountMinor, when, createdBy = null) {
  if (BigInt(amountMinor) <= 0n) return null;
  const txId = uuid(`ledger:${key}`);
  const inserted = await client.query(`INSERT INTO ledger_transactions
    (id,reference,transaction_type,description,status,idempotency_key,metadata,created_by,created_at)
    VALUES($1,$2,$3,$4,'posted',$5,$6::jsonb,$7,$8)
    ON CONFLICT(id) DO NOTHING RETURNING id`,
  [txId, reference(key), type, `${description} [${DEMO_NOTE}]`, `seed:${key}`, JSON.stringify({ seeded:true, seedVersion:SEED_VERSION, synthetic:true }), createdBy, when]);
  if (inserted.rowCount) {
    const debitUserId = debitAccount.startsWith('customer_') ? userId : null;
    const creditUserId = creditAccount.startsWith('customer_') ? userId : null;
    await client.query(`INSERT INTO ledger_entries(transaction_id,line_number,account_code,user_id,currency,debit_minor,credit_minor,created_at)
      VALUES($1,1,$2,$3,'DAI',$4,0,$6),($1,2,$5,$7,'DAI',0,$4,$6)`,
    [txId, debitAccount, debitUserId, String(amountMinor), creditAccount, when, creditUserId]);
  }
  return txId;
}

async function ensureUser(client, person, passwordHash = null) {
  const userId = uuid(`user:${person.key}`);
  const found = await client.query('SELECT id,public_id FROM users WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($2)', [person.username, person.email]);
  if (found.rowCount > 1 || found.rows.some((row) => !String(row.public_id || '').startsWith('XB-DEMO-'))) {
    throw new Error(`The username or email for ${person.username} conflicts with an existing non-seed account. No existing account was modified. Review that record or choose a different test username/email.`);
  }
  const actualId = found.rowCount ? found.rows[0].id : userId;
  const actualPublicId = found.rowCount ? found.rows[0].public_id : publicId(person.key);
  const referralCode = person.key === 'argon' ? 'ARGONDEMO' : `XBD${String(people.findIndex((p) => p.key === person.key)).padStart(4,'0')}`;
  const password = passwordHash || await hashPassword(crypto.randomBytes(32).toString('base64url'));
  await client.query(`INSERT INTO users
    (id,public_id,username,email,password_hash,display_name,country,locale,role,account_status,email_verified_at,identity_status,referral_code,referred_by,points,level,birth_date,province,wallet_address,wallet_network)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'customer','active',NOW(),'not_started',$9,NULL,$10,$11,$12,$13,$14,'BNB Smart Chain')
    ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,
      display_name=EXCLUDED.display_name,country=EXCLUDED.country,locale=EXCLUDED.locale,
      account_status='active',email_verified_at=COALESCE(users.email_verified_at,NOW()),identity_status='not_started',password_hash=CASE WHEN EXCLUDED.username='Argon' THEN EXCLUDED.password_hash ELSE users.password_hash END,points=EXCLUDED.points,level=EXCLUDED.level,
      birth_date=EXCLUDED.birth_date,province=EXCLUDED.province,wallet_address=EXCLUDED.wallet_address,updated_at=NOW()`,
    [actualId,actualPublicId,person.username,person.email,password,person.name,person.country,person.locale,referralCode,person.points,person.level,person.birth,person.province,`TEST-ONLY-WALLET-${sha256(`wallet:${person.key}`).slice(0,20).toUpperCase()}`]);
  await client.query('INSERT INTO wallets(user_id,currency) VALUES($1,\'DAI\') ON CONFLICT(user_id,currency) DO NOTHING', [actualId]);
  return { ...person, id:actualId, publicId:actualPublicId, referralCode };
}

async function main() {
  try {
  if (process.env.NODE_ENV === 'production') throw new Error('Synthetic seed data is disabled in production.');
  const password = await promptSecret('Password for test user Argon (input hidden): ');
  const passwordConfirm = await promptSecret('Confirm Argon password (input hidden): ');
  if (password !== passwordConfirm) throw new Error('The Argon passwords do not match. No records were created.');
  assertPasswordPolicy(password);
  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    // Safe diagnostics: log failed SQL and parameter JS types, never values.
    const originalQuery = client.query.bind(client);
    client.query = async (...args) => {
      try {
        return await originalQuery(...args);
      } catch (queryError) {
        const statement = typeof args[0] === 'string' ? args[0] : args[0]?.text || '[non-text query]';
        const values = Array.isArray(args[1]) ? args[1] : [];
        console.error('Seed SQL statement failed:', statement.replace(/\s+/g, ' ').trim().slice(0, 1800));
        console.error('Seed SQL parameter types:', values.map((value) => value === null ? 'null' : value instanceof Date ? 'Date' : Array.isArray(value) ? 'Array' : typeof value).join(', '));
        throw queryError;
      }
    };
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('xbank-site-demo-seed-v1', 0))");
    const adminResult = await client.query("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1");
    const adminId = adminResult.rows[0]?.id || null;
    if (!adminId) throw new Error('No administrator account exists. Run npm run admin:create first, then run npm run seed:site.');
    const userMap = new Map();
    for (const person of people) userMap.set(person.key, await ensureUser(client, person, person.key === 'argon' ? passwordHash : null));
    for (const person of people) {
      const child = userMap.get(person.key);
      const parentId = person.parent ? userMap.get(person.parent).id : null;
      await client.query('UPDATE users SET referred_by=$2,updated_at=NOW() WHERE id=$1', [child.id, parentId]);
    }

    const projectMap = new Map();
    for (const [index, project] of projectDefinitions.entries()) {
      const projectId = uuid(`project:${project.key}`);
      projectMap.set(project.key, projectId);
      await client.query(`INSERT INTO projects
        (id,public_id,category,title,description,minimum_minor,maximum_minor,target_minor,raised_minor,duration,status,risk,featured,investments_enabled,compliance_status,created_by,views_override,created_at)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,0,$9,$10,$11,$12,FALSE,'not_reviewed',$13,$14,$15)
        ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,description=EXCLUDED.description,
          minimum_minor=EXCLUDED.minimum_minor,maximum_minor=EXCLUDED.maximum_minor,target_minor=EXCLUDED.target_minor,
          duration=EXCLUDED.duration,status=EXCLUDED.status,risk=EXCLUDED.risk,featured=EXCLUDED.featured,
          investments_enabled=FALSE,compliance_status='not_reviewed',views_override=EXCLUDED.views_override,updated_at=NOW()`,
      [projectId,publicId(`project-${project.key}`),project.category,JSON.stringify(project.title),JSON.stringify(project.description),minor(project.minimum),minor(project.maximum),minor(project.target),project.duration,project.status,project.risk,project.featured,adminId,project.views,isoDaysAgo(70-index*5)]);
    }

    // Clearly fake deposit address placeholders make the deposit UI populated, while remaining unusable.
    // Never replace an address that an administrator has already configured.
    const syntheticDepositAddresses = [
      { network:'BNB Smart Chain', chainId:56, address:'TEST-ONLY-NOT-A-REAL-BNB-ADDRESS', token:'TEST-ONLY-NOT-A-REAL-BNB-DAI-CONTRACT' },
      { network:'Base', chainId:8453, address:'TEST-ONLY-NOT-A-REAL-BASE-ADDRESS', token:'TEST-ONLY-NOT-A-REAL-BASE-DAI-CONTRACT' },
    ];
    for (const [index, item] of syntheticDepositAddresses.entries()) {
      await client.query(`INSERT INTO deposit_addresses(id,network,chain_id,currency,address,token_contract,active,created_by,created_at)
        SELECT $1,$2,$3,'DAI',$4,$5,TRUE,$6,NOW()
        WHERE NOT EXISTS (SELECT 1 FROM deposit_addresses WHERE network=$2 AND active=TRUE)
        ON CONFLICT(network,address) DO NOTHING`,
      [uuid(`deposit-address:${index}`),item.network,item.chainId,item.address,item.token,adminId]);
    }

    for (const mission of missions) {
      await client.query(`INSERT INTO missions(id,code,title,description,points,mission_type,active,one_time)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6,TRUE,$7)
        ON CONFLICT(code) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,points=EXCLUDED.points,
          mission_type=EXCLUDED.mission_type,active=TRUE,one_time=EXCLUDED.one_time`,
      [uuid(`mission:${mission.code}`),mission.code,JSON.stringify(mission.title),JSON.stringify(mission.description),mission.points,mission.type,mission.oneTime]);
    }

    const finance = new Map();
    const approvedDepositRows = new Map();
    for (const [index, person] of people.entries()) {
      const user = userMap.get(person.key);
      const depositTotal = person.key === 'argon' ? 480000 : 25000 + index * 6500;
      const pendingDeposit = person.key === 'argon' ? 35000 : index % 3 === 0 ? 12500 : 0;
      const totalInvestment = person.key === 'argon' ? 225000 : Math.round(depositTotal * (index % 3 === 0 ? 0.42 : 0.34));
      const locked = person.key === 'argon' ? 25000 : index % 4 === 0 ? Math.round(depositTotal * 0.08) : 0;
      const paidWithdrawal = person.key === 'argon' ? 45000 : Math.round(depositTotal * 0.04);
      const pendingWithdrawal = person.key === 'argon' ? 20000 : index % 5 === 0 ? Math.round(depositTotal * 0.025) : 0;
      let investmentParts;
      if (person.key === 'argon') investmentParts = [
        { project:'solar-grid', amount:100000, status:'active' },
        { project:'logistics-hub', amount:50000, status:'active' },
        { project:'battery-storage', amount:75000, status:'completed' },
      ];
      else {
        const completedPart = index % 4 === 0 ? Math.round(totalInvestment * 0.25) : 0;
        investmentParts = [
          { project:projectDefinitions[index % projectDefinitions.length].key, amount:totalInvestment-completedPart, status:'active' },
          ...(completedPart ? [{ project:projectDefinitions[(index+2)%projectDefinitions.length].key, amount:completedPart, status:'completed' }] : []),
        ].filter((x) => x.amount > 0);
      }
      const activeInvested = investmentParts.filter((x) => x.status === 'active').reduce((s,x)=>s+x.amount,0);
      const completedInvestment = investmentParts.filter((x) => x.status === 'completed').reduce((s,x)=>s+x.amount,0);
      const profit = person.key === 'argon' ? 32500 : Math.round(activeInvested * 0.035);
      finance.set(person.key, { depositTotal, pendingDeposit, totalInvestment, activeInvested, completedInvestment, locked, paidWithdrawal, pendingWithdrawal, profit, bonus:0,
        available:depositTotal-totalInvestment+completedInvestment-locked-paidWithdrawal-pendingWithdrawal, investmentParts, user });
      await client.query('UPDATE wallets SET available_minor=0,invested_minor=0,locked_minor=0,profit_minor=0,bonus_minor=0,withdrawal_pending_minor=0,deposited_total_minor=0,withdrawn_total_minor=0 WHERE user_id=$1 AND currency=\'DAI\'', [user.id]);

      // Approved deposits are posted to the ledger; pending requests do not affect the balance.
      const depositAmounts = person.key === 'argon' ? [250000,150000,80000] : [depositTotal];
      const approvedIds = [];
      for (let depIndex=0; depIndex<depositAmounts.length; depIndex++) {
        const amount = depositAmounts[depIndex];
        const key = `deposit:${person.key}:${depIndex+1}`;
        const txDate = isoDaysAgo(40-index + depIndex*3);
        const ledgerId = await postLedger(client,key,'seed_deposit','Synthetic approved deposit',user.id,'external_funding_asset','customer_available_liability',amount,txDate,adminId);
        const depId = uuid(key);
        const net = (index+depIndex)%2===0 ? 'BNB Smart Chain' : 'Base';
        const txid = `SYNTHETIC-TXID-${sha256(`fake-tx:${key}`).slice(0,32).toUpperCase()}`;
        await client.query(`INSERT INTO deposit_requests
          (id,public_id,user_id,amount_minor,currency,network,txid,status,note,reviewed_by,reviewed_at,ledger_transaction_id,chain_id,deposit_address_snapshot,token_contract_snapshot,created_at)
          VALUES($1,$2,$3,$4,'DAI',$5,$6,'approved',$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT(id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,status='approved',note=EXCLUDED.note,
            reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at,ledger_transaction_id=EXCLUDED.ledger_transaction_id`,
          [depId,publicId(`deposit-${person.key}-${depIndex+1}`),user.id,String(amount),net,txid,DEMO_NOTE,adminId,txDate,ledgerId,net==='Base'?8453:56,'SYNTHETIC-NOT-A-REAL-ADDRESS','SYNTHETIC-NOT-A-REAL-TOKEN',txDate]);
        approvedIds.push(depId);
      }
      approvedDepositRows.set(person.key, approvedIds);
      if (pendingDeposit > 0) {
        const key = `deposit-pending:${person.key}`;
        const txDate = isoDaysAgo(index%10+1);
        const net = index%2===0 ? 'Base' : 'BNB Smart Chain';
        await client.query(`INSERT INTO deposit_requests
          (id,public_id,user_id,amount_minor,currency,network,txid,status,note,chain_id,deposit_address_snapshot,token_contract_snapshot,created_at)
          VALUES($1,$2,$3,$4,'DAI',$5,$6,'pending',$7,$8,$9,$10,$11)
          ON CONFLICT(id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,status='pending',note=EXCLUDED.note`,
          [uuid(key),publicId(key),user.id,String(pendingDeposit),net,`SYNTHETIC-TXID-${sha256(`fake-tx:${key}`).slice(0,32).toUpperCase()}`,DEMO_NOTE,net==='Base'?8453:56,'SYNTHETIC-NOT-A-REAL-ADDRESS','SYNTHETIC-NOT-A-REAL-TOKEN',txDate]);
      }

      // Seed allocations are historical synthetic records. All live project subscriptions remain disabled.
      for (const [partIndex, part] of investmentParts.entries()) {
        const key = `investment:${person.key}:${partIndex+1}`;
        const txDate = isoDaysAgo(28-index+partIndex*2);
        const ledgerId = await postLedger(client,key,'seed_investment','Synthetic project allocation',user.id,'customer_available_liability','customer_invested_liability',part.amount,txDate,adminId);
        const projectId = projectMap.get(part.project);
        await client.query(`INSERT INTO investments(id,public_id,user_id,project_id,amount_minor,currency,status,ledger_transaction_id,created_at)
          VALUES($1,$2,$3,$4,$5,'DAI',$6,$7,$8)
          ON CONFLICT(id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,status=EXCLUDED.status,ledger_transaction_id=EXCLUDED.ledger_transaction_id`,
          [uuid(key),publicId(key),user.id,projectId,String(part.amount),part.status,ledgerId,txDate]);
        if (part.status==='completed') {
          await postLedger(client,`${key}:release`,'seed_investment_release','Synthetic completed allocation released to available balance',user.id,'customer_invested_liability','customer_available_liability',part.amount,isoDaysAgo(4-index),adminId);
        }
      }
      if (locked > 0) {
        await postLedger(client,`collateral:${person.key}`,'seed_collateral_lock','Synthetic loan collateral display',user.id,'customer_available_liability','customer_locked_liability',locked,isoDaysAgo(12-index),adminId);
      }
      if (pendingWithdrawal > 0) {
        const key = `withdrawal-pending:${person.key}`;
        const reserve = await postLedger(client,key,'seed_withdrawal_reserve','Synthetic pending withdrawal reserve',user.id,'customer_available_liability','customer_withdrawal_payable',pendingWithdrawal,isoDaysAgo(3+index%9),adminId);
        await client.query(`INSERT INTO withdrawal_requests(id,public_id,user_id,amount_minor,currency,network,destination_address,status,note,ledger_reserve_id,created_at)
          VALUES($1,$2,$3,$4,'DAI','BNB Smart Chain',$5,'pending',$6,$7,$8)
          ON CONFLICT(id) DO UPDATE SET status='pending',amount_minor=EXCLUDED.amount_minor,note=EXCLUDED.note`,
          [uuid(key),publicId(key),user.id,String(pendingWithdrawal),`TEST-ONLY-NOT-A-REAL-WALLET-${person.key.toUpperCase()}`,DEMO_NOTE,reserve,isoDaysAgo(3+index%9)]);
      }
      if (paidWithdrawal > 0) {
        const key = `withdrawal-paid:${person.key}`;
        const created = isoDaysAgo(20-index);
        const reserve = await postLedger(client,`${key}:reserve`,'seed_withdrawal_reserve','Synthetic paid withdrawal reserve',user.id,'customer_available_liability','customer_withdrawal_payable',paidWithdrawal,created,adminId);
        const settlement = await postLedger(client,`${key}:settlement`,'seed_withdrawal_paid','Synthetic manually settled withdrawal',user.id,'customer_withdrawal_payable','external_settlement_asset',paidWithdrawal,created,adminId);
        const net = index%2===0 ? 'Base' : 'BNB Smart Chain';
        await client.query(`INSERT INTO withdrawal_requests(id,public_id,user_id,amount_minor,currency,network,destination_address,status,payout_txid,note,ledger_reserve_id,ledger_settlement_id,reviewed_by,reviewed_at,created_at)
          VALUES($1,$2,$3,$4,'DAI',$5,$6,'paid',$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT(id) DO UPDATE SET status='paid',amount_minor=EXCLUDED.amount_minor,payout_txid=EXCLUDED.payout_txid,note=EXCLUDED.note,ledger_reserve_id=EXCLUDED.ledger_reserve_id,ledger_settlement_id=EXCLUDED.ledger_settlement_id`,
          [uuid(key),publicId(key),user.id,String(paidWithdrawal),net,`TEST-ONLY-NOT-A-REAL-WALLET-${person.key.toUpperCase()}`,`SYNTHETIC-PAYOUT-TXID-${sha256(`payout:${key}`).slice(0,32).toUpperCase()}`,DEMO_NOTE,reserve,settlement,adminId,created,created]);
      }
      if (profit > 0) await postLedger(client,`profit:${person.key}`,'seed_profit_accrual','Synthetic unverified profit illustration',user.id,'demo_profit_expense','customer_profit_liability',profit,isoDaysAgo(2+index%10),adminId);
    }

    // Seed referral rewards after deposits exist. Only 
    // Referral rewards are synthetic and explicitly pending/paid only inside the sample dataset.
    for (const [childIndex, person] of people.entries()) {
      if (!person.parent) continue;
      const parent = userMap.get(person.parent);
      const child = userMap.get(person.key);
      const sourceDepositId = approvedDepositRows.get(person.key)?.[0] || null;
      const childFinance = finance.get(person.key);
      const rewardAmount = Math.max(100, Math.round(childFinance.depositTotal * 0.10));
      let status = 'pending_compliance';
      if (person.parent === 'argon') status = childIndex % 6 < 2 ? 'paid' : childIndex % 6 < 4 ? 'approved' : 'pending_compliance';
      else if (childIndex % 3 === 0) status = 'paid';
      const rewardKey = `referral-reward:${person.key}`;
      await client.query(`INSERT INTO referral_rewards(id,referrer_user_id,referred_user_id,source_deposit_id,amount_minor,currency,status,created_at)
        VALUES($1,$2,$3,$4,$5,'DAI',$6,$7)
        ON CONFLICT(id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,status=EXCLUDED.status`,
        [uuid(rewardKey),parent.id,child.id,sourceDepositId,String(rewardAmount),status,isoDaysAgo(5+childIndex%20)]);
      if (status === 'paid') {
        const rewardDate = isoDaysAgo(4+childIndex%20);
        await postLedger(client,rewardKey,'seed_referral_reward','Synthetic referral reward credit',parent.id,'demo_referral_reward_expense','customer_bonus_liability',rewardAmount,rewardDate,adminId);
        finance.get(person.parent).bonus += rewardAmount;
      }
    }

    // Loan applications are read-only synthetic records; no loan proceeds are issued.
    for (const [index, person] of people.entries()) {
      if (index !== 0 && index % 4 !== 0) continue;
      const user = userMap.get(person.key);
      const f = finance.get(person.key);
      const key = `loan:${person.key}`;
      await client.query(`INSERT INTO loan_applications(id,public_id,user_id,collateral_minor,requested_minor,term_months,status,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(id) DO UPDATE SET collateral_minor=EXCLUDED.collateral_minor,requested_minor=EXCLUDED.requested_minor,
          term_months=EXCLUDED.term_months,status=EXCLUDED.status`,
        [uuid(key),publicId(key),user.id,String(f.locked),String(Math.max(100,f.locked/2)),index%2===0?4:8,index===0?'under_review':'submitted',isoDaysAgo(9+index)]);
    }

    // Support records and admin replies make the support workspace non-empty.
    const ticketSeeds = [
      { key:'argon-deposit-question', person:'argon', subject:'Deposit review status', message:'Please confirm whether my sample deposit request has completed review.', status:'in_progress', priority:'normal' },
      { key:'argon-profile-help', person:'argon', subject:'Profile information update', message:'I need help reviewing my profile and wallet network information.', status:'resolved', priority:'low' },
      { key:'amina-project-details', person:'amina', subject:'Project information request', message:'Could you provide the latest public information about the solar project?', status:'open', priority:'normal' },
      { key:'daniel-account-question', person:'daniel', subject:'Account statement', message:'I would like to understand the entries shown in my account activity.', status:'open', priority:'high' },
      { key:'elif-language-help', person:'elif', subject:'Language preference', message:'My account should display Turkish content.', status:'resolved', priority:'low' },
    ];
    const ticketIds = new Map();
    for (const [index, ticket] of ticketSeeds.entries()) {
      const ticketId = uuid(`ticket:${ticket.key}`);
      ticketIds.set(ticket.key,ticketId);
      const user = userMap.get(ticket.person);
      const created = isoDaysAgo(1+index*3);
      await client.query(`INSERT INTO support_tickets(id,public_id,user_id,subject,message,status,priority,assigned_to,created_at,updated_at,closed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,
          CASE WHEN $6::text IN ('resolved','closed') THEN $11::timestamptz ELSE NULL::timestamptz END)
        ON CONFLICT(id) DO UPDATE SET subject=EXCLUDED.subject,message=EXCLUDED.message,status=EXCLUDED.status,priority=EXCLUDED.priority,updated_at=EXCLUDED.updated_at,closed_at=EXCLUDED.closed_at`,
        [ticketId,publicId(`ticket-${ticket.key}`),user.id,ticket.subject,`${ticket.message} ${DEMO_NOTE}`,ticket.status,ticket.priority,adminId,created,created,
          ticket.status === 'resolved' || ticket.status === 'closed' ? created : null]);
      if (adminId) {
        await client.query(`INSERT INTO support_ticket_replies(id,ticket_id,author_user_id,body,created_at)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
          [uuid(`ticket-reply:${ticket.key}`),ticketId,adminId,`This is a seeded support response for interface testing. ${DEMO_NOTE}`,isoDaysAgo(index)]);
      }
    }

    // Mission definitions and synthetic progress for Argon and selected network users.
    const missionRows = await client.query('SELECT id,code FROM missions WHERE code = ANY($1::text[])', [missions.map((m)=>m.code)]);
    const missionIds = new Map(missionRows.rows.map((r)=>[r.code,r.id]));
    const argonCompleted = new Set(['complete_profile','verify_email','view_3_projects','first_deposit','first_investment']);
    for (const [index, person] of people.entries()) {
      const user = userMap.get(person.key);
      for (const mission of missions) {
        let status = 'pending';
        if (person.key === 'argon') status = argonCompleted.has(mission.code) ? 'completed' : 'pending';
        else if (mission.code === 'complete_profile' || (index % 3 === 0 && mission.code === 'view_3_projects')) status = 'completed';
        const completedAt = status === 'completed' ? isoDaysAgo(2 + index % 12) : null;
        await client.query(`INSERT INTO user_missions(id,user_id,mission_id,status,completed_at,reviewed_by,review_note)
          VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(user_id,mission_id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,
            reviewed_by=EXCLUDED.reviewed_by,review_note=EXCLUDED.review_note`,
          [uuid(`user-mission:${person.key}:${mission.code}`),user.id,missionIds.get(mission.code),status,completedAt,adminId,status==='completed'?DEMO_NOTE:'']);
      }
    }

    // Project views and reactions populate engagement metrics without opening subscriptions.
    for (const [projectIndex, project] of projectDefinitions.entries()) {
      const projectId = projectMap.get(project.key);
      const raised = { value:0 };
      for (const [userIndex, person] of people.entries()) {
        if ((userIndex + projectIndex) % 3 === 0 || userIndex === 0) {
          const user = userMap.get(person.key);
          const count = 1 + ((userIndex + projectIndex) % 5);
          await client.query(`INSERT INTO project_views(user_id,project_id,view_count,first_viewed_at,last_viewed_at)
            VALUES($1,$2,$3,$4,$5)
            ON CONFLICT(user_id,project_id) DO UPDATE SET view_count=EXCLUDED.view_count,last_viewed_at=EXCLUDED.last_viewed_at`,
            [user.id,projectId,count,isoDaysAgo(50-userIndex),isoDaysAgo(2+(userIndex%12))]);
          if ((userIndex + projectIndex) % 4 !== 0) {
            await client.query(`INSERT INTO project_reactions(user_id,project_id,reaction,created_at,updated_at)
              VALUES($1,$2,$3,$4,$4)
              ON CONFLICT(user_id,project_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=EXCLUDED.updated_at`,
              [user.id,projectId,(userIndex+projectIndex)%5===0?'dislike':'like',isoDaysAgo(1+(userIndex%18))]);
          }
        }
      }
      const totalRaised = await client.query('SELECT COALESCE(SUM(amount_minor),0)::text AS amount FROM investments WHERE project_id=$1', [projectId]);
      await client.query('UPDATE projects SET raised_minor=$2,updated_at=NOW() WHERE id=$1',[projectId,totalRaised.rows[0].amount]);
    }

    // Sample project entitlements and distribution reviews; no ownership or payments are asserted.
    for (const [index, item] of [
      {person:'argon',project:'solar-grid',type:'revenue_share',percentage:'1.25000000',status:'under_review'},
      {person:'argon',project:'battery-storage',type:'contractual_bonus',percentage:'0.50000000',status:'draft'},
      {person:'amina',project:'logistics-hub',type:'revenue_share',percentage:'0.75000000',status:'under_review'},
      {person:'daniel',project:'data-centre',type:'equity',percentage:'0.25000000',status:'draft'},
      {person:'elif',project:'ev-charging',type:'revenue_share',percentage:'0.62500000',status:'under_review'},
    ].entries()) {
      const key = `entitlement:${index+1}`;
      const entId = uuid(key);
      await client.query(`INSERT INTO project_entitlements(id,public_id,user_id,project_id,entitlement_type,percentage,status,legal_reference,created_by,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'',$8,$9)
        ON CONFLICT(id) DO UPDATE SET percentage=EXCLUDED.percentage,status=EXCLUDED.status`,
        [entId,publicId(key),userMap.get(item.person).id,projectMap.get(item.project),item.type,item.percentage,item.status,adminId,isoDaysAgo(18+index)]);
      if (index < 3) {
        await client.query(`INSERT INTO project_distributions(id,public_id,entitlement_id,amount_minor,currency,source_reference,status,created_by,created_at)
          VALUES($1,$2,$3,$4,'DAI',$5,'under_review',$6,$7)
          ON CONFLICT(id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,status='under_review'`,
          [uuid(`distribution:${index+1}`),publicId(`distribution-${index+1}`),entId,String(1250+index*850),`DEMO-DISTRIBUTION-${index+1}`,adminId,isoDaysAgo(7+index)]);
      }
    }

    // Four sample lottery tiers mirror the brief, but are closed to paid participation and clearly marked synthetic.
    const lotteryDefinitions = [
      {key:'lottery-1',entry:100,prize:100000,days:14,status:'open',title:{en:'Daily Starter Draw',ar:'سحب البداية',tr:'Başlangıç Çekilişi'}},
      {key:'lottery-3',entry:300,prize:300000,days:30,status:'open',title:{en:'Community Draw',ar:'سحب المجتمع',tr:'Topluluk Çekilişi'}},
      {key:'lottery-5',entry:500,prize:500000,days:-3,status:'closed',title:{en:'Monthly Featured Draw',ar:'السحب الشهري المميز',tr:'Aylık Özel Çekiliş'}},
      {key:'lottery-10',entry:1000,prize:1000000,days:-10,status:'closed',title:{en:'Premium Draw Archive',ar:'أرشيف السحب المميز',tr:'Premium Çekiliş Arşivi'}},
    ];
    const roundIds = [];
    for (const [index, round] of lotteryDefinitions.entries()) {
      const roundId = uuid(`lottery-round:${round.key}`); roundIds.push(roundId);
      const starts = isoDaysAgo(45-index*7);
      const ends = round.days >= 0 ? new Date(Date.now()+round.days*86_400_000) : isoDaysAgo(Math.abs(round.days));
      await client.query(`INSERT INTO lottery_rounds(id,public_id,title,entry_price_minor,prize_amount_minor,starts_at,ends_at,status,compliance_status,created_at)
        VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,'seeded_synthetic_not_authorized', $9)
        ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,entry_price_minor=EXCLUDED.entry_price_minor,prize_amount_minor=EXCLUDED.prize_amount_minor,
          starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,status=EXCLUDED.status,compliance_status='seeded_synthetic_not_authorized'`,
        [roundId,publicId(round.key),JSON.stringify(round.title),String(round.entry),String(round.prize),starts,ends,round.status,isoDaysAgo(45-index*7)]);
      for (const [userIndex, person] of people.entries()) {
        if ((userIndex + index) % 2 !== 0 && userIndex !== 0) continue;
        const tickets = 1 + ((userIndex + index) % 4);
        await client.query(`INSERT INTO lottery_entries(id,round_id,user_id,ticket_count,created_at)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET ticket_count=EXCLUDED.ticket_count`,
          [uuid(`lottery-entry:${round.key}:${person.key}`),roundId,userMap.get(person.key).id,tickets,isoDaysAgo(30-userIndex%20)]);
      }
    }

    // Wallet snapshots are set from the same synthetic events recorded in the ledger.
    for (const person of people) {
      const f = finance.get(person.key);
      await client.query(`UPDATE wallets SET available_minor=$2,invested_minor=$3,locked_minor=$4,profit_minor=$5,bonus_minor=$6,
        withdrawal_pending_minor=$7,deposited_total_minor=$8,withdrawn_total_minor=$9,updated_at=NOW()
        WHERE user_id=$1 AND currency='DAI'`,
        [f.user.id,String(f.available),String(f.activeInvested),String(f.locked),String(f.profit),String(f.bonus),String(f.pendingWithdrawal),String(f.depositTotal),String(f.paidWithdrawal)]);
    }

    // Keep all live financial product switches disabled. Seed records are read-only examples.
    const thresholds = Array.from({length:100},(_,i)=>({level:i+1,points:i*100}));
    await client.query(`INSERT INTO app_settings(key,value) VALUES
      ('level_thresholds',$1::jsonb),
      ('homepage_stats','{"mode":"calculated","manual":{}}'::jsonb),
      ('deposit_notice_hours','24'::jsonb),
      ('minimum_withdrawal_minor','2000'::jsonb),
      ('referral_percent','10'::jsonb),
      ('financial_products_enabled','{"deposits":false,"withdrawals":false,"investments":false,"loans":false,"lottery":false,"referral_rewards":false}'::jsonb),
      ('xbank_synthetic_seed',jsonb_build_object('version',$2::text,'createdAt',NOW(),'users',jsonb_array_length($3::jsonb),'warning','Synthetic test records only; not real balances or payments.'))
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
      [JSON.stringify(thresholds),SEED_VERSION,JSON.stringify(people)]);

    await client.query(`INSERT INTO audit_logs(id,actor_user_id,action,detail,created_at)
      VALUES($1,$2,'Synthetic site data seeded',$3,NOW()) ON CONFLICT(id) DO NOTHING`,
      [uuid('audit:seed-complete'),adminId,`Seed version ${SEED_VERSION}; ${people.length} users, ${projectDefinitions.length} projects, ${lotteryDefinitions.length} lottery rounds. ${DEMO_NOTE}`]);
  });

  const counts = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM users WHERE public_id LIKE 'XB-DEMO-%') AS users,
    (SELECT COUNT(*)::int FROM projects WHERE public_id LIKE 'XB-DEMO-%') AS projects,
    (SELECT COUNT(*)::int FROM deposit_requests WHERE public_id LIKE 'XB-DEMO-%') AS deposits,
    (SELECT COUNT(*)::int FROM investments WHERE public_id LIKE 'XB-DEMO-%') AS investments,
    (SELECT COUNT(*)::int FROM lottery_rounds WHERE public_id LIKE 'XB-DEMO-%') AS lotteries,
    (SELECT COUNT(*)::int FROM loan_applications WHERE public_id LIKE 'XB-DEMO-%') AS loans,
    (SELECT COUNT(*)::int FROM support_tickets WHERE public_id LIKE 'XB-DEMO-%') AS tickets,
    (SELECT COUNT(*)::int FROM referral_rewards WHERE referred_user_id IN (SELECT id FROM users WHERE public_id LIKE 'XB-DEMO-%')) AS referral_rewards,
    (SELECT COUNT(*)::int FROM missions WHERE active=TRUE) AS active_missions,
    (SELECT COUNT(*)::int FROM lottery_entries WHERE round_id IN (SELECT id FROM lottery_rounds WHERE public_id LIKE 'XB-DEMO-%')) AS lottery_entries,
    (SELECT COUNT(*)::int FROM deposit_addresses WHERE address LIKE 'TEST-ONLY-%' AND active=TRUE) AS synthetic_deposit_addresses`);
  console.log('\nSynthetic site data was seeded successfully.');
  console.log('Test login: Argon');
  console.log('Test email: argon@example.test');
  console.log('The password was hashed and is not stored in this script.');
  console.log('Data counts:', counts.rows[0]);
  console.log('Referral tree: Argon has 6 direct referrals and 22 referred accounts across 3 levels.');
  console.log('Deposit address placeholders are intentionally invalid and cannot receive assets.');
  console.log('IMPORTANT: all seeded records are synthetic and not real assets, payments, loans, rights or prizes.');
} catch (error) {
  console.error('Site data seed failed:', error.message);
  if (error.code) console.error('PostgreSQL error code:', error.code);
  if (error.detail) console.error('PostgreSQL detail:', error.detail);
  if (error.where) console.error('PostgreSQL context:', error.where);
  if (error.position) console.error('SQL position:', error.position);
  process.exitCode = 1;
} finally {
  process.stdin.setRawMode?.(false);
  await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
