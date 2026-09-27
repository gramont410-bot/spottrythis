package com.example.spot.offline

import android.app.Application
import android.database.sqlite.SQLiteConstraintException
import com.google.firebase.Timestamp
import org.junit.Assert.*
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.SQLiteMode

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [28])
@SQLiteMode(SQLiteMode.Mode.LEGACY)
class OfflineStoreTest {
    private lateinit var store: OfflineStore
    private fun scan(checkpoint: String) = mapOf("checkpointScans" to listOf(mapOf(
        "checkpointId" to checkpoint, "checkpointName" to checkpoint, "scannedAt" to Timestamp(1700000000L, 0))))
    @Before fun prepare() {
        store = OfflineStore(RuntimeEnvironment.getApplication())
        store.writableDatabase.delete("outbox", null, null)
    }
    @After fun close() { store.close() }

    @Test fun savedReportSurvivesDatabaseReopenWithPhotosAndExactTimestamp() {
        val time = Timestamp(1700000000L, 123456789)
        store.put("report", "guard", "report", mapOf("incident" to mapOf("createdAt" to time, "description" to "Gate damaged"),
            "photos" to listOf("/private/photo.jpg")))
        store.close()
        val recovered = store.entries("guard").single()
        assertEquals(time, recovered.payload.mapValue("incident")["createdAt"])
        assertEquals(listOf("/private/photo.jpg"), recovered.payload["photos"])
    }

    @Test fun accountsCannotReadOrRetryEachOthersQueue() {
        store.put("a", "guardA", "report", emptyMap())
        store.put("b", "guardB", "report", emptyMap())
        store.fail("a", "Access denied")
        store.retry("guardB")
        assertEquals(listOf("b"), store.entries("guardB").map { it.id })
        assertEquals("Access denied", store.entries("guardA").single().error)
    }

    @Test fun repeatedScanCannotOverwriteOriginalEvidence() {
        store.put("patrol_checkpoint", "guard", "scan", mapOf("qrValue" to "original"))
        try {
            store.put("patrol_checkpoint", "guard", "scan", mapOf("qrValue" to "duplicate"))
            fail("Duplicate checkpoint should be rejected")
        } catch (_: SQLiteConstraintException) { }
        assertEquals("original", store.entries("guard").single().payload["qrValue"])
    }

    @Test fun sequentialScansProjectCompletionOnlyOnTheirPatrol() {
        store.put("scan1", "guard", "scan", mapOf("patrolId" to "patrol", "updates" to scan("gate")))
        store.put("scan2", "guard", "scan", mapOf("patrolId" to "patrol", "updates" to scan("lobby")))
        val base = mapOf("status" to "IN_PROGRESS", "requiredCheckpointIds" to listOf("gate", "lobby"))
        val patrol = store.projectPatrol("guard", "patrol", true, base)
        assertEquals("COMPLETED", patrol.getString("status"))
        assertEquals(listOf("gate", "lobby"), patrol.get("completedCheckpointIds"))
        assertEquals("IN_PROGRESS", store.projectPatrol("guard", "other", true, base).getString("status"))
        assertEquals("IN_PROGRESS", store.projectPatrol("otherGuard", "patrol", true, base).getString("status"))
    }

    @Test fun blockedEvidenceIsRetainedAndCanBeRetriedWithoutChangingPayload() {
        val data = mapOf("patrolId" to "patrol", "updates" to scan("gate"))
        store.put("scan", "guard", "scan", data)
        store.fail("scan", "Checkpoint revoked")
        assertEquals("IN_PROGRESS", store.projectPatrol("guard", "patrol", true, mapOf("status" to "IN_PROGRESS")).getString("status"))
        assertEquals(data, store.entries("guard").single().payload)
        store.retry("guard")
        assertEquals("COMPLETED", store.projectPatrol("guard", "patrol", true, emptyMap()).getString("status"))
    }

    @Test fun laterPendingScanDoesNotCountRejectedEarlierScan() {
        store.put("first", "guard", "scan", mapOf("patrolId" to "patrol", "updates" to scan("gate")))
        store.put("second", "guard", "scan", mapOf("patrolId" to "patrol", "updates" to scan("lobby")))
        store.fail("first", "Checkpoint was reassigned")
        val base = mapOf("status" to "IN_PROGRESS", "requiredCheckpointIds" to listOf("gate", "lobby"))
        val projected = store.projectPatrol("guard", "patrol", true, base)
        assertEquals(listOf("lobby"), projected.get("completedCheckpointIds"))
        assertEquals("IN_PROGRESS", projected.getString("status"))
    }

    @Test fun serverAcknowledgedScanIsNotDoubleCountedInLocalProjection() {
        store.put("pending", "guard", "scan", mapOf("patrolId" to "patrol", "updates" to scan("gate")))
        val base = mapOf("status" to "IN_PROGRESS", "requiredCheckpointIds" to listOf("gate", "lobby"),
            "completedCheckpointIds" to listOf("gate"))
        val projected = store.projectPatrol("guard", "patrol", true, base)
        assertEquals(listOf("gate"), projected.get("completedCheckpointIds"))
        assertEquals("IN_PROGRESS", projected.getString("status"))
    }

    @Test fun acknowledgingOneActionKeepsOtherActions() {
        store.put("a", "guard", "report", emptyMap())
        store.put("b", "guard", "location", mapOf("accuracy" to null, "latitude" to 14.5))
        store.remove("a")
        val entry = store.entries("guard").single()
        assertEquals("b", entry.id)
        assertNull(entry.payload["accuracy"])
        assertEquals(14.5, entry.payload["latitude"])
    }

    @Test fun unsupportedValuesCannotSilentlyCorruptTheQueue() {
        try {
            store.put("bad", "guard", "scan", mapOf("value" to Any()))
            fail("Unsupported data should be rejected before insertion")
        } catch (_: IllegalStateException) { }
        assertTrue(store.entries("guard").isEmpty())
    }
}
