"use client";

// Screen: binds one ViewModel to the UI. Renders state, forwards events.

import { useCounterViewModel } from "@/viewmodels/useCounterViewModel";
import { Button } from "@/views/components/Button";

export function CounterScreen() {
  const vm = useCounterViewModel();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-sm uppercase tracking-widest opacity-60">
        MVVM example
      </h1>
      <p
        className={`text-7xl font-semibold tabular-nums ${vm.isNegative ? "text-red-500" : ""} ${vm.loading ? "opacity-30" : ""}`}
      >
        {vm.value}
      </p>
      <div className="flex gap-3">
        <Button onClick={vm.decrement}>−{vm.step}</Button>
        <Button onClick={vm.increment}>+{vm.step}</Button>
      </div>
      <label className="flex items-center gap-3 text-sm">
        Step
        <input
          type="range"
          min={1}
          max={vm.maxStep}
          value={vm.step}
          onChange={(e) => vm.setStep(Number(e.target.value))}
        />
      </label>
    </main>
  );
}
