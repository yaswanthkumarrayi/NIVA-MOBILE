package `in`.niva2026.partner

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * NivaSirenService — foreground service that plays the looping delivery alert.
 *
 * Lifecycle:
 *   ACTION_START    — start audio + foreground notification for a given orderId
 *   ACTION_STOP     — remove orderId; stop if no more active orders
 *   ACTION_STOP_ALL — unconditionally kill audio + service (used when another
 *                     partner accepts, on logout, and on app restart)
 *
 * android:stopWithTask="false" in the manifest means this service SURVIVES
 * the user swiping the app away from Recent Apps — which is the desired
 * behaviour so the siren keeps playing.
 *
 * START_NOT_STICKY: if Android kills us for memory, we do NOT restart
 * automatically. A phantom restart would play the siren even after the order
 * has been taken. The next legitimate FCM will re-start us if needed.
 */
class NivaSirenService : Service() {

    companion object {
        const val CHANNEL_ID      = "niva_orders"
        const val NOTIFICATION_ID = 9001
        const val ACTION_START    = "in.niva2026.partner.ACTION_START_SIREN"
        const val ACTION_STOP     = "in.niva2026.partner.ACTION_STOP_SIREN"
        const val ACTION_STOP_ALL = "in.niva2026.partner.ACTION_STOP_ALL_SIRENS"
        const val EXTRA_ORDER_ID  = "order_id"

        // Maximum siren duration per order, enforced NATIVELY (not in JS) so the
        // 60-second cap holds even when the app process is dead and the siren
        // was started directly by NivaFcmService from an FCM data message.
        const val MAX_SIREN_MS = 60_000L
    }

    private var mediaPlayer: MediaPlayer? = null
    private val activeOrderIds = mutableSetOf<String>()

    // Per-order 60s auto-stop timers. Keyed by orderId so each order expires
    // independently — Order A expiring never stops Order B's siren.
    private val timeoutHandler = Handler(Looper.getMainLooper())
    private val stopRunnables = HashMap<String, Runnable>()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action  = intent?.action ?: return START_NOT_STICKY
        val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: ""

        when (action) {
            ACTION_START -> {
                // Add to active set + arm this order's independent 60s auto-stop.
                if (orderId.isNotEmpty()) {
                    activeOrderIds.add(orderId)
                    scheduleAutoStop(orderId)
                }
                // Only start audio + foreground if not already running
                if (mediaPlayer == null || mediaPlayer?.isPlaying == false) {
                    startForeground(NOTIFICATION_ID, buildNotification())
                    startAudio()
                }
                android.util.Log.d("NivaSiren", "ACTION_START orderId=$orderId activeSet=$activeOrderIds")
            }

            ACTION_STOP -> {
                if (orderId.isNotEmpty()) {
                    activeOrderIds.remove(orderId)
                    cancelAutoStop(orderId)
                }
                android.util.Log.d("NivaSiren", "ACTION_STOP orderId=$orderId remaining=$activeOrderIds")
                // Stop only when no more orders are alerting
                if (activeOrderIds.isEmpty()) {
                    hardStop()
                }
            }

            ACTION_STOP_ALL -> {
                // Unconditionally kill everything — used when another partner accepts,
                // when the app restarts, and on logout.
                android.util.Log.d("NivaSiren", "ACTION_STOP_ALL — killing siren unconditionally")
                cancelAllTimers()
                activeOrderIds.clear()
                hardStop()
            }
        }

        // NOT_STICKY: do NOT auto-restart after Android kills this service.
        // A phantom restart would play the siren after the order is taken.
        return START_NOT_STICKY
    }

    private fun hardStop() {
        cancelAllTimers()
        stopAudio()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            android.util.Log.w("NivaSiren", "stopForeground error: ${e.message}")
        }
        stopSelf()
    }

    /**
     * Arm a native 60-second auto-stop for a single order. When it fires the
     * order is removed from the active set; the siren only fully stops once no
     * orders remain, so simultaneous orders each get their own 60s window.
     * Re-arming an already-armed order resets its timer.
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
        stopAudio() // release any previous player first
        try {
            val resId = resources.getIdentifier("niva_notification", "raw", packageName)
            if (resId == 0) {
                android.util.Log.e("NivaSiren", "niva_notification.mp3 not found in res/raw!")
                return
            }
            val uri = Uri.parse("android.resource://$packageName/$resId")
            mediaPlayer = MediaPlayer().apply {
                // USAGE_ALARM: plays through alarm stream, respects alarm volume not media volume,
                // and bypasses DND when the device's alarm override is enabled.
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setLegacyStreamType(AudioManager.STREAM_ALARM)
                        .build()
                )
                setDataSource(applicationContext, uri)
                isLooping = true
                prepare()
                start()
            }
            android.util.Log.d("NivaSiren", "Audio started (USAGE_ALARM, looping)")
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
            android.util.Log.w("NivaSiren", "stopAudio error: ${e.message}")
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
            .setContentTitle("NIVA Partner")
            .setContentText("New delivery request — open app to respond")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "NIVA Delivery Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for new delivery requests"
                enableVibration(true)
                setShowBadge(true)
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
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
