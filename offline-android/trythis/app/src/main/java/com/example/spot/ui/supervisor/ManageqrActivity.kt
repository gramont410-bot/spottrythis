package com.example.spot.ui.supervisor

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.text.InputType
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R
import com.example.spot.ui.guard.PortraitCaptureActivity
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeEncoder
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.io.OutputStream
import java.util.Locale

/**
 * Supervisor/Admin QR placement screen.
 *
 * This activity DOES NOT create a second QR database.
 * It loads the same top-level `checkpoints` collection used by:
 *
 *   - the supervisor web app
 *   - GuardDashboardActivity
 *   - ScanCheckpointActivity
 *
 * Physical placement flow:
 *
 *   1. QR is generated/assigned by the supervisor.
 *   2. Supervisor physically places the printed QR.
 *   3. Supervisor opens this screen and scans that same QR.
 *   4. S.P.O.T. captures a fresh high-accuracy GPS position.
 *   5. Coordinates + allowed radius are saved into checkpoints/{id}.
 *
 * Guard scans are later rejected when the guard is outside the saved radius.
 */
class ManageqrActivity : AppCompatActivity() {

    private val db =
        FirebaseFirestore.getInstance()

    private val auth =
        FirebaseAuth.getInstance()

    private lateinit var rvLocations:
            RecyclerView

    private lateinit var fusedLocationClient:
            FusedLocationProviderClient

    private var checkpointListener:
            ListenerRegistration? = null

    private var siteId:
            String = ""

    private var siteName:
            String = ""

    private var pendingSpecificCheckpoint:
            LocationTag? = null

    private var pendingGpsCheckpoint:
            LocationTag? = null

    private val LOCATION_PERMISSION_REQUEST_CODE =
        1003

    private val barcodeLauncher =
        registerForActivityResult(
            ScanContract()
        ) { result ->

            val scannedValue =
                result.contents
                    ?.trim()

            if (
                scannedValue.isNullOrBlank()
            ) {
                pendingSpecificCheckpoint =
                    null

                Toast.makeText(
                    this,
                    "QR scan cancelled.",
                    Toast.LENGTH_SHORT
                ).show()

                return@registerForActivityResult
            }

            resolveScannedCheckpoint(
                scannedValue
            )
        }


    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(
            savedInstanceState
        )

        setContentView(
            R.layout.activity_manage_qr
        )

        fusedLocationClient =
            LocationServices
                .getFusedLocationProviderClient(
                    this
                )

        siteId =
            intent.getStringExtra(
                "SITE_ID"
            )
                ?.trim()
                .orEmpty()

        siteName =
            intent.getStringExtra(
                "SITE_NAME"
            )
                ?.trim()
                .orEmpty()

        val btnBack =
            findViewById<ImageButton>(
                R.id.btnBackFromQR
            )

        val btnScanPlacement =
            findViewById<FloatingActionButton>(
                R.id.btnAddLocation
            )

        val tvHeader =
            findViewById<TextView>(
                R.id.tvHeader
            )

        rvLocations =
            findViewById(
                R.id.rvLocationTags
            )

        rvLocations.layoutManager =
            LinearLayoutManager(
                this
            )

        tvHeader.text =
            if (
                siteName.isBlank()
            ) {
                "QR Location Setup"
            } else {
                "$siteName • QR Setup"
            }

        btnBack.setOnClickListener {
            onBackPressedDispatcher
                .onBackPressed()
        }

        // Global scanner:
        // Scan any printed QR at this site and register its physical location.
        btnScanPlacement.setOnClickListener {
            pendingSpecificCheckpoint =
                null

            launchPlacementScanner()
        }

        if (
            siteId.isBlank()
        ) {
            Toast.makeText(
                this,
                "Site information is missing.",
                Toast.LENGTH_LONG
            ).show()

            finish()
            return
        }

        verifySupervisorAccess()
    }


    private fun verifySupervisorAccess() {

        val uid =
            auth.currentUser
                ?.uid
                ?.trim()
                .orEmpty()

        if (
            uid.isBlank()
        ) {
            Toast.makeText(
                this,
                "Your session has expired. Please sign in again.",
                Toast.LENGTH_LONG
            ).show()

            finish()
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
                    user ->

                val role =
                    user.getString(
                        "role"
                    )
                        ?.trim()
                        ?.lowercase(
                            Locale.US
                        )
                        .orEmpty()

                val allowed =
                    role in setOf(
                        "superadmin",
                        "super admin",
                        "supervisor",
                        "admin",
                        "supervisor admin",
                        "supervisor_admin",
                        "supervisor command officer"
                    )

                if (
                    !allowed
                ) {
                    Toast.makeText(
                        this,
                        "Only supervisor/admin accounts can register checkpoint locations.",
                        Toast.LENGTH_LONG
                    ).show()

                    finish()
                    return@addOnSuccessListener
                }

                listenForCheckpoints()
            }
            .addOnFailureListener {
                    error ->

                Toast.makeText(
                    this,
                    "Unable to verify supervisor access: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()

                finish()
            }
    }


    /**
     * Current source of truth = top-level checkpoints.
     * This keeps mobile admin, web supervisor and guard scanner synchronized.
     */
    private fun listenForCheckpoints() {

        checkpointListener
            ?.remove()

        checkpointListener =
            db.collection(
                "checkpoints"
            )
                .addSnapshotListener {
                        snapshots,
                        error ->

                    if (
                        error != null
                    ) {
                        Toast.makeText(
                            this,
                            "Unable to load checkpoints: ${error.localizedMessage}",
                            Toast.LENGTH_LONG
                        ).show()

                        return@addSnapshotListener
                    }

                    // IMPORTANT:
                    // Older/mobile site records and newer web site records can
                    // represent the same site with different document IDs.
                    // Therefore we load the checkpoints and match the selected
                    // site by canonical siteId OR siteName.
                    val list =
                        snapshots
                            ?.documents
                            ?.filter {
                                    document ->

                                checkpointBelongsToOpenedSite(
                                    document
                                )
                            }
                            ?.map {
                                    document ->

                                val latitude =
                                    document.getDouble(
                                        "latitude"
                                    )
                                        ?: document.getDouble(
                                            "lat"
                                        )

                                val longitude =
                                    document.getDouble(
                                        "longitude"
                                    )
                                        ?: document.getDouble(
                                            "lng"
                                        )
                                        ?: document.getDouble(
                                            "long"
                                        )

                                val registered =
                                    (
                                            document.getBoolean(
                                                "locationRegistered"
                                            )
                                                ?: document.getBoolean(
                                                    "isRegistered"
                                                )
                                                ?: false
                                            ) &&
                                            latitude != null &&
                                            longitude != null

                                val qrValue =
                                    document.getString(
                                        "qrPayload"
                                    )
                                        ?: document.getString(
                                            "qrCode"
                                        )
                                        ?: document.id

                                LocationTag(
                                    id =
                                        document.id,

                                    name =
                                        document.getString(
                                            "name"
                                        )
                                            ?: "Checkpoint",

                                    qrValue =
                                        qrValue,

                                    lat =
                                        latitude,

                                    long =
                                        longitude,

                                    lng =
                                        longitude,

                                    latitude =
                                        latitude,

                                    longitude =
                                        longitude,

                                    isRegistered =
                                        registered,

                                    locationRegistered =
                                        registered,

                                    locationAccuracyMeters =
                                        document.getDouble(
                                            "locationAccuracyMeters"
                                        ),

                                    geofenceRadiusMeters =
                                        (
                                                document.getDouble(
                                                    "geofenceRadiusMeters"
                                                )
                                                    ?: DEFAULT_GEOFENCE_RADIUS_METERS
                                                )
                                            .coerceIn(
                                                MIN_RADIUS_METERS,
                                                MAX_RADIUS_METERS
                                            )
                                )
                            }
                            ?.sortedBy {
                                it.name
                                    .lowercase(
                                        Locale.US
                                    )
                            }
                            ?: emptyList()

                    rvLocations.adapter =
                        LocationAdapter(
                            list,
                            onEdit = {
                                    tag ->

                                showRadiusDialog(
                                    tag
                                )
                            },
                            onPrint = {
                                    tag ->

                                showPrintDialog(
                                    tag
                                )
                            },
                            onSync = {
                                    tag ->

                                // For a specific row, the supervisor must scan
                                // THAT QR before S.P.O.T. captures GPS.
                                pendingSpecificCheckpoint =
                                    tag

                                launchPlacementScanner()
                            }
                        )
                }
    }


    /**
     * Compatibility matcher for the same real site represented by different
     * historical Firestore document IDs.
     *
     * Prefer siteId. If the IDs differ, fall back to an exact normalized
     * siteName match so older `client_sites` records can still open QR
     * checkpoints created by the web `sites` collection.
     */
    private fun checkpointBelongsToOpenedSite(
        document: com.google.firebase.firestore.DocumentSnapshot
    ): Boolean {

        val checkpointSiteId =
            document.getString(
                "siteId"
            )
                ?.trim()
                .orEmpty()

        if (
            checkpointSiteId.isNotBlank() &&
            siteId.isNotBlank() &&
            checkpointSiteId ==
            siteId
        ) {
            return true
        }

        val checkpointSiteName =
            document.getString(
                "siteName"
            )
                ?.trim()
                .orEmpty()

        return checkpointSiteName.isNotBlank() &&
                siteName.isNotBlank() &&
                checkpointSiteName.equals(
                    siteName.trim(),
                    ignoreCase = true
                )
    }


    private fun launchPlacementScanner() {

        val options =
            ScanOptions()
                .apply {
                    setCaptureActivity(
                        PortraitCaptureActivity::class.java
                    )

                    setDesiredBarcodeFormats(
                        ScanOptions.QR_CODE
                    )

                    setPrompt(
                        "Scan the QR at its physical placement location"
                    )

                    setCameraId(
                        0
                    )

                    setBeepEnabled(
                        true
                    )

                    setBarcodeImageEnabled(
                        false
                    )

                    setOrientationLocked(
                        false
                    )
                }

        barcodeLauncher.launch(
            options
        )
    }


    private fun resolveScannedCheckpoint(
        scannedValue: String
    ) {

        db.collection(
            "checkpoints"
        )
            .get()
            .addOnSuccessListener {
                    snapshots ->

                // Resolve the QR FIRST, then verify which site the checkpoint
                // belongs to. The previous implementation filtered by siteId
                // before matching the QR, which fails when the web `sites`
                // document ID and an older Android `client_sites` ID differ.
                val matches =
                    snapshots.documents
                        .filter {
                                document ->

                            document.id ==
                                    scannedValue ||
                                    document.getString(
                                        "qrCode"
                                    )
                                        ?.trim() ==
                                    scannedValue ||
                                    document.getString(
                                        "qrPayload"
                                    )
                                        ?.trim() ==
                                    scannedValue
                        }

                if (
                    matches.isEmpty()
                ) {
                    pendingSpecificCheckpoint =
                        null

                    Toast.makeText(
                        this,
                        "QR not found in the current checkpoints collection.",
                        Toast.LENGTH_LONG
                    ).show()

                    return@addOnSuccessListener
                }

                if (
                    matches.size > 1
                ) {
                    pendingSpecificCheckpoint =
                        null

                    Toast.makeText(
                        this,
                        "Duplicate QR values were found. Fix the checkpoint records first.",
                        Toast.LENGTH_LONG
                    ).show()

                    return@addOnSuccessListener
                }

                val document =
                    matches.first()

                if (
                    !checkpointBelongsToOpenedSite(
                        document
                    )
                ) {
                    pendingSpecificCheckpoint =
                        null

                    val actualSiteName =
                        document.getString(
                            "siteName"
                        )
                            ?.takeIf {
                                it.isNotBlank()
                            }
                            ?: "another site"

                    val actualSiteId =
                        document.getString(
                            "siteId"
                        )
                            ?.takeIf {
                                it.isNotBlank()
                            }
                            ?: "unknown"

                    Toast.makeText(
                        this,
                        "This QR is registered to $actualSiteName (siteId: $actualSiteId), " +
                                "but you opened $siteName (siteId: $siteId).",
                        Toast.LENGTH_LONG
                    ).show()

                    return@addOnSuccessListener
                }

                val expected =
                    pendingSpecificCheckpoint

                if (
                    expected != null &&
                    expected.id !=
                    document.id
                ) {
                    pendingSpecificCheckpoint =
                        null

                    Toast.makeText(
                        this,
                        "Wrong QR. Scan ${expected.name}'s QR code.",
                        Toast.LENGTH_LONG
                    ).show()

                    return@addOnSuccessListener
                }

                val latitude =
                    document.getDouble(
                        "latitude"
                    )
                        ?: document.getDouble(
                            "lat"
                        )

                val longitude =
                    document.getDouble(
                        "longitude"
                    )
                        ?: document.getDouble(
                            "lng"
                        )
                        ?: document.getDouble(
                            "long"
                        )

                val checkpoint =
                    LocationTag(
                        id =
                            document.id,

                        name =
                            document.getString(
                                "name"
                            )
                                ?: "Checkpoint",

                        qrValue =
                            document.getString(
                                "qrPayload"
                            )
                                ?: document.getString(
                                    "qrCode"
                                )
                                ?: document.id,

                        lat =
                            latitude,

                        long =
                            longitude,

                        lng =
                            longitude,

                        latitude =
                            latitude,

                        longitude =
                            longitude,

                        isRegistered =
                            document.getBoolean(
                                "isRegistered"
                            )
                                ?: false,

                        locationRegistered =
                            document.getBoolean(
                                "locationRegistered"
                            )
                                ?: false,

                        locationAccuracyMeters =
                            document.getDouble(
                                "locationAccuracyMeters"
                            ),

                        geofenceRadiusMeters =
                            (
                                    document.getDouble(
                                        "geofenceRadiusMeters"
                                    )
                                        ?: DEFAULT_GEOFENCE_RADIUS_METERS
                                    )
                                .coerceIn(
                                    MIN_RADIUS_METERS,
                                    MAX_RADIUS_METERS
                                )
                    )

                pendingSpecificCheckpoint =
                    null

                requestFreshLocation(
                    checkpoint
                )
            }
            .addOnFailureListener {
                    error ->

                pendingSpecificCheckpoint =
                    null

                Toast.makeText(
                    this,
                    "Unable to verify the QR: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
    }


    private fun requestFreshLocation(
        checkpoint: LocationTag
    ) {

        pendingGpsCheckpoint =
            checkpoint

        if (
            !hasFineLocationPermission()
        ) {
            ActivityCompat
                .requestPermissions(
                    this,
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ),
                    LOCATION_PERMISSION_REQUEST_CODE
                )

            return
        }

        captureFreshLocation(
            checkpoint
        )
    }


    private fun captureFreshLocation(
        checkpoint: LocationTag
    ) {

        if (
            !hasFineLocationPermission()
        ) {
            requestFreshLocation(
                checkpoint
            )
            return
        }

        Toast.makeText(
            this,
            "Capturing high-accuracy GPS for ${checkpoint.name}...",
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
                .addOnSuccessListener {
                        location ->

                    if (
                        location == null
                    ) {
                        showGpsRetryDialog(
                            checkpoint,
                            "No GPS fix was received. Make sure Location/GPS is ON."
                        )

                        return@addOnSuccessListener
                    }

                    if (
                        location.accuracy >
                        MAX_REGISTRATION_ACCURACY_METERS
                    ) {
                        showGpsRetryDialog(
                            checkpoint,
                            "GPS accuracy is currently ±${String.format(Locale.US, "%.1f", location.accuracy)}m. " +
                                    "For QR placement, S.P.O.T. requires ±${MAX_REGISTRATION_ACCURACY_METERS.toInt()}m or better."
                        )

                        return@addOnSuccessListener
                    }

                    confirmRegisteredLocation(
                        checkpoint =
                            checkpoint,

                        latitude =
                            location.latitude,

                        longitude =
                            location.longitude,

                        accuracy =
                            location.accuracy.toDouble()
                    )
                }
                .addOnFailureListener {
                        error ->

                    showGpsRetryDialog(
                        checkpoint,
                        "Unable to capture GPS: ${error.localizedMessage}"
                    )
                }

        } catch (
            securityException: SecurityException
        ) {
            requestFreshLocation(
                checkpoint
            )
        }
    }


    private fun showGpsRetryDialog(
        checkpoint: LocationTag,
        message: String
    ) {

        MaterialAlertDialogBuilder(
            this
        )
            .setTitle(
                "GPS Not Accurate Enough"
            )
            .setMessage(
                "$message\n\nStand beside the QR, wait a few seconds, then retry."
            )
            .setPositiveButton(
                "Retry"
            ) {
                    _,
                    _ ->

                captureFreshLocation(
                    checkpoint
                )
            }
            .setNegativeButton(
                "Cancel",
                null
            )
            .show()
    }


    private fun confirmRegisteredLocation(
        checkpoint: LocationTag,
        latitude: Double,
        longitude: Double,
        accuracy: Double
    ) {

        val radius =
            checkpoint
                .geofenceRadiusMeters
                .coerceIn(
                    MIN_RADIUS_METERS,
                    MAX_RADIUS_METERS
                )

        val message =
            buildString {
                append(
                    "Checkpoint: ${checkpoint.name}\n\n"
                )

                append(
                    "Latitude: ${String.format(Locale.US, "%.6f", latitude)}\n"
                )

                append(
                    "Longitude: ${String.format(Locale.US, "%.6f", longitude)}\n"
                )

                append(
                    "GPS accuracy: ±${String.format(Locale.US, "%.1f", accuracy)}m\n"
                )

                append(
                    "Guard scan radius: ${radius.toInt()}m\n\n"
                )

                append(
                    "Save this as the physical QR location?"
                )
            }

        MaterialAlertDialogBuilder(
            this
        )
            .setTitle(
                "Register QR Location"
            )
            .setMessage(
                message
            )
            .setPositiveButton(
                "Save Location"
            ) {
                    _,
                    _ ->

                saveRegisteredLocation(
                    checkpoint =
                        checkpoint,

                    latitude =
                        latitude,

                    longitude =
                        longitude,

                    accuracy =
                        accuracy,

                    radius =
                        radius
                )
            }
            .setNegativeButton(
                "Retry GPS"
            ) {
                    _,
                    _ ->

                captureFreshLocation(
                    checkpoint
                )
            }
            .show()
    }


    private fun saveRegisteredLocation(
        checkpoint: LocationTag,
        latitude: Double,
        longitude: Double,
        accuracy: Double,
        radius: Double
    ) {

        val uid =
            auth.currentUser
                ?.uid
                ?.trim()
                .orEmpty()

        if (
            uid.isBlank()
        ) {
            Toast.makeText(
                this,
                "Your session expired. Sign in again.",
                Toast.LENGTH_LONG
            ).show()

            return
        }

        val updates =
            hashMapOf<String, Any>(
                // Current fields
                "latitude" to
                        latitude,

                "longitude" to
                        longitude,

                "locationRegistered" to
                        true,

                "locationAccuracyMeters" to
                        accuracy,

                "geofenceRadiusMeters" to
                        radius,

                "locationRegisteredBy" to
                        uid,

                "locationRegistrationMethod" to
                        "supervisor_qr_scan",

                // Compatibility aliases
                "lat" to
                        latitude,

                "lng" to
                        longitude,

                "long" to
                        longitude,

                "isRegistered" to
                        true,

                "locationRegisteredAt" to
                        FieldValue.serverTimestamp(),

                "updatedAt" to
                        FieldValue.serverTimestamp()
            )

        db.collection(
            "checkpoints"
        )
            .document(
                checkpoint.id
            )
            .update(
                updates
            )
            .addOnSuccessListener {

                pendingGpsCheckpoint =
                    null

                Toast.makeText(
                    this,
                    "${checkpoint.name} location registered. Guards must scan within ${radius.toInt()}m.",
                    Toast.LENGTH_LONG
                ).show()
            }
            .addOnFailureListener {
                    error ->

                Toast.makeText(
                    this,
                    "Unable to save checkpoint location: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
    }


    private fun showRadiusDialog(
        checkpoint: LocationTag
    ) {

        val input =
            EditText(
                this
            ).apply {

                inputType =
                    InputType.TYPE_CLASS_NUMBER or
                            InputType.TYPE_NUMBER_FLAG_DECIMAL

                setText(
                    checkpoint
                        .geofenceRadiusMeters
                        .toInt()
                        .toString()
                )

                hint =
                    "Allowed radius in meters"
            }

        MaterialAlertDialogBuilder(
            this
        )
            .setTitle(
                "Guard Scan Radius"
            )
            .setMessage(
                "Smaller is stricter. For normal phone GPS, 20–30 meters is a practical starting range."
            )
            .setView(
                input
            )
            .setPositiveButton(
                "Save Radius"
            ) {
                    _,
                    _ ->

                val radius =
                    input.text
                        ?.toString()
                        ?.toDoubleOrNull()

                if (
                    radius == null ||
                    radius <
                    MIN_RADIUS_METERS ||
                    radius >
                    MAX_RADIUS_METERS
                ) {
                    Toast.makeText(
                        this,
                        "Enter a radius from ${MIN_RADIUS_METERS.toInt()}m to ${MAX_RADIUS_METERS.toInt()}m.",
                        Toast.LENGTH_LONG
                    ).show()

                    return@setPositiveButton
                }

                db.collection(
                    "checkpoints"
                )
                    .document(
                        checkpoint.id
                    )
                    .update(
                        mapOf(
                            "geofenceRadiusMeters" to
                                    radius,

                            "updatedAt" to
                                    FieldValue.serverTimestamp()
                        )
                    )
                    .addOnFailureListener {
                            error ->

                        Toast.makeText(
                            this,
                            "Unable to update radius: ${error.localizedMessage}",
                            Toast.LENGTH_LONG
                        ).show()
                    }
            }
            .setNegativeButton(
                "Cancel",
                null
            )
            .show()
    }


    private fun showPrintDialog(
        checkpoint: LocationTag
    ) {

        val qrImageView =
            ImageView(
                this
            )

        val params =
            LinearLayout.LayoutParams(
                600,
                720
            )

        qrImageView.layoutParams =
            params

        qrImageView.setPadding(
            16,
            16,
            16,
            16
        )

        var finalBitmap:
                Bitmap? = null

        try {
            val rawBitmap =
                BarcodeEncoder()
                    .encodeBitmap(
                        checkpoint.qrValue
                            .ifBlank {
                                checkpoint.id
                            },
                        BarcodeFormat.QR_CODE,
                        600,
                        600
                    )

            finalBitmap =
                generateQrCodeWithLabel(
                    rawBitmap,
                    checkpoint.name
                )

            qrImageView.setImageBitmap(
                finalBitmap
            )

        } catch (
            error: Exception
        ) {
            Toast.makeText(
                this,
                "Unable to generate QR preview: ${error.localizedMessage}",
                Toast.LENGTH_LONG
            ).show()

            return
        }

        MaterialAlertDialogBuilder(
            this
        )
            .setTitle(
                "QR Code Preview"
            )
            .setView(
                qrImageView
            )
            .setPositiveButton(
                "Save to Gallery"
            ) {
                    _,
                    _ ->

                finalBitmap
                    ?.let {
                        saveQrCodeToGallery(
                            this,
                            it,
                            checkpoint.name
                        )
                    }
            }
            .setNegativeButton(
                "Close",
                null
            )
            .show()
    }


    private fun generateQrCodeWithLabel(
        qrCodeBitmap: Bitmap,
        labelText: String
    ): Bitmap {

        val padding =
            30

        val textHeight =
            90

        val width =
            qrCodeBitmap.width +
                    (
                            padding *
                                    2
                            )

        val height =
            qrCodeBitmap.height +
                    textHeight +
                    (
                            padding *
                                    2
                            )

        val combinedBitmap =
            Bitmap.createBitmap(
                width,
                height,
                Bitmap.Config.ARGB_8888
            )

        val canvas =
            Canvas(
                combinedBitmap
            )

        canvas.drawColor(
            Color.WHITE
        )

        val textPaint =
            Paint(
                Paint.ANTI_ALIAS_FLAG
            ).apply {
                color =
                    Color.BLACK

                textSize =
                    50f

                textAlign =
                    Paint.Align.CENTER

                isFakeBoldText =
                    true
            }

        canvas.drawText(
            labelText,
            width /
                    2f,
            padding +
                    60f,
            textPaint
        )

        canvas.drawBitmap(
            qrCodeBitmap,
            padding.toFloat(),
            (
                    textHeight +
                            padding
                    ).toFloat(),
            null
        )

        return combinedBitmap
    }


    private fun saveQrCodeToGallery(
        context: Context,
        bitmap: Bitmap,
        qrName: String
    ) {

        val filename =
            "QR_${
                qrName.replace(
                    " ",
                    "_"
                )
            }_${System.currentTimeMillis()}.png"

        val contentValues =
            ContentValues()
                .apply {
                    put(
                        MediaStore.MediaColumns.DISPLAY_NAME,
                        filename
                    )

                    put(
                        MediaStore.MediaColumns.MIME_TYPE,
                        "image/png"
                    )

                    if (
                        Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.Q
                    ) {
                        put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_PICTURES +
                                    "/SpotQRCodes"
                        )

                        put(
                            MediaStore.MediaColumns.IS_PENDING,
                            1
                        )
                    }
                }

        val resolver =
            context.contentResolver

        val collection =
            if (
                Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.Q
            ) {
                MediaStore.Images.Media
                    .getContentUri(
                        MediaStore.VOLUME_EXTERNAL_PRIMARY
                    )
            } else {
                MediaStore.Images.Media
                    .EXTERNAL_CONTENT_URI
            }

        try {
            val imageUri:
                    Uri? =
                resolver.insert(
                    collection,
                    contentValues
                )

            imageUri
                ?.let {
                        uri ->

                    val outputStream:
                            OutputStream? =
                        resolver
                            .openOutputStream(
                                uri
                            )

                    outputStream
                        ?.use {
                                stream ->

                            bitmap.compress(
                                Bitmap.CompressFormat.PNG,
                                100,
                                stream
                            )
                        }

                    if (
                        Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.Q
                    ) {
                        contentValues.clear()

                        contentValues.put(
                            MediaStore.MediaColumns.IS_PENDING,
                            0
                        )

                        resolver.update(
                            uri,
                            contentValues,
                            null,
                            null
                        )
                    }

                    Toast.makeText(
                        context,
                        "Saved to Pictures/SpotQRCodes",
                        Toast.LENGTH_LONG
                    ).show()
                }

        } catch (
            error: Exception
        ) {
            Toast.makeText(
                context,
                "Unable to save QR: ${error.localizedMessage}",
                Toast.LENGTH_LONG
            ).show()
        }
    }


    private fun hasFineLocationPermission():
            Boolean {

        return ContextCompat
            .checkSelfPermission(
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
            pendingGpsCheckpoint
                ?.let {
                    captureFreshLocation(
                        it
                    )
                }

        } else {
            pendingGpsCheckpoint =
                null

            Toast.makeText(
                this,
                "Precise location permission is required to register a QR's physical coordinates.",
                Toast.LENGTH_LONG
            ).show()
        }
    }


    override fun onDestroy() {
        checkpointListener
            ?.remove()

        checkpointListener =
            null

        super.onDestroy()
    }


    companion object {

        private const val DEFAULT_GEOFENCE_RADIUS_METERS =
            30.0

        private const val MIN_RADIUS_METERS =
            10.0

        private const val MAX_RADIUS_METERS =
            100.0

        private const val MAX_REGISTRATION_ACCURACY_METERS =
            30f
    }
}
