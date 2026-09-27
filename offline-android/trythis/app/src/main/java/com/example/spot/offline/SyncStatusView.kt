package com.example.spot.offline

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.example.spot.R
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.Timestamp
import java.text.SimpleDateFormat
import java.util.Locale

/** Visible pending/error state; never label locally saved data as server-synced. */
object SyncStatusView {
    private fun actionName(entry: OfflineStore.Entry): String = when (entry.kind) {
        "report" -> {
            val title = entry.payload.mapValue("incident")["title"] as? String
            "Incident report: ${title?.takeIf { it.isNotBlank() } ?: "Untitled report"}"
        }
        "scan" -> {
            val name = entry.payload.mapValue("audit")["checkpointName"] as? String
            "Checkpoint scan: ${name?.takeIf { it.isNotBlank() } ?: "Checkpoint"}"
        }
        "location" -> {
            val site = entry.payload["siteName"] as? String
            "GPS location record${site?.takeIf { it.isNotBlank() }?.let { ": $it" }.orEmpty()}"
        }
        else -> "Saved patrol action"
    }

    private fun describeActions(entries: List<OfflineStore.Entry>): String {
        if (entries.isEmpty()) return "No saved patrol actions are waiting to sync."
        return entries.mapIndexed { index, entry ->
            val details = when (entry.kind) {
                "report" -> entry.payload.mapValue("incident")
                "scan" -> entry.payload.mapValue("audit")
                else -> entry.payload
            }
            val timestamp = (details["deviceTimestamp"] ?: details["createdAt"] ?: details["timestamp"]) as? Timestamp
            val recordedAt = timestamp?.let {
                SimpleDateFormat("MMM d, yyyy 'at' h:mm a", Locale.getDefault()).format(it.toDate())
            }
            val photos = if (entry.kind == "report") (entry.payload["photos"] as? List<*>)?.size ?: 0 else 0
            buildString {
                append("${index + 1}. ${actionName(entry)}")
                if (recordedAt != null) append("\nRecorded: $recordedAt")
                if (photos > 0) append("\n$photos ${if (photos == 1) "photo" else "photos"} attached")
                append("\n${entry.error?.let { "Needs attention: $it" } ?: "Waiting to sync"}")
            }
        }.joinToString("\n\n")
    }

    fun attach(activity: Activity) {
        val label = activity.findViewById<TextView>(R.id.tvSyncStatus)
        val handler = Handler(Looper.getMainLooper())
        var stopped = false
        var entries = emptyList<OfflineStore.Entry>()
        var syncDialog: AlertDialog? = null
        val refresh = object : Runnable {
            override fun run() {
                if (stopped || activity.isDestroyed || activity.isFinishing) return
                val uid = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
                Tasks.call(OfflinePatrol.io) { OfflineStore.get(activity).entries(uid) }
                    .addOnSuccessListener { current ->
                        if (stopped) return@addOnSuccessListener
                        entries = current
                        val pending = current.count { it.error == null }
                        val errors = current.size - pending
                        val network = if (OfflinePatrol.online(activity)) "Online" else "Offline"
                        label.text = when {
                            errors > 0 -> "$network · $pending pending · $errors need attention — tap to review"
                            pending == 1 -> "$network · ${actionName(current.single())} — waiting to sync"
                            pending > 1 -> "$network · $pending actions waiting to sync — tap to view details"
                            else -> "$network · No pending patrol actions"
                        }
                        syncDialog?.setMessage(describeActions(current))
                    }.addOnCompleteListener {
                        if (!stopped) handler.postDelayed(this, 3000)
                    }
            }
        }
        label.setOnClickListener {
            syncDialog?.dismiss()
            syncDialog = AlertDialog.Builder(activity).setTitle("Patrol sync")
                .setMessage(describeActions(entries))
                .setPositiveButton("Retry") { _, _ ->
                    val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return@setPositiveButton
                    Tasks.call(OfflinePatrol.io) {
                        OfflineStore.get(activity).retry(uid)
                        OfflinePatrol.schedule(activity)
                    }
                }.setNegativeButton("Close", null).show()
        }
        label.addOnAttachStateChangeListener(object : android.view.View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(view: android.view.View) { stopped = false; handler.post(refresh) }
            override fun onViewDetachedFromWindow(view: android.view.View) {
                stopped = true
                handler.removeCallbacks(refresh)
                syncDialog?.dismiss()
                syncDialog = null
            }
        })
        if (label.isAttachedToWindow) handler.post(refresh)
        OfflinePatrol.schedule(activity)
    }
}
