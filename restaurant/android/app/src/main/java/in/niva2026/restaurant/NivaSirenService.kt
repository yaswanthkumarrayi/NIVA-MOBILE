package `in`.niva2026.restaurant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class NivaSirenService : Service() {

    companion object {
        const val CHANNEL_ID      = "niva_orders"
        const val NOTIFICATION_ID = 9001
        const val ACTION_START    = "in.niva2026.restaurant.ACTION_START_SIREN"
        const val ACTION_STOP     = "in.niva2026.restaurant.ACTION_STOP_SIREN"
        const val EXTRA_ORDER_ID  = "order_id"
        const val EXTRA_TITLE     = "title"
        const val EXTRA_BODY      = "body"

        // Native-enforced 60s max per order — holds even when the app process is
        // dead and the siren was started directly by NivaFcmService from FCM.
        const val MAX_SIREN_MS = 60_000L
    }

    private var mediaPlayer: MediaPlayer? = null
    private val activeOrderIds = mutableSetOf<String>()

    // Per-order 60s auto-stop timers — each order expires independently.
    private val timeoutHandler = Handler(Looper.getMainLooper())
    private val stopRunnables = HashMap<String, Runnable>()

    // Latest notification title/body (updated on each new order)
    private var latestTitle = "New NIVA Order 🍽️"
    private var latestBody  = "A new order is waiting for your action."

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action  = intent?.action ?: return START_NOT_STICKY
        val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: ""

        when (action) {
            ACTION_START -> {
                // Update notification text from the incoming FCM data
                intent.getStringExtra(EXTRA_TITLE)?.let { latestTitle = it }
                intent.getStringExtra(EXTRA_BODY)?.let  { latestBody  = it }

                if (activeOrderIds.isEmpty()) {
                    // First order — start foreground + audio
                    startForeground(NOTIFICATION_ID, buildNotification())
                    startAudio()
                } else {
                    // Additional order while siren running — update notification text
                    val nm = getSystemService(NotificationManager::class.java)
                    nm.notify(NOTIFICATION_ID, buildNotification())
                }
                if (orderId.isNotEmpty()) {
                    activeOrderIds.add(orderId)
                    scheduleAutoStop(orderId)
                }
            }
            ACTION_STOP -> {
                if (orderId == "__all__") {
                    cancelAllTimers()
                    activeOrderIds.clear()
                } else if (orderId.isNotEmpty()) {
                    activeOrderIds.remove(orderId)
                    cancelAutoStop(orderId)
                }
                if (activeOrderIds.isEmpty()) {
                    hardStop()
                }
            }
        }
        return START_STICKY
    }

    private fun hardStop() {
        cancelAllTimers()
        stopAudio()
        try {
            @Suppress("DEPRECATION")
            stopForeground(true)
        } catch (e: Exception) {
            android.util.Log.w("NivaSiren", "stopForeground error: ${e.message}")
        }
        stopSelf()
    }

    /**
     * Arm a native 60-second auto-stop for a single order. Each order expires
     * independently; the siren only fully stops once no orders remain.
     */
    private fun scheduleAutoStop(orderId: String) {
        cancelAutoStop(orderId)
        val r = Runnable {
            android.util.Log.d("NivaSiren", "60s elapsed orderId=$orderId — auto-stop")
            stopRunnables.remove(orderId)
            activeOrderIds.remove(orderId)
            if (activeOrderIds.isEmpty()) hardStop()
        }
        stopRunnables[orderId] = r
        timeoutHandler.postDelayed(r, MAX_SIREN_MS)
    }

    private fun cancelAutoStop(orderId: String) {
        stopRunnables.remove(orderId)?.let { timeoutHandler.removeCallbacks(it) }
    }

    private fun cancelAllTimers() {
        for (r in stopRunnables.values) timeoutHandler.removeCallbacks(r)
        stopRunnables.clear()
    }

    private fun startAudio() {
        stopAudio()
        try {
            val resId = resources.getIdentifier("niva_notification", "raw", packageName)
            if (resId == 0) {
                android.util.Log.e("NivaSiren", "niva_notification.mp3 not found in res/raw!")
                return
            }
            val uri = Uri.parse("android.resource://$packageName/$resId")
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
                setDataSource(applicationContext, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            android.util.Log.e("NivaSiren", "Failed to start audio: ${e.message}")
        }
    }

    private fun stopAudio() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
        } catch (e: Exception) {
            // ignore
        }
        mediaPlayer = null
    }

    private fun buildNotification(): Notification {
        val mainIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, mainIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(latestTitle)
            .setContentText(latestBody)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val soundUri = Uri.parse(
                "android.resource://$packageName/raw/niva_notification"
            )
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                "NIVA Orders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "New order alerts for NIVA Restaurant"
                enableVibration(true)
                setShowBadge(true)
                // Set the channel sound so even if MediaPlayer fails,
                // the heads-up notification plays the correct tone
                setSound(soundUri, audioAttributes)
            }
            val manager = getSystemService(NotificationManager::class.java)
            // Only create if not already existing (channel settings are sticky
            // once set — user changes are preserved on subsequent creates)
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(channel)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        cancelAllTimers()
        stopAudio()
        activeOrderIds.clear()
        super.onDestroy()
    }
}
