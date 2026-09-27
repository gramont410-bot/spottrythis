package com.example.spot.ui.supervisor

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class CheckpointLogAdapter(private val logs: List<CheckpointLogModel>) :
    RecyclerView.Adapter<CheckpointLogAdapter.LogViewHolder>() {

    class LogViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvLocation: TextView = view.findViewById(R.id.tvLogLocation)
        val tvGuard: TextView = view.findViewById(R.id.tvLogGuard)
        val tvDateTime: TextView = view.findViewById(R.id.tvLogDateTime)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): LogViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_checkpoint_log, parent, false)
        return LogViewHolder(view)
    }

    override fun onBindViewHolder(holder: LogViewHolder, position: Int) {
        val log = logs[position]
        holder.tvLocation.text = log.locationName
        holder.tvGuard.text = "Guard: ${log.guardName}"
        holder.tvDateTime.text = "${log.date} | ${log.time}"
    }

    override fun getItemCount() = logs.size
}
