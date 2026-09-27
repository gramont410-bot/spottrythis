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
import com.google.firebase.firestore.ListenerRegistration

class GuardScheduleActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private lateinit var guardId: String
    private lateinit var guardName: String

    private val attendanceList = mutableListOf<Map<String, Any>>()
    private lateinit var attendanceAdapter: GuardAttendanceAdapter
    private var attendanceListener: ListenerRegistration? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_guard_schedule)

        // 1. Kunin ang ID at Pangalan mula sa Intent
        guardId = intent.getStringExtra("GUARD_ID") ?: ""
        guardName = intent.getStringExtra("GUARD_NAME") ?: "Guard Attendance History"

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        btnBack.setOnClickListener { onBackPressedDispatcher.onBackPressed() }

        val tvTitle = findViewById<TextView>(R.id.tvGuardNameTitle) ?: findViewById(R.id.tvGuardName)
        tvTitle?.text = "Attendance: $guardName"

        val rvSchedule = findViewById<RecyclerView>(R.id.rvSchedule)

        // 2. Setup Adapter
        attendanceAdapter = GuardAttendanceAdapter(attendanceList, guardName)
        rvSchedule.layoutManager = LinearLayoutManager(this)
        rvSchedule.adapter = attendanceAdapter

        // 3. I-check kung may pumasok na Guard ID
        if (guardId.isNotEmpty()) {
            listenToGuardAttendance()
        } else {
            Toast.makeText(this, "Error: Walang Guard ID na natanggap!", Toast.LENGTH_LONG).show()
        }
    }

    private fun listenToGuardAttendance() {
        attendanceListener = db.collection("attendance")
            .whereEqualTo("guardId", guardId)
            .addSnapshotListener { snapshots, error ->
                if (error != null) {
                    Toast.makeText(this, "Query Error: ${error.message}", Toast.LENGTH_LONG).show()
                    return@addSnapshotListener
                }

                attendanceList.clear()

                if (snapshots != null && !snapshots.isEmpty) {
                    for (doc in snapshots) {
                        val data = doc.data
                        attendanceList.add(data)
                    }
                }

                attendanceAdapter.notifyDataSetChanged()
            }
    }

    override fun onDestroy() {
        super.onDestroy()
        attendanceListener?.remove()
    }
}