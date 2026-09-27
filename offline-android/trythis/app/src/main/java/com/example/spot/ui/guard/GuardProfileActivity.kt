package com.example.spot.ui.guard

import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.spot.R
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.firestore.FirebaseFirestore

class GuardProfileActivity : AppCompatActivity() {

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    // Password fields
    private lateinit var tilCurrentPassword: TextInputLayout
    private lateinit var tilNewPassword: TextInputLayout
    private lateinit var tilConfirmPassword: TextInputLayout
    private lateinit var etCurrentPassword: TextInputEditText
    private lateinit var etNewPassword: TextInputEditText
    private lateinit var etConfirmPassword: TextInputEditText
    private lateinit var btnUpdatePassword: MaterialButton
    private lateinit var tvPasswordStatus: TextView
    private lateinit var progressUpdating: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_guard_profile)

        val guardName = intent.getStringExtra("GUARD_NAME") ?: "Guard"
        val guardId = intent.getStringExtra("GUARD_ID") ?: ""
        val assignedSite = intent.getStringExtra("ASSIGNED_SITE") ?: "No Site Assigned"
        val shiftTime = intent.getStringExtra("SHIFT_TIME") ?: "Not Assigned"

        // ── Populate static info ──
        val initials = guardName.split(" ")
            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
            .take(2)
            .joinToString("")
            .ifBlank { "GU" }

        findViewById<TextView>(R.id.tvProfileInitials).text = initials
        findViewById<TextView>(R.id.tvProfileName).text = guardName
        findViewById<TextView>(R.id.tvProfileFullName).text = guardName
        findViewById<TextView>(R.id.tvProfileGuardId).text = guardId.ifBlank { "—" }
        findViewById<TextView>(R.id.tvProfileEmail).text =
            auth.currentUser?.email ?: "—"
        findViewById<TextView>(R.id.tvProfileSite).text = assignedSite
        findViewById<TextView>(R.id.tvProfileShift).text = shiftTime.ifBlank { "—" }

        // Load extra profile data from Firestore if available
        val uid = auth.currentUser?.uid
        if (!uid.isNullOrBlank()) {
            db.collection("users").document(uid).get()
                .addOnSuccessListener { doc ->
                    if (doc.exists()) {
                        val firestoreSite = doc.getString("siteName")
                            ?: doc.getString("assignedSiteName")
                        val firestoreShift = run {
                            val start = doc.getString("shiftStart") ?: ""
                            val end = doc.getString("shiftEnd") ?: ""
                            if (start.isNotBlank() && end.isNotBlank()) "$start – $end" else ""
                        }
                        if (!firestoreSite.isNullOrBlank())
                            findViewById<TextView>(R.id.tvProfileSite).text = firestoreSite
                        if (firestoreShift.isNotBlank())
                            findViewById<TextView>(R.id.tvProfileShift).text = firestoreShift
                    }
                }
        }

        // Back button
        findViewById<ImageButton>(R.id.btnBackProfile).setOnClickListener { finish() }

        // ── Change Password ──
        tilCurrentPassword = findViewById(R.id.tilCurrentPassword)
        tilNewPassword = findViewById(R.id.tilNewPassword)
        tilConfirmPassword = findViewById(R.id.tilConfirmPassword)
        etCurrentPassword = findViewById(R.id.etCurrentPassword)
        etNewPassword = findViewById(R.id.etNewPassword)
        etConfirmPassword = findViewById(R.id.etConfirmPassword)
        btnUpdatePassword = findViewById(R.id.btnUpdatePassword)
        tvPasswordStatus = findViewById(R.id.tvPasswordStatus)
        progressUpdating = findViewById(R.id.progressUpdating)

        btnUpdatePassword.setOnClickListener { changePassword() }
    }

    // ── Password change logic (mirrors ChangePasswordActivity) ─────────────────
    private fun changePassword() {
        clearErrors()
        tvPasswordStatus.visibility = View.GONE

        val currentPassword = etCurrentPassword.text?.toString().orEmpty()
        val newPassword = etNewPassword.text?.toString().orEmpty()
        val confirmPassword = etConfirmPassword.text?.toString().orEmpty()

        var hasError = false

        if (currentPassword.isBlank()) {
            tilCurrentPassword.error = "Enter your current password"
            hasError = true
        }
        if (newPassword.length < 8) {
            tilNewPassword.error = "Use at least 8 characters"
            hasError = true
        }
        if (newPassword == currentPassword && newPassword.isNotBlank()) {
            tilNewPassword.error = "New password must be different"
            hasError = true
        }
        if (confirmPassword.isBlank()) {
            tilConfirmPassword.error = "Confirm your new password"
            hasError = true
        } else if (newPassword != confirmPassword) {
            tilConfirmPassword.error = "Passwords do not match"
            hasError = true
        }

        if (hasError) return

        val user = auth.currentUser ?: run {
            showStatus("Session expired. Please log in again.", true)
            return
        }
        val email = user.email ?: run {
            showStatus("No email address linked to this account.", true)
            return
        }

        setLoading(true)
        hideKeyboard()

        val credential = EmailAuthProvider.getCredential(email, currentPassword)
        user.reauthenticate(credential)
            .addOnSuccessListener {
                user.updatePassword(newPassword)
                    .addOnSuccessListener {
                        setLoading(false)
                        etCurrentPassword.text?.clear()
                        etNewPassword.text?.clear()
                        etConfirmPassword.text?.clear()
                        showStatus("Password changed successfully.", false)
                        Toast.makeText(this, "Your password has been updated", Toast.LENGTH_SHORT).show()
                    }
                    .addOnFailureListener { error ->
                        setLoading(false)
                        showStatus(error.localizedMessage ?: "Unable to update password.", true)
                    }
            }
            .addOnFailureListener { error ->
                setLoading(false)
                if (error is FirebaseAuthInvalidCredentialsException) {
                    tilCurrentPassword.error = "Current password is incorrect"
                    etCurrentPassword.requestFocus()
                } else {
                    showStatus(error.localizedMessage ?: "Verification failed.", true)
                }
            }
    }

    private fun clearErrors() {
        tilCurrentPassword.error = null
        tilNewPassword.error = null
        tilConfirmPassword.error = null
    }

    private fun setLoading(loading: Boolean) {
        btnUpdatePassword.isEnabled = !loading
        etCurrentPassword.isEnabled = !loading
        etNewPassword.isEnabled = !loading
        etConfirmPassword.isEnabled = !loading
        progressUpdating.visibility = if (loading) View.VISIBLE else View.GONE
        btnUpdatePassword.text = if (loading) "Updating…" else "Update Password"
    }

    private fun showStatus(message: String, isError: Boolean) {
        tvPasswordStatus.text = message
        tvPasswordStatus.setTextColor(
            getColor(if (isError) R.color.error else R.color.success)
        )
        tvPasswordStatus.visibility = View.VISIBLE
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        currentFocus?.let { imm.hideSoftInputFromWindow(it.windowToken, 0) }
    }
}
