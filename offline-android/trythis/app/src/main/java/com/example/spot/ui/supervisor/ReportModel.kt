package com.example.spot.ui.supervisor

// Ito ang data model para sa report
data class ReportModel(
    val reportId: String = "",
    val guardName: String = "",
    val badgeId: String = "",
    val assignedSite: String = "",
    val date: String = "",
    val time: String = "",
    val title: String = "",
    val description: String = ""
)