package `in`.niva2026.restaurant

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
