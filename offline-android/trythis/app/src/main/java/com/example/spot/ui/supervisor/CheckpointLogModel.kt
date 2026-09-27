package com.example.spot.ui.supervisor

import com.google.firebase.Timestamp

data class CheckpointLogModel(
    val siteId: String = "",
    val guardId: String = "",
    val guardName: String = "",
    val locationId: String = "",
    val locationName: String = "",
    val date: String = "",
    val time: String = "",
    val timestamp: Timestamp? = null
)
