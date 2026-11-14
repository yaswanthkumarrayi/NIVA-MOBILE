/**
 * Expo Config Plugin: withNivaSiren
 *
 * This plugin:
 *   1. Copies NIVA_Notification.mp3 from the project's public/ folder into
 *      android/app/src/main/res/raw/ so Android can reference it natively.
 *   2. Injects the NivaSirenService (Foreground Service) Kotlin source file.
 *   3. Injects the NivaSirenModule (React Native module bridge) Kotlin source.
 *   4. Registers the service and module in AndroidManifest.xml.
 *
 * Why a Foreground Service?
 *   A normal notification sound plays once. NIVA requires a looping 60-second
 *   siren that continues even when the app is backgrounded and stops immediately
 *   on order acceptance. Only an Android Foreground Service can do this reliably.
 *
 * The NativeSirenModule is exposed to JS as NativeModules.NivaSirenModule with:
 *   startSiren(orderId: string) — starts looping audio + foreground notification
 *   stopSiren(orderId: string)  — stops audio for a specific order
 *   stopAllSirens()             — stops all active sirens (on logout)
 */

const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ─── Kotlin Source: FCM Service (handles new order + stop-siren messages) ────

const SIREN_FCM_SERVICE_KOTLIN = `package \`in\`.niva2026.restaurant

import android.content.Intent
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * NivaFcmService — extends FirebaseMessagingService to intercept FCM data
 * messages while the app is in the background, in the recents list, or killed.
 *
 * Message types handled:
 *
 *   restaurant_new_order
 *     → Starts NivaSirenService (foreground service + looping audio).
 *       Works in all app states including terminated.
 *
 *   restaurant_stop_siren
 *     → Stops the siren for a specific orderId on this device.
 *       Sent by the backend when ANOTHER device accepts the same order.
 *       Stops the correct per-order siren — not all sirens.
 *
 * WHY data-only messages (no 'notification' block)?
 *   When a message contains a 'notification' block, FCM displays it via the
 *   system tray automatically and does NOT call onMessageReceived() when the
 *   app is backgrounded or killed. With a pure data message, Android always
 *   routes it here regardless of app state, letting us start/stop the native
 *   foreground service directly without any React JS involvement.
 */
class NivaFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data    = message.data
        val type    = data["type"] ?: return
        val orderId = data["orderId"] ?: data["order_id"] ?: ""

        when (type) {
            "restaurant_new_order" -> {
                if (orderId.isEmpty()) return
                val title = data["title"] ?: "New NIVA Order 🍽️"
                val body  = data["body"]  ?: "A new order is waiting for your action."
                val intent = Intent(this, NivaSirenService::class.java).apply {
                    action = NivaSirenService.ACTION_START
                    putExtra(NivaSirenService.EXTRA_ORDER_ID, orderId)
                    putExtra(NivaSirenService.EXTRA_TITLE,    title)
                    putExtra(NivaSirenService.EXTRA_BODY,     body)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
            }

            "restaurant_stop_siren" -> {
                val stopId = if (orderId.isEmpty()) "__all__" else orderId
                val intent = Intent(this, NivaSirenService::class.java).apply {
                    action = NivaSirenService.ACTION_STOP
                    putExtra(NivaSirenService.EXTRA_ORDER_ID, stopId)
                }
                startService(intent)
            }
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }
}
`;

const SIREN_SERVICE_KOTLIN = `package \`in\`.niva2026.restaurant

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

        // Native-enforced 60s max per order (holds even when the JS runtime is dead).
        const val MAX_SIREN_MS = 60_000L
    }

    private var mediaPlayer: MediaPlayer? = null
    private val activeOrderIds = mutableSetOf<String>()

    // Per-order 60s auto-stop timers — each order expires independently.
    private val timeoutHandler = Handler(Looper.getMainLooper())
    private val stopRunnables = HashMap<String, Runnable>()

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
                intent.getStringExtra(EXTRA_TITLE)?.let { latestTitle = it }
                intent.getStringExtra(EXTRA_BODY)?.let  { latestBody  = it }

                if (activeOrderIds.isEmpty()) {
                    startForeground(NOTIFICATION_ID, buildNotification())
                    startAudio()
                } else {
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
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
                setDataSource(applicationContext, uri)
                isLooping = true
                prepare()
                start()
            }
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
                "android.resource://\$packageName/raw/niva_notification"
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
                setSound(soundUri, audioAttributes)
            }
            val manager = getSystemService(NotificationManager::class.java)
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
`;

// ─── Kotlin Source: React Native Module Bridge ───────────────────────────────

const SIREN_MODULE_KOTLIN = `package \`in\`.niva2026.restaurant

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

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
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
    }

    @ReactMethod
    fun stopSiren(orderId: String) {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, NivaSirenService::class.java).apply {
            action = NivaSirenService.ACTION_STOP
            putExtra(NivaSirenService.EXTRA_ORDER_ID, orderId)
        }
        ctx.startService(intent)
    }

    @ReactMethod
    fun stopAllSirens() {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, NivaSirenService::class.java).apply {
            action = NivaSirenService.ACTION_STOP
            putExtra(NivaSirenService.EXTRA_ORDER_ID, "__all__")
        }
        ctx.startService(intent)
    }
}
`;

const SIREN_PACKAGE_KOTLIN = `package \`in\`.niva2026.restaurant

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

// ─── Plugin implementation ────────────────────────────────────────────────────

function withNivaSirenKotlin(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidSrc = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'in',
        'niva2026',
        'restaurant'
      );

      // Ensure directory exists
      fs.mkdirSync(androidSrc, { recursive: true });

      // Write Kotlin files
      fs.writeFileSync(path.join(androidSrc, 'NivaFcmService.kt'), SIREN_FCM_SERVICE_KOTLIN);
      fs.writeFileSync(path.join(androidSrc, 'NivaSirenService.kt'), SIREN_SERVICE_KOTLIN);
      fs.writeFileSync(path.join(androidSrc, 'NivaSirenModule.kt'), SIREN_MODULE_KOTLIN);
      fs.writeFileSync(path.join(androidSrc, 'NivaSirenPackage.kt'), SIREN_PACKAGE_KOTLIN);

      // Copy NIVA_Notification.mp3 → android/app/src/main/res/raw/
      const rawDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });

      // Source: the existing NIVA_Notification.mp3 from the project public/ folder
      const possibleSources = [
        path.join(projectRoot, '..', '..', 'NIVA-Frontend', 'public', 'NIVA_Notification.mp3'),
        path.join(projectRoot, 'assets', 'NIVA_Notification.mp3'),
      ];

      let copied = false;
      for (const src of possibleSources) {
        if (fs.existsSync(src)) {
          // Android resource names must be lowercase
          fs.copyFileSync(src, path.join(rawDir, 'niva_notification.mp3'));
          console.log(`[withNivaSiren] Copied ${src} → res/raw/niva_notification.mp3`);
          copied = true;
          break;
        }
      }

      if (!copied) {
        console.warn(
          '[withNivaSiren] NIVA_Notification.mp3 not found! ' +
          'Please copy it to mobile/restaurant/assets/NIVA_Notification.mp3'
        );
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

    // Add the foreground service declaration
    if (!application.service) {
      application.service = [];
    }

    const serviceExists = application.service.some(
      (s) => s.$?.['android:name'] === '.NivaSirenService'
    );

    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': '.NivaSirenService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaPlayback',
          // stopWithTask=false → a playing siren survives the user swiping the
          // app away from Recent Apps (matches the partner app behaviour).
          'android:stopWithTask': 'false',
        },
      });
    } else {
      const svc = application.service.find(
        (s) => s.$?.['android:name'] === '.NivaSirenService'
      );
      if (svc) svc.$['android:stopWithTask'] = 'false';
    }

    // Register the FCM service that starts the siren from the background
    const fcmServiceExists = application.service.some(
      (s) => s.$?.['android:name'] === '.NivaFcmService'
    );

    if (!fcmServiceExists) {
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

// ─── Register NivaSirenPackage in MainApplication.kt ──────────────────────────
// The generated NivaSirenPackage.kt is a custom native module that is NOT
// autolinked. Without registering it in getPackages(), NativeModules.NivaSirenModule
// is null in JS and the siren never plays. This mod injects the registration.
function withNivaSirenMainApplication(config) {
  return withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    // Only patch Kotlin MainApplication (this app uses .kt)
    if (
      src.includes('PackageList(this).packages') &&
      !src.includes('NivaSirenPackage()')
    ) {
      src = src.replace(
        /val packages = PackageList\(this\)\.packages/,
        'val packages = PackageList(this).packages\n            packages.add(NivaSirenPackage())'
      );
      config.modResults.contents = src;
    }

    return config;
  });
}

module.exports = function withNivaSiren(config) {
  config = withNivaSirenKotlin(config);
  config = withNivaSirenManifest(config);
  config = withNivaSirenMainApplication(config);
  return config;
};
