import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, token } = request.body;

  if (!token) {
    return response.status(400).json({ error: "FCM token is required" });
  }

  // Note: Firebase Admin requires service account - simplified version
  // Full FCM implementation would need proper Firebase Admin setup
  response.json({ success: true, message: "Notification endpoint ready" });
}