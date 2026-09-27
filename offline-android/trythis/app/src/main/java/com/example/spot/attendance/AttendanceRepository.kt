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
