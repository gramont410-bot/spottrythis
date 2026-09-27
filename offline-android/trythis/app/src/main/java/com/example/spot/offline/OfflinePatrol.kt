package com.example.spot.offline

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.work.*
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PatrolApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseFirestore.getInstance().firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setLocalCacheSettings(PersistentCacheSettings.newBuilder().setSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED).build())
            .build()
        FirebaseAuth.getInstance().addAuthStateListener { auth ->
            if (auth.currentUser != null) OfflinePatrol.schedule(this)
        }
    }
}

object OfflinePatrol {
    val io = Executors.newSingleThreadExecutor()
    fun online(context: Context): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val caps = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
    fun source(context: Context) = if (online(context)) Source.DEFAULT else Source.CACHE

    fun schedule(context: Context) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val request = OneTimeWorkRequestBuilder<PatrolSyncWorker>()
            .setInputData(workDataOf("uid" to uid))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS).build()
        // APPEND_OR_REPLACE prevents a newly saved row being stranded as a worker exits.
        try {
            WorkManager.getInstance(context).enqueueUniqueWork("patrol-sync-$uid", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        } catch (error: Exception) {
            // The action is already durable. Do not invite duplicate submissions if scheduling fails.
            android.util.Log.e("PatrolSync", "Scheduling deferred until next app startup", error)
        }
    }

    /** The calculation uses cached documents and the outbox overlay, on one serial executor. */
    fun <T> record(context: Context, patrol: DocumentReference, checkpoint: DocumentReference,
                   calculate: (LocalScan) -> T): Task<T> = Tasks.call(io) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to record a checkpoint")
        val documents = listOf(patrol, checkpoint).associateWith {
            Tasks.await(it.get(Source.CACHE), 10, TimeUnit.SECONDS)
        }
        val local = LocalScan(documents)
        val result = calculate(local)
        check(FirebaseAuth.getInstance().currentUser?.uid == uid) { "Account changed; scan again" }
        val updates = checkNotNull(local.updates)
        val scans = updates["checkpointScans"] as List<*>
        @Suppress("UNCHECKED_CAST")
        val scan = scans.last() as Map<String, Any?>
        val base = documents.getValue(patrol)
        val audit = base.data.orEmpty().filterKeys { it in setOf("guardId", "guardName", "siteId", "clientId") }.toMutableMap()
        audit.putAll(scan)
        audit.putAll(mapOf("patrolId" to patrol.id, "patrolLogId" to patrol.id,
            "locationId" to scan["checkpointId"], "locationName" to scan["checkpointName"],
            "assignmentVerified" to true, "deviceTimestamp" to scan["scannedAt"],
            "timestamp" to scan["scannedAt"], "recordedByUid" to uid))
        val time = (scan["scannedAt"] as com.google.firebase.Timestamp).toDate()
        audit["date"] = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(time)
        audit["time"] = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US).format(time)
        val eventId = "scan_" + java.security.MessageDigest.getInstance("SHA-256")
            .digest("${patrol.path}\n${checkpoint.path}".toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        OfflineStore.get(context).put(eventId, uid, "scan", mapOf(
            "patrolId" to patrol.id, "checkpointPath" to checkpoint.path,
            "updates" to mapOf("checkpointScans" to listOf(scan)), "audit" to audit))
        schedule(context)
        result
    }
}

class LocalScan(private val documents: Map<DocumentReference, DocumentSnapshot>) {
    var updates: Map<String, Any?>? = null
        private set
    fun get(ref: DocumentReference) = documents.getValue(ref)
    fun update(ref: DocumentReference, value: Map<String, Any?>) {
        check(documents.containsKey(ref))
        updates = value
    }
}
