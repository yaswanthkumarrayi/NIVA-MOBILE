package `in`.niva2026.partner

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

        android.util.Log.d("NivaFCM", "onMessageReceived type=$type")

        when (type) {
            "partner_new_delivery" -> {
                val orderId = data["orderId"] ?: data["order_id"] ?: return
                android.util.Log.d("NivaFCM", "partner_new_delivery orderId=$orderId → starting siren")
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
                // Use ACTION_STOP_ALL — unconditionally kills any running siren.
                // This is the ONLY reliable path when the app process is dead because
                // the service's activeOrderIds set is always empty on process recreation.
                val orderId = data["orderId"] ?: data["order_id"] ?: "unknown"
                android.util.Log.d("NivaFCM", "partner_stop_siren orderId=$orderId → stopping ALL sirens")
                val intent = Intent(this, NivaSirenService::class.java).apply {
                    action = NivaSirenService.ACTION_STOP_ALL
                }
                // Use startForegroundService so Android O+ allows us to start the
                // service even from a background context (FCM receiver).
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
        // Token refresh is handled by the JS layer (fcmService.ts) on next app open.
        android.util.Log.d("NivaFCM", "FCM token refreshed — will be re-registered on next app open")
    }
}
