package com.example.spot

data class PatrolModel(
    var id: String = "",
    val guardId: String = "",
    val patrolTime: String = "",
    val patrolDate: String = "",
    val status: String = "PENDING"
)