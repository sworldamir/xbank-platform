ALTER TABLE deposit_addresses
  ADD COLUMN IF NOT EXISTS chain_id INTEGER,
  ADD COLUMN IF NOT EXISTS token_contract TEXT NOT NULL DEFAULT '';

UPDATE deposit_addresses
SET chain_id = CASE network WHEN 'BNB Smart Chain' THEN 56 WHEN 'Base' THEN 8453 ELSE chain_id END
WHERE chain_id IS NULL;

ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS chain_id INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_address_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS token_contract_snapshot TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS deposit_requests_txid_lookup_idx
  ON deposit_requests(network, txid);
