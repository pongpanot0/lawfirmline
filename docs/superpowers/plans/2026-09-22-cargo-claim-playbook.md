# Cargo Claim Playbook Integration Plan

**Goal:** Move the reusable Cargo workflow and 16-document matrix into a versioned Playbook while keeping facts and legal conclusions in each matter's Cargo Workspace.

**Architecture:** Add a stable Cargo template key and JSON checklist to `PlaybookRelease`. A Cargo Claim stores the selected release and snapshots its requirements. Intake selects the release at creation; Case creation or conversion applies that same release into tasks. Existing matter data remains immutable when a new release is published.

**Spec:** `docs/superpowers/specs/2026-09-22-cargo-claim-workspace-design.md`

## Task 1: Versioned Cargo template

- Extend Prisma with Playbook template metadata and CargoClaim release link.
- Define the standard Cargo steps and checklist contract in shared code.
- Validate Cargo template publishing and preserve metadata when publishing the next version.
- Allow multiple distinct playbooks on one case while keeping each release idempotent.

## Task 2: Apply from both entry paths

- Lazily create Cargo Claim Assessment v1 for a firm on first use.
- Snapshot its requirements when Cargo starts from Intake or direct Case.
- Apply its tasks once a Case exists, including Intake-to-Case conversion.
- Let an existing Cargo Claim without a release adopt the latest release through the existing enable action.

## Task 3: Workbench and Playbook management

- Show active Playbook name/version in the Cargo Workbench.
- Let owners edit Cargo requirement labels/default requiredness and publish the next version.
- Make Cargo entry paths explain that the Cargo Playbook is applied automatically.

## Task 4: Verification

- Unit-test release creation, requirement snapshots, conversion, idempotency, and version isolation.
- Run focused API tests, typechecks, web tests/build, and Cargo browser E2E.
- Confirm the named Case displays a Cargo Playbook release and preserves black/red case-number fields.
