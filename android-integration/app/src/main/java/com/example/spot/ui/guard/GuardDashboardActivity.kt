package com.example.spot.ui.guard

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.PatrolModel
import com.example.spot.R
import com.example.spot.ui.auth.FaceVerifyActivity
import com.example.spot.service.PatrolLocationService
import com.google.android.gms.tasks.Tasks
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs

class GuardDashboardActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    private var rovingListener: ListenerRegistration? = null
    private var checkpointListener: ListenerRegistration? = null
    private var deploymentListener: ListenerRegistration? = null

    private var realSiteName: String = "No Site Assigned"
    private val patrolList = mutableListOf<PatrolModel>()
    private lateinit var patrolAdapter: PatrolAdapter

    private var assignedSiteId: String = ""
    private var guardId: String = ""
    private var guardName: String = ""
    private var clientId: String = ""

    private val patrolPrefs by lazy {
        getSharedPreferences("SPOT_PATROL", MODE_PRIVATE)
    }

    private data class CheckpointInfo(
        val id: String,
        val name: String
    )

    private data class AssignedCheckpoint(
        val id: String,
        val name: String,
        val area: String
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_guard_dashboard)

        val tvWelcomeGuard = findViewById<TextView>(R.id.tvWelcomeGuard)
        val tvGuardName = findViewById<TextView>(R.id.tvGuardName)
        val tvBadgeID = findViewById<TextView>(R.id.tvBadgeID)
        val tvDashboardSiteName = findViewById<TextView>(R.id.tvLocation)
        val tvShiftTime = findViewById<TextView>(R.id.tvShiftTime)
        val tvRovingTime = findViewById<TextView>(R.id.tvRovingTime)
        val tvRovingNotes = findViewById<TextView>(R.id.tvRovingNotes)
        val tvAssignedQr = findViewById<TextView>(R.id.tvAssignedQr)
        val checkpointListContainer = findViewById<LinearLayout>(R.id.checkpointListContainer)
        val tvLogout = findViewById<TextView>(R.id.tvLogout)
        val rvPatrols = findViewById<RecyclerView>(R.id.rvPatrols)
        val btnReport = findViewById<MaterialButton>(R.id.btnReport)
        val btnEmergency = findViewById<MaterialButton>(R.id.btnEmergency)
        val btnScanQR = findViewById<MaterialButton>(R.id.btnScanQR)
        val btnStartPatrol = findViewById<MaterialButton>(R.id.btnStartPatrol)
        val btnChangePassword = findViewById<MaterialButton>(R.id.btnChangePassword)

        guardName = intent.getStringExtra("GUARD_NAME") ?: "Security Personnel"
        guardId = intent.getStringExtra("GUARD_ID")
            ?: auth.currentUser?.uid
            ?: ""
        assignedSiteId = intent.getStringExtra("ASSIGNED_SITE_ID") ?: ""

        tvWelcomeGuard.text = "${getGreeting()},"
        tvGuardName.text = guardName
        tvBadgeID.text = "ID: $guardId"

        patrolAdapter = PatrolAdapter(
            patrolList,
            onItemClick = { patrol ->
                Toast.makeText(
                    this,
                    "${patrol.patrolTime} • ${patrol.status}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        )

        rvPatrols.layoutManager = LinearLayoutManager(this)
        rvPatrols.adapter = patrolAdapter
        rvPatrols.isNestedScrollingEnabled = true

        if (assignedSiteId.isNotEmpty()) {
            loadSiteName(assignedSiteId, tvDashboardSiteName)
            loadGuardPatrols()
            loadGuardShift(guardId, tvShiftTime)
            loadGuardAccessData(
                tvRovingTime,
                tvRovingNotes,
                tvAssignedQr,
                checkpointListContainer
            )
        } else {
            tvRovingTime.text = "Patrol Schedule: No site assigned"
            tvRovingNotes.visibility = View.GONE
            tvAssignedQr.text = "Assigned QR checkpoints: 0"
            renderAssignedCheckpoints(emptyList(), checkpointListContainer)
        }

        tvLogout.setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle("Shift Log Out")
                .setMessage("Are you sure you want to end your shift? You must scan your face to record your Time-Out.")
                .setPositiveButton("Verify & Logout") { _, _ ->
                    val verifyIntent = Intent(this, FaceVerifyActivity::class.java).apply {
                        putExtra("USER_ID", guardId)
                        putExtra("USER_ROLE", "guard")
                        putExtra("GUARD_NAME", guardName)
                        putExtra("ASSIGNED_SITE_ID", assignedSiteId)
                        putExtra("CLIENT_ID", clientId)
                        putExtra("IS_LOGOUT_MODE", true)
                    }
                    startActivity(verifyIntent)
                }
                .setNegativeButton("Stay on Duty", null)
                .show()
        }

        btnReport.setOnClickListener {
            val reportIntent = Intent(this, CreateReportActivity::class.java).apply {
                putExtra("GUARD_NAME", guardName)
                putExtra("GUARD_ID", guardId)
                putExtra("ASSIGNED_SITE", realSiteName)
                putExtra("ASSIGNED_SITE_ID", assignedSiteId)
            }
            startActivity(reportIntent)
        }

        btnScanQR.setOnClickListener {
            if (assignedSiteId.isEmpty()) {
                Toast.makeText(
                    this,
                    "No site assigned to scan checkpoints",
                    Toast.LENGTH_SHORT
                ).show()
                return@setOnClickListener
            }

            val scanIntent = Intent(this, ScanCheckpointActivity::class.java).apply {
                putExtra("SITE_ID", assignedSiteId)
                putExtra("CLIENT_ID", clientId)
                putExtra("GUARD_ID", guardId)
                putExtra("GUARD_NAME", guardName)
                putExtra(
                    "PATROL_LOG_ID",
                    patrolPrefs.getString("ACTIVE_PATROL_LOG_ID", "") ?: ""
                )
            }
            startActivity(scanIntent)
        }

        btnStartPatrol.setOnClickListener {
            startPatrolWithLocationPermission()
        }

        btnChangePassword.setOnClickListener {
            startActivity(
                Intent(
                    this,
                    ChangePasswordActivity::class.java
                )
            )
        }

        btnEmergency.setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle("EMERGENCY")
                .setMessage("Do you want to directly call the 911 Emergency Hotline?")
                .setPositiveButton("Call (911)") { _, _ ->
                    val emergencyIntent = Intent(Intent.ACTION_DIAL).apply {
                        data = android.net.Uri.parse("tel:911")
                    }
                    startActivity(emergencyIntent)
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        // Listen to users/{Firebase UID} so a supervisor site transfer is
        // reflected in the guard app without creating a new guard account.
        startDeploymentListener()
    }

    override fun onResume() {
        super.onResume()

        // One-shot refresh handles the case where the transfer happened while
        // this activity was not running or while a patrol was still finishing.
        refreshDeploymentFromProfile()
    }

    // -------------------------------------------------------------------------
    // SUPERVISOR DEPLOYMENT / SITE TRANSFER
    // -------------------------------------------------------------------------

    private fun startDeploymentListener() {

        val uid =
            auth.currentUser?.uid
                ?.trim()
                .orEmpty()

        if (uid.isBlank()) {
            return
        }

        deploymentListener?.remove()

        deploymentListener =
            db.collection(
                "users"
            )
                .document(
                    uid
                )
                .addSnapshotListener {
                    document,
                    error ->

                    if (
                        error != null ||
                        document == null ||
                        !document.exists()
                    ) {
                        return@addSnapshotListener
                    }

                    applyDeploymentProfile(
                        document,
                        showTransferMessage = true
                    )
                }
    }


    private fun refreshDeploymentFromProfile() {

        val uid =
            auth.currentUser?.uid
                ?.trim()
                .orEmpty()

        if (uid.isBlank()) {

            if (
                guardId.isNotEmpty() &&
                assignedSiteId.isNotEmpty()
            ) {
                loadGuardPatrols()
                syncPatrolLocationTracking()
            }

            return
        }

        db.collection(
            "users"
        )
            .document(
                uid
            )
            .get()
            .addOnSuccessListener {
                document ->

                if (
                    document.exists()
                ) {
                    applyDeploymentProfile(
                        document,
                        showTransferMessage = false
                    )
                }

                if (
                    guardId.isNotEmpty() &&
                    assignedSiteId.isNotEmpty()
                ) {
                    loadGuardPatrols()
                    syncPatrolLocationTracking()
                }
            }
            .addOnFailureListener {

                if (
                    guardId.isNotEmpty() &&
                    assignedSiteId.isNotEmpty()
                ) {
                    loadGuardPatrols()
                    syncPatrolLocationTracking()
                }
            }
    }


    private fun applyDeploymentProfile(
        document: DocumentSnapshot,
        showTransferMessage: Boolean
    ) {

        val newSiteId =
            (
                document.getString(
                    "assignedSiteId"
                )
                    ?: document.getString(
                        "siteId"
                    )
                    ?: ""
            )
                .trim()

        val newSiteName =
            document.getString(
                "siteName"
            )
                ?.trim()
                .orEmpty()

        clientId =
            document.getString(
                "clientId"
            )
                ?.trim()
                .orEmpty()

        if (
            newSiteId ==
            assignedSiteId
        ) {
            if (
                newSiteName.isNotBlank()
            ) {
                realSiteName =
                    newSiteName

                findViewById<TextView>(
                    R.id.tvLocation
                ).text =
                    newSiteName
            }

            return
        }

        // A site transfer should never interrupt a patrol that is already
        // running. The supervisor UI also blocks this, but keep this Android
        // guard in case of a race condition.
        val activePatrolId =
            patrolPrefs.getString(
                "ACTIVE_PATROL_LOG_ID",
                ""
            )
                ?.trim()
                .orEmpty()

        if (
            activePatrolId.isNotBlank()
        ) {

            android.util.Log.i(
                "DEPLOYMENT",
                "Site transfer detected but delayed locally until active patrol finishes."
            )

            return
        }

        val oldSiteId =
            assignedSiteId

        rovingListener?.remove()
        rovingListener = null

        checkpointListener?.remove()
        checkpointListener = null

        assignedSiteId =
            newSiteId

        intent.putExtra(
            "ASSIGNED_SITE_ID",
            assignedSiteId
        )

        realSiteName =
            if (
                newSiteName.isNotBlank()
            ) {
                newSiteName
            } else {
                "No Site Assigned"
            }

        val tvDashboardSiteName =
            findViewById<TextView>(
                R.id.tvLocation
            )

        val tvShiftTime =
            findViewById<TextView>(
                R.id.tvShiftTime
            )

        val tvRovingTime =
            findViewById<TextView>(
                R.id.tvRovingTime
            )

        val tvRovingNotes =
            findViewById<TextView>(
                R.id.tvRovingNotes
            )

        val tvAssignedQr =
            findViewById<TextView>(
                R.id.tvAssignedQr
            )

        val checkpointListContainer =
            findViewById<LinearLayout>(
                R.id.checkpointListContainer
            )

        patrolList.clear()
        patrolAdapter.notifyDataSetChanged()

        if (
            assignedSiteId.isBlank()
        ) {

            realSiteName =
                "No Site Assigned"

            tvDashboardSiteName.text =
                realSiteName

            tvShiftTime.text =
                "No Site Assigned"

            tvRovingTime.text =
                "Patrol Schedule: No site assigned"

            tvRovingNotes.visibility =
                View.GONE

            tvAssignedQr.text =
                "Assigned QR checkpoints: 0"

            renderAssignedCheckpoints(
                emptyList(),
                checkpointListContainer
            )

        } else {

            if (
                newSiteName.isNotBlank()
            ) {
                tvDashboardSiteName.text =
                    newSiteName
            }

            loadSiteName(
                assignedSiteId,
                tvDashboardSiteName
            )

            loadGuardPatrols()

            loadGuardShift(
                guardId,
                tvShiftTime
            )

            loadGuardAccessData(
                tvRovingTime,
                tvRovingNotes,
                tvAssignedQr,
                checkpointListContainer
            )
        }

        if (
            showTransferMessage &&
            oldSiteId.isNotBlank()
        ) {

            Toast.makeText(
                this,
                if (
                    assignedSiteId.isBlank()
                ) {
                    "Your deployment assignment was removed by the supervisor."
                } else {
                    "Deployment updated. You are now assigned to ${newSiteName.ifBlank { assignedSiteId }}."
                },
                Toast.LENGTH_LONG
            ).show()
        }
    }


    // -------------------------------------------------------------------------
    // PATROL GPS TRACKING
    // -------------------------------------------------------------------------

    private fun startPatrolWithLocationPermission() {

        if (hasLocationPermission()) {
            requestActivityPermissionThenStart()
            return
        }

        ActivityCompat.requestPermissions(
            this,
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ),
            LOCATION_PERMISSION_REQUEST_CODE
        )
    }

    private fun hasLocationPermission(): Boolean {

        val fine =
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) ==
                PackageManager.PERMISSION_GRANTED

        val coarse =
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) ==
                PackageManager.PERMISSION_GRANTED

        return fine || coarse
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
            requestCode ==
            LOCATION_PERMISSION_REQUEST_CODE
        ) {

            if (hasLocationPermission()) {
                requestActivityPermissionThenStart()
            } else {
                Toast.makeText(
                    this,
                    "Location permission is required to start a monitored patrol.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

        if (requestCode == ACTIVITY_PERMISSION_REQUEST_CODE) {
            // Step counting is optional; patrol GPS should work even if it is declined.
            startScheduledPatrol()
        }
    }

    private fun requestActivityPermissionThenStart() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACTIVITY_RECOGNITION),
                ACTIVITY_PERMISSION_REQUEST_CODE
            )
        } else {
            startScheduledPatrol()
        }
    }

    private fun startPatrolLocationTracking(
        patrolLogId: String,
        patrolTime: String
    ) {

        if (!hasLocationPermission()) {
            return
        }

        PatrolLocationService.start(
            context = this,
            guardId = guardId,
            guardName = guardName,
            siteId = assignedSiteId,
            siteName = realSiteName,
            clientId = clientId,
            patrolLogId = patrolLogId,
            patrolTime = patrolTime
        )
    }

    /**
     * If Android returns to the dashboard while a patrol is already active
     * (for example after scanning a QR or after the process was recreated),
     * make sure the foreground GPS tracker is running again.
     */
    private fun syncPatrolLocationTracking() {

        if (!hasLocationPermission()) {
            return
        }

        val activePatrolId =
            patrolPrefs.getString(
                "ACTIVE_PATROL_LOG_ID",
                ""
            )
                ?.trim()
                .orEmpty()

        if (activePatrolId.isBlank()) {
            return
        }

        db.collection(
            "patrol_logs"
        )
            .document(
                activePatrolId
            )
            .get()
            .addOnSuccessListener { patrol ->

                if (
                    patrol.exists() &&
                    patrol.getString(
                        "status"
                    )
                        ?.trim()
                        ?.uppercase(
                            Locale.US
                        ) ==
                        "IN_PROGRESS"
                ) {

                    startPatrolLocationTracking(
                        patrolLogId =
                            activePatrolId,
                        patrolTime =
                            patrol.getString(
                                "patrolTime"
                            )
                                ?: patrol.getString(
                                    "scheduledTime"
                                )
                                ?: ""
                    )

                } else {

                    patrolPrefs.edit()
                        .remove(
                            "ACTIVE_PATROL_LOG_ID"
                        )
                        .remove(
                            "ACTIVE_PATROL_GUARD_ID"
                        )
                        .remove(
                            "ACTIVE_PATROL_SITE_ID"
                        )
                        .apply()

                    PatrolLocationService.stop(
                        this
                    )
                }
            }
    }

    private fun getGreeting(): String {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return when (hour) {
            in 0..11 -> "Good Morning"
            in 12..17 -> "Good Afternoon"
            else -> "Good Evening"
        }
    }

    // -------------------------------------------------------------------------
    // TODAY'S SCHEDULE
    // -------------------------------------------------------------------------

    private fun loadGuardPatrols() {
        if (guardId.isEmpty() || assignedSiteId.isEmpty()) return

        // Use every known identifier for this guard. New records use the
        // Firebase Auth UID, while older website records may contain G-xxxx.
        loadGuardAliases { aliases ->
            db.collection("roving_assignments")
                .whereEqualTo("siteId", assignedSiteId)
                .get()
                .addOnSuccessListener { snapshots ->

                    val assignment =
                        snapshots.documents.firstOrNull { doc ->

                            val assignmentGuardId =
                                doc.getString("guardId")
                                    ?.trim()
                                    .orEmpty()

                            val status =
                                doc.getString("status")
                                    ?.trim()
                                    ?.lowercase(Locale.US)

                            aliases.any { alias ->
                                alias.equals(
                                    assignmentGuardId,
                                    ignoreCase = true
                                )
                            } &&
                                status != "inactive" &&
                                status != "disabled" &&
                                status != "archived"
                        }

                    if (assignment != null) {
                        val todayDay =
                            SimpleDateFormat(
                                "EEE",
                                Locale.US
                            ).format(Date())

                        val days =
                            (assignment.get("days") as? List<*>)
                                ?.mapNotNull {
                                    it?.toString()
                                }
                                ?: emptyList()

                        if (
                            days.isNotEmpty() &&
                            !days.any {
                                it.equals(
                                    todayDay,
                                    true
                                )
                            }
                        ) {
                            showPatrols(
                                emptyList()
                            )
                            return@addOnSuccessListener
                        }

                        val times =
                            (assignment.get("patrolTimes") as? List<*>)
                                ?.mapNotNull {
                                    it?.toString()
                                        ?.trim()
                                }
                                ?.filter {
                                    it.isNotEmpty()
                                }
                                ?.distinct()
                                ?.sortedWith(
                                    compareBy {
                                        parseTimeMinutes(
                                            it
                                        )
                                            ?: Int.MAX_VALUE
                                    }
                                )
                                ?: emptyList()

                        if (times.isNotEmpty()) {
                            ensureTodayPatrolLogs(
                                times,
                                assignment.id
                            )
                        } else {
                            // Backward compatibility with startTime/endTime.
                            val legacyTimes =
                                listOfNotNull(
                                    assignment.getString("startTime"),
                                    assignment.getString("endTime")
                                )
                                    .map {
                                        it.trim()
                                    }
                                    .filter {
                                        it.isNotEmpty()
                                    }
                                    .distinct()

                            if (legacyTimes.isNotEmpty()) {
                                ensureTodayPatrolLogs(
                                    legacyTimes,
                                    assignment.id
                                )
                            } else {
                                loadLegacySchedule()
                            }
                        }
                    } else {
                        loadLegacySchedule()
                    }
                }
                .addOnFailureListener {
                    loadLegacySchedule()
                }
        }
    }

    // Keeps your old schedule collection working while you migrate to
    // roving_assignments from the supervisor website.
    private fun loadLegacySchedule() {
        db.collection("guard_schedules_template")
            .document(guardId)
            .get()
            .addOnSuccessListener { doc ->
                val times = (doc.get("recurringTimes") as? List<*>)
                    ?.mapNotNull { it?.toString()?.trim() }
                    ?.filter { it.isNotEmpty() }
                    ?.distinct()
                    ?.sortedWith(compareBy { parseTimeMinutes(it) ?: Int.MAX_VALUE })
                    ?: emptyList()

                ensureTodayPatrolLogs(times, "")
            }
            .addOnFailureListener {
                showPatrols(emptyList())
            }
    }

    private fun ensureTodayPatrolLogs(
        times: List<String>,
        rovingAssignmentId: String,
        onReady: (() -> Unit)? = null
    ) {
        if (times.isEmpty()) {
            showPatrols(emptyList())
            onReady?.invoke()
            return
        }

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val tasks = times.mapNotNull { patrolTime ->
            val scheduledDate = parseScheduledDate(today, patrolTime)
                ?: return@mapNotNull null

            val logId = buildPatrolLogId(today, patrolTime)
            val ref = db.collection("patrol_logs").document(logId)

            db.runTransaction { transaction ->
                val existing = transaction.get(ref)

                val lateAfterDate =
                    Date(
                        scheduledDate.time +
                            (5 * 60 * 1000L)
                    )

                val missedAfterDate =
                    Date(
                        scheduledDate.time +
                            (15 * 60 * 1000L)
                    )

                if (!existing.exists()) {

                    val data =
                        hashMapOf<String, Any?>(
                            "guardId" to guardId,
                            "guardName" to guardName,
                            "clientId" to clientId,
                            "siteId" to assignedSiteId,
                            "siteName" to realSiteName,
                            "rovingAssignmentId" to rovingAssignmentId,
                            "patrolDate" to today,
                            "scheduledDate" to today,
                            "patrolTime" to patrolTime,
                            "scheduledTime" to patrolTime,
                            "scheduledAt" to Timestamp(scheduledDate),
                            "lateAfter" to Timestamp(lateAfterDate),
                            "missedAfter" to Timestamp(missedAfterDate),
                            "status" to "SCHEDULED",
                            "startedAt" to null,
                            "firstCheckpointScannedAt" to null,
                            "completedAt" to null,
                            "missedAt" to null,
                            "totalCheckpoints" to 0,
                            "completedCheckpoints" to 0,
                            "requiredCheckpointIds" to emptyList<String>(),
                            "requiredCheckpointNames" to emptyList<String>(),
                            "completedCheckpointIds" to emptyList<String>(),
                            "checkpointScans" to emptyList<Map<String, Any>>(),
                            "emailStatus" to "not_sent",
                            "createdAt" to FieldValue.serverTimestamp(),
                            "updatedAt" to FieldValue.serverTimestamp()
                        )

                    transaction.set(
                        ref,
                        data
                    )

                } else {

                    // -------------------------------------------------
                    // LEGACY PATROL-LOG MIGRATION
                    //
                    // Older S.P.O.T. builds used status = PENDING and
                    // some existing records may not contain scheduledAt.
                    // Because this log uses a deterministic document ID,
                    // simply "not overwriting" the old record leaves the
                    // patrol permanently unstartable.
                    //
                    // Normalize ONLY schedule metadata. Never reset a
                    // patrol that is already IN_PROGRESS / COMPLETED /
                    // MISSED.
                    // -------------------------------------------------
                    val existingStatus =
                        existing.getString(
                            "status"
                        )
                            ?.trim()
                            ?.uppercase(
                                Locale.US
                            )
                            .orEmpty()

                    val protectedStatuses =
                        setOf(
                            "IN_PROGRESS",
                            "COMPLETED",
                            "MISSED"
                        )

                    val normalizedStatus =
                        if (
                            existingStatus.isBlank() ||
                            existingStatus == "PENDING"
                        ) {
                            "SCHEDULED"
                        } else {
                            existingStatus
                        }

                    val updates =
                        hashMapOf<String, Any?>(
                            "guardId" to guardId,
                            "guardName" to guardName,
                            "clientId" to clientId,
                            "siteId" to assignedSiteId,
                            "siteName" to realSiteName,
                            "rovingAssignmentId" to rovingAssignmentId,
                            "patrolDate" to today,
                            "scheduledDate" to today,
                            "patrolTime" to patrolTime,
                            "scheduledTime" to patrolTime,
                            "scheduledAt" to Timestamp(scheduledDate),
                            "lateAfter" to Timestamp(lateAfterDate),
                            "missedAfter" to Timestamp(missedAfterDate),
                            "updatedAt" to FieldValue.serverTimestamp()
                        )

                    if (
                        existingStatus !in
                            protectedStatuses
                    ) {
                        updates["status"] =
                            normalizedStatus
                    }

                    transaction.update(
                        ref,
                        updates
                    )
                }

                null
            }
        }

        if (tasks.isEmpty()) {
            showPatrols(emptyList())
            onReady?.invoke()
            return
        }

        Tasks.whenAllComplete(tasks)
            .addOnCompleteListener {
                loadTodayPatrolLogs(times)
                onReady?.invoke()
            }
    }

    private fun loadTodayPatrolLogs(times: List<String>) {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        db.collection("patrol_logs")
            .whereEqualTo("guardId", guardId)
            .get()
            .addOnSuccessListener { snapshots ->
                patrolList.clear()

                val todayLogs = snapshots.documents
                    .filter { doc ->
                        doc.getString("siteId") == assignedSiteId &&
                            doc.getString("patrolDate") == today &&
                            times.contains(doc.getString("patrolTime") ?: "")
                    }
                    .sortedWith(
                        compareBy { doc ->
                            parseTimeMinutes(doc.getString("patrolTime") ?: "")
                                ?: Int.MAX_VALUE
                        }
                    )

                todayLogs.forEach { doc ->
                    patrolList.add(
                        PatrolModel(
                            id = doc.id,
                            guardId = guardId,
                            patrolDate = today,
                            patrolTime = doc.getString("patrolTime") ?: "",
                            status = doc.getString("status") ?: "SCHEDULED"
                        )
                    )
                }

                patrolAdapter.notifyDataSetChanged()
                updatePatrolProgress()
            }
            .addOnFailureListener {
                showPatrols(times)
            }
    }

    private fun showPatrols(times: List<String>) {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        patrolList.clear()
        times.forEach { time ->
            patrolList.add(
                PatrolModel(
                    guardId = guardId,
                    patrolDate = today,
                    patrolTime = time,
                    status = "SCHEDULED"
                )
            )
        }

        patrolAdapter.notifyDataSetChanged()
        updatePatrolProgress()
    }

    private fun updatePatrolProgress() {
        val pbPatrolProgress = findViewById<ProgressBar>(R.id.pbPatrolProgress)
        val tvCheckpointCount = findViewById<TextView>(R.id.tvCheckpointCount)

        val completedCount = patrolList.count { it.status == "COMPLETED" }
        val total = patrolList.size

        tvCheckpointCount.text = "$completedCount of $total patrols completed"
        pbPatrolProgress.progress = if (total > 0) {
            (completedCount * 100) / total
        } else {
            0
        }
    }

    // -------------------------------------------------------------------------
    // START PATROL
    // -------------------------------------------------------------------------

    /**
     * ORIGINAL GUARD-SIDE PATROL FLOW
     *
     * Start Patrol reads the supervisor's roving_assignments directly.
     * patrol_logs are used as the execution/history record only.
     *
     * This prevents stale/missing patrol_logs from making a valid supervisor
     * schedule appear "not startable".
     */
    private fun startScheduledPatrol(
        refreshIfMissing: Boolean = true
    ) {
        if (
            guardId.isBlank() ||
            assignedSiteId.isBlank()
        ) {
            Toast.makeText(
                this,
                "Guard or site information is missing.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val today =
            SimpleDateFormat(
                "yyyy-MM-dd",
                Locale.US
            ).format(Date())

        val todayDay =
            SimpleDateFormat(
                "EEE",
                Locale.US
            ).format(Date())

        val now =
            Date()

        val earlyStartAllowanceMs =
            5 * 60 * 1000L

        // First resolve every ID that may represent this guard:
        // Firebase UID + old human-readable G-xxxx ID.
        loadGuardAliases { aliases ->

            // The supervisor website stores the official recurring patrol
            // schedule in roving_assignments.
            db.collection(
                "roving_assignments"
            )
                .whereEqualTo(
                    "siteId",
                    assignedSiteId
                )
                .get()
                .addOnSuccessListener { assignmentSnapshots ->

                    val assignment =
                        assignmentSnapshots.documents
                            .firstOrNull { doc ->

                                val assignmentGuardId =
                                    doc.getString(
                                        "guardId"
                                    )
                                        ?.trim()
                                        .orEmpty()

                                val assignmentStatus =
                                    doc.getString(
                                        "status"
                                    )
                                        ?.trim()
                                        ?.lowercase(
                                            Locale.US
                                        )
                                        ?: "active"

                                aliases.any { alias ->
                                    alias.equals(
                                        assignmentGuardId,
                                        ignoreCase = true
                                    )
                                } &&
                                    assignmentStatus !in
                                        setOf(
                                            "inactive",
                                            "disabled",
                                            "archived"
                                        )
                            }

                    if (assignment == null) {
                        Toast.makeText(
                            this,
                            "No patrol schedule is assigned to you for this site.",
                            Toast.LENGTH_LONG
                        ).show()
                        return@addOnSuccessListener
                    }

                    val days =
                        (assignment.get(
                            "days"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                                    ?.trim()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?: emptyList()

                    if (
                        days.isNotEmpty() &&
                        !days.any {
                            it.equals(
                                todayDay,
                                ignoreCase = true
                            )
                        }
                    ) {
                        Toast.makeText(
                            this,
                            "You have a patrol schedule, but no patrol is assigned for today ($todayDay).",
                            Toast.LENGTH_LONG
                        ).show()
                        return@addOnSuccessListener
                    }

                    var patrolTimes =
                        (assignment.get(
                            "patrolTimes"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                                    ?.trim()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?.distinct()
                            ?: emptyList()

                    // Backward compatibility with the old startTime/endTime
                    // website format.
                    if (patrolTimes.isEmpty()) {
                        patrolTimes =
                            listOfNotNull(
                                assignment.getString(
                                    "startTime"
                                ),
                                assignment.getString(
                                    "endTime"
                                )
                            )
                                .map {
                                    it.trim()
                                }
                                .filter {
                                    it.isNotBlank()
                                }
                                .distinct()
                    }

                    val scheduledPatrols =
                        patrolTimes
                            .mapNotNull { time ->

                                val scheduledAt =
                                    parseScheduledDate(
                                        today,
                                        time
                                    )
                                        ?: return@mapNotNull null

                                Pair(
                                    time,
                                    scheduledAt
                                )
                            }
                            .sortedBy {
                                it.second.time
                            }

                    if (scheduledPatrols.isEmpty()) {
                        Toast.makeText(
                            this,
                            "Your patrol schedule does not contain a valid patrol time.",
                            Toast.LENGTH_LONG
                        ).show()
                        return@addOnSuccessListener
                    }

                    // Load only this guard's logs so an already completed,
                    // missed, or active patrol cannot be started again.
                    db.collection(
                        "patrol_logs"
                    )
                        .whereEqualTo(
                            "guardId",
                            guardId
                        )
                        .get()
                        .addOnSuccessListener { logSnapshots ->

                            val todayLogs =
                                logSnapshots.documents
                                    .filter { doc ->

                                        doc.getString(
                                            "siteId"
                                        ) ==
                                            assignedSiteId &&
                                            doc.getString(
                                                "patrolDate"
                                            ) ==
                                            today
                                    }

                            val activeLog =
                                todayLogs
                                    .firstOrNull { doc ->

                                        doc.getString(
                                            "status"
                                        )
                                            ?.trim()
                                            ?.uppercase(
                                                Locale.US
                                            ) ==
                                            "IN_PROGRESS"
                                    }

                            if (activeLog != null) {
                                saveActivePatrol(
                                    activeLog.id
                                )

                                startPatrolLocationTracking(
                                    patrolLogId = activeLog.id,
                                    patrolTime =
                                        activeLog.getString(
                                            "patrolTime"
                                        )
                                            ?: activeLog.getString(
                                                "scheduledTime"
                                            )
                                            ?: ""
                                )

                                Toast.makeText(
                                    this,
                                    "A patrol is already in progress. Complete your assigned checkpoints first.",
                                    Toast.LENGTH_LONG
                                ).show()
                                return@addOnSuccessListener
                            }

                            fun findExistingLogForTime(
                                patrolTime: String
                            ) =
                                todayLogs.firstOrNull { doc ->

                                    val storedTime =
                                        doc.getString(
                                            "patrolTime"
                                        )
                                            ?: doc.getString(
                                                "scheduledTime"
                                            )
                                            ?: ""

                                    storedTime.equals(
                                        patrolTime,
                                        ignoreCase = true
                                    )
                                }

                            // A patrol is startable from 5 minutes before its
                            // assigned time. If it is late but has NOT been
                            // marked MISSED, the guard may still start it and
                            // startedLate=true is recorded.
                            val duePatrols =
                                scheduledPatrols
                                    .filter {
                                        now.time >=
                                            it.second.time -
                                            earlyStartAllowanceMs
                                    }
                                    .sortedByDescending {
                                        it.second.time
                                    }

                            val candidate =
                                duePatrols
                                    .firstOrNull {
                                        patrol ->

                                        val existing =
                                            findExistingLogForTime(
                                                patrol.first
                                            )

                                        val status =
                                            existing
                                                ?.getString(
                                                    "status"
                                                )
                                                ?.trim()
                                                ?.uppercase(
                                                    Locale.US
                                                )
                                                .orEmpty()

                                        status !in
                                            setOf(
                                                "COMPLETED",
                                                "MISSED",
                                                "IN_PROGRESS"
                                            )
                                    }

                            if (candidate == null) {

                                val nextPatrol =
                                    scheduledPatrols
                                        .firstOrNull {
                                            now.time <
                                                it.second.time -
                                                earlyStartAllowanceMs
                                        }

                                val message =
                                    if (nextPatrol != null) {
                                        "Your next patrol is at ${nextPatrol.first}. You can start 5 minutes early."
                                    } else {
                                        "All patrols due today are already completed or marked missed."
                                    }

                                Toast.makeText(
                                    this,
                                    message,
                                    Toast.LENGTH_LONG
                                ).show()
                                return@addOnSuccessListener
                            }

                            val patrolTime =
                                candidate.first

                            val scheduledAt =
                                candidate.second

                            val startedLate =
                                now.time >
                                    scheduledAt.time +
                                    (5 * 60 * 1000L)

                            // The guard must have at least one assigned QR.
                            loadRequiredCheckpoints { checkpoints ->

                                if (checkpoints.isEmpty()) {
                                    Toast.makeText(
                                        this,
                                        "You do not have any QR checkpoints assigned for this site.",
                                        Toast.LENGTH_LONG
                                    ).show()
                                    return@loadRequiredCheckpoints
                                }

                                val logId =
                                    buildPatrolLogId(
                                        today,
                                        patrolTime
                                    )

                                val lateAfter =
                                    Date(
                                        scheduledAt.time +
                                            (5 * 60 * 1000L)
                                    )

                                val missedAfter =
                                    Date(
                                        scheduledAt.time +
                                            (15 * 60 * 1000L)
                                    )

                                val patrolData =
                                    hashMapOf<String, Any?>(
                                        "guardId" to
                                            guardId,

                                        "guardName" to
                                            guardName,

                                        "clientId" to clientId,

                                        "siteId" to
                                            assignedSiteId,

                                        "siteName" to
                                            realSiteName,

                                        "rovingAssignmentId" to
                                            assignment.id,

                                        "patrolDate" to
                                            today,

                                        "scheduledDate" to
                                            today,

                                        "patrolTime" to
                                            patrolTime,

                                        "scheduledTime" to
                                            patrolTime,

                                        "scheduledAt" to
                                            Timestamp(
                                                scheduledAt
                                            ),

                                        "lateAfter" to
                                            Timestamp(
                                                lateAfter
                                            ),

                                        "missedAfter" to
                                            Timestamp(
                                                missedAfter
                                            ),

                                        "status" to
                                            "IN_PROGRESS",

                                        "startedAt" to
                                            FieldValue.serverTimestamp(),

                                        "startedLate" to
                                            startedLate,

                                        "firstCheckpointScannedAt" to
                                            null,

                                        "completedAt" to
                                            null,

                                        "missedAt" to
                                            null,

                                        "totalCheckpoints" to
                                            checkpoints.size,

                                        "completedCheckpoints" to
                                            0,

                                        "requiredCheckpointIds" to
                                            checkpoints.map {
                                                it.id
                                            },

                                        "requiredCheckpointNames" to
                                            checkpoints.map {
                                                it.name
                                            },

                                        "completedCheckpointIds" to
                                            emptyList<String>(),

                                        "checkpointScans" to
                                            emptyList<Map<String, Any>>(),

                                        "emailStatus" to
                                            "not_sent",

                                        "updatedAt" to
                                            FieldValue.serverTimestamp()
                                    )

                                // Merge lets us repair/continue a legacy
                                // PENDING/SCHEDULED log without depending on
                                // its old fields.
                                db.collection(
                                    "patrol_logs"
                                )
                                    .document(
                                        logId
                                    )
                                    .set(
                                        patrolData,
                                        SetOptions.merge()
                                    )
                                    .addOnSuccessListener {

                                        saveActivePatrol(
                                            logId
                                        )

                                        startPatrolLocationTracking(
                                            patrolLogId =
                                                logId,
                                            patrolTime =
                                                patrolTime
                                        )

                                        loadGuardPatrols()

                                        val lateText =
                                            if (startedLate) {
                                                " (started late)"
                                            } else {
                                                ""
                                            }

                                        Toast.makeText(
                                            this,
                                            "Patrol $patrolTime started$lateText. Scan all ${checkpoints.size} assigned checkpoints.",
                                            Toast.LENGTH_LONG
                                        ).show()
                                    }
                                    .addOnFailureListener { error ->

                                        Toast.makeText(
                                            this,
                                            "Unable to start patrol: ${error.localizedMessage}",
                                            Toast.LENGTH_LONG
                                        ).show()
                                    }
                            }
                        }
                        .addOnFailureListener { error ->

                            Toast.makeText(
                                this,
                                "Unable to check today's patrol history: ${error.localizedMessage}",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                }
                .addOnFailureListener { error ->

                    Toast.makeText(
                        this,
                        "Unable to load your patrol schedule: ${error.localizedMessage}",
                        Toast.LENGTH_LONG
                    ).show()
                }
        }
    }

    /**
     * Re-reads the supervisor's current roving assignment and makes sure
     * today's patrol_logs exist before Start Patrol checks for a candidate.
     *
     * This supports:
     * - schedules assigned while the mobile dashboard is already open
     * - old G-xxxx guard references
     * - new Firebase UID guard references
     * - patrolTimes and legacy startTime/endTime records
     */
    private fun refreshTodayScheduleAndThen(
        onReady: () -> Unit
    ) {
        loadGuardAliases { aliases ->

            db.collection(
                "roving_assignments"
            )
                .whereEqualTo(
                    "siteId",
                    assignedSiteId
                )
                .get()
                .addOnSuccessListener { snapshots ->

                    val assignment =
                        snapshots.documents
                            .firstOrNull { doc ->

                                val assignmentGuardId =
                                    doc.getString(
                                        "guardId"
                                    )
                                        ?.trim()
                                        .orEmpty()

                                val status =
                                    doc.getString(
                                        "status"
                                    )
                                        ?.trim()
                                        ?.lowercase(
                                            Locale.US
                                        )
                                        ?: "active"

                                aliases.any { alias ->
                                    alias.equals(
                                        assignmentGuardId,
                                        ignoreCase = true
                                    )
                                } &&
                                    status !in
                                        setOf(
                                            "inactive",
                                            "disabled",
                                            "archived"
                                        )
                            }

                    if (assignment == null) {

                        Toast.makeText(
                            this,
                            "No patrol schedule is assigned to this guard for the current site.",
                            Toast.LENGTH_LONG
                        ).show()

                        return@addOnSuccessListener
                    }

                    val todayDay =
                        SimpleDateFormat(
                            "EEE",
                            Locale.US
                        ).format(
                            Date()
                        )

                    val days =
                        (assignment.get(
                            "days"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                                    ?.trim()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?: emptyList()

                    if (
                        days.isNotEmpty() &&
                        !days.any {
                            it.equals(
                                todayDay,
                                ignoreCase = true
                            )
                        }
                    ) {

                        Toast.makeText(
                            this,
                            "A patrol schedule exists, but today ($todayDay) is not one of the assigned patrol days.",
                            Toast.LENGTH_LONG
                        ).show()

                        return@addOnSuccessListener
                    }

                    var times =
                        (assignment.get(
                            "patrolTimes"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                                    ?.trim()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?.distinct()
                            ?: emptyList()

                    if (times.isEmpty()) {

                        times =
                            listOfNotNull(
                                assignment.getString(
                                    "startTime"
                                ),
                                assignment.getString(
                                    "endTime"
                                )
                            )
                                .map {
                                    it.trim()
                                }
                                .filter {
                                    it.isNotBlank()
                                }
                                .distinct()
                    }

                    if (times.isEmpty()) {

                        Toast.makeText(
                            this,
                            "The patrol assignment exists, but it does not contain a patrol time.",
                            Toast.LENGTH_LONG
                        ).show()

                        return@addOnSuccessListener
                    }

                    ensureTodayPatrolLogs(
                        times = times,
                        rovingAssignmentId = assignment.id,
                        onReady = onReady
                    )
                }
                .addOnFailureListener { error ->

                    Toast.makeText(
                        this,
                        "Unable to refresh patrol schedule: ${error.localizedMessage}",
                        Toast.LENGTH_LONG
                    ).show()
                }
        }
    }

    private fun loadRequiredCheckpoints(
        callback: (List<CheckpointInfo>) -> Unit
    ) {
        loadGuardAliases { aliases ->

            db.collection("checkpoints")
                .whereEqualTo(
                    "siteId",
                    assignedSiteId
                )
                .get()
                .addOnSuccessListener { snapshots ->

                    if (!snapshots.isEmpty) {

                        val checkpoints =
                            snapshots.documents
                                .mapNotNull { doc ->

                                    val status =
                                        doc.getString("status")
                                            ?.trim()
                                            ?.lowercase(Locale.US)
                                            ?: "active"

                                    val assignedIds =
                                        (doc.get("assignedGuardIds") as? List<*>)
                                            ?.mapNotNull {
                                                it?.toString()
                                                    ?.trim()
                                            }
                                            ?.filter {
                                                it.isNotEmpty()
                                            }
                                            ?: emptyList()

                                    val isActive =
                                        status !in
                                            setOf(
                                                "inactive",
                                                "disabled",
                                                "revoked",
                                                "archived"
                                            )

                                    val isAssigned =
                                        assignedIds.any { assignedId ->
                                            aliases.any { alias ->
                                                alias.equals(
                                                    assignedId,
                                                    ignoreCase = true
                                                )
                                            }
                                        }

                                    if (
                                        isActive &&
                                        isAssigned
                                    ) {
                                        CheckpointInfo(
                                            id = doc.id,
                                            name =
                                                doc.getString(
                                                    "name"
                                                )
                                                    ?: "Checkpoint"
                                        )
                                    } else {
                                        null
                                    }
                                }

                        callback(
                            checkpoints
                        )

                    } else {
                        loadLegacySiteCheckpoints(
                            callback
                        )
                    }
                }
                .addOnFailureListener {
                    loadLegacySiteCheckpoints(
                        callback
                    )
                }
        }
    }

    private fun loadLegacySiteCheckpoints(callback: (List<CheckpointInfo>) -> Unit) {
        db.collection("client_sites")
            .document(assignedSiteId)
            .collection("locations")
            .get()
            .addOnSuccessListener { snapshots ->
                callback(
                    snapshots.documents.map { doc ->
                        CheckpointInfo(
                            id = doc.id,
                            name = doc.getString("name") ?: "Checkpoint"
                        )
                    }
                )
            }
            .addOnFailureListener {
                callback(emptyList())
            }
    }

    private fun saveActivePatrol(patrolLogId: String) {
        patrolPrefs.edit()
            .putString("ACTIVE_PATROL_LOG_ID", patrolLogId)
            .putString("ACTIVE_PATROL_GUARD_ID", guardId)
            .putString("ACTIVE_PATROL_SITE_ID", assignedSiteId)
            .apply()
    }

    // -------------------------------------------------------------------------
    // SITE / SHIFT
    // -------------------------------------------------------------------------

    private fun loadSiteName(
        siteId: String,
        tvSite: TextView
    ) {
        // First support the older Android-side client_sites collection.
        db.collection(
            "client_sites"
        )
            .document(
                siteId
            )
            .get()
            .addOnSuccessListener {
                doc ->

                val name =
                    if (
                        doc.exists()
                    ) {
                        doc.getString(
                            "siteName"
                        )
                            ?: doc.getString(
                                "name"
                            )
                    } else {
                        null
                    }

                if (
                    !name.isNullOrBlank()
                ) {
                    realSiteName =
                        name

                    tvSite.text =
                        realSiteName
                } else {
                    loadSiteNameFromNewCollection(
                        siteId,
                        tvSite
                    )
                }
            }
            .addOnFailureListener {
                loadSiteNameFromNewCollection(
                    siteId,
                    tvSite
                )
            }
    }


    private fun loadSiteNameFromNewCollection(
        siteId: String,
        tvSite: TextView
    ) {
        // Current supervisor web app stores deployment sites here.
        db.collection(
            "sites"
        )
            .document(
                siteId
            )
            .get()
            .addOnSuccessListener {
                doc ->

                val name =
                    if (
                        doc.exists()
                    ) {
                        doc.getString(
                            "name"
                        )
                            ?: doc.getString(
                                "siteName"
                            )
                    } else {
                        null
                    }

                if (
                    !name.isNullOrBlank()
                ) {
                    realSiteName =
                        name

                    tvSite.text =
                        realSiteName
                } else {
                    loadSiteNameFromGuardProfile(
                        siteId,
                        tvSite
                    )
                }
            }
            .addOnFailureListener {
                loadSiteNameFromGuardProfile(
                    siteId,
                    tvSite
                )
            }
    }


    private fun loadSiteNameFromGuardProfile(
        siteId: String,
        tvSite: TextView
    ) {
        // The supervisor transfer feature always updates users/{uid} with
        // assignedSiteId + siteName. Use that as the authoritative fallback
        // so the mobile app never shows "Unknown Location" simply because
        // the site document lives in a different collection.
        val uid =
            auth.currentUser?.uid
                ?.trim()
                .orEmpty()

        if (
            uid.isBlank()
        ) {
            realSiteName =
                "Unknown Location"

            tvSite.text =
                realSiteName

            return
        }

        db.collection(
            "users"
        )
            .document(
                uid
            )
            .get()
            .addOnSuccessListener {
                userDoc ->

                val profileSiteId =
                    (
                        userDoc.getString(
                            "assignedSiteId"
                        )
                            ?: userDoc.getString(
                                "siteId"
                            )
                            ?: ""
                    )
                        .trim()

                val profileSiteName =
                    userDoc.getString(
                        "siteName"
                    )
                        ?.trim()
                        .orEmpty()

                if (
                    profileSiteId ==
                        siteId &&
                    profileSiteName.isNotBlank()
                ) {
                    realSiteName =
                        profileSiteName

                    tvSite.text =
                        realSiteName
                } else {
                    realSiteName =
                        "Unknown Location"

                    tvSite.text =
                        realSiteName
                }
            }
            .addOnFailureListener {
                realSiteName =
                    "Unknown Location"

                tvSite.text =
                    realSiteName
            }
    }


    private fun loadGuardShift(guardId: String, tvShiftTime: TextView) {
        if (assignedSiteId.isEmpty()) {
            tvShiftTime.text = "No Site Assigned"
            return
        }

        db.collection("client_sites")
            .document(assignedSiteId)
            .collection("guards")
            .document(guardId)
            .get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    val startTime = document.getString("startTime") ?: "06:00 AM"
                    val endTime = document.getString("endTime") ?: "06:00 PM"
                    tvShiftTime.text = "$startTime - $endTime"
                } else {
                    db.collection("users")
                        .document(
                            auth.currentUser?.uid
                                ?: guardId
                        )
                        .get()
                        .addOnSuccessListener { userDoc ->
                            val startTime =
                                userDoc.getString("dutyStart")
                            val endTime =
                                userDoc.getString("dutyEnd")

                            tvShiftTime.text =
                                if (
                                    !startTime.isNullOrBlank() &&
                                    !endTime.isNullOrBlank()
                                ) {
                                    "$startTime - $endTime"
                                } else {
                                    "No Shift Scheduled"
                                }
                        }
                        .addOnFailureListener {
                            tvShiftTime.text =
                                "No Shift Scheduled"
                        }
                }
            }
            .addOnFailureListener {
                tvShiftTime.text = "Schedule Unavailable"
            }
    }

    // -------------------------------------------------------------------------
    // GUARD ID ALIASES + ASSIGNED QR DISPLAY
    // -------------------------------------------------------------------------

    private fun loadGuardAliases(
        callback: (Set<String>) -> Unit
    ) {
        val aliases =
            linkedSetOf<String>()

        guardId
            .takeIf {
                it.isNotBlank()
            }
            ?.let {
                aliases.add(
                    it.trim()
                )
            }

        auth.currentUser?.uid
            ?.takeIf {
                it.isNotBlank()
            }
            ?.let {
                aliases.add(
                    it.trim()
                )
            }

        val profileId =
            auth.currentUser?.uid
                ?.takeIf {
                    it.isNotBlank()
                }
                ?: guardId

        if (profileId.isBlank()) {
            callback(
                aliases
            )
            return
        }

        db.collection("users")
            .document(
                profileId
            )
            .get()
            .addOnSuccessListener { doc ->

                doc.getString(
                    "guardId"
                )
                    ?.trim()
                    ?.takeIf {
                        it.isNotBlank()
                    }
                    ?.let {
                        aliases.add(
                            it
                        )
                    }

                callback(
                    aliases
                )
            }
            .addOnFailureListener {
                callback(
                    aliases
                )
            }
    }

    private fun loadGuardAccessData(
        tvRovingTime: TextView,
        tvRovingNotes: TextView,
        tvAssignedQr: TextView,
        checkpointListContainer: LinearLayout
    ) {
        loadGuardAliases { aliases ->

            loadRovingAssignmentDisplay(
                aliases,
                tvRovingTime,
                tvRovingNotes
            )

            loadAndDisplayAssignedCheckpoints(
                aliases,
                tvAssignedQr,
                checkpointListContainer
            )
        }
    }

    private fun loadRovingAssignmentDisplay(
        aliases: Set<String>,
        tvRovingTime: TextView,
        tvRovingNotes: TextView
    ) {
        rovingListener?.remove()

        if (assignedSiteId.isBlank()) {
            tvRovingTime.text =
                "Patrol Schedule: No site assigned"

            tvRovingNotes.visibility =
                View.GONE

            return
        }

        rovingListener =
            db.collection(
                "roving_assignments"
            )
                .whereEqualTo(
                    "siteId",
                    assignedSiteId
                )
                .addSnapshotListener {
                    snapshots,
                    error ->

                    if (error != null) {

                        android.util.Log.e(
                            "ROVING",
                            "Unable to listen for roving assignment",
                            error
                        )

                        tvRovingTime.text =
                            "Patrol Schedule: unavailable"

                        tvRovingNotes.visibility =
                            View.GONE

                        return@addSnapshotListener
                    }

                    if (snapshots == null) {

                        tvRovingTime.text =
                            "Patrol Schedule: Not assigned"

                        tvRovingNotes.visibility =
                            View.GONE

                        return@addSnapshotListener
                    }

                    val assignment =
                        snapshots.documents
                            .firstOrNull { doc ->

                                val assignmentGuardId =
                                    doc.getString(
                                        "guardId"
                                    )
                                        ?.trim()
                                        .orEmpty()

                                val status =
                                    doc.getString(
                                        "status"
                                    )
                                        ?.trim()
                                        ?.lowercase(
                                            Locale.ROOT
                                        )
                                        ?: "active"

                                aliases.any { alias ->
                                    alias.equals(
                                        assignmentGuardId,
                                        ignoreCase = true
                                    )
                                } &&
                                    status !in
                                        setOf(
                                            "inactive",
                                            "disabled",
                                            "archived"
                                        )
                            }

                    if (assignment == null) {

                        tvRovingTime.text =
                            "Patrol Schedule: Not assigned"

                        tvRovingNotes.visibility =
                            View.GONE

                        return@addSnapshotListener
                    }

                    val patrolTimes =
                        (assignment.get(
                            "patrolTimes"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                                    ?.trim()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?.distinct()
                            ?: emptyList()

                    val legacyTimes =
                        listOfNotNull(
                            assignment.getString(
                                "startTime"
                            ),
                            assignment.getString(
                                "endTime"
                            )
                        )
                            .map {
                                it.trim()
                            }
                            .filter {
                                it.isNotBlank()
                            }
                            .distinct()

                    val effectiveTimes =
                        if (
                            patrolTimes.isNotEmpty()
                        ) {
                            patrolTimes
                        } else {
                            legacyTimes
                        }

                    // If the supervisor assigned/changed this schedule while
                    // the guard app is open, create today's patrol_logs now.
                    val todayDay =
                        SimpleDateFormat(
                            "EEE",
                            Locale.US
                        ).format(
                            Date()
                        )

                    val assignmentDays =
                        (assignment.get(
                            "days"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                                    ?.trim()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?: emptyList()

                    val scheduledToday =
                        assignmentDays.isEmpty() ||
                            assignmentDays.any {
                                it.equals(
                                    todayDay,
                                    ignoreCase = true
                                )
                            }

                    if (
                        scheduledToday &&
                        effectiveTimes.isNotEmpty()
                    ) {
                        ensureTodayPatrolLogs(
                            effectiveTimes,
                            assignment.id
                        )
                    }

                    val days =
                        (assignment.get(
                            "days"
                        ) as? List<*>)
                            ?.mapNotNull {
                                it?.toString()
                            }
                            ?.filter {
                                it.isNotBlank()
                            }
                            ?: emptyList()

                    val dayText =
                        if (days.isEmpty()) {
                            "Every day"
                        } else {
                            days.joinToString(
                                ", "
                            )
                        }

                    val patrolText =
                        if (
                            effectiveTimes.isEmpty()
                        ) {
                            "No patrol times"
                        } else {
                            effectiveTimes
                                .mapIndexed {
                                    index,
                                    time ->
                                    "${index + 1}. $time"
                                }
                                .joinToString(
                                    "\n"
                                )
                        }

                    tvRovingTime.text =
                        "Patrol Schedule • $dayText\n$patrolText"

                    val notes =
                        assignment.getString(
                            "notes"
                        )
                            ?.trim()
                            .orEmpty()

                    if (notes.isNotEmpty()) {

                        tvRovingNotes.text =
                            "Instruction: $notes"

                        tvRovingNotes.visibility =
                            View.VISIBLE

                    } else {

                        tvRovingNotes.text =
                            ""

                        tvRovingNotes.visibility =
                            View.GONE
                    }
                }
    }

    private fun loadAndDisplayAssignedCheckpoints(
        aliases: Set<String>,
        tvAssignedQr: TextView,
        checkpointListContainer: LinearLayout
    ) {
        checkpointListener?.remove()

        if (assignedSiteId.isBlank()) {

            tvAssignedQr.text =
                "Assigned QR checkpoints: 0"

            renderAssignedCheckpoints(
                emptyList(),
                checkpointListContainer
            )

            return
        }

        // Live listener: the guard sees a supervisor QR assignment without
        // needing to log out or restart the app.
        checkpointListener =
            db.collection(
                "checkpoints"
            )
                .whereEqualTo(
                    "siteId",
                    assignedSiteId
                )
                .addSnapshotListener {
                    snapshots,
                    error ->

                    if (error != null) {

                        android.util.Log.e(
                            "CHECKPOINTS",
                            "Unable to listen for assigned checkpoints. " +
                                "site=$assignedSiteId aliases=$aliases",
                            error
                        )

                        val cached =
                            readCachedCheckpoints()

                        if (cached != null) {

                            tvAssignedQr.text =
                                "Assigned QR checkpoints: ${cached.size} (cached)"

                            renderAssignedCheckpoints(
                                cached,
                                checkpointListContainer
                            )

                        } else {

                            tvAssignedQr.text =
                                "Assigned QR checkpoints: unavailable"

                            renderAssignedCheckpoints(
                                emptyList(),
                                checkpointListContainer
                            )
                        }

                        return@addSnapshotListener
                    }

                    if (snapshots == null) {

                        tvAssignedQr.text =
                            "Assigned QR checkpoints: 0"

                        renderAssignedCheckpoints(
                            emptyList(),
                            checkpointListContainer
                        )

                        return@addSnapshotListener
                    }

                    val assigned =
                        mutableListOf<AssignedCheckpoint>()

                    val cacheJson =
                        JSONArray()

                    snapshots.documents
                        .forEach { doc ->

                            val assignedIds =
                                (doc.get(
                                    "assignedGuardIds"
                                ) as? List<*>)
                                    ?.mapNotNull {
                                        it?.toString()
                                            ?.trim()
                                    }
                                    ?.filter {
                                        it.isNotBlank()
                                    }
                                    ?: emptyList()

                            val status =
                                doc.getString(
                                    "status"
                                )
                                    ?.trim()
                                    ?.lowercase(
                                        Locale.ROOT
                                    )
                                    ?: "active"

                            val isActive =
                                status !in
                                    setOf(
                                        "inactive",
                                        "disabled",
                                        "revoked",
                                        "archived"
                                    )

                            val isAssigned =
                                assignedIds.any {
                                    assignedId ->

                                    aliases.any {
                                        alias ->

                                        alias.equals(
                                            assignedId,
                                            ignoreCase = true
                                        )
                                    }
                                }

                            if (
                                isActive &&
                                isAssigned
                            ) {

                                val name =
                                    doc.getString(
                                        "name"
                                    )
                                        ?.trim()
                                        .orEmpty()
                                        .ifBlank {
                                            "Checkpoint"
                                        }

                                val area =
                                    doc.getString(
                                        "area"
                                    )
                                        ?.trim()
                                        .orEmpty()

                                assigned.add(
                                    AssignedCheckpoint(
                                        id = doc.id,
                                        name = name,
                                        area = area
                                    )
                                )

                                cacheJson.put(
                                    JSONObject()
                                        .apply {

                                            put(
                                                "id",
                                                doc.id
                                            )

                                            put(
                                                "name",
                                                name
                                            )

                                            put(
                                                "siteId",
                                                doc.getString(
                                                    "siteId"
                                                )
                                                    ?: assignedSiteId
                                            )

                                            put(
                                                "area",
                                                area
                                            )

                                            put(
                                                "qrCode",
                                                doc.getString(
                                                    "qrCode"
                                                )
                                                    ?: ""
                                            )

                                            put(
                                                "qrPayload",
                                                doc.getString(
                                                    "qrPayload"
                                                )
                                                    ?: doc.getString(
                                                        "qrCode"
                                                    )
                                                    ?: ""
                                            )

                                            put(
                                                "status",
                                                doc.getString(
                                                    "status"
                                                )
                                                    ?: "Active"
                                            )

                                            put(
                                                "assignedGuardIds",
                                                JSONArray(
                                                    assignedIds
                                                )
                                            )
                                        }
                                )
                            }
                        }

                    val sorted =
                        assigned.sortedWith(
                            compareBy(
                                { it.area.lowercase(Locale.ROOT) },
                                { it.name.lowercase(Locale.ROOT) }
                            )
                        )

                    saveQrAccessCache(
                        cacheJson
                    )

                    tvAssignedQr.text =
                        "Assigned QR checkpoints: ${sorted.size}"

                    renderAssignedCheckpoints(
                        sorted,
                        checkpointListContainer
                    )

                    android.util.Log.d(
                        "CHECKPOINTS",
                        "Loaded ${sorted.size} assigned QR checkpoints. " +
                            "site=$assignedSiteId aliases=$aliases"
                    )
                }
    }

    private fun renderAssignedCheckpoints(
        checkpoints: List<AssignedCheckpoint>,
        container: LinearLayout
    ) {
        container.removeAllViews()

        if (checkpoints.isEmpty()) {

            val emptyView =
                TextView(
                    this
                ).apply {

                    text =
                        "No checkpoint has been assigned to you yet."

                    setTextColor(
                        getColor(
                            R.color.onSurfaceVariant
                        )
                    )

                    textSize =
                        12f

                    setPadding(
                        dp(2),
                        dp(8),
                        dp(2),
                        dp(8)
                    )
                }

            container.addView(
                emptyView
            )

            return
        }

        checkpoints.forEachIndexed {
            index,
            checkpoint ->

            val card =
                MaterialCardView(
                    this
                ).apply {

                    radius =
                        dp(12)
                            .toFloat()

                    cardElevation =
                        0f

                    strokeWidth =
                        dp(1)

                    strokeColor =
                        getColor(
                            R.color.divider
                        )

                    setCardBackgroundColor(
                        getColor(
                            R.color.background
                        )
                    )

                    layoutParams =
                        LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply {

                            if (
                                index > 0
                            ) {
                                topMargin =
                                    dp(8)
                            }
                        }
                }

            val content =
                LinearLayout(
                    this
                ).apply {

                    orientation =
                        LinearLayout.VERTICAL

                    setPadding(
                        dp(14),
                        dp(12),
                        dp(14),
                        dp(12)
                    )
                }

            val title =
                TextView(
                    this
                ).apply {

                    text =
                        "${index + 1}. ${checkpoint.name}"

                    setTextColor(
                        getColor(
                            R.color.onSurface
                        )
                    )

                    textSize =
                        13f

                    setTypeface(
                        typeface,
                        android.graphics.Typeface.BOLD
                    )
                }

            val location =
                TextView(
                    this
                ).apply {

                    text =
                        if (
                            checkpoint.area.isBlank()
                        ) {
                            "Location: No location description"
                        } else {
                            "Location: ${checkpoint.area}"
                        }

                    setTextColor(
                        getColor(
                            R.color.onSurfaceVariant
                        )
                    )

                    textSize =
                        11f

                    setPadding(
                        0,
                        dp(4),
                        0,
                        0
                    )
                }

            val status =
                TextView(
                    this
                ).apply {

                    text =
                        "Assigned checkpoint"

                    setTextColor(
                        getColor(
                            R.color.primary
                        )
                    )

                    textSize =
                        10f

                    setPadding(
                        0,
                        dp(7),
                        0,
                        0
                    )
                }

            content.addView(
                title
            )

            content.addView(
                location
            )

            content.addView(
                status
            )

            card.addView(
                content
            )

            container.addView(
                card
            )
        }
    }

    private fun saveQrAccessCache(
        items: JSONArray
    ) {
        val cacheKey =
            qrCacheKey(
                guardId,
                assignedSiteId
            )

        getSharedPreferences(
            QR_CACHE_PREFS,
            MODE_PRIVATE
        )
            .edit()
            .putString(
                cacheKey,
                items.toString()
            )
            .putLong(
                "${cacheKey}_syncedAt",
                System.currentTimeMillis()
            )
            .apply()
    }

    private fun readCachedCheckpoints():
        List<AssignedCheckpoint>? {

        val cacheKey =
            qrCacheKey(
                guardId,
                assignedSiteId
            )

        val raw =
            getSharedPreferences(
                QR_CACHE_PREFS,
                MODE_PRIVATE
            )
                .getString(
                    cacheKey,
                    null
                )
                ?: return null

        return try {

            val array =
                JSONArray(
                    raw
                )

            val items =
                mutableListOf<AssignedCheckpoint>()

            for (
                index in
                0 until array.length()
            ) {

                val item =
                    array.getJSONObject(
                        index
                    )

                items.add(
                    AssignedCheckpoint(
                        id =
                            item.optString(
                                "id"
                            ),
                        name =
                            item.optString(
                                "name",
                                "Checkpoint"
                            ),
                        area =
                            item.optString(
                                "area"
                            )
                    )
                )
            }

            items

        } catch (
            _: Exception
        ) {
            null
        }
    }

    private fun qrCacheKey(
        guardId: String,
        siteId: String
    ): String {

        return "assigned_checkpoints_${guardId}_$siteId"
    }

    private fun dp(
        value: Int
    ): Int {

        return (
            value *
                resources.displayMetrics.density
            )
            .toInt()
    }

    // -------------------------------------------------------------------------
    // TIME HELPERS
    // -------------------------------------------------------------------------

    private fun buildPatrolLogId(date: String, time: String): String {
        val safeTime = time
            .replace(":", "")
            .replace(" ", "")
            .replace("/", "-")

        return "${guardId}_${assignedSiteId}_${date}_$safeTime"
    }

    private fun parseScheduledDate(date: String, time: String): Date? {
        val formats = listOf(
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd H:mm",
            "yyyy-MM-dd hh:mm a",
            "yyyy-MM-dd h:mm a"
        )

        for (pattern in formats) {
            try {
                val formatter = SimpleDateFormat(pattern, Locale.US).apply {
                    isLenient = false
                }
                return formatter.parse("$date $time")
            } catch (_: Exception) {
            }
        }

        return null
    }

    private fun parseTimeMinutes(time: String): Int? {
        val formats = listOf("HH:mm", "H:mm", "hh:mm a", "h:mm a")

        for (pattern in formats) {
            try {
                val formatter = SimpleDateFormat(pattern, Locale.US).apply {
                    isLenient = false
                }
                val parsed = formatter.parse(time) ?: continue
                val calendar = Calendar.getInstance().apply { this.time = parsed }
                return calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
            } catch (_: Exception) {
            }
        }

        return null
    }

    override fun onDestroy() {

        rovingListener?.remove()
        rovingListener = null

        checkpointListener?.remove()
        checkpointListener = null

        deploymentListener?.remove()
        deploymentListener = null

        super.onDestroy()
    }

    companion object {
        private const val QR_CACHE_PREFS =
            "SPOT_QR_ACCESS_CACHE"

        private const val LOCATION_PERMISSION_REQUEST_CODE =
            4108

        private const val ACTIVITY_PERMISSION_REQUEST_CODE =
            4109
    }

}
