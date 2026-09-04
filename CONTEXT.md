# Law Firm Practice Management

Domain language for how a Thai law firm staffs and owns casework inside LexFlow.

## Language

### People

**Lawyer**:
A firm member who practices on cases. Every working staff user is a Lawyer.
_Avoid_: Clerk, junior, paralegal (as a system role)

**Firm Owner**:
The firm membership role that administers the office (billing, invites, firm-wide visibility). Not a case role.
_Avoid_: Admin (except as the legacy `Role.ADMIN` label for the first owner account)

### Case staffing

**Case Owner**:
The single Lawyer accountable for a case. Exactly one per case.
_Avoid_: Lead lawyer, lead counsel, primary attorney

### Case identity

**Own Ref**:
The firm-facing case reference, auto-generated as `{prefix}{YYYY}{NNNN}` (default prefix `TSBREF`, Bangkok year, yearly sequence that resets each January).
_Avoid_: Manual case number, folder ID (separate storage key)
