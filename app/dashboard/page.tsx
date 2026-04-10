'use client';

import { useSimulation, Vessel } from '@/lib/simulation';
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
  vesselName: string;
  lat: number;
  lon: number;
  timestamp: number;
  time: string;
  source: 'manual' | 'mpu';
  status: "ACTIVE" | "ACKNOWLEDGED";
  alertCount?: number;
}

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });

export default function CommandDashboard() {
  const { state, resolveSOS, updateMarketItem, removeMarketItem } = useSimulation();
  const { vessels, incoisData, marketData } = state;

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

  const [newFish, setNewFish] = useState({ species: '', malayalam: '', port: '', price: '' });
  const [mqttStatus, setMqttStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const [editingFish, setEditingFish] = useState<{ species: string; port: string; price: string } | null>(null);

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

      // Custom radar scanner icon for the Command Center
      const CommandIcon = mod.divIcon({
        className: 'command-center-icon',
        html: `
          <div class="cc-radar-wrapper">
            <div class="cc-ping-ring cc-ping-1"></div>
            <div class="cc-ping-ring cc-ping-2"></div>
            <div class="cc-ping-ring cc-ping-3"></div>
            <div class="cc-sweep"></div>
            <div class="cc-dot"></div>
          </div>
        `,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35]
      });
      (window as any).L_CommandIcon = CommandIcon;
      setL(mod);
    });
  }, []);

  // --- MQTT & Firestore Sync ---
  useEffect(() => {
    // Only show alerts from the last 1 hour (filtered in JS to avoid index requirement)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const sosRef = collection(db, 'sos_alerts');

    // 1. ACTIVE SOS Alerts
    const qActive = query(sosRef, where("status", "in", ["ACTIVE", "SOS"]));

    const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
      const alerts: SOSAlert[] = [];
      const boatAlertCounts: Record<string, number> = {};

      // First pass to count alerts per boat
      snapshot.forEach(doc => {
        const d = doc.data();
        boatAlertCounts[d.vesselId] = (boatAlertCounts[d.vesselId] || 0) + 1;
      });

      snapshot.forEach((doc) => {
        const data = doc.data();
        const timestamp = data.timestamp?.toMillis() || Date.now();
        
        if (timestamp >= oneHourAgo) {
          alerts.push({
            id: doc.id,
            vesselId: data.vesselId,
            vesselName: data.vesselName || data.vesselId,
            lat: data.lat,
            lon: data.lon || data.lng,
            timestamp: timestamp,
            time: data.timestamp ? new Date(data.timestamp.toMillis()).toLocaleTimeString('en-US', { hour12: false }) : new Date().toLocaleTimeString('en-US', { hour12: false }),
            source: data.source || 'manual',
            status: "ACTIVE",
            alertCount: boatAlertCounts[data.vesselId] || 1
          });
        }
      });
      setLiveSOSQueue(alerts.sort((a, b) => b.timestamp - a.timestamp));
    });

    // 2. ACKNOWLEDGED SOS Alerts
    const qAck = query(sosRef, where("status", "==", "ACKNOWLEDGED"));

    const unsubscribeAck = onSnapshot(qAck, (snapshot) => {
      const alerts: SOSAlert[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const timestamp = data.timestamp?.toMillis() || Date.now();

        if (timestamp >= oneHourAgo) {
          alerts.push({
            id: doc.id,
            vesselId: data.vesselId,
            vesselName: data.vesselName || data.vesselId,
            lat: data.lat,
            lon: data.lon || data.lng,
            timestamp: timestamp,
            time: data.timestamp ? new Date(data.timestamp.toMillis()).toLocaleTimeString('en-US', { hour12: false }) : new Date().toLocaleTimeString('en-US', { hour12: false }),
            source: data.source || 'manual',
            status: "ACKNOWLEDGED"
          });
        }
      });
      setLiveDistressQueue(alerts.sort((a, b) => b.timestamp - a.timestamp));
    });

    return () => {
      unsubscribeActive();
      unsubscribeAck();
    };
  }, []);

  useEffect(() => {    // --- MQTT & Firestore Sync ---
    const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");

    client.on("connect", () => {
      console.log("✅ MQTT Connected to broker.hivemq.com");
      setMqttStatus('CONNECTED');
      client.subscribe("kadal/sos", (err) => {
        if (err) console.error("MQTT Subscription Error:", err);
        else console.log("📡 Subscribed to topic: kadal/sos");
      });
    });

    client.on("error", (err) => {
      console.error("❌ MQTT Connection Error:", err);
      setMqttStatus('ERROR');
    });

    client.on("offline", () => {
      setMqttStatus('CONNECTING');
    });

    client.on("message", (topic, message) => {
      const payload = message.toString();
      console.log(`📥 MQTT Message [${topic}]:`, payload);
      
      if (topic === "kadal/sos") {
        try {
          const data = JSON.parse(payload);
          // Flexible coordinate parsing
          const lat = data.lat || data.latitude || data.Lat;
          const lon = data.lon || data.lng || data.longitude || data.Lon;
          
          if (!lat || !lon) {
            console.warn("⚠️ Received MQTT SOS but missing coordinates (lat/lon/latitude/longitude)");
            return;
          }

          console.log("🚨 Valid SOS Received via MQTT:", lat, lon);
          
          const vesselId = data.id || "BOAT_UNKNOWN";
          const vesselName = data.id || "External Hardware";
          const source = (data.source === 'mpu') ? 'mpu' : 'manual';
          
          // Deduplicate: Key id + lat + lon 
          const sosRef = collection(db, 'sos_alerts');
          const q = query(sosRef, 
            where("vesselId", "==", vesselId), 
            where("status", "==", "ACTIVE")
          );
          
          getDocs(q).then(snapshot => {
            const now = Date.now();

            // Always create a new Firestore doc for each SOS press (each is a separate alert)
            addDoc(sosRef, {
              vesselId: vesselId,
              vesselName: vesselName,
              lat: parseFloat(lat),
              lng: parseFloat(lon),
              source: source,
              status: "ACTIVE",
              timestamp: serverTimestamp()
            });
            // Firestore onSnapshot will automatically update the UI queue
          });
          
        } catch (e) {
          console.error("❌ Failed to parse MQTT JSON message:", e);
        }
      }
    });

    return () => {
      client.end();
    };
  }, []);

  const handleAcknowledgeSOS = (id: string) => {
    const alertRef = doc(db, 'sos_alerts', id);
    updateDoc(alertRef, { status: 'ACKNOWLEDGED' })
      .catch(err => console.error("Firebase Update Error:", err));
  };

  const handleResolveSOS = (id: string) => {
    const alertRef = doc(db, 'sos_alerts', id);
    updateDoc(alertRef, { status: 'RESOLVED' })
      .catch(err => console.error("Firebase Update Error:", err));
  };

  const clearDistressQueue = async () => {
    const q = query(collection(db, 'sos_alerts'), where("status", "==", "ACKNOWLEDGED"));
    const snapshot = await getDocs(q);
    snapshot.forEach(async (d) => {
      await updateDoc(doc(db, 'sos_alerts', d.id), { status: 'RESOLVED' });
    });
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
    const a = 0.5 - Math.cos(dLat) / 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon)) / 2;
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
        .dashboard-left, .dashboard-right {
          display: flex;
          flex-direction: column;
          gap: 15px;
          height: calc(100vh - 30px);
          overflow-y: auto;
          scrollbar-width: thin;
          padding-bottom: 20px;
        }
        .dashboard-center {
          position: relative;
          min-height: 0;
          height: calc(100vh - 30px);
        }
        .map-wrapper {
          height: 100%;
          padding: 0;
          overflow: hidden;
          border: 1px solid var(--accent-blue-glow);
          border-radius: 20px;
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

        /* Command Center Radar Scanner */
        .command-center-icon { background: none !important; border: none !important; }
        .cc-radar-wrapper {
          position: relative;
          width: 70px;
          height: 70px;
        }
        .cc-radar-wrapper::before {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 64px; height: 64px;
          background: rgba(0, 8, 20, 0.85);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          border: 2px solid rgba(0,210,255,0.5);
          z-index: 3;
        }
        .cc-dot {
          position: absolute;
          top: 50%; left: 50%;
          width: 14px; height: 14px;
          background: #00d2ff;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 8px #00d2ff, 0 0 20px #00d2ff, 0 0 40px rgba(0,210,255,0.6);
          z-index: 10;
        }
        .cc-sweep {
          position: absolute;
          top: 50%; left: 50%;
          width: 62px; height: 62px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: conic-gradient(from 0deg, transparent 0deg, rgba(0,210,255,0.7) 50deg, transparent 100deg);
          animation: cc-rotate 2.5s linear infinite;
          z-index: 5;
        }
        @keyframes cc-rotate {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .cc-ping-ring {
          position: absolute;
          top: 50%; left: 50%;
          width: 20px; height: 20px;
          border: 2.5px solid rgba(0,210,255,0.9);
          border-radius: 50%;
          transform: translate(-50%, -50%) scale(0.5);
          animation: cc-ping 3s ease-out infinite;
        }
        .cc-ping-1 { animation-delay: 0s; }
        .cc-ping-2 { animation-delay: 1s; }
        .cc-ping-3 { animation-delay: 2s; }
        @keyframes cc-ping {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-color: rgba(0,210,255,1); }
          100% { transform: translate(-50%, -50%) scale(3.5); opacity: 0; border-color: rgba(0,210,255,0); }
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <div style={{ fontSize: '0.6rem', color: mqttStatus === 'CONNECTED' ? 'var(--accent-green)' : mqttStatus === 'ERROR' ? 'red' : 'orange', fontWeight: 800 }}>
                   MQTT: {mqttStatus}
                 </div>
                 <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: mqttStatus === 'CONNECTED' ? 'var(--accent-green)' : 'red', boxShadow: mqttStatus === 'CONNECTED' ? '0 0 10px var(--accent-green)' : 'none' }} />
              </div>
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



            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '14px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', fontWeight: 800, fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--accent-orange)' }}>[ Active SOS : {activeSOSQueueCount} ]</span>
                <button onClick={async () => {
                  if(confirm("Resolve all active SOS alerts?")) {
                    const q = query(collection(db, 'sos_alerts'), where("status", "in", ["ACTIVE", "SOS"]));
                    const snap = await getDocs(q);
                    snap.forEach(d => updateDoc(doc(db, 'sos_alerts', d.id), { status: 'RESOLVED' }));
                  }
                }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.6rem', cursor: 'pointer' }}>CLEAR ALL</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {liveSOSQueue.map((sos) => {
                  const isAuto = sos.source === 'mpu';
                  const themeColor = isAuto ? 'var(--accent-orange)' : 'red';
                  const bg = isAuto ? 'rgba(255,165,0,0.1)' : 'rgba(255,0,0,0.1)';
                  
                  return (
                    <div key={`${sos.id}-${sos.timestamp}`} style={{ padding: '15px', background: bg, borderRadius: '16px', borderLeft: `6px solid ${themeColor}`, border: `1px solid ${themeColor}33` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ color: 'white', fontSize: '1.2rem' }}>🚢 {sos.vesselId}</strong>
                        {sos.alertCount && sos.alertCount > 1 && (
                          <span style={{ background: themeColor, color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 900 }}>
                            {sos.alertCount} ALERTS
                          </span>
                        )}
                        <span style={{ fontSize: '0.65rem', color: themeColor, fontWeight: 900, padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: `1px solid ${themeColor}` }}>
                          {isAuto ? 'AUTO SOS' : 'MANUAL SOS'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', lineHeight: '1.6', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>COORDS:</span> <span style={{ color: 'white' }}>{sos.lat.toFixed(6)}, {sos.lon.toFixed(6)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TIME:</span> <span style={{ color: 'white' }}>{sos.time}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SOURCE:</span> <span style={{ color: themeColor, fontWeight: 800 }}>{sos.source.toUpperCase()}</span></div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleAcknowledgeSOS(sos.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: themeColor, color: 'white', border: 'none', fontWeight: 900, cursor: 'pointer', fontSize: '0.8rem' }}>ACKNOWLEDGE</button>
                        <button onClick={() => handleResolveSOS(sos.id)} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem' }}>RESOLVE</button>
                      </div>
                    </div>
                  );
                })}
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
                    <span>⚡ {Math.floor(v.battery || 0)}%</span>
                    <span>🌊 {v.speed || 0} kn</span>
                    <span>🧭 {v.heading || 0}°</span>
                  </div>
                  {v.status === 'SOS' && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-orange)', fontWeight: 800, marginTop: '5px', background: 'rgba(255,77,77,0.1)', padding: '5px 8px', borderRadius: '4px', wordBreak: 'break-all' }}>📡 ALERT: {v.lat?.toFixed(4)}, {v.lng?.toFixed(4)}</div>
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
              <MapContainer center={baseStation} zoom={13} style={{ height: '100%', width: '100%', filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Circle center={baseStation} radius={2000} color="var(--accent-blue)" fillColor="var(--accent-blue)" fillOpacity={0.2} stroke={false} />



                {vessels.map((v: Vessel) => (
                  <Marker key={v.id} position={[v.lat, v.lng]}>
                    <Popup>
                      <div style={{ color: 'black', fontFamily: 'var(--font-sans)', padding: '10px' }}>
                        <strong style={{ fontSize: '1.1rem' }}>{v.name}</strong><br />
                        <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>TELEMETRY: {v.lat?.toFixed(4)}, {v.lng?.toFixed(4)}</div>
                        <button onClick={() => resolveSOS(v.id)} style={{ width: '100%', marginTop: '12px', background: 'var(--accent-blue)', border: 'none', padding: '8px', borderRadius: '6px', color: 'black', fontWeight: 800, cursor: 'pointer' }}>RESOLVE SOS</button>
                      </div>
                    </Popup>
                    {v.status === 'SOS' && <Circle center={[v.lat, v.lng]} radius={1500} pathOptions={{ color: 'red', fillColor: 'red', className: 'sos-pulse' }} />}
                  </Marker>
                ))}
                {sosVessels.map((v: Vessel) => <Polyline key={`mesh-${v.id}`} positions={[[v.lat, v.lng], coastlinePos]} color="orange" dashArray="8, 12" weight={2} />)}



                <Marker position={baseStation} icon={(window as any).L_CommandIcon}>
                  <Popup>
                    <div style={{ color: 'black', fontFamily: 'var(--font-sans)', padding: '5px', fontWeight: 800 }}>
                      Coast Guard Command Center – Kochi
                    </div>
                  </Popup>
                </Marker>
                <Circle center={baseStation} radius={800} pathOptions={{ color: 'var(--accent-blue)', fillColor: 'var(--accent-blue)', fillOpacity: 0.3, className: 'command-scanner' }} />
                {[...liveSOSQueue, ...liveDistressQueue].map(sos => {
                  if (!sos.lat || !sos.lon) return null;
                  return (
                    <Marker key={`sos-marker-${sos.vesselId}-${sos.id}`} position={[sos.lat, sos.lon]}>
                      <Popup>
                        <div style={{ color: 'black', fontFamily: 'var(--font-sans)', padding: '10px' }}>
                          <strong>{sos.vesselName}</strong>
                          <br />
                          Lat: {sos.lat}
                          <br />
                          Lon: {sos.lon}
                          <br />
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
                  );
                })}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {liveDistressQueue.map((sos) => {
                const isAuto = sos.source === 'mpu';
                const themeColor = 'yellow';
                
                return (
                  <div key={`${sos.vesselId}-${sos.id}-${sos.timestamp}`} style={{ padding: '15px', background: 'rgba(255,255,0,0.05)', borderRadius: '16px', borderLeft: '6px solid yellow', border: '1px solid rgba(255,255,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#fff' }}>🚢 {sos.vesselId}</strong>
                      <span style={{ fontSize: '0.6rem', color: 'yellow', fontWeight: 900, background: 'rgba(255,255,0,0.1)', padding: '3px 6px', borderRadius: '4px' }}>ACKNOWLEDGED</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', lineHeight: '1.6' }}>
                      <div>SOURCE: <span style={{ color: isAuto ? 'var(--accent-orange)' : 'red', fontWeight: 800 }}>{sos.source.toUpperCase()}</span></div>
                      <div>COORDS: {sos.lat.toFixed(6)}, {sos.lon.toFixed(6)}</div>
                      <div style={{ marginTop: '4px', opacity: 0.5 }}>ACK TIME: {sos.time}</div>
                    </div>
                  </div>
                );
              })}

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
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



          <div className="glass-card" style={{ background: 'rgba(0,210,255,0.03)', borderColor: 'var(--accent-blue-glow)', display: 'block', padding: '25px' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '25px', color: 'var(--accent-blue)', fontWeight: 800, letterSpacing: '0.15em' }}>📈 PRICE BROADCASTER</h3>
            <div style={{ marginBottom: '25px', padding: '20px', background: 'rgba(0,210,255,0.05)', borderRadius: '20px', border: '1px solid var(--accent-blue-glow)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <input value={newFish.species} onChange={e => setNewFish({ ...newFish, species: e.target.value })} placeholder="SPECIES" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '12px', fontSize: '0.9rem', color: 'white', width: '100%', outline: 'none' }} />
                <input value={newFish.malayalam} onChange={e => setNewFish({ ...newFish, malayalam: e.target.value })} placeholder="മലയാളം" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '12px', fontSize: '1rem', color: 'white', width: '100%', outline: 'none' }} />
                <input value={newFish.port} onChange={e => setNewFish({ ...newFish, port: e.target.value })} placeholder="PORT" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '12px', fontSize: '0.9rem', color: 'white', width: '100%', outline: 'none' }} />
                <input value={newFish.price} onChange={e => setNewFish({ ...newFish, price: e.target.value })} type="number" placeholder="₹ PRICE" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '12px', fontSize: '1.1rem', color: 'var(--accent-green)', fontWeight: 800, width: '100%', outline: 'none' }} />
              </div>
              <button onClick={handleUpdateMarket} style={{ width: '100%', background: 'var(--accent-blue)', border: 'none', padding: '18px', borderRadius: '14px', color: 'black', fontWeight: 900, cursor: 'pointer', fontSize: '1rem', transition: '0.3s', boxShadow: '0 4px 15px var(--accent-blue-glow)' }}>PUSH TO NETWORK MESH</button>
            </div>

            <select value={selectedDashboardMarket} onChange={(e) => setSelectedDashboardMarket(e.target.value)} style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', color: 'white', border: '1px solid var(--glass-border)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '15px' }}>
              {markets.map(m => <option key={m} value={m} style={{ background: '#030812' }}>{m}</option>)}
            </select>

            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', opacity: 0.5 }}><th style={{ padding: '10px' }}>SPECIES</th><th style={{ padding: '10px' }}>RATE/KG</th><th style={{ padding: '10px', textAlign: 'right' }}>ACTIONS</th></tr></thead>
              <tbody>
                {filteredMarket.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 800, color: 'white' }}>{item.malayalam}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', opacity: 0.8 }}>{item.species.toUpperCase()}</div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {editingFish && editingFish.species === item.species && editingFish.port === item.port ? (
                        <input
                          value={editingFish.price}
                          onChange={e => setEditingFish({ ...editingFish, price: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              updateMarketItem({ ...item, price: parseInt(editingFish.price) || item.price });
                              setEditingFish(null);
                            }
                          }}
                          autoFocus
                          style={{ width: '70px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--accent-blue)', padding: '6px 8px', borderRadius: '6px', color: 'var(--accent-green)', fontWeight: 900, fontSize: '1rem', outline: 'none' }}
                        />
                      ) : (
                        <span style={{ color: 'var(--accent-green)', fontWeight: 900, fontSize: '1.2rem' }}>₹{item.price}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {editingFish && editingFish.species === item.species && editingFish.port === item.port ? (
                          <button
                            onClick={() => { updateMarketItem({ ...item, price: parseInt(editingFish.price) || item.price }); setEditingFish(null); }}
                            style={{ padding: '5px 10px', borderRadius: '6px', background: 'var(--accent-green)', border: 'none', color: 'black', fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}
                          >SAVE</button>
                        ) : (
                          <button
                            onClick={() => setEditingFish({ species: item.species, port: item.port, price: String(item.price) })}
                            style={{ padding: '5px 10px', borderRadius: '6px', background: 'rgba(0,210,255,0.15)', border: '1px solid rgba(0,210,255,0.3)', color: 'var(--accent-blue)', fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}
                          >EDIT</button>
                        )}
                        <button
                          onClick={() => { if (confirm(`Remove ${item.species} from ${item.port}?`)) removeMarketItem(item.species, item.port); }}
                          style={{ padding: '5px 10px', borderRadius: '6px', background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff5555', fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}
                        >DEL</button>
                      </div>
                    </td>
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
