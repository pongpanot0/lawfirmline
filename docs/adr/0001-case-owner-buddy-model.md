# Case staffing is Owner + Buddy, not role tiers

Thai firms using this product staff cases as peer lawyers (buddy system), not Lead / Co-counsel / Clerk hierarchies. We keep firm-level `Role` as ADMIN | LAWYER only, and per-case assignment as a single Case Owner (`leadLawyerId`) plus zero-or-more Buddies (`AssignmentType.BUDDY`). Rejected: keeping Clerk as a user role, or separate co-counsel vs clerk assignment types — both reintroduce the visibility problem the product is meant to solve.
