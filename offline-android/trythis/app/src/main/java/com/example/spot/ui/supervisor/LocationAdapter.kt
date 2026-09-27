package com.example.spot.ui.supervisor

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class LocationAdapter(
    private val locations: List<LocationTag>,
    private val onEdit: (LocationTag) -> Unit,
    private val onPrint: (LocationTag) -> Unit,
    private val onSync: (LocationTag) -> Unit
) : RecyclerView.Adapter<LocationAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvLocationName)
        val btnEdit: ImageButton = view.findViewById(R.id.btnEdit)
        val btnPrint: ImageButton = view.findViewById(R.id.btnPrint)
        val btnSync: ImageButton = view.findViewById(R.id.btnSyncLocation)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_location_tag, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = locations[position]
        holder.tvName.text = item.name

        holder.btnEdit.setOnClickListener { onEdit(item) }
        holder.btnPrint.setOnClickListener { onPrint(item) }
        holder.btnSync.setOnClickListener { onSync(item) }
    }

    override fun getItemCount() = locations.size
}