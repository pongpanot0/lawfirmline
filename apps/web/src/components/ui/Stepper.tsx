'use client';

interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <li
              key={step.id}
              className={`relative flex flex-1 flex-col items-center ${index < steps.length - 1 ? 'after:absolute after:left-1/2 after:top-4 after:h-0.5 after:w-full after:bg-slate-200' : ''}`}
            >
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                disabled={!onStepClick}
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isComplete
                    ? 'bg-brand-600 text-white'
                    : isCurrent
                      ? 'border-2 border-brand-600 bg-white text-brand-600'
                      : 'border-2 border-slate-200 bg-white text-slate-400'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </button>
              <div className="mt-2 text-center">
                <p className={`text-xs font-medium ${isCurrent ? 'text-brand-700' : 'text-slate-500'}`}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">{step.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
