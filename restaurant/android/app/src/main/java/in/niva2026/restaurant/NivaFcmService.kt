package `in`.niva2026.restaurant

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
 * WHY data-only messages (no `notification` block)?
 *   When a message contains a `notification` block, FCM displays it via the
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
                // Stop the siren for a specific order (accepted by another device)
                // or all sirens if orderId is absent / "__all__".
                val stopId = if (orderId.isEmpty()) "__all__" else orderId
                val intent = Intent(this, NivaSirenService::class.java).apply {
                    action = NivaSirenService.ACTION_STOP
                    putExtra(NivaSirenService.EXTRA_ORDER_ID, stopId)
                }
                // startService (not startForeground) — we are stopping, not starting
                startService(intent)
            }
        }
    }

    /**
     * Token refresh is handled by the JS FCM registration in fcmService.ts.
     * When the FCM SDK issues a new token, the JS layer registers it on the
     * next app open. No native action needed here.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }
}
