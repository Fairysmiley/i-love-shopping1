import { apiFetch, API_ENDPOINTS } from './config';

export const register = async (userData: {
  username: string;
  email: string;
  password1: string;
  password2: string;
  gdpr_consent: boolean;
  captcha: string;
}) => {
  return apiFetch(API_ENDPOINTS.AUTH.REGISTER, {
    method: 'POST',
    body: JSON.stringify(userData),
  });
};

export const login = async (credentials: { email: string; password: string }) => {
  return apiFetch(API_ENDPOINTS.AUTH.LOGIN, {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
};

export const refreshToken = async () => {
  // Refresh uses HttpOnly cookie; no body needed
  return apiFetch(API_ENDPOINTS.AUTH.REFRESH, {
    method: 'POST',
  });
};

export const logout = async () => {
  // Logout reads cookie server-side and clears it
  return apiFetch(API_ENDPOINTS.AUTH.REVOKE, {
    method: 'POST',
  });
};

export const getProfile = async (accessToken: string) => {
  return apiFetch(API_ENDPOINTS.AUTH.PROFILE, {
    method: 'GET',
  }, accessToken);
};

export const updateProfile = async (userData: any, accessToken: string) => {
  return apiFetch(API_ENDPOINTS.AUTH.PROFILE, {
    method: 'PUT',
    body: JSON.stringify(userData),
  }, accessToken);
};

export const googleOAuth = async (googleToken: string) => {
  return apiFetch('/users/oauth/google/', {
    method: 'POST',
    body: JSON.stringify({ token: googleToken }),
  });
};

// 2FA endpoints
export const twoFASetup = async (accessToken: string) => {
  return apiFetch('/users/2fa/setup/', {
    method: 'POST',
  }, accessToken);
};

export const twoFAEnable = async (code: string, accessToken: string) => {
  return apiFetch('/users/2fa/enable/', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, accessToken);
};

export const twoFADisable = async (code: string, accessToken: string) => {
  return apiFetch('/users/2fa/disable/', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, accessToken);
};

export const twoFAVerifyLogin = async (username: string, code: string) => {
  return apiFetch('/users/2fa/verify/', {
    method: 'POST',
    body: JSON.stringify({ username, code }),
  });
};

export const requestPasswordReset = async (data: { email: string; captcha: string }) => {
  return apiFetch('/users/password-reset/request/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const confirmPasswordReset = async (data: { token: string; new_password1: string; new_password2: string }) => {
  return apiFetch('/users/password-reset/confirm/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};