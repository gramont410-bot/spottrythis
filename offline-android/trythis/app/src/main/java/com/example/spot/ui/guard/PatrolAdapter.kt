package com.example.spot.ui.guard

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.PatrolModel
import com.example.spot.R

class PatrolAdapter(
    private val patrolList: List<PatrolModel>,
    private val onItemClick: ((PatrolModel) -> Unit)? = null,
    private val onEdit: ((PatrolModel) -> Unit)? = null,
    private val onDelete: ((PatrolModel) -> Unit)? = null
) : RecyclerView.Adapter<PatrolAdapter.PatrolViewHolder>() {

    class PatrolViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvDate: TextView = view.findViewById(R.id.tvPatrolDate)
        val tvTime: TextView = view.findViewById(R.id.tvPatrolTime)

        // Maaaring null ang mga ito kung hindi sila kasama sa layout ng Guard
        val btnEdit: ImageButton? = view.findViewById(R.id.btnEdit)
        val btnDelete: ImageButton? = view.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PatrolViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_patrol, parent, false)
        return PatrolViewHolder(view)
    }

    override fun onBindViewHolder(holder: PatrolViewHolder, position: Int) {
        val patrol = patrolList[position]
        holder.tvDate.text = patrol.patrolDate
        holder.tvTime.text = patrol.patrolTime

        // General Click Action
        holder.itemView.setOnClickListener { onItemClick?.invoke(patrol) }

        // Logic para sa Supervisor Buttons
        if (onEdit != null) {
            holder.btnEdit?.visibility = View.VISIBLE
            holder.btnEdit?.setOnClickListener { onEdit.invoke(patrol) }
        } else {
            holder.btnEdit?.visibility = View.GONE
        }

        if (onDelete != null) {
            holder.btnDelete?.visibility = View.VISIBLE
            holder.btnDelete?.setOnClickListener { onDelete.invoke(patrol) }
        } else {
            holder.btnDelete?.visibility = View.GONE
        }
    }

    override fun getItemCount() = patrolList.size
}