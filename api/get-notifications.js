export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');

  const notifications = global.notifications || [];
  
  // Return last 10 notifications
  response.json({ 
    notifications: notifications.slice(0, 10) 
  });
}