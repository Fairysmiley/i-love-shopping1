"use client";

interface BMIDisplayProps {
  bmi: number;
  classification: string;
  heightCm?: number;
  weightKg?: number;
  className?: string;
}

export function BMIDisplay({
  bmi,
  classification,
  heightCm,
  weightKg,
  className = "",
}: BMIDisplayProps) {
  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case "underweight":
        return "text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
      case "normal_weight":
        return "text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
      case "overweight":
        return "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
      case "obese":
        return "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
      default:
        return "text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800";
    }
  };

  const getClassificationLabel = (classification: string) => {
    switch (classification) {
      case "underweight":
        return "Underweight";
      case "normal_weight":
        return "Normal Weight";
      case "overweight":
        return "Overweight";
      case "obese":
        return "Obese";
      default:
        return classification;
    }
  };

  // BMI range visualization
  const bmiRanges = [
    { label: "Under", min: 0, max: 18.5, color: "bg-blue-400" },
    { label: "Normal", min: 18.5, max: 25, color: "bg-green-400" },
    { label: "Over", min: 25, max: 30, color: "bg-yellow-400" },
    { label: "Obese", min: 30, max: 40, color: "bg-red-400" },
  ];

  const currentPosition = Math.min(Math.max((bmi / 40) * 100, 0), 100);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 flex flex-col ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Body Mass Index (BMI)
      </h3>

      {/* BMI Value */}
      <div className="text-center mb-6">
        <div className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
          {bmi.toFixed(1)}
        </div>
        <div
          className={`inline-block px-4 py-2 rounded-full border text-sm font-medium ${getClassificationColor(classification)}`}
        >
          {getClassificationLabel(classification)}
        </div>
      </div>

      {/* BMI Range Visualization */}
      <div className="mb-4">
        <div className="flex h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
          {bmiRanges.map((range, index) => {
            const width = ((range.max - range.min) / 40) * 100;
            const left = (range.min / 40) * 100;
            return (
              <div
                key={index}
                className={`absolute h-full ${range.color}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                }}
              />
            );
          })}
          {/* Current position indicator */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-gray-900 dark:bg-white z-10"
            style={{ left: `${currentPosition}%` }}
          />
        </div>
        <div className="relative text-xs text-gray-500 dark:text-gray-400 mt-2" style={{ height: '1rem' }}>
          <span className="absolute left-0">0</span>
          <span className="absolute" style={{ left: `${(18.5 / 40) * 100}%`, transform: 'translateX(-50%)' }}>18.5</span>
          <span className="absolute" style={{ left: `${(25 / 40) * 100}%`, transform: 'translateX(-50%)' }}>25</span>
          <span className="absolute" style={{ left: `${(30 / 40) * 100}%`, transform: 'translateX(-50%)' }}>30</span>
          <span className="absolute right-0">40+</span>
        </div>
      </div>

      {/* Additional Info */}
      {(heightCm || weightKg) && (
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          {heightCm && <div>Height: {heightCm} cm</div>}
          {weightKg && <div>Weight: {weightKg} kg</div>}
        </div>
      )}

      {/* Healthy Range Reference */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        {heightCm ? (() => {
          // Calculate target weight range for healthy BMI (18.5 - 24.9)
          const minWeight = 18.5 * Math.pow(heightCm / 100, 2);
          const maxWeight = 24.9 * Math.pow(heightCm / 100, 2);
          return (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-green-600 dark:text-green-400 font-medium">
                Target: 18.5 - 24.9. For {heightCm}cm, aim for {minWeight.toFixed(1)} - {maxWeight.toFixed(1)}kg
              </span>
            </p>
          );
        })() : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="text-green-600 dark:text-green-400 font-medium">Healthy BMI range: 18.5 - 25</span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">(shown in green above)</span>
          </p>
        )}
      </div>
    </div>
  );
}

