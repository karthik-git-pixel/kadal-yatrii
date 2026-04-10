'use client';

import { useSimulation, IncoisData } from '@/lib/simulation';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

interface HwaAlert {
  state: string;
  district: string;
  alertType: string;
  message: string;
  issueDate: string;
}

export default function FishermanPage() {
  const { state, triggerSOS, resolveSOS, fetchLocationSafety, setUserVesselId } = useSimulation();
  const { vessels, incoisData, userVesselId, marketData } = state;
  const vessel = vessels.find(v => v.id === userVesselId);
  
  const [activeTab, setActiveTab] = useState<'market' | 'safety' | 'intel'>('safety');
  const [selectedMarket, setSelectedMarket] = useState<string>('Vizhinjam');
  
  const [queryLat, setQueryLat] = useState(vessel?.lat.toFixed(4) || '8.3452');
  const [queryLng, setQueryLng] = useState(vessel?.lng.toFixed(4) || '76.8921');
  const [liveSafety, setLiveSafety] = useState<IncoisData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeWarnings, setActiveWarnings] = useState<any[]>([]);
  const [dismissedWarningIds, setDismissedWarningIds] = useState<string[]>([]);
  const [hwaAlerts, setHwaAlerts] = useState<HwaAlert[]>([]);

  useEffect(() => {
    fetch('/api/incois/hwa').then(res => res.json()).then(data => {
      if (data.success) setHwaAlerts(data.alerts);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'coastal_warnings'),
      where('active', '==', true),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const warnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveWarnings(warnings);
    });

    return () => unsubscribe();
  }, []);

  if (!vessel) {
    return (
      <main style={{ padding: '30px 20px', maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '25px', height: '100vh', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 800, letterSpacing: '0.2em' }}>IDENTITY SETUP</div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, marginTop: '5px', background: 'linear-gradient(to right, #00d2ff, #fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>KadalYatri</h1>
          <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>നിങ്ങളുടെ വള്ളം തിരഞ്ഞെടുക്കുക<br/>(Select Your Boat)</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {vessels.map(v => (
            <button 
              key={v.id} 
              onClick={() => setUserVesselId(v.id)}
              style={{ padding: '25px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '24px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: '0.3s', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
            >
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, display: 'block' }}>🚢 {v.name}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.4, letterSpacing: '0.1em' }}>VESSEL ID: {v.id.toUpperCase()}</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 800 }}>CONNECT ➡️</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const visibleWarnings = activeWarnings.filter(w => !dismissedWarningIds.includes(w.id));

  const markets = Array.from(new Set(marketData.map(m => m.port)));
  const filteredMarket = marketData.filter(m => m.port === selectedMarket);

  const getSafetyClass = (wave: number) => {
    if (wave > 2.0) return { status: 'അപകടകരം (Hazardous)', color: 'var(--accent-orange)', note: 'കടൽക്ഷോഭം - മത്സ്യബന്ധനത്തിന് ഇറങ്ങരുത്', icon: '⚡' };
    if (wave > 1.4) return { status: 'ജാഗ്രത (Caution)', color: '#fdd835', note: 'തിരമാലകൾ ശക്തമാണ് - ജാഗ്രത പാലിക്കുക', icon: '⚠️' };
    return { status: 'സുരക്ഷിതം (Safe)', color: 'var(--accent-green)', note: 'മത്സ്യബന്ധനത്തിന് അനുയോജ്യമായ സാഹചര്യം', icon: '✅' };
  };

  const handleCheckSafety = async () => {
    setIsLoading(true);
    const data = await fetchLocationSafety(parseFloat(queryLat), parseFloat(queryLng));
    setLiveSafety(data);
    setIsLoading(false);
  };

  const currentSafety = liveSafety || incoisData;
  const safetyInfo = getSafetyClass(currentSafety.waveHeight);

  const handleSOS = () => {
    if (vessel.status === 'SOS') {
      resolveSOS(vessel.id);
      alert("SOS Deactivated.");
    } else {
      triggerSOS(vessel.id);
      alert("SOS Sent! Distress signal logged to Command Center.");
    }
  };

  return (
    <main style={{ padding: '15px', maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', height: '100vh', overflowY: 'auto', paddingBottom: '120px', position: 'relative' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 5px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.2em', fontWeight: 600 }}>NAVIC-LORA CORE</div>
            <button onClick={() => setUserVesselId('')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-blue)', fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer' }}>SWITCH BOAT</button>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{vessel.name}</h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`status-badge ${vessel.status === 'SOS' ? 'status-sos' : 'status-active'}`}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
            {vessel.status}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            BATTERY: {Math.floor(vessel.battery)}%
          </div>
        </div>
      </div>



      {activeTab === 'safety' && (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', animation: 'slideUp 0.4s ease' }}>
           
           {visibleWarnings.length > 0 && (
             <div style={{ background: 'rgba(255, 0, 0, 0.2)', border: '2px solid red', padding: '20px', borderRadius: '16px', animation: 'flashRedLight 1.5s infinite alternate', boxShadow: '0 0 20px rgba(255,0,0,0.3)', marginBottom: '10px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                 <span style={{ fontSize: '2rem' }}>⚠️</span>
                 <h2 style={{ color: 'red', fontSize: '1.2rem', fontWeight: 900, margin: 0 }}>DANGER DIRECTIVE</h2>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                 {visibleWarnings.map(w => {
                   const dist = w.district.split('-')[0].trim();
                   const isDanger = w.district.includes('[DANGER]') || w.alertType?.includes('WARNING');
                   const engMsg = isDanger ? 'STAY AWAY FROM SEA' : 'SWELL SURGE WATCH';
                   const mlMsg = isDanger ? 'അപായസൂചന: കടലിൽ പോകരുത്' : 'ജാഗ്രത: തിരമാലകൾ ശക്തമാണ്';

                   return (
                     <div key={w.id} style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}>
                       <div style={{ color: '#ffeb3b', fontSize: '1.2rem', fontWeight: 900, marginBottom: '8px' }}>{dist} COAST</div>
                       <div style={{ color: 'red', fontSize: '1.4rem', fontWeight: 900, marginBottom: '5px' }}>{mlMsg}</div>
                       <div style={{ color: 'white', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.1em' }}>{engMsg}</div>
                       
                       <button 
                         onClick={() => setDismissedWarningIds(prev => [...prev, w.id])} 
                         style={{ background: 'transparent', border: '1px solid #ffeb3b', color: '#ffeb3b', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', marginTop: '12px', width: '100%' }}>
                         മനസ്സിലായി (CLEAR)
                       </button>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}

           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>🌊 INCOIS കടൽ നില</h2>
             <div style={{ fontSize: '0.6rem', color: 'var(--accent-blue)', border: '1px solid currentColor', padding: '4px 8px', borderRadius: '4px' }}>LIVE FEED</div>
           </div>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.1em' }}>📍 YOUR LIVE POSITION</div>
              <div style={{ fontSize: '1.3rem', color: 'white', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{vessel.lat.toFixed(4)}°N, {vessel.lng.toFixed(4)}°E</div>
              <button 
                onClick={() => { 
                  setIsLoading(true); 
                  fetchLocationSafety(vessel.lat, vessel.lng).then(data => { 
                    setLiveSafety(data); 
                    setIsLoading(false); 
                  }); 
                }} 
                disabled={isLoading} 
                style={{ width: '100%', padding: '15px', background: 'var(--accent-blue)', border: 'none', borderRadius: '12px', color: '#000', fontWeight: 900, cursor: 'pointer', marginTop: '10px', boxShadow: `0 0 20px ${isLoading ? 'transparent' : 'var(--accent-blue-glow)'}` }}
              >
                {isLoading ? 'പരിശോധിക്കുന്നു...' : 'നിലവിലെ സുരക്ഷ പരിശോധിക്കുക (CHECK)'}
              </button>
           </div>

           <div style={{ padding: '30px', background: `linear-gradient(135deg, ${safetyInfo.color}15, transparent)`, borderRadius: '24px', border: `2px solid ${safetyInfo.color}`, textAlign: 'center', boxShadow: `0 0 30px ${safetyInfo.color}10` }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '15px', filter: `drop-shadow(0 0 10px ${safetyInfo.color})` }}>{safetyInfo.icon}</div>
              <h3 style={{ color: safetyInfo.color, fontSize: '1.8rem', marginBottom: '10px', fontWeight: 900, letterSpacing: '-0.02em' }}>{safetyInfo.status}</h3>
              <p style={{ fontSize: '1rem', fontWeight: 500, opacity: 0.9 }}>{safetyInfo.note}</p>
           </div>

           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                 <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '5px' }}>WAVE HEIGHT</div>
                 <div style={{ fontSize: '1.6rem', fontWeight: 800, color: safetyInfo.color }}>{currentSafety.waveHeight}m</div>
                 <div style={{ fontSize: '0.6rem', opacity: 0.4 }}>തിരമാലയുടെ ഉയരം</div>
              </div>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                 <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '5px' }}>WIND SPEED</div>
                 <div style={{ fontSize: '1.6rem', fontWeight: 800, color: safetyInfo.color }}>{currentSafety.windSpeed}<span style={{fontSize:'0.7rem'}}>km/h</span></div>
                 <div style={{ fontSize: '0.6rem', opacity: 0.4 }}>കാറ്റിന്റെ വേഗത</div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'market' && (
        <div className="glass-card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'slideUp 0.4s ease' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>📌 FMPIS വിപണി വില</h2>
             <div style={{ fontSize: '0.6rem', color: '#fdd835', border: '1px solid currentColor', padding: '4px 8px', borderRadius: '4px' }}>MARKET FISH</div>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>ലാൻഡിംഗ് സെന്റർ തിരഞ്ഞെടുക്കുക</label>
              <select value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)} style={{ width: '100%', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '14px', color: 'white', border: '1px solid var(--glass-border)', fontSize: '1.1rem', fontWeight: 600 }}>
                {markets.map(m => <option key={m} value={m} style={{ background: '#030812' }}>{m}</option>)}
              </select>
           </div>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredMarket.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', background: 'rgba(255,255,255,0.02)', borderRadius: '18px', border: '1px solid var(--glass-border)' }}>
                   <div>
                      <div style={{ fontWeight: 800, color: '#fdd835', fontSize: '1.1rem' }}>{item.malayalam}</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '2px', letterSpacing: '0.05em' }}>{item.species.toUpperCase()}</div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff' }}>₹{item.price}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>PER {item.unit.toUpperCase()}</div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'intel' && (
        <div className="glass-card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'slideUp 0.4s ease' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>🗺️ കോസ്റ്റൽ ഇന്റൽ (District Alerts)</h2>
             <div style={{ fontSize: '0.6rem', color: 'var(--accent-blue)', border: '1px solid currentColor', padding: '4px 8px', borderRadius: '4px' }}>INCOIS DATA</div>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {hwaAlerts.map((alert, idx) => {
                const isDanger = alert.district.includes('[DANGER]') || !alert.message.toLowerCase().includes('no immediate action is required');
                const cardColor = isDanger ? 'var(--accent-orange)' : '#fdd835'; 
                const bgFill = isDanger ? 'rgba(255,77,77,0.15)' : 'rgba(253,216,53,0.05)';
                const mlStatus = isDanger ? 'തീരത്ത് വലിയ തിരമാലകൾ' : 'കടൽ നില പരിശോധിക്കുക';

                return (
                  <div key={idx} style={{ padding: '15px', background: bgFill, borderRadius: '20px', borderLeft: `6px solid ${cardColor}`, boxShadow: `0 4px 15px rgba(0,0,0,0.2)` }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{alert.district.replace('[DANGER]', '').trim()}</strong>
                        <span style={{ fontSize: '0.7rem', color: cardColor, fontWeight: 800 }}>{alert.issueDate}</span>
                     </div>
                     <div style={{ color: cardColor, fontSize: '1rem', fontWeight: 900, marginBottom: '5px' }}>{mlStatus}</div>
                     <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>{alert.message}</div>
                  </div>
                );
              })}
              {hwaAlerts.length === 0 && (
                  <div style={{ textAlign: 'center', opacity: 0.5, padding: '40px' }}>No active district warnings.</div>
              )}
           </div>
        </div>
      )}

      {/* FOOTER NAV DOCK */}
      <div className="glass-card" style={{ padding: '14px', display: 'flex', justifyContent: 'space-around', position: 'fixed', bottom: 20, left: 15, right: 15, zIndex: 1000, borderRadius: '24px', background: 'rgba(13, 19, 33, 0.9)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>

        <div onClick={() => setActiveTab('safety')} style={{ color: activeTab === 'safety' ? 'var(--accent-blue)' : 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', transition: '0.3s', flex: 1, position: 'relative' }} className={activeTab === 'safety' ? 'tab-active' : ''}>
          <div style={{ fontSize: '1.6rem', marginBottom: '4px', filter: visibleWarnings.length > 0 ? 'drop-shadow(0 0 8px red) sepia(1) hue-rotate(-50deg) saturate(5)' : 'none' }}>🌊</div>
          <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.1em', color: visibleWarnings.length > 0 ? '#ff4d4d' : 'inherit', textShadow: visibleWarnings.length > 0 ? '0 0 10px rgba(255,0,0,0.8)' : 'none' }}>SAFETY</span>
        </div>

        <div onClick={handleSOS} style={{ textAlign: 'center', cursor: 'pointer', flex: 1, position: 'relative', top: '-15px' }}>
          <div style={{ 
            width: '60px', 
            height: '60px', 
            background: vessel.status === 'SOS' ? 'white' : 'red', 
            color: vessel.status === 'SOS' ? 'red' : 'white',
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '1rem', 
            fontWeight: 900,
            boxShadow: vessel.status === 'SOS' ? '0 0 20px white' : '0 10px 20px rgba(255,0,0,0.3)',
            border: '4px solid rgba(255,255,255,0.2)',
            margin: '0 auto'
          }}>
            {vessel.status === 'SOS' ? 'STOP' : 'SOS'}
          </div>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginTop: '5px' }}>DISTRESS</span>
        </div>

        <div onClick={() => setActiveTab('market')} style={{ color: activeTab === 'market' ? 'var(--accent-blue)' : 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', transition: '0.3s', flex: 1 }} className={activeTab === 'market' ? 'tab-active' : ''}>
          <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>📊</div>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em' }}>MARKET</span>
        </div>

        <div onClick={() => setActiveTab('intel')} style={{ color: activeTab === 'intel' ? 'var(--accent-blue)' : 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', transition: '0.3s', flex: 1 }} className={activeTab === 'intel' ? 'tab-active' : ''}>
          <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>🗺️</div>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em' }}>INTEL</span>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes flashRedLight { 0% { background: rgba(255,0,0,0.1); border-color: rgba(255,0,0,0.5); } 100% { background: rgba(255,0,0,0.3); border-color: red; } }
        @keyframes pulseRed { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); } 70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); } }
      `}</style>
    </main>
  );
}
