# Offline patrol support

This project is an updated copy of `trythis2.rar`. Open this `trythis` folder in Android Studio. The original archive and the separate web command center were not modified.

## Sync permission fix (1.0.1)

The original offline build checked for an existing report/GPS record using an equality filter on the Firestore document ID. Against the supplied owner-based rules, that lookup was denied when the document did not exist, so the first upload never started. Device logs and a local Firestore emulator reproduced this exact failure for both `incidents` and `locationHistory`.

The corrected build queries `guardId` plus the stored `offlineActionId` field. A missing record returns an allowed empty result; a successful save keeps its stable document ID and action ID for retries. Existing queued records are compatible and gain the field when uploaded. A compatibility read handles previously acknowledged records that predate the field. Error messages/logs now identify the failed sync operation.

No rules change is required for this fix. Update the existing installation using the same signing key, open the sync banner, and tap Retry. Do not uninstall or clear app data: the saved reports, photos and GPS records are in the existing installation's private storage. For an Android Studio installation, run the updated project using the same Android Studio signing setup that installed the original app.

Validation: 14 local Firebase emulator assertions passed against the exact pasted rules, covering new uploads, existing-action lookup, immutable records and other-user denial for reports and route history. The old lookup reproduced PERMISSION_DENIED for missing records in both collections. This is in addition to the Android regression tests below; the fixed APK has not been installed on the user's phone by this task.

## Guard workflow

1. Sign in and start a patrol while connected. This loads the guard profile, patrol and assigned checkpoint definitions onto the phone.
2. If internet drops, continue scanning checkpoints, recording GPS history and submitting incident reports, including photos. GPS/location permission is still required for checkpoint verification.
3. The app confirms that each action is saved on the phone. The dashboard displays the number of pending actions and any actions needing attention.
4. Reconnection automatically schedules uploads. The phone keeps the original scan/report/location times. Android may defer background work; the sync banner is the source of truth for pending actions.
5. A saved active patrol can be resumed after reopening the app while the same Firebase user remains signed in. An app force-stop suspends Android background work until the app is reopened.

New sign-ins and starting a new patrol still require internet. This feature supports continuing a patrol that was already started online. Supervisor notifications and report emails can only arrive after the relevant data reaches Firebase. Do not clear app data or uninstall while actions are pending.

## Implementation

- `offline/OfflineStore.kt`: a private SQLite outbox scoped by the original Firebase UID. Actions remain until the server acknowledges them. Rejected actions remain available for review/retry.
- `offline/OfflinePatrol.kt`: persistent Firestore cache, serialized local scan recording and network-constrained WorkManager scheduling. Cache includes the checkpoint documents read when the patrol starts.
- `offline/PatrolProgress.kt`: merges individual scan evidence into existing progress without replacing another device's accepted scans.
- `offline/PatrolSyncWorker.kt`: uploads only the signed-in guard's queue. Transient failures retry with backoff. Scans use a server transaction to recheck assignment, current QR and the recorded GPS fix, and atomically write progress plus audit history. A receipt on the patrol prevents duplicate application after uncertain acknowledgements. Reports and route points use stable IDs and owner-scoped existence queries, compatible with create-only guard permissions.
- Reports copy every selected photo into private app storage before confirming local save. A failed copy leaves the form open; missing evidence is never silently discarded. Uploads use the existing `incident_photos/{incidentId}/...` location. Photos are deleted locally only after the report is acknowledged.
- `offline/SyncStatusView.kt`: pending/error banner and Retry action. Assignment/permission/location conflicts are retained and shown, rather than silently counted as synced.
- `SplashActivity.kt`: resumes an existing cached active patrol for its authenticated owner after reopening.
- `PatrolLocationService.kt`: durable, throttled GPS history; live-location snapshots retain Firestore's existing offline write support.

The existing Firebase schemas are retained. Added metadata includes `syncedAt`, `recordedByUid`, `deviceTimestamp`, and `patrol_logs.offlineScanReceipts`. No Firebase configuration, rules or deployed backend was changed. The app must retain read access to the guard's own incidents, location history and patrol records, plus write access to the existing collections and photo storage path. Permission failures appear in the sync banner.

## Automated validation

Run with JDK 21 / the included Gradle wrapper:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```

Verified on 2026-09-26: debug APK built, 15 tests passed (14 offline regression tests and the existing example test). Tests cover SQLite reopen recovery, exact timestamps, photo references, account separation, duplicate rejection, failed-action retention/retry, incremental progress, concurrent accepted progress, rejected evidence exclusion, occurrence-time completion and required-checkpoint counting.

Tests use Robolectric; its runtime cache is stored under `app/build/test-home`. These are local automated tests, not a completed physical-device/Firebase end-to-end patrol test.

## Device acceptance checklist

Use a test guard and test patrol/site in your Firebase environment.

1. Start a patrol online with at least three assigned checkpoints. Confirm its profile and checkpoint list have loaded.
2. Turn off Wi-Fi and mobile data, keeping location enabled. Scan the first checkpoint at its registered location. Expect immediate local confirmation and a pending-action count.
3. Scan it again. Expect duplicate rejection. Try an unassigned QR and a QR scanned outside its radius; neither should advance progress.
4. Submit a report with text and two photos. Expect a local-save confirmation. Reopen the app offline; the same active patrol and pending actions should remain.
5. Scan the remaining checkpoints. Expect completion on the phone with sync still pending. GPS history should remain queued.
6. Restore internet. Wait for the queue to drain. Verify one audit record per checkpoint, one incident with both photos, correct GPS occurrence times, and a single completed patrol on the web dashboard.
7. Interrupt internet during photo upload, then restore it. Expect the same incident ID and all photos, with no duplicate report.
8. In a separate test, change/revoke a checkpoint or deny write permission before reconnecting. Expect a visible sync error with the saved evidence retained. Restore the appropriate assignment/permission and tap Retry.
9. Verify that signing into a different account never uploads the previous guard's queue. Signing back into the original account should resume its pending sync.

## References

- [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Android persistent work](https://developer.android.com/develop/background-work/background-tasks/persistent)
