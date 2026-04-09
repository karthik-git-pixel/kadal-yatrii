'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '50px', padding: '20px', position: 'relative', overflow: 'hidden' }}>

      {/* Background: Nautical Grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,210,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,210,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)'
      }} />

      {/* Background: Radial Glow */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,210,255,0.07) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Background: Floating Orbs */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {[
          { top: '15%', left: '10%', size: 300, color: 'rgba(0,210,255,0.06)', delay: '0s' },
          { top: '65%', left: '75%', size: 200, color: 'rgba(0,255,136,0.05)', delay: '3s' },
          { top: '40%', left: '85%', size: 150, color: 'rgba(0,210,255,0.04)', delay: '6s' },
          { top: '80%', left: '15%', size: 180, color: 'rgba(0,255,136,0.04)', delay: '2s' },
        ].map((orb, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: orb.top, left: orb.left,
            width: orb.size, height: orb.size,
            borderRadius: '50%',
            background: orb.color,
            filter: 'blur(60px)',
            animation: `float 8s ease-in-out infinite`,
            animationDelay: orb.delay,
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '5px 16px', borderRadius: '20px', marginBottom: '20px',
          background: 'rgba(0,210,255,0.07)', border: '1px solid rgba(0,210,255,0.2)',
          fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.2em', color: 'var(--accent-blue)'
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
          NAVIC · LORA · MARITIME INTELLIGENCE
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 8vw, 5.5rem)',
          fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
          background: 'linear-gradient(to bottom, #ffffff 10%, #00d2ff 40%, #00ff88 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 30px rgba(0, 210, 255, 0.5))',
          animation: 'shimmer 3s ease-in-out infinite alternate',
          marginBottom: '10px'
        }}>
          KADAL YATRI
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.9rem, 2.2vw, 1.15rem)', marginTop: '14px', maxWidth: '520px', lineHeight: 1.6, margin: '0 auto' }}>
          Empowering small-scale fishers through mesh-networked safety &amp; real-time maritime intelligence.
        </p>
      </div>

      {/* Portal Cards */}
      <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', width: '100%', maxWidth: '800px', position: 'relative', zIndex: 1 }}>
        <Link href="/fisherman" style={{ textDecoration: 'none' }}>
          <div className="glass-card hero-card" style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px', borderColor: 'rgba(0,255,136,0.15)', height: '100%' }}>
            <div className="card-icon" style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 0 12px rgba(0,255,136,0.5))' }}>🌊</div>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--accent-green)', letterSpacing: '0.2em', fontWeight: 800, marginBottom: '6px' }}>FISHERMAN MODE</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Fisherman App</h2>
            </div>
            <p style={{ fontSize: '0.85rem', opacity: 0.55, lineHeight: 1.6 }}>Mobile-first sea state alerts, SOS button, and live market prices.</p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--accent-green)', fontWeight: 700, fontSize: '0.8rem' }}>
              ENTER PORTAL <span>→</span>
            </div>
          </div>
        </Link>

        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div className="glass-card hero-card" style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px', borderColor: 'rgba(0,210,255,0.15)', height: '100%' }}>
            <div className="card-icon" style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 0 12px rgba(0,210,255,0.5))' }}>🛰️</div>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--accent-blue)', letterSpacing: '0.2em', fontWeight: 800, marginBottom: '6px' }}>COMMAND MODE</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Command Center</h2>
            </div>
            <p style={{ fontSize: '0.85rem', opacity: 0.55, lineHeight: 1.6 }}>Live vessel monitoring, AIS traffic overlay, and rescue dispatch.</p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--accent-blue)', fontWeight: 700, fontSize: '0.8rem' }}>
              ENTER HUB <span>→</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 1, fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em', fontWeight: 600, textAlign: 'center', marginTop: 'auto', padding: '20px 0' }}>
        KADAL YATRI v1.0 · MARITIME SAFETY SYSTEM · KERALA, INDIA
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
