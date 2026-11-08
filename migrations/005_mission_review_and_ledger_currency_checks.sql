ALTER TABLE user_missions
  ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_missions_review_note_length'
  ) THEN
    ALTER TABLE user_missions ADD CONSTRAINT user_missions_review_note_length
      CHECK (length(review_note) <= 1000);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION xbank_assert_ledger_transaction_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction UUID;
  entry_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    target_transaction := NEW.id;
  ELSE
    target_transaction := NEW.transaction_id;
  END IF;

  SELECT COUNT(*) INTO entry_count
  FROM ledger_entries
  WHERE transaction_id = target_transaction;

  IF entry_count < 2 OR EXISTS (
    SELECT 1
    FROM ledger_entries
    WHERE transaction_id = target_transaction
    GROUP BY currency
    HAVING SUM(debit_minor) <= 0 OR SUM(debit_minor) <> SUM(credit_minor)
  ) OR NOT EXISTS (
    SELECT 1 FROM ledger_entries WHERE transaction_id = target_transaction
  ) THEN
    RAISE EXCEPTION 'Ledger transaction % is not balanced per currency.', target_transaction
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;
