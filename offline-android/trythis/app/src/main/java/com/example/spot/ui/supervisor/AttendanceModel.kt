package com.example.spot.ui.supervisor

data class AttendanceModel(
    val id: String = "",
    val guardId: String = "",
    val guardName: String = "",
    val date: String = "",
    val timeIn: String = "",
    val timeOut: String = "",
    val status: String = "",
    val siteId: String = "",
    val startTime: String = "",
    val endTime: String = ""
)