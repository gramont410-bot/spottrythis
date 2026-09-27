# S.P.O.T. Mobile QR Assignment Integration

This Android project is wired to the QR assignment workflow in the supervisor web console.

## Guard scanner behavior

`ScanCheckpointActivity.kt` now reads the top-level Firestore `checkpoints` collection used by the web console.

A scanned QR is accepted only when:

1. The checkpoint belongs to the guard's assigned site.
2. The checkpoint status is active.
3. `assignedGuardIds` contains the signed-in guard's Firebase UID or guard ID alias.

If not assigned, the guard sees:

> Access Denied — This checkpoint is not assigned to you.

Successful logs now include `checkpointId`, `checkpointName`, `qrCode`, `qrPayload`, `assignmentVerified`, and the existing legacy `locationId` / `locationName` fields.

## Offline behavior

When the guard dashboard is online it caches the guard's assigned checkpoints for up to 24 hours. If the network becomes unavailable, a cached assigned QR can still be verified and the Firestore write is queued locally for synchronization.

Server-side Firestore rules still make the final authorization decision when the queued write reaches Firebase.

## Guard dashboard

The guard dashboard now shows:

- Roving time assigned from `roving_assignments`
- Roving instructions/notes, when present
- Number of QR checkpoints assigned to the current guard

## Web/mobile schema compatibility

The companion web project was also updated so Android guard fields are recognized correctly:

- `fullName` -> guard display name
- `assignedSiteId` -> deployed site
- `dutyStart` / `dutyEnd` -> shift display

## Firestore rules

`FIRESTORE_RULES_RECOMMENDED.rules` contains the matching rule set. The important checkpoint-log rule verifies that `checkpointId` exists in the top-level `checkpoints` collection and that the authenticated guard is listed in its `assignedGuardIds`.

For strongest enforcement, deploy those rules from the supervisor web project after reviewing them against your current Firebase Authentication setup.
