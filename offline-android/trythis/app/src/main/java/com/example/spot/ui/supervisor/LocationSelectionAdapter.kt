package com.example.spot.ui.supervisor

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class LocationSelectionAdapter(
    private val locations: List<LocationTag>,
    private val onSelectionChanged: () -> Unit
) : RecyclerView.Adapter<LocationSelectionAdapter.ViewHolder>() {

    private val selectedLocationIds = mutableSetOf<String>()

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val cbLocation: CheckBox = view.findViewById(R.id.cbLocation)
        val tvLocationName: TextView = view.findViewById(R.id.tvLocationName)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_assign_location, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val location = locations[position]
        holder.tvLocationName.text = location.name
        
        // Remove listener before setting checked state to avoid recursion
        holder.cbLocation.setOnCheckedChangeListener(null)
        holder.cbLocation.isChecked = selectedLocationIds.contains(location.id)
        
        holder.cbLocation.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                selectedLocationIds.add(location.id)
            } else {
                selectedLocationIds.remove(location.id)
            }
            onSelectionChanged()
        }

        holder.itemView.setOnClickListener {
            holder.cbLocation.isChecked = !holder.cbLocation.isChecked
        }
    }

    override fun getItemCount(): Int = locations.size

    fun getSelectedIds(): List<String> = selectedLocationIds.toList()

    fun setSelectedIds(ids: List<String>) {
        selectedLocationIds.clear()
        selectedLocationIds.addAll(ids)
        notifyDataSetChanged()
    }

    fun selectAll(select: Boolean) {
        if (select) {
            selectedLocationIds.addAll(locations.map { it.id })
        } else {
            selectedLocationIds.clear()
        }
        notifyDataSetChanged()
        onSelectionChanged()
    }

    fun isAllSelected(): Boolean = selectedLocationIds.size == locations.size && locations.isNotEmpty()
}
