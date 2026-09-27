package com.example.spot.ui.supervisor

import android.content.Intent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class ReportAdapter(private val reportList: List<ReportModel>) : RecyclerView.Adapter<ReportAdapter.ReportViewHolder>() {

    class ReportViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.tvReportTitle)
        val guard: TextView = view.findViewById(R.id.tvGuardName)
        val date: TextView = view.findViewById(R.id.tvReportDate)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ReportViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_report, parent, false)
        return ReportViewHolder(view)
    }

    override fun onBindViewHolder(holder: ReportViewHolder, position: Int) {
        val report = reportList[position]

        holder.title.text = report.title
        holder.guard.text = "By: ${report.guardName}"
        holder.date.text = "${report.date} at ${report.time}"

        // 🟢 DITO ANG CLICK LISTENER
        holder.itemView.setOnClickListener {
            val context = holder.itemView.context
            val intent = Intent(context, ReportDetailActivity::class.java).apply {
                putExtra("TITLE", report.title)
                putExtra("GUARD", report.guardName)
                putExtra("DATE", "${report.date} at ${report.time}")
                putExtra("DESCRIPTION", report.description)
            }
            context.startActivity(intent)
        }
    }

    override fun getItemCount() = reportList.size
}