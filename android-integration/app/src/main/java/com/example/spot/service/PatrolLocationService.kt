package com.example.spot.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.example.spot.R
import com.example.spot.ui.guard.GuardDashboardActivity
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

/**
 * Foreground GPS tracker used only while a guard patrol is IN_PROGRESS.
 *
 * Firestore:
 *   guardLocations/{firebaseAuthUid} = latest location
 *   locationHistory/{autoId}         = route trail point
 *
 * The service keeps running while the QR scanner / incident screen is open,
 * while the screen is off, and while S.P.O.T. is temporarily in background.
 */
class PatrolLocationService : Service() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var sensorManager: SensorManager? = null
    private var stepSensor: Sensor? = null
    private var stepCounterAvailable = false
    private var stepBaseline: Float? = null
    private var walkingSteps = 0L
    private var latestLocation: Location? = null
    private var latestGpsTimestamp: Timestamp? = null
    private var heartbeatStarted = false

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            publishLivePatrolUpdate()
            mainHandler.postDelayed(this, LIVE_UPDATE_INTERVAL_MS)
        }
    }

    private val stepListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val total = event.values.firstOrNull() ?: return
            val previousBaseline = stepBaseline
            if (previousBaseline == null || total < previousBaseline) {
                stepBaseline = total
                trackingPrefs.edit().putFloat(KEY_STEP_BASELINE, total).apply()
            }
            walkingSteps = ((total - (stepBaseline ?: total)).toLong()).coerceAtLeast(0L)
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    private val db by lazy { FirebaseFirestore.getInstance() }
    private val auth by lazy { FirebaseAuth.getInstance() }

    private lateinit var fusedLocationClient: FusedLocationProviderClient

    private var locationUpdatesStarted = false

    private var authUid: String = ""
    private var humanGuardId: String = ""
    private var guardName: String = ""
    private var siteId: String = ""
    private var siteName: String = ""
    private var clientId: String = ""
    private var patrolLogId: String = ""
    private var patrolTime: String = ""

    private var lastHistoryWriteAt = 0L
    private var lastHistoryLocation: Location? = null

    private val trackingPrefs by lazy {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private val locationCallback =
        object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { location ->
                    handleLocation(location)
                }
            }
        }

    override fun onCreate() {
        super.onCreate()

        fusedLocationClient =
            LocationServices.getFusedLocationProviderClient(this)

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

        createNotificationChannel()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {

        when (intent?.action) {

            ACTION_STOP -> {
                restoreState()

                if (authUid.isBlank()) {
                    authUid =
                        auth.currentUser?.uid
                            ?.trim()
                            .orEmpty()
                }

                // Because stop() also uses startForegroundService(), Android
                // still expects this service instance to enter foreground
                // promptly before it shuts itself down.
                startForeground(
                    NOTIFICATION_ID,
                    buildNotification()
                )

                stopTrackingAndSelf()
                return START_NOT_STICKY
            }

            ACTION_START -> {
                val requestedPatrolLogId = intent.getStringExtra(EXTRA_PATROL_LOG_ID)?.trim().orEmpty()
                val savedPatrolLogId = trackingPrefs.getString(KEY_PATROL_LOG_ID, "").orEmpty()
                if (requestedPatrolLogId.isNotBlank() && requestedPatrolLogId != savedPatrolLogId) {
                    trackingPrefs.edit().remove(KEY_STEP_BASELINE).apply()
                    stepBaseline = null
                    walkingSteps = 0L
                }
                authUid =
                    auth.currentUser?.uid
                        ?.trim()
                        .orEmpty()

                humanGuardId =
                    intent.getStringExtra(EXTRA_GUARD_ID)
                        ?.trim()
                        .orEmpty()

                guardName =
                    intent.getStringExtra(EXTRA_GUARD_NAME)
                        ?.trim()
                        .orEmpty()

                siteId =
                    intent.getStringExtra(EXTRA_SITE_ID)
                        ?.trim()
                        .orEmpty()

                siteName =
                    intent.getStringExtra(EXTRA_SITE_NAME)
                        ?.trim()
                        .orEmpty()

                clientId =
                    intent.getStringExtra(EXTRA_CLIENT_ID)
                        ?.trim()
                        .orEmpty()

                patrolLogId =
                    intent.getStringExtra(EXTRA_PATROL_LOG_ID)
                        ?.trim()
                        .orEmpty()

                patrolTime =
                    intent.getStringExtra(EXTRA_PATROL_TIME)
                        ?.trim()
                        .orEmpty()

                saveState()
            }

            else -> {
                // Android may recreate a START_STICKY service.
                restoreState()

                if (authUid.isBlank()) {
                    authUid =
                        auth.currentUser?.uid
                            ?.trim()
                            .orEmpty()
                }
            }
        }

        if (
            authUid.isBlank() ||
            siteId.isBlank() ||
            patrolLogId.isBlank()
        ) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(
            NOTIFICATION_ID,
            buildNotification()
        )

        markTrackingStarted()
        startStepCounter()
        startHeartbeat()
        startLocationUpdates()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopHeartbeat()
        sensorManager?.unregisterListener(stepListener)
        stopLocationUpdates()
        super.onDestroy()
    }

    private fun startLocationUpdates() {

        if (locationUpdatesStarted) {
            return
        }

        val fineGranted =
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

        val coarseGranted =
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

        if (!fineGranted && !coarseGranted) {
            stopTrackingAndSelf()
            return
        }

        val request =
            LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY,
                LIVE_UPDATE_INTERVAL_MS
            )
                .setMinUpdateIntervalMillis(
                    MIN_UPDATE_INTERVAL_MS
                )
                .setMinUpdateDistanceMeters(
                    MIN_LIVE_DISTANCE_METERS
                )
                .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                request,
                locationCallback,
                Looper.getMainLooper()
            )

            locationUpdatesStarted = true

        } catch (_: SecurityException) {
            stopTrackingAndSelf()
        }
    }

    private fun stopLocationUpdates() {
        if (!locationUpdatesStarted) {
            return
        }

        fusedLocationClient.removeLocationUpdates(
            locationCallback
        )

        locationUpdatesStarted = false
    }

    private fun handleLocation(location: Location) {

        // Do not publish very poor fixes. Indoor GPS can be noisy, so keep
        // the threshold lenient enough for a campus / facility patrol.
        if (
            location.hasAccuracy() &&
            location.accuracy >
            MAX_ACCEPTED_ACCURACY_METERS
        ) {
            return
        }

        if (authUid.isBlank()) {
            return
        }

        latestLocation = Location(location)
        latestGpsTimestamp = Timestamp.now()
        maybeSaveHistoryPoint(location)
    }

    private fun startStepCounter() {
        val sensor = stepSensor
        val hasPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        stepBaseline = if (trackingPrefs.contains(KEY_STEP_BASELINE)) trackingPrefs.getFloat(KEY_STEP_BASELINE, 0f) else null
        if (sensor == null || !hasPermission) {
            stepCounterAvailable = false
            return
        }
        stepCounterAvailable = try {
            sensorManager?.registerListener(stepListener, sensor, SensorManager.SENSOR_DELAY_NORMAL) == true
        } catch (_: SecurityException) {
            false
        }
    }

    private fun startHeartbeat() {
        if (heartbeatStarted) return
        heartbeatStarted = true
        mainHandler.removeCallbacks(heartbeatRunnable)
        mainHandler.post(heartbeatRunnable)
    }

    private fun stopHeartbeat() {
        heartbeatStarted = false
        mainHandler.removeCallbacks(heartbeatRunnable)
    }

    private fun publishLivePatrolUpdate() {
        if (authUid.isBlank() || patrolLogId.isBlank()) return
        val location = latestLocation
        val patch = hashMapOf<String, Any?>(
            "guardId" to authUid,
            "humanGuardId" to humanGuardId,
            "guardName" to guardName,
            "siteId" to siteId,
            "siteName" to siteName,
            "clientId" to clientId,
            "patrolId" to patrolLogId,
            "patrolLogId" to patrolLogId,
            "patrolTime" to patrolTime,
            "walkingSteps" to walkingSteps,
            "stepCounterAvailable" to stepCounterAvailable,
            "telemetryIntervalSeconds" to 5,
            "tracking" to true,
            "gpsAvailable" to (location != null),
            "source" to "android-patrol-gps",
            "telemetryTimestamp" to Timestamp.now(),
            "updatedAt" to FieldValue.serverTimestamp()
        )
        if (location != null) {
            patch["latitude"] = location.latitude
            patch["longitude"] = location.longitude
            patch["lat"] = location.latitude
            patch["lng"] = location.longitude
            patch["gpsLat"] = location.latitude
            patch["gpsLng"] = location.longitude
            patch["accuracy"] = if (location.hasAccuracy()) location.accuracy.toDouble() else null
            patch["speed"] = if (location.hasSpeed()) location.speed.toDouble() else 0.0
            patch["bearing"] = if (location.hasBearing()) location.bearing.toDouble() else 0.0
            patch["gpsTimestamp"] = latestGpsTimestamp
        }
        db.collection("guardLocations").document(authUid).set(patch, SetOptions.merge())
    }

    private fun maybeSaveHistoryPoint(
        location: Location
    ) {

        val now =
            System.currentTimeMillis()

        val enoughTimePassed =
            now -
                lastHistoryWriteAt >=
                HISTORY_INTERVAL_MS

        val movedEnough =
            lastHistoryLocation
                ?.distanceTo(location)
                ?.let {
                    it >=
                        HISTORY_MIN_DISTANCE_METERS
                }
                ?: true

        // First point is always saved. After that, keep the route useful
        // without writing every live location update to Firestore.
        if (
            lastHistoryWriteAt != 0L &&
            (!enoughTimePassed || !movedEnough)
        ) {
            return
        }

        val point =
            hashMapOf<String, Any?>(
                "guardId" to authUid,
                "humanGuardId" to humanGuardId,
                "guardName" to guardName,

                "siteId" to siteId,
                "siteName" to siteName,
                "clientId" to clientId,

                "patrolId" to patrolLogId,
                "patrolLogId" to patrolLogId,
                "patrolTime" to patrolTime,

                "latitude" to location.latitude,
                "longitude" to location.longitude,
                "lat" to location.latitude,
                "lng" to location.longitude,

                "accuracy" to
                    if (location.hasAccuracy()) {
                        location.accuracy.toDouble()
                    } else {
                        null
                    },

                "speed" to
                    if (location.hasSpeed()) {
                        location.speed.toDouble()
                    } else {
                        0.0
                    },

                "source" to "android-patrol-gps",

                "deviceTimestamp" to Timestamp.now(),
                "timestamp" to FieldValue.serverTimestamp()
            )

        db.collection("locationHistory")
            .add(point)
            .addOnSuccessListener {
                lastHistoryWriteAt = now
                lastHistoryLocation =
                    Location(location)
            }
    }

    private fun markTrackingStarted() {

        if (authUid.isBlank()) {
            return
        }

        val currentPatch =
            hashMapOf<String, Any?>(
                "guardId" to authUid,
                "humanGuardId" to humanGuardId,
                "guardName" to guardName,
                "siteId" to siteId,
                "siteName" to siteName,
                "clientId" to clientId,
                "patrolId" to patrolLogId,
                "patrolLogId" to patrolLogId,
                "patrolTime" to patrolTime,
                "tracking" to true,
                "gpsAvailable" to false,
                "walkingSteps" to 0L,
                "stepCounterAvailable" to false,
                "telemetryIntervalSeconds" to 5,
                "source" to "android-patrol-gps",
                "trackingStartedAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp()
            )

        db.collection("guardLocations")
            .document(authUid)
            .set(
                currentPatch,
                SetOptions.merge()
            )

        db.collection("patrol_logs")
            .document(patrolLogId)
            .set(
                mapOf(
                    "gpsTracking" to true,
                    "gpsTrackingStartedAt" to
                        FieldValue.serverTimestamp(),
                    "updatedAt" to
                        FieldValue.serverTimestamp()
                ),
                SetOptions.merge()
            )
    }

    private fun stopTrackingAndSelf() {

        stopLocationUpdates()

        val currentUid =
            authUid.ifBlank {
                auth.currentUser?.uid
                    ?.trim()
                    .orEmpty()
            }

        if (currentUid.isNotBlank()) {

            db.collection("guardLocations")
                .document(currentUid)
                .set(
                    mapOf(
                        "tracking" to false,
                        "gpsAvailable" to false,
                        "stepCounterAvailable" to false,
                        "patrolId" to null,
                        "patrolLogId" to null,
                        "trackingStoppedAt" to
                            FieldValue.serverTimestamp(),
                        "updatedAt" to
                            FieldValue.serverTimestamp()
                    ),
                    SetOptions.merge()
                )
        }

        if (patrolLogId.isNotBlank()) {
            db.collection("patrol_logs")
                .document(patrolLogId)
                .set(
                    mapOf(
                        "gpsTracking" to false,
                        "gpsTrackingStoppedAt" to
                            FieldValue.serverTimestamp(),
                        "updatedAt" to
                            FieldValue.serverTimestamp()
                    ),
                    SetOptions.merge()
                )
        }

        clearState()

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification() =
        NotificationCompat.Builder(
            this,
            CHANNEL_ID
        )
            .setSmallIcon(R.drawable.spot)
            .setContentTitle(
                "S.P.O.T. Patrol Tracking"
            )
            .setContentText(
                if (patrolTime.isBlank()) {
                    "$guardName • Location tracking active"
                } else {
                    "$guardName • $patrolTime patrol"
                }
            )
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(
                NotificationCompat.CATEGORY_SERVICE
            )
            .setContentIntent(
                buildDashboardPendingIntent()
            )
            .build()

    private fun buildDashboardPendingIntent(): PendingIntent {

        val intent =
            Intent(
                this,
                GuardDashboardActivity::class.java
            ).apply {
                putExtra(
                    "GUARD_ID",
                    humanGuardId.ifBlank {
                        authUid
                    }
                )
                putExtra(
                    "GUARD_NAME",
                    guardName
                )
                putExtra(
                    "ASSIGNED_SITE_ID",
                    siteId
                )
                flags =
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            }

        return PendingIntent.getActivity(
            this,
            9091,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun createNotificationChannel() {

        if (
            Build.VERSION.SDK_INT <
            Build.VERSION_CODES.O
        ) {
            return
        }

        val channel =
            NotificationChannel(
                CHANNEL_ID,
                "Patrol GPS Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description =
                    "Shows when S.P.O.T. is tracking a guard during an active patrol."
                setShowBadge(false)
            }

        getSystemService(
            NotificationManager::class.java
        ).createNotificationChannel(channel)
    }

    private fun saveState() {
        trackingPrefs.edit()
            .putString(KEY_AUTH_UID, authUid)
            .putString(KEY_HUMAN_GUARD_ID, humanGuardId)
            .putString(KEY_GUARD_NAME, guardName)
            .putString(KEY_SITE_ID, siteId)
            .putString(KEY_SITE_NAME, siteName)
            .putString(KEY_CLIENT_ID, clientId)
            .putString(KEY_PATROL_LOG_ID, patrolLogId)
            .putString(KEY_PATROL_TIME, patrolTime)
            .apply()
    }

    private fun restoreState() {
        authUid =
            trackingPrefs.getString(
                KEY_AUTH_UID,
                ""
            ).orEmpty()

        humanGuardId =
            trackingPrefs.getString(
                KEY_HUMAN_GUARD_ID,
                ""
            ).orEmpty()

        guardName =
            trackingPrefs.getString(
                KEY_GUARD_NAME,
                ""
            ).orEmpty()

        siteId =
            trackingPrefs.getString(
                KEY_SITE_ID,
                ""
            ).orEmpty()

        siteName =
            trackingPrefs.getString(
                KEY_SITE_NAME,
                ""
            ).orEmpty()

        clientId =
            trackingPrefs.getString(
                KEY_CLIENT_ID,
                ""
            ).orEmpty()

        patrolLogId =
            trackingPrefs.getString(
                KEY_PATROL_LOG_ID,
                ""
            ).orEmpty()

        patrolTime =
            trackingPrefs.getString(
                KEY_PATROL_TIME,
                ""
            ).orEmpty()
    }

    private fun clearState() {
        trackingPrefs.edit()
            .clear()
            .apply()
    }

    companion object {

        private const val ACTION_START =
            "com.example.spot.action.START_PATROL_GPS"

        private const val ACTION_STOP =
            "com.example.spot.action.STOP_PATROL_GPS"

        private const val EXTRA_GUARD_ID =
            "EXTRA_GUARD_ID"

        private const val EXTRA_GUARD_NAME =
            "EXTRA_GUARD_NAME"

        private const val EXTRA_SITE_ID =
            "EXTRA_SITE_ID"

        private const val EXTRA_SITE_NAME =
            "EXTRA_SITE_NAME"

        private const val EXTRA_CLIENT_ID =
            "EXTRA_CLIENT_ID"

        private const val EXTRA_PATROL_LOG_ID =
            "EXTRA_PATROL_LOG_ID"

        private const val EXTRA_PATROL_TIME =
            "EXTRA_PATROL_TIME"

        private const val PREFS_NAME =
            "SPOT_PATROL_LOCATION_SERVICE"

        private const val KEY_AUTH_UID =
            "AUTH_UID"

        private const val KEY_HUMAN_GUARD_ID =
            "HUMAN_GUARD_ID"

        private const val KEY_GUARD_NAME =
            "GUARD_NAME"

        private const val KEY_SITE_ID =
            "SITE_ID"

        private const val KEY_SITE_NAME =
            "SITE_NAME"

        private const val KEY_CLIENT_ID =
            "CLIENT_ID"

        private const val KEY_PATROL_LOG_ID =
            "PATROL_LOG_ID"

        private const val KEY_PATROL_TIME =
            "PATROL_TIME"

        private const val KEY_STEP_BASELINE =
            "STEP_BASELINE"

        private const val CHANNEL_ID =
            "spot_patrol_gps"

        private const val NOTIFICATION_ID =
            4107

        private const val LIVE_UPDATE_INTERVAL_MS =
            5_000L

        private const val MIN_UPDATE_INTERVAL_MS =
            5_000L

        private const val MIN_LIVE_DISTANCE_METERS =
            3f

        private const val HISTORY_INTERVAL_MS =
            30_000L

        private const val HISTORY_MIN_DISTANCE_METERS =
            5f

        private const val MAX_ACCEPTED_ACCURACY_METERS =
            100f

        fun start(
            context: Context,
            guardId: String,
            guardName: String,
            siteId: String,
            siteName: String,
            clientId: String,
            patrolLogId: String,
            patrolTime: String
        ) {

            val intent =
                Intent(
                    context,
                    PatrolLocationService::class.java
                ).apply {
                    action =
                        ACTION_START

                    putExtra(
                        EXTRA_GUARD_ID,
                        guardId
                    )

                    putExtra(
                        EXTRA_GUARD_NAME,
                        guardName
                    )

                    putExtra(
                        EXTRA_SITE_ID,
                        siteId
                    )

                    putExtra(
                        EXTRA_SITE_NAME,
                        siteName
                    )

                    putExtra(
                        EXTRA_CLIENT_ID,
                        clientId
                    )

                    putExtra(
                        EXTRA_PATROL_LOG_ID,
                        patrolLogId
                    )

                    putExtra(
                        EXTRA_PATROL_TIME,
                        patrolTime
                    )
                }

            ContextCompat.startForegroundService(
                context,
                intent
            )
        }

        fun stop(
            context: Context
        ) {

            val intent =
                Intent(
                    context,
                    PatrolLocationService::class.java
                ).apply {
                    action =
                        ACTION_STOP
                }

            ContextCompat.startForegroundService(
                context,
                intent
            )
        }
    }
}
