/**
 * In-app notification history — persisted for the session.
 * Shows in the Notifications tab.
 */
import { useState, useEffect } from 'react';

export interface NotificationRecord {
  id: string;
  orderId: string;
  title: string;
  body: string;
  receivedAt: string;
}

// Module-level store (simple for session duration)
let _notifications: NotificationRecord[] = [];
let _listeners: Array<(n: NotificationRecord[]) => void> = [];

export function addNotificationToHistory(record: NotificationRecord) {
  // Deduplicate by id
  if (_notifications.some((n) => n.id === record.id)) return;
  _notifications = [record, ..._notifications].slice(0, 100); // max 100
  _listeners.forEach((l) => l([..._notifications]));
}

export function useNotificationHistory() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([..._notifications]);

  useEffect(() => {
    const listener = (updated: NotificationRecord[]) => setNotifications(updated);
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter((l) => l !== listener); };
  }, []);

  const clearAll = () => {
    _notifications = [];
    setNotifications([]);
    _listeners.forEach((l) => l([]));
  };

  return { notifications, clearAll };
}
