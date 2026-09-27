package com.example.spot.ui.auth

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth

/** Reuse the account-specific face verification and attendance flow. */
class QuickFaceLoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            Toast.makeText(this, "Sign in with your Login ID and password first.", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        startActivity(Intent(this, FaceVerifyActivity::class.java).apply {
            putExtra("USER_ID", uid)
            putExtra("USER_ROLE", "guard")
            putExtra("GUARD_NAME", intent.getStringExtra("GUARD_NAME").orEmpty())
            putExtra("ASSIGNED_SITE_ID", intent.getStringExtra("ASSIGNED_SITE_ID").orEmpty())
            putExtra("CLIENT_ID", intent.getStringExtra("CLIENT_ID").orEmpty())
        })
        finish()
    }
}
