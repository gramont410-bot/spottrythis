package com.example.spot.ui.supervisor

import android.os.Bundle
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.example.spot.R

class ReportDetailActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_report_detail)

        // 1. I-link ang Back Button at TextViews
        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val tvTitle = findViewById<TextView>(R.id.tvDetailTitle)
        val tvGuard = findViewById<TextView>(R.id.tvDetailGuard)
        val tvDate = findViewById<TextView>(R.id.tvDetailDate)
        val tvDescription = findViewById<TextView>(R.id.tvDetailDescription)

        // 2. I-set ang Back Button action
        btnBack.setOnClickListener {
            // Ito ang magbabalik sa user sa previous screen
            onBackPressedDispatcher.onBackPressed()
        }

        // 3. Kunin ang data na pinasa mula sa ReportAdapter
        val title = intent.getStringExtra("TITLE")
        val guard = intent.getStringExtra("GUARD")
        val date = intent.getStringExtra("DATE")
        val desc = intent.getStringExtra("DESCRIPTION")

        // 4. I-set ang text sa mga TextViews
        tvTitle.text = title
        tvGuard.text = "Guard: $guard"
        tvDate.text = date
        tvDescription.text = desc
    }
}