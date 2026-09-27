package com.example.spot.ui.supervisor

import android.app.TimePickerDialog
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.util.Calendar
import java.util.Locale

class SiteControlCenterActivity : AppCompatActivity() {

    private lateinit var siteId: String
    private lateinit var siteName: String
    private val db = FirebaseFirestore.getInstance()
    private var guardListener: ListenerRegistration? = null

    private val guardList = mutableListOf<AttendanceModel>()
    private lateinit var guardAdapter: GuardAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_site_control_center)

        siteId = intent.getStringExtra("SITE_ID") ?: ""
        siteName = intent.getStringExtra("SITE_NAME") ?: "Unknown Site"

        val tvSiteTitle = findViewById<TextView>(R.id.tvSiteTitle)
        val btnRegisterGuard = findViewById<MaterialButton>(R.id.btnRegisterGuard)
        val btnViewSiteReports = findViewById<Button>(R.id.btnViewSiteReports)
        val btnSiteQRCode = findViewById<Button>(R.id.btnSiteQRCode)
        val btnGoToSchedule = findViewById<Button>(R.id.btnGoToSchedule)
        val btnViewLogs = findViewById<Button>(R.id.btnViewLogs)
        val rvGuardsList = findViewById<RecyclerView>(R.id.rvGuardsList)
        val btnBackToDashboard = findViewById<ImageButton>(R.id.btnBackToDashboard)

        tvSiteTitle.text = siteName

        btnBackToDashboard.setOnClickListener {
            onBackPressedDispatcher.onBackPressed()
        }

        btnGoToSchedule.setOnClickListener {
            val intent = Intent(this, AssignShiftActivity::class.java).apply {
                putExtra("SITE_ID", siteId)
                putExtra("SITE_NAME", siteName)
            }
            startActivity(intent)
        }

        btnViewSiteReports.setOnClickListener {
            val intent = Intent(this, ReportListActivity::class.java).apply {
                putExtra("SITE_ID", siteId)
                putExtra("SITE_NAME", siteName)
            }
            startActivity(intent)
        }

        btnSiteQRCode.setOnClickListener {
            val intent = Intent(this, ManageqrActivity::class.java).apply {
                putExtra("SITE_ID", siteId)
                putExtra("SITE_NAME", siteName)
            }
            startActivity(intent)
        }

        btnViewLogs.setOnClickListener {
            val intent = Intent(this, CheckpointLogActivity::class.java).apply {
                putExtra("SITE_ID", siteId)
                putExtra("SITE_NAME", siteName)
            }
            startActivity(intent)
        }

        btnRegisterGuard.setOnClickListener {
            showAddGuardDialog()
        }

        guardAdapter = GuardAdapter(
            guardList,
            onItemClick = { selectedGuard ->
                val intent = Intent(this, GuardScheduleActivity::class.java).apply {
                    putExtra("GUARD_ID", selectedGuard.guardId)
                    putExtra("GUARD_NAME", selectedGuard.guardName)
                }
                startActivity(intent)
            },
            onRemoveClick = { selectedGuard ->
                showDeleteGuardDialog(selectedGuard)
            }
        )

        rvGuardsList.apply {
            layoutManager = LinearLayoutManager(this@SiteControlCenterActivity)
            adapter = guardAdapter
            isNestedScrollingEnabled = false
        }

        listenForAssignedGuards()
    }

    private fun showTimePicker(targetTextView: TextView) {
        val calendar = Calendar.getInstance()
        val hour = calendar.get(Calendar.HOUR_OF_DAY)
        val minute = calendar.get(Calendar.MINUTE)

        TimePickerDialog(this, { _, selectedHour, selectedMinute ->
            val formattedTime = String.format(
                Locale.getDefault(), "%02d:%02d %s",
                if (selectedHour == 0 || selectedHour == 12) 12 else selectedHour % 12,
                selectedMinute,
                if (selectedHour < 12) "AM" else "PM"
            )
            targetTextView.text = formattedTime
        }, hour, minute, false).show()
    }

    private fun showAddGuardDialog() {
        val layoutContext = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(50, 20, 50, 10)
        }

        val etGuardName = EditText(this).apply {
            hint = "Enter Guard's Full Name"
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 16) }
        }

        val etGuardPassword = EditText(this).apply {
            hint = "Create Login Password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 16) }
        }

        val tvDutyStart = TextView(this).apply {
            text = "Select Duty Start Time"
            textSize = 16f
            setPadding(20, 30, 20, 30)
            setBackgroundResource(android.R.drawable.editbox_background_normal)
            setOnClickListener { showTimePicker(this) }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 16) }
        }

        val tvDutyEnd = TextView(this).apply {
            text = "Select Duty End Time"
            textSize = 16f
            setPadding(20, 30, 20, 30)
            setBackgroundResource(android.R.drawable.editbox_background_normal)
            setOnClickListener { showTimePicker(this) }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 16) }
        }

        layoutContext.addView(etGuardName)
        layoutContext.addView(etGuardPassword)
        layoutContext.addView(tvDutyStart)
        layoutContext.addView(tvDutyEnd)

        MaterialAlertDialogBuilder(this)
            .setTitle("Deploy & Register Guard")
            .setView(layoutContext)
            .setPositiveButton("Proceed to Face Scan") { _, _ ->
                val name = etGuardName.text.toString().trim()
                val password = etGuardPassword.text.toString().trim()
                val start = tvDutyStart.text.toString().trim()
                val end = tvDutyEnd.text.toString().trim()

                if (name.isNotEmpty() && password.isNotEmpty() &&
                    start != "Select Duty Start Time" && end != "Select Duty End Time") {

                    val intent = Intent(this, RegisterFaceActivity::class.java).apply {
                        putExtra("GUARD_NAME", name)
                        putExtra("GUARD_PASSWORD", password)
                        putExtra("SITE_ID", siteId)
                        putExtra("DUTY_START", start)
                        putExtra("DUTY_END", end)
                    }
                    startActivity(intent)
                } else {
                    Toast.makeText(this, "All fields are required!", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun listenForAssignedGuards() {
        if (siteId.isEmpty()) return

        guardListener = db.collection("users")
            .whereEqualTo("role", "guard")
            .whereEqualTo("assignedSiteId", siteId)
            .addSnapshotListener { snapshots, error ->
                if (error != null) return@addSnapshotListener

                guardList.clear()
                snapshots?.forEach { doc ->
                    val guardId = doc.id
                    val guardName = doc.getString("fullName") ?: "Unknown Guard"
                    val startTime = doc.getString("dutyStart") ?: ""
                    val endTime = doc.getString("dutyEnd") ?: ""

                    val guardModel = AttendanceModel(
                        id = guardId,
                        guardId = guardId,
                        guardName = guardName,
                        siteId = siteId,
                        startTime = startTime,
                        endTime = endTime,
                        status = "Active"
                    )
                    guardList.add(guardModel)
                }
                guardAdapter.notifyDataSetChanged()
            }
    }

    private fun showDeleteGuardDialog(guard: AttendanceModel) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Guard")
            .setMessage("Do you want to delete ${guard.guardName} from the database?")
            .setPositiveButton("Delete") { _, _ ->
                val guardId = guard.guardId

                db.collection("users").document(guardId)
                    .delete()
                    .addOnSuccessListener {
                        db.collection("client_sites").document(siteId).collection("guards").document(guardId).delete()
                        Toast.makeText(this, "${guard.guardName} has been deleted.", Toast.LENGTH_SHORT).show()
                    }
                    .addOnFailureListener { e ->
                        Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        guardListener?.remove()
    }
}
