package com.example.spot.ui.guard

import com.example.spot.offline.OfflinePatrol
import com.example.spot.offline.OfflineStore
import com.google.android.gms.tasks.Tasks
import com.google.firebase.Timestamp
import java.io.File
import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.spot.R
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputEditText
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class CreateReportActivity : AppCompatActivity() {

    private val db by lazy { FirebaseFirestore.getInstance() }
    private val auth by lazy { FirebaseAuth.getInstance() }

    // ── Photo state ────────────────────────────────────────────────────────────
    private val selectedPhotos = mutableListOf<Uri>()   // local URIs
    private var cameraOutputUri: Uri? = null
    private val MAX_PHOTOS = 5

    // Severity selection
    private var selectedSeverity = "Medium"
    private var selectedIncidentType = "Suspicious Activity"

    private var clientId: String = ""
    private var activePatrolLogId: String = ""

    // ── View refs ──────────────────────────────────────────────────────────────
    private lateinit var tvPhotoCount: TextView
    private lateinit var layoutUploadProgress: LinearLayout
    private lateinit var tvUploadStatus: TextView
    private lateinit var btnSubmitReport: MaterialButton
    private lateinit var etReportTitle: TextInputEditText
    private lateinit var etReportDescription: TextInputEditText
    private lateinit var etIncidentLocation: TextInputEditText
    private lateinit var etActionsTaken: TextInputEditText
    private lateinit var spinnerIncidentType: Spinner

    private val photoSlotIds = listOf(
        R.id.photoSlot1, R.id.photoSlot2, R.id.photoSlot3,
        R.id.photoSlot4, R.id.photoSlot5
    )
    private val photoImageIds = listOf(
        R.id.ivPhoto1, R.id.ivPhoto2, R.id.ivPhoto3,
        R.id.ivPhoto4, R.id.ivPhoto5
    )
    private val removeButtonIds = listOf(
        R.id.btnRemovePhoto1, R.id.btnRemovePhoto2, R.id.btnRemovePhoto3,
        R.id.btnRemovePhoto4, R.id.btnRemovePhoto5
    )

    // ── Activity Result Launchers ──────────────────────────────────────────────
    private val cameraLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && cameraOutputUri != null) {
            addPhoto(cameraOutputUri!!)
        }
    }

    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let { addPhoto(it) }
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) launchCamera() else Toast.makeText(
            this, "Camera permission is required to take photos.", Toast.LENGTH_SHORT
        ).show()
    }

    private val galleryPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) galleryLauncher.launch("image/*") else Toast.makeText(
            this, "Storage permission is required to pick photos.", Toast.LENGTH_SHORT
        ).show()
    }

    // ── onCreate ──────────────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.create_report)

        // Guard / site details from the intent
        val guardName = intent.getStringExtra("GUARD_NAME") ?: "Unknown Guard"
        val guardProfileId = intent.getStringExtra("GUARD_ID") ?: ""
        val assignedSite = intent.getStringExtra("ASSIGNED_SITE") ?: "No Site Assigned"
        val assignedSiteId = intent.getStringExtra("ASSIGNED_SITE_ID") ?: ""
        clientId = intent.getStringExtra("CLIENT_ID")?.trim().orEmpty()
        activePatrolLogId = intent.getStringExtra("PATROL_LOG_ID")?.trim().orEmpty()

        // Fallback in case the dashboard was opened before its deployment
        // listener populated CLIENT_ID. The authenticated user profile remains
        // the source of truth for Client Portal scoping.
        auth.currentUser?.uid?.let { uid ->
            db.collection("users")
                .document(uid)
                .get()
                .addOnSuccessListener { userDoc ->
                    if (clientId.isBlank()) {
                        clientId = userDoc.getString("clientId")?.trim().orEmpty()
                    }
                }
        }

        // Bind views
        tvPhotoCount = findViewById(R.id.tvPhotoCount)
        layoutUploadProgress = findViewById(R.id.layoutUploadProgress)
        tvUploadStatus = findViewById(R.id.tvUploadStatus)
        btnSubmitReport = findViewById(R.id.btnSubmitReport)
        etReportTitle = findViewById(R.id.etReportTitle)
        etReportDescription = findViewById(R.id.etReportDescription)
        etIncidentLocation = findViewById(R.id.etIncidentLocation)
        etActionsTaken = findViewById(R.id.etActionsTaken)
        spinnerIncidentType = findViewById(R.id.spinnerIncidentType)

        // Static info fields
        findViewById<TextView>(R.id.tvGuardName).text = guardName
        findViewById<TextView>(R.id.tvAssignedSite).text = assignedSite
        val currentDate = SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date())
        val currentTime = SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())
        val reportId = "RPT-${SimpleDateFormat("yyyyMMdd", Locale.US).format(Date())}-${(100..999).random()}"
        findViewById<TextView>(R.id.tvDate).text = currentDate
        findViewById<TextView>(R.id.tvTime).text = currentTime
        findViewById<TextView>(R.id.tvReportId).text = reportId

        // Incident Type Spinner
        val incidentTypes = arrayOf(
            "Suspicious Activity", "Theft / Robbery", "Vandalism",
            "Trespassing", "Accident / Injury", "Fire / Hazard",
            "Disturbance", "Other"
        )
        val spinnerAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, incidentTypes)
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerIncidentType.adapter = spinnerAdapter
        spinnerIncidentType.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                selectedIncidentType = incidentTypes[pos]
            }
            override fun onNothingSelected(p: AdapterView<*>?) {}
        }

        // Severity buttons
        setupSeverityButtons()

        // Back button
        findViewById<ImageButton>(R.id.btnBack).setOnClickListener { finish() }

        // Add photo button
        findViewById<MaterialCardView>(R.id.btnAddPhoto).setOnClickListener {
            if (selectedPhotos.size >= MAX_PHOTOS) {
                Toast.makeText(this, "Maximum of 5 photos allowed.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            showPhotoSourceDialog()
        }

        // Remove photo buttons
        removeButtonIds.forEachIndexed { index, id ->
            findViewById<ImageButton>(id).setOnClickListener {
                removePhoto(index)
            }
        }

        // Submit
        btnSubmitReport.setOnClickListener {
            val title = etReportTitle.text.toString().trim()
            val description = etReportDescription.text.toString().trim()

            if (title.isEmpty()) {
                etReportTitle.error = "Incident subject is required"
                return@setOnClickListener
            }
            if (description.isEmpty()) {
                etReportDescription.error = "Full description is required"
                return@setOnClickListener
            }
            val firebaseUser = auth.currentUser ?: run {
                Toast.makeText(this, "Session expired. Please log in again.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (assignedSiteId.isBlank()) {
                Toast.makeText(this, "No deployment site found. Ask a supervisor to assign a site.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            btnSubmitReport.isEnabled = false
            btnSubmitReport.text = "Submitting…"

            saveIncidentReport(
                firebaseUid = firebaseUser.uid, guardName = guardName,
                guardProfileId = guardProfileId, siteId = assignedSiteId,
                siteName = assignedSite, date = currentDate, time = currentTime,
                title = title, description = description,
                location = etIncidentLocation.text.toString().trim().ifBlank { assignedSite },
                actionsTaken = etActionsTaken.text.toString().trim(), photoUrls = emptyList()
            )
        }
    }

    // ── Severity ──────────────────────────────────────────────────────────────
    private fun setupSeverityButtons() {
        val severityButtons = mapOf(
            R.id.btnSeverityLow to "Low",
            R.id.btnSeverityMedium to "Medium",
            R.id.btnSeverityHigh to "High",
            R.id.btnSeverityCritical to "Critical"
        )
        val colorMap = mapOf(
            "Low" to R.color.success,
            "Medium" to R.color.warning,
            "High" to R.color.error,
            "Critical" to android.R.color.holo_purple
        )

        fun updateSeverityUI() {
            severityButtons.forEach { (id, label) ->
                val btn = findViewById<MaterialButton>(id)
                val isSelected = label == selectedSeverity
                val color = colorMap[label]!!
                btn.backgroundTintList = if (isSelected)
                    android.content.res.ColorStateList.valueOf(getColor(color).also {})
                else null
                btn.setTextColor(if (isSelected) getColor(android.R.color.white) else getColor(color))
            }
        }

        severityButtons.forEach { (id, label) ->
            findViewById<MaterialButton>(id).setOnClickListener {
                selectedSeverity = label
                updateSeverityUI()
            }
        }
        updateSeverityUI()
    }

    // ── Photo management ──────────────────────────────────────────────────────
    private fun showPhotoSourceDialog() {
        AlertDialog.Builder(this)
            .setTitle("Add Photo Evidence")
            .setItems(arrayOf("📷 Take a Photo", "🖼️ Choose from Gallery")) { _, which ->
                when (which) {
                    0 -> checkCameraAndLaunch()
                    1 -> checkGalleryAndLaunch()
                }
            }
            .show()
    }

    private fun checkCameraAndLaunch() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            launchCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchCamera() {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "SPOT_Incident_${System.currentTimeMillis()}.jpg")
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        }
        cameraOutputUri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        cameraOutputUri?.let { cameraLauncher.launch(it) }
    }

    private fun checkGalleryAndLaunch() {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            Manifest.permission.READ_MEDIA_IMAGES
        else
            Manifest.permission.READ_EXTERNAL_STORAGE

        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) {
            galleryLauncher.launch("image/*")
        } else {
            galleryPermissionLauncher.launch(permission)
        }
    }

    private fun addPhoto(uri: Uri) {
        if (selectedPhotos.size >= MAX_PHOTOS) return
        selectedPhotos.add(uri)
        refreshPhotoSlots()
    }

    private fun removePhoto(index: Int) {
        if (index < selectedPhotos.size) {
            selectedPhotos.removeAt(index)
            refreshPhotoSlots()
        }
    }

    private fun refreshPhotoSlots() {
        tvPhotoCount.text = "${selectedPhotos.size} / $MAX_PHOTOS"

        photoSlotIds.forEachIndexed { idx, slotId ->
            val slot = findViewById<MaterialCardView>(slotId)
            val iv = findViewById<ImageView>(photoImageIds[idx])

            if (idx < selectedPhotos.size) {
                slot.visibility = View.VISIBLE
                iv.setImageURI(selectedPhotos[idx])
            } else {
                slot.visibility = View.GONE
                iv.setImageURI(null)
            }
        }

        // Hide Add Photo button if at max
        findViewById<MaterialCardView>(R.id.btnAddPhoto).visibility =
            if (selectedPhotos.size >= MAX_PHOTOS) View.GONE else View.VISIBLE
    }

    // ── Upload photos then submit ──────────────────────────────────────────────
    private fun saveIncidentReport(
        firebaseUid: String,
        guardName: String,
        guardProfileId: String,
        siteId: String,
        siteName: String,
        date: String,
        time: String,
        title: String,
        description: String,
        location: String,
        actionsTaken: String,
        photoUrls: List<String>,
        incidentIdOverride: String? = null
    ) {
        val incidentRef = if (incidentIdOverride != null)
            db.collection("incidents").document(incidentIdOverride)
        else
            db.collection("incidents").document()

        val incident = hashMapOf<String, Any>(
            "incidentId" to incidentRef.id,
            "title" to title,
            "description" to description,
            "incidentType" to selectedIncidentType,
            "priority" to selectedSeverity,
            "severity" to selectedSeverity,
            "status" to "Investigating",
            "siteId" to siteId,
            "siteName" to siteName,
            "clientId" to clientId,
            "patrolId" to activePatrolLogId,
            "patrolLogId" to activePatrolLogId,
            "location" to location,

            // Guard identity
            "guardId" to firebaseUid,
            "reporterId" to firebaseUid,
            "reporterName" to guardName,
            "guardName" to guardName,
            "badgeId" to guardProfileId.ifBlank { firebaseUid },
            "assignedSite" to siteName,

            // Timing
            "date" to date,
            "time" to time,
            "actionsTaken" to actionsTaken.ifBlank { "Pending supervisor review." },

            // Photos — array of download URLs
            "photoUrls" to photoUrls,
            "photoCount" to photoUrls.size,

            "source" to "mobile_guard_app",
            "createdAt" to Timestamp.now(),
            "deviceTimestamp" to Timestamp.now()
        )

        val photos = selectedPhotos.toList()
        tvUploadStatus.text = "Saving report on this phone..."
        layoutUploadProgress.visibility = View.VISIBLE
        Tasks.call(OfflinePatrol.io) {
            val directory = File(filesDir, "pending_reports/${incidentRef.id}")
            check(directory.mkdirs() || directory.isDirectory) { "Unable to create photo folder" }
            val saved = mutableListOf<File>()
            try {
                photos.forEachIndexed { index, uri ->
                    val file = File(directory, "photo_$index.jpg")
                    saved.add(file)
                    contentResolver.openInputStream(uri)?.use { input ->
                        file.outputStream().use { output -> input.copyTo(output); output.fd.sync() }
                    } ?: error("Cannot read photo ${index + 1}. Please select it again.")
                    check(file.length() in 1 until 10L * 1024 * 1024) { "Each photo must be smaller than 10 MB" }
                }
                check(auth.currentUser?.uid == firebaseUid) { "Account changed. Please submit again." }
                OfflineStore.get(this).put(incidentRef.id, firebaseUid, "report",
                    mapOf("incident" to incident, "photos" to saved.map { it.absolutePath }))
            } catch (error: Exception) {
                saved.forEach { it.delete() }
                directory.delete()
                throw error
            }
            // If scheduling is interrupted, application startup will schedule the durable row.
            OfflinePatrol.schedule(applicationContext)
        }.addOnSuccessListener {
            Toast.makeText(this, "Report saved on this phone. It will sync automatically when connected.", Toast.LENGTH_LONG).show()
            finish()
        }.addOnFailureListener { error ->
            btnSubmitReport.isEnabled = true
            btnSubmitReport.text = "Submit Official Report"
            layoutUploadProgress.visibility = View.GONE
            Toast.makeText(this, "Could not save report: ${error.localizedMessage}", Toast.LENGTH_LONG).show()
        }
    }
}
