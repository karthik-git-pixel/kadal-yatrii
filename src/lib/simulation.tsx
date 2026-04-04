import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';

export type VesselStatus = 'Active' | 'Warning' | 'SOS';

export interface Vessel {
  id: string;
  name: string;
  status: VesselStatus;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  battery: number;
  lastUpdate: number;
  meshHops?: string[]; // IDs of vessels that passed the SOS (for simulation)
}

export interface IncoisData {
  waveHeight: number;
  swell: number;
  windSpeed: number;
  safetyScore: number; // 0-100
}

interface SimulationState {
  vessels: Vessel[];
  incoisData: IncoisData;
  userVesselId: string;
}

const INITIAL_VESSELS: Vessel[] = [
  { id: 'v1', name: 'Karunya 1', status: 'Active', lat: 8.384, lng: 76.920, speed: 12, heading: 180, battery: 92, lastUpdate: Date.now() },
  { id: 'v2', name: 'Mudra 7', status: 'Active', lat: 8.350, lng: 76.880, speed: 8, heading: 175, battery: 88, lastUpdate: Date.now() },
  { id: 'v3', name: 'Deep Sea X', status: 'Active', lat: 8.300, lng: 76.850, speed: 10, heading: 190, battery: 95, lastUpdate: Date.now() },
  { id: 'v4', name: 'Fisher Queen', status: 'Active', lat: 8.280, lng: 76.820, speed: 14, heading: 200, battery: 78, lastUpdate: Date.now() },
  { id: 'v5', name: 'Navigator', status: 'Active', lat: 8.420, lng: 76.950, speed: 15, heading: 160, battery: 85, lastUpdate: Date.now() },
];

const MOCK_INCOIS: IncoisData = {
  waveHeight: 1.2,
  swell: 0.8,
  windSpeed: 15,
  safetyScore: 85,
};

const SimulationContext = createContext<{
  state: SimulationState;
  triggerSOS: (id: string) => void;
  resolveSOS: (id: string) => void;
} | undefined>(undefined);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [vessels, setVessels] = useState<Vessel[]>(INITIAL_VESSELS);
  const [incoisData, setIncoisData] = useState<IncoisData>(MOCK_INCOIS);
  const userVesselId = 'v1';

  const triggerSOS = useCallback((id: string) => {
    setVessels(prev => prev.map(v => {
      if (v.id === id) {
        // Mock Mesh Hops for the Command Dashboard to see
        const hops = ['Mesh-Node-A', v.id]; 
        return { ...v, status: 'SOS' as VesselStatus, meshHops: hops };
      }
      return v;
    }));
  }, []);

  const resolveSOS = useCallback((id: string) => {
    setVessels(prev => prev.map(v => v.id === id ? { ...v, status: 'Active' as VesselStatus, meshHops: [] } : v));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setVessels(prev => prev.map(v => {
        // Random drift to simulate movement
        const latChange = (Math.random() - 0.5) * 0.001;
        const lngChange = (Math.random() - 0.5) * 0.001;
        return {
          ...v,
          lat: v.lat + latChange,
          lng: v.lng + lngChange,
          lastUpdate: Date.now(),
          battery: Math.max(0, v.battery - 0.01), // Minimal battery drain
        };
      }));
      
      // Minimal INCOIS fluctuation
      setIncoisData(prev => ({
        ...prev,
        waveHeight: +(prev.waveHeight + (Math.random() - 0.5) * 0.1).toFixed(1),
        windSpeed: +(prev.windSpeed + (Math.random() - 0.5) * 0.5).toFixed(1),
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <SimulationContext.Provider value={{ state: { vessels, incoisData, userVesselId }, triggerSOS, resolveSOS }}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) throw new Error('useSimulation must be used within SimulationProvider');
  return context;
}
