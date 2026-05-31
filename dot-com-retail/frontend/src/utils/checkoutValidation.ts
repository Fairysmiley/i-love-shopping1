import type { Address } from '../api/orders';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Email validation
export const validateEmail = (email: string): string | null => {
  if (!email) {
    return 'Email address is required';
  }
  if (email.length < 5) {
    return 'Email address is too short';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address (e.g., name@example.com)';
  }
  return null;
};

// Address validation
export const validateAddress = (address: Address, fieldPrefix: string = ''): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Street address
  if (!address.address || address.address.trim().length === 0) {
    errors.push({
      field: `${fieldPrefix}address`,
      message: 'Street address is required'
    });
  } else if (address.address.trim().length < 5) {
    errors.push({
      field: `${fieldPrefix}address`,
      message: 'Please enter a complete street address'
    });
  }

  // City
  if (!address.city || address.city.trim().length === 0) {
    errors.push({
      field: `${fieldPrefix}city`,
      message: 'City is required'
    });
  } else if (address.city.trim().length < 2) {
    errors.push({
      field: `${fieldPrefix}city`,
      message: 'Please enter a valid city name'
    });
  }

  // Country
  if (!address.country) {
    errors.push({
      field: `${fieldPrefix}country`,
      message: 'Country is required'
    });
  } else if (!['FI', 'SE'].includes(address.country)) {
    errors.push({
      field: `${fieldPrefix}country`,
      message: 'Please select Finland or Sweden'
    });
  }

  // Postal code validation based on country
  if (!address.postal_code || address.postal_code.trim().length === 0) {
    errors.push({
      field: `${fieldPrefix}postal_code`,
      message: 'Postal code is required'
    });
  } else {
    const postalCode = address.postal_code.trim();
    
    if (address.country === 'FI') {
      // Finland: 5 digits
      const finlandRegex = /^\d{5}$/;
      if (!finlandRegex.test(postalCode)) {
        errors.push({
          field: `${fieldPrefix}postal_code`,
          message: 'Finnish postal code must be 5 digits (e.g., 00100)'
        });
      }
    } else if (address.country === 'SE') {
      // Sweden: 3 digits + optional space + 2 digits
      const swedenRegex = /^\d{3}\s?\d{2}$/;
      if (!swedenRegex.test(postalCode)) {
        errors.push({
          field: `${fieldPrefix}postal_code`,
          message: 'Swedish postal code must be in format 123 45 or 12345'
        });
      }
    }
  }

  return errors;
};

// Full checkout validation
export const validateCheckout = (
  guestEmail: string,
  isAuthenticated: boolean,
  shippingAddress: Address,
  billingAddress: Address,
  sameAsShipping: boolean,
  selectedShipping: string
): ValidationResult => {
  const errors: ValidationError[] = [];

  // Validate guest email if not authenticated
  if (!isAuthenticated) {
    const emailError = validateEmail(guestEmail);
    if (emailError) {
      errors.push({
        field: 'email',
        message: emailError
      });
    }
  }

  // Validate shipping address
  const shippingErrors = validateAddress(shippingAddress, 'shipping_');
  errors.push(...shippingErrors);

  // Validate billing address if different from shipping
  if (!sameAsShipping) {
    const billingErrors = validateAddress(billingAddress, 'billing_');
    errors.push(...billingErrors);
  }

  // Validate shipping method selected
  if (!selectedShipping) {
    errors.push({
      field: 'shipping_method',
      message: 'Please select a shipping method'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Get user-friendly error message from API response
export const parseApiError = (error: any): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  // Handle Error objects from our api client
  if (error instanceof Error) {
    return error.message;
  }
  
  // Fallback
  return 'An unexpected error occurred. Please try again.';
};

// Parse API errors and return both general message and field-specific errors
export const parseApiErrorDetailed = (error: any): { 
  message: string; 
  fieldErrors: Record<string, string> 
} => {
  const result = {
    message: '',
    fieldErrors: {} as Record<string, string>
  };
  
  if (typeof error === 'string') {
    result.message = error;
    return result;
  }
  
  // Handle Error objects from our api client
  if (error instanceof Error) {
    result.message = error.message;
    return result;
  }
  
  // Fallback
  result.message = 'An unexpected error occurred. Please try again.';
  return result;
};
