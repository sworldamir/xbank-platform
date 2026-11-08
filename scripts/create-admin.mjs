import crypto from 'node:crypto';
import readline from 'node:readline';
import { pool, withTransaction } from '../server/db.mjs';
import { assertPasswordPolicy, hashPassword } from '../server/security.mjs';

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}
function promptSecret(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Run this command in an interactive PowerShell or terminal window.'));
      return;
    }
    process.stdout.write(question);
    let value = '';
    const input = (buffer) => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\u0003') { process.stdout.write('\n'); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', input);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', input);
  });
}

try {
  const username = (await prompt('Admin username [admin]: ')) || 'admin';
  const email = await prompt('Admin email: ');
  const password = await promptSecret('Admin password (input hidden): ');
  const confirm = await promptSecret('Confirm password (input hidden): ');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 characters and use letters, numbers, dot, underscore or hyphen.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password !== confirm) throw new Error('Passwords do not match.');
  assertPasswordPolicy(password);
  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const publicId = `XB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  await withTransaction(async (client) => {
    // Serialize bootstrap so two simultaneous invocations cannot create multiple first administrators.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('xbank-initial-admin-bootstrap', 0))");
    const existing = await client.query("SELECT id FROM users WHERE role IN ('admin','finance','support') LIMIT 1");
    if (existing.rowCount) throw new Error('A staff account already exists. Use the account recovery procedure; this command only bootstraps the first administrator.');
    await client.query(`INSERT INTO users(id, public_id, username, email, password_hash, display_name, role, account_status, email_verified_at, referral_code)
      VALUES($1,$2,$3,$4,$5,'XBank Administrator','admin','active',NOW(),$6)`, [userId, publicId, username, email.toLowerCase(), passwordHash, referralCode]);
    await client.query("INSERT INTO wallets(user_id,currency) VALUES($1,'DAI')", [userId]);
    await client.query('INSERT INTO audit_logs(id,actor_user_id,action,detail) VALUES($1,$2,$3,$4)', [crypto.randomUUID(), userId, 'Initial administrator created', 'Initial administrator bootstrapped through CLI.']);
  });
  console.log(`Administrator created. Username: ${username}. Login: /admin/login`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  process.stdin.setRawMode?.(false);
  await pool.end();
}
