-- The claimed amount is a core case column (claimedAmount / ทุนทรัพย์); the
-- Litigation type carried a duplicate "Claim Amount" custom field, so the
-- create-case form asked for the same number twice.
UPDATE "CaseType"
SET "fieldSchema" = COALESCE(
  (
    SELECT jsonb_agg(field)
    FROM jsonb_array_elements("fieldSchema") AS field
    WHERE field->>'key' <> 'claimAmount'
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof("fieldSchema") = 'array'
  AND "fieldSchema" @> '[{"key":"claimAmount"}]'::jsonb;
