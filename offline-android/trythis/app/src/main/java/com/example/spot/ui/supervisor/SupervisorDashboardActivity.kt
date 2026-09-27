package com.example.spot.ui.supervisor

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R
import com.example.spot.ui.login.LoginActivity
import com.google.android.material.button.MaterialButton
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.util.Calendar
import java.util.Locale

/**
 * Mobile supervisor/admin dashboard.
 *
 * The web app currently uses the top-level `sites` collection while older
 * Android supervisor screens used `client_sites`.
 *
 * This dashboard merges both so a supervisor can open a web-created site,
 * then use SiteControlCenter -> QR Checkpoints to register physical QR GPS.
 */
class SupervisorDashboardActivity : AppCompatActivity() {

    private val db =
        FirebaseFirestore.getInstance()

    private val auth =
        FirebaseAuth.getInstance()

    private val siteList =
        mutableListOf<ClientSiteModel>()

    private val filteredSiteList =
        mutableListOf<ClientSiteModel>()

    private lateinit var siteAdapter:
            ClientSiteAdapter

    private var modernSites =
        emptyList<ClientSiteModel>()

    private var legacySites =
        emptyList<ClientSiteModel>()

    private var sitesListener:
            ListenerRegistration? = null

    private var clientSitesListener:
            ListenerRegistration? = null

    private var currentSearch =
        ""


    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(
            savedInstanceState
        )

        setContentView(
            R.layout.activity_supervisor_dashboard
        )

        val tvSupervisorGreeting =
            findViewById<TextView>(
                R.id.tvSupervisorGreeting
            )

        val tvSupervisorName =
            findViewById<TextView>(
                R.id.tvSupervisorName
            )

        val btnViewReports =
            findViewById<MaterialButton>(
                R.id.btnViewSiteReports
            )

        val btnLogout =
            findViewById<android.widget.ImageButton>(
                R.id.btnLogout
            )

        val btnAddSite =
            findViewById<MaterialButton>(
                R.id.btnUiAddSite
            )

        val rvClientSites =
            findViewById<RecyclerView>(
                R.id.rvClientSites
            )

        val etSearchSite =
            findViewById<EditText>(
                R.id.etSearchSite
            )

        rvClientSites.layoutManager =
            LinearLayoutManager(
                this
            )

        siteAdapter =
            ClientSiteAdapter(
                filteredSiteList
            ) {
                    selectedSite ->

                val intent =
                    Intent(
                        this,
                        SiteControlCenterActivity::class.java
                    ).apply {
                        putExtra(
                            "SITE_ID",
                            selectedSite.siteId
                        )

                        putExtra(
                            "SITE_NAME",
                            selectedSite.siteName
                        )
                    }

                startActivity(
                    intent
                )
            }

        rvClientSites.adapter =
            siteAdapter

        val supervisorName =
            intent.getStringExtra(
                "SUPERVISOR_NAME"
            )
                ?: "Admin"

        tvSupervisorGreeting.text =
            "${getGreeting()},"

        tvSupervisorName.text =
            supervisorName

        etSearchSite
            .addTextChangedListener(
                object :
                    TextWatcher {

                    override fun beforeTextChanged(
                        s: CharSequence?,
                        start: Int,
                        count: Int,
                        after: Int
                    ) = Unit

                    override fun onTextChanged(
                        s: CharSequence?,
                        start: Int,
                        before: Int,
                        count: Int
                    ) {
                        currentSearch =
                            s
                                ?.toString()
                                ?.trim()
                                .orEmpty()

                        applySiteFilter()
                    }

                    override fun afterTextChanged(
                        s: Editable?
                    ) = Unit
                }
            )

        btnAddSite.setOnClickListener {
            startActivity(
                Intent(
                    this,
                    AddClientSiteActivity::class.java
                )
            )
        }

        btnViewReports.setOnClickListener {
            startActivity(
                Intent(
                    this,
                    ReportListActivity::class.java
                )
            )
        }

        btnLogout.setOnClickListener {
            auth.signOut()

            val intent =
                Intent(
                    this,
                    LoginActivity::class.java
                ).apply {
                    flags =
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                                Intent.FLAG_ACTIVITY_CLEAR_TASK
                }

            startActivity(
                intent
            )

            finish()
        }

        listenForSites()
    }


    private fun listenForSites() {

        sitesListener
            ?.remove()

        clientSitesListener
            ?.remove()

        sitesListener =
            db.collection(
                "sites"
            )
                .addSnapshotListener {
                        snapshots,
                        error ->

                    if (
                        error != null
                    ) {
                        Toast.makeText(
                            this,
                            "Unable to load current sites: ${error.localizedMessage}",
                            Toast.LENGTH_LONG
                        ).show()

                        return@addSnapshotListener
                    }

                    modernSites =
                        snapshots
                            ?.documents
                            ?.mapNotNull {
                                    document ->

                                val name =
                                    document.getString(
                                        "name"
                                    )
                                        ?: document.getString(
                                            "siteName"
                                        )

                                if (
                                    name.isNullOrBlank()
                                ) {
                                    null
                                } else {
                                    ClientSiteModel(
                                        siteId =
                                            document.id,

                                        siteName =
                                            name
                                    )
                                }
                            }
                            ?: emptyList()

                    mergeSites()
                }

        clientSitesListener =
            db.collection(
                "client_sites"
            )
                .addSnapshotListener {
                        snapshots,
                        error ->

                    if (
                        error != null
                    ) {
                        return@addSnapshotListener
                    }

                    legacySites =
                        snapshots
                            ?.documents
                            ?.mapNotNull {
                                    document ->

                                val name =
                                    document.getString(
                                        "siteName"
                                    )
                                        ?: document.getString(
                                            "name"
                                        )

                                if (
                                    name.isNullOrBlank()
                                ) {
                                    null
                                } else {
                                    ClientSiteModel(
                                        siteId =
                                            document.getString(
                                                "siteId"
                                            )
                                                ?.takeIf {
                                                    it.isNotBlank()
                                                }
                                                ?: document.id,

                                        siteName =
                                            name
                                    )
                                }
                            }
                            ?: emptyList()

                    mergeSites()
                }
    }


    private fun mergeSites() {

        // Prefer the current web `sites` collection.
        //
        // Older Android versions used `client_sites`, and the same physical
        // site can therefore exist in both collections with different
        // document IDs. Dedupe by normalized site name so "Wacat" does not
        // appear twice and accidentally open the legacy ID.
        val mergedByName =
            linkedMapOf<String, ClientSiteModel>()

        modernSites
            .forEach {
                    site ->

                val key =
                    site.siteName
                        .trim()
                        .lowercase(
                            Locale.US
                        )

                if (
                    key.isNotBlank()
                ) {
                    mergedByName[
                        key
                    ] =
                        site
                }
            }

        legacySites
            .forEach {
                    site ->

                val key =
                    site.siteName
                        .trim()
                        .lowercase(
                            Locale.US
                        )

                if (
                    key.isNotBlank() &&
                    key !in
                    mergedByName
                ) {
                    mergedByName[
                        key
                    ] =
                        site
                }
            }

        siteList.clear()

        siteList.addAll(
            mergedByName.values
                .sortedBy {
                    it.siteName
                        .lowercase(
                            Locale.US
                        )
                }
        )

        applySiteFilter()
    }


    private fun applySiteFilter() {

        filteredSiteList.clear()

        if (
            currentSearch.isBlank()
        ) {
            filteredSiteList.addAll(
                siteList
            )

        } else {
            filteredSiteList.addAll(
                siteList.filter {
                        site ->

                    site.siteName.contains(
                        currentSearch,
                        ignoreCase =
                            true
                    ) ||
                            site.siteId.contains(
                                currentSearch,
                                ignoreCase =
                                    true
                            )
                }
            )
        }

        siteAdapter.notifyDataSetChanged()
    }


    private fun getGreeting():
            String {

        val hour =
            Calendar
                .getInstance()
                .get(
                    Calendar.HOUR_OF_DAY
                )

        return when (
            hour
        ) {
            in 0..11 ->
                "Good Morning"

            in 12..17 ->
                "Good Afternoon"

            else ->
                "Good Evening"
        }
    }


    override fun onDestroy() {

        sitesListener
            ?.remove()

        clientSitesListener
            ?.remove()

        sitesListener =
            null

        clientSitesListener =
            null

        super.onDestroy()
    }
}
