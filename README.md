# S.P.O.T. Web Command Center

S.P.O.T. means **Security Patrol Operations & Tracking**. It is the web command center for an agency that manages client companies, deployment sites, guards, patrol routes, schedules, QR checkpoints, incidents, telemetry, reports, and audit history.

The web application uses Firebase Authentication, Cloud Firestore, Cloud Storage, Firebase Functions, Leaflet maps, and real-time Firestore listeners.

## Quick Start

```bash
npm install
copy .env.example .env
npm run dev
```

For macOS/Linux, use `cp .env.example .env` instead of `copy`.

Build and preview:

```bash
npm run build
npm run preview
```

The `dev` and `build` scripts use the project-local Vite binary. If the shell says `vite` is not recognized, run `npm install` from the project root; do not install Vite globally.

## Business Model

S.P.O.T. has four roles. The agency owns the platform and manages client organizations. Clients own their facilities and receive guard visibility. Guards use the field/mobile app to report their work.

```text
SuperAdmin / Agency
  -> creates Admin/Client accounts
  -> creates facilities, assigns guards, manages platform access

Admin / Client company
  -> sees assigned facilities and guards
  -> creates schedules and operates its assigned sites
  -> receives live operational events for its sites

Guard / Field worker
  -> uses the mobile app
  -> sends location, battery, steps, patrol, attendance, incident, and QR events

Client portal
  -> limited view of assigned facilities, assigned guards, schedules, patrols, and alerts
```

## Role Capabilities

### SuperAdmin: Agency Command

The SuperAdmin is the agency/platform owner.

- View the whole organization and all operational data.
- Create SuperAdmin, Admin, and Client accounts.
- Set or reset a Client temporary password.
- Create and manage client organizations and contract dates.
- Create deployment sites and assign them to an existing client.
- Upload site cover images or use the site fallback image.
- Create, print, filter, and manage QR checkpoints.
- Register, edit, assign, and reassign devices to guards.
- Manage guards, face enrollment, routes, incidents, and overall schedules.
- View all client, guard, site, patrol, telemetry, report, and audit data.
- Export live operational reports as CSV or print/save them as PDF.
- Filter audit records by user, category, text, and date, then print the result.
- Archive expired clients and their related sites, QR records, and user access through the scheduled backend job.

### Admin: Client Operations

The Admin role represents a client organization managed by the agency.

- View and operate assigned facilities and guards.
- Create QR checkpoints for assigned sites.
- Create guard schedules for the client organization.
- View patrol operations, incidents, analytics, reports, devices, and live monitoring within the permitted scope.
- Assign and reassign available devices to guards, subject to Firestore rules.
- View assigned guard telemetry, including coordinates, battery, signal, steps, distance, and last update.
- Review client-scoped notifications and patrol activity.

Admin limitations:

- Cannot create SuperAdmins or change platform roles.
- Cannot manage unrelated client organizations.
- Cannot access SuperAdmin settings or the full agency audit log.
- Cannot permanently delete historical audit records.

### Client Portal: Limited Client View

The Client portal is a separate restricted interface at `/client`.

- View assigned facilities.
- View assigned guards and their current status.
- View live patrol coverage and recent client incidents.
- View client-scoped schedules.
- Receive client-scoped live alerts.
- Receive a contract-expiry warning during the final 14 days.

The Client portal does not expose agency-wide users, unrelated sites, SuperAdmin settings, or the full audit trail.

### Guard: Field Identity

Guard accounts are intended for the field/mobile application.

- Authenticate with Firebase Auth.
- Read their own permitted profile and face enrollment data.
- Send patrol logs, QR scans, location updates, attendance, incidents, battery, device, step, and distance telemetry.
- Use assigned device and assigned site information.

Guard access is limited by the Firestore rules and should not be treated as a web command-center role.

## Feature Map

### Command

#### Dashboard

- Live guard map using current Firestore coordinates.
- Status-filtered markers for all guards, guards on patrol, and emergency guards.
- GPS accuracy rings and live map recentering.
- Live Operations Stream with a fixed responsive viewport and internal scrolling.
- Real-time incident and checkpoint scan activity.
- Derived metrics from live patrols, attendance, devices, checkpoint logs, incidents, and GPS data.

#### Live Monitoring

- Guard selector and live Leaflet map.
- Current coordinates, GPS accuracy, signal, battery, face verification, shift, steps, distance, and last location update.
- Patrol timeline and checkpoint progression.
- Emergency dispatch action and guard detail drawer.

### Field Operations

#### Patrol Operations

- Search patrols by guard, site, or route.
- Progress, completed checkpoints, remaining checkpoints, ETA, status, and route history.
- Checkpoint verification stream.

#### Schedules

- Firestore-backed schedule records.
- Admin creates client-owned guard schedules.
- SuperAdmin can view the overall schedule.
- Schedule data includes guard, site, shift, date, status, and client ownership.

#### Incidents

- Live incident feed from guards and operations staff.
- Site, client, reporter, priority, evidence, status, description, and response details.
- Incident records are included in live alerts and reports.

### People & Access

#### Guards

- Guard CRUD and assignment data.
- Client/site/shift/status/device information.
- Battery, GPS, performance, attendance, face state, steps, distance, and signal telemetry.

#### Face Enrollment

- Camera capture with mirrored preview for the operator.
- Animated face scan frame and detection progress.
- Automatic capture after multiple confirmed face-detection frames where browser detection is supported.
- Brightness validation and retake flow.
- Browser FaceDetector support, local fallback comparison, and optional Azure verification.
- Stores face profile, enrollment state, face metadata, and attendance record.

#### Devices

- Real devices are supplied by the mobile app through the `devices` collection.
- Displays device ID, model, OS, last active time, connection state, and assigned guard.
- Supports one device per guard through the guard `deviceId` field.
- Allows a device to be unassigned and reassigned later.

### Sites & Clients

#### Deployment Sites

- Site name, client owner, type, address, status, map coordinates, guards, incidents, and routes.
- Address geocoding and map pin adjustment.
- Cover image upload through Firebase Storage.
- Fallback image when no image is uploaded.
- Checkpoint count is derived from actual checkpoint documents.
- Site cards and detail views show related guards and facility telemetry.

#### QR Checkpoints

- Unique `SPOT-CP-*` QR value per physical checkpoint.
- QR is linked to a site and client.
- QR can be displayed, printed, filtered by site, and scanned by the mobile app.
- Each checkpoint record carries `qrCode`, `scanValue`, `qrVersion`, and `syncStatus`.

#### Clients

- Client company, contact, email, phone, contract dates, status, notes, site count, and guard count.
- New Client onboarding creates both a client organization record and a Firebase Auth login.
- Existing client records without a linked login can be repaired by setting a temporary password.
- SuperAdmin password changes use the secure `setManagedPassword` function.

### Intelligence

#### Analytics

- Operational summaries based on current Firestore data.
- Patrol completion, incidents, attendance, face verification, QR completion, device synchronization, and GPS metrics.

#### Reports

- Live Patrol Summary.
- Checkpoint Scan Report.
- Incident Report.
- Guard Audit Trail.
- CSV download with real current records.
- Print or browser “Save as PDF” output.
- SuperAdmin reports cover agency data; client-scoped reports should contain only permitted data.

### Administration

#### Audit Logs

Audit events are written for CRUD operations and field behavior.

- Filter by search text, actor/user, category, and date.
- Patrol Behavior category for field events.
- Print the filtered report.
- Records are append-oriented and should not be deleted by regular users.

Captured behavior includes:

- Account and data CRUD operations.
- QR checkpoint scans.
- Guard location updates.
- Patrol creation and progression.
- Device assignment changes.
- Face enrollment and attendance events.

#### Settings and Profile

- Profile identity and contact information.
- Password change for the currently signed-in user.
- SuperAdmin system settings and account provisioning.
- Platform role changes are not self-service.

## Real-Time Data Flow

The web command center subscribes to Firestore collections using `onSnapshot`. When the field app writes an event, the website receives it without a page refresh.

```text
Mobile app
  -> users / devices / guardLocations
  -> patrolLogs / patrol_schedules
  -> checkpoint_logs / attendance / incidents
  -> Firestore real-time listeners
  -> SpotContext normalization
  -> Dashboard, Client portal, Monitoring, Reports, Alerts, Audit UI
```

The main shared state is managed in `src/context/SpotContext.jsx`. Authentication, profile, role, Firebase claims, and account operations are managed in `src/context/AuthContext.jsx`.

## QR Checkpoint App Sync Contract

The web generator stores a unique QR value such as `SPOT-CP-ABC123`. The mobile app should decode the value, find the matching `checkpoints` document by `qrCode` or `scanValue`, then write a `checkpoint_logs` document:

```txt
guardId       (string)
guardName     (string)
checkpointId  (string)   // checkpoints document ID
checkpointName(string)
siteId        (string)
clientId      (string)
verified      (boolean)
timestamp     (timestamp)
latitude      (number, optional)
longitude     (number, optional)
```

The website turns the scan into live activity, notifications, patrol progress, reports, and audit events.

## Telemetry Contract

Guard profiles and location records may provide:

```txt
gpsLat / lat                  (number)
gpsLng / lng                  (number)
gpsAccuracy / accuracy        (string or number)
networkSignal / signalStrength(string)
battery                       (number)
stepCount / steps             (number)
distanceWalkedMeters          (number)
lastLocationUpdate            (timestamp or ISO string)
deviceId                      (string)
status                        (string)
```

The latest `guardLocations` record is merged into the live guard state. Missing telemetry is displayed as unavailable rather than treated as a confirmed real-world value.

## Contract Lifecycle

Client contracts have `contractStart` and `contractEnd` values.

- During the final 14 days, the Client portal displays a warning once per day.
- A scheduled Firebase Function runs every 24 hours.
- Expired clients are archived, not permanently deleted.
- Related client user access is archived/disabled.
- Related sites are archived.
- Related QR checkpoints are marked archived.
- Audit history is preserved.
- Guards and devices become available for reassignment through the normal operations workflow.

## Firebase Setup

1. Create a Firebase project.
2. Register a Web app and copy its config values into `.env`.
3. Enable Email/Password in Firebase Authentication.
4. Create the first SuperAdmin Auth user.
5. Create a Firestore database in production mode.
6. Add a matching `users/{uid}` profile:

```txt
name     (string)  = "Your Name"
role     (string)  = "superadmin"
email    (string)  = "admin@spot.local"
active   (boolean) = true
```

7. Enable Storage for site images, face profiles, and incident evidence.
8. Publish `firestore.rules`.
9. Install and deploy Functions:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

Important Functions include:

- `createManagedAccount`
- `setManagedPassword`
- `verifyFaceMatch`
- `auditCheckpointScan`
- `auditGuardLocation`
- `auditPatrolRecord`
- `archiveExpiredClients`

## Firestore Collections

| Collection | Purpose |
| --- | --- |
| `users` | SuperAdmins, Admins, Clients, Guards, profile and telemetry fields |
| `clients` | Client organizations, contract dates, login linkage, status |
| `sites` | Deployment facilities and client ownership |
| `client_sites` | Mobile/client site records merged into the web view |
| `checkpoints` | Physical QR checkpoints and synchronization metadata |
| `checkpoint_logs` | Field QR scan events |
| `routes` | Ordered patrol routes |
| `schedules` | Client-owned guard shift assignments |
| `patrolLogs` | Patrol activity and progression |
| `patrol_schedules` | Mobile patrol schedule records |
| `guardLocations` | Real-time guard coordinate records |
| `locationHistory` | Historical coordinate records |
| `devices` | Mobile devices registered by the field app |
| `faceProfiles` | Enrolled face metadata and images |
| `attendance` | Attendance, face enrollment, and login events |
| `incidents` | Incident reports and response state |
| `adminLogs` | Append-oriented CRUD, patrol, scan, location, and security audit events |
| `reports` | Optional persisted report records |

## Project Structure

```txt
src/
  App.jsx
  index.css
  context/
    AuthContext.jsx
    SpotContext.jsx
  components/
    Layout.jsx
    Sidebar.jsx
    ToastContainer.jsx
    ...
  lib/
    firebase.js
    dataSource.js
    faceApi.js
    faceRecognition.js
  pages/
    Dashboard.jsx
    ClientPortal.jsx
    Guards.jsx
    GuardTracking.jsx
    Routes.jsx
    Schedules.jsx
    Sites.jsx
    Checkpoints.jsx
    Clients.jsx
    Devices.jsx
    FaceVerify.jsx
    Incidents.jsx
    Analytics.jsx
    Reports.jsx
    AdminLogs.jsx
    Settings.jsx
firestore.rules
functions/index.js
.env.example
```

## Validation

```bash
npm run build
node --check functions/index.js
```

The production build may report a Vite bundle-size warning. That warning does not mean Vite is missing or that the app failed to compile.
#   s p o t t r y t h i s  
 #   s p o t t r y t h i s  
 