package com.example.spot.offline

import android.content.Context
import android.location.Location
import android.net.Uri
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.*
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageException
import java.io.File
import java.util.concurrent.TimeUnit

class PatrolSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    private val db = FirebaseFirestore.getInstance()
    private var operation = "syncing the saved action"
    private fun <T> await(task: Task<T>): T = Tasks.await(task, 90, TimeUnit.SECONDS)
    private class Conflict(message: String) : IllegalStateException(message)

    override fun doWork(): Result {
        val uid = inputData.getString("uid") ?: return Result.failure()
        if (FirebaseAuth.getInstance().currentUser?.uid != uid) return Result.success()
        val store = OfflineStore.get(applicationContext)
        var needsRetry = false
        val waitingPatrols = mutableSetOf<String>()
        // Bound a worker run; the next run resumes durable remaining rows.
        for (entry in store.entries(uid).filter { it.error == null }.take(100)) {
            if (isStopped) return Result.retry()
            if (FirebaseAuth.getInstance().currentUser?.uid != uid) return Result.success()
            val patrolId = entry.payload["patrolId"] as? String
            if (entry.kind == "scan" && patrolId in waitingPatrols) continue
            try {
                when (entry.kind) {
                    "scan" -> syncScan(entry)
                    "report" -> syncReport(entry)
                    "location" -> if (!alreadySaved("locationHistory", entry)) {
                        saveRecord("locationHistory", entry, entry.payload)
                    }
                    else -> throw Conflict("Unknown queued action")
                }
                store.remove(entry.id)
                if (entry.kind == "report") photoFiles(entry).forEach { it.delete() }
            } catch (error: Exception) {
                android.util.Log.e("PatrolSync", "${entry.kind}: $operation failed for action ${entry.id}", error)
                val causes = generateSequence<Throwable>(error) { it.cause }.toList()
                val conflict = causes.filterIsInstance<Conflict>().firstOrNull()
                val firestore = causes.filterIsInstance<FirebaseFirestoreException>().firstOrNull()
                val storage = causes.filterIsInstance<StorageException>().firstOrNull()
                when {
                    conflict != null -> store.fail(entry.id, conflict.message ?: "Supervisor review required")
                    firestore?.code == FirebaseFirestoreException.Code.PERMISSION_DENIED ->
                        store.fail(entry.id, "Firebase denied $operation. This action is still saved on this phone. Tap Retry after access is restored.")
                    storage?.errorCode == StorageException.ERROR_NOT_AUTHORIZED ->
                        store.fail(entry.id, "Photo upload access denied. Ask your supervisor, then tap Retry.")
                    else -> {
                        needsRetry = true
                        if (entry.kind == "scan" && patrolId != null) waitingPatrols.add(patrolId)
                    }
                }
            }
        }
        return if (needsRetry || store.entries(uid).any { it.error == null }) Result.retry() else Result.success()
    }

    private fun photoFiles(entry: OfflineStore.Entry): List<File> =
        (entry.payload["photos"] as? List<*>)?.map { File(it as String) }.orEmpty()

    private fun alreadySaved(collection: String, entry: OfflineStore.Entry): Boolean {
        operation = "checking saved $collection records"
        // A document-ID equality lookup evaluates the nonexistent document's owner.
        // Query a stored field instead, so an unsynced action is an allowed empty result.
        return !await(db.collection(collection).whereEqualTo("guardId", entry.uid)
            .whereEqualTo("offlineActionId", entry.id).limit(1).get(Source.SERVER)).isEmpty
    }

    private fun saveRecord(collection: String, entry: OfflineStore.Entry, data: Map<String, Any?>) {
        if (data["guardId"] != entry.uid) throw Conflict("The saved record's guard does not match its account. Supervisor review required.")
        check(FirebaseAuth.getInstance().currentUser?.uid == entry.uid) { "Account changed" }
        operation = "saving a $collection record"
        val ref = db.collection(collection).document(entry.id)
        try {
            await(ref.set(data + mapOf("offlineActionId" to entry.id, "syncedAt" to FieldValue.serverTimestamp())))
        } catch (error: Exception) {
            val denied = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<FirebaseFirestoreException>()
                .any { it.code == FirebaseFirestoreException.Code.PERMISSION_DENIED }
            if (!denied) throw error
            // Compatibility with a previously acknowledged write that predates offlineActionId.
            // A guard may read their existing document but may not overwrite immutable evidence.
            val existing = try { await(ref.get(Source.SERVER)) } catch (_: Exception) { throw error }
            if (!existing.exists() || existing.getString("guardId") != entry.uid ||
                existing.getString("offlineActionId")?.let { it != entry.id } == true) throw error
        }
    }

    private fun syncReport(entry: OfflineStore.Entry) {
        // Stable document/photo IDs make retries safe after an uncertain acknowledgement.
        if (alreadySaved("incidents", entry)) return
        val urls = photoFiles(entry).mapIndexed { index, file ->
            check(FirebaseAuth.getInstance().currentUser?.uid == entry.uid) { "Account changed" }
            if (!file.exists()) throw Conflict("Saved photo is missing. Keep this report for supervisor review.")
            val target = FirebaseStorage.getInstance().reference.child("incident_photos/${entry.id}/photo_${index + 1}.jpg")
            val metadata = com.google.firebase.storage.StorageMetadata.Builder().setContentType("image/jpeg").build()
            operation = "uploading report photo ${index + 1}"
            await(target.putFile(Uri.fromFile(file), metadata))
            await(target.downloadUrl).toString()
        }
        val data = entry.payload.mapValue("incident") + mapOf(
            "photoUrls" to urls, "photoCount" to urls.size)
        check(FirebaseAuth.getInstance().currentUser?.uid == entry.uid) { "Account changed" }
        saveRecord("incidents", entry, data)
    }

    private fun syncScan(entry: OfflineStore.Entry) {
        operation = "verifying and saving checkpoint progress"
        val payload = entry.payload
        val patrolRef = db.collection("patrol_logs").document(payload["patrolId"] as String)
        val checkpointRef = db.document(payload["checkpointPath"] as String)
        val auditRef = db.collection("checkpoint_logs").document(entry.id)
        val audit = payload.mapValue("audit")
        await(db.runTransaction { transaction ->
            // Audit receipt and progress are committed atomically.
            val patrol = transaction.get(patrolRef)
            val receipts = (patrol.get("offlineScanReceipts") as? List<*>)?.filterIsInstance<String>().orEmpty()
            if (entry.id in receipts) return@runTransaction
            val checkpoint = transaction.get(checkpointRef)
            val user = transaction.get(db.collection("users").document(entry.uid))
            fun requireSync(condition: Boolean, message: String) {
                if (!condition) throw Conflict(message)
            }
            requireSync(patrol.exists(), "Patrol was removed. Supervisor review required.")
            requireSync(patrol.getString("guardId") == audit["guardId"] && patrol.getString("siteId") == audit["siteId"],
                "Patrol assignment changed. Supervisor review required.")
            val aliases = setOfNotNull(entry.uid, user.getString("guardId"))
            requireSync(audit["guardId"] in aliases, "Guard account does not match this patrol.")
            requireSync(checkpoint.exists(), "Checkpoint was removed. Supervisor review required.")
            requireSync(checkpoint.getString("status")?.trim()?.lowercase() !in setOf("inactive", "disabled", "revoked", "archived"),
                "Checkpoint was deactivated. Supervisor review required.")
            val legacy = checkpointRef.path.startsWith("client_sites/")
            val required = (patrol.get("requiredCheckpointIds") as? List<*>)?.filterIsInstance<String>().orEmpty().toMutableList()
            if (!legacy) {
                requireSync(checkpoint.getString("siteId") == audit["siteId"], "Checkpoint site changed.")
                val assigned = checkpoint.get("assignedGuardIds") as? List<*> ?: emptyList<Any>()
                requireSync(assigned.any { (it as? String)?.trim() in aliases }, "Checkpoint assignment changed. Supervisor review required.")
                requireSync(audit["qrValue"] in listOf(checkpoint.id, checkpoint.get("qrCode"), checkpoint.get("qrPayload")), "Checkpoint QR changed.")
            } else {
                requireSync(checkpoint.id in required, "Legacy checkpoint is no longer required.")
            }
            val latitude = checkpoint.getDouble("latitude") ?: checkpoint.getDouble("lat")
            val longitude = checkpoint.getDouble("longitude") ?: checkpoint.getDouble("lng") ?: checkpoint.getDouble("long")
            requireSync((checkpoint.getBoolean("locationRegistered") ?: checkpoint.getBoolean("isRegistered")) == true && latitude != null && longitude != null,
                "Checkpoint location is no longer registered.")
            val distances = FloatArray(1)
            Location.distanceBetween((audit["scanLatitude"] as Number).toDouble(), (audit["scanLongitude"] as Number).toDouble(), latitude!!, longitude!!, distances)
            requireSync((audit["scanAccuracyMeters"] as Number).toDouble() <= 40 &&
                distances[0] <= (checkpoint.getDouble("geofenceRadiusMeters") ?: 30.0).coerceIn(10.0, 100.0),
                "Checkpoint location changed or GPS proof is outside its radius. Supervisor review required.")
            val completed = (patrol.get("completedCheckpointIds") as? List<*>)?.filterIsInstance<String>().orEmpty().toMutableSet()
            requireSync(checkpoint.id !in completed, "Checkpoint was recorded on another device. Supervisor review required.")
            requireSync(patrol.getString("status") == "IN_PROGRESS", "Patrol is no longer active. Supervisor review required.")
            @Suppress("UNCHECKED_CAST")
            val scan = (payload.mapValue("updates")["checkpointScans"] as List<*>).last() as Map<String, Any?>
            val updates = PatrolProgress.merge(patrol.data.orEmpty(), scan).toMutableMap()
            updates["offlineScanReceipts"] = receipts + entry.id
            updates["updatedAt"] = FieldValue.serverTimestamp()
            transaction.update(patrolRef, updates)
            transaction.set(auditRef, audit + ("syncedAt" to FieldValue.serverTimestamp()))
        })
    }
}
