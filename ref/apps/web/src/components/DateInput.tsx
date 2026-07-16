"use client";

import { useState, useEffect } from "react";

interface DateInputProps {
  value: string; // ISO date string (YYYY-MM-DD) or empty
  onChange: (value: string) => void; // Returns ISO date string (YYYY-MM-DD)
  placeholder?: string;
  required?: boolean;
  className?: string;
  label?: string;
}

/**
 * DateInput component that enforces European date format (DD/MM/YYYY)
 * Converts between display format (DD/MM/YYYY) and ISO format (YYYY-MM-DD) for storage
 */
export function DateInput({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  required = false,
  className = "",
  label,
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState("");
  const [error, setError] = useState("");

  // Convert ISO date (YYYY-MM-DD) to European format (DD/MM/YYYY)
  const isoToEuropean = (isoDate: string): string => {
    if (!isoDate) return "";
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) return "";
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return "";
    }
  };

  // Convert European format (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
  const europeanToIso = (europeanDate: string): string | null => {
    if (!europeanDate.trim()) return "";

    // Remove any non-digit characters except /
    const cleaned = europeanDate.replace(/[^\d/]/g, "");

    // Check if format matches DD/MM/YYYY or DDMMYYYY
    const parts = cleaned.split("/");

    if (parts.length === 3) {
      const [day, month, year] = parts;
      if (day.length === 2 && month.length === 2 && year.length === 4) {
        const dayNum = parseInt(day, 10);
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);

        // Validate date
        if (monthNum < 1 || monthNum > 12) {
          setError("Invalid month");
          return null;
        }
        if (dayNum < 1 || dayNum > 31) {
          setError("Invalid day");
          return null;
        }

        const date = new Date(yearNum, monthNum - 1, dayNum);
        if (
          date.getDate() !== dayNum ||
          date.getMonth() !== monthNum - 1 ||
          date.getFullYear() !== yearNum
        ) {
          setError("Invalid date");
          return null;
        }

        const now = new Date();
        const minYear = now.getFullYear() - 120;
        const maxYear = now.getFullYear() - 13;
        
        if (yearNum < minYear || yearNum > maxYear) {
          if (yearNum > maxYear && yearNum <= now.getFullYear()) {
            setError("You must be at least 13 years old to use this platform");
          } else {
            setError(`Year must be between ${minYear} and ${maxYear}`);
          }
          return null;
        }

        setError("");
        return `${yearNum}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }

    // Handle DDMMYYYY format (no slashes)
    if (cleaned.length === 8 && !cleaned.includes("/")) {
      const day = cleaned.substring(0, 2);
      const month = cleaned.substring(2, 4);
      const year = cleaned.substring(4, 8);

      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
        setError("Invalid date");
        return null;
      }

      const date = new Date(yearNum, monthNum - 1, dayNum);
      if (
        date.getDate() !== dayNum ||
        date.getMonth() !== monthNum - 1 ||
        date.getFullYear() !== yearNum
      ) {
        setError("Invalid date");
        return null;
      }

      setError("");
      return `${yearNum}-${month}-${day}`;
    }

    // If incomplete but valid format, don't show error yet
    if (cleaned.length > 0 && cleaned.length < 8) {
      setError("");
      return null; // Don't update value until complete
    }

    setError("Please use DD/MM/YYYY format");
    return null;
  };

  // Format input as user types (add slashes automatically)
  const formatInput = (input: string): string => {
    // Remove all non-digits
    const digits = input.replace(/\D/g, "");

    // Add slashes at appropriate positions
    if (digits.length <= 2) {
      return digits;
    } else if (digits.length <= 4) {
      return `${digits.substring(0, 2)}/${digits.substring(2)}`;
    } else {
      return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4, 8)}`;
    }
  };

  // Initialize display value from ISO value
  useEffect(() => {
    if (value) {
      setDisplayValue(isoToEuropean(value));
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const formatted = formatInput(input);
    setDisplayValue(formatted);

    // Try to convert to ISO format
    const isoDate = europeanToIso(formatted);
    if (isoDate !== null) {
      onChange(isoDate);
    } else if (formatted.length === 0) {
      onChange("");
      setError("");
    }
  };

  const handleBlur = () => {
    if (displayValue && !error) {
      const isoDate = europeanToIso(displayValue);
      if (isoDate) {
        // Re-format display value to ensure consistency
        setDisplayValue(isoToEuropean(isoDate));
      }
    }

    if (required && !displayValue) {
      setError("Date of birth is required");
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        pattern="\d{2}/\d{2}/\d{4}"
        maxLength={10}
        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${error ? "border-red-500" : "border-gray-300 dark:border-gray-600"
          } ${className}`}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Format: DD/MM/YYYY
        </p>
      )}
    </div>
  );
}
