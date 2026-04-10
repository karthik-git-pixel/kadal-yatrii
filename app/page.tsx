'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '50px', padding: '20px', position: 'relative', overflow: 'hidden', background: '#020617' }}>

      {/* Background: Premium Maritime Image */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url("/maritime_deep_sea_background_1775851844380.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.4,
        filter: 'grayscale(30%)'
      }} />

      {/* Background: Depth Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(circle at center, transparent 0%, rgba(2, 6, 23, 0.8) 100%)',
        pointerEvents: 'none'
      }} />

      {/* Background: Nautical Grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,210,255,0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,210,255,0.08) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
        maskImage: 'radial-gradient(circle at 50% 50%, black 20%, transparent 80%)',
        opacity: 0.5
      }} />

      {/* Content */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '8px 20px', borderRadius: '30px', marginBottom: '25px',
          background: 'rgba(0,210,255,0.1)', border: '1px solid rgba(0,210,255,0.3)',
          fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.25em', color: 'var(--accent-blue)',
          backdropFilter: 'blur(10px)'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)', boxShadow: '0 0 10px var(--accent-blue)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
          NAVIC · LORA · MARITIME INTELLIGENCE
        </div>

        <h1 style={{
          fontSize: 'clamp(3rem, 10vw, 6.5rem)',
          fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.9,
          background: 'linear-gradient(to bottom, #ffffff 30%, #00d2ff 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 40px rgba(0, 210, 255, 0.6))',
          animation: 'shimmer 4s ease-in-out infinite alternate',
          marginBottom: '10px'
        }}>
          KADAL YATRI
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', marginTop: '20px', maxWidth: '600px', lineHeight: 1.5, margin: '0 auto', fontWeight: 500 }}>
          Next-generation safety and market synchronization for the modern fishing fleet.
        </p>
      </div>

      {/* Portal Cards: Centered for Laptop */}
      <div className="portal-container" style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
        <div className="cards-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', 
          justifyContent: 'center',
          gap: '30px', 
          width: '100%'
        }}>
          <Link href="/fisherman" style={{ textDecoration: 'none' }}>
            <div className="glass-card hero-card" style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', borderColor: 'rgba(0,255,136,0.3)', padding: '40px', background: 'rgba(13, 19, 33, 0.7)' }}>
              <div className="card-icon" style={{ fontSize: '3.5rem', filter: 'drop-shadow(0 0 15px rgba(0,255,136,0.6))' }}>🌊</div>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--accent-green)', letterSpacing: '0.25em', fontWeight: 900, marginBottom: '10px' }}>VESSEL PORTAL</div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white' }}>Fisherman App</h2>
              </div>
              <p style={{ fontSize: '0.95rem', opacity: 0.6, lineHeight: 1.6 }}>Real-time sea state, emergency SOS, and landing center price updates.</p>
              <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--accent-green)', fontWeight: 900, fontSize: '0.9rem' }}>
                OPEN DASHBOARD <span>→</span>
              </div>
            </div>
          </Link>

          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div className="glass-card hero-card" style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', borderColor: 'rgba(0,210,255,0.3)', padding: '40px', background: 'rgba(13, 19, 33, 0.7)' }}>
              <div className="card-icon" style={{ fontSize: '3.5rem', filter: 'drop-shadow(0 0 15px rgba(0,210,255,0.6))' }}>🛰️</div>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', letterSpacing: '0.25em', fontWeight: 900, marginBottom: '10px' }}>COMMAND PORTAL</div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white' }}>Command Center</h2>
              </div>
              <p style={{ fontSize: '0.95rem', opacity: 0.6, lineHeight: 1.6 }}>Fleet surveillance, SOS response management, and market broadcasting.</p>
              <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--accent-blue)', fontWeight: 900, fontSize: '0.9rem' }}>
                OPEN COMMAND <span>→</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 1, fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', fontWeight: 700, textAlign: 'center', marginTop: 'auto', padding: '30px 0' }}>
        KADAL YATRI v1.0 · KERALA MARITIME SAFETY NETWORK
      </footer>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        @keyframes shimmer {
          0% { filter: drop-shadow(0 0 20px rgba(0, 210, 255, 0.4)); opacity: 0.95; }
          100% { filter: drop-shadow(0 0 40px rgba(0, 255, 136, 0.7)); opacity: 1; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .hero-card {
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
          background: rgba(13, 19, 33, 0.6) !important;
        }
        .hero-card:hover {
          transform: translateY(-6px) !important;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
        }

        @media (max-width: 600px) {
          main {
            gap: 30px !important;
            padding: 40px 20px !important;
            justify-content: flex-start !important;
          }
          .cards-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .hero-card {
            padding: 20px !important;
          }
          .card-icon {
            font-size: 2rem !important;
          }
          footer {
            padding-bottom: 40px !important;
          }
        }
      `}</style>
    </main>
  );
}
