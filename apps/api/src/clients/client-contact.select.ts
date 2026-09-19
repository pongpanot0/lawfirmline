/**
 * The contact shape the API hands out.
 *
 * The clients page edits contacts by sending the fetched list straight back to
 * PUT /clients/:id, so this must stay in sync with ClientContactDto — any extra
 * field here is rejected by the whitelisting ValidationPipe on the way back in.
 * It also keeps passwordHash and the LINE link tokens off the wire.
 */
export const CLIENT_CONTACT_SELECT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  phone: true,
  position: true,
  isPrimary: true,
  portalEnabled: true,
  notes: true,
} as const;
