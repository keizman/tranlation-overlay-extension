export const AuthConfig = {
  tokenRefreshThreshold: 600,
  tokenCheckInterval: 120,
  maxRetryCount: 3,
  retryDelay: 1000,
  authEndpoint: 'https://side-translation.planktonfly.com/auth_token',
  apiBaseUrl: 'https://side-translation.planktonfly.com/api',
  // IMPORTANT: Replace with your actual server-side secret
  // This is a PLACEHOLDER - you MUST change it to match your server configuration
  clientSecret: 'Gp8kL4mX9nQ2wR7tY5vZ3bN6hJ1sA0cF',
};
