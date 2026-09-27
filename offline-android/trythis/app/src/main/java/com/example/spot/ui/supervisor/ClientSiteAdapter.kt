package com.example.spot.ui.supervisor

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R

class ClientSiteAdapter(
    private var siteList: List<ClientSiteModel>,
    private val onSiteClick: (ClientSiteModel) -> Unit
) : RecyclerView.Adapter<ClientSiteAdapter.SiteViewHolder>() {

    class SiteViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvSiteName: TextView = view.findViewById(R.id.tvSiteName)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): SiteViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_client_site, parent, false)
        return SiteViewHolder(view)
    }

    override fun onBindViewHolder(holder: SiteViewHolder, position: Int) {
        val site = siteList[position]
        holder.tvSiteName.text = site.siteName

        holder.itemView.setOnClickListener { onSiteClick(site) }
    }

    override fun getItemCount(): Int = siteList.size

    fun updateData(newLines: List<ClientSiteModel>) {
        this.siteList = newLines
        notifyDataSetChanged()
    }
}