package com.example.spot.offline

import com.google.firebase.Timestamp
import org.junit.Assert.*
import org.junit.Test

class PatrolProgressTest {
    private fun scan(id: String, seconds: Long = 120) = mapOf(
        "checkpointId" to id, "checkpointName" to id, "scannedAt" to Timestamp(seconds, 0))

    @Test fun mergesConcurrentServerProgressWithoutLosingIt() {
        val base = mapOf("requiredCheckpointIds" to listOf("a", "b", "c"),
            "completedCheckpointIds" to listOf("a"), "checkpointScans" to listOf(scan("a")))
        val result = PatrolProgress.merge(base, scan("b"))
        assertEquals(listOf("a", "b"), result["completedCheckpointIds"])
        assertEquals(2, result["completedCheckpoints"])
        assertFalse(result.containsKey("completedAt"))
        assertEquals(2, (result["checkpointScans"] as List<*>).size)
    }

    @Test fun completionUsesOccurrenceTimeRatherThanReconnectTime() {
        val result = PatrolProgress.merge(mapOf("requiredCheckpointIds" to listOf("a"),
            "startedAt" to Timestamp(60L, 0)), scan("a", 180L))
        assertEquals("COMPLETED", result["status"])
        assertEquals(Timestamp(180L, 0), result["completedAt"])
        assertEquals(120L, result["durationSeconds"])
        assertEquals("pending", result["emailStatus"])
    }

    @Test fun nonRequiredHistoricalIdsDoNotInflateCompletion() {
        val result = PatrolProgress.merge(mapOf("requiredCheckpointIds" to listOf("a", "b", "b"),
            "completedCheckpointIds" to listOf("removed")), scan("a"))
        assertEquals(1, result["completedCheckpoints"])
        assertEquals(2, result["totalCheckpoints"])
        assertFalse(result.containsKey("completedAt"))
    }

    @Test(expected = IllegalStateException::class) fun duplicateEvidenceCannotAdvanceProgress() {
        PatrolProgress.merge(mapOf("completedCheckpointIds" to listOf("a")), scan("a"))
    }

    @Test fun newAssignedCheckpointRepairsLegacyNamesAndKeepsFirstScanTime() {
        val result = PatrolProgress.merge(mapOf("requiredCheckpointIds" to listOf("a"),
            "requiredCheckpointNames" to emptyList<String>(), "firstCheckpointScannedAt" to Timestamp(1L, 0)), scan("b"))
        assertEquals(listOf("Checkpoint", "b"), result["requiredCheckpointNames"])
        assertFalse(result.containsKey("firstCheckpointScannedAt"))
    }
}
