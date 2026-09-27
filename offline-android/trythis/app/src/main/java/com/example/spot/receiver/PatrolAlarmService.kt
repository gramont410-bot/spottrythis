package com.example.spot.receiver

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.spot.R
import com.example.spot.ui.auth.FaceVerifyActivity
import com.example.spot.ui.login.LoginActivity

class PatrolAlarmService : Service() {
    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == "STOP_ALARM") {
            stopAlarmAndOpenApp()
            return START_NOT_STICKY
        }

        val siteName = intent?.getStringExtra("SITE_NAME") ?: "Assigned Site"
        Log.d("PatrolAlarm", "Service started for Site: $siteName")
        
        // Use SCREEN_BRIGHT_WAKE_LOCK to ensure the screen physically turns on
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            @Suppress("DEPRECATION")
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "SPOT:PatrolAlarmWakeLock"
        )
        wakeLock?.acquire(3 * 60 * 1000L /* 3 minutes */)

        startForeground(1001, createNotification(siteName))
        playAlarmSound()

        return START_STICKY
    }

    private fun playAlarmSound() {
        try {
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@PatrolAlarmService, alarmUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e("PatrolAlarm", "Error playing sound", e)
        }
    }

    private fun createNotification(siteName: String): Notification {
        val channelId = "patrol_alarm_channel_v4"
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId, "Emergency Patrol Alerts", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical alerts for mandatory guard patrols"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                val audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), audioAttributes)
                setBypassDnd(true)
            }
            manager.createNotificationChannel(channel)
        }

        val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        val userId = sharedPref.getString("USER_ID", "") ?: ""
        val role = sharedPref.getString("USER_ROLE", "") ?: ""
        val name = sharedPref.getString("USER_NAME", "") ?: ""
        val siteId = sharedPref.getString("SITE_ID", "") ?: ""

        val openAppIntent = if (userId.isNotEmpty()) {
            Intent(this, FaceVerifyActivity::class.java).apply {
                putExtra("USER_ID", userId)
                putExtra("USER_ROLE", role)
                putExtra("GUARD_NAME", name)
                putExtra("ASSIGNED_SITE_ID", siteId)
                putExtra("IS_PATROL_MODE", true)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
        } else {
            Intent(this, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
        }

        val openAppPendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("🚨 START PATROL NOW")
            .setContentText("Site: $siteName. Verify Face ID to begin.")
            .setSmallIcon(R.drawable.spot)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(openAppPendingIntent, true) // Wakes screen and shows activity immediately
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
            .addAction(android.R.drawable.ic_menu_directions, "VERIFY NOW", openAppPendingIntent)
            .build()
    }

    private fun stopAlarmAndOpenApp() {
        mediaPlayer?.stop()
        mediaPlayer?.release()
        mediaPlayer = null
        
        wakeLock?.let {
            if (it.isHeld) it.release()
        }

        val sharedPref = getSharedPreferences("SPOT_SESSION", Context.MODE_PRIVATE)
        val userId = sharedPref.getString("USER_ID", "") ?: ""
        val role = sharedPref.getString("USER_ROLE", "") ?: ""
        val name = sharedPref.getString("USER_NAME", "") ?: ""
        val siteId = sharedPref.getString("SITE_ID", "") ?: ""

        val intent = if (userId.isNotEmpty()) {
            Intent(this, FaceVerifyActivity::class.java).apply {
                putExtra("USER_ID", userId)
                putExtra("USER_ROLE", role)
                putExtra("GUARD_NAME", name)
                putExtra("ASSIGNED_SITE_ID", siteId)
                putExtra("IS_PATROL_MODE", true)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
        } else {
            Intent(this, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
        }
        
        startActivity(intent)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        mediaPlayer?.stop()
        mediaPlayer?.release()
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
