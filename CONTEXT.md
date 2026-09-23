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

### Case parties

**Case Participant**:
A person or organization named in the matter, recorded as one of any number of parties with its own court role and side.
_Avoid_: Client (the represented party), Customer (the payer)

**Participant Role**:
The party's procedural status, including Plaintiff, Joint Plaintiff, Defendant, Joint Defendant, Petitioner, Respondent, and other court roles.
_Avoid_: Party Role (reserved for the single `Case.partyRole` perspective describing which side the firm represents)

### Case lifecycle

**Case (Matter)**:
The single unit of legal work from first receipt through the pre-filing and court phases. A matter starts in the pre-filing phase before a court filing exists.
_Avoid_: Treating a new receipt and its linked case as two separate work items

**Intake Source**:
The referral, contact, screening, and notice details captured when work first arrives. These details remain attached to the Case as its origin history; they do not create a second active matter.
_Avoid_: A standalone intake queue for new matters
