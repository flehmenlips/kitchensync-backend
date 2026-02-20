-- Atomic business hours update: deletes existing and inserts new hours in a single transaction.
-- Apply this migration in the Supabase SQL Editor or via supabase CLI.

CREATE OR REPLACE FUNCTION update_business_hours(
  p_business_id uuid,
  p_hours jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM business_hours WHERE business_id = p_business_id;

  INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed, notes)
  SELECT
    p_business_id,
    (h->>'day_of_week')::int,
    h->>'open_time',
    h->>'close_time',
    (h->>'is_closed')::boolean,
    h->>'notes'
  FROM jsonb_array_elements(p_hours) AS h;
END;
$$;

-- Unique constraint on order numbers per business (for race condition prevention)
ALTER TABLE orders ADD CONSTRAINT orders_business_order_number_unique
  UNIQUE (business_id, order_number);

-- Configurable tax/delivery columns on business_accounts (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_accounts' AND column_name = 'tax_rate') THEN
    ALTER TABLE business_accounts ADD COLUMN tax_rate numeric DEFAULT 0.08;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_accounts' AND column_name = 'delivery_fee') THEN
    ALTER TABLE business_accounts ADD COLUMN delivery_fee numeric DEFAULT 5.00;
  END IF;
END $$;
