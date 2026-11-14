/**
 * Expo Config Plugin: withNivaSiren — Partner App
 * Package name: in.niva2026.partner
 *
 * This plugin runs during `expo prebuild` and writes the four native Kotlin
 * files that implement the looping delivery alert. The files it writes are
 * identical to the ones committed in android/app/src/main/java/in/niva2026/partner/.
 *
 * IMPORTANT: If you edit NivaFcmService.kt, NivaSirenService.kt,
 * NivaSirenModule.kt, or NivaSirenPackage.kt directly in the android/ folder,
 * keep this plugin in sync so that the next `expo prebuild --clean` doesn't
 * overwrite your changes with the old version.
 */

const {
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ─── NivaFcmService.kt ────────────────────────────────────────────────────────
const SIREN_FCM_SERVICE_KOTLIN = `package \`in\`.niva2026.partner

import android.content.Intent
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * NivaFcmService — intercepts FCM data messages even when the app is killed.
 *
 * Handles two message types:
 *
 *   partner_new_delivery
 *     → Sends ACTION_START to NivaSirenService so the looping alert begins
 *       without the user needing to open the app.
 *
 *   partner_stop_siren
 *     → Sends ACTION_STOP_ALL to NivaSirenService so the siren stops
 *       IMMEDIATELY when another partner claims the order, even if:
 *         • this app is killed
 *         • this app is in the background
 *         • the screen is locked
 *         • the user never opened the notification
 *
 * WHY ACTION_STOP_ALL instead of per-orderId ACTION_STOP:
 *   When the app process is dead, NivaSirenService is recreated fresh — its
 *   activeOrderIds set is empty. A per-orderId stop would find nothing to
 *   remove and leave the audio running. ACTION_STOP_ALL unconditionally kills
 *   all audio regardless of the set state.
 */
class NivaFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val type = data["type"] ?: return

        android.util.Log.d("NivaFCM", "onMessageReceived type=\$type")

        when (type) {
            "partner_new_delivery" -> {
                val orderId = data["orderId"] ?: data["order_id"] ?: return
                android.util.Log.d("NivaFCM", "partner_new_delivery orderId=\$orderId → starting siren")
                val intent = Intent(this, NivaSirenService::class.java).apply {
                    action = NivaSirenService.ACTION_START
                    putExtra(NivaSirenService.EXTRA_ORDER_ID, orderId)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
            }

            "partner_stop_siren" -> {
                val orderId = data["orderId"] ?: data["order_id"] ?: "unknown"
                android.util.Log.d("NivaFCM", "partner_stop_siren orderId=\$orderId → stopping ALL sirens")
                val intent = Intent(this, NivaSirenService::class.java).apply {
                    action = NivaSirenService.ACTION_STOP_ALL
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
            }
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        android.util.Log.d("NivaFCM", "FCM token refreshed — will be re-registered on next app open")
    }
}
`;

// ─── NivaSirenService.kt ─────────────────────────────────────────────────────
const SIREN_SERVICE_KOTLIN = `package \`in\`.niva2026.partner

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
 *   ACTION_STOP_ALL — unconditionally kill audio + service
 *
 * android:stopWithTask="false" means this service SURVIVES the user swiping
 * the app away from Recent Apps — keeping the siren playing.
 *
 * START_NOT_STICKY: do NOT auto-restart after Android kills this service.
 * A phantom restart would play the siren after the order has been taken.
 */
class NivaSirenService : Service() {

    companion object {
        const val CHANNEL_ID      = "niva_orders"
        const val NOTIFICATION_ID = 9001
        const val ACTION_START    = "in.niva2026.partner.ACTION_START_SIREN"
        const val ACTION_STOP     = "in.niva2026.partner.ACTION_STOP_SIREN"
        const val ACTION_STOP_ALL = "in.niva2026.partner.ACTION_STOP_ALL_SIRENS"
        const val EXTRA_ORDER_ID  = "order_id"

        // Native-enforced 60s max per order (holds even when the JS runtime is dead).
        const val MAX_SIREN_MS = 60_000L
    }

    private var mediaPlayer: MediaPlayer? = null
    private val activeOrderIds = mutableSetOf<String>()

    // Per-order 60s auto-stop timers — each order expires independently.
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
                if (orderId.isNotEmpty()) {
                    activeOrderIds.add(orderId)
                    scheduleAutoStop(orderId)
                }
                if (mediaPlayer == null || mediaPlayer?.isPlaying == false) {
                    startForeground(NOTIFICATION_ID, buildNotification())
                    startAudio()
                }
                android.util.Log.d("NivaSiren", "ACTION_START orderId=\$orderId activeSet=\$activeOrderIds")
            }

            ACTION_STOP -> {
                if (orderId.isNotEmpty()) {
                    activeOrderIds.remove(orderId)
                    cancelAutoStop(orderId)
                }
                android.util.Log.d("NivaSiren", "ACTION_STOP orderId=\$orderId remaining=\$activeOrderIds")
                if (activeOrderIds.isEmpty()) {
                    hardStop()
                }
            }

            ACTION_STOP_ALL -> {
                android.util.Log.d("NivaSiren", "ACTION_STOP_ALL — killing siren unconditionally")
                cancelAllTimers()
                activeOrderIds.clear()
                hardStop()
            }
        }

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
            android.util.Log.w("NivaSiren", "stopForeground error: \${e.message}")
        }
        stopSelf()
    }

    private fun scheduleAutoStop(orderId: String) {
        cancelAutoStop(orderId)
        val r = Runnable {
            android.util.Log.d("NivaSiren", "60s elapsed orderId=\$orderId — auto-stop")
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
            val uri = Uri.parse("android.resource://\$packageName/\$resId")
            mediaPlayer = MediaPlayer().apply {
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
            android.util.Log.e("NivaSiren", "Failed to start audio: \${e.message}")
        }
    }

    private fun stopAudio() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
        } catch (e: Exception) {
            android.util.Log.w("NivaSiren", "stopAudio error: \${e.message}")
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
`;

// ─── NivaSirenModule.kt ───────────────────────────────────────────────────────
const SIREN_MODULE_KOTLIN = `package \`in\`.niva2026.partner

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * NivaSirenModule — exposes siren control to the React Native JS bridge.
 *
 * stopSiren / stopAllSirens both send ACTION_STOP_ALL (not ACTION_STOP)
 * because when the service is started by NivaFcmService while the app is
 * dead, activeOrderIds is empty — a per-orderId stop would be a no-op.
 */
class NivaSirenModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NivaSirenModule"

    @ReactMethod
    fun startSiren(orderId: String) {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, NivaSirenService::class.java).apply {
            action = NivaSirenService.ACTION_START
            putExtra(NivaSirenService.EXTRA_ORDER_ID, orderId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
        android.util.Log.d("NivaSirenModule", "startSiren orderId=\$orderId")
    }

    @ReactMethod
    fun stopSiren(orderId: String) {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, NivaSirenService::class.java).apply {
            action = NivaSirenService.ACTION_STOP_ALL
        }
        ctx.startService(intent)
        android.util.Log.d("NivaSirenModule", "stopSiren orderId=\$orderId → ACTION_STOP_ALL sent")
    }

    @ReactMethod
    fun stopAllSirens() {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, NivaSirenService::class.java).apply {
            action = NivaSirenService.ACTION_STOP_ALL
        }
        ctx.startService(intent)
        android.util.Log.d("NivaSirenModule", "stopAllSirens → ACTION_STOP_ALL sent")
    }
}
`;

const SIREN_PACKAGE_KOTLIN = `package \`in\`.niva2026.partner

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NivaSirenPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(NivaSirenModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`;

function withNivaSirenKotlin(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidSrc = path.join(
        projectRoot, 'android', 'app', 'src', 'main', 'java', 'in', 'niva2026', 'partner'
      );
      fs.mkdirSync(androidSrc, { recursive: true });
      fs.writeFileSync(path.join(androidSrc, 'NivaFcmService.kt'), SIREN_FCM_SERVICE_KOTLIN);
      fs.writeFileSync(path.join(androidSrc, 'NivaSirenService.kt'), SIREN_SERVICE_KOTLIN);
      fs.writeFileSync(path.join(androidSrc, 'NivaSirenModule.kt'), SIREN_MODULE_KOTLIN);
      fs.writeFileSync(path.join(androidSrc, 'NivaSirenPackage.kt'), SIREN_PACKAGE_KOTLIN);

      // Copy NIVA_Notification.mp3 into res/raw/ so the native service can load it
      const rawDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });

      const possibleSources = [
        path.join(projectRoot, '..', '..', 'NIVA-Frontend', 'public', 'NIVA_Notification.mp3'),
        path.join(projectRoot, 'assets', 'NIVA_Notification.mp3'),
      ];

      let copied = false;
      for (const src of possibleSources) {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(rawDir, 'niva_notification.mp3'));
          console.log(`[withNivaSiren] Copied ${src} → res/raw/niva_notification.mp3`);
          copied = true;
          break;
        }
      }
      if (!copied) {
        // File already in place from a previous build — not an error
        const existing = path.join(rawDir, 'niva_notification.mp3');
        if (fs.existsSync(existing)) {
          console.log('[withNivaSiren] niva_notification.mp3 already in res/raw/ — skipping copy');
        } else {
          console.warn('[withNivaSiren] NIVA_Notification.mp3 not found in any source location!');
        }
      }

      return config;
    },
  ]);
}

function withNivaSirenManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    if (!application.service) application.service = [];

    // NivaSirenService — foreground, survives task removal, not exported
    const sirenIdx = application.service.findIndex(
      (s) => s.$?.['android:name'] === '.NivaSirenService'
    );
    const sirenEntry = {
      $: {
        'android:name': '.NivaSirenService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'mediaPlayback',
        // stopWithTask=false → service keeps running when app is swiped away
        'android:stopWithTask': 'false',
      },
    };
    if (sirenIdx === -1) {
      application.service.push(sirenEntry);
    } else {
      // Merge — preserve any extra attributes that Expo may have added
      application.service[sirenIdx].$ = {
        ...application.service[sirenIdx].$,
        ...sirenEntry.$,
      };
    }

    // NivaFcmService — receives FCM data messages
    const fcmIdx = application.service.findIndex(
      (s) => s.$?.['android:name'] === '.NivaFcmService'
    );
    if (fcmIdx === -1) {
      application.service.push({
        $: {
          'android:name': '.NivaFcmService',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
          },
        ],
      });
    }

    return config;
  });
}

module.exports = function withNivaSiren(config) {
  config = withNivaSirenKotlin(config);
  config = withNivaSirenManifest(config);
  return config;
};
