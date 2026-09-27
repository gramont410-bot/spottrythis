package com.example.spot.ui.guard

import com.example.spot.offline.OfflinePatrol
import com.example.spot.offline.OfflineStore
import android.Manifest
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.location.Location
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.spot.service.PatrolLocationService
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScanCheckpointActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    private val guardAliases = linkedSetOf<String>()

    private lateinit var fusedLocationClient:
            FusedLocationProviderClient

    private var pendingLocationCheckpoint:
            DocumentSnapshot? = null

    private var pendingLocationScannedValue:
            String = ""

    private var pendingLocationIsLegacy:
            Boolean = false

    private var siteId = ""
    private var guardId = ""
    private var guardName = ""
    private var patrolLogId = ""
    private var clientId = ""

    private val patrolPrefs by lazy {
        getSharedPreferences("SPOT_PATROL", MODE_PRIVATE)
    }

    private data class CheckpointLocationVerification(
        val scanLatitude: Double,
        val scanLongitude: Double,
        val scanAccuracyMeters: Double,
        val checkpointLatitude: Double,
        val checkpointLongitude: Double,
        val distanceMeters: Double,
        val allowedRadiusMeters: Double
    )

    private data class PatrolScanResult(
        val completedCount: Int,
        val totalCount: Int,
        val patrolCompleted: Boolean,
        val locationVerification: CheckpointLocationVerification
    )

    private val barcodeLauncher =
        registerForActivityResult(ScanContract()) { result ->
            val scannedValue = result.contents?.trim()

            when {
                scannedValue == null -> {
                    showMessageAndFinish("Scan cancelled.")
                }

                scannedValue.isBlank() -> {
                    showMessageAndFinish("The scanned QR code is empty.")
                }

                else -> {
                    resolveActivePatrolAndVerify(scannedValue)
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestedOrientation =
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

        fusedLocationClient =
            LocationServices.getFusedLocationProviderClient(this)

        siteId = intent.getStringExtra("SITE_ID")
            ?.trim()
            .orEmpty()

        guardId = intent.getStringExtra("GUARD_ID")
            ?.trim()
            .orEmpty()

        guardName = intent.getStringExtra("GUARD_NAME")
            .orEmpty()

        clientId = intent.getStringExtra("CLIENT_ID")
            ?.trim()
            .orEmpty()

        patrolLogId = intent.getStringExtra("PATROL_LOG_ID")
            ?.takeIf { it.isNotBlank() }
            ?: patrolPrefs.getString("ACTIVE_PATROL_LOG_ID", "")
                .orEmpty()

        if (auth.currentUser == null) {
            showMessageAndFinish(
                "Your session has expired. Please sign in again."
            )
            return
        }

        if (siteId.isBlank() || guardId.isBlank()) {
            showMessageAndFinish(
                "Guard or site information is missing. " +
                        "Return to the dashboard and try again."
            )
            return
        }

        loadGuardAliases {
            if (!isFinishing && !isDestroyed) {
                val options = ScanOptions().apply {
                    setCaptureActivity(
                        PortraitCaptureActivity::class.java
                    )
                    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    setPrompt("Scan the checkpoint QR code")
                    setCameraId(0)
                    setBeepEnabled(true)
                    setBarcodeImageEnabled(true)
                    setOrientationLocked(false)
                }

                barcodeLauncher.launch(options)
            }
        }
    }

    // ---------------------------------------------------------
    // GUARD PROFILE
    // ---------------------------------------------------------

    private fun loadGuardAliases(callback: () -> Unit) {
        val authUid = auth.currentUser?.uid

        if (authUid.isNullOrBlank()) {
            showMessageAndFinish(
                "Your session has expired. Please sign in again."
            )
            return
        }

        guardAliases.clear()
        guardAliases.add(authUid)

        db.collection("users")
            .document(authUid)
            .get(OfflinePatrol.source(this))
            .addOnSuccessListener { document ->
                if (!document.exists()) {
                    showMessageAndFinish(
                        "Your guard profile could not be found."
                    )
                    return@addOnSuccessListener
                }

                document.getString("guardId")
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?.let { guardAliases.add(it) }

                if (clientId.isBlank()) {
                    clientId = document.getString("clientId")
                        ?.trim()
                        .orEmpty()
                }

                callback()
            }
            .addOnFailureListener { error ->
                showDatabaseError("load your guard profile", error)
            }
    }

    private fun isAssignedToGuard(
        checkpoint: DocumentSnapshot
    ): Boolean {
        val assignedIds =
            (checkpoint.get("assignedGuardIds") as? List<*>)
                ?.mapNotNull { it as? String }
                ?.map { it.trim() }
                ?: emptyList()

        // Firebase UIDs are case-sensitive.
        return assignedIds.any { it in guardAliases }
    }

    private fun isCheckpointActive(
        checkpoint: DocumentSnapshot
    ): Boolean {
        val status = checkpoint.getString("status")
            ?.trim()
            ?.lowercase(Locale.US)
            ?: "active"

        return status !in setOf(
            "inactive",
            "disabled",
            "revoked",
            "archived"
        )
    }

    private fun matchesQr(
        checkpoint: DocumentSnapshot,
        scannedValue: String
    ): Boolean {
        return checkpoint.id == scannedValue ||
                checkpoint.get("qrCode") == scannedValue ||
                checkpoint.get("qrPayload") == scannedValue
    }

    // ---------------------------------------------------------
    // ACTIVE PATROL
    // ---------------------------------------------------------

    private fun resolveActivePatrolAndVerify(scannedValue: String) {
        if (patrolLogId.isNotBlank()) {
            verifyPatrolIsActive(scannedValue)
            return
        }

        val today = SimpleDateFormat(
            "yyyy-MM-dd",
            Locale.US
        ).format(Date())

        db.collection("patrol_logs")
            .whereEqualTo("guardId", guardId)
            .get(OfflinePatrol.source(this))
            .addOnSuccessListener { snapshots ->
                val activePatrol = snapshots.documents
                    .filter { document ->
                        document.getString("siteId") == siteId &&
                                document.getString("patrolDate") == today &&
                                document.getString("status") == "IN_PROGRESS"
                    }
                    .maxByOrNull { document ->
                        document.getTimestamp("startedAt")?.seconds ?: 0L
                    }

                if (activePatrol == null) {
                    showMessageAndFinish(
                        "No patrol is currently in progress. " +
                                "Tap Start Patrol first."
                    )
                    return@addOnSuccessListener
                }

                patrolLogId = activePatrol.id
                saveActivePatrol(activePatrol.id)
                verifyAndLogCheckpoint(scannedValue)
            }
            .addOnFailureListener { error ->
                showDatabaseError("find your active patrol", error)
            }
    }

    private fun verifyPatrolIsActive(scannedValue: String) {
        db.collection("patrol_logs")
            .document(patrolLogId)
            .get(OfflinePatrol.source(this))
            .addOnSuccessListener { document ->
                val patrol = OfflineStore.get(this).patrol(auth.currentUser!!.uid, document)
                val isCorrectGuard =
                    patrol.getString("guardId") == guardId

                val isCorrectSite =
                    patrol.getString("siteId") == siteId

                val isInProgress =
                    patrol.getString("status") == "IN_PROGRESS"

                if (
                    !patrol.exists() ||
                    !isCorrectGuard ||
                    !isCorrectSite ||
                    !isInProgress
                ) {
                    clearActivePatrol()
                    patrolLogId = ""
                    resolveActivePatrolAndVerify(scannedValue)
                    return@addOnSuccessListener
                }

                verifyAndLogCheckpoint(scannedValue)
            }
            .addOnFailureListener { error ->
                showDatabaseError("verify your active patrol", error)
            }
    }

    // ---------------------------------------------------------
    // QR LOOKUP
    // ---------------------------------------------------------

    private fun verifyAndLogCheckpoint(scannedValue: String) {
        val qrValue = scannedValue.trim()

        if (qrValue.isBlank()) {
            showMessageAndFinish("The scanned QR code is empty.")
            return
        }

        // This filter matches the site's Firestore read permissions.
        db.collection("checkpoints")
            .whereEqualTo("siteId", siteId)
            .get(OfflinePatrol.source(this))
            .addOnSuccessListener { snapshots ->
                val matches = snapshots.documents.filter {
                    matchesQr(it, qrValue)
                }

                when {
                    matches.size > 1 -> {
                        showMessageAndFinish(
                            "This QR matches multiple checkpoints. " +
                                    "Ask your supervisor to correct the duplicate QR codes."
                        )
                    }

                    matches.size == 1 -> {
                        validateNewCheckpoint(
                            matches.first(),
                            qrValue
                        )
                    }

                    else -> {
                        verifyLegacyCheckpoint(qrValue)
                    }
                }
            }
            .addOnFailureListener { error ->
                showDatabaseError(
                    "load this site's checkpoints",
                    error
                )
            }
    }

    private fun validateNewCheckpoint(
        checkpoint: DocumentSnapshot,
        scannedValue: String
    ) {
        if (checkpoint.getString("siteId") != siteId) {
            showMessageAndFinish(
                "This QR checkpoint belongs to another site."
            )
            return
        }

        if (!isCheckpointActive(checkpoint)) {
            showMessageAndFinish(
                "This QR checkpoint is not active."
            )
            return
        }

        if (!isAssignedToGuard(checkpoint)) {
            showMessageAndFinish(
                "You are not assigned to this QR checkpoint."
            )
            return
        }

        verifyCheckpointProximity(
            checkpoint = checkpoint,
            scannedValue = scannedValue,
            isLegacy = false
        )
    }

    private fun verifyLegacyCheckpoint(scannedValue: String) {
        if (!isValidDocumentId(scannedValue)) {
            showMessageAndFinish(
                "This QR does not match a checkpoint in your assigned site."
            )
            return
        }

        db.collection("client_sites")
            .document(siteId)
            .collection("locations")
            .document(scannedValue)
            .get(OfflinePatrol.source(this))
            .addOnSuccessListener { checkpoint ->
                if (!checkpoint.exists()) {
                    showMessageAndFinish(
                        "This QR does not match a checkpoint in your assigned site."
                    )
                    return@addOnSuccessListener
                }

                verifyCheckpointProximity(
                    checkpoint = checkpoint,
                    scannedValue = scannedValue,
                    isLegacy = true
                )
            }
            .addOnFailureListener { error ->
                showDatabaseError(
                    "verify the legacy checkpoint",
                    error
                )
            }
    }

    private fun isValidDocumentId(value: String): Boolean {
        return value.isNotBlank() &&
                value != "." &&
                value != ".." &&
                !value.contains("/") &&
                value.toByteArray(Charsets.UTF_8).size <= 1500 &&
                !(value.startsWith("__") && value.endsWith("__"))
    }

    // ---------------------------------------------------------
    // PHYSICAL CHECKPOINT LOCATION VERIFICATION
    // ---------------------------------------------------------

    /**
     * A QR scan is not enough by itself.
     *
     * The supervisor/admin must first register the physical QR position in:
     *
     *   checkpoints/{checkpointId}
     *
     * using the mobile QR Location Setup screen.
     *
     * The guard's fresh GPS location must then be inside the saved radius
     * before the checkpoint scan is allowed to update patrol progress.
     */
    private fun verifyCheckpointProximity(
        checkpoint: DocumentSnapshot,
        scannedValue: String,
        isLegacy: Boolean
    ) {

        if (!hasRegisteredLocation(checkpoint)) {
            showMessageAndFinish(
                "This checkpoint's physical GPS location has not been registered yet. " +
                        "Ask your supervisor to scan and register the QR at its placement location."
            )
            return
        }

        pendingLocationCheckpoint =
            checkpoint

        pendingLocationScannedValue =
            scannedValue

        pendingLocationIsLegacy =
            isLegacy

        if (!hasFineLocationPermission()) {

            ActivityCompat.requestPermissions(
                this,
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                LOCATION_PERMISSION_REQUEST_CODE
            )

            return
        }

        captureGuardLocationAndContinue()
    }


    private fun captureGuardLocationAndContinue() {

        val checkpoint =
            pendingLocationCheckpoint

        if (checkpoint == null) {
            showMessageAndFinish(
                "Checkpoint information was lost. Please scan the QR again."
            )
            return
        }

        if (!hasFineLocationPermission()) {
            verifyCheckpointProximity(
                checkpoint = checkpoint,
                scannedValue = pendingLocationScannedValue,
                isLegacy = pendingLocationIsLegacy
            )
            return
        }

        Toast.makeText(
            this,
            "Verifying your GPS position...",
            Toast.LENGTH_SHORT
        ).show()

        val cancellationTokenSource =
            CancellationTokenSource()

        try {
            fusedLocationClient
                .getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    cancellationTokenSource.token
                )
                .addOnSuccessListener { location ->

                    if (location == null) {
                        clearPendingLocationVerification()

                        showMessageAndFinish(
                            "Unable to get your current GPS position. " +
                                    "Turn Location on, wait for a GPS fix, and scan again."
                        )
                        return@addOnSuccessListener
                    }

                    if (
                        location.accuracy >
                        MAX_SCAN_ACCURACY_METERS
                    ) {
                        clearPendingLocationVerification()

                        showMessageAndFinish(
                            "Your GPS signal is not accurate enough to verify this checkpoint. " +
                                    "Current accuracy is ±${String.format(Locale.US, "%.1f", location.accuracy)}m. " +
                                    "Move to a clearer area near the QR and try again."
                        )
                        return@addOnSuccessListener
                    }

                    val scannedValue =
                        pendingLocationScannedValue

                    val isLegacy =
                        pendingLocationIsLegacy

                    clearPendingLocationVerification()

                    recordCheckpointInPatrol(
                        checkpointId = checkpoint.id,
                        checkpointName =
                            checkpoint.getString("name") ?: "Checkpoint",
                        scannedValue = scannedValue,
                        isLegacy = isLegacy,
                        scanLocation = location
                    )
                }
                .addOnFailureListener { error ->

                    clearPendingLocationVerification()

                    showMessageAndFinish(
                        "Unable to verify your current GPS position: " +
                                (error.localizedMessage ?: "Please try again.")
                    )
                }

        } catch (securityException: SecurityException) {

            ActivityCompat.requestPermissions(
                this,
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                LOCATION_PERMISSION_REQUEST_CODE
            )
        }
    }


    private fun hasRegisteredLocation(
        checkpoint: DocumentSnapshot
    ): Boolean {

        val latitude =
            checkpoint.getDouble("latitude")
                ?: checkpoint.getDouble("lat")

        val longitude =
            checkpoint.getDouble("longitude")
                ?: checkpoint.getDouble("lng")
                ?: checkpoint.getDouble("long")

        val explicitlyRegistered =
            checkpoint.getBoolean("locationRegistered")
                ?: checkpoint.getBoolean("isRegistered")
                ?: false

        return explicitlyRegistered &&
                latitude != null &&
                longitude != null
    }


    /**
     * Re-run the actual distance calculation using the checkpoint document
     * read inside the Firestore transaction. This prevents a stale checkpoint
     * record from bypassing a newly changed placement/radius.
     */
    private fun validateCheckpointDistance(
        checkpoint: DocumentSnapshot,
        scanLocation: Location
    ): CheckpointLocationVerification {

        val registered =
            checkpoint.getBoolean("locationRegistered")
                ?: checkpoint.getBoolean("isRegistered")
                ?: false

        val checkpointLatitude =
            checkpoint.getDouble("latitude")
                ?: checkpoint.getDouble("lat")
                ?: throw IllegalStateException(
                    "LOCATION_NOT_REGISTERED"
                )

        val checkpointLongitude =
            checkpoint.getDouble("longitude")
                ?: checkpoint.getDouble("lng")
                ?: checkpoint.getDouble("long")
                ?: throw IllegalStateException(
                    "LOCATION_NOT_REGISTERED"
                )

        if (!registered) {
            throw IllegalStateException(
                "LOCATION_NOT_REGISTERED"
            )
        }

        if (
            scanLocation.accuracy >
            MAX_SCAN_ACCURACY_METERS
        ) {
            throw IllegalStateException(
                "LOCATION_ACCURACY_POOR:${scanLocation.accuracy}"
            )
        }

        val allowedRadius =
            (
                    checkpoint.getDouble(
                        "geofenceRadiusMeters"
                    )
                        ?: DEFAULT_GEOFENCE_RADIUS_METERS
                    )
                .coerceIn(
                    MIN_GEOFENCE_RADIUS_METERS,
                    MAX_GEOFENCE_RADIUS_METERS
                )

        val result =
            FloatArray(
                1
            )

        Location.distanceBetween(
            scanLocation.latitude,
            scanLocation.longitude,
            checkpointLatitude,
            checkpointLongitude,
            result
        )

        val distance =
            result[0]
                .toDouble()

        if (
            distance >
            allowedRadius
        ) {
            throw IllegalStateException(
                "LOCATION_TOO_FAR:$distance:$allowedRadius"
            )
        }

        return CheckpointLocationVerification(
            scanLatitude =
                scanLocation.latitude,

            scanLongitude =
                scanLocation.longitude,

            scanAccuracyMeters =
                scanLocation.accuracy.toDouble(),

            checkpointLatitude =
                checkpointLatitude,

            checkpointLongitude =
                checkpointLongitude,

            distanceMeters =
                distance,

            allowedRadiusMeters =
                allowedRadius
        )
    }


    private fun hasFineLocationPermission():
            Boolean {

        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) ==
                PackageManager.PERMISSION_GRANTED
    }


    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(
            requestCode,
            permissions,
            grantResults
        )

        if (
            requestCode !=
            LOCATION_PERMISSION_REQUEST_CODE
        ) {
            return
        }

        if (
            hasFineLocationPermission()
        ) {
            captureGuardLocationAndContinue()

        } else {
            clearPendingLocationVerification()

            showMessageAndFinish(
                "Precise location permission is required to verify that you are physically at the QR checkpoint."
            )
        }
    }


    private fun clearPendingLocationVerification() {

        pendingLocationCheckpoint =
            null

        pendingLocationScannedValue =
            ""

        pendingLocationIsLegacy =
            false
    }


    // ---------------------------------------------------------
    // VERIFY ASSIGNMENT AND SAVE PATROL PROGRESS
    // ---------------------------------------------------------

    private fun recordCheckpointInPatrol(
        checkpointId: String,
        checkpointName: String,
        scannedValue: String,
        isLegacy: Boolean,
        scanLocation: Location
    ) {
        if (patrolLogId.isBlank()) {
            showMessageAndFinish("No active patrol found.")
            return
        }

        val patrolRef = db.collection("patrol_logs")
            .document(patrolLogId)

        val checkpointRef = if (isLegacy) {
            db.collection("client_sites")
                .document(siteId)
                .collection("locations")
                .document(checkpointId)
        } else {
            db.collection("checkpoints")
                .document(checkpointId)
        }

        val localScanTime = Timestamp.now()

        OfflinePatrol.record(this, patrolRef, checkpointRef) { transaction ->
            // All reads happen before the write.
            val patrol = OfflineStore.get(this).patrol(auth.currentUser!!.uid, transaction.get(patrolRef))
            val checkpoint = transaction.get(checkpointRef)

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

            if (!checkpoint.exists()) {
                throw IllegalStateException("CHECKPOINT_NOT_FOUND")
            }

            if (!isCheckpointActive(checkpoint)) {
                throw IllegalStateException("CHECKPOINT_INACTIVE")
            }

            // Recheck current assignment during the transaction.
            if (!isLegacy) {
                if (checkpoint.getString("siteId") != siteId) {
                    throw IllegalStateException("WRONG_SITE")
                }

                if (!isAssignedToGuard(checkpoint)) {
                    throw IllegalStateException("CHECKPOINT_NOT_ASSIGNED")
                }

                if (!matchesQr(checkpoint, scannedValue)) {
                    throw IllegalStateException("QR_CHANGED")
                }
            }

            // Physical anti-remote-scan validation using the latest
            // checkpoint coordinates/radius inside the transaction.
            val locationVerification =
                validateCheckpointDistance(
                    checkpoint,
                    scanLocation
                )

            val requiredCheckpointIds =
                (patrol.get("requiredCheckpointIds") as? List<*>)
                    ?.mapNotNull { it as? String }
                    ?.toMutableList()
                    ?: mutableListOf<String>()

            val requiredCheckpointNames =
                (patrol.get("requiredCheckpointNames") as? List<*>)
                    ?.mapNotNull { it as? String }
                    ?.toMutableList()
                    ?: mutableListOf<String>()

            var checkpointAddedToPatrol = false

            if (checkpointId !in requiredCheckpointIds) {
                // Legacy records do not contain the modern assignment
                // fields. They must already belong to the patrol list.
                if (isLegacy) {
                    throw IllegalStateException("CHECKPOINT_NOT_REQUIRED")
                }

                // A modern checkpoint can join the running patrol only
                // after the site, active status and assignment checks above.
                while (
                    requiredCheckpointNames.size <
                    requiredCheckpointIds.size
                ) {
                    requiredCheckpointNames.add("Checkpoint")
                }

                while (
                    requiredCheckpointNames.size >
                    requiredCheckpointIds.size
                ) {
                    requiredCheckpointNames.removeAt(
                        requiredCheckpointNames.lastIndex
                    )
                }

                requiredCheckpointIds.add(checkpointId)

                requiredCheckpointNames.add(
                    checkpoint.getString("name") ?: checkpointName
                )

                checkpointAddedToPatrol = true
            }

            val completedCheckpointIds =
                (patrol.get("completedCheckpointIds") as? List<*>)
                    ?.mapNotNull { it as? String }
                    ?.distinct()
                    ?.toMutableList()
                    ?: mutableListOf<String>()

            if (checkpointId in completedCheckpointIds) {
                throw IllegalStateException("CHECKPOINT_ALREADY_SCANNED")
            }

            completedCheckpointIds.add(checkpointId)

            val checkpointScans =
                (patrol.get("checkpointScans") as? List<*>)
                    ?.toMutableList()
                    ?: mutableListOf<Any?>()

            val verifiedCheckpointName =
                checkpoint.getString("name") ?: checkpointName

            checkpointScans.add(
                hashMapOf<String, Any>(
                    "checkpointId" to checkpointId,
                    "checkpointName" to verifiedCheckpointName,
                    "scannedAt" to localScanTime,
                    "qrValue" to scannedValue,

                    "locationVerified" to true,

                    "scanLatitude" to
                            locationVerification.scanLatitude,

                    "scanLongitude" to
                            locationVerification.scanLongitude,

                    "scanAccuracyMeters" to
                            locationVerification.scanAccuracyMeters,

                    "checkpointLatitude" to
                            locationVerification.checkpointLatitude,

                    "checkpointLongitude" to
                            locationVerification.checkpointLongitude,

                    "distanceMeters" to
                            locationVerification.distanceMeters,

                    "allowedRadiusMeters" to
                            locationVerification.allowedRadiusMeters
                )
            )

            val uniqueRequiredIds = requiredCheckpointIds.toSet()
            val totalCheckpoints = uniqueRequiredIds.size

            // Only required checkpoints count toward completion.
            val completedCount = uniqueRequiredIds.count {
                it in completedCheckpointIds
            }

            val patrolCompleted =
                totalCheckpoints > 0 &&
                        completedCount == totalCheckpoints

            val updates = hashMapOf<String, Any>(
                "completedCheckpointIds" to completedCheckpointIds,
                "completedCheckpoints" to completedCount,
                "totalCheckpoints" to totalCheckpoints,
                "checkpointScans" to checkpointScans,
                "updatedAt" to localScanTime
            )

            if (checkpointAddedToPatrol) {
                updates["requiredCheckpointIds"] =
                    requiredCheckpointIds

                updates["requiredCheckpointNames"] =
                    requiredCheckpointNames
            }

            if (patrol.get("firstCheckpointScannedAt") == null) {
                updates["firstCheckpointScannedAt"] =
                    localScanTime
            }

            if (patrolCompleted) {
                val startedAt = patrol.getTimestamp("startedAt")

                val durationSeconds = if (startedAt != null) {
                    (localScanTime.seconds - startedAt.seconds)
                        .coerceAtLeast(0L)
                } else {
                    0L
                }

                updates["status"] = "COMPLETED"
                updates["completedAt"] = localScanTime
                updates["durationSeconds"] = durationSeconds
                updates["emailStatus"] = "pending"
            }

            transaction.update(patrolRef, updates)

            PatrolScanResult(
                completedCount = completedCount,
                totalCount = totalCheckpoints,
                patrolCompleted = patrolCompleted,
                locationVerification = locationVerification
            )
        }
            .addOnSuccessListener { result ->
                if (result.patrolCompleted) {
                    PatrolLocationService.stop(this)
                    clearActivePatrol()

                    Toast.makeText(
                        this,
                        "Patrol completed on this phone; sync pending. " +
                                "${result.completedCount} of " +
                                "${result.totalCount} checkpoints scanned.",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    Toast.makeText(
                        this,
                        "Checkpoint saved on this phone; sync pending: $checkpointName " +
                                "(${result.completedCount}/${result.totalCount})",
                        Toast.LENGTH_LONG
                    ).show()
                }

                setResult(RESULT_OK)
                finish()
            }
            .addOnFailureListener { error ->
                val knownMessages = mapOf(
                    "CHECKPOINT_ALREADY_SCANNED" to
                            "You already scanned this checkpoint during the current patrol.",

                    "CHECKPOINT_NOT_REQUIRED" to
                            "This older QR checkpoint is not in your current patrol. " +
                            "Ask your supervisor to check the checkpoint record.",

                    "CHECKPOINT_NOT_ASSIGNED" to
                            "This checkpoint is no longer assigned to you.",

                    "CHECKPOINT_NOT_FOUND" to
                            "This checkpoint no longer exists.",

                    "CHECKPOINT_INACTIVE" to
                            "This checkpoint is inactive or has been revoked.",

                    "QR_CHANGED" to
                            "This checkpoint's QR has changed. Scan its current QR code.",

                    "PATROL_NOT_ACTIVE" to
                            "This patrol is no longer in progress.",

                    "WRONG_GUARD" to
                            "This patrol belongs to another guard.",

                    "WRONG_SITE" to
                            "The patrol or checkpoint belongs to another site.",

                    "PATROL_NOT_FOUND" to
                            "The active patrol record could not be found."
                )

                val errorMessages =
                    generateSequence<Throwable>(
                        error
                    ) {
                        it.cause
                    }
                        .mapNotNull {
                            it.message
                        }
                        .toList()

                val knownMessage =
                    errorMessages
                        .mapNotNull {
                            knownMessages[it]
                        }
                        .firstOrNull()

                val locationMessage =
                    errorMessages
                        .firstNotNullOfOrNull {
                                raw ->

                            when {
                                raw ==
                                        "LOCATION_NOT_REGISTERED" ->

                                    "This checkpoint's physical GPS location has not been registered by a supervisor."

                                raw.startsWith(
                                    "LOCATION_ACCURACY_POOR:"
                                ) -> {

                                    val accuracy =
                                        raw.substringAfter(
                                            ":"
                                        )
                                            .toDoubleOrNull()

                                    if (
                                        accuracy != null
                                    ) {
                                        "Your GPS accuracy is ±${String.format(Locale.US, "%.1f", accuracy)}m. " +
                                                "Move closer to the QR or to a clearer GPS area and try again."
                                    } else {
                                        "Your GPS signal is not accurate enough to verify this checkpoint."
                                    }
                                }

                                raw.startsWith(
                                    "LOCATION_TOO_FAR:"
                                ) -> {

                                    val parts =
                                        raw.split(
                                            ":"
                                        )

                                    val distance =
                                        parts.getOrNull(
                                            1
                                        )
                                            ?.toDoubleOrNull()

                                    val radius =
                                        parts.getOrNull(
                                            2
                                        )
                                            ?.toDoubleOrNull()

                                    if (
                                        distance != null &&
                                        radius != null
                                    ) {
                                        "Checkpoint rejected. You are about ${String.format(Locale.US, "%.1f", distance)}m from the registered QR location. " +
                                                "You must be within ${String.format(Locale.US, "%.0f", radius)}m."
                                    } else {
                                        "Checkpoint rejected because you are outside its registered location radius."
                                    }
                                }

                                else ->
                                    null
                            }
                        }

                when {
                    locationMessage != null ->
                        showMessageAndFinish(
                            locationMessage
                        )

                    knownMessage != null ->
                        showMessageAndFinish(
                            knownMessage
                        )

                    else ->
                        showDatabaseError(
                            "record the checkpoint",
                            error
                        )
                }
            }
    }

    // ---------------------------------------------------------
    // SEPARATE SCAN HISTORY
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // ERROR HANDLING
    // ---------------------------------------------------------

    private fun showDatabaseError(
        action: String,
        error: Exception
    ) {
        Log.e(
            "QR_CHECKPOINT",
            "Unable to $action",
            error
        )

        val firestoreError = generateSequence<Throwable>(error) {
            it.cause
        }.filterIsInstance<FirebaseFirestoreException>()
            .firstOrNull()

        val message = when (firestoreError?.code) {
            FirebaseFirestoreException.Code.PERMISSION_DENIED ->
                "Unable to $action: access was denied. " +
                        "Ask your supervisor to check your assigned site " +
                        "and Firestore permissions."

            FirebaseFirestoreException.Code.UNAUTHENTICATED ->
                "Your session has expired. Please sign in again."

            FirebaseFirestoreException.Code.UNAVAILABLE ->
                "Offline data is not available for this action. Connect once to load your patrol and assigned checkpoints."

            else ->
                "Unable to $action: " +
                        (error.localizedMessage ?: "Please try again.")
        }

        showMessageAndFinish(message)
    }

    private fun showMessageAndFinish(message: String) {
        Toast.makeText(
            this,
            message,
            Toast.LENGTH_LONG
        ).show()

        finish()
    }

    companion object {

        // Default proximity requirement for newly registered QR checkpoints.
        private const val DEFAULT_GEOFENCE_RADIUS_METERS =
            30.0

        private const val MIN_GEOFENCE_RADIUS_METERS =
            10.0

        private const val MAX_GEOFENCE_RADIUS_METERS =
            100.0

        // Poor GPS fixes are rejected rather than weakening the anti-remote
        // check. The supervisor placement screen requires an even better
        // <= 30m fix when registering the QR.
        private const val MAX_SCAN_ACCURACY_METERS =
            40f

        private const val LOCATION_PERMISSION_REQUEST_CODE =
            2004
    }

}