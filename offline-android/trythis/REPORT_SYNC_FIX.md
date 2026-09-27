# Guard Report → Supervisor Web Realtime Sync

This build fixes the report pipeline so the Android guard app and the supervisor web app use the same Firestore collection.

## Data flow

1. A guard logs in with Firebase Authentication.
2. The guard submits a report from the Android app.
3. Android writes the document to `incidents/{incidentId}`.
4. The document stores `guardId = FirebaseAuth.currentUser.uid`.
5. Firestore Security Rules permit the authenticated guard to create only their own incident.
6. The React web app listens to `/incidents` with `onSnapshot`.
7. The supervisor dashboard updates in real time and shows the submission in **Recent Guard Reports**.
8. The full report is also available on the **Incidents** page.

## IMPORTANT: deploy the Firestore rules

Keeping a `firestore.rules` file in the project does not change the rules running in Firebase. Publish them using either:

- Firebase Console → Firestore Database → Rules → paste the included `firestore.rules` → **Publish**, or
- Firebase CLI from the web project folder: `firebase deploy --only firestore:rules`

The `permission-denied / Missing or insufficient permissions` error will continue if the live Firebase project is still using older rules.

## Test

- Log in on Android as a guard assigned to a site.
- Log in on the web app as a user whose `users/{uid}.role` is `supervisor`, `Supervisor`, `admin`, or `Admin`.
- Keep the dashboard open.
- Submit a mobile report.
- Expected: Android shows success and the report appears on the dashboard without refreshing.

Firebase project used by both apps: `spot-f503e`.
