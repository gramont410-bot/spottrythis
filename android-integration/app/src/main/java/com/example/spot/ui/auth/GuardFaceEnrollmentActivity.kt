package com.example.spot.ui.auth

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.spot.R
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * First-login biometric enrollment for guards.
 *
 * Security model:
 * 1. Guard first proves account ownership with Firebase email + password.
 * 2. LoginActivity sends a guard here ONLY when users/{uid}.faceEmbedding is empty/missing.
 * 3. The guard performs liveness actions (blink + smile).
 * 4. ML Kit + FaceRecognitionUtils creates the on-device face embedding.
 * 5. The embedding is written to the authenticated guard's users/{uid} profile.
 * 6. The guard is sent to FaceVerifyActivity for the normal verification flow.
 *
 * No password and no raw face photo are stored here.
 */
class GuardFaceEnrollmentActivity : AppCompatActivity() {

    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var faceDetector: FaceDetector

    private lateinit var viewFinder: PreviewView
    private lateinit var viewFillLight: View
    private lateinit var btnToggleLight: ImageButton
    private lateinit var tvLivenessStatus: TextView
    private lateinit var tvInstructions: TextView

    private var isFillLightOn = false
    private var isSaving = false

    // Liveness state
    private var eyesWereOpen = false
    private var hasBlinked = false
    private var hasSmiled = false
    private var stableFrameCount = 0

    private var guardId: String = ""
    private var guardName: String = "Guard"
    private var assignedSiteId: String = ""

    private val cameraPermissionRequestCode = 2102

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(
            R.layout.activity_face_verify
        )

        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        auth =
            FirebaseAuth.getInstance()

        db =
            FirebaseFirestore.getInstance()

        guardId =
            auth.currentUser?.uid
                ?: intent.getStringExtra("USER_ID")
                ?: ""

        guardName =
            intent.getStringExtra("GUARD_NAME")
                ?: "Guard"

        assignedSiteId =
            intent.getStringExtra("ASSIGNED_SITE_ID")
                ?: ""

        if (guardId.isBlank()) {
            Toast.makeText(
                this,
                "Your login session expired. Please sign in again.",
                Toast.LENGTH_LONG
            ).show()

            auth.signOut()
            finish()
            return
        }

        viewFinder =
            findViewById(
                R.id.viewFinder
            )

        viewFillLight =
            findViewById(
                R.id.viewFillLight
            )

        btnToggleLight =
            findViewById(
                R.id.btnToggleLight
            )

        tvLivenessStatus =
            findViewById(
                R.id.tvLivenessStatus
            )

        tvInstructions =
            findViewById(
                R.id.tvInstructions
            )

        cameraExecutor =
            Executors.newSingleThreadExecutor()

        faceDetector =
            FaceDetection.getClient(
                FaceRecognitionUtils.detectorOptions()
            )

        tvInstructions.text =
            "First-Time Face Registration"

        tvLivenessStatus.text =
            "Checking your guard account..."

        btnToggleLight.setOnClickListener {
            toggleFillLight()
        }

        // Do not allow the first-login face step to be bypassed with Back.
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {

                    auth.signOut()

                    Toast.makeText(
                        this@GuardFaceEnrollmentActivity,
                        "Face registration is required before using the guard app.",
                        Toast.LENGTH_LONG
                    ).show()

                    finishAffinity()
                }
            }
        )

        validateGuardAndStart()
    }

    /**
     * Re-check Firestore before opening the camera.
     *
     * This protects against accidentally enrolling a face into a non-guard
     * account and avoids overwriting an existing mobile biometric template.
     */
    private fun validateGuardAndStart() {

        db.collection("users")
            .document(guardId)
            .get()
            .addOnSuccessListener { document ->

                if (!document.exists()) {

                    failAndSignOut(
                        "Your S.P.O.T. guard profile could not be found."
                    )

                    return@addOnSuccessListener
                }

                val role =
                    document.getString("role")
                        ?.trim()
                        ?.lowercase()
                        .orEmpty()

                if (role != "guard") {

                    failAndSignOut(
                        "Only guard accounts can use first-time face registration."
                    )

                    return@addOnSuccessListener
                }

                val active =
                    document.getBoolean("active")

                if (active == false) {

                    failAndSignOut(
                        "This guard account is inactive."
                    )

                    return@addOnSuccessListener
                }

                guardName =
                    document.getString("fullName")
                        ?: document.getString("name")
                        ?: guardName

                assignedSiteId =
                    document.getString("assignedSiteId")
                        ?: document.getString("siteId")
                        ?: assignedSiteId

                val rawEmbedding =
                    document.get("faceEmbedding") as? List<*>

                // If an embedding already exists, do NOT overwrite it from
                // the first-login enrollment screen.
                if (!rawEmbedding.isNullOrEmpty()) {

                    if (rawEmbedding.all { it is Number }) {

                        Toast.makeText(
                            this,
                            "Face ID is already registered. Starting verification.",
                            Toast.LENGTH_SHORT
                        ).show()

                        openNormalFaceVerification()
                    } else {

                        failAndSignOut(
                            "Existing face data is invalid. Ask a supervisor to reset your Face ID."
                        )
                    }

                    return@addOnSuccessListener
                }

                tvLivenessStatus.text =
                    "Align one face inside the guide"

                if (allPermissionsGranted()) {

                    startCameraForEnrollment()

                } else {

                    ActivityCompat.requestPermissions(
                        this,
                        arrayOf(
                            android.Manifest.permission.CAMERA
                        ),
                        cameraPermissionRequestCode
                    )
                }
            }
            .addOnFailureListener { error ->

                failAndSignOut(
                    "Unable to load your guard profile: ${error.localizedMessage}"
                )
            }
    }

    private fun toggleFillLight() {

        isFillLightOn =
            !isFillLightOn

        viewFillLight.visibility =
            if (isFillLightOn) {
                View.VISIBLE
            } else {
                View.GONE
            }

        val layoutParams =
            window.attributes

        layoutParams.screenBrightness =
            if (isFillLightOn) {
                1.0f
            } else {
                WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            }

        window.attributes =
            layoutParams
    }

    private fun allPermissionsGranted(): Boolean {

        return ContextCompat.checkSelfPermission(
            baseContext,
            android.Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startCameraForEnrollment() {

        tvInstructions.text =
            "Register Your Face"

        tvLivenessStatus.text =
            "Step 1: Look at the camera"

        val cameraProviderFuture =
            ProcessCameraProvider.getInstance(
                this
            )

        cameraProviderFuture.addListener(
            {

                try {

                    val cameraProvider =
                        cameraProviderFuture.get()

                    val preview =
                        Preview.Builder()
                            .build()
                            .also {
                                it.setSurfaceProvider(
                                    viewFinder.surfaceProvider
                                )
                            }

                    val analyzer =
                        ImageAnalysis.Builder()
                            .setBackpressureStrategy(
                                ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
                            )
                            .build()

                    analyzer.setAnalyzer(
                        cameraExecutor
                    ) { imageProxy ->

                        processEnrollmentFrame(
                            imageProxy
                        )
                    }

                    cameraProvider.unbindAll()

                    cameraProvider.bindToLifecycle(
                        this,
                        CameraSelector.DEFAULT_FRONT_CAMERA,
                        preview,
                        analyzer
                    )

                } catch (error: Exception) {

                    Toast.makeText(
                        this,
                        "Unable to start the camera: ${error.localizedMessage}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            },
            ContextCompat.getMainExecutor(
                this
            )
        )
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processEnrollmentFrame(
        imageProxy: ImageProxy
    ) {

        val mediaImage =
            imageProxy.image

        if (
            mediaImage == null ||
            isSaving
        ) {
            imageProxy.close()
            return
        }

        val image =
            InputImage.fromMediaImage(
                mediaImage,
                imageProxy.imageInfo.rotationDegrees
            )

        faceDetector.process(
            image
        )
            .addOnSuccessListener { faces ->

                if (faces.size != 1) {

                    stableFrameCount = 0

                    runOnUiThread {

                        tvLivenessStatus.text =
                            if (faces.isEmpty()) {
                                "No face detected"
                            } else {
                                "Only one face should be visible"
                            }
                    }

                    return@addOnSuccessListener
                }

                val face =
                    faces[0]

                val faceRatio =
                    face.boundingBox.width()
                        .toFloat() /
                        mediaImage.height
                            .toFloat()

                val quality =
                    FaceRecognitionUtils.checkQuality(
                        face,
                        faceRatio
                    )

                if (!quality.ok) {

                    stableFrameCount = 0

                    runOnUiThread {

                        tvLivenessStatus.text =
                            quality.message

                        tvLivenessStatus.setTextColor(
                            ContextCompat.getColor(
                                this,
                                android.R.color.holo_orange_dark
                            )
                        )
                    }

                    return@addOnSuccessListener
                }

                checkLiveness(
                    face
                )

                runOnUiThread {
                    updateEnrollmentUi()
                }

                // Require both liveness actions and several stable frames
                // before creating the enrolled biometric template.
                if (
                    hasBlinked &&
                    hasSmiled
                ) {

                    stableFrameCount++

                    if (
                        stableFrameCount >= 5 &&
                        !isSaving
                    ) {

                        val embedding =
                            FaceRecognitionUtils.extractEmbedding(
                                face
                            )

                        if (
                            embedding != null &&
                            embedding.isNotEmpty()
                        ) {

                            isSaving = true

                            runOnUiThread {

                                tvLivenessStatus.text =
                                    "Face captured. Saving Face ID..."

                                tvLivenessStatus.setTextColor(
                                    ContextCompat.getColor(
                                        this,
                                        android.R.color.holo_green_dark
                                    )
                                )
                            }

                            saveFaceEnrollment(
                                embedding
                            )
                        }
                    }
                }

            }
            .addOnFailureListener { error ->

                android.util.Log.e(
                    "GUARD_FACE_ENROLL",
                    "Face detection failed",
                    error
                )
            }
            .addOnCompleteListener {

                imageProxy.close()
            }
    }

    private fun checkLiveness(
        face: Face
    ) {

        val blink =
            FaceRecognitionUtils.isBlinkDetected(
                face,
                eyesWereOpen
            )

        eyesWereOpen =
            blink.nextEyesWereOpen

        if (blink.detected) {
            hasBlinked = true
        }

        if (
            FaceRecognitionUtils.isSmiling(
                face
            )
        ) {
            hasSmiled = true
        }
    }

    private fun updateEnrollmentUi() {

        when {

            !hasBlinked -> {

                tvLivenessStatus.text =
                    "Step 1: Blink your eyes"

                tvLivenessStatus.setTextColor(
                    ContextCompat.getColor(
                        this,
                        android.R.color.holo_blue_light
                    )
                )
            }

            !hasSmiled -> {

                tvLivenessStatus.text =
                    "Step 2: Now smile"

                tvLivenessStatus.setTextColor(
                    ContextCompat.getColor(
                        this,
                        android.R.color.holo_green_light
                    )
                )
            }

            else -> {

                tvLivenessStatus.text =
                    "Perfect. Keep still..."

                tvLivenessStatus.setTextColor(
                    ContextCompat.getColor(
                        this,
                        android.R.color.holo_green_dark
                    )
                )
            }
        }
    }

    /**
     * Saves ONLY the biometric fields for the currently authenticated UID.
     *
     * The password is owned by Firebase Authentication and is never stored
     * in Firestore.
     */
    private fun saveFaceEnrollment(
        embedding: List<Double>
    ) {

        val nowIso =
            isoNow()

        val faceData =
            hashMapOf<String, Any>(
                "faceEmbedding" to embedding,
                "faceVerified" to true,
                "faceVerifiedAt" to nowIso,
                "faceEnrollmentStatus" to "enrolled",
                "faceEnrollmentSource" to "android-first-login",
                "faceDetected" to true,
                "faceDetectorSupported" to true,
                "faceEnrollmentUpdatedAt" to nowIso,
                "faceEnrolledAtServer" to FieldValue.serverTimestamp()
            )

        db.collection("users")
            .document(guardId)
            .update(
                faceData
            )
            .addOnSuccessListener {

                Toast.makeText(
                    this,
                    "Face registration complete. Verify your face to continue.",
                    Toast.LENGTH_LONG
                ).show()

                openNormalFaceVerification()
            }
            .addOnFailureListener { error ->

                isSaving = false
                stableFrameCount = 0

                Toast.makeText(
                    this,
                    if (
                        error.message?.contains(
                            "PERMISSION_DENIED",
                            ignoreCase = true
                        ) == true ||
                        error.message?.contains(
                            "permission",
                            ignoreCase = true
                        ) == true
                    ) {
                        "Firebase blocked first-time Face ID registration. Publish the updated Firestore rules."
                    } else {
                        "Unable to save Face ID: ${error.localizedMessage}"
                    },
                    Toast.LENGTH_LONG
                ).show()
            }
    }

    private fun openNormalFaceVerification() {

        val intent =
            Intent(
                this,
                FaceVerifyActivity::class.java
            ).apply {

                putExtra(
                    "USER_ID",
                    guardId
                )

                putExtra(
                    "USER_ROLE",
                    "guard"
                )

                putExtra(
                    "GUARD_NAME",
                    guardName
                )

                putExtra(
                    "ASSIGNED_SITE_ID",
                    assignedSiteId
                )

                putExtra(
                    "JUST_ENROLLED",
                    true
                )
            }

        startActivity(
            intent
        )

        finish()
    }

    private fun failAndSignOut(
        message: String
    ) {

        auth.signOut()

        Toast.makeText(
            this,
            message,
            Toast.LENGTH_LONG
        ).show()

        finish()
    }

    private fun isoNow(): String {

        return SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            Locale.US
        ).apply {

            timeZone =
                TimeZone.getDefault()

        }.format(
            Date()
        )
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
            cameraPermissionRequestCode
        ) {

            if (
                grantResults.isNotEmpty() &&
                grantResults[0] ==
                PackageManager.PERMISSION_GRANTED
            ) {

                startCameraForEnrollment()

            } else {

                failAndSignOut(
                    "Camera permission is required to register Face ID."
                )
            }
        }
    }

    override fun onDestroy() {

        super.onDestroy()

        try {
            faceDetector.close()
        } catch (_: Exception) {
        }

        if (
            ::cameraExecutor.isInitialized
        ) {
            cameraExecutor.shutdown()
        }
    }
}
