# S.P.O.T Mobile UI — Web Console Visual Match

This version keeps the QR/guard-assignment integration and refreshes the Android UI to visually match the S.P.O.T supervisor web console.

## Design system

- App background: `#0F172A`
- Cards / panels: `#1E293B`
- Deep surfaces: `#111827`
- Borders: `#334155`
- Primary blue: `#2563EB`
- Success green: `#22C55E`
- Warning amber: `#F59E0B`
- Error red: `#EF4444`
- Main text: `#F8FAFC`
- Secondary text: `#94A3B8`
- Cards use 14–16dp rounded corners with thin slate borders.
- Buttons use 10dp rounded corners and web-style primary / secondary / danger treatments.

## Screens refreshed

- Splash screen
- Login screen
- Supervisor dashboard
- Guard dashboard
- Site Control Center
- QR Checkpoint Management
- Add Client Site
- Assign Shift
- Guard Schedule
- Reports and report details
- Create Incident Report
- Checkpoint History
- Face / liveness verification overlay
- Site, guard, checkpoint, patrol, report, and checkpoint-log list cards

## Existing behavior preserved

- Firebase project/data flow
- Guard authentication and Face ID/liveness flow
- Supervisor site management
- QR checkpoint generation
- Guard-specific QR authorization
- Roving schedule data
- Offline QR assignment cache
- Incident reporting
- Patrol scheduling and checkpoint logs

## Small compatibility fix retained

The Supervisor Dashboard now displays the existing `btnViewSiteReports` action as an **All Reports** button. The Kotlin activity already contained the click handler, but the original dashboard XML did not have a matching view.

## Notes

The project uses the existing `Theme.SPOT` Material 3 theme. The launch SplashActivity was changed to use the same theme so the status/navigation bars match the dark web-inspired design from the first frame.
