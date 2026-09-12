-- The claimAmount custom field was dropped from the case form, but the values
-- entered before that are still sitting in Case.customFields where nothing
-- reads them. Move them into the real column, once, and only where it is safe:
-- claimedAmount not already set, the key present, and the text parsable.
UPDATE "Case"
SET "claimedAmount" = ("customFields" ->> 'claimAmount')::double precision
WHERE "claimedAmount" IS NULL
  AND "customFields" IS NOT NULL
  AND jsonb_typeof("customFields") = 'object'
  AND "customFields" ? 'claimAmount'
  AND ("customFields" ->> 'claimAmount') ~ '^[0-9]+(\.[0-9]+)?$';
