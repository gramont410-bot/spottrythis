package com.example.spot.ui.guard

data class ReportModel(
    val reportId: String? = null,
    val guardName: String = "",
    val badgeId: String = "",
    val assignedSite: String = "",
    val date: String = "",
    val time: String = "",
    val title: String = "",
    val description: String = ""
)