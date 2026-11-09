-- Outlook marks pictures embedded in the body/signature as inline; sync now stores the flag.
ALTER TABLE "EmailAttachment" ADD COLUMN "isInline" BOOLEAN NOT NULL DEFAULT false;

-- Mail synced before the flag existed: Outlook names embedded pictures image001.png, image002.jpg…
UPDATE "EmailAttachment"
SET "isInline" = true
WHERE "mimeType" ILIKE 'image/%'
  AND "filename" ~* '^image[0-9]{3}\.(png|jpe?g|gif)$';
