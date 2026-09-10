-- Rename first firm slug to thesiambarristers (was demo-law-firm / thesiambarrister).
UPDATE "Firm"
SET
  "slug" = 'thesiambarristers',
  "name" = 'The Siam Barrister',
  "updatedAt" = NOW()
WHERE "slug" IN ('demo-law-firm', 'thesiambarrister', 'thesiambarristers')
   OR "id" = 'default-firm';
