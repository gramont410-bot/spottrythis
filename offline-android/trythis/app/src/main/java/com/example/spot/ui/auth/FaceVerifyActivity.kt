package com.example.spot.ui.auth

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.spot.R
import com.example.spot.attendance.AttendanceRepository
import com.example.spot.ui.guard.GuardDashboardActivity
import com.example.spot.ui.login.LoginActivity
import com.example.spot.ui.supervisor.SupervisorDashboardActivity
import com.google.firebase.auth.FirebaseAuth
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

    private val auth by lazy { FirebaseAuth.getInstance() }
    private val db by lazy { FirebaseFirestore.getInstance() }

    private var verificationRole: String = ""
    private var verificationName: String = ""
    private var verificationUserId: String = ""
    private var verificationSiteId: String = ""
    private var verificationClientId: String = ""

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

        verificationRole = intent.getStringExtra("USER_ROLE")?.trim()?.lowercase().orEmpty()
        verificationName = intent.getStringExtra("GUARD_NAME")
            ?: intent.getStringExtra("SUPERVISOR_NAME")
                    ?: ""
        verificationUserId = intent.getStringExtra("USER_ID")
            ?: auth.currentUser?.uid
                    ?: ""
        verificationSiteId = intent.getStringExtra("ASSIGNED_SITE_ID")?.trim().orEmpty()
        verificationClientId = intent.getStringExtra("CLIENT_ID")?.trim().orEmpty()

        val isLogoutMode = intent.getBooleanExtra("IS_LOGOUT_MODE", false)
        val isPatrolMode = intent.getBooleanExtra("IS_PATROL_MODE", false)

        when {
            isLogoutMode -> tvInstructions.text = "Security Check: Log Out"
            isPatrolMode -> tvInstructions.text = "Patrol Verification: Start Shift"
            else -> tvInstructions.text = "Biometric Time-In"
        }

        if (verificationRole == "guard" &&
            (auth.currentUser == null || auth.currentUser?.uid != verificationUserId)) {
            returnToLogin("Sign in to the guard account before verifying attendance.")
            return
        }

        if (verificationUserId.isBlank()) {
            returnToLogin("Your login session could not be verified. Please sign in again.")
            return
        }

        fetchRegisteredFaceData(verificationUserId) { success ->
            if (success) {
                if (allPermissionsGranted()) {
                    startCamera(
                        verificationRole,
                        verificationName,
                        verificationUserId,
                        verificationSiteId
                    )
                } else {
                    ActivityCompat.requestPermissions(
                        this,
                        arrayOf(Manifest.permission.CAMERA),
                        1001
                    )
                }
            } else {
                returnToLogin(
                    "Face ID is not available for this account. Please complete face enrollment or ask the supervisor to reset it."
                )
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
            try {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(viewFinder.surfaceProvider)
                }
                val analyzer = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                analyzer.setAnalyzer(cameraExecutor) { imageProxy ->
                    processImageProxy(imageProxy, role, name, id, siteId)
                }

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview,
                    analyzer
                )
            } catch (e: Exception) {
                android.util.Log.e("FACE_VERIFY", "Unable to start front camera", e)
                returnToLogin(
                    "Unable to start the face-verification camera: ${e.localizedMessage ?: "camera unavailable"}"
                )
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

    private data class SessionContext(
        val siteId: String,
        val siteName: String,
        val clientId: String
    )

    private fun handleVerificationSuccess(
        role: String,
        name: String,
        id: String,
        siteId: String
    ) {
        val isLogoutMode = intent.getBooleanExtra("IS_LOGOUT_MODE", false)
        val isPatrolMode = intent.getBooleanExtra("IS_PATROL_MODE", false)

        if (isLogoutMode) {
            val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
            val shiftId = sharedPref.getString("CURRENT_SHIFT_ID", "") ?: ""
            recordTimeOut(shiftId)
            return
        }

        // Do not depend on client_sites/{siteId}. The current web app stores the
        // authoritative deployment on users/{uid}, and some sites live in /sites.
        // Reading users/{uid} also gives us clientId for Client Portal filtering.
        loadSessionContext(id, siteId) { context ->
            if (isPatrolMode) {
                saveUserSession(
                    userId = id,
                    role = role,
                    name = name,
                    siteId = context.siteId,
                    shiftId = "",
                    siteName = context.siteName,
                    clientId = context.clientId
                )

                Toast.makeText(this, "Patrol Verified!", Toast.LENGTH_SHORT).show()
                proceedToDashboard(
                    role = role,
                    name = name,
                    id = id,
                    siteId = context.siteId,
                    siteName = context.siteName,
                    clientId = context.clientId
                )
            } else {
                if (role == "guard") {
                    recordTimeIn(
                        guardId = id,
                        guardName = name,
                        siteId = context.siteId,
                        siteName = context.siteName,
                        clientId = context.clientId
                    ) { shiftId ->
                        saveUserSession(
                            userId = id,
                            role = role,
                            name = name,
                            siteId = context.siteId,
                            shiftId = shiftId,
                            siteName = context.siteName,
                            clientId = context.clientId
                        )

                        proceedToDashboard(
                            role = role,
                            name = name,
                            id = id,
                            siteId = context.siteId,
                            siteName = context.siteName,
                            clientId = context.clientId
                        )
                    }
                } else {
                    saveUserSession(
                        userId = id,
                        role = role,
                        name = name,
                        siteId = context.siteId,
                        shiftId = "",
                        siteName = context.siteName,
                        clientId = context.clientId
                    )

                    proceedToDashboard(
                        role = role,
                        name = name,
                        id = id,
                        siteId = context.siteId,
                        siteName = context.siteName,
                        clientId = context.clientId
                    )
                }
            }
        }
    }

    private fun loadSessionContext(
        userId: String,
        fallbackSiteId: String,
        callback: (SessionContext) -> Unit
    ) {
        if (userId.isBlank()) {
            callback(
                SessionContext(
                    siteId = fallbackSiteId,
                    siteName = if (fallbackSiteId.isBlank()) "No Site Assigned" else "Assigned Site",
                    clientId = verificationClientId
                )
            )
            return
        }

        db.collection("users")
            .document(userId)
            .get()
            .addOnSuccessListener { userDoc ->
                val resolvedSiteId = (
                        userDoc.getString("assignedSiteId")
                            ?: userDoc.getString("siteId")
                            ?: fallbackSiteId
                        ).trim()

                val resolvedSiteName = userDoc.getString("siteName")
                    ?.trim()
                    .orEmpty()
                    .ifBlank {
                        if (resolvedSiteId.isBlank()) "No Site Assigned" else "Assigned Site"
                    }

                val resolvedClientId = userDoc.getString("clientId")
                    ?.trim()
                    .orEmpty()
                    .ifBlank { verificationClientId }

                callback(
                    SessionContext(
                        siteId = resolvedSiteId,
                        siteName = resolvedSiteName,
                        clientId = resolvedClientId
                    )
                )
            }
            .addOnFailureListener { error ->
                android.util.Log.e("FACE_VERIFY", "Unable to refresh user deployment", error)
                callback(
                    SessionContext(
                        siteId = fallbackSiteId,
                        siteName = if (fallbackSiteId.isBlank()) "No Site Assigned" else "Assigned Site",
                        clientId = verificationClientId
                    )
                )
            }
    }

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

    private fun clearSessionAndExit() {
        val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        sharedPref.edit().clear().apply()
        auth.signOut()

        Toast.makeText(this, "Logged out successfully.", Toast.LENGTH_LONG).show()

        val loginIntent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(loginIntent)
        finish()
    }

    private fun checkLiveness(face: Face) {
        val blinkResult = FaceRecognitionUtils.isBlinkDetected(face, eyesWereOpen)
        eyesWereOpen = blinkResult.nextEyesWereOpen
        if (blinkResult.detected) hasBlinked = true

        if (FaceRecognitionUtils.isSmiling(face)) hasSmiled = true
    }

    private fun fetchRegisteredFaceData(
        userId: String,
        callback: (Boolean) -> Unit
    ) {
        db.collection("users")
            .document(userId)
            .get()
            .addOnSuccessListener { doc ->
                val emb = doc.get("faceEmbedding") as? List<*>
                val numbers = emb
                    ?.mapNotNull { (it as? Number)?.toDouble() }
                    ?: emptyList()

                if (
                    !emb.isNullOrEmpty() &&
                    numbers.size == emb.size
                ) {
                    registeredEmbedding = numbers
                    callback(true)
                } else {
                    callback(false)
                }
            }
            .addOnFailureListener { error ->
                android.util.Log.e("FACE_VERIFY", "Unable to load registered face", error)
                Toast.makeText(
                    this,
                    "Unable to load Face ID: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
                callback(false)
            }
    }

    private fun allPermissionsGranted(): Boolean =
        ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == 1001) {
            if (
                grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            ) {
                startCamera(
                    verificationRole,
                    verificationName,
                    verificationUserId,
                    verificationSiteId
                )
            } else {
                returnToLogin("Camera permission is required for Face ID verification.")
            }
        }
    }

    private fun proceedToDashboard(
        role: String,
        name: String,
        id: String,
        siteId: String,
        siteName: String,
        clientId: String
    ) {
        val normalizedRole = role.trim().lowercase()

        val dashboardIntent = when (normalizedRole) {
            "guard" -> Intent(this, GuardDashboardActivity::class.java).apply {
                putExtra("GUARD_NAME", name)
                putExtra("GUARD_ID", id)
                putExtra("ASSIGNED_SITE_ID", siteId)
                putExtra("SITE_NAME", siteName)
                putExtra("CLIENT_ID", clientId)
            }

            "supervisor",
            "admin",
            "supervisor admin",
            "supervisor_admin",
            "supervisor command officer" -> Intent(
                this,
                SupervisorDashboardActivity::class.java
            ).apply {
                putExtra("SUPERVISOR_NAME", name)
                putExtra("CLIENT_ID", clientId)
            }

            else -> {
                returnToLogin("This account role is not supported by the mobile app.")
                return
            }
        }

        dashboardIntent.flags =
            Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TASK

        startActivity(dashboardIntent)
        finish()
    }

    private fun returnToLogin(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()

        val loginIntent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        startActivity(loginIntent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()

        if (::faceDetector.isInitialized) {
            try {
                faceDetector.close()
            } catch (_: Exception) {
            }
        }

        if (::cameraExecutor.isInitialized) {
            cameraExecutor.shutdown()
        }
    }
}
