export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { title, message, userID } = request.body || {};

  if (!title || !message) {
    return response.status(400).json({ error: 'Title and message required' });
  }

  // Store notification for polling by Android app
  // In a real app, you'd use FCM, but for now we'll store in memory
  global.notifications = global.notifications || [];
  global.notifications.unshift({
    id: Date.now().toString(),
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false
  });

  // Keep only last 50 notifications
  if (global.notifications.length > 50) {
    global.notifications = global.notifications.slice(0, 50);
  }

  console.log('Notification sent:', title, message);

  response.json({ success: true, message: 'Notification queued' });
}