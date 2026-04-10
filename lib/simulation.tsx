import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';
import initialMarketData from '@/data/market.json';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

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
  meshHops?: string[]; 
}

export interface IncoisData {
  waveHeight: number;
  swell: number;
  windSpeed: number;
  safetyScore: number; 
}

export interface MarketItem {
  species: string;
  malayalam: string;
  port: string;
  price: number;
  unit: string;
}

interface SimulationState {
  vessels: Vessel[];
  incoisData: IncoisData;
  marketData: MarketItem[];
  userVesselId: string;
}

const INITIAL_VESSELS: Vessel[] = [
  { id: 'v1', name: 'boat_1', status: 'Active', lat: 8.384, lng: 76.920, speed: 12, heading: 180, battery: 92, lastUpdate: Date.now() },
  { id: 'v2', name: 'boat_2', status: 'Active', lat: 8.350, lng: 76.880, speed: 8, heading: 175, battery: 88, lastUpdate: Date.now() },
  { id: 'v3', name: 'boat_3', status: 'Active', lat: 8.300, lng: 76.850, speed: 10, heading: 190, battery: 95, lastUpdate: Date.now() },
  { id: 'v4', name: 'boat_4', status: 'Active', lat: 8.280, lng: 76.820, speed: 14, heading: 200, battery: 78, lastUpdate: Date.now() },
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
  fetchLocationSafety: (lat: number, lng: number) => Promise<IncoisData>;
  updateMarketItem: (item: MarketItem) => void;
  removeMarketItem: (species: string, port: string) => void;
  setUserVesselId: (id: string) => void;
} | undefined>(undefined);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [vessels, setVessels] = useState<Vessel[]>(INITIAL_VESSELS);
  const [incoisData] = useState<IncoisData>(MOCK_INCOIS);
  const [marketData, setMarketData] = useState<MarketItem[]>(initialMarketData);
  const [userVesselId, setUserVesselId] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      const savedV = localStorage.getItem('ky_vessels');
      if (savedV) setVessels(JSON.parse(savedV));
      const savedM = localStorage.getItem('ky_market');
      if (savedM) setMarketData(JSON.parse(savedM));
      const savedId = localStorage.getItem('ky_userVesselId');
      if (savedId) setUserVesselId(savedId);
    }, 0);

    const handleS = (e: StorageEvent) => {
      if (e.key === 'ky_vessels' && e.newValue) setVessels(JSON.parse(e.newValue));
      if (e.key === 'ky_market' && e.newValue) setMarketData(JSON.parse(e.newValue));
      if (e.key === 'ky_userVesselId' && e.newValue) setUserVesselId(e.newValue);
    };
    window.addEventListener('storage', handleS);
    return () => window.removeEventListener('storage', handleS);
  }, []);

  useEffect(() => {
    localStorage.setItem('ky_vessels', JSON.stringify(vessels));
    localStorage.setItem('ky_market', JSON.stringify(marketData));
    if (userVesselId) localStorage.setItem('ky_userVesselId', userVesselId);
  }, [vessels, marketData, userVesselId]);

  const triggerSOS = useCallback((id: string) => {
    const v = vessels.find(v => v.id === id);
    if (v && v.status !== 'SOS') {
      addDoc(collection(db, 'sos_alerts'), {
        vesselId: v.id,
        vesselName: v.name,
        lat: v.lat,
        lng: v.lng,
        status: 'ACTIVE',
        timestamp: serverTimestamp()
      }).catch(err => console.error("Firebase Log Error:", err));
    }
    setVessels(prev => prev.map(v => v.id === id ? { ...v, status: 'SOS', meshHops: ['Coast-Station', v.id] } : v));
  }, [vessels]);

  const resolveSOS = useCallback((id: string) => {
    setVessels(prev => prev.map(v => v.id === id ? { ...v, status: 'Active', meshHops: [] } : v));
    
    // Update in Firebase
    const alertsRef = collection(db, 'sos_alerts');
    const q = query(alertsRef, where("vesselId", "==", id), where("status", "in", ["SOS", "ACTIVE"]));
    getDocs(q).then(snapshot => {
      snapshot.forEach(d => {
        updateDoc(doc(db, 'sos_alerts', d.id), { status: 'RESOLVED', resolvedAt: serverTimestamp() });
      });
    });
  }, []);

  const updateMarketItem = useCallback((newItem: MarketItem) => {
    setMarketData(prev => {
      const idx = prev.findIndex(m => m.species === newItem.species && m.port === newItem.port);
      if (idx > -1) {
        const up = [...prev];
        up[idx] = newItem;
        return up;
      }
      return [newItem, ...prev];
    });
  }, []);

  const removeMarketItem = useCallback((species: string, port: string) => {
    setMarketData(prev => prev.filter(m => !(m.species === species && m.port === port)));
  }, []);



  const fetchLocationSafety = useCallback(async (lat: number, lng: number): Promise<IncoisData> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const d = Math.sqrt(Math.pow(lat - 8.0, 2) + Math.pow(lng - 76.0, 2));
        const w = +(Math.min(3.5, 1.2 / d)).toFixed(1);
        resolve({ waveHeight: w, windSpeed: +(w * 12).toFixed(1), swell: +(w * 0.7).toFixed(1), safetyScore: w > 1.8 ? 30 : 90 });
      }, 1000);
    });
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      setVessels(prev => prev.map(v => ({ ...v, lat: v.lat + (Math.random() - 0.5) * 0.0004, lng: v.lng + (Math.random() - 0.5) * 0.0004 })));
    }, 10000);
    return () => clearInterval(i);
  }, []);

  return (
    <SimulationContext.Provider value={{ state: { vessels, incoisData, marketData, userVesselId }, triggerSOS, resolveSOS, fetchLocationSafety, updateMarketItem, removeMarketItem, setUserVesselId }}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) throw new Error('useSimulation must be used within SimulationProvider');
  return context;
}
