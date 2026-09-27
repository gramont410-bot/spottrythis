package com.example.spot.ui.supervisor

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.spot.R
import com.example.spot.receiver.PatrolAlarmReceiver
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.*

class AssignShiftActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()
    private var currentSiteId: String = ""
    private var currentSiteName: String = ""
    private var selectedGuardId: String = ""
    private var selectedGuardName: String = ""

    private val patrolTimes = mutableListOf<String>()
    private val siteLocations = mutableListOf<LocationTag>()
    private lateinit var locationAdapter: LocationSelectionAdapter
    
    private lateinit var cbSelectAll: CheckBox

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_assign_shift)

        currentSiteId = intent.getStringExtra("SITE_ID") ?: ""
        currentSiteName = intent.getStringExtra("SITE_NAME") ?: "Patrol Site"

        val btnBack = findViewById<ImageButton>(R.id.btnBackAssignShift)
        val tvGuard = findViewById<TextView>(R.id.tvSelectedGuard)
        val btnAssign = findViewById<MaterialButton>(R.id.btnAssignShift)
        val lvSchedules = findViewById<ListView>(R.id.lvSchedules)
        val btnAddPatrolTime = findViewById<MaterialButton>(R.id.btnAddPatrolTime)
        val rvAssignLocations = findViewById<RecyclerView>(R.id.rvAssignLocations)
        cbSelectAll = findViewById(R.id.cbSelectAllLocations)

        // Times Adapter
        val timesAdapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, patrolTimes)
        lvSchedules.adapter = timesAdapter

        // Locations Adapter
        locationAdapter = LocationSelectionAdapter(siteLocations) {
            // Update "Select All" state without triggering a loop
            cbSelectAll.setOnCheckedChangeListener(null)
            cbSelectAll.isChecked = locationAdapter.isAllSelected()
            cbSelectAll.setOnCheckedChangeListener { _, isChecked ->
                locationAdapter.selectAll(isChecked)
            }
        }
        rvAssignLocations.layoutManager = LinearLayoutManager(this)
        rvAssignLocations.adapter = locationAdapter

        btnBack.setOnClickListener { onBackPressedDispatcher.onBackPressed() }
        tvGuard.setOnClickListener { showGuardSelector(tvGuard) }

        lvSchedules.setOnItemClickListener { _, _, position, _ ->
            val removedTime = patrolTimes[position]
            cancelSingleAlarm(removedTime)
            patrolTimes.removeAt(position)
            timesAdapter.notifyDataSetChanged()
        }

        btnAddPatrolTime.setOnClickListener {
            showTimePicker { time ->
                patrolTimes.add(time)
                timesAdapter.notifyDataSetChanged()
            }
        }
        
        cbSelectAll.setOnCheckedChangeListener { _, isChecked ->
            locationAdapter.selectAll(isChecked)
        }

        btnAssign.setOnClickListener {
            saveAllToFirestore()
        }

        loadSiteLocations()
    }

    private fun loadSiteLocations() {
        if (currentSiteId.isEmpty()) return
        
        db.collection("client_sites").document(currentSiteId).collection("locations")
            .get()
            .addOnSuccessListener { documents ->
                siteLocations.clear()
                for (doc in documents) {
                    // Fix: Map document ID to the object
                    doc.toObject(LocationTag::class.java)?.copy(id = doc.id)?.let { 
                        siteLocations.add(it) 
                    }
                }
                locationAdapter.notifyDataSetChanged()
                cbSelectAll.isChecked = locationAdapter.isAllSelected()
            }
    }

    private fun showGuardSelector(tvGuard: TextView) {
        if (currentSiteId.isEmpty()) return

        db.collection("users")
            .whereEqualTo("role", "guard")
            .whereEqualTo("assignedSiteId", currentSiteId)
            .get()
            .addOnSuccessListener { documents ->
                val guardNames = mutableListOf<String>()
                val guardIds = mutableListOf<String>()

                for (doc in documents) {
                    guardNames.add(doc.getString("fullName") ?: "Unnamed Guard")
                    guardIds.add(doc.id)
                }

                if (guardNames.isEmpty()) {
                    Toast.makeText(this, "No guards found at this site.", Toast.LENGTH_SHORT).show()
                    return@addOnSuccessListener
                }

                MaterialAlertDialogBuilder(this)
                    .setTitle("Select Guard")
                    .setItems(guardNames.toTypedArray()) { _, which ->
                        selectedGuardId = guardIds[which]
                        selectedGuardName = guardNames[which]
                        tvGuard.text = selectedGuardName
                        loadExistingSchedulesForGuard()
                    }
                    .show()
            }
    }

    private fun loadExistingSchedulesForGuard() {
        if (selectedGuardId.isEmpty()) return
        db.collection("guard_schedules_template").document(selectedGuardId).get()
            .addOnSuccessListener { document ->
                patrolTimes.clear()
                if (document.exists()) {
                    (document.get("recurringTimes") as? List<String>)?.let { patrolTimes.addAll(it) }
                    
                    val assignedLocations = document.get("assignedLocations") as? List<String> ?: emptyList()
                    locationAdapter.setSelectedIds(assignedLocations)
                } else {
                    locationAdapter.setSelectedIds(emptyList())
                }
                
                val lvSchedules = findViewById<ListView>(R.id.lvSchedules)
                (lvSchedules.adapter as? ArrayAdapter<*>)?.notifyDataSetChanged()
                
                cbSelectAll.setOnCheckedChangeListener(null)
                cbSelectAll.isChecked = locationAdapter.isAllSelected()
                cbSelectAll.setOnCheckedChangeListener { _, isChecked ->
                    locationAdapter.selectAll(isChecked)
                }
            }
    }

    private fun showTimePicker(onTimeSet: (String) -> Unit) {
        val cal = Calendar.getInstance()
        TimePickerDialog(this, { _, hour, minute ->
            val amPm = if (hour < 12) "AM" else "PM"
            val hour12 = if (hour % 12 == 0) 12 else hour % 12
            onTimeSet(String.format("%02d:%02d %s", hour12, minute, amPm))
        }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), false).show()
    }

    private fun saveAllToFirestore() {
        if (selectedGuardId.isEmpty()) {
            Toast.makeText(this, "Please select a guard.", Toast.LENGTH_SHORT).show()
            return
        }

        val selectedLocationIds = locationAdapter.getSelectedIds()
        
        val data = hashMapOf(
            "recurringTimes" to patrolTimes,
            "assignedLocations" to selectedLocationIds,
            "siteId" to currentSiteId,
            "guardName" to selectedGuardName
        )

        db.collection("guard_schedules_template").document(selectedGuardId)
            .set(data)
            .addOnSuccessListener {
                for (timeStr in patrolTimes) {
                    schedulePatrolAlarmForTime(this, timeStr, currentSiteName)
                }
                Toast.makeText(this, "Schedule finalized for $selectedGuardName", Toast.LENGTH_SHORT).show()
                finish()
            }
            .addOnFailureListener { e ->
                Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun cancelSingleAlarm(timeString: String) {
        if (selectedGuardId.isEmpty()) return
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, PatrolAlarmReceiver::class.java)
        val alarmId = (selectedGuardId + timeString).hashCode()
        val pendingIntent = PendingIntent.getBroadcast(
            this, alarmId, intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
        }
    }

    private fun schedulePatrolAlarmForTime(context: Context, timeString: String, siteName: String) {
        try {
            val sdf = SimpleDateFormat("hh:mm a", Locale.getDefault())
            val date = sdf.parse(timeString) ?: return
            val targetCal = Calendar.getInstance().apply {
                val t = Calendar.getInstance().apply { time = date }
                set(Calendar.HOUR_OF_DAY, t.get(Calendar.HOUR_OF_DAY))
                set(Calendar.MINUTE, t.get(Calendar.MINUTE))
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }

            if (targetCal.timeInMillis <= System.currentTimeMillis()) {
                targetCal.add(Calendar.DAY_OF_YEAR, 1)
            }

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, PatrolAlarmReceiver::class.java).apply {
                putExtra("SITE_NAME", siteName)
            }

            val alarmId = (selectedGuardId + timeString).hashCode()

            val pendingIntent = PendingIntent.getBroadcast(
                context, alarmId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val info = AlarmManager.AlarmClockInfo(targetCal.timeInMillis, pendingIntent)
            alarmManager.setAlarmClock(info, pendingIntent)
            
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
