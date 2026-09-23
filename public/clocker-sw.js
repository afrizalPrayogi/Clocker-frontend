self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    if (event.action === 'stop') {
      await stopTimerFromNotification(event.notification.data || {});
      return;
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => 'focus' in client);
    if (existing) return existing.focus();
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

async function stopTimerFromNotification(data) {
  const apiUrl = data.apiUrl;
  const ownerApiKey = data.ownerApiKey;
  if (!apiUrl) {
    await openClocker(data.url || '/');
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/timer/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ownerApiKey ? { 'x-owner-api-key': ownerApiKey } : {}),
      },
      body: JSON.stringify({ description: 'Stopped from Android notification' }),
    });
    if (!response.ok) throw new Error('Stop request failed');

    await broadcastTimerStopped();
    await self.registration.showNotification('Timer dihentikan', {
      body: `${data.taskTitle || 'Sesi'} tersimpan di Clocker.`,
      badge: '/notification-badge.svg',
      icon: '/notification-icon.svg',
      tag: 'clocker-timer-stopped',
      data: { url: data.url || '/' },
    });
  } catch {
    await self.registration.showNotification('Gagal stop timer', {
      body: 'Buka Clocker untuk cek timer yang sedang berjalan.',
      badge: '/notification-badge.svg',
      icon: '/notification-icon.svg',
      tag: 'clocker-stop-failed',
      requireInteraction: true,
      data: { url: data.url || '/' },
    });
    await openClocker(data.url || '/');
  }
}

async function broadcastTimerStopped() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: 'CLOCKER_TIMER_STOPPED' }));
}

async function openClocker(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((client) => 'focus' in client);
  if (existing) return existing.focus();
  if (self.clients.openWindow) return self.clients.openWindow(url);
}
