package com.example.spot.ui.auth

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.spot.R
import com.example.spot.ui.guard.GuardDashboardActivity
import com.example.spot.ui.login.LoginActivity
import com.example.spot.ui.supervisor.SupervisorDashboardActivity
import com.google.firebase.firestore.FirebaseFirestore
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class FaceVerifyActivity : AppCompatActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var viewFinder: PreviewView
    private lateinit var viewFillLight: View
    private lateinit var btnToggleLight: ImageButton
    private lateinit var tvLivenessStatus: TextView
    private lateinit var tvInstructions: TextView

    private lateinit var faceDetector: FaceDetector
    
    private var isVerified = false
    private var isFillLightOn = false
    private var registeredEmbedding: List<Double> = emptyList()

    private val allRegisteredGuards = mutableListOf<GuardFaceData>()

    // Liveness State
    private var hasBlinked = false
    private var hasSmiled = false
    private var eyesWereOpen = false
    private var consecutiveMatchCount = 0

    data class GuardFaceData(
        val id: String,
        val name: String,
        val siteId: String,
        val embedding: List<Double>
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Ensure Activity shows over Lock Screen and turns screen on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        setContentView(R.layout.activity_face_verify)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        viewFinder = findViewById(R.id.viewFinder)
        viewFillLight = findViewById(R.id.viewFillLight)
        btnToggleLight = findViewById(R.id.btnToggleLight)
        tvLivenessStatus = findViewById(R.id.tvLivenessStatus)
        tvInstructions = findViewById(R.id.tvInstructions)

        cameraExecutor = Executors.newSingleThreadExecutor()
        faceDetector = FaceDetection.getClient(FaceRecognitionUtils.detectorOptions())

        btnToggleLight.setOnClickListener { toggleFillLight() }

        val userRole = intent.getStringExtra("USER_ROLE") ?: ""
        val fullName = intent.getStringExtra("GUARD_NAME") ?: intent.getStringExtra("SUPERVISOR_NAME") ?: ""
        val userId = intent.getStringExtra("USER_ID") ?: ""
        val siteId = intent.getStringExtra("ASSIGNED_SITE_ID") ?: ""
        val isLogoutMode = intent.getBooleanExtra("IS_LOGOUT_MODE", false)
        val isPatrolMode = intent.getBooleanExtra("IS_PATROL_MODE", false)

        when {
            isLogoutMode -> tvInstructions.text = "Security Check: Log Out"
            isPatrolMode -> tvInstructions.text = "Patrol Verification: Start Shift"
            else -> tvInstructions.text = "Biometric Time-In"
        }

        if (userId.isEmpty() && userRole == "guard") {
            fetchAllGuardsAndStartCamera()
            return
        }

        fetchRegisteredFaceData(userId) { success ->
            if (success) {
                if (allPermissionsGranted()) {
                    startCamera(userRole, fullName, userId, siteId)
                } else {
                    ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1001)
                }
            } else {
                Toast.makeText(this, "Face enrollment is missing or could not be read. Please enroll this guard from the supervisor website again.", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    private fun toggleFillLight() {
        isFillLightOn = !isFillLightOn
        viewFillLight.visibility = if (isFillLightOn) View.VISIBLE else View.GONE
        val lp = window.attributes
        lp.screenBrightness = if (isFillLightOn) 1.0f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        window.attributes = lp
    }

    private fun fetchAllGuardsAndStartCamera() {
        FirebaseFirestore.getInstance().collection("users")
            .whereEqualTo("role", "guard")
            .get()
            .addOnSuccessListener { result ->
                allRegisteredGuards.clear()
                for (doc in result) {
                    val rawEmb = doc.get("faceEmbedding") as? List<*>
                    if (rawEmb != null && rawEmb.isNotEmpty()) {
                        allRegisteredGuards.add(GuardFaceData(
                            doc.id,
                            doc.getString("fullName") ?: "Guard",
                            doc.getString("assignedSiteId") ?: "",
                            rawEmb.map { (it as Number).toDouble() }
                        ))
                    }
                }
                if (allPermissionsGranted()) startCameraForQuickLogin()
            }
    }

    private fun startCamera(role: String, name: String, id: String, siteId: String) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(viewFinder.surfaceProvider) }
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            
            analyzer.setAnalyzer(cameraExecutor) { imageProxy -> 
                processImageProxy(imageProxy, role, name, id, siteId) 
            }
            
            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analyzer)
            } catch (e: Exception) {
                Toast.makeText(this, "Camera error", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun startCameraForQuickLogin() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(viewFinder.surfaceProvider) }
            val analyzer = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analyzer.setAnalyzer(cameraExecutor) { imageProxy -> processQuickLoginImage(imageProxy) }
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analyzer)
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processImageProxy(imageProxy: ImageProxy, role: String, name: String, id: String, siteId: String) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !isVerified) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            
            faceDetector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty()) {
                        val face = faces[0]
                        val faceRatio = face.boundingBox.width().toFloat() / mediaImage.height.toFloat()
                        val quality = FaceRecognitionUtils.checkQuality(face, faceRatio)
                        
                        if (quality.ok) {
                            checkLiveness(face)
                            val liveEmb = FaceRecognitionUtils.extractEmbedding(face)
                            
                            if (liveEmb != null) {
                                val distance = FaceRecognitionUtils.distance(liveEmb, registeredEmbedding)
                                if (distance < FaceRecognitionUtils.MATCH_THRESHOLD) {
                                    consecutiveMatchCount++
                                    
                                    runOnUiThread {
                                        updateLivenessUI()
                                    }

                                    if (consecutiveMatchCount >= FaceRecognitionUtils.REQUIRED_MATCHES && hasBlinked && hasSmiled) {
                                        isVerified = true
                                        runOnUiThread {
                                            handleVerificationSuccess(role, name, id, siteId)
                                        }
                                    }
                                } else {
                                    consecutiveMatchCount = 0
                                    runOnUiThread { 
                                        tvLivenessStatus.text = "Face mismatch"
                                        tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
                                    }
                                }
                            }
                        } else {
                            runOnUiThread { 
                                tvLivenessStatus.text = quality.message
                                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
                            }
                        }
                    } else {
                        runOnUiThread { tvLivenessStatus.text = "No face detected" }
                    }
                }
                .addOnCompleteListener { imageProxy.close() }
        } else imageProxy.close()
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processQuickLoginImage(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !isVerified) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            faceDetector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty()) {
                        val face = faces[0]
                        checkLiveness(face)
                        val liveEmb = FaceRecognitionUtils.extractEmbedding(face)
                        if (liveEmb != null) {
                            var bestMatch: GuardFaceData? = null
                            var minDistance = Double.MAX_VALUE
                            for (guard in allRegisteredGuards) {
                                val dist = FaceRecognitionUtils.distance(liveEmb, guard.embedding)
                                if (dist < FaceRecognitionUtils.MATCH_THRESHOLD && dist < minDistance) {
                                    minDistance = dist
                                    bestMatch = guard
                                }
                            }
                            if (bestMatch != null) {
                                consecutiveMatchCount++
                                runOnUiThread { updateLivenessUI() }
                                if (consecutiveMatchCount >= FaceRecognitionUtils.REQUIRED_MATCHES && hasBlinked && hasSmiled) {
                                    isVerified = true
                                    runOnUiThread {
                                        handleVerificationSuccess("guard", bestMatch.name, bestMatch.id, bestMatch.siteId)
                                    }
                                }
                            } else {
                                consecutiveMatchCount = 0
                                runOnUiThread { tvLivenessStatus.text = "Scanning..." }
                            }
                        }
                    }
                }
                .addOnCompleteListener { imageProxy.close() }
        } else imageProxy.close()
    }

    private fun updateLivenessUI() {
        when {
            !hasBlinked -> {
                tvLivenessStatus.text = "Action: Blink your eyes"
                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_blue_light))
            }
            !hasSmiled -> {
                tvLivenessStatus.text = "Action: Now smile!"
                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_light))
            }
            else -> {
                tvLivenessStatus.text = "Verifying Identity..."
                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
            }
        }
    }

    private fun handleVerificationSuccess(role: String, name: String, id: String, siteId: String) {
        val isLogoutMode = intent.getBooleanExtra("IS_LOGOUT_MODE", false)
        val isPatrolMode = intent.getBooleanExtra("IS_PATROL_MODE", false)

        if (isLogoutMode) {
            val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
            val shiftId = sharedPref.getString("CURRENT_SHIFT_ID", "") ?: ""
            recordTimeOut(shiftId)
        } else if (isPatrolMode) {
            val db = FirebaseFirestore.getInstance()
            db.collection("client_sites").document(siteId).get().addOnSuccessListener { doc ->
                val siteName = doc.getString("siteName") ?: "Assigned Site"
                saveUserSession(id, role, name, siteId, "", siteName)
                
                Toast.makeText(this, "Patrol Verified!", Toast.LENGTH_SHORT).show()
                val intent = Intent(this, GuardDashboardActivity::class.java).apply {
                    putExtra("GUARD_NAME", name)
                    putExtra("GUARD_ID", id)
                    putExtra("ASSIGNED_SITE_ID", siteId)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                startActivity(intent)
                finish()
            }
        } else {
            val db = FirebaseFirestore.getInstance()
            db.collection("client_sites").document(siteId).get().addOnSuccessListener { doc ->
                val siteName = doc.getString("siteName") ?: "Assigned Site"
                
                recordTimeIn(id, name, siteId) { shiftId ->
                    saveUserSession(id, role, name, siteId, shiftId, siteName)
                    proceedToDashboard(role, name, id, siteId)
                }
            }
        }
    }

    private fun saveUserSession(userId: String, role: String, name: String, siteId: String, shiftId: String, siteName: String) {
        val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        sharedPref.edit().apply {
            putString("USER_ID", userId)
            putString("USER_ROLE", role)
            putString("USER_NAME", name)
            putString("SITE_ID", siteId)
            putString("SITE_NAME", siteName)
            putString("SESSION_DATE", today)
            putString("CURRENT_SHIFT_ID", shiftId)
            putBoolean("IS_LOGGED_IN", true)
            apply()
        }
    }

    private fun recordTimeIn(guardId: String, guardName: String, siteId: String, callback: (String) -> Unit) {
        val db = FirebaseFirestore.getInstance()
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val currentTime = SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())

        val attendanceData = hashMapOf(
            "guardId" to guardId,
            "guardName" to guardName,
            "siteId" to siteId,
            "date" to today,
            "timeIn" to currentTime,
            "timeOut" to "",
            "status" to "ON_DUTY"
        )

        db.collection("attendance").add(attendanceData)
            .addOnSuccessListener { ref ->
                callback(ref.id)
            }
            .addOnFailureListener {
                callback("")
            }
    }

    private fun recordTimeOut(shiftId: String) {
        if (shiftId.isEmpty()) {
            clearSessionAndExit()
            return
        }
        val db = FirebaseFirestore.getInstance()
        val currentTime = SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())

        db.collection("attendance").document(shiftId)
            .update("timeOut", currentTime, "status", "SHIFT_ENDED")
            .addOnCompleteListener {
                clearSessionAndExit()
            }
    }

    private fun clearSessionAndExit() {
        val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        sharedPref.edit().clear().apply()
        
        Toast.makeText(this, "Logged out successfully.", Toast.LENGTH_LONG).show()
        val intent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
    }

    private fun checkLiveness(face: Face) {
        val blinkResult = FaceRecognitionUtils.isBlinkDetected(face, eyesWereOpen)
        eyesWereOpen = blinkResult.nextEyesWereOpen
        if (blinkResult.detected) hasBlinked = true
        
        if (FaceRecognitionUtils.isSmiling(face)) hasSmiled = true
    }

    /**
     * Loads the face template used by Android verification.
     *
     * Compatibility order:
     * 1. Legacy Android enrollment: users/{uid}.faceEmbedding
     * 2. New supervisor website enrollment: users/{uid}.facePhoto
     * 3. Website faceProfiles/{uid}.imageDataUrl fallback
     *
     * The supervisor website stores the captured enrollment photo. Android then
     * runs the SAME ML Kit + FaceRecognitionUtils pipeline on that trusted
     * enrollment photo and creates the comparison embedding in memory.
     *
     * We intentionally do not replace the supervisor enrollment photo here.
     */
    private fun fetchRegisteredFaceData(
        userId: String,
        callback: (Boolean) -> Unit
    ) {
        val db = FirebaseFirestore.getInstance()

        db.collection("users")
            .document(userId)
            .get()
            .addOnSuccessListener { doc ->

                if (!doc.exists()) {
                    callback(false)
                    return@addOnSuccessListener
                }

                // ---------------------------------------------------------
                // 1. Existing Android faceEmbedding
                // ---------------------------------------------------------
                val rawEmbedding =
                    doc.get("faceEmbedding") as? List<*>

                val validEmbedding =
                    rawEmbedding
                        ?.takeIf { it.isNotEmpty() }
                        ?.mapNotNull { value ->
                            (value as? Number)?.toDouble()
                        }

                if (
                    validEmbedding != null &&
                    validEmbedding.size == rawEmbedding.size
                ) {
                    registeredEmbedding =
                        validEmbedding

                    callback(true)
                    return@addOnSuccessListener
                }

                // ---------------------------------------------------------
                // 2. New web enrollment stored directly on users/{uid}
                // ---------------------------------------------------------
                val facePhoto =
                    doc.getString("facePhoto")
                        ?.takeIf { it.isNotBlank() }

                if (facePhoto != null) {
                    createEmbeddingFromEnrollmentImage(
                        facePhoto,
                        callback
                    )
                    return@addOnSuccessListener
                }

                // Storage is currently not enabled in this Firebase project,
                // so facePhotoUrl is normally empty. If a data URL is ever
                // stored there, we can still process it.
                val facePhotoUrl =
                    doc.getString("facePhotoUrl")
                        ?.takeIf {
                            it.startsWith("data:")
                        }

                if (facePhotoUrl != null) {
                    createEmbeddingFromEnrollmentImage(
                        facePhotoUrl,
                        callback
                    )
                    return@addOnSuccessListener
                }

                // ---------------------------------------------------------
                // 3. Fallback to faceProfiles/{uid}
                // ---------------------------------------------------------
                db.collection("faceProfiles")
                    .document(userId)
                    .get()
                    .addOnSuccessListener { faceProfile ->

                        val imageDataUrl =
                            faceProfile.getString(
                                "imageDataUrl"
                            )
                                ?.takeIf {
                                    it.isNotBlank()
                                }

                        if (imageDataUrl != null) {
                            createEmbeddingFromEnrollmentImage(
                                imageDataUrl,
                                callback
                            )
                        } else {
                            callback(false)
                        }
                    }
                    .addOnFailureListener {
                        callback(false)
                    }
            }
            .addOnFailureListener {
                callback(false)
            }
    }

    /**
     * Converts the website's base64 enrollment photo into the same landmark
     * embedding used by the Android live camera.
     */
    private fun createEmbeddingFromEnrollmentImage(
        dataUrl: String,
        callback: (Boolean) -> Unit
    ) {
        try {
            val base64Part =
                if (dataUrl.contains(",")) {
                    dataUrl.substringAfter(",")
                } else {
                    dataUrl
                }

            val bytes =
                Base64.decode(
                    base64Part,
                    Base64.DEFAULT
                )

            val bitmap =
                BitmapFactory.decodeByteArray(
                    bytes,
                    0,
                    bytes.size
                )

            if (bitmap == null) {
                callback(false)
                return
            }

            val inputImage =
                InputImage.fromBitmap(
                    bitmap,
                    0
                )

            faceDetector.process(inputImage)
                .addOnSuccessListener { faces ->

                    // Enrollment must represent one guard only.
                    if (faces.size != 1) {
                        callback(false)
                        return@addOnSuccessListener
                    }

                    val embedding =
                        FaceRecognitionUtils.extractEmbedding(
                            faces[0]
                        )

                    if (
                        embedding == null ||
                        embedding.isEmpty()
                    ) {
                        callback(false)
                        return@addOnSuccessListener
                    }

                    registeredEmbedding =
                        embedding

                    callback(true)
                }
                .addOnFailureListener {
                    callback(false)
                }

        } catch (error: Exception) {
            android.util.Log.e(
                "FACE_VERIFY",
                "Unable to create embedding from web enrollment photo",
                error
            )

            callback(false)
        }
    }

    private fun allPermissionsGranted() = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun proceedToDashboard(role: String, name: String, id: String, siteId: String) {
        val intent = when (role) {
            "guard" -> Intent(this, GuardDashboardActivity::class.java).apply {
                putExtra("GUARD_NAME", name)
                putExtra("GUARD_ID", id)
                putExtra("ASSIGNED_SITE_ID", siteId)
            }
            "supervisor" -> Intent(this, SupervisorDashboardActivity::class.java).apply {
                putExtra("SUPERVISOR_NAME", name)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            else -> return
        }
        startActivity(intent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        faceDetector.close()
        cameraExecutor.shutdown()
    }
}
