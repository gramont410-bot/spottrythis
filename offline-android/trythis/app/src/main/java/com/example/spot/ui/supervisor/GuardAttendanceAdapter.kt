package com.example.spot.ui.supervisor

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class GuardAttendanceAdapter(
    private val attendanceList: List<Map<String, Any>>,
    private val defaultGuardName: String
) : RecyclerView.Adapter<GuardAttendanceAdapter.AttendanceViewHolder>() {

    class AttendanceViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvGuardName: TextView = view.findViewById(R.id.tvGuardNameTitle)
        val tvAttendanceInfo: TextView = view.findViewById(R.id.tvDutyTime)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AttendanceViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_guard, parent, false)
        return AttendanceViewHolder(view)
    }

    override fun onBindViewHolder(holder: AttendanceViewHolder, position: Int) {
        val attendance = attendanceList[position]

        val name = attendance["guardName"] as? String ?: defaultGuardName
        val date = attendance["date"] as? String ?: "---"
        val timeIn = attendance["timeIn"] as? String ?: "--:--"
        val timeOut = attendance["timeOut"] as? String ?: "Active"
        val status = attendance["status"] as? String ?: "PRESENT"

        holder.tvGuardName.text = name
        
        // Displaying a detailed attendance summary with both Time-In and Time-Out
        val infoText = if (timeOut == "Active" || timeOut.isBlank()) {
            "In: $timeIn | Shift Active ($date)"
        } else {
            "In: $timeIn | Out: $timeOut ($date)"
        }
        holder.tvAttendanceInfo.text = infoText

        // Hide the delete button for history records
        val btnDelete = holder.itemView.findViewById<View>(R.id.btnRemoveGuardRow)
        btnDelete?.visibility = View.GONE
    }

    override fun getItemCount(): Int = attendanceList.size
}
