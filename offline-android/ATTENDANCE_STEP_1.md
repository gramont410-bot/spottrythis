# Attendance — step 1: Time In and Time Out

These edits are already applied to the project in `offline-android/trythis` in this workspace. If you use a different Android Studio project, copy the changes below into that project. No full-project download is needed. Use the files under `com.example.spot.ui.auth`, not the older similarly named classes under `com.example.spot.auth`.

This step records Time In after face verification and confirms Time Out before logout. Repeated login reuses an open attendance record, including a shift started on the preceding date. The original site remains on that record. Multiple old open records without an active pointer require supervisor correction rather than silently choosing one.

Attendance confirmation requires internet for this step. Existing offline patrol actions are separate. Printable supervisor reports will be the next step.

## 1. Add AttendanceRepository.kt

Create package `com.example.spot.attendance` inside your app's Java/Kotlin source directory. Create `AttendanceRepository.kt` and paste:

```kotlin
package com.example.spot.attendance

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Online attendance, called only after successful face verification. */
class AttendanceRepository {
    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    private fun checkIdentity(verifiedUid: String) {
        check(verifiedUid.isNotBlank() && auth.currentUser?.uid == verifiedUid) {
            "The verified face must belong to the signed-in guard. Sign in again."
        }
    }

    private fun isOpen(doc: DocumentSnapshot): Boolean = doc.exists() &&
        doc.getString("status") == "ON_DUTY" &&
        doc.get("timeOutAt") == null && doc.getString("timeOut").isNullOrBlank()

    /** Recover an old open shift even if local preferences were lost. */
    private fun legacyOpenIds(uid: String): Task<List<String>> =
        db.collection("attendance").whereEqualTo("guardId", uid).get(Source.SERVER)
            .continueWith { task ->
                task.result.documents.filter { isOpen(it) }.map { it.id }
            }

    fun timeIn(verifiedUid: String): Task<String> {
        try { checkIdentity(verifiedUid) } catch (error: Exception) { return Tasks.forException(error) }
        val userRef = db.collection("users").document(verifiedUid)
        // Stable for all transaction retries. Never read a not-yet-created attendance document.
        val newRef = db.collection("attendance").document()
        return legacyOpenIds(verifiedUid).onSuccessTask { legacyIds ->
            db.runTransaction { transaction ->
                checkIdentity(verifiedUid)
                val user = transaction.get(userRef)
                check(user.exists() && user.getString("role")?.trim()?.lowercase(Locale.US) == "guard") {
                    "A guard profile is required to record attendance."
                }
                check(user.getBoolean("active") != false) { "This guard account is inactive." }
                val pointer = user.getString("activeAttendanceId").orEmpty()
                val candidates = if (pointer.isNotBlank()) listOf(pointer) else legacyIds
                val shifts = candidates.distinct().map { id ->
                    transaction.get(db.collection("attendance").document(id))
                }
                if (pointer.isNotBlank()) {
                    check(shifts.single().exists()) { "Your active attendance record is missing. Ask your supervisor to review it." }
                }
                shifts.forEach { check(it.getString("guardId") == verifiedUid) { "Attendance owner does not match your account." } }
                val open = shifts.filter { isOpen(it) }
                check(open.size <= 1) { "Multiple open attendance records were found. Ask your supervisor to correct them before logging in." }
                if (open.isNotEmpty()) {
                    val existing = open.single()
                    if (pointer != existing.id) transaction.update(userRef, "activeAttendanceId", existing.id)
                    return@runTransaction existing.id
                }

                val siteId = (user.getString("assignedSiteId") ?: user.getString("siteId")).orEmpty().trim()
                check(siteId.isNotBlank()) { "Your account needs an assigned site before Time In can be recorded." }
                val name = user.getString("fullName") ?: user.getString("name") ?:
                    listOfNotNull(user.getString("firstName"), user.getString("lastName")).joinToString(" ")
                val now = Date()
                val data = mapOf(
                    "guardId" to verifiedUid,
                    "guardName" to name.ifBlank { "Guard" },
                    "siteId" to siteId,
                    "siteName" to user.getString("siteName").orEmpty(),
                    "clientId" to user.getString("clientId").orEmpty(),
                    "date" to SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now),
                    // Legacy display strings remain for the existing attendance screens.
                    // New reports should format the canonical server timeInAt/timeOutAt fields.
                    "timeIn" to SimpleDateFormat("hh:mm a", Locale.US).format(now),
                    "timeOut" to "",
                    "timeZone" to TimeZone.getDefault().id,
                    "timeInAt" to FieldValue.serverTimestamp(),
                    "timeOutAt" to null,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "status" to "ON_DUTY",
                    "loginFaceVerified" to true,
                    "logoutFaceVerified" to false,
                    "source" to "android_guard_app",
                    "attendanceVersion" to 2
                )
                transaction.set(newRef, data)
                transaction.update(userRef, "activeAttendanceId", newRef.id)
                newRef.id
            }
        }
    }

    fun timeOut(verifiedUid: String, savedShiftId: String): Task<String> {
        try { checkIdentity(verifiedUid) } catch (error: Exception) { return Tasks.forException(error) }
        val userRef = db.collection("users").document(verifiedUid)
        return legacyOpenIds(verifiedUid).onSuccessTask { legacyIds ->
            db.runTransaction { transaction ->
                checkIdentity(verifiedUid)
                val user = transaction.get(userRef)
                check(user.exists()) { "Your guard profile could not be found." }
                val pointer = user.getString("activeAttendanceId").orEmpty()
                val id = when {
                    pointer.isNotBlank() -> pointer
                    legacyIds.size == 1 -> legacyIds.single()
                    legacyIds.size > 1 -> error("Multiple open attendance records were found. Ask your supervisor to review them.")
                    savedShiftId.isNotBlank() -> savedShiftId
                    else -> error("No open attendance record was found. Ask your supervisor to review your Time In.")
                }
                check(savedShiftId.isBlank() || savedShiftId == id) {
                    "Your attendance session changed. Ask your supervisor to review it before logging out."
                }
                val ref = db.collection("attendance").document(id)
                val shift = transaction.get(ref)
                check(shift.exists() && shift.getString("guardId") == verifiedUid) { "Your attendance record could not be verified." }
                if (shift.getString("status") == "SHIFT_ENDED" &&
                    (shift.get("timeOutAt") != null || !shift.getString("timeOut").isNullOrBlank())) {
                    // A previous attempt may have committed before its acknowledgement was lost.
                    if (pointer == id) transaction.update(userRef, "activeAttendanceId", "")
                    return@runTransaction id
                }
                check(isOpen(shift)) { "This attendance record is not open. Ask your supervisor to review it." }
                transaction.update(ref, mapOf(
                    "timeOut" to SimpleDateFormat("hh:mm a", Locale.US).format(Date()),
                    "timeOutAt" to FieldValue.serverTimestamp(),
                    "status" to "SHIFT_ENDED",
                    "logoutFaceVerified" to true,
                    "updatedAt" to FieldValue.serverTimestamp()
                ))
                transaction.update(userRef, "activeAttendanceId", "")
                id
            }
        }
    }
}
```

## 2. Edit ui/auth/FaceVerifyActivity.kt

Add these imports:

```kotlin
import androidx.appcompat.app.AlertDialog
import com.example.spot.attendance.AttendanceRepository
```

Remove `import com.google.firebase.firestore.FieldValue` if it is now unused.

Inside `onCreate`, replace the block that calls `fetchAllGuardsAndStartCamera()` when the user ID is empty with:

```kotlin
        if (verificationRole == "guard" &&
            (auth.currentUser == null || auth.currentUser?.uid != verificationUserId)) {
            returnToLogin("Sign in to the guard account before verifying attendance.")
            return
        }
```

Replace the existing `saveUserSession`, `recordTimeIn`, and `recordTimeOut` methods with the following block. This also adds `showAttendanceFailure`. Keep the existing `clearSessionAndExit` method below it.

```kotlin
    private fun saveUserSession(
        userId: String,
        role: String,
        name: String,
        siteId: String,
        shiftId: String,
        siteName: String,
        clientId: String
    ) {
        val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

        sharedPref.edit().apply {
            putString("USER_ID", userId)
            putString("USER_ROLE", role)
            putString("USER_NAME", name)
            putString("SITE_ID", siteId)
            putString("SITE_NAME", siteName)
            putString("CLIENT_ID", clientId)
            putString("SESSION_DATE", today)
            if (shiftId.isNotBlank()) {
                putString("CURRENT_SHIFT_ID", shiftId)
            } else if (sharedPref.getString("USER_ID", "") != userId) {
                remove("CURRENT_SHIFT_ID")
            }
            putBoolean("IS_LOGGED_IN", true)
            apply()
        }
    }

    private fun recordTimeIn(
        guardId: String,
        guardName: String,
        siteId: String,
        siteName: String,
        clientId: String,
        callback: (String) -> Unit
    ) {
        tvInstructions.text = "Saving Time In..."
        AttendanceRepository().timeIn(guardId)
            .addOnSuccessListener { shiftId -> callback(shiftId) }
            .addOnFailureListener { error ->
                showAttendanceFailure("Time In", error) {
                    recordTimeIn(guardId, guardName, siteId, siteName, clientId, callback)
                }
            }
    }

    private fun recordTimeOut(shiftId: String) {
        tvInstructions.text = "Saving Time Out..."
        AttendanceRepository().timeOut(verificationUserId, shiftId)
            .addOnSuccessListener { clearSessionAndExit() }
            .addOnFailureListener { error ->
                showAttendanceFailure("Time Out", error) { recordTimeOut(shiftId) }
            }
    }

    private fun showAttendanceFailure(action: String, error: Exception, retry: () -> Unit) {
        android.util.Log.e("ATTENDANCE", "$action failed", error)
        if (isFinishing || isDestroyed) return
        tvInstructions.text = "$action not confirmed"
        val reason = generateSequence<Throwable>(error) { it.cause }.last().localizedMessage
            ?: "Check your internet connection and try again."
        val guidance = if (action == "Time Out") {
            "You are still logged in. Retry to confirm Time Out before logout."
        } else {
            "Your face was verified, but attendance must be confirmed before opening the dashboard."
        }
        AlertDialog.Builder(this)
            .setTitle("Could not confirm $action")
            .setMessage("$reason\n\n$guidance")
            .setCancelable(false)
            .setPositiveButton("Retry") { _, _ -> retry() }
            .setNegativeButton(if (action == "Time Out") "Stay on Duty" else "Back to Login") { _, _ -> finish() }
            .show()
    }
```

## 3. Replace ui/auth/QuickFaceLoginActivity.kt

Replace this file's complete content with the following. Quick login will use the signed-in guard's own registered face through the same FaceVerifyActivity attendance flow.

```kotlin
package com.example.spot.ui.auth

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth

/** Reuse the account-specific face verification and attendance flow. */
class QuickFaceLoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            Toast.makeText(this, "Sign in with your Login ID and password first.", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        startActivity(Intent(this, FaceVerifyActivity::class.java).apply {
            putExtra("USER_ID", uid)
            putExtra("USER_ROLE", "guard")
            putExtra("GUARD_NAME", intent.getStringExtra("GUARD_NAME").orEmpty())
            putExtra("ASSIGNED_SITE_ID", intent.getStringExtra("ASSIGNED_SITE_ID").orEmpty())
            putExtra("CLIENT_ID", intent.getStringExtra("CLIENT_ID").orEmpty())
        })
        finish()
    }
}
```

## Firestore

The rules you previously supplied permit these transactions: a guard can read/update their own user document and create/read/update their own attendance documents. No rules change is required for this step **if those are the rules currently published in your Firebase project**. The rules were checked in local Firebase emulators; no production rules or attendance data were changed.

New fields are created automatically: `users/{uid}.activeAttendanceId` and attendance `timeInAt`, `timeOutAt`, `timeZone`, verification flags, and `attendanceVersion`. Do not create these manually. Server timestamps are the canonical times for the upcoming printed report. Existing date/time display strings remain for compatibility. Older rows without timestamps are not retroactively converted.

## Verify on your phone

1. Build and run your updated project. Use a guard assigned to a site and an internet connection.
2. Sign in and pass face verification. In Firestore, check that one attendance row has the guard's UID, assigned site, `status: ON_DUTY`, and `timeInAt`.
3. Reopen the app, and if asked to log in again, verify that the existing open attendance row is reused and its Time In is unchanged.
4. Log out and pass face verification. Confirm that the same row now has `timeOutAt`, `status: SHIFT_ENDED`, and that the app returns to login.
5. Log in for the next shift: a new row should be created.
6. If attendance cannot be confirmed, the app should show Retry. A failed Time Out must leave you logged in; it must not claim logout succeeded.

Validation completed locally: Android debug build, all 15 existing unit tests, and Firebase emulator permission/transaction checks for concurrent opening, rejected-write rollback, server timestamps, and closing a previous-date shift. Physical face login/logout and your deployed Firebase configuration still need the phone check above.
