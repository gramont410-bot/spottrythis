package com.example.spot.ui.login

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import com.example.spot.R
import com.example.spot.ui.guard.GuardDashboardActivity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import com.example.spot.offline.OfflineStore

class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        // Navigate to LoginActivity after splash delay
        Handler(Looper.getMainLooper()).postDelayed({
            resumePatrolOrLogin()
        }, 2000)
    }

    private fun resumePatrolOrLogin() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        val prefs = getSharedPreferences("SPOT_PATROL", MODE_PRIVATE)
        val patrolId = prefs.getString("ACTIVE_PATROL_LOG_ID", "").orEmpty()
        if (uid == null || patrolId.isBlank()) { openLogin(); return }
        // Resume only the existing authenticated guard's patrol, never a new offline login.
        FirebaseFirestore.getInstance().collection("patrol_logs").document(patrolId)
            .get(Source.CACHE).addOnSuccessListener { document ->
                val patrol = OfflineStore.get(this).patrol(uid, document)
                if (document.getString("guardId") != uid || patrol.getString("status") != "IN_PROGRESS") {
                    openLogin()
                } else {
                    startActivity(Intent(this, GuardDashboardActivity::class.java).apply {
                        putExtra("GUARD_ID", uid)
                        putExtra("GUARD_NAME", document.getString("guardName") ?: "Security Personnel")
                        putExtra("ASSIGNED_SITE_ID", document.getString("siteId"))
                        putExtra("CLIENT_ID", document.getString("clientId"))
                    })
                    finish()
                }
            }.addOnFailureListener { openLogin() }
    }

    private fun openLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}
