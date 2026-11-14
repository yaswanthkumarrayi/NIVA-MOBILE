package `in`.niva2026.partner

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * NivaSirenModule — exposes siren control to the React Native JS bridge.
 *
 * startSiren(orderId)   — start the looping alert for an order
 * stopSiren(orderId)    — stop the alert; since only one audio player runs at
 *                         a time we always send ACTION_STOP_ALL so the stop is
 *                         unconditional regardless of what is in activeOrderIds
 * stopAllSirens()       — stop all alerts unconditionally (logout, restart)
 *
 * NOTE: stopSiren uses ACTION_STOP_ALL (not ACTION_STOP) deliberately.
 * When the foreground service was started by NivaFcmService while the app was
 * dead, the activeOrderIds set inside the service is empty on process
 * recreation. A per-orderId ACTION_STOP would find nothing to remove, leaving
 * the audio running. ACTION_STOP_ALL is always safe: if nothing is playing it
 * is a cheap no-op; if something is playing it will be killed.
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
        android.util.Log.d("NivaSirenModule", "startSiren orderId=$orderId")
    }

    @ReactMethod
    fun stopSiren(orderId: String) {
        // Always use STOP_ALL — see class-level comment for why.
        val ctx = reactApplicationContext
        val intent = Intent(ctx, NivaSirenService::class.java).apply {
            action = NivaSirenService.ACTION_STOP_ALL
        }
        ctx.startService(intent)
        android.util.Log.d("NivaSirenModule", "stopSiren orderId=$orderId → ACTION_STOP_ALL sent")
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
