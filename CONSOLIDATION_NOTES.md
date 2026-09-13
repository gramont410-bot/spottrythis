# S.P.O.T. Consolidated Integration

This project is based on `spot(3).zip` and preserves its newer web/client-role structure while restoring the current Android patrol integration contract.

## Canonical shared data contract

The web console and Android app must use the same Firebase project and these collections/IDs:

- `users/{firebaseAuthUid}` — guard profile. The Firebase Authentication UID is the Firestore document ID.
- `roving_assignments/{siteId}__{guardUid}` — supervisor recurring patrol schedule.
- `checkpoints/{checkpointId}` — QR checkpoint definition. `assignedGuardIds` contains Firebase UIDs.
- `patrol_logs/{patrolLogId}` — Android patrol execution record.
- `checkpoint_logs/{id}` — QR scan history.
- `guardLocations/{guardUid}` — latest live patrol location.
- `locationHistory/{id}` — patrol GPS breadcrumb history, linked by `patrolId`.
- `guard_transfer_history/{id}` — supervisor deployment transfer audit trail.

## Preserved web features

- Client role / client-scoped access and Client Portal routes
- Sites and client metadata (`clientId`)
- Existing dashboard, analytics, reports, incidents, devices and account management
- Current sidebar and role routing

## Restored/current patrol features

- Guard Firebase Auth account creation without logging out the supervisor
- Firebase UID as the canonical guard ID between web and Android
- QR assignment by guard UID
- Multiple recurring patrol times through `roving_assignments`
- Scheduled / Late / Missed supervisor derivation
- Android `patrol_logs` execution monitoring
- Live GPS from `guardLocations`
- Real breadcrumb route from `locationHistory`
- Move Guard workflow with old schedule deactivation and old QR removal
- Transfer history

## Android integration pack

The folder `android-integration/` contains the current core files that match this web project's Firestore schema:

- `GuardDashboardActivity.kt`
- `ScanCheckpointActivity.kt`
- `PatrolLocationService.kt`
- `LoginActivity.kt`
- `FaceVerifyActivity.kt`
- `GuardFaceEnrollmentActivity.kt` when available
- `AndroidManifest.xml`

Copy these into the matching packages of the Android Studio project. Do not change the collection names or use human-readable `G-xxxx` as the Firestore guard document ID. `G-xxxx` remains a display/business ID only.

The Android pack also carries `clientId` into patrol logs, live GPS, route history and checkpoint logs so Client Portal Firestore scoping can continue to work.

## Firebase deployment

1. Publish the included root `firestore.rules`.
2. Deploy Firebase Functions if the project uses them (`functions/index.js` includes current `patrol_logs` auditing plus the legacy audit trigger).
3. Confirm Email/Password authentication is enabled.
4. Confirm the web and Android apps point to Firebase project `spot-f503e` (or update both together if using another project).

## Guard flow that must remain unchanged

Supervisor creates guard account -> guard signs in on Android -> first mobile login enrolls face if `faceEmbedding` is empty -> face/liveness verification -> dashboard loads assigned site -> supervisor schedule from `roving_assignments` -> Start Patrol -> one `IN_PROGRESS` `patrol_logs` record -> foreground GPS tracking -> QR scans update the same patrol -> final required QR completes patrol -> GPS stops -> supervisor sees current/history data.

## Site transfer flow

If a guard has an active patrol, the web blocks the transfer. Otherwise:

1. `users/{uid}` gets the destination `assignedSiteId`, `siteName`, `clientId`.
2. Old `roving_assignments` records become `Inactive`.
3. The guard is removed from old-site checkpoint `assignedGuardIds`.
4. A `guard_transfer_history` record is written.
5. The Android dashboard listens to `users/{uid}` and reloads the new deployment without a new account or face enrollment.
6. The supervisor assigns the new site's QR checkpoints and patrol times separately.

## Verification performed

The modified web JavaScript/JSX files were parsed successfully with Babel and integration-contract checks passed for the current collection names/UID flow. A full Vite production build could not be completed in this environment because the uploaded `node_modules` was missing Rollup's Linux optional native package. Run `npm install` on your machine, then `npm run build`.

The Android files were not Gradle-compiled in this environment. Rebuild the Android project in Android Studio after copying the integration files.
