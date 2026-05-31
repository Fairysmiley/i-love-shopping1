// Utility functions for safe data conversion and validation

/**
 * Safely parse an integer, returning undefined if invalid
 */
export const safeParseInt = (value: string | number | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  
  const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
  return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Safely parse a float, returning undefined if invalid
 */
export const safeParseFloat = (value: string | number | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return !isNaN(parsed) && parsed >= 0 ? parsed : undefined;
};

/**
 * Validate and sanitize search query
 */
export const sanitizeSearchQuery = (query: string | null | undefined): string | undefined => {
  if (!query || typeof query !== 'string') {
    return undefined;
  }
  
  const trimmed = query.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Validate sort parameters
 */
export const validateSortBy = (sortBy: string | null | undefined): string => {
  const validSortOptions = ['created_at', 'name', 'price', 'stock', 'relevance'];
  return sortBy && validSortOptions.includes(sortBy) ? sortBy : 'created_at';
};

export const validateSortOrder = (sortOrder: string | null | undefined): string => {
  return sortOrder === 'asc' ? 'asc' : 'desc';
};

/**
 * Email validation
 */
export const validateEmail = (email: string): string | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) return 'Email is required';
  if (!emailRegex.test(email)) return 'Invalid email format';
  return null;
};

/**
 * Password validation
 */
export const validatePassword = (password: string): string | null => {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
};

/**
 * Username validation
 */
export const validateUsername = (username: string): string | null => {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return 'Username can only contain letters, numbers, and underscores';
  }
  return null;
};