package com.example.spot.offline

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import org.json.JSONArray
import org.json.JSONObject

/** Private, durable outbox. Rows belong to the Firebase UID that recorded them. */
class OfflineStore internal constructor(context: Context) :
    SQLiteOpenHelper(context, "patrol_outbox.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, error TEXT, created INTEGER NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    data class Entry(val id: String, val uid: String, val kind: String, val payload: Map<String, Any?>, val error: String?)

    fun put(id: String, uid: String, kind: String, payload: Map<String, Any?>) {
        writableDatabase.insertOrThrow("outbox", null, ContentValues().apply {
            put("id", id); put("uid", uid); put("kind", kind)
            put("payload", Codec.encode(payload).toString()); put("created", System.currentTimeMillis())
        })
    }

    fun entries(uid: String): List<Entry> = readableDatabase.query(
        "outbox", null, "uid = ?", arrayOf(uid), null, null, "created ASC, rowid ASC"
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                fun value(name: String) = cursor.getString(cursor.getColumnIndexOrThrow(name))
                add(Entry(value("id"), uid, value("kind"), Codec.map(JSONObject(value("payload"))), value("error")))
            }
        }
    }

    fun remove(id: String) { writableDatabase.delete("outbox", "id = ?", arrayOf(id)) }
    fun fail(id: String, error: String) {
        writableDatabase.update("outbox", ContentValues().apply { put("error", error) }, "id = ?", arrayOf(id))
    }
    fun retry(uid: String) {
        writableDatabase.update("outbox", ContentValues().apply { putNull("error") }, "uid = ?", arrayOf(uid))
    }

    fun patrol(uid: String, document: DocumentSnapshot): LocalPatrol {
        return projectPatrol(uid, document.id, document.exists(), document.data.orEmpty())
    }

    fun projectPatrol(uid: String, id: String, present: Boolean, base: Map<String, Any?>): LocalPatrol {
        val data = base.toMutableMap()
        entries(uid).filter { it.kind == "scan" && it.error == null && it.payload["patrolId"] == id }
            .forEach { entry ->
                @Suppress("UNCHECKED_CAST")
                val scan = (entry.payload.mapValue("updates")["checkpointScans"] as? List<*>)?.lastOrNull() as? Map<String, Any?>
                val completed = data["completedCheckpointIds"] as? List<*> ?: emptyList<Any>()
                if (scan != null && scan["checkpointId"] !in completed) data.putAll(PatrolProgress.merge(data, scan))
            }
        return LocalPatrol(present, data)
    }

    companion object {
        @Volatile private var instance: OfflineStore? = null
        fun get(context: Context): OfflineStore = instance ?: synchronized(this) {
            instance ?: OfflineStore(context.applicationContext).also { instance = it }
        }
    }
}

class LocalPatrol(private val present: Boolean, private val data: Map<String, Any?>) {
    fun exists() = present
    fun get(key: String): Any? = data[key]
    fun getString(key: String) = data[key] as? String
    fun getTimestamp(key: String) = data[key] as? Timestamp
}

@Suppress("UNCHECKED_CAST")
fun Map<String, Any?>.mapValue(key: String) = this[key] as? Map<String, Any?> ?: emptyMap()

/** Preserve Firestore timestamps across process death; never stringify unknown values. */
object Codec {
    fun encode(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Timestamp -> JSONObject().put("__timestamp", true).put("seconds", value.seconds).put("nanos", value.nanoseconds)
        is Map<*, *> -> JSONObject().also { obj -> value.forEach { (k, v) -> obj.put(k as String, encode(v)) } }
        is Iterable<*> -> JSONArray().also { array -> value.forEach { array.put(encode(it)) } }
        is String, is Boolean, is Number -> value
        else -> error("Unsupported offline value: ${value.javaClass.name}")
    }
    fun decode(value: Any?): Any? = when (value) {
        JSONObject.NULL, null -> null
        is JSONObject -> if (value.optBoolean("__timestamp")) Timestamp(value.getLong("seconds"), value.getInt("nanos")) else map(value)
        is JSONArray -> (0 until value.length()).map { decode(value.get(it)) }
        else -> value
    }
    fun map(value: JSONObject): Map<String, Any?> = value.keys().asSequence().associateWith { decode(value.get(it)) }
}
