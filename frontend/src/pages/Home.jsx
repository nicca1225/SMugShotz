import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';

export default function Home() {
  const fadeRefs = useRef([]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = (i * 80) + 'ms';
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    fadeRefs.current.forEach(el => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  function addFade(el) {
    if (el && !fadeRefs.current.includes(el)) fadeRefs.current.push(el);
  }

  // Ripple effect on primary buttons
  function handleRipple(e) {
    const btn = e.currentTarget;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  return (
    <>
      <style>{`
        .hero {
          position: relative; width: 100%; height: 900px;
          overflow: hidden; display: block; background-color: #111;
        }
        .hero::before {
          content: ''; position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 30% 100% at 0% 50%, rgba(0,0,0,0.92), transparent),
            radial-gradient(ellipse 30% 100% at 100% 50%, rgba(0,0,0,0.92), transparent),
            linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.80) 100%);
          z-index: 2; pointer-events: none;
        }
        @keyframes ken-burns {
          0%   { transform: scale(1)    translateX(0)    translateY(0); }
          50%  { transform: scale(1.06) translateX(-1%)  translateY(0.5%); }
          100% { transform: scale(1.08) translateX(1%)   translateY(-0.5%); }
        }
        .hero-bg-ken {
          position: absolute; inset: -6%; z-index: 1; pointer-events: none;
          background-image: url('/assets/fujifilm 3d.jpg');
          background-size: auto 100%; background-position: center top;
          animation: ken-burns 18s ease-in-out infinite alternate;
          transform-origin: center center;
        }
        @keyframes light-leak {
          0%   { opacity: 0;    transform: translateX(-120%) rotate(-30deg); }
          15%  { opacity: 0.12; }
          85%  { opacity: 0.07; }
          100% { opacity: 0;    transform: translateX(220%)  rotate(-30deg); }
        }
        .hero-light-leak {
          position: absolute; top: -40%; left: -30%; width: 35%; height: 200%;
          background: linear-gradient(to right, transparent, rgba(255,210,140,0.1), rgba(255,180,100,0.06), transparent);
          pointer-events: none; z-index: 3;
          animation: light-leak 11s ease-in-out 4s infinite;
        }
        .hero-camera-fg {
          position: absolute; inset: 0;
          background-image: url('/assets/fujifilm 3d.jpg');
          background-size: auto 100%; background-position: center top;
          z-index: 4;
          animation: ken-burns 18s ease-in-out infinite alternate;
          pointer-events: none;
          mask-image: radial-gradient(ellipse 70% 75% at 50% 43%, black 40%, transparent 56%);
          -webkit-mask-image: radial-gradient(ellipse 70% 75% at 50% 43%, black 40%, transparent 56%);
        }
        .hero-red-glow {
          position: absolute; inset: 0; pointer-events: none; z-index: 2;
          background: radial-gradient(ellipse 55% 45% at 50% 52%, rgba(230,57,70,0.13) 0%, transparent 70%);
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        .hero-badge {
          position: absolute; top: 90px; left: 50%; transform: translateX(-50%);
          z-index: 5; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.16); color: var(--text);
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 400;
          padding: 11px 26px 11px 20px; border-radius: 50px; white-space: nowrap;
          letter-spacing: 0.4px; box-shadow: 0 0 24px rgba(230,57,70,0.12), inset 0 1px 0 rgba(255,255,255,0.07);
          display: flex; align-items: center; gap: 8px;
        }
        .hero-badge::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent); box-shadow: 0 0 8px rgba(230,57,70,0.8);
          flex-shrink: 0; animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes slide-from-left {
          from { opacity: 0; translate: -100px 0; }
          to   { opacity: 1; translate: 0 0; }
        }
        @keyframes slide-from-right {
          from { opacity: 0; translate: 100px 0; }
          to   { opacity: 1; translate: 0 0; }
        }
        .hero-smug {
          position: absolute; top: 220px; left: 50%; transform: translateX(-50%);
          z-index: 5; font-family: 'Barlow Condensed', sans-serif; font-weight: 900;
          font-size: 150px; line-height: 0.86; letter-spacing: -4px;
          text-transform: uppercase; color: var(--text);
          text-shadow: 0 4px 40px rgba(0,0,0,0.6); white-space: nowrap;
          pointer-events: none; user-select: none;
          animation: slide-from-left .9s cubic-bezier(.16,1,.3,1) .1s both;
        }
        .hero-display {
          position: absolute; top: 555px; left: 50%; transform: translateX(-50%);
          z-index: 5; text-align: center; pointer-events: none; user-select: none;
          animation: slide-from-right .9s cubic-bezier(.16,1,.3,1) .25s both;
        }
        .hero-line {
          display: block; font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900; font-size: 150px; line-height: 0.86;
          letter-spacing: -4px; text-transform: uppercase;
        }
        .hero-line-outline {
          -webkit-text-stroke: 4px rgba(255,255,255,1);
          color: transparent; text-shadow: none;
        }
        .hero-bottom {
          position: absolute; bottom: 48px; left: 0; right: 0;
          padding: 0 64px; display: flex; align-items: flex-end;
          justify-content: space-between; z-index: 5;
        }
        .hero-tagline { display: flex; flex-direction: column; gap: 4px; }
        .hero-tagline span {
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 300;
          color: var(--muted); line-height: 1.5;
        }
        .hero-cta {
          background: linear-gradient(135deg, #f04555 0%, #e63946 50%, #c82333 100%);
          color: var(--text); padding: 14px 32px; border-radius: 50px;
          font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700;
          text-decoration: none; letter-spacing: 0.3px;
          box-shadow: 0 4px 20px rgba(230,57,70,0.40), inset 0 1px 0 rgba(255,255,255,0.18);
          transition: filter 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
          white-space: nowrap; position: relative; overflow: hidden;
        }
        .hero-cta:hover {
          filter: brightness(1.12); transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(230,57,70,0.55), inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .hero-cta::after {
          content: ''; position: absolute; top: 0; left: -80%; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.28), transparent);
          transform: skewX(-18deg); transition: left .55s ease;
        }
        .hero-cta:hover::after { left: 140%; }
        @keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ticker-wrap {
          background: #080808; border-top: 1px solid #1c1c1c; border-bottom: 1px solid #1c1c1c;
          overflow: hidden; padding: 14px 0; position: relative; z-index: 10;
        }
        .ticker-wrap::before, .ticker-wrap::after {
          content: ''; position: absolute; top: 0; bottom: 0; width: 120px; z-index: 2;
        }
        .ticker-wrap::before { left: 0; background: linear-gradient(to right, #080808, transparent); }
        .ticker-wrap::after  { right: 0; background: linear-gradient(to left, #080808, transparent); }
        .ticker {
          display: flex; gap: 0; width: max-content;
          animation: ticker-scroll 28s linear infinite;
        }
        .ticker span {
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
          font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
          color: var(--muted); padding: 0 40px; white-space: nowrap;
        }
        .ticker span.accent { color: var(--accent); }
        .stats-bar {
          background: #0a0a0a; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a;
          padding: 24px 64px; display: flex; align-items: center; justify-content: space-around;
        }
        .stat-item {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          flex: 1; position: relative;
        }
        .stat-item + .stat-item::before {
          content: ''; position: absolute; left: 0; top: 10%; height: 80%;
          width: 1px; background: var(--border);
        }
        .stat-num { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 28px; color: var(--text); line-height: 1; }
        .stat-label { font-family: 'Inter', sans-serif; font-size: 13px; color: var(--muted); font-weight: 400; }
        .features { padding: 120px 64px; }
        .section-heading {
          font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
          font-size: clamp(36px, 5vw, 52px); color: var(--text);
          text-transform: uppercase; line-height: 1; margin-bottom: 56px;
        }
        .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .feature-card {
          background: linear-gradient(160deg, #161616 0%, #111 100%);
          border: 1px solid var(--border); border-top: 2px solid var(--accent);
          border-radius: 16px; padding: 40px 32px;
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
          cursor: default; position: relative; overflow: hidden;
        }
        .feature-card::before {
          content: ''; position: absolute; top: 0; left: 20%; right: 20%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(230,57,70,0.6), transparent);
          filter: blur(1px);
        }
        .feature-card:hover {
          transform: translateY(-6px); border-color: var(--accent);
          box-shadow: 0 16px 48px rgba(230,57,70,0.15), 0 0 0 1px rgba(230,57,70,0.08);
        }
        .feature-icon { font-size: 40px; margin-bottom: 24px; display: block; line-height: 1; }
        .feature-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 20px; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .feature-body { font-family: 'Inter', sans-serif; font-size: 14px; color: var(--muted); line-height: 1.65; }
        .how { background: #0a0a0a; border-top: 1px solid #1a1a1a; padding: 120px 64px; }
        .steps-row { display: flex; align-items: flex-start; }
        .step { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .step-connector { flex: 1; height: 0; border-top: 2px dashed #2a2a2a; margin-top: 28px; align-self: flex-start; }
        .step-circle {
          width: 56px; height: 56px; border-radius: 50%;
          background: linear-gradient(135deg, #f04555, #e63946 50%, #c82333);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-size: 24px; color: var(--text);
          margin-bottom: 20px; flex-shrink: 0;
          box-shadow: 0 0 20px rgba(230,57,70,0.45), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .step-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 18px; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
        .step-desc { font-family: 'Inter', sans-serif; font-size: 13px; color: var(--muted); line-height: 1.6; max-width: 180px; }
        .cta-section { padding: 120px 64px; text-align: center; }
        .cta-heading { font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: clamp(48px, 7vw, 80px); color: var(--text); text-transform: uppercase; line-height: 0.92; letter-spacing: -2px; margin-bottom: 24px; }
        .cta-sub { font-family: 'Inter', sans-serif; font-size: 17px; color: var(--muted); font-weight: 300; margin-bottom: 40px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.6; }
        .cta-buttons { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .btn-cta-primary {
          font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 600; color: var(--text);
          background: var(--accent); border: none; border-radius: 50px; padding: 16px 36px;
          cursor: pointer; text-decoration: none;
          transition: background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
          display: inline-flex; align-items: center; position: relative; overflow: hidden;
        }
        .btn-cta-primary:hover { background: #c82333; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(230,57,70,0.4); }
        .btn-cta-primary::after { content: ''; position: absolute; top: 0; left: -80%; width: 50%; height: 100%; background: linear-gradient(to right, transparent, rgba(255,255,255,0.28), transparent); transform: skewX(-18deg); transition: left .55s ease; }
        .btn-cta-primary:hover::after { left: 140%; }
        .btn-cta-ghost { font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 500; color: var(--text); background: transparent; border: 1px solid var(--border); border-radius: 50px; padding: 16px 36px; cursor: pointer; text-decoration: none; transition: border-color 0.25s ease; display: inline-flex; align-items: center; }
        .btn-cta-ghost:hover { border-color: #555; }
        footer { background: #0a0a0a; border-top: 1px solid #1a1a1a; padding: 80px 64px 0; }
        .footer-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 48px; padding-bottom: 64px; }
        .footer-brand-logo { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-size: 20px; color: var(--text); text-decoration: none; display: inline-block; margin-bottom: 16px; }
        .footer-brand-logo span { color: var(--accent); }
        .footer-brand-desc { font-family: 'Inter', sans-serif; font-size: 14px; color: var(--muted); line-height: 1.65; }
        .footer-col-label { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 16px; display: block; }
        .footer-links { display: flex; flex-direction: column; gap: 10px; list-style: none; }
        .footer-links a { font-family: 'Inter', sans-serif; font-size: 14px; color: var(--muted); text-decoration: none; transition: color 0.25s ease; }
        .footer-links a:hover { color: var(--text); }
        .footer-bottom { border-top: 1px solid var(--border); padding: 24px 0; display: flex; align-items: center; justify-content: space-between; }
        .footer-copyright, .footer-tagline { font-family: 'Inter', sans-serif; font-size: 13px; color: var(--muted); }
        @keyframes ripple-out { from { transform: translate(-50%,-50%) scale(0); opacity: 0.45; } to { transform: translate(-50%,-50%) scale(3.5); opacity: 0; } }
        .ripple { position: absolute; width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.35); pointer-events: none; animation: ripple-out .6s ease-out forwards; }
        @media (max-width: 768px) {
          .hero { height: 600px; }
          .hero-badge { font-size: 10px; top: 75px; white-space: normal; text-align: center; max-width: 280px; }
          .hero-bottom { flex-direction: column; align-items: flex-start; gap: 24px; padding: 0 24px; bottom: 36px; }
          .stats-bar { padding: 20px 24px; flex-wrap: wrap; gap: 16px; justify-content: center; }
          .stat-item + .stat-item::before { display: none; }
          .stat-item { flex: 1 1 40%; }
          .features, .cta-section { padding: 80px 24px; }
          .how { padding: 80px 24px; }
          .features-grid { grid-template-columns: 1fr; }
          .steps-row { flex-direction: column; gap: 40px; align-items: center; }
          .step-connector { display: none; }
          .footer-grid { grid-template-columns: 1fr; gap: 40px; }
          footer { padding: 60px 24px 0; }
          .footer-bottom { flex-direction: column; gap: 8px; text-align: center; }
        }
      `}</style>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg-ken"></div>
        <div className="hero-red-glow"></div>
        <div className="hero-light-leak"></div>
        <div className="hero-camera-fg"></div>
        <div className="hero-badge">A New Era in Camera Trading &nbsp;|&nbsp; Overview</div>
        <div className="hero-smug">SMUG</div>
        <div className="hero-display">
          <span className="hero-line hero-line-outline">SHOTZ</span>
        </div>
        <div className="hero-bottom">
          <div className="hero-tagline">
            <span>Bringing unprecedented quality</span>
            <span>to pre-owned camera trading</span>
          </div>
          <Link to="/auctions" className="hero-cta" onClick={handleRipple}>Browse Auctions →</Link>
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker-wrap">
        <div className="ticker">
          <span>Fujifilm</span><span className="accent">✦</span><span>Canon</span><span className="accent">✦</span><span>Nikon</span><span className="accent">✦</span><span>Sony</span><span className="accent">✦</span><span>Leica</span><span className="accent">✦</span><span>Hasselblad</span><span className="accent">✦</span><span>Olympus</span><span className="accent">✦</span><span>Pentax</span><span className="accent">✦</span><span>Ricoh</span><span className="accent">✦</span><span>Mamiya</span><span className="accent">✦</span>
          <span>Fujifilm</span><span className="accent">✦</span><span>Canon</span><span className="accent">✦</span><span>Nikon</span><span className="accent">✦</span><span>Sony</span><span className="accent">✦</span><span>Leica</span><span className="accent">✦</span><span>Hasselblad</span><span className="accent">✦</span><span>Olympus</span><span className="accent">✦</span><span>Pentax</span><span className="accent">✦</span><span>Ricoh</span><span className="accent">✦</span><span>Mamiya</span><span className="accent">✦</span>
        </div>
      </div>

      {/* STATS BAR */}
      <div className="stats-bar">
        <div className="stat-item"><span className="stat-num">12,400+</span><span className="stat-label">Cameras Sold</span></div>
        <div className="stat-item"><span className="stat-num">98%</span><span className="stat-label">AI-Verified</span></div>
        <div className="stat-item"><span className="stat-num">SGD 2M+</span><span className="stat-label">GMV</span></div>
        <div className="stat-item"><span className="stat-num">4.9★</span><span className="stat-label">Rating</span></div>
      </div>

      {/* FEATURES */}
      <section className="features">
        <span className="overline">Platform</span>
        <h2 className="section-heading">Why SMugShotz</h2>
        <div className="features-grid">
          <div className="feature-card" ref={addFade}>
            <span className="feature-icon">🔍</span>
            <div className="feature-title">AI Condition Scoring</div>
            <p className="feature-body">Our proprietary machine learning model analyses shutter count, age, and image data to produce an objective 0–1 condition score for every listing. No guesswork, no bias.</p>
          </div>
          <div className="feature-card" ref={addFade}>
            <span className="feature-icon">⚡</span>
            <div className="feature-title">Live Bidding Engine</div>
            <p className="feature-body">Real-time auction infrastructure with millisecond precision. Watch bids update live, get outbid notifications, and never miss the closing seconds on a coveted body.</p>
          </div>
          <div className="feature-card" ref={addFade}>
            <span className="feature-icon">🔒</span>
            <div className="feature-title">Secure via Stripe</div>
            <p className="feature-body">All payments are processed through Stripe's enterprise-grade infrastructure. Funds held in escrow, released only when both parties confirm the transaction.</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how">
        <span className="overline">Process</span>
        <h2 className="section-heading">How It Works</h2>
        <div className="steps-row">
          <div className="step">
            <div className="step-circle">1</div>
            <div className="step-title">List</div>
            <p className="step-desc">Upload your camera details and images. Our AI scores condition instantly.</p>
          </div>
          <div className="step-connector"></div>
          <div className="step">
            <div className="step-circle">2</div>
            <div className="step-title">Verify</div>
            <p className="step-desc">AI-powered verification confirms specs and suggests a fair starting price.</p>
          </div>
          <div className="step-connector"></div>
          <div className="step">
            <div className="step-circle">3</div>
            <div className="step-title">Bid</div>
            <p className="step-desc">Buyers compete in real-time live auctions. Transparent, fair, and fast.</p>
          </div>
          <div className="step-connector"></div>
          <div className="step">
            <div className="step-circle">4</div>
            <div className="step-title">Trade</div>
            <p className="step-desc">Secure payment via Stripe. Seller ships. Buyer confirms. Funds released.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2 className="cta-heading">Ready to<br />Trade?</h2>
        <p className="cta-sub">Join thousands of photographers buying and selling with confidence on SMugShotz.</p>
        <div className="cta-buttons">
          <Link to="/auctions" className="btn-cta-primary" onClick={handleRipple}>Browse Auctions →</Link>
          <Link to="/signup" className="btn-cta-ghost">List a Camera</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-grid">
          <div>
            <Link to="/" className="footer-brand-logo">SMug<span>Shotz</span></Link>
            <p className="footer-brand-desc">The premium marketplace for pre-owned cameras. Powered by AI verification and real-time bidding technology.</p>
          </div>
          <div>
            <span className="footer-col-label">Platform</span>
            <ul className="footer-links">
              <li><Link to="/auctions">Live Auctions</Link></li>
              <li><Link to="/create">Sell a Camera</Link></li>
              <li><a href="#">How It Works</a></li>
              <li><a href="#">AI Scoring</a></li>
            </ul>
          </div>
          <div>
            <span className="footer-col-label">Company</span>
            <ul className="footer-links">
              <li><a href="#">About</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Press</a></li>
            </ul>
          </div>
          <div>
            <span className="footer-col-label">Support</span>
            <ul className="footer-links">
              <li><a href="#">Help Centre</a></li>
              <li><a href="#">Buyer Guide</a></li>
              <li><a href="#">Seller Guide</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copyright">© 2026 SMugShotz. All rights reserved.</span>
          <span className="footer-tagline">Precision trading for precision instruments.</span>
        </div>
      </footer>
    </>
  );
}
