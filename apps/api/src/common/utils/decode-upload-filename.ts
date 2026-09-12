/**
 * Multer decodes multipart filenames as latin1, so a UTF-8 name such as
 * "สัญญา.pdf" arrives as mojibake. Re-reading the same bytes as UTF-8
 * restores it; a name that was plain ASCII (or already valid) is returned
 * unchanged because the round trip is a no-op for it.
 */
export function decodeUploadFilename(originalname: string): string {
  if (!originalname) return originalname;
  const bytes = Buffer.from(originalname, 'latin1');
  const utf8 = bytes.toString('utf8');
  // U+FFFD means the bytes were not valid UTF-8, i.e. the name was genuinely latin1 — keep it.
  if (utf8.includes('�')) return originalname;
  return utf8;
}
