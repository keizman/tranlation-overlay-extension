/**
 * Auth Module Usage Examples
 *
 * This file demonstrates how to use the authentication system in different contexts.
 */

import { httpClient, authManager, AuthConfig } from '@/src/modules/auth';

// =============================================================================
// Example 1: Making Authenticated API Calls (Content Script / Popup)
// =============================================================================

/**
 * Example: Translate text using authenticated API
 */
export async function translateText(text: string, targetLang: string) {
  try {
    const response = await httpClient.post(
      `${AuthConfig.apiBaseUrl}/translate`,
      {
        text,
        target_lang: targetLang,
        source_lang: 'auto',
      },
    );

    if (!response.ok) {
      throw new Error(`Translation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.translation;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

/**
 * Example: Get user profile with authentication
 */
export async function getUserProfile() {
  try {
    const response = await httpClient.get(
      `${AuthConfig.apiBaseUrl}/user/profile`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Profile fetch error:', error);
    throw error;
  }
}

/**
 * Example: Update user settings
 */
export async function updateUserSettings(settings: Record<string, any>) {
  try {
    const response = await httpClient.put(
      `${AuthConfig.apiBaseUrl}/user/settings`,
      settings,
    );

    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Settings update error:', error);
    throw error;
  }
}

// =============================================================================
// Example 2: Manual Token Management (Advanced)
// =============================================================================

/**
 * Example: Check if user is authenticated
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const token = await authManager.getValidToken();
    return token !== null;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

/**
 * Example: Force token refresh
 */
export async function forceTokenRefresh() {
  try {
    await authManager.refreshToken();
    console.log('Token refreshed successfully');
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

/**
 * Example: Handle login success (called after OAuth flow completes)
 */
export async function handleLoginSuccess(userId: string) {
  try {
    await authManager.onLoginSuccess(userId);
    console.log('User logged in successfully');
  } catch (error) {
    console.error('Login handling error:', error);
    throw error;
  }
}

/**
 * Example: Handle logout
 */
export async function handleLogout() {
  try {
    // Call logout API
    await httpClient.post(`${AuthConfig.apiBaseUrl}/logout`, {});

    // Clear local auth state
    await authManager.onLogout();

    console.log('User logged out successfully');
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// =============================================================================
// Example 3: Using in Chrome Extension Message Handlers
// =============================================================================

/**
 * Example: Content script requesting authenticated data
 */
export async function contentScriptExample() {
  // Content script sends message to background
  const response = await chrome.runtime.sendMessage({
    action: 'TRANSLATE_TEXT',
    data: { text: 'Hello', targetLang: 'es' },
  });

  console.log('Translation result:', response);
}

/**
 * Example: Background script handling authenticated requests
 */
export function setupBackgroundMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TRANSLATE_TEXT') {
      // Use async handler
      (async () => {
        try {
          const result = await translateText(
            message.data.text,
            message.data.targetLang,
          );
          sendResponse({ success: true, data: result });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      // Return true to indicate async response
      return true;
    }
  });
}

// =============================================================================
// Example 4: Error Handling Patterns
// =============================================================================

/**
 * Example: Comprehensive error handling
 */
export async function robustApiCall() {
  try {
    const response = await httpClient.post(
      `${AuthConfig.apiBaseUrl}/some-endpoint`,
      { data: 'example' },
    );

    if (!response.ok) {
      // Handle specific HTTP status codes
      switch (response.status) {
        case 401:
          console.error('Authentication failed - token may be invalid');
          await authManager.onLogout();
          throw new Error('Please login again');

        case 403:
          console.error('Access forbidden - insufficient permissions');
          throw new Error('Access denied');

        case 429:
          console.error('Rate limit exceeded');
          throw new Error('Too many requests, please try again later');

        case 500:
          console.error('Server error');
          throw new Error('Server error, please try again later');

        default:
          throw new Error(`Request failed: ${response.statusText}`);
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('Network error - check internet connection');
      throw new Error('Network error, please check your connection');
    }

    throw error;
  }
}

// =============================================================================
// Example 5: Batch Requests with Authentication
// =============================================================================

/**
 * Example: Execute multiple authenticated requests in parallel
 */
export async function batchTranslate(texts: string[], targetLang: string) {
  try {
    const promises = texts.map((text) =>
      translateText(text, targetLang).catch((error) => ({
        error: true,
        message: error.message,
        originalText: text,
      })),
    );

    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('Batch translation error:', error);
    throw error;
  }
}

// =============================================================================
// Example 6: Custom Request Configuration
// =============================================================================

/**
 * Example: Making a custom authenticated request with specific options
 */
export async function customAuthenticatedRequest() {
  try {
    const response = await httpClient.fetch(
      `${AuthConfig.apiBaseUrl}/custom-endpoint?param=value`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
        },
        body: JSON.stringify({ custom: 'data' }),
      },
    );

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Custom request error:', error);
    throw error;
  }
}
