CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar','tr')),
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','support','finance')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','pending','suspended','closed')),
  email_verified_at TIMESTAMPTZ,
  identity_status TEXT NOT NULL DEFAULT 'not_started' CHECK (identity_status IN ('not_started','pending','verified','rejected')),
  referral_code TEXT NOT NULL UNIQUE,
  referred_by UUID REFERENCES users(id) ON DELETE SET NULL,
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users(referred_by);

CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL DEFAULT 'DAI' CHECK (currency IN ('DAI','USD','USDT')),
  available_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  invested_minor BIGINT NOT NULL DEFAULT 0 CHECK (invested_minor >= 0),
  locked_minor BIGINT NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
  profit_minor BIGINT NOT NULL DEFAULT 0 CHECK (profit_minor >= 0),
  bonus_minor BIGINT NOT NULL DEFAULT 0 CHECK (bonus_minor >= 0),
  withdrawal_pending_minor BIGINT NOT NULL DEFAULT 0 CHECK (withdrawal_pending_minor >= 0),
  deposited_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (deposited_total_minor >= 0),
  withdrawn_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (withdrawn_total_minor >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, currency)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  idempotency_key TEXT UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  account_code TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL DEFAULT 'DAI',
  debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id, line_number),
  CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))
);
CREATE INDEX IF NOT EXISTS ledger_entries_user_idx ON ledger_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_code, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_addresses (
  id UUID PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('BNB Smart Chain','Base')),
  currency TEXT NOT NULL DEFAULT 'DAI' CHECK (currency = 'DAI'),
  address TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(network, address)
);
CREATE TABLE IF NOT EXISTS deposit_requests (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'DAI' CHECK (currency = 'DAI'),
  network TEXT NOT NULL CHECK (network IN ('BNB Smart Chain','Base')),
  txid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  note TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(network, txid)
);
CREATE UNIQUE INDEX IF NOT EXISTS deposit_addresses_one_active_per_network ON deposit_addresses(network) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS deposit_requests_status_idx ON deposit_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS deposit_requests_user_idx ON deposit_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'DAI' CHECK (currency = 'DAI'),
  network TEXT NOT NULL CHECK (network IN ('BNB Smart Chain','Base')),
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected','cancelled')),
  payout_txid TEXT,
  note TEXT NOT NULL DEFAULT '',
  ledger_reserve_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  ledger_settlement_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_txid_unique ON withdrawal_requests(network, payout_txid) WHERE payout_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS withdrawal_status_idx ON withdrawal_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'General',
  title JSONB NOT NULL,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  minimum_minor BIGINT NOT NULL DEFAULT 0 CHECK (minimum_minor >= 0),
  maximum_minor BIGINT NOT NULL DEFAULT 0 CHECK (maximum_minor >= 0),
  target_minor BIGINT NOT NULL DEFAULT 0 CHECK (target_minor >= 0),
  raised_minor BIGINT NOT NULL DEFAULT 0 CHECK (raised_minor >= 0),
  duration TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('active','upcoming','completed','paused')),
  risk TEXT NOT NULL DEFAULT 'Unrated',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  investments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  compliance_status TEXT NOT NULL DEFAULT 'not_reviewed' CHECK (compliance_status IN ('not_reviewed','under_review','approved','rejected')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (maximum_minor = 0 OR maximum_minor >= minimum_minor)
);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status, created_at DESC);

CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'DAI' CHECK (currency = 'DAI'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  ledger_transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS investments_user_idx ON investments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY,
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_deposit_id UUID REFERENCES deposit_requests(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'DAI',
  status TEXT NOT NULL DEFAULT 'pending_compliance' CHECK (status IN ('pending_compliance','approved','paid','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referred_user_id, source_deposit_id)
);

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title JSONB NOT NULL,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  mission_type TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  one_time BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_missions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  completed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, mission_id)
);

CREATE TABLE IF NOT EXISTS loan_applications (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  collateral_minor BIGINT NOT NULL CHECK (collateral_minor > 0),
  requested_minor BIGINT NOT NULL CHECK (requested_minor > 0),
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','approved','rejected','repaid','defaulted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lottery_rounds (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  title JSONB NOT NULL,
  entry_price_minor BIGINT NOT NULL CHECK (entry_price_minor > 0),
  prize_amount_minor BIGINT NOT NULL CHECK (prize_amount_minor >= 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','drawn','cancelled')),
  compliance_status TEXT NOT NULL DEFAULT 'not_reviewed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS lottery_entries (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ticket_count INTEGER NOT NULL CHECK (ticket_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip_address INET,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

INSERT INTO app_settings(key, value) VALUES
  ('deposit_notice_hours', '24'::jsonb),
  ('minimum_withdrawal_minor', '2000'::jsonb),
  ('referral_percent', '10'::jsonb),
  ('homepage_stats', '{"mode":"calculated","manual":{}}'::jsonb),
  ('financial_products_enabled', '{"deposits":false,"withdrawals":false,"investments":false,"loans":false,"lottery":false,"referral_rewards":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
