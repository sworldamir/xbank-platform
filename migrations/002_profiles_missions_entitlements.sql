ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS province TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wallet_network TEXT NOT NULL DEFAULT '';

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_idx ON support_ticket_replies(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS project_views (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count > 0),
  PRIMARY KEY(user_id, project_id)
);
CREATE INDEX IF NOT EXISTS project_views_project_idx ON project_views(project_id, last_viewed_at DESC);

CREATE TABLE IF NOT EXISTS project_reactions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  reaction TEXT NOT NULL CHECK (reaction IN ('like','dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, project_id)
);

CREATE TABLE IF NOT EXISTS project_entitlements (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  entitlement_type TEXT NOT NULL CHECK (entitlement_type IN ('equity','revenue_share','contractual_bonus')),
  percentage NUMERIC(12,8) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','suspended','terminated')),
  legal_reference TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (status <> 'approved' OR length(trim(legal_reference)) > 0)
);
CREATE INDEX IF NOT EXISTS project_entitlements_user_idx ON project_entitlements(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_distributions (
  id UUID PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  entitlement_id UUID NOT NULL REFERENCES project_entitlements(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'DAI' CHECK (currency = 'DAI'),
  source_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'under_review' CHECK (status IN ('under_review','approved','paid','rejected')),
  ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  CHECK (length(trim(source_reference)) >= 4)
);
CREATE INDEX IF NOT EXISTS project_distributions_entitlement_idx ON project_distributions(entitlement_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id, expires_at DESC);

INSERT INTO app_settings(key,value) VALUES
  ('level_thresholds','[{"level":1,"points":0}]'::jsonb)
ON CONFLICT(key) DO NOTHING;

INSERT INTO missions(id,code,title,description,points,mission_type,active,one_time) VALUES
  ('00000000-0000-4000-8000-000000000001','complete_profile',
   '{"en":"Complete your profile","ar":"أكمل ملفك الشخصي","tr":"Profilinizi tamamlayın"}'::jsonb,
   '{"en":"Add the required personal and wallet details.","ar":"أضف البيانات الشخصية وبيانات المحفظة المطلوبة.","tr":"Gerekli kişisel ve cüzdan bilgilerini ekleyin."}'::jsonb,0,'complete_profile',FALSE,TRUE),
  ('00000000-0000-4000-8000-000000000002','verify_email',
   '{"en":"Verify your email","ar":"تحقق من بريدك الإلكتروني","tr":"E-postanızı doğrulayın"}'::jsonb,
   '{"en":"Verify the email address on your account.","ar":"تحقق من عنوان البريد الإلكتروني في حسابك.","tr":"Hesabınızdaki e-posta adresini doğrulayın."}'::jsonb,0,'verify_email',FALSE,TRUE),
  ('00000000-0000-4000-8000-000000000003','view_3_projects',
   '{"en":"Explore three projects","ar":"استكشف ثلاثة مشاريع","tr":"Üç projeyi keşfedin"}'::jsonb,
   '{"en":"Open the details of three distinct projects.","ar":"افتح تفاصيل ثلاثة مشاريع مختلفة.","tr":"Üç farklı projenin ayrıntılarını açın."}'::jsonb,0,'view_3_projects',FALSE,TRUE),
  ('00000000-0000-4000-8000-000000000004','first_deposit',
   '{"en":"First verified deposit","ar":"أول إيداع موثق","tr":"İlk doğrulanmış yatırma"}'::jsonb,
   '{"en":"Complete the first deposit after compliance checks are enabled.","ar":"أكمل أول إيداع بعد تفعيل فحوصات الامتثال.","tr":"Uyum kontrolleri etkinleştirildikten sonra ilk yatırmayı tamamlayın."}'::jsonb,0,'first_deposit',FALSE,TRUE),
  ('00000000-0000-4000-8000-000000000005','first_investment',
   '{"en":"First approved allocation","ar":"أول تخصيص معتمد","tr":"İlk onaylı tahsis"}'::jsonb,
   '{"en":"Record the first allocation in an approved project.","ar":"سجل أول تخصيص في مشروع معتمد.","tr":"Onaylı bir projede ilk tahsisi kaydedin."}'::jsonb,0,'first_investment',FALSE,TRUE)
ON CONFLICT(code) DO NOTHING;
