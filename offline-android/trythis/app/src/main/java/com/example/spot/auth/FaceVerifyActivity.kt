package com.example.spot.auth

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
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
import com.example.spot.ui.guard.GuardDashboardActivity
import com.example.spot.ui.supervisor.SupervisorDashboardActivity
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.pow
import kotlin.math.sqrt

class FaceVerifyActivity : AppCompatActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var viewFinder: PreviewView
    private lateinit var viewFillLight: View
    private lateinit var btnToggleLight: ImageButton
    private lateinit var tvLivenessStatus: TextView
    private lateinit var tvInstructions: TextView

    private var isVerified = false
    private var registeredEmbedding: List<Double> = emptyList()
    private var isFillLightOn = false

    private val allRegisteredGuards = mutableListOf<GuardFaceData>()

    // Liveness Detection State
    private var hasBlinked = false
    private var eyesWereOpen = false

    data class GuardFaceData(
        val id: String,
        val name: String,
        val siteId: String,
        val embedding: List<Double>
    )

    private val CAMERA_PERMISSION_REQUEST_CODE = 1001
    private var consecutiveMatchCount = 0
    private var unknownFrameCount = 0
    private var lastToastTime = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_face_verify)

        viewFinder = findViewById(R.id.viewFinder)
        viewFillLight = findViewById(R.id.viewFillLight)
        btnToggleLight = findViewById(R.id.btnToggleLight)
        tvLivenessStatus = findViewById(R.id.tvLivenessStatus)
        tvInstructions = findViewById(R.id.tvInstructions)

        cameraExecutor = Executors.newSingleThreadExecutor()

        btnToggleLight.setOnClickListener {
            toggleFillLight()
        }

        val userRole = intent.getStringExtra("USER_ROLE") ?: ""
        val fullName = intent.getStringExtra("GUARD_NAME") ?: intent.getStringExtra("SUPERVISOR_NAME") ?: ""
        val userId = intent.getStringExtra("USER_ID") ?: ""
        val siteId = intent.getStringExtra("ASSIGNED_SITE_ID") ?: ""

        if (userId.isEmpty() && userRole == "guard") {
            fetchAllGuardsAndStartCamera()
            return
        }

        if (userRole == "supervisor" || userId == "sup101") {
            Toast.makeText(this, "Welcome Supervisor, $fullName!", Toast.LENGTH_SHORT).show()
            proceedToDashboard(userRole, fullName, userId, siteId)
            return
        }

        fetchRegisteredFaceData(userId) { success ->
            if (success) {
                if (allPermissionsGranted()) {
                    startCamera(userRole, fullName, userId, siteId)
                } else {
                    ActivityCompat.requestPermissions(
                        this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST_CODE
                    )
                }
            } else {
                Toast.makeText(this, "No Face ID found for this account.", Toast.LENGTH_LONG).show()
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
        val db = FirebaseFirestore.getInstance()
        db.collection("users")
            .whereEqualTo("role", "guard")
            .get()
            .addOnSuccessListener { result ->
                allRegisteredGuards.clear()
                for (doc in result) {
                    val id = doc.id
                    val name = doc.getString("fullName") ?: "Guard"
                    val siteId = doc.getString("assignedSiteId") ?: ""
                    val rawEmb = doc.get("faceEmbedding") as? List<*>

                    if (rawEmb != null && rawEmb.isNotEmpty()) {
                        val embedding = rawEmb.map { (it as Number).toDouble() }
                        allRegisteredGuards.add(GuardFaceData(id, name, siteId, embedding))
                    }
                }

                if (allPermissionsGranted()) {
                    startCameraForQuickLogin()
                } else {
                    ActivityCompat.requestPermissions(
                        this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST_CODE
                    )
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Failed to connect to the database.", Toast.LENGTH_SHORT).show()
                finish()
            }
    }

    private fun startCameraForQuickLogin() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(viewFinder.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalyzer.setAnalyzer(cameraExecutor) { imageProxy ->
                processQuickLoginImage(imageProxy)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, imageAnalyzer)
            } catch (e: Exception) {
                Toast.makeText(this, "Camera failed to start.", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processQuickLoginImage(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !isVerified) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            val detector = FaceDetection.getClient(FaceRecognitionUtils.detectorOptions())

            detector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty() && allRegisteredGuards.isNotEmpty()) {
                        val liveFace = faces[0]
                        checkLiveness(liveFace)
                        
                        val liveEmbedding = extractEmbedding(liveFace)

                        var bestMatchGuard: GuardFaceData? = null
                        var lowestDistance = Double.MAX_VALUE

                        for (guard in allRegisteredGuards) {
                            val distance = distanceBetweenEmbeddings(liveEmbedding, guard.embedding)
                            if (distance < lowestDistance) {
                                lowestDistance = distance
                                bestMatchGuard = guard
                            }
                        }

                        if (bestMatchGuard != null && lowestDistance < FaceRecognitionUtils.MATCH_THRESHOLD) {
                            consecutiveMatchCount++
                            unknownFrameCount = 0
                            
                            if (consecutiveMatchCount >= FaceRecognitionUtils.REQUIRED_CONSECUTIVE_MATCHES && hasBlinked) {
                                isVerified = true
                                runOnUiThread {
                                    Toast.makeText(this, "Face Verified! Welcome, ${bestMatchGuard!!.name}", Toast.LENGTH_SHORT).show()
                                    recordGuardAttendance(bestMatchGuard!!.id, bestMatchGuard!!.name, bestMatchGuard!!.siteId)
                                    proceedToDashboard("guard", bestMatchGuard!!.name, bestMatchGuard!!.id, bestMatchGuard!!.siteId)
                                }
                            } else if (!hasBlinked && consecutiveMatchCount >= 2) {
                                runOnUiThread {
                                    tvLivenessStatus.text = "Please Blink Your Eyes"
                                    tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
                                }
                            }
                        } else {
                            consecutiveMatchCount = 0
                            unknownFrameCount++

                            if (unknownFrameCount >= 15) {
                                val currentTime = System.currentTimeMillis()
                                if (currentTime - lastToastTime > 3000) {
                                    lastToastTime = currentTime
                                    unknownFrameCount = 0
                                    runOnUiThread {
                                        Toast.makeText(this, "Face not registered or does not match.", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                        }
                    }
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    private fun checkLiveness(face: Face) {
        val leftEyeOpenProb = face.leftEyeOpenProbability ?: -1f
        val rightEyeOpenProb = face.rightEyeOpenProbability ?: -1f

        if (leftEyeOpenProb != -1f && rightEyeOpenProb != -1f) {
            if (leftEyeOpenProb > 0.7f && rightEyeOpenProb > 0.7f) {
                eyesWereOpen = true
            } else if (leftEyeOpenProb < 0.2f && rightEyeOpenProb < 0.2f && eyesWereOpen) {
                if (!hasBlinked) {
                    hasBlinked = true
                    runOnUiThread {
                        tvLivenessStatus.text = "Blink Detected! Authenticating..."
                        tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
                    }
                }
            }
        }
    }

    private fun fetchRegisteredFaceData(userId: String, callback: (Boolean) -> Unit) {
        val db = FirebaseFirestore.getInstance()
        db.collection("users").document(userId).get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    val embedding = document.get("faceEmbedding") as? List<*>
                    if (embedding != null && embedding.isNotEmpty()) {
                        registeredEmbedding = embedding.map { (it as Number).toDouble() }
                        callback(true)
                    } else {
                        callback(false)
                    }
                } else {
                    callback(false)
                }
            }
            .addOnFailureListener {
                callback(false)
            }
    }

    private fun allPermissionsGranted() = ContextCompat.checkSelfPermission(
        baseContext, Manifest.permission.CAMERA
    ) == PackageManager.PERMISSION_GRANTED

    private fun startCamera(role: String, name: String, id: String, siteId: String) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider: ProcessCameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(viewFinder.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalyzer.setAnalyzer(cameraExecutor) { imageProxy ->
                processImageProxy(imageProxy, role, name, id, siteId)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, imageAnalyzer)
            } catch (exc: Exception) {
                Toast.makeText(this, "Camera failed to start.", Toast.LENGTH_SHORT).show()
            }

        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processImageProxy(imageProxy: ImageProxy, role: String, name: String, id: String, siteId: String) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !isVerified) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            val detector = FaceDetection.getClient(FaceRecognitionUtils.detectorOptions())

            detector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty() && registeredEmbedding.isNotEmpty()) {
                        val liveFace = faces[0]
                        val faceRatio = liveFace.boundingBox.width().toFloat() / mediaImage.height.toFloat()
                        val quality = FaceRecognitionUtils.checkQuality(liveFace, faceRatio)

                        if (quality.ok) {
                            checkLiveness(liveFace)
                            
                            val liveEmbedding = extractEmbedding(liveFace)
                            val distance = if (liveEmbedding != null) {
                                FaceRecognitionUtils.distance(liveEmbedding, registeredEmbedding)
                            } else Double.MAX_VALUE

                            if (distance < FaceRecognitionUtils.MATCH_THRESHOLD) {
                                consecutiveMatchCount++
                                unknownFrameCount = 0
                            } else {
                                consecutiveMatchCount = 0
                                unknownFrameCount++

                                if (unknownFrameCount >= 15) {
                                    val currentTime = System.currentTimeMillis()
                                    if (currentTime - lastToastTime > 3000) {
                                        lastToastTime = currentTime
                                        unknownFrameCount = 0
                                        runOnUiThread {
                                            Toast.makeText(this, "Face does not match the registered account.", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                }
                            }

                            if (consecutiveMatchCount >= FaceRecognitionUtils.REQUIRED_CONSECUTIVE_MATCHES && hasBlinked) {
                                isVerified = true
                                runOnUiThread {
                                    Toast.makeText(this, "Face Verified! Welcome, $name", Toast.LENGTH_SHORT).show()

                                    if (role == "guard") {
                                        recordGuardAttendance(id, name, siteId)
                                    }

                                    proceedToDashboard(role, name, id, siteId)
                                }
                            } else if (!hasBlinked && consecutiveMatchCount >= 2) {
                                runOnUiThread {
                                    tvLivenessStatus.text = "Please Blink Your Eyes"
                                }
                            }
                        } else {
                            consecutiveMatchCount = 0
                        }
                    }
                }
                .addOnFailureListener {
                    // Ignore frame error
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    private fun recordGuardAttendance(guardId: String, guardName: String, siteId: String) {
        val db = FirebaseFirestore.getInstance()
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val currentTime = SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())

        val attendanceData = mapOf(
            "guardId" to guardId,
            "guardName" to guardName,
            "siteId" to siteId,
            "date" to today,
            "timeIn" to currentTime,
            "status" to "PRESENT"
        )

        val attendanceId = "${guardId}_$today"

        db.collection("attendance").document(attendanceId)
            .set(attendanceData, SetOptions.merge())
            .addOnSuccessListener {}
            .addOnFailureListener {}
    }

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

    private fun extractEmbedding(face: Face): List<Double> {
        val embedding = mutableListOf<Double>()
        val leftEye = face.getLandmark(FaceLandmark.LEFT_EYE)?.position
        val rightEye = face.getLandmark(FaceLandmark.RIGHT_EYE)?.position
        val nose = face.getLandmark(FaceLandmark.NOSE_BASE)?.position
        val mouth = face.getLandmark(FaceLandmark.MOUTH_BOTTOM)?.position

        if (leftEye != null && rightEye != null && nose != null && mouth != null) {
            val eyeDistance = sqrt((rightEye.x - leftEye.x).pow(2) + (rightEye.y - leftEye.y).pow(2)).toDouble()
            val leftEyeToNose = sqrt((nose.x - leftEye.x).pow(2) + (nose.y - leftEye.y).pow(2)).toDouble()
            val rightEyeToNose = sqrt((rightEye.x - nose.x).pow(2) + (rightEye.y - nose.y).pow(2)).toDouble()
            val noseToMouth = sqrt((mouth.x - nose.x).pow(2) + (mouth.y - nose.y).pow(2)).toDouble()

            if (eyeDistance > 0) {
                embedding.add(leftEyeToNose / eyeDistance)
                embedding.add(rightEyeToNose / eyeDistance)
                embedding.add(noseToMouth / eyeDistance)
                embedding.add(((rightEye.x - leftEye.x) / eyeDistance).toDouble())
                embedding.add(((nose.y - ((leftEye.y + rightEye.y) / 2f)) / eyeDistance).toDouble())
            }
        }
        return embedding
    }

    private fun isFaceMatching(live: List<Double>, reg: List<Double>): Boolean {
        return distanceBetweenEmbeddings(live, reg) < FaceRecognitionUtils.MATCH_THRESHOLD
    }

    private fun distanceBetweenEmbeddings(live: List<Double>, reg: List<Double>): Double {
        if (live.size != reg.size || live.isEmpty() || reg.isEmpty()) return Double.MAX_VALUE
        var sum = 0.0
        for (i in live.indices) {
            sum += (live[i] - reg[i]).pow(2.0)
        }
        return sqrt(sum)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
            if (allPermissionsGranted()) {
                val userRole = intent.getStringExtra("USER_ROLE") ?: ""
                val fullName = intent.getStringExtra("GUARD_NAME") ?: intent.getStringExtra("SUPERVISOR_NAME") ?: ""
                val userId = intent.getStringExtra("USER_ID") ?: ""
                val siteId = intent.getStringExtra("ASSIGNED_SITE_ID") ?: ""

                if (userId.isEmpty() && userRole == "guard") {
                    fetchAllGuardsAndStartCamera()
                } else {
                    startCamera(userRole, fullName, userId, siteId)
                }
            } else {
                Toast.makeText(this, "Camera permission is required for face verification.", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }
}
