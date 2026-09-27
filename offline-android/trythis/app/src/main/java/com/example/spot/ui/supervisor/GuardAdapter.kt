package com.example.spot.ui.supervisor

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class GuardAdapter(
    private val attendanceList: List<AttendanceModel>,
    private val onItemClick: (AttendanceModel) -> Unit,
    private val onRemoveClick: (AttendanceModel) -> Unit
) : RecyclerView.Adapter<GuardAdapter.GuardViewHolder>() {

    class GuardViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvGuardName: TextView? = view.findViewById(R.id.tvGuardNameTitle)
        val tvDutyTime: TextView? = view.findViewById(R.id.tvDutyTime)
        val btnRemoveGuardRow: ImageButton? = view.findViewById(R.id.btnRemoveGuardRow)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): GuardViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_guard, parent, false)
        return GuardViewHolder(view)
    }

    override fun onBindViewHolder(holder: GuardViewHolder, position: Int) {
        val attendance = attendanceList[position]

        // 1. Display Guard Name
        holder.tvGuardName?.text = attendance.guardName

        // 2. Display Shift/Duty Time
        if (attendance.startTime.isNotBlank() && attendance.endTime.isNotBlank()) {
            holder.tvDutyTime?.text = "Shift: ${attendance.startTime} - ${attendance.endTime}"
            holder.tvDutyTime?.visibility = View.VISIBLE
        } else {
            holder.tvDutyTime?.visibility = View.GONE
        }

        // 3. Click listeners
        holder.itemView.setOnClickListener {
            onItemClick(attendance)
        }

        holder.btnRemoveGuardRow?.setOnClickListener {
            onRemoveClick(attendance)
        }
    }

    override fun getItemCount(): Int = attendanceList.size
}