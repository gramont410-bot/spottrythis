package com.example.spot.ui.login

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.spot.R
import com.example.spot.ui.auth.FaceVerifyActivity
import com.example.spot.ui.auth.GuardFaceEnrollmentActivity
import com.example.spot.ui.auth.QuickFaceLoginActivity
import com.example.spot.ui.supervisor.SupervisorDashboardActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

class LoginActivity : AppCompatActivity() {

    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Firebase
        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()

        // Allow activity to display over lock screen if triggered by alarm
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)

            val keyguardManager =
                getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

            keyguardManager.requestDismissKeyguard(this, null)

        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        setContentView(R.layout.activity_login)

        val etLoginName =
            findViewById<TextInputEditText>(R.id.etLoginName)

        val etLoginPassword =
            findViewById<TextInputEditText>(R.id.etLoginPassword)

        val btnLogin =
            findViewById<MaterialButton>(R.id.btnLogin)

        val btnFaceLogin =
            findViewById<MaterialButton>(R.id.btnFaceLogin)


        // =========================================================
        // NORMAL LOGIN
        // =========================================================

        btnLogin.setOnClickListener {

            val inputName =
                etLoginName.text?.toString()?.trim().orEmpty()

            val inputPassword =
                etLoginPassword.text?.toString()?.trim().orEmpty()


            if (inputName.isEmpty() || inputPassword.isEmpty()) {

                Toast.makeText(
                    this,
                    "Please fill in all fields",
                    Toast.LENGTH_SHORT
                ).show()

                return@setOnClickListener
            }


            // =====================================================
            // OPTIONAL TEST SUPERVISOR BYPASS
            // =====================================================

            if (
                inputName.equals("sup101", ignoreCase = true) &&
                inputPassword == "admin123"
            ) {

                saveUserSession(
                    userId = "sup101",
                    role = "supervisor",
                    name = "Administrator",
                    siteId = ""
                )

                val intent =
                    Intent(
                        this,
                        SupervisorDashboardActivity::class.java
                    ).apply {

                        putExtra(
                            "SUPERVISOR_NAME",
                            "Administrator"
                        )

                        flags =
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                                    Intent.FLAG_ACTIVITY_CLEAR_TASK
                    }

                startActivity(intent)
                finish()

                return@setOnClickListener
            }


            // Disable button while logging in
            btnLogin.isEnabled = false


            // =====================================================
            // CONVERT LOGIN ID TO FIREBASE EMAIL
            //
            // aaron
            // becomes:
            // aaron@guards.spot.local
            //
            // If user enters a real email such as admin@test.com,
            // keep it unchanged.
            // =====================================================

            val authEmail = convertLoginIdToEmail(inputName)


            // =====================================================
            // FIREBASE AUTHENTICATION
            // =====================================================

            auth.signInWithEmailAndPassword(
                authEmail,
                inputPassword
            )
                .addOnSuccessListener { authResult ->

                    val uid =
                        authResult.user?.uid

                    if (uid.isNullOrBlank()) {

                        btnLogin.isEnabled = true

                        Toast.makeText(
                            this,
                            "Login failed: User ID not found.",
                            Toast.LENGTH_SHORT
                        ).show()

                        return@addOnSuccessListener
                    }


                    // Register this Android device
                    registerDevice(uid)


                    // Load user's Firestore profile
                    loadUserProfile(
                        uid = uid,
                        btnLogin = btnLogin
                    )
                }

                .addOnFailureListener { error ->

                    btnLogin.isEnabled = true

                    val message =
                        when {
                            error.message?.contains(
                                "credential",
                                ignoreCase = true
                            ) == true -> {
                                "Incorrect Login ID or password."
                            }

                            error.message?.contains(
                                "user",
                                ignoreCase = true
                            ) == true -> {
                                "Account not found."
                            }

                            else -> {
                                "Login failed: ${error.localizedMessage}"
                            }
                        }

                    Toast.makeText(
                        this,
                        message,
                        Toast.LENGTH_LONG
                    ).show()
                }
        }


        // =========================================================
        // QUICK FACE LOGIN
        // =========================================================

        btnFaceLogin.setOnClickListener {
            checkFaceLoginAndLaunch(btnFaceLogin)
        }
    }


    // =============================================================
    // QUICK FACE LOGIN PRE-CHECK
    //
    // Quick Face Login is an unlock method for a guard who has
    // already authenticated on this phone at least once.
    //
    // Before opening QuickFaceLoginActivity we verify:
    // 1. Firebase still has an authenticated user
    // 2. users/{uid} exists
    // 3. account role is "guard"
    // 4. account is active (when the field exists)
    // 5. faceEmbedding exists and contains values
    // =============================================================

    private fun checkFaceLoginAndLaunch(
        btnFaceLogin: MaterialButton
    ) {
        val currentUser = auth.currentUser

        if (currentUser == null) {
            Toast.makeText(
                this,
                "Please log in with your Login ID and password once before using Face Login.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val uid = currentUser.uid

        btnFaceLogin.isEnabled = false

        db.collection("users")
            .document(uid)
            .get()
            .addOnSuccessListener { document ->

                btnFaceLogin.isEnabled = true

                if (!document.exists()) {
                    Toast.makeText(
                        this,
                        "Your Firebase account exists, but your S.P.O.T. user profile was not found.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@addOnSuccessListener
                }

                val role = document.getString("role")
                    ?.trim()
                    ?.lowercase()
                    .orEmpty()

                if (role != "guard") {
                    Toast.makeText(
                        this,
                        "Quick Face Login is only available for guard accounts.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@addOnSuccessListener
                }

                // If the field exists and is explicitly false, block access.
                val active = document.getBoolean("active")
                if (active == false) {
                    Toast.makeText(
                        this,
                        "This guard account is inactive.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@addOnSuccessListener
                }

                val rawEmbedding = document.get("faceEmbedding") as? List<*>

                if (rawEmbedding.isNullOrEmpty()) {
                    Toast.makeText(
                        this,
                        "No face is registered for this account. Log in normally first and complete face enrollment.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@addOnSuccessListener
                }

                // Check that the stored embedding really contains numbers.
                val validEmbedding = rawEmbedding.all { it is Number }

                if (!validEmbedding) {
                    Toast.makeText(
                        this,
                        "The saved face data is invalid. Please enroll the guard's face again.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@addOnSuccessListener
                }

                // Refresh device information while the authenticated guard
                // is using this phone.
                registerDevice(uid)

                startActivity(
                    Intent(
                        this,
                        QuickFaceLoginActivity::class.java
                    ).apply {
                        putExtra("USER_ID", uid)
                        putExtra(
                            "GUARD_NAME",
                            document.getString("fullName")
                                ?: document.getString("name")
                                ?: "Guard"
                        )
                        putExtra(
                            "ASSIGNED_SITE_ID",
                            document.getString("assignedSiteId") ?: ""
                        )
                    }
                )
            }
            .addOnFailureListener { error ->

                btnFaceLogin.isEnabled = true

                Toast.makeText(
                    this,
                    "Unable to load face-login profile: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
    }


    // =============================================================
    // CONVERT GUARD LOGIN ID TO FIREBASE AUTH EMAIL
    // =============================================================

    private fun convertLoginIdToEmail(
        loginId: String
    ): String {

        val cleanLoginId =
            loginId
                .trim()
                .lowercase()
                .replace(" ", "_")


        // Supervisor can enter a real email
        if (cleanLoginId.contains("@")) {
            return cleanLoginId
        }


        // Guard IDs become internal Firebase emails
        return "$cleanLoginId@guards.spot.local"
    }


    // =============================================================
    // LOAD FIRESTORE USER PROFILE
    //
    // users/{Firebase UID}
    // =============================================================

    private fun loadUserProfile(
        uid: String,
        btnLogin: MaterialButton
    ) {

        db.collection("users")
            .document(uid)
            .get()

            .addOnSuccessListener { document ->

                btnLogin.isEnabled = true


                if (!document.exists()) {

                    auth.signOut()

                    Toast.makeText(
                        this,
                        "Account exists, but user profile was not found.",
                        Toast.LENGTH_LONG
                    ).show()

                    return@addOnSuccessListener
                }


                val role =
                    document.getString("role")
                        ?.trim()
                        ?.lowercase()
                        ?: ""


                // Support different name fields currently in your database
                val firstName =
                    document.getString("firstName")
                        ?.trim()
                        .orEmpty()

                val lastName =
                    document.getString("lastName")
                        ?.trim()
                        .orEmpty()

                val combinedName =
                    "$firstName $lastName".trim()


                val fullName =
                    document.getString("fullName")
                        ?: document.getString("name")
                        ?: combinedName.ifBlank {
                            "SPOT User"
                        }


                val assignedSiteId =
                    document.getString("assignedSiteId")
                        ?: ""


                // =================================================
                // GUARD
                // =================================================

                if (role == "guard") {

                    // -------------------------------------------------
                    // FIRST-TIME MOBILE FACE ENROLLMENT
                    //
                    // Firebase email/password proves which guard account
                    // is signing in. If that account does not yet have a
                    // valid mobile faceEmbedding, the guard must register
                    // their OWN face on this phone before continuing.
                    //
                    // This makes the Android biometric template the
                    // authoritative Face ID used by S.P.O.T.
                    // -------------------------------------------------

                    val rawEmbedding =
                        document.get("faceEmbedding") as? List<*>

                    val hasAnyEmbedding =
                        !rawEmbedding.isNullOrEmpty()

                    val hasValidEmbedding =
                        hasAnyEmbedding &&
                        rawEmbedding!!.all { it is Number }

                    if (!hasAnyEmbedding) {

                        val enrollmentIntent =
                            Intent(
                                this,
                                GuardFaceEnrollmentActivity::class.java
                            ).apply {

                                putExtra(
                                    "USER_ID",
                                    uid
                                )

                                putExtra(
                                    "USER_ROLE",
                                    "guard"
                                )

                                putExtra(
                                    "GUARD_NAME",
                                    fullName
                                )

                                putExtra(
                                    "ASSIGNED_SITE_ID",
                                    assignedSiteId
                                )
                            }

                        Toast.makeText(
                            this,
                            "First login detected. Register your face to continue.",
                            Toast.LENGTH_LONG
                        ).show()

                        startActivity(
                            enrollmentIntent
                        )

                        finish()

                        return@addOnSuccessListener
                    }

                    if (!hasValidEmbedding) {

                        auth.signOut()

                        Toast.makeText(
                            this,
                            "Your saved face data is invalid. Ask a supervisor to reset your Face ID, then log in again.",
                            Toast.LENGTH_LONG
                        ).show()

                        return@addOnSuccessListener
                    }

                    // Existing guard with a valid mobile Face ID:
                    // continue to normal liveness + identity verification.
                    val intent =
                        Intent(
                            this,
                            FaceVerifyActivity::class.java
                        ).apply {

                            putExtra(
                                "USER_ID",
                                uid
                            )

                            putExtra(
                                "USER_ROLE",
                                "guard"
                            )

                            putExtra(
                                "GUARD_NAME",
                                fullName
                            )

                            putExtra(
                                "ASSIGNED_SITE_ID",
                                assignedSiteId
                            )
                        }

                    startActivity(intent)
                    finish()

                    return@addOnSuccessListener
                }


                // =================================================
                // SUPERVISOR / ADMIN
                // =================================================

                if (
                    role == "supervisor" ||
                    role == "admin" ||
                    role == "supervisor command officer"
                ) {

                    val intent =
                        Intent(
                            this,
                            FaceVerifyActivity::class.java
                        ).apply {

                            putExtra(
                                "USER_ID",
                                uid
                            )

                            putExtra(
                                "USER_ROLE",
                                role
                            )

                            putExtra(
                                "SUPERVISOR_NAME",
                                fullName
                            )
                        }

                    startActivity(intent)
                    finish()

                    return@addOnSuccessListener
                }


                // Unknown role
                auth.signOut()

                Toast.makeText(
                    this,
                    "This account does not have permission to use the app.",
                    Toast.LENGTH_LONG
                ).show()
            }

            .addOnFailureListener { error ->

                btnLogin.isEnabled = true

                Toast.makeText(
                    this,
                    "Unable to load user profile: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
    }


    // =============================================================
    // AUTOMATIC DEVICE REGISTRATION
    //
    // Creates:
    //
    // devices/{ANDROID_ID}
    //
    // =============================================================

    private fun registerDevice(
        userUid: String
    ) {

        val deviceId =
            Settings.Secure.getString(
                contentResolver,
                Settings.Secure.ANDROID_ID
            )


        val manufacturer =
            Build.MANUFACTURER
                .replaceFirstChar {
                    if (it.isLowerCase()) {
                        it.titlecase()
                    } else {
                        it.toString()
                    }
                }


        val deviceModel =
            "$manufacturer ${Build.MODEL}"


        val osVersion =
            "Android ${Build.VERSION.RELEASE}"


        val deviceData =
            hashMapOf<String, Any>(
                "deviceId" to deviceId,
                "deviceModel" to deviceModel,
                "manufacturer" to manufacturer,
                "osVersion" to osVersion,
                "userId" to userUid,
                "status" to "Online",
                "lastActive" to FieldValue.serverTimestamp()
            )


        db.collection("devices")
            .document(deviceId)
            .set(
                deviceData,
                SetOptions.merge()
            )

            .addOnSuccessListener {

                // Device successfully registered.
                // No popup needed every login.
            }

            .addOnFailureListener { error ->

                Toast.makeText(
                    this,
                    "Device registration failed: ${error.localizedMessage}",
                    Toast.LENGTH_LONG
                ).show()
            }
    }


    // =============================================================
    // SAVE LOGIN SESSION
    // =============================================================

    private fun saveUserSession(
        userId: String,
        role: String,
        name: String,
        siteId: String
    ) {

        val sharedPref =
            getSharedPreferences(
                "SPOT_SESSION",
                Context.MODE_PRIVATE
            )


        sharedPref.edit().apply {

            putString(
                "USER_ID",
                userId
            )

            putString(
                "USER_ROLE",
                role
            )

            putString(
                "USER_NAME",
                name
            )

            putString(
                "SITE_ID",
                siteId
            )

            putBoolean(
                "IS_LOGGED_IN",
                true
            )

            apply()
        }
    }
}
