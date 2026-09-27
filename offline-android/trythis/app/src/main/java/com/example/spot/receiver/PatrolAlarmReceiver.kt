package com.example.spot.receiver

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.*

class PatrolAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action
        Log.d("PatrolAlarm", "Received action: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED || action == "android.intent.action.QUICKBOOT_POWERON") {
            rescheduleAlarms(context)
        } else {
            // This is a triggered alarm
            val siteName = intent?.getStringExtra("SITE_NAME") ?: "Patrol Site"
            val serviceIntent = Intent(context, PatrolAlarmService::class.java).apply {
                putExtra("SITE_NAME", siteName)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }

    private fun rescheduleAlarms(context: Context) {
        val sharedPref = context.getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        val userId = sharedPref.getString("USER_ID", "") ?: ""
        val siteName = sharedPref.getString("SITE_NAME", "Assigned Site") ?: "Assigned Site"

        if (userId.isEmpty()) return

        Log.d("PatrolAlarm", "Rescheduling alarms for user: $userId")

        FirebaseFirestore.getInstance().collection("guard_schedules_template").document(userId)
            .get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    val times = document.get("recurringTimes") as? List<String> ?: emptyList()
                    for (timeStr in times) {
                        scheduleAlarm(context, userId, timeStr, siteName)
                    }
                }
            }
    }

    private fun scheduleAlarm(context: Context, guardId: String, timeString: String, siteName: String) {
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

            val alarmId = (guardId + timeString).hashCode()
            val pendingIntent = PendingIntent.getBroadcast(
                context, alarmId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val info = AlarmManager.AlarmClockInfo(targetCal.timeInMillis, pendingIntent)
            alarmManager.setAlarmClock(info, pendingIntent)
            Log.d("PatrolAlarm", "Rescheduled alarm for $timeString")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
