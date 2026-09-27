package com.example.spot.ui.supervisor

import android.os.Bundle
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
import com.example.spot.ui.auth.FaceRecognitionUtils
import com.google.firebase.firestore.FirebaseFirestore
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class RegisterFaceActivity : AppCompatActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var viewFinder: PreviewView
    private lateinit var viewFillLight: View
    private lateinit var btnToggleLight: ImageButton
    private lateinit var tvLivenessStatus: TextView
    private lateinit var tvInstructions: TextView
    
    private lateinit var faceDetector: FaceDetector

    private var isCaptured = false
    private var isFillLightOn = false
    
    // Registration Liveness State
    private var hasBlinked = false
    private var hasSmiled = false
    private var eyesWereOpen = false
    private var stableFrameCount = 0

    private lateinit var guardName: String
    private lateinit var guardPassword: String
    private lateinit var siteId: String
    private lateinit var dutyStart: String
    private lateinit var dutyEnd: String
    private lateinit var userRole: String

    private val CAMERA_PERMISSION_REQUEST_CODE = 1002

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_face_verify)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        viewFinder = findViewById(R.id.viewFinder)
        viewFillLight = findViewById(R.id.viewFillLight)
        btnToggleLight = findViewById(R.id.btnToggleLight)
        tvLivenessStatus = findViewById(R.id.tvLivenessStatus)
        tvInstructions = findViewById(R.id.tvInstructions)

        cameraExecutor = Executors.newSingleThreadExecutor()
        faceDetector = FaceDetection.getClient(FaceRecognitionUtils.detectorOptions())

        tvInstructions.text = "Registering Identity..."
        tvLivenessStatus.text = "Align face in guide"

        btnToggleLight.setOnClickListener { toggleFillLight() }

        guardName = intent.getStringExtra("GUARD_NAME") ?: ""
        guardPassword = intent.getStringExtra("GUARD_PASSWORD") ?: ""
        siteId = intent.getStringExtra("SITE_ID") ?: ""
        dutyStart = intent.getStringExtra("DUTY_START") ?: ""
        dutyEnd = intent.getStringExtra("DUTY_END") ?: ""
        userRole = intent.getStringExtra("USER_ROLE") ?: "guard"

        if (allPermissionsGranted()) {
            startCameraForRegistration()
        } else {
            ActivityCompat.requestPermissions(
                this, arrayOf(android.Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST_CODE
            )
        }
    }

    private fun toggleFillLight() {
        isFillLightOn = !isFillLightOn
        viewFillLight.visibility = if (isFillLightOn) View.VISIBLE else View.GONE
        val lp = window.attributes
        lp.screenBrightness = if (isFillLightOn) 1.0f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        window.attributes = lp
    }

    private fun allPermissionsGranted() = ContextCompat.checkSelfPermission(
        baseContext, android.Manifest.permission.CAMERA
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun startCameraForRegistration() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(viewFinder.surfaceProvider) }
            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalyzer.setAnalyzer(cameraExecutor) { imageProxy ->
                processRegistrationFrame(imageProxy)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, imageAnalyzer)
            } catch (exc: Exception) {
                Toast.makeText(this, "Camera error.", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processRegistrationFrame(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !isCaptured) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            
            faceDetector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty()) {
                        val face = faces[0]
                        val faceRatio = face.boundingBox.width().toFloat() / mediaImage.height.toFloat()
                        val quality = FaceRecognitionUtils.checkQuality(face, faceRatio)

                        if (quality.ok) {
                            checkLiveness(face)
                            
                            runOnUiThread { updateRegistrationUI() }
                            
                            // Require stability + Blink + Smile
                            if (hasBlinked && hasSmiled) {
                                stableFrameCount++
                                if (stableFrameCount >= 5) {
                                    val embedding = FaceRecognitionUtils.extractEmbedding(face)
                                    if (embedding != null) {
                                        isCaptured = true
                                        runOnUiThread {
                                            Toast.makeText(this, "Success! Saving Identity...", Toast.LENGTH_SHORT).show()
                                        }
                                        saveUserToDatabaseWithFace(embedding)
                                    }
                                }
                            }
                        } else {
                            stableFrameCount = 0
                            runOnUiThread {
                                tvLivenessStatus.text = quality.message
                                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
                            }
                        }
                    } else {
                        stableFrameCount = 0
                        runOnUiThread { tvLivenessStatus.text = "No face detected" }
                    }
                }
                .addOnCompleteListener { imageProxy.close() }
        } else {
            imageProxy.close()
        }
    }

    private fun checkLiveness(face: Face) {
        // Blink Detection
        val blinkResult = FaceRecognitionUtils.isBlinkDetected(face, eyesWereOpen)
        eyesWereOpen = blinkResult.nextEyesWereOpen
        if (blinkResult.detected) hasBlinked = true
        
        // Smile Detection
        if (FaceRecognitionUtils.isSmiling(face)) hasSmiled = true
    }

    private fun updateRegistrationUI() {
        when {
            !hasBlinked -> {
                tvLivenessStatus.text = "Step 1: Blink your eyes"
                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_blue_light))
            }
            !hasSmiled -> {
                tvLivenessStatus.text = "Step 2: Now give a big smile!"
                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_light))
            }
            else -> {
                tvLivenessStatus.text = "Perfect! Keep still..."
                tvLivenessStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
            }
        }
    }

    private fun saveUserToDatabaseWithFace(embedding: List<Double>) {
        val customId = guardName.lowercase().trim().replace(" ", "_")
        val db = FirebaseFirestore.getInstance()

        val userLoginData = mutableMapOf<String, Any>(
            "fullName" to guardName,
            "password" to guardPassword,
            "role" to userRole,
            "faceEmbedding" to embedding
        )

        if (userRole == "guard") {
            userLoginData["guardId"] = customId
            userLoginData["assignedSiteId"] = siteId
            userLoginData["dutyStart"] = dutyStart
            userLoginData["dutyEnd"] = dutyEnd
        }

        db.collection("users").document(customId).set(userLoginData)
            .addOnSuccessListener {
                if (userRole == "guard" && siteId.isNotEmpty()) {
                    val siteGuardData = hashMapOf(
                        "guardId" to customId,
                        "fullName" to guardName,
                        "siteId" to siteId,
                        "startTime" to dutyStart,
                        "endTime" to dutyEnd,
                        "status" to "Active"
                    )
                    db.collection("client_sites").document(siteId).collection("guards").document(customId)
                        .set(siteGuardData)
                        .addOnSuccessListener { 
                            Toast.makeText(this, "Registration Successful!", Toast.LENGTH_SHORT).show()
                            finish() 
                        }
                } else {
                    Toast.makeText(this, "User registered successfully!", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
            .addOnFailureListener { e ->
                isCaptured = false
                Toast.makeText(this, "Database Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    override fun onDestroy() {
        super.onDestroy()
        faceDetector.close()
        cameraExecutor.shutdown()
    }
}
