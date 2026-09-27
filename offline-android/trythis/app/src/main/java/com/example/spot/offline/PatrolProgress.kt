package com.example.spot.offline

import com.google.firebase.Timestamp

/** Merge one piece of evidence, rather than overwriting progress from a stale offline snapshot. */
object PatrolProgress {
    fun merge(base: Map<String, Any?>, scan: Map<String, Any?>): Map<String, Any> {
        val checkpointId = scan["checkpointId"] as String
        val time = scan["scannedAt"] as Timestamp
        val required = (base["requiredCheckpointIds"] as? List<*>)?.filterIsInstance<String>().orEmpty().toMutableList()
        val names = (base["requiredCheckpointNames"] as? List<*>)?.filterIsInstance<String>().orEmpty().toMutableList()
        val completed = (base["completedCheckpointIds"] as? List<*>)?.filterIsInstance<String>().orEmpty().toMutableSet()
        check(checkpointId !in completed) { "CHECKPOINT_ALREADY_SCANNED" }
        if (checkpointId !in required) {
            while (names.size < required.size) names.add("Checkpoint")
            while (names.size > required.size) names.removeAt(names.lastIndex)
            required.add(checkpointId)
            names.add(scan["checkpointName"] as? String ?: "Checkpoint")
        }
        completed.add(checkpointId)
        val scans = (base["checkpointScans"] as? List<*>)?.toMutableList() ?: mutableListOf()
        scans.add(scan)
        val count = required.toSet().count { it in completed }
        return mutableMapOf<String, Any>(
            "requiredCheckpointIds" to required, "requiredCheckpointNames" to names,
            "completedCheckpointIds" to completed.toList(), "checkpointScans" to scans,
            "completedCheckpoints" to count, "totalCheckpoints" to required.toSet().size,
            "updatedAt" to time
        ).apply {
            if (base["firstCheckpointScannedAt"] == null) put("firstCheckpointScannedAt", time)
            if (required.isNotEmpty() && count == required.toSet().size) {
                put("status", "COMPLETED")
                put("completedAt", time)
                put("durationSeconds", (time.seconds - ((base["startedAt"] as? Timestamp)?.seconds ?: time.seconds)).coerceAtLeast(0L))
                put("emailStatus", "pending")
            }
        }
    }
}
