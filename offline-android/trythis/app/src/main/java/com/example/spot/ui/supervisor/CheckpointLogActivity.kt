package com.example.spot.ui.supervisor

import android.os.Bundle
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query

class CheckpointLogActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private val logList = mutableListOf<CheckpointLogModel>()
    private lateinit var logAdapter: CheckpointLogAdapter
    private var siteId: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_checkpoint_logs)

        siteId = intent.getStringExtra("SITE_ID") ?: ""
        val siteName = intent.getStringExtra("SITE_NAME") ?: "Site"

        val btnBack = findViewById<ImageButton>(R.id.btnBackLogs)
        val tvTitle = findViewById<TextView>(R.id.tvLogsTitle)
        val rvLogs = findViewById<RecyclerView>(R.id.rvCheckpointLogs)

        tvTitle.text = "Logs: $siteName"
        btnBack.setOnClickListener { finish() }

        logAdapter = CheckpointLogAdapter(logList)
        rvLogs.layoutManager = LinearLayoutManager(this)
        rvLogs.adapter = logAdapter

        if (siteId.isNotEmpty()) {
            loadCheckpointLogs()
        } else {
            Toast.makeText(this, "Error: Site ID missing", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    private fun loadCheckpointLogs() {
        db.collection("checkpoint_logs")
            .whereEqualTo("siteId", siteId)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshots, e ->
                if (e != null) {
                    Toast.makeText(this, "Error loading logs: ${e.message}", Toast.LENGTH_SHORT).show()
                    return@addSnapshotListener
                }

                logList.clear()
                snapshots?.forEach { doc ->
                    val log = doc.toObject(CheckpointLogModel::class.java)
                    logList.add(log)
                }
                logAdapter.notifyDataSetChanged()
            }
    }
}
