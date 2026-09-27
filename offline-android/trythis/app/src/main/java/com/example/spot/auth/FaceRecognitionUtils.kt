package com.example.spot.auth

import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import kotlin.math.pow
import kotlin.math.sqrt

object FaceRecognitionUtils {

    const val MATCH_THRESHOLD = 0.08
    const val REQUIRED_CONSECUTIVE_MATCHES = 3

    fun detectorOptions(): FaceDetectorOptions {
        return FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .build()
    }

    fun checkQuality(face: Face, faceRatio: Float): QualityResult {
        val headEulerAngleY = face.headEulerAngleY 
        val headEulerAngleZ = face.headEulerAngleZ 

        if (faceRatio < 0.15f) {
            return QualityResult(false, "Lumapit sa camera.")
        }
        if (headEulerAngleY > 20 || headEulerAngleY < -20) {
            return QualityResult(false, "Humarap nang diretso sa camera.")
        }
        if (headEulerAngleZ > 20 || headEulerAngleZ < -20) {
            return QualityResult(false, "Huwag ikiling ang ulo.")
        }

        return QualityResult(true, "OK")
    }

    data class QualityResult(val ok: Boolean, val message: String)

    fun extractEmbedding(face: Face): List<Double>? {
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
                return embedding
            }
        }
        return null
    }

    fun distance(live: List<Double>, reg: List<Double>): Double {
        if (live.size != reg.size || live.isEmpty()) return Double.MAX_VALUE
        var sum = 0.0
        for (i in live.indices) {
            sum += (live[i] - reg[i]).pow(2.0)
        }
        return sqrt(sum)
    }
}
