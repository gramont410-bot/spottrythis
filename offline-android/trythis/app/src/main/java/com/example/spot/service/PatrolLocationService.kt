package com.example.spot.service

import com.example.spot.offline.OfflinePatrol
import com.example.spot.offline.OfflineStore
import com.google.android.gms.tasks.Tasks
import java.util.UUID
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
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import java.util.Date

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
class PatrolLocationService : Service(), SensorEventListener {

    private val db by lazy { FirebaseFirestore.getInstance() }
    private val auth by lazy { FirebaseAuth.getInstance() }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var sensorManager: SensorManager
    private var stepCounterSensor: Sensor? = null

    private var locationUpdatesStarted = false
    private var patrolStatusListener: ListenerRegistration? = null

    private var authUid: String = ""
    private var humanGuardId: String = ""
    private var guardName: String = ""
    private var siteId: String = ""
    private var siteName: String = ""
    private var clientId: String = ""
    private var patrolLogId: String = ""
    private var patrolTime: String = ""
    private var baselineStepCount: Float? = null
    private var walkingSteps: Int = 0
    private var latestAcceptedLocation: Location? = null

    private var lastHistoryWriteAt = 0L
    private var lastHistoryLocation: Location? = null
    private val livePublishHandler = Handler(Looper.getMainLooper())
    private var livePublishingStarted = false

    /** Keeps GPS and step telemetry visible to the website on one cadence. */
    private val livePublishRunnable =
        object : Runnable {
            override fun run() {
                publishLivePatrolUpdate()
                livePublishHandler.postDelayed(this, LIVE_UPDATE_INTERVAL_MS)
            }
        }

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

        sensorManager =
            getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepCounterSensor =
            sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

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
        startLocationUpdates()
        startLivePublishing()
        startPatrolStatusListener()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        patrolStatusListener?.remove()
        patrolStatusListener = null
        stopStepCounter()
        stopLocationUpdates()
        stopLivePublishing()
        super.onDestroy()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_STEP_COUNTER || event.values.isEmpty()) {
            return
        }

        if (baselineStepCount == null) {
            baselineStepCount = event.values[0]
        }

        walkingSteps =
            (event.values[0] - (baselineStepCount ?: event.values[0]))
                .coerceAtLeast(0f)
                .toInt()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun startStepCounter() {
        baselineStepCount = null
        walkingSteps = 0

        if (!canReadSteps()) {
            return
        }

        try {
            stepCounterSensor?.let { sensor ->
                sensorManager.registerListener(
                    this,
                    sensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                )
            }
        } catch (_: SecurityException) {
            // GPS tracking remains available when a guard declines activity
            // recognition, but the web receives stepCounterAvailable: false.
        }
    }

    private fun stopStepCounter() {
        if (::sensorManager.isInitialized) {
            sensorManager.unregisterListener(this)
        }
    }

    private fun canReadSteps(): Boolean =
        stepCounterSensor != null &&
                (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                        ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.ACTIVITY_RECOGNITION
                        ) == PackageManager.PERMISSION_GRANTED)

    /**
     * Keep GPS tied to the Firestore patrol state. If a supervisor removes
     * checkpoint requirements and that causes the patrol to complete while
     * the phone is in the background, this listener stops GPS immediately.
     */
    private fun startPatrolStatusListener() {
        if (patrolLogId.isBlank()) {
            return
        }

        patrolStatusListener?.remove()

        patrolStatusListener =
            db.collection("patrol_logs")
                .document(patrolLogId)
                .addSnapshotListener { snapshot, error ->
                    if (
                        error != null ||
                        snapshot == null ||
                        !snapshot.exists()
                    ) {
                        return@addSnapshotListener
                    }

                    val status =
                        snapshot.getString("status")
                            ?.trim()
                            ?.uppercase()
                            .orEmpty()

                    if (status != "IN_PROGRESS") {
                        patrolStatusListener?.remove()
                        patrolStatusListener = null
                        stopTrackingAndSelf()
                    }
                }
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

    private fun startLivePublishing() {
        if (livePublishingStarted) {
            return
        }

        livePublishingStarted = true
        // The first heartbeat may have steps only until GPS supplies a fix.
        // merge() preserves a last-known coordinate in that case.
        livePublishHandler.post(livePublishRunnable)
    }

    private fun stopLivePublishing() {
        livePublishHandler.removeCallbacks(livePublishRunnable)
        livePublishingStarted = false
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

        // Location callbacks and step events are independent. Cache the last
        // usable fix; the five-second heartbeat publishes it with the latest
        // walking count.
        latestAcceptedLocation = Location(location)
        maybeSaveHistoryPoint(location)
    }

    /** Writes the combined GPS and walking telemetry read by the website. */
    private fun publishLivePatrolUpdate() {

        if (authUid.isBlank()) {
            return
        }

        val location = latestAcceptedLocation
        val latestLocation =
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

                "walkingSteps" to walkingSteps,
                "stepCounterAvailable" to canReadSteps(),
                "telemetryIntervalSeconds" to LIVE_UPDATE_INTERVAL_SECONDS,
                "tracking" to true,
                "gpsAvailable" to (location != null),
                "source" to "android-patrol-gps",

                // This is the heartbeat time. gpsTimestamp below is the time
                // of the actual GPS fix, which lets the website detect a
                // stale coordinate even while step telemetry is still live.
                "telemetryTimestamp" to Timestamp.now(),
                "updatedAt" to FieldValue.serverTimestamp()
            )

        location?.let { currentLocation ->
            latestLocation["latitude"] = currentLocation.latitude
            latestLocation["longitude"] = currentLocation.longitude

            // Compatibility aliases for existing web code.
            latestLocation["lat"] = currentLocation.latitude
            latestLocation["lng"] = currentLocation.longitude
            latestLocation["gpsLat"] = currentLocation.latitude
            latestLocation["gpsLng"] = currentLocation.longitude

            latestLocation["accuracy"] =
                if (currentLocation.hasAccuracy()) {
                    currentLocation.accuracy.toDouble()
                } else {
                    null
                }

            latestLocation["speed"] =
                if (currentLocation.hasSpeed()) {
                    currentLocation.speed.toDouble()
                } else {
                    0.0
                }

            latestLocation["bearing"] =
                if (currentLocation.hasBearing()) {
                    currentLocation.bearing.toDouble()
                } else {
                    0.0
                }

            latestLocation["gpsTimestamp"] =
                Timestamp(Date(currentLocation.time))
        }

        db.collection("guardLocations")
            .document(authUid)
            .set(
                latestLocation,
                SetOptions.merge()
            )
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

        // Throttle when accepted locally, not when the server eventually acknowledges it.
        lastHistoryWriteAt = now
        lastHistoryLocation = Location(location)
        point["timestamp"] = Timestamp(Date(location.time))
        val recordedBy = authUid
        Tasks.call(OfflinePatrol.io) {
            OfflineStore.get(this).put(UUID.randomUUID().toString(), recordedBy, "location", point)
            OfflinePatrol.schedule(applicationContext)
        }.addOnFailureListener {
            lastHistoryWriteAt = 0L
            android.util.Log.e("PatrolGPS", "Unable to save offline route point", it)
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

        patrolStatusListener?.remove()
        patrolStatusListener = null
        stopLocationUpdates()
        stopStepCounter()
        stopLivePublishing()

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
                        "walkingSteps" to walkingSteps,
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

        private const val CHANNEL_ID =
            "spot_patrol_gps"

        private const val NOTIFICATION_ID =
            4107

        private const val LIVE_UPDATE_INTERVAL_MS =
            5_000L

        private const val MIN_UPDATE_INTERVAL_MS =
            5_000L

        private const val LIVE_UPDATE_INTERVAL_SECONDS =
            5

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
