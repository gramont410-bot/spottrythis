package com.example.spot.ui.guard

import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.content.Context
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

class ChangePasswordActivity : AppCompatActivity() {

    private val auth = FirebaseAuth.getInstance()

    private lateinit var tilCurrentPassword: TextInputLayout
    private lateinit var tilNewPassword: TextInputLayout
    private lateinit var tilConfirmPassword: TextInputLayout

    private lateinit var etCurrentPassword: TextInputEditText
    private lateinit var etNewPassword: TextInputEditText
    private lateinit var etConfirmPassword: TextInputEditText

    private lateinit var btnUpdatePassword: MaterialButton
    private lateinit var tvBack: TextView
    private lateinit var tvPasswordStatus: TextView
    private lateinit var progressUpdating: View

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_change_password)

        tilCurrentPassword = findViewById(R.id.tilCurrentPassword)
        tilNewPassword = findViewById(R.id.tilNewPassword)
        tilConfirmPassword = findViewById(R.id.tilConfirmPassword)

        etCurrentPassword = findViewById(R.id.etCurrentPassword)
        etNewPassword = findViewById(R.id.etNewPassword)
        etConfirmPassword = findViewById(R.id.etConfirmPassword)

        btnUpdatePassword = findViewById(R.id.btnUpdatePassword)
        tvBack = findViewById(R.id.tvBack)
        tvPasswordStatus = findViewById(R.id.tvPasswordStatus)
        progressUpdating = findViewById(R.id.progressUpdating)

        tvBack.setOnClickListener {
            finish()
        }

        btnUpdatePassword.setOnClickListener {
            changePassword()
        }
    }

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

        val user = auth.currentUser

        if (user == null) {
            showStatus("Your login session has expired. Please log in again.", true)
            return
        }

        val email = user.email

        if (email.isNullOrBlank()) {
            showStatus("This account has no email address available for password verification.", true)
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

                        Toast.makeText(
                            this,
                            "Your password has been updated",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    .addOnFailureListener { error ->
                        setLoading(false)
                        showStatus(
                            error.localizedMessage ?: "Unable to update password. Please try again.",
                            true
                        )
                    }
            }
            .addOnFailureListener { error ->
                setLoading(false)

                if (error is FirebaseAuthInvalidCredentialsException) {
                    tilCurrentPassword.error = "Current password is incorrect"
                    etCurrentPassword.requestFocus()
                } else {
                    showStatus(
                        error.localizedMessage ?: "Unable to verify your current password.",
                        true
                    )
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
        btnUpdatePassword.text = if (loading) "Updating..." else "Update Password"
    }

    private fun showStatus(message: String, isError: Boolean) {
        tvPasswordStatus.text = message
        tvPasswordStatus.setTextColor(
            getColor(
                if (isError) R.color.error else R.color.success
            )
        )
        tvPasswordStatus.visibility = View.VISIBLE
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        currentFocus?.let { view ->
            imm.hideSoftInputFromWindow(view.windowToken, 0)
        }
    }
}
