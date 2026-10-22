// Set VITE_API_BASE in the deployment environment when the API is hosted online.
// Local development continues to use the Express server on port 8080.
export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8080').replace(/\/$/, '');
