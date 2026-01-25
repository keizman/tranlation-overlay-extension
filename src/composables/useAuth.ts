import { ref, computed } from 'vue';

interface User {
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
}

interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
}

const authState = ref<AuthState>({
  isLoggedIn: false,
  user: null,
});

export function useAuth() {
  const isLoggedIn = computed(() => authState.value.isLoggedIn);
  const user = computed(() => authState.value.user);

  const checkAuthState = async () => {
    try {
      const stored = await chrome.storage.local.get(['authUser']);
      if (stored.authUser) {
        authState.value.isLoggedIn = true;
        authState.value.user = stored.authUser;
      } else {
        authState.value.isLoggedIn = false;
        authState.value.user = null;
      }
    } catch (error) {
      console.error('Failed to check auth state:', error);
      authState.value.isLoggedIn = false;
      authState.value.user = null;
    }
  };

  const register = async (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => {
    try {
      const response = await fetch('http://localhost:8080/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password,
          confirm_password: confirmPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const login = async (usernameOrEmail: string, password: string) => {
    try {
      const formData = new FormData();
      formData.append('user', usernameOrEmail);
      formData.append('passwd', password);

      const response = await fetch('http://localhost:8080/auth/local/login', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const userData: User = {
        username: usernameOrEmail,
        email: usernameOrEmail,
        displayName: usernameOrEmail,
      };

      await chrome.storage.local.set({ authUser: userData });

      authState.value.isLoggedIn = true;
      authState.value.user = userData;

      await chrome.runtime.sendMessage({
        type: 'AUTH_STATE_CHANGED',
        payload: { isLoggedIn: true, user: userData },
      });

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await chrome.storage.local.remove(['authUser']);

      authState.value.isLoggedIn = false;
      authState.value.user = null;

      await chrome.runtime.sendMessage({
        type: 'AUTH_STATE_CHANGED',
        payload: { isLoggedIn: false, user: null },
      });

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  checkAuthState();

  return {
    isLoggedIn,
    user,
    login,
    register,
    logout,
    checkAuthState,
  };
}
