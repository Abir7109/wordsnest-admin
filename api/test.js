export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');
  
  // Return simple test response
  response.json({
    message: "API is working!",
    method: request.method,
    query: request.query,
    body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
  });
}