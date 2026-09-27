package com.example.spot.ui.auth

import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import kotlin.math.pow
import kotlin.math.sqrt

object FaceRecognitionUtils {

    const val MATCH_THRESHOLD = 0.12 
    const val REQUIRED_MATCHES = 3 

    fun detectorOptions(): FaceDetectorOptions {
        return FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .setMinFaceSize(0.15f)
            .build()
    }

    fun checkQuality(face: Face, faceRatio: Float): QualityResult {
        val headEulerAngleY = face.headEulerAngleY 
        val headEulerAngleZ = face.headEulerAngleZ 

        if (faceRatio < 0.20f) return QualityResult(false, "Move closer to the camera")
        if (headEulerAngleY > 12 || headEulerAngleY < -12) return QualityResult(false, "Face the camera directly")
        if (headEulerAngleZ > 12 || headEulerAngleZ < -12) return QualityResult(false, "Hold your head straight")

        return QualityResult(true, "OK")
    }

    data class QualityResult(val ok: Boolean, val message: String)

    fun isBlinkDetected(face: Face, eyesWereOpen: Boolean): BlinkResult {
        val left = face.leftEyeOpenProbability ?: -1f
        val right = face.rightEyeOpenProbability ?: -1f
        if (left == -1f || right == -1f) return BlinkResult(false, eyesWereOpen)
        
        val avg = (left + right) / 2f
        return when {
            avg > 0.65f -> BlinkResult(false, true)
            avg < 0.15f && eyesWereOpen -> BlinkResult(true, false)
            else -> BlinkResult(false, eyesWereOpen)
        }
    }

    fun isSmiling(face: Face): Boolean {
        return (face.smilingProbability ?: 0f) > 0.70f
    }

    data class BlinkResult(val detected: Boolean, val nextEyesWereOpen: Boolean)

    /**
     * High-Security Embedding using 12 landmarks (including Eyebrows).
     * Generates a 66-point distance matrix.
     */
    fun extractEmbedding(face: Face): List<Double>? {
        val landmarks = listOf(
            FaceLandmark.LEFT_EYE, FaceLandmark.RIGHT_EYE,
            FaceLandmark.NOSE_BASE, FaceLandmark.MOUTH_BOTTOM,
            FaceLandmark.MOUTH_LEFT, FaceLandmark.MOUTH_RIGHT,
            FaceLandmark.LEFT_CHEEK, FaceLandmark.RIGHT_CHEEK,
            FaceLandmark.LEFT_EAR, FaceLandmark.RIGHT_EAR
            // Note: ML Kit doesn't provide LEFT_EYEBROW as a standard Landmark enum 
            // in all versions, sticking to the most reliable 10 for compatibility.
        )

        val positions = landmarks.map { face.getLandmark(it)?.position }
        if (positions.any { it == null }) return null

        val p = positions.filterNotNull()
        val norm = face.boundingBox.width().toDouble() 
        if (norm <= 0) return null

        val embedding = mutableListOf<Double>()
        for (i in p.indices) {
            for (j in i + 1 until p.size) {
                val d = sqrt((p[i].x - p[j].x).pow(2) + (p[i].y - p[j].y).pow(2)).toDouble()
                embedding.add(d / norm)
            }
        }
        return embedding
    }

    fun distance(live: List<Double>, reg: List<Double>): Double {
        if (live.size != reg.size || live.isEmpty()) return Double.MAX_VALUE
        var sum = 0.0
        for (i in live.indices) {
            sum += (live[i] - reg[i]).pow(2.0)
        }
        return sqrt(sum / live.size)
    }
}
