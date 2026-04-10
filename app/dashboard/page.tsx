'use client';

import { useSimulation, Vessel, PFZZone } from '@/lib/simulation';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import mqtt from 'mqtt';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, onSnapshot, orderBy } from 'firebase/firestore';

interface HwaAlert {
  state: string;
  district: string;
  alertType: string;
  message: string;
  issueDate: string;
}

interface SOSAlert {
  id: string;
  vesselId: string;
  lat: number;
  lon: number;
  timestamp: number;
  time: string;
  status: "ACTIVE" | "ACKNOWLEDGED";
}

interface AISVessel {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  lastUpdate: number;
}

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });

export default function CommandDashboard() {
  const { state, resolveSOS, updateMarketItem, addPFZZone } = useSimulation();
  const { vessels, incoisData, marketData, pfzZones } = state;
  
  const [selectedDashboardMarket, setSelectedDashboardMarket] = useState<string>('Vizhinjam');
  const [L, setL] = useState<object | null>(null);
  
  const [activeTab, setActiveTab] = useState<'status' | 'map' | 'intel'>('map');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    // Force Leaflet to recalculate its size when mobile tabs switch
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
    }
  }, [activeTab]);

  const [liveSOSQueue, setLiveSOSQueue] = useState<SOSAlert[]>([]);
  const [liveDistressQueue, setLiveDistressQueue] = useState<SOSAlert[]>([]);
  const [aisVessels, setAisVessels] = useState<Map<number, AISVessel>>(new Map());
  const [showAIS, setShowAIS] = useState(true);
  const [aisStatus, setAisStatus] = useState<"CONNECTING" | "LIVE" | "ERROR">("CONNECTING");

  const [newFish, setNewFish] = useState({ species: '', malayalam: '', port: '', price: '' });
  const [newPFZ, setNewPFZ] = useState({ lat: '', lng: '', name: '' });

  const markets = Array.from(new Set(marketData.map(m => m.port)));
  const filteredMarket = marketData.filter(m => m.port === selectedDashboardMarket);

  const [hwaAlerts, setHwaAlerts] = useState<HwaAlert[]>([]);

  useEffect(() => {
    fetch('/api/incois/hwa').then(res => res.json()).then(data => {
      if (data.success) setHwaAlerts(data.alerts);
    }).catch(console.error);
  }, []);

  const handleBroadcastWarning = (alert: HwaAlert) => {
    addDoc(collection(db, 'coastal_warnings'), {
      district: alert.district,
      message: alert.message,
      alertType: alert.alertType,
      active: true,
      timestamp: serverTimestamp()
    }).then(() => {
      window.alert('Warning broadcasted to all fishermen via NavIC-LORA overlay!');
    }).catch(console.error);
  };

  useEffect(() => {
    import('leaflet').then(mod => {
      const DefaultIcon = mod.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
      });
      mod.Marker.prototype.options.icon = DefaultIcon;
      setL(mod);
    });
  }, []);

  // --- AISStream.io Proxy Integration ---
  useEffect(() => {
    if (!showAIS) {
      setAisStatus("CONNECTING");
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      setAisStatus("CONNECTING");
      // Connect to our secure backend proxy instead of directly to AISStream
      eventSource = new EventSource("/api/ais");

      eventSource.onopen = () => {
        setAisStatus("LIVE");
        console.log("AIS Proxy Connected");
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.MessageType === "PositionReport" || data.Message?.PositionReport) {
            setAisStatus("LIVE");
            const report = data.Message.PositionReport;
            const metadata = data.MetaData;
            
            setAisVessels(prev => {
              const newMap = new Map(prev);
              newMap.set(metadata.MMSI, {
                mmsi: metadata.MMSI,
                name: metadata.ShipName?.trim() || `AIS_${metadata.MMSI}`,
                lat: metadata.Latitude,
                lon: metadata.Longitude,
                speed: report.Sog,
                course: report.Cog,
                lastUpdate: Date.now()
              });

              // Cleanup old AIS data (silent vessels > 10 mins)
              const timeout = 600000;
              for (let [mmsi, v] of newMap.entries()) {
                 if (Date.now() - v.lastUpdate > timeout) newMap.delete(mmsi);
              }
              
              return newMap;
            });
          }
        } catch (err) {
          console.error("AIS Parse Error:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn("AIS Proxy disconnected, retrying in 5s...", err);
        setAisStatus("ERROR");
        eventSource?.close();
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      clearTimeout(reconnectTimeout);
    };
  }, [showAIS]);

  // --- MQTT & Firestore Sync ---
  useEffect(() => {
    // Listen for ACTIVE SOS alerts in real-time
    const qActive = query(
      collection(db, 'sos_alerts'), 
      where("status", "==", "ACTIVE"),
      orderBy("timestamp", "desc")
    );

    const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
      const activeAlerts: SOSAlert[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        activeAlerts.push({
          id: doc.id,
          vesselId: data.vesselId,
          lat: data.lat,
          lon: data.lon || data.lng, // support both naming conventions
          timestamp: data.timestamp?.toMillis() || Date.now(),
          time: data.timestamp ? new Date(data.timestamp.toMillis()).toLocaleTimeString('en-US', { hour12: false }) : new Date().toLocaleTimeString('en-US', { hour12: false }),
          status: "ACTIVE"
        });
      });
      setLiveSOSQueue(activeAlerts);
    });

    // Listen for ACKNOWLEDGED alerts in real-time
    const qAck = query(
      collection(db, 'sos_alerts'), 
      where("status", "==", "ACKNOWLEDGED"),
      orderBy("timestamp", "desc")
    );

    const unsubscribeAck = onSnapshot(qAck, (snapshot) => {
      const ackAlerts: SOSAlert[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        ackAlerts.push({
          id: doc.id,
          vesselId: data.vesselId,
          lat: data.lat,
          lon: data.lon || data.lng,
          timestamp: data.timestamp?.toMillis() || Date.now(),
          time: data.timestamp ? new Date(data.timestamp.toMillis()).toLocaleTimeString('en-US', { hour12: false }) : new Date().toLocaleTimeString('en-US', { hour12: false }),
          status: "ACKNOWLEDGED"
        });
      });
      setLiveDistressQueue(ackAlerts);
    });

    return () => {
      unsubscribeActive();
      unsubscribeAck();
    };
  }, []);

  useEffect(() => {
    const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");

    client.on("connect", () => {
      console.log("MQTT Connected");
      client.subscribe("kadal/sos");
    });

    client.on("message", (topic, message) => {
      if (topic === "kadal/sos") {
        try {
          const data = JSON.parse(message.toString());
          const lat = data.lat;
          const lon = data.lon;
          console.log("SOS Received:", lat, lon);
          
          const vesselId = data.id || "UNKNOWN_VESSEL";
          
          // Log to Firebase - The onSnapshot listener above will handle UI update
          addDoc(collection(db, 'sos_alerts'), {
            vesselId: vesselId,
            lat: lat,
            lon: lon,
            status: "ACTIVE",
            timestamp: serverTimestamp()
          }).catch(err => console.error("Firebase Log Error:", err));
        } catch (e) {
          console.error("Failed to parse SOS message", e);
        }
      }
    });

    return () => {
      client.end();
    };
  }, []);

  const handleAcknowledgeSOS = (id: string) => {
    // Update in Firebase (Find document by ID or status)
    const alertRef = doc(db, 'sos_alerts', id);
    updateDoc(alertRef, { status: 'ACKNOWLEDGED' })
      .catch(err => console.error("Firebase Update Error:", err));
  };

  const clearDistressQueue = () => {
    if (window.confirm("Clear all acknowledged SOS alerts?")) {
      setLiveDistressQueue([]);
    }
  };

  const sosVessels = vessels.filter((v: Vessel) => v.status === 'SOS');
  const activeSOSQueueCount = liveSOSQueue.length;
  const totalActiveSOSCount = sosVessels.length + activeSOSQueueCount;
  const coastlinePos: [number, number] = [8.38, 76.95];
  const baseStation: [number, number] = [9.931801274934871, 76.26649186682151];

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat)/2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon))/2;
    return (R * 2 * Math.asin(Math.sqrt(a))).toFixed(1);
  };

  const handleUpdateMarket = () => {
    if (newFish.species && newFish.port && newFish.price) {
      updateMarketItem({
        species: newFish.species,
        malayalam: newFish.malayalam || newFish.species,
        port: newFish.port,
        price: parseInt(newFish.price),
        unit: 'kg'
      });
      setNewFish({ species: '', malayalam: '', port: '', price: '' });
    }
  };

  const handleBroadcastPFZ = () => {
    if (newPFZ.lat && newPFZ.lng && newPFZ.name) {
      addPFZZone({
        id: 'pfz' + Date.now(),
        name: newPFZ.name,
        lat: parseFloat(newPFZ.lat),
        lng: parseFloat(newPFZ.lng),
        radius: 2500,
        confidence: 90
      });
      setNewPFZ({ lat: '', lng: '', name: '' });
    }
  };

  return (
    <>
      <style jsx>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: 350px 1fr 400px;
          height: 100vh;
          padding: 15px;
          gap: 15px;
          background: var(--bg-color);
        }
        .dashboard-left {
          display: flex;
          flex-direction: column;
          gap: 15px;
          overflow-y: auto;
        }
        .dashboard-center {
          position: relative;
          min-height: 0;
        }
        .dashboard-right {
          display: flex;
          flex-direction: column;
          gap: 15px;
          overflow-y: auto;
        }
        .map-wrapper {
          height: 100%;
          padding: 0;
          overflow: hidden;
          border: 1px solid var(--accent-blue-glow);
        }
        .weather-overlay {
          position: absolute;
          bottom: 25px;
          left: 25px;
          z-index: 1000;
          display: flex;
          gap: 15px;
        }

        /* Mobile Header & Menu Styles */
        .mobile-header {
          display: none;
          justify-content: space-between;
          align-items: center;
          padding: 10px 15px;
          background: rgba(3, 8, 18, 0.95);
          border-bottom: 1px solid var(--glass-border);
          position: sticky;
          top: 0;
          z-index: 2000;
        }

        .hamburger {
          cursor: pointer;
          font-size: 1.5rem;
          color: var(--accent-blue);
          z-index: 2001;
        }

        .mobile-menu {
          position: fixed;
          top: 0;
          left: 0;
          width: 70%;
          height: 100%;
          background: rgba(3, 8, 18, 0.98);
          z-index: 2005;
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          border-right: 1px solid var(--accent-blue-glow);
        }

        .mobile-menu.open {
          transform: translateX(0);
        }

        .menu-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.7);
          z-index: 2002;
          display: none;
        }

        .menu-overlay.open {
          display: block;
        }

        .menu-item {
          padding: 15px;
          font-size: 1rem;
          font-weight: 800;
          color: white;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
        }

        .menu-item.active {
          color: var(--accent-blue);
          border-bottom-color: var(--accent-blue);
        }

        @media (max-width: 1200px) {
          .dashboard-grid {
            grid-template-columns: 280px 1fr 320px;
            padding: 10px;
            gap: 10px;
          }
        }

        @media (max-width: 900px) {
          .mobile-header {
            display: flex;
          }
          .dashboard-grid {
            grid-template-columns: 1fr;
            height: auto;
            min-height: calc(100vh - 50px);
            padding: 10px;
            gap: 12px;
            display: block;
          }
          .dashboard-left, .dashboard-center, .dashboard-right {
            display: none;
          }
          .dashboard-left.active, .dashboard-center.active, .dashboard-right.active {
            display: block;
          }
          .dashboard-center {
            order: 1;
            min-height: 500px;
            height: 70vh;
          }
          .dashboard-center.active .map-wrapper {
            height: 70vh;
          }
          .weather-overlay {
            bottom: 10px;
            left: 10px;
            gap: 8px;
            flex-wrap: wrap;
          }
        }

        @media (max-width: 480px) {
          .dashboard-grid {
            padding: 8px;
            gap: 10px;
          }
          .dashboard-center {
            min-height: 300px;
            height: 45vh;
          }
          .weather-overlay {
            bottom: 8px;
            left: 8px;
            gap: 6px;
          }
        }
      `}</style>

      <div className="mobile-header">
        <div style={{ color: 'var(--accent-blue)', fontWeight: 800, fontSize: '1rem' }}>🛰️ KADAL COMMAND</div>
        <div className="hamburger" onClick={() => setIsMenuOpen(true)}>☰</div>
      </div>

      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)} />
      
      <div className={`mobile-menu ${isMenuOpen ? 'open' : ''}`}>
        <div style={{ alignSelf: 'flex-end', fontSize: '1.5rem', cursor: 'pointer', color: 'white' }} onClick={() => setIsMenuOpen(false)}>✕</div>
        <div className={`menu-item ${activeTab === 'map' ? 'active' : ''}`} onClick={() => { setActiveTab('map'); setIsMenuOpen(false); }}>🌍 SURVEILLANCE MAP</div>
        <div className={`menu-item ${activeTab === 'status' ? 'active' : ''}`} onClick={() => { setActiveTab('status'); setIsMenuOpen(false); }}>🛰️ FLEET STATUS</div>
        <div className={`menu-item ${activeTab === 'intel' ? 'active' : ''}`} onClick={() => { setActiveTab('intel'); setIsMenuOpen(false); }}>📈 INTEL & BROADCAST</div>
      </div>

      <div className="dashboard-grid" suppressHydrationWarning>
      
        {/* LEFT: FLEET STATUS & TELEMETRY */}
        <aside className={`dashboard-left ${activeTab === 'status' ? 'active' : ''}`}>
          <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(0,210,255,0.05), transparent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
               <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-blue)' }}>🛰️ COMMAND</h2>
               <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>V.1.0-STABLE</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '15px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>{vessels.length}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--accent-blue)', letterSpacing: '0.1em', fontWeight: 800 }}>TOTAL VESSELS</div>
              </div>
              <div style={{ background: totalActiveSOSCount > 0 ? 'rgba(255,77,77,0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '15px', border: `1px solid ${totalActiveSOSCount > 0 ? 'var(--accent-orange)' : 'var(--glass-border)'}` }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: totalActiveSOSCount > 0 ? 'var(--accent-orange)' : 'white' }}>{totalActiveSOSCount}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--accent-orange)', letterSpacing: '0.1em', fontWeight: 800 }}>ACTIVE SOS</div>
              </div>
            </div>

            {/* AIS Toggle */}
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(59, 130, 246, 0.05)', padding: '10px 15px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div>
                   <div style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 800, letterSpacing: '0.05em' }}>LIVE AIS SHIP TRAFFIC</div>
                   <div style={{ fontSize: '0.5rem', color: aisStatus === 'LIVE' ? '#10b981' : aisStatus === 'ERROR' ? '#ef4444' : '#64748b', fontWeight: 800 }}>
                      ● {aisStatus} {aisVessels.size > 0 ? `(${aisVessels.size} SHIPS)` : ''}
                   </div>
                </div>
                <button onClick={() => setShowAIS(!showAIS)} style={{ 
                  padding: '5px 10px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  background: showAIS ? '#3b82f6' : 'rgba(255,255,255,0.1)', 
                  color: showAIS ? 'white' : 'rgba(255,255,255,0.4)',
                  fontSize: '0.6rem',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}>
                  {showAIS ? 'LIVE ON' : 'PAUSED'}
                </button>
            </div>

            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '14px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: 800, fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--accent-orange)' }}>[ Active SOS : {activeSOSQueueCount} ]</span>
                    <span style={{ color: 'white' }}>[ Live SOS Queue ]</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                    {liveSOSQueue.map((sos) => (
                       <div key={sos.id} style={{ padding: '12px', background: 'rgba(255,77,77,0.1)', borderRadius: '10px', borderLeft: '4px solid red' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                               <strong style={{ color: 'white', fontSize: '0.9rem' }}>Vessel: {sos.vesselId}</strong>
                               <span style={{ fontSize: '0.7rem', color: 'red', fontWeight: 800 }}>🔴 ACTIVE</span>
                           </div>
                           <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                               <div>Lat: {sos.lat.toFixed(6)}</div>
                               <div>Lon: {sos.lon.toFixed(6)}</div>
                               <div>Time: {sos.time}</div>
                           </div>
                           <button onClick={() => handleAcknowledgeSOS(sos.id)} style={{ marginTop: '10px', width: '100%', padding: '8px', borderRadius: '6px', background: 'red', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem' }}>ACKNOWLEDGE</button>
                       </div>
                    ))}
                    {liveSOSQueue.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', padding: '10px' }}>QUEUE EMPTY</div>
                    )}
                </div>
            </div>
          </div>

          <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.15em', fontWeight: 800, marginBottom: '5px' }}>TELEMETRY TRACKING</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
               {vessels.map((v: Vessel) => (
                 <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', borderLeft: `4px solid ${v.status === 'SOS' ? 'var(--accent-orange)' : 'var(--accent-green)'}`, transition: '0.3s' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{v.name}</div>
                     <div style={{ color: v.status === 'SOS' ? 'var(--accent-orange)' : 'var(--accent-green)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em' }}>{v.status.toUpperCase()}</div>
                   </div>
                   <div style={{ display: 'flex', gap: '15px', fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                     <span>⚡ {Math.floor(v.battery)}%</span>
                     <span>🌊 {v.speed} kn</span>
                     <span>🧭 {v.heading}°</span>
                   </div>
                   {v.status === 'SOS' && (
                     <div style={{ fontSize: '0.7rem', color: 'var(--accent-orange)', fontWeight: 800, marginTop: '5px', background: 'rgba(255,77,77,0.1)', padding: '5px 8px', borderRadius: '4px', wordBreak: 'break-all' }}>📡 ALERT: {v.lat.toFixed(4)}, {v.lng.toFixed(4)}</div>
                   )}
                 </div>
               ))}
            </div>
          </div>
        </aside>

        {/* CENTER: SURVEILLANCE MAP */}
        <main className={`dashboard-center ${activeTab === 'map' ? 'active' : ''}`}>
          <div className="glass-card map-wrapper">
            {L && (
              <MapContainer center={[8.35, 76.88]} zoom={11} style={{ height: '100%', width: '100%', filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Circle center={coastlinePos} radius={500} color="var(--accent-blue)" fillColor="var(--accent-blue)" fillOpacity={0.4} />
                
                {pfzZones.map((z: PFZZone) => (
                  <Circle key={z.id} center={[z.lat, z.lng]} radius={z.radius} pathOptions={{ color: 'var(--accent-green)', fillColor: 'var(--accent-green)', fillOpacity: 0.2 }} />
                ))}

                {vessels.map((v: Vessel) => (
                  <Marker key={v.id} position={[v.lat, v.lng]}>
                    <Popup>
                      <div style={{ color: 'black', fontFamily: 'var(--font-sans)', padding: '10px' }}>
                         <strong style={{ fontSize: '1.1rem' }}>{v.name}</strong><br/>
                         <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>TELEMETRY: {v.lat.toFixed(4)}, {v.lng.toFixed(4)}</div>
                         <button onClick={() => resolveSOS(v.id)} style={{ width: '100%', marginTop: '12px', background: 'var(--accent-blue)', border: 'none', padding: '8px', borderRadius: '6px', color: 'black', fontWeight: 800, cursor: 'pointer' }}>RESOLVE SOS</button>
                      </div>
                    </Popup>
                    {v.status === 'SOS' && <Circle center={[v.lat, v.lng]} radius={1500} pathOptions={{ color: 'red', fillColor: 'red', className: 'sos-pulse' }} />}
                  </Marker>
                ))}
                {sosVessels.map((v: Vessel) => <Polyline key={`mesh-${v.id}`} positions={[[v.lat, v.lng], coastlinePos]} color="orange" dashArray="8, 12" weight={2} />)}
                
                {/* AIS WORLD TRAFFIC */}
                {Array.from(aisVessels.values()).map((v: AISVessel) => (
                  <Marker 
                    key={`ais-${v.mmsi}`} 
                    position={[v.lat, v.lon]}
                    icon={L ? (L as any).divIcon({
                      className: 'ais-marker',
                      html: `<div style="transform: rotate(${v.course}deg); font-size: 1.2rem; color: #3b82f6; text-shadow: 0 0 5px rgba(0,0,0,0.5)">🚢</div>`,
                      iconSize: [20, 20],
                      iconAnchor: [10, 10]
                    }) : undefined}
                  >
                    <Popup>
                       <div style={{ color: 'black', padding: '10px' }}>
                          <div style={{ fontSize: '0.6rem', color: '#3b82f6', fontWeight: 800 }}>GLOBAL AIS TRAFFIC</div>
                          <strong style={{ fontSize: '1.2rem' }}>{v.name}</strong><br/>
                          <div style={{ fontSize: '0.8rem', marginTop: '5px', opacity: 0.7 }}>MMSI: {v.mmsi}</div>
                          <hr style={{ margin: '8px 0', opacity: 0.1 }}/>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.75rem' }}>
                             <div>SPEED: <strong>{v.speed} kn</strong></div>
                             <div>COURSE: <strong>{v.course}°</strong></div>
                          </div>
                       </div>
                    </Popup>
                  </Marker>
                ))}

                <Marker position={baseStation}>
                  <Popup>
                    <div style={{ color: 'black', fontFamily: 'var(--font-sans)', padding: '5px', fontWeight: 800 }}>
                      Coast Guard Command Center – Kochi
                    </div>
                  </Popup>
                </Marker>
                {[...liveSOSQueue, ...liveDistressQueue].map(sos => (
                  <Marker key={`sos-marker-${sos.vesselId}-${sos.id}`} position={[sos.lat, sos.lon]}>
                    <Popup>
                      <div style={{ color: 'black', fontFamily: 'var(--font-sans)', padding: '10px' }}>
                         <strong>{sos.vesselId}</strong>
                         <br/>
                         Lat: {sos.lat}
                         <br/>
                         Lon: {sos.lon}
                         <br/>
                         Status: {sos.status}
                      </div>
                    </Popup>
                    <Polyline
                      key={`sos-line-${sos.vesselId}-${sos.id}`}
                      positions={[
                        baseStation,
                        [sos.lat, sos.lon]
                      ]}
                      pathOptions={{
                        color: sos.status === "ACTIVE" ? "red" : "yellow",
                        dashArray: "3, 8",
                        weight: 2,
                        opacity: 0.9
                      }}
                    />
                    {sos.status === 'ACTIVE' ? (
                      <Circle center={[sos.lat, sos.lon]} radius={1500} pathOptions={{ color: 'red', fillColor: 'red', className: 'sos-pulse' }} />
                    ) : (
                      <Circle center={[sos.lat, sos.lon]} radius={1500} pathOptions={{ color: 'yellow', fillColor: 'yellow', fillOpacity: 0.2 }} />
                    )}
                  </Marker>
                ))}
              </MapContainer>
            )}
            <div className="weather-overlay">
               <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(5,11,24,0.95)', border: '1px solid var(--accent-blue-glow)' }}>
                  <span style={{ fontSize: '1.5rem' }}>🌫️</span>
                  <div><div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>WAVE</div><div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-blue)' }}>{incoisData.waveHeight}m</div></div>
               </div>
               <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(5,11,24,0.95)', border: '1px solid var(--accent-blue-glow)' }}>
                  <span style={{ fontSize: '1.5rem' }}>🌪️</span>
                  <div><div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>WIND</div><div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-blue)' }}>{incoisData.windSpeed}km/h</div></div>
               </div>
            </div>
          </div>
        </main>

        {/* RIGHT: INTELLIGENCE & MARKET BROADCAST */}
        <aside className={`dashboard-right ${activeTab === 'intel' ? 'active' : ''}`}>
          <div className="glass-card" style={{ background: 'rgba(255,255,0,0.03)', borderColor: 'var(--glass-border)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
               <h3 style={{ fontSize: '0.8rem', margin: 0, color: 'yellow', fontWeight: 800, letterSpacing: '0.1em' }}>🟡 LIVE DISTRESS QUEUE</h3>
               <button onClick={clearDistressQueue} style={{ padding: '6px 12px', background: 'rgba(255,255,0,0.1)', border: '1px solid yellow', color: 'yellow', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 800, cursor: 'pointer' }}>CLEAR LIST</button>
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
                 {liveDistressQueue.map((sos) => (
                    <div key={sos.id} style={{ padding: '15px', background: 'rgba(255,255,0,0.1)', borderRadius: '16px', borderLeft: '4px solid yellow' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', flexWrap: 'wrap', gap: '5px' }}>
                          <strong style={{ fontSize: '1rem', color: '#fff' }}>Vessel: {sos.vesselId}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'yellow', fontWeight: 800 }}>🟡 ACKNOWLEDGED</span>
                       </div>
                       <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                          <div>Lat: {sos.lat.toFixed(6)}</div>
                          <div>Lon: {sos.lon.toFixed(6)}</div>
                          <div>Time: {sos.time}</div>
                       </div>
                    </div>
                 ))}

                 {sosVessels.map((v: Vessel) => (
                   <div key={`alert-${v.id}`} style={{ padding: '15px', background: 'rgba(255,77,77,0.1)', borderRadius: '16px', borderLeft: '4px solid var(--accent-orange)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', flexWrap: 'wrap', gap: '5px' }}>
                         <strong style={{ fontSize: '1rem', color: '#fff' }}>{v.name}</strong>
                         <span style={{ fontSize: '0.7rem', color: 'var(--accent-orange)', fontWeight: 800 }}>D: {getDistance(v.lat, v.lng, coastlinePos[0], coastlinePos[1])}km</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>TELEMETRY: {v.lat.toFixed(4)}, {v.lng.toFixed(4)}</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                         <button style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--accent-orange)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem' }}>DISPATCH</button>
                         <button onClick={() => resolveSOS(v.id)} style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', cursor: 'pointer' }}>❌</button>
                      </div>
                   </div>
                 ))}

                 {liveDistressQueue.length === 0 && sosVessels.length === 0 && (
                     <div style={{ fontSize: '0.8rem', opacity: 0.4, textAlign: 'center', padding: '20px' }}>SAFE SECTOR.</div>
                 )}
             </div>
          </div>

           {/* HIGH WAVE / INCOIS NOTIFICATIONS */}
           <div className="glass-card" style={{ background: 'rgba(255,0,0,0.03)', borderColor: 'rgba(255,0,0,0.3)', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '0.8rem', marginBottom: '15px', color: 'var(--accent-orange)', fontWeight: 800, letterSpacing: '0.1em' }}>⚠️ INCOIS HIGH WAVE ADVISORIES</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '350px', overflowY: 'auto' }}>
                 {hwaAlerts.map((alert, idx) => {
                   const isDanger = alert.district.includes('[DANGER]') || !alert.message.toLowerCase().includes('no immediate action is required');
                   const cardColor = isDanger ? 'var(--accent-orange)' : '#fdd835'; // red/orange for danger, yellow for watch
                   const bgFill = isDanger ? 'rgba(255,77,77,0.15)' : 'rgba(253,216,53,0.05)';

                   return (
                     <div key={idx} style={{ padding: '15px', background: bgFill, borderRadius: '16px', borderLeft: `4px solid ${cardColor}`, position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', flexWrap: 'wrap', gap: '5px' }}>
                           <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{alert.district}</strong>
                           <span style={{ fontSize: '0.7rem', color: cardColor, fontWeight: 800 }}>{alert.issueDate}</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: cardColor, fontWeight: 800, marginBottom: '5px' }}>{alert.alertType}</div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>{alert.message}</div>
                        {isDanger && (
                          <button onClick={() => handleBroadcastWarning(alert)} style={{ marginTop: '10px', width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--accent-orange)', border: 'none', color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem', boxShadow: '0 0 15px rgba(255,100,100,0.4)', animation: 'pulseRed 1.5s infinite' }}>
                            ⚠️ FAST BROADCAST DANGER TO FLEET
                          </button>
                        )}
                        {!isDanger && (
                          <button onClick={() => handleBroadcastWarning(alert)} style={{ marginTop: '10px', width: '100%', padding: '8px', borderRadius: '8px', background: 'transparent', border: `1px solid ${cardColor}`, color: cardColor, fontWeight: 700, cursor: 'pointer', fontSize: '0.65rem' }}>
                            Notify Fleet (Advisory)
                          </button>
                        )}
                     </div>
                   );
                 })}
                 {hwaAlerts.length === 0 && (
                     <div style={{ fontSize: '0.8rem', opacity: 0.4, textAlign: 'center', padding: '20px' }}>No severe weather alerts for Kerala coast.</div>
                 )}
              </div>
           </div>

          <div className="glass-card" style={{ background: 'rgba(0,255,136,0.03)', borderColor: 'rgba(0,255,136,0.3)' }}>
             <h3 style={{ fontSize: '0.8rem', marginBottom: '15px', color: 'var(--accent-green)', fontWeight: 800, letterSpacing: '0.1em' }}>🛰️ PFZ SATELLITE BROADCAST</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input value={newPFZ.lat} onChange={e => setNewPFZ({...newPFZ, lat: e.target.value})} type="number" placeholder="LAT" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '10px', color: 'white', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', width: '100%' }} />
                  <input value={newPFZ.lng} onChange={e => setNewPFZ({...newPFZ, lng: e.target.value})} type="number" placeholder="LNG" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '10px', color: 'white', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', width: '100%' }} />
                </div>
                <input value={newPFZ.name} onChange={e => setNewPFZ({...newPFZ, name: e.target.value})} placeholder="ZONE NAME (E.G. TUNA HUB)" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '10px', color: 'white', fontSize: '0.8rem', fontWeight: 600, width: '100%' }} />
                <button onClick={handleBroadcastPFZ} style={{ width: '100%', background: 'var(--accent-green)', color: 'black', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '0.8rem', boxShadow: '0 0 20px var(--accent-green-glow)' }}>PUBLISH ZONE</button>
             </div>
          </div>

          <div className="glass-card" style={{ flex: 1, overflowY: 'auto' }}>
             <h3 style={{ fontSize: '0.8rem', marginBottom: '20px', color: 'var(--accent-blue)', fontWeight: 800, letterSpacing: '0.1em' }}>📈 PRICE BROADCASTER</h3>
             <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(0,210,255,0.03)', borderRadius: '16px', border: '1px solid var(--accent-blue-glow)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <input value={newFish.species} onChange={e => setNewFish({...newFish, species: e.target.value})} placeholder="SPECIES" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '8px', borderRadius: '8px', fontSize: '0.75rem', color: 'white', width: '100%' }} />
                  <input value={newFish.malayalam} onChange={e => setNewFish({...newFish, malayalam: e.target.value})} placeholder="മലയാളം" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '8px', borderRadius: '8px', fontSize: '0.75rem', color: 'white', width: '100%' }} />
                  <input value={newFish.port} onChange={e => setNewFish({...newFish, port: e.target.value})} placeholder="PORT" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '8px', borderRadius: '8px', fontSize: '0.75rem', color: 'white', width: '100%' }} />
                  <input value={newFish.price} onChange={e => setNewFish({...newFish, price: e.target.value})} type="number" placeholder="₹ PRICE" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', padding: '8px', borderRadius: '8px', fontSize: '0.75rem', color: 'white', width: '100%' }} />
                </div>
                <button onClick={handleUpdateMarket} style={{ width: '100%', background: 'var(--accent-blue)', border: 'none', padding: '12px', borderRadius: '10px', color: 'black', fontWeight: 900, cursor: 'pointer', fontSize: '0.8rem' }}>PUSH TO MESH</button>
             </div>
             
             <select value={selectedDashboardMarket} onChange={(e) => setSelectedDashboardMarket(e.target.value)} style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', color: 'white', border: '1px solid var(--glass-border)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '15px' }}>
                {markets.map(m => <option key={m} value={m} style={{ background: '#030812' }}>{m}</option>)}
             </select>

             <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', opacity: 0.5 }}><th style={{ padding: '10px' }}>SPECIES</th><th style={{ padding: '10px' }}>RATE/KG</th></tr></thead>
                <tbody>
                  {filteredMarket.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px' }}><div style={{ fontWeight: 800, color: 'white' }}>{item.malayalam}</div><div style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', opacity: 0.8 }}>{item.species.toUpperCase()}</div></td>
                      <td style={{ padding: '12px', color: 'var(--accent-green)', fontWeight: 900, fontSize: '1.2rem' }}>₹{item.price}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </aside>
      </div>
    </>
  );
}
