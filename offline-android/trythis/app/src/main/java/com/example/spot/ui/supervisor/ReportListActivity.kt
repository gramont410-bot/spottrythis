package com.example.spot.ui.supervisor

import android.os.Bundle
import android.util.Log
import android.widget.ImageButton
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R
import com.example.spot.ui.supervisor.ReportModel // Siguraduhin na tama ang package path ng ReportModel mo
import com.example.spot.ui.supervisor.ReportAdapter // Siguraduhin na tama ang package path ng ReportAdapter mo
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query

class ReportListActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private val reportList = mutableListOf<ReportModel>()
    private lateinit var reportAdapter: ReportAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_report_list)

        // 1. Kunin ang siteName mula sa intent
        val siteName = intent.getStringExtra("SITE_NAME") ?: ""

        val rvReports = findViewById<RecyclerView>(R.id.rvReports)
        val btnBack = findViewById<ImageButton>(R.id.btnBackToSiteControl) // Siguraduhin na ito ang ID sa xml mo

        btnBack?.setOnClickListener { finish() }

        // 2. Setup RecyclerView
        reportAdapter = ReportAdapter(reportList)
        rvReports.layoutManager = LinearLayoutManager(this)
        rvReports.adapter = reportAdapter

        // 3. I-fetch ang reports kung may nakuha tayong siteName
        if (siteName.isNotEmpty()) {
            fetchReports(siteName)
        } else {
            Toast.makeText(this, "Error: Site name not found.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun fetchReports(siteName: String) {
        Log.d("DEBUG_QUERY", "Nag-hahanap ng reports para sa site: '$siteName'")

        db.collection("reports")
            .whereEqualTo("assignedSite", siteName)
            .get()
            .addOnSuccessListener { snapshots ->
                // 1. Gumawa ng temporary list
                val tempList = mutableListOf<ReportModel>()
                for (doc in snapshots) {
                    val report = doc.toObject(ReportModel::class.java)
                    tempList.add(report)
                }

                // 2. I-clear ang main list
                reportList.clear()

                // 3. I-add lahat ng laman ng temp list
                reportList.addAll(tempList)

                Log.d("DEBUG_QUERY", "Bilang ng reports na nahanap: ${reportList.size}")

                // 4. I-notify ang adapter
                if (reportList.isEmpty()) {
                    Toast.makeText(this, "Walang reports para sa '$siteName'", Toast.LENGTH_SHORT).show()
                } else {
                    reportAdapter.notifyDataSetChanged()
                }
            }
            .addOnFailureListener { e ->
                Log.e("REPORT_ERROR", "Error: ${e.message}")
            }
    }
}