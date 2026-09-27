package com.example.spot.ui.supervisor

data class GuardModel(
    val guardId: String = "",
    val fullName: String = "",
    val password: String = "",    // 🟢 BAGONG DAGDAG: Password para sa log in ng guard
    val role: String = "guard",   // 🟢 BAGONG DAGDAG: Para sa role-based routing kapag nag-login
    val assignedSiteId: String = "", // 🟢 BAGONG DAGDAG: Context kung saang site sila naka-deploy
    val assignedAt: Long = System.currentTimeMillis()
)