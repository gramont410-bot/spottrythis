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
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class QuickFaceLoginActivity : AppCompatActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var viewFinder: PreviewView
    private lateinit var tvInstructions: TextView
    private lateinit var tvLivenessStatus: TextView
    private lateinit var viewFillLight: View
    private lateinit var btnToggleLight: ImageButton

    private var isVerified = false
    private val registeredGuards = mutableListOf<GuardFaceInfo>()
    private val CAMERA_PERMISSION_CODE = 2002

    // Liveness and Light State
    private var hasBlinked = false
    private var eyesWereOpen = false
    private var isFillLightOn = false
    private var consecutiveMatchCount = 0

    data class GuardFaceInfo(
        val id: String,
        val name: String,
        val siteId: String,
        val embedding: List<Double>
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_face_verify)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        viewFinder = findViewById(R.id.viewFinder)
        tvInstructions = findViewById(R.id.tvInstructions)
        tvLivenessStatus = findViewById(R.id.tvLivenessStatus)
        viewFillLight = findViewById(R.id.viewFillLight)
        btnToggleLight = findViewById(R.id.btnToggleLight)
        
        cameraExecutor = Executors.newSingleThreadExecutor()

        tvInstructions.text = "Quick Login... Please blink"
        tvLivenessStatus.text = "Align face in guide"

        btnToggleLight.setOnClickListener {
            toggleFillLight()
        }

        loadAllGuardsForFastRecognition { success ->
            if (success) {
                if (checkCameraPermission()) {
                    startCamera()
                } else {
                    requestCameraPermission()
                }
            } else {
                Toast.makeText(this, "Failed to connect to the database.", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun toggleFillLight() {
        isFillLightOn = !isFillLightOn
        viewFillLight.visibility = if (isFillLightOn) View.VISIBLE else View.GONE
        
        val lp = window.attributes
        // Force maximum brightness when the torch/fill light is on
        lp.screenBrightness = if (isFillLightOn) 1.0f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        window.attributes = lp
    }

    private fun loadAllGuardsForFastRecognition(callback: (Boolean) -> Unit) {
        val db = FirebaseFirestore.getInstance()
        db.collection("users")
            .whereEqualTo("role", "guard")
            .get()
            .addOnSuccessListener { result ->
                registeredGuards.clear()
                for (doc in result) {
                    val id = doc.id
                    val name = doc.getString("fullName") ?: "Guard"
                    val siteId = doc.getString("assignedSiteId") ?: ""
                    val rawEmb = doc.get("faceEmbedding") as? List<*>

                    if (rawEmb != null && rawEmb.isNotEmpty()) {
                        val embedding = rawEmb.map { (it as Number).toDouble() }
                        registeredGuards.add(GuardFaceInfo(id, name, siteId, embedding))
                    }
                }
                callback(true)
            }
            .addOnFailureListener {
                callback(false)
            }
    }

    private fun checkCameraPermission() = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(viewFinder.surfaceProvider) }
            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalyzer.setAnalyzer(cameraExecutor) { imageProxy ->
                processLiveFace(imageProxy)
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
    private fun processLiveFace(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !isVerified) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            val detector = FaceDetection.getClient(FaceRecognitionUtils.detectorOptions())

            detector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty()) {
                        val face = faces[0]
                        val faceRatio = face.boundingBox.width().toFloat() / mediaImage.height.toFloat()
                        
                        // Quality Check
                        val quality = FaceRecognitionUtils.checkQuality(face, faceRatio)
                        if (quality.ok) {
                            checkLiveness(face)
                            val liveEmbedding = FaceRecognitionUtils.extractEmbedding(face)

                            if (liveEmbedding != null) {
                                var bestMatchGuard: GuardFaceInfo? = null
                                var lowestDistance = Double.MAX_VALUE

                                for (guard in registeredGuards) {
                                    val distance = FaceRecognitionUtils.distance(liveEmbedding, guard.embedding)
                                    if (distance < FaceRecognitionUtils.MATCH_THRESHOLD && distance < lowestDistance) {
                                        lowestDistance = distance
                                        bestMatchGuard = guard
                                    }
                                }

                                if (bestMatchGuard != null) {
                                    consecutiveMatchCount++
                                    if (consecutiveMatchCount >= FaceRecognitionUtils.REQUIRED_CONSECUTIVE_MATCHES && hasBlinked) {
                                        isVerified = true
                                        runOnUiThread {
                                            Toast.makeText(this, "Face Verified! Welcome, ${bestMatchGuard!!.name}", Toast.LENGTH_SHORT).show()
                                            recordAttendanceAndLogin(bestMatchGuard!!.id, bestMatchGuard!!.name, bestMatchGuard!!.siteId)
                                        }
                                    } else if (!hasBlinked && consecutiveMatchCount >= 2) {
                                        runOnUiThread {
                                            tvLivenessStatus.text = "Please Blink Your Eyes"
                                            tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
                                        }
                                    }
                                } else {
                                    consecutiveMatchCount = 0
                                }
                            }
                        } else {
                            runOnUiThread {
                                tvLivenessStatus.text = quality.message
                                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
                            }
                        }
                    } else {
                        runOnUiThread { tvLivenessStatus.text = "Searching for face..." }
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

        if (leftEyeOpenProb > 0.7f && rightEyeOpenProb > 0.7f) {
            eyesWereOpen = true
        } else if (leftEyeOpenProb < 0.2f && rightEyeOpenProb < 0.2f && eyesWereOpen) {
            if (!hasBlinked) {
                hasBlinked = true
                runOnUiThread {
                    tvLivenessStatus.text = "Blink Detected! Verifying..."
                    tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
                }
            }
        }
    }

    private fun recordAttendanceAndLogin(guardId: String, guardName: String, siteId: String) {
        val db = FirebaseFirestore.getInstance()
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val timeNow = SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())

        val attendanceData = mapOf(
            "guardId" to guardId,
            "guardName" to guardName,
            "siteId" to siteId,
            "date" to today,
            "timeIn" to timeNow,
            "status" to "PRESENT"
        )

        db.collection("attendance").document("${guardId}_$today")
            .set(attendanceData, SetOptions.merge())
            .addOnCompleteListener {
                val intent = Intent(this, GuardDashboardActivity::class.java).apply {
                    putExtra("GUARD_ID", guardId)
                    putExtra("GUARD_NAME", guardName)
                    putExtra("ASSIGNED_SITE_ID", siteId)
                }
                startActivity(intent)
                finish()
            }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            Toast.makeText(this, "Camera permission is required.", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }
}
