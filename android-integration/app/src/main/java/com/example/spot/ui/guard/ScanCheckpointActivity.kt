package com.example.spot.ui.guard

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.spot.service.PatrolLocationService
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScanCheckpointActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    private val guardAliases = linkedSetOf<String>()

    private var siteId: String = ""
    private var guardId: String = ""
    private var clientId: String = ""
    private var guardName: String = ""
    private var patrolLogId: String = ""

    private val patrolPrefs by lazy {
        getSharedPreferences("SPOT_PATROL", MODE_PRIVATE)
    }

    private data class PatrolScanResult(
        val completedCount: Int,
        val totalCount: Int,
        val patrolCompleted: Boolean
    )

    private val barcodeLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents == null) {
            Toast.makeText(this, "Scan cancelled", Toast.LENGTH_SHORT).show()
            finish()
        } else {
            resolveActivePatrolAndVerify(result.contents.trim())
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        siteId = intent.getStringExtra("SITE_ID") ?: ""
        guardId = intent.getStringExtra("GUARD_ID") ?: ""
        clientId = intent.getStringExtra("CLIENT_ID") ?: ""
        guardName = intent.getStringExtra("GUARD_NAME") ?: ""
        patrolLogId = intent.getStringExtra("PATROL_LOG_ID")
            ?.takeIf { it.isNotBlank() }
            ?: patrolPrefs.getString("ACTIVE_PATROL_LOG_ID", "")
            ?: ""

        if (siteId.isEmpty() || guardId.isEmpty()) {
            Toast.makeText(
                this,
                "Error: Guard or site information is missing.",
                Toast.LENGTH_LONG
            ).show()
            finish()
            return
        }

        loadGuardAliases {
            val options = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("Align the assigned checkpoint QR code within the frame")
                setCameraId(0)
                setBeepEnabled(true)
                setBarcodeImageEnabled(true)
                setOrientationLocked(false)
            }

            barcodeLauncher.launch(options)
        }
    }

    private fun loadGuardAliases(
        callback: () -> Unit
    ) {
        guardAliases.clear()

        guardId
            .takeIf { it.isNotBlank() }
            ?.let {
                guardAliases.add(
                    it.trim()
                )
            }

        auth.currentUser?.uid
            ?.takeIf { it.isNotBlank() }
            ?.let {
                guardAliases.add(
                    it.trim()
                )
            }

        val profileId =
            auth.currentUser?.uid
                ?.takeIf { it.isNotBlank() }
                ?: guardId

        if (profileId.isBlank()) {
            callback()
            return
        }

        db.collection("users")
            .document(profileId)
            .get()
            .addOnSuccessListener { doc ->
                doc.getString("guardId")
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?.let {
                        guardAliases.add(it)
                    }

                callback()
            }
            .addOnFailureListener {
                callback()
            }
    }

    // -------------------------------------------------------------------------
    // ACTIVE PATROL
    // -------------------------------------------------------------------------

    private fun resolveActivePatrolAndVerify(scannedValue: String) {
        if (patrolLogId.isNotBlank()) {
            verifyPatrolIsActive(scannedValue)
            return
        }

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        db.collection("patrol_logs")
            .whereEqualTo("guardId", guardId)
            .get()
            .addOnSuccessListener { snapshots ->
                val active = snapshots.documents
                    .filter { doc ->
                        doc.getString("siteId") == siteId &&
                            doc.getString("patrolDate") == today &&
                            doc.getString("status") == "IN_PROGRESS"
                    }
                    .maxByOrNull { doc ->
                        doc.getTimestamp("startedAt")?.seconds ?: 0L
                    }

                if (active == null) {
                    Toast.makeText(
                        this,
                        "No patrol is currently in progress. Tap Start Patrol first.",
                        Toast.LENGTH_LONG
                    ).show()
                    finish()
                    return@addOnSuccessListener
                }

                patrolLogId = active.id
                saveActivePatrol(active.id)
                verifyAndLogCheckpoint(scannedValue)
            }
            .addOnFailureListener { error ->
                Toast.makeText(
                    this,
                    "Unable to find the active patrol: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
                finish()
            }
    }

    private fun verifyPatrolIsActive(scannedValue: String) {
        db.collection("patrol_logs")
            .document(patrolLogId)
            .get()
            .addOnSuccessListener { patrol ->
                val isCorrectGuard = patrol.getString("guardId") == guardId
                val isCorrectSite = patrol.getString("siteId") == siteId
                val isInProgress = patrol.getString("status") == "IN_PROGRESS"

                if (!patrol.exists() || !isCorrectGuard || !isCorrectSite || !isInProgress) {
                    clearActivePatrol()
                    patrolLogId = ""
                    resolveActivePatrolAndVerify(scannedValue)
                    return@addOnSuccessListener
                }

                verifyAndLogCheckpoint(scannedValue)
            }
            .addOnFailureListener {
                patrolLogId = ""
                resolveActivePatrolAndVerify(scannedValue)
            }
    }

    // -------------------------------------------------------------------------
    // CHECKPOINT VERIFICATION
    // -------------------------------------------------------------------------

    private fun verifyAndLogCheckpoint(scannedValue: String) {
        findNewCheckpointByField(scannedValue, "qrCode") { checkpoint ->
            if (checkpoint != null) {
                validateNewCheckpoint(checkpoint, scannedValue)
            } else {
                findNewCheckpointByField(scannedValue, "qrPayload") { payloadCheckpoint ->
                    if (payloadCheckpoint != null) {
                        validateNewCheckpoint(payloadCheckpoint, scannedValue)
                    } else {
                        findNewCheckpointByDocumentId(scannedValue)
                    }
                }
            }
        }
    }

    private fun findNewCheckpointByField(
        scannedValue: String,
        field: String,
        callback: (DocumentSnapshot?) -> Unit
    ) {
        db.collection("checkpoints")
            .whereEqualTo(field, scannedValue)
            .limit(1)
            .get()
            .addOnSuccessListener { snapshots ->
                callback(snapshots.documents.firstOrNull())
            }
            .addOnFailureListener {
                callback(null)
            }
    }

    private fun findNewCheckpointByDocumentId(scannedValue: String) {
        db.collection("checkpoints")
            .document(scannedValue)
            .get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    validateNewCheckpoint(document, scannedValue)
                } else {
                    verifyLegacyCheckpoint(scannedValue)
                }
            }
            .addOnFailureListener {
                verifyLegacyCheckpoint(scannedValue)
            }
    }

    private fun validateNewCheckpoint(
        document: DocumentSnapshot,
        scannedValue: String
    ) {
        val checkpointSiteId = document.getString("siteId") ?: ""
        val status = document.getString("status")?.trim()?.lowercase(Locale.US) ?: "active"
        val assignedGuardIds = (document.get("assignedGuardIds") as? List<*>)
            ?.mapNotNull { it?.toString() }
            ?: emptyList()

        if (checkpointSiteId != siteId) {
            Toast.makeText(
                this,
                "This QR checkpoint belongs to another site.",
                Toast.LENGTH_LONG
            ).show()
            finish()
            return
        }

        if (status in setOf("inactive", "disabled", "revoked", "archived")) {
            Toast.makeText(
                this,
                "This QR checkpoint is not active.",
                Toast.LENGTH_LONG
            ).show()
            finish()
            return
        }

        val isAssigned =
            assignedGuardIds.any { assignedId ->
                guardAliases.any { alias ->
                    alias.equals(
                        assignedId,
                        ignoreCase = true
                    )
                }
            }

        if (!isAssigned) {
            Toast.makeText(
                this,
                "You are not assigned to this QR checkpoint.",
                Toast.LENGTH_LONG
            ).show()

            android.util.Log.d(
                "QR_ASSIGNMENT",
                "Rejected checkpoint=${document.id} assignedIds=$assignedGuardIds aliases=$guardAliases"
            )

            finish()
            return
        }

        val checkpointName = document.getString("name") ?: "Checkpoint"

        recordCheckpointInPatrol(
            checkpointId = document.id,
            checkpointName = checkpointName,
            scannedValue = scannedValue
        )
    }

    // Compatibility with the older mobile structure:
    // client_sites/{siteId}/locations/{locationId}
    private fun verifyLegacyCheckpoint(scannedValue: String) {
        db.collection("client_sites")
            .document(siteId)
            .collection("locations")
            .document(scannedValue)
            .get()
            .addOnSuccessListener { document ->
                if (!document.exists()) {
                    Toast.makeText(
                        this,
                        "Invalid QR checkpoint for this site.",
                        Toast.LENGTH_LONG
                    ).show()
                    finish()
                    return@addOnSuccessListener
                }

                val checkpointName = document.getString("name") ?: "Checkpoint"

                recordCheckpointInPatrol(
                    checkpointId = document.id,
                    checkpointName = checkpointName,
                    scannedValue = scannedValue
                )
            }
            .addOnFailureListener { error ->
                Toast.makeText(
                    this,
                    "Checkpoint verification failed: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
                finish()
            }
    }

    // -------------------------------------------------------------------------
    // UPDATE THE SAME patrol_logs DOCUMENT AFTER EVERY QR SCAN
    // -------------------------------------------------------------------------

    private fun recordCheckpointInPatrol(
        checkpointId: String,
        checkpointName: String,
        scannedValue: String
    ) {
        if (patrolLogId.isBlank()) {
            Toast.makeText(this, "No active patrol found.", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val patrolRef = db.collection("patrol_logs").document(patrolLogId)
        val localScanTime = Timestamp.now()

        db.runTransaction { transaction ->
            val patrol = transaction.get(patrolRef)

            if (!patrol.exists()) {
                throw IllegalStateException("PATROL_NOT_FOUND")
            }

            if (patrol.getString("guardId") != guardId) {
                throw IllegalStateException("WRONG_GUARD")
            }

            if (patrol.getString("siteId") != siteId) {
                throw IllegalStateException("WRONG_SITE")
            }

            if (patrol.getString("status") != "IN_PROGRESS") {
                throw IllegalStateException("PATROL_NOT_ACTIVE")
            }

            val requiredCheckpointIds = (patrol.get("requiredCheckpointIds") as? List<*>)
                ?.mapNotNull { it?.toString() }
                ?: emptyList()

            if (!requiredCheckpointIds.contains(checkpointId)) {
                throw IllegalStateException("CHECKPOINT_NOT_REQUIRED")
            }

            val completedCheckpointIds = (patrol.get("completedCheckpointIds") as? List<*>)
                ?.mapNotNull { it?.toString() }
                ?.toMutableList()
                ?: mutableListOf()

            if (completedCheckpointIds.contains(checkpointId)) {
                throw IllegalStateException("CHECKPOINT_ALREADY_SCANNED")
            }

            completedCheckpointIds.add(checkpointId)

            val checkpointScans = (patrol.get("checkpointScans") as? List<*>)
                ?.toMutableList()
                ?: mutableListOf()

            val scanEntry = hashMapOf<String, Any>(
                "checkpointId" to checkpointId,
                "checkpointName" to checkpointName,
                "scannedAt" to localScanTime,
                "qrValue" to scannedValue
            )

            checkpointScans.add(scanEntry)

            val totalCheckpoints = patrol.getLong("totalCheckpoints")
                ?.toInt()
                ?.takeIf { it > 0 }
                ?: requiredCheckpointIds.size

            val completedCount = completedCheckpointIds.size
            val patrolCompleted = totalCheckpoints > 0 && completedCount >= totalCheckpoints

            val updates = hashMapOf<String, Any>(
                "completedCheckpointIds" to completedCheckpointIds,
                "completedCheckpoints" to completedCount,
                "checkpointScans" to checkpointScans,
                "updatedAt" to FieldValue.serverTimestamp()
            )

            if (patrol.get("firstCheckpointScannedAt") == null) {
                updates["firstCheckpointScannedAt"] = FieldValue.serverTimestamp()
            }

            if (patrolCompleted) {
                val startedAt = patrol.getTimestamp("startedAt")
                val durationSeconds = if (startedAt != null) {
                    (localScanTime.seconds - startedAt.seconds).coerceAtLeast(0L)
                } else {
                    0L
                }

                updates["status"] = "COMPLETED"
                updates["completedAt"] = FieldValue.serverTimestamp()
                updates["durationSeconds"] = durationSeconds
                updates["emailStatus"] = "pending"
            }

            transaction.update(patrolRef, updates)

            PatrolScanResult(
                completedCount = completedCount,
                totalCount = totalCheckpoints,
                patrolCompleted = patrolCompleted
            )
        }
            .addOnSuccessListener { result ->
                saveCheckpointAuditLog(
                    checkpointId = checkpointId,
                    checkpointName = checkpointName,
                    scannedValue = scannedValue
                )

                if (result.patrolCompleted) {
                    PatrolLocationService.stop(
                        this
                    )

                    clearActivePatrol()

                    Toast.makeText(
                        this,
                        "Patrol completed! ${result.completedCount} of ${result.totalCount} checkpoints scanned.",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    Toast.makeText(
                        this,
                        "Checkpoint recorded: $checkpointName (${result.completedCount}/${result.totalCount})",
                        Toast.LENGTH_LONG
                    ).show()
                }

                setResult(RESULT_OK)
                finish()
            }
            .addOnFailureListener { error ->
                val message = when (error.message) {
                    "CHECKPOINT_ALREADY_SCANNED" ->
                        "You already scanned this checkpoint during the current patrol."

                    "CHECKPOINT_NOT_REQUIRED" ->
                        "This checkpoint is not part of your current patrol."

                    "PATROL_NOT_ACTIVE" ->
                        "This patrol is no longer in progress."

                    "WRONG_GUARD" ->
                        "This patrol belongs to another guard."

                    "WRONG_SITE" ->
                        "This patrol belongs to another site."

                    "PATROL_NOT_FOUND" ->
                        "The active patrol record could not be found."

                    else ->
                        "Unable to record checkpoint: ${error.localizedMessage}"
                }

                Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                finish()
            }
    }

    // Keeps the old checkpoint_logs history while patrol_logs becomes the
    // authoritative patrol record.
    private fun saveCheckpointAuditLog(
        checkpointId: String,
        checkpointName: String,
        scannedValue: String
    ) {
        val now = Date()
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now)
        val timeNow = SimpleDateFormat("hh:mm a", Locale.US).format(now)

        val logData = hashMapOf<String, Any>(
            "patrolLogId" to patrolLogId,
            "siteId" to siteId,
            "clientId" to clientId,
            "guardId" to guardId,
            "guardName" to guardName,
            "locationId" to checkpointId,
            "locationName" to checkpointName,
            "qrValue" to scannedValue,
            "timestamp" to FieldValue.serverTimestamp(),
            "deviceTimestamp" to Timestamp.now(),
            "date" to today,
            "time" to timeNow
        )

        db.collection("checkpoint_logs").add(logData)
    }

    private fun saveActivePatrol(id: String) {
        patrolPrefs.edit()
            .putString("ACTIVE_PATROL_LOG_ID", id)
            .putString("ACTIVE_PATROL_GUARD_ID", guardId)
            .putString("ACTIVE_PATROL_SITE_ID", siteId)
            .apply()
    }

    private fun clearActivePatrol() {
        patrolPrefs.edit()
            .remove("ACTIVE_PATROL_LOG_ID")
            .remove("ACTIVE_PATROL_GUARD_ID")
            .remove("ACTIVE_PATROL_SITE_ID")
            .apply()
    }
}
