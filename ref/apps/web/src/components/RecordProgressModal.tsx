"use client";

import { Fragment } from "react";
import { RecordProgressForm } from "./RecordProgressForm";
import { Button } from "./Button";

interface RecordProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWeight?: number | string;
  onSuccess?: () => void;
  mode?: "progress" | "workout";
}

export function RecordProgressModal({
  isOpen,
  onClose,
  currentWeight,
  onSuccess,
  mode = "progress",
}: RecordProgressModalProps) {
  if (!isOpen) return null;

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {mode === "workout" ? "Record Workout" : "Record Progress"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {mode === "workout"
                ? "Log your exercise session details (endurance, strength) to track your active performance."
                : "Track your health metrics (weight, body fat) over time to see progress and get personalized insights."}
            </p>
            <RecordProgressForm
              currentWeight={currentWeight}
              onSuccess={handleSuccess}
              mode={mode}
            />
          </div>
        </div>
      </div>
    </>
  );
}
