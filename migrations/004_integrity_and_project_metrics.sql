ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS views_override INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_views_override_nonnegative'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_views_override_nonnegative
      CHECK (views_override IS NULL OR views_override BETWEEN 0 AND 1000000000);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION xbank_assert_ledger_transaction_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction UUID;
  entry_count BIGINT;
  debit_total NUMERIC;
  credit_total NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    target_transaction := NEW.id;
  ELSE
    target_transaction := NEW.transaction_id;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0)
    INTO entry_count, debit_total, credit_total
    FROM ledger_entries
    WHERE transaction_id = target_transaction;

  IF entry_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Ledger transaction % is not balanced (entries %, debits %, credits %).',
      target_transaction, entry_count, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_transaction_balance_check
AFTER INSERT ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION xbank_assert_ledger_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_entries_balance_check
AFTER INSERT ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION xbank_assert_ledger_transaction_balanced();

CREATE OR REPLACE FUNCTION xbank_prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Posted ledger records are immutable. Create a compensating transaction instead.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION xbank_prevent_ledger_mutation();

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION xbank_prevent_ledger_mutation();
