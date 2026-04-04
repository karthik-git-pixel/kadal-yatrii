'use client';

import { SimulationProvider } from '@/lib/simulation';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SimulationProvider>
      {children}
    </SimulationProvider>
  );
}
