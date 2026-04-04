import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getUser } from '../utils/auth.js';

const AUCTIONS_API_URL = 'https://personal-vsev7crp.outsystemscloud.com/Auction/rest/Auction';
const CAMERA_SERVICE_URL = 'http://localhost:5002/camera';

function getBidApiUrl() {
  return localStorage.getItem('smugshotz_bid_api') || 'http://localhost/bid';
}

function fmtSGD(amount) {
  return 'SGD ' + Number(amount || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isActive(auction) {
  if (!auction.end_time) return true;
  return new Date(auction.end_time).getTime() > Date.now();
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
}

function pad(n) { return String(n).padStart(2, '0'); }

function normaliseAuction(raw) {
  const highest = raw.current_highest_bid ?? raw.current_bid ?? 0;
  return {
    auction_id: Number(raw.auction_id ?? raw.id),
    seller_id: Number(raw.seller_id),
    camera_id: raw.camera_id ?? null,
    camera_model: raw.camera_model || raw.model || `Camera #${raw.camera_id ?? raw.auction_id ?? ''}`.trim(),
    start_price: Number(raw.start_price ?? 0),
    current_highest_bid: Number(highest ?? 0),
    highest_bidder_id: raw.highest_bidder_id ?? null,
    end_time: raw.end_time || raw.endDate || null,
    status: raw.status || 'ACTIVE'
  };
}

export default function AuctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState('loading'); // loading | error | detail
  const [auction, setAuction] = useState(null);
  const [cameraData, setCameraData] = useState(null);
  const [countdown, setCountdown] = useState({ d: '--', h: '--', m: '--', s: '--', ended: false, noEnd: false });
  const [bidAmount, setBidAmount] = useState('');
  const [selectedChip, setSelectedChip] = useState(null);
  const [bidFeedback, setBidFeedback] = useState({ text: '', cls: '' });
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const intervalRef = useRef(null);

  const user = getUser();
  const currentUserId = user && user.user_id ? Number(user.user_id) : null;

  function startCountdown(endTime) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!endTime) {
      setCountdown({ d: '--', h: '--', m: '--', s: '--', ended: false, noEnd: true });
      return;
    }
    function tick() {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(intervalRef.current);
        setCountdown({ d: '00', h: '00', m: '00', s: '00', ended: true, noEnd: false });
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown({ d: pad(d), h: pad(h), m: pad(m), s: pad(s), ended: false, noEnd: false });
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
  }

  const loadDetail = useCallback(async () => {
    const auctionId = Number(id);
    if (!auctionId) { setState('error'); return; }
    try {
      const res = await fetch(AUCTIONS_API_URL);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.Out1 || []);
      const raw = list.find(a => Number(a.auction_id ?? a.id) === auctionId);
      if (!raw) { setState('error'); return; }
      const norm = normaliseAuction(raw);
      setAuction(norm);

      let cam = null;
      if (norm.camera_id) {
        try {
          const camRes = await fetch(`${CAMERA_SERVICE_URL}/${norm.camera_id}`);
          if (camRes.ok) cam = await camRes.json();
        } catch (_) {}
      }
      setCameraData(cam);
      startCountdown(norm.end_time);
      setState('detail');
    } catch (_) {
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadDetail]);

  async function submitBid() {
    if (!auction) return;
    const amount = Number(bidAmount);
    const minBid = Math.max(Number(auction.start_price || 0), Number(auction.current_highest_bid || 0)) + 1;
    if (!amount || amount < minBid) {
      setBidFeedback({ text: `Minimum bid is ${fmtSGD(minBid)}`, cls: 'error' });
      return;
    }
    setBidSubmitting(true);
    setBidFeedback({ text: '', cls: '' });
    try {
      const res = await fetch(getBidApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_id: auction.auction_id, bidder_id: currentUserId, bid_amount: amount })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setBidFeedback({ text: data.message || 'Bid placed successfully!', cls: 'success' });
      setTimeout(() => loadDetail(), 1200);
    } catch (err) {
      setBidFeedback({ text: err.message || 'Failed to place bid.', cls: 'error' });
      setBidSubmitting(false);
    }
  }

  function renderBidArea() {
    if (!auction) return null;
    const active = isActive(auction) && String(auction.status).toUpperCase() !== 'COMPLETED';
    const isOwn = currentUserId && Number(auction.seller_id) === Number(currentUserId);

    if (isOwn) {
      return <div className="own-pill">Your listing — bidding disabled</div>;
    }
    if (!active) {
      return <button className="btn-place-bid" disabled>Auction Ended</button>;
    }
    if (!currentUserId) {
      return (
        <Link to="/signup" className="btn-place-bid" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Sign in to place a bid
        </Link>
      );
    }

    const currentBid = Number(auction.current_highest_bid || 0);
    const startPrice = Number(auction.start_price || 0);
    const base = Math.max(currentBid, startPrice);
    const minBid = base + 1;
    const suggestions = [
      Math.ceil(base * 1.05) || minBid,
      Math.ceil(base * 1.10) || minBid + 5,
      Math.ceil(base * 1.20) || minBid + 10
    ].filter((v, i, a) => a.indexOf(v) === i && v >= minBid);

    return (
      <>
        <div className="quick-bids">
          {suggestions.map(v => (
            <button
              key={v}
              className={`quick-bid-chip${selectedChip === v ? ' selected' : ''}`}
              onClick={() => { setSelectedChip(v); setBidAmount(String(v)); }}
            >
              {fmtSGD(v)}
            </button>
          ))}
        </div>
        <input
          className="bid-input"
          type="number"
          min={minBid}
          step="1"
          placeholder={`Or enter: min ${fmtSGD(minBid)}`}
          value={bidAmount}
          onChange={e => { setBidAmount(e.target.value); setSelectedChip(null); }}
        />
        <button className="btn-place-bid" onClick={submitBid} disabled={bidSubmitting}>
          {bidSubmitting ? 'Submitting…' : 'Place Bid'}
        </button>
        {bidFeedback.text && <div className={`bid-feedback ${bidFeedback.cls}`}>{bidFeedback.text}</div>}
      </>
    );
  }

  const activeAuction = auction && isActive(auction) && String(auction.status).toUpperCase() !== 'COMPLETED';

  return (
    <>
      <style>{`
        .page-shell { max-width:1200px; margin:0 auto; padding:80px 48px 80px; }
        .breadcrumb { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted); margin-bottom:24px; padding-top:12px; }
        .breadcrumb a { color:var(--muted); text-decoration:none; }
        .breadcrumb a:hover { color:var(--text); }
        .breadcrumb-sep { opacity:.4; }
        .listing-title { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:clamp(32px,4vw,52px); line-height:.95; text-transform:uppercase; margin-bottom:8px; }
        .listing-subtitle { color:var(--muted); font-size:14px; margin-bottom:32px; }
        .listing-grid { display:grid; grid-template-columns:1fr 380px; gap:48px; align-items:start; }
        .image-main { width:100%; aspect-ratio:4/3; background:linear-gradient(135deg,#111,#181818); border-radius:18px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid var(--border); }
        .image-main img { width:100%; height:100%; object-fit:cover; }
        .image-placeholder { font-size:80px; opacity:.2; }
        .details-section { margin-top:40px; }
        .section-heading { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:22px; text-transform:uppercase; letter-spacing:.5px; margin-bottom:16px; padding-bottom:10px; border-bottom:1px solid var(--border); }
        .specs-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
        .spec-item { padding:14px 0; border-bottom:1px solid #141414; }
        .spec-item:nth-child(odd) { padding-right:32px; }
        .spec-label { font-size:11px; font-weight:600; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:5px; }
        .spec-value { font-size:15px; font-weight:500; color:var(--text); }
        .condition-bar { display:flex; align-items:center; gap:10px; margin-top:4px; }
        .bar-track { flex:1; height:4px; background:#1a1a1a; border-radius:2px; overflow:hidden; }
        .bar-fill { height:100%; border-radius:2px; background:var(--accent); transition:width .6s ease; }
        .description-section { margin-top:32px; }
        .description-text { color:var(--muted); font-size:14px; line-height:1.8; }
        .bid-panel { position:sticky; top:76px; background:var(--surface); border:1px solid var(--border); border-radius:20px; overflow:hidden; }
        .bid-panel-inner { padding:24px; }
        .countdown-wrap { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid var(--border); }
        .countdown-unit { background:var(--surface2); border-radius:12px; padding:12px 8px; text-align:center; }
        .countdown-num { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:32px; line-height:1; color:var(--text); }
        .countdown-label { font-size:10px; font-weight:600; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-top:4px; }
        .countdown-ended-wrap { text-align:center; padding:16px 0 24px; border-bottom:1px solid var(--border); margin-bottom:0; }
        .countdown-ended-text { font-family:'Barlow Condensed',sans-serif; font-size:22px; font-weight:800; color:var(--muted); text-transform:uppercase; }
        .bid-label-sm { font-size:10px; font-weight:600; color:var(--muted); letter-spacing:2px; text-transform:uppercase; margin-bottom:6px; }
        .bid-amount-lg { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:48px; line-height:1; margin-bottom:6px; }
        .bid-starting-sm { font-size:13px; color:var(--muted); margin-bottom:20px; }
        .quick-bids { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .quick-bid-chip { flex:1; min-width:70px; padding:10px 6px; border-radius:50px; border:1px solid var(--border); background:transparent; color:var(--text); font-size:13px; font-weight:600; cursor:pointer; text-align:center; transition:border-color .2s, background .2s; }
        .quick-bid-chip:hover { border-color:var(--accent); background:rgba(230,57,70,.08); }
        .quick-bid-chip.selected { border-color:var(--accent); background:rgba(230,57,70,.15); color:var(--accent); }
        .bid-input { width:100%; background:#090909; color:var(--text); border:1px solid #232323; border-radius:14px; padding:14px 16px; font-size:15px; margin-bottom:10px; }
        .bid-input:focus { outline:none; border-color:var(--accent); }
        .btn-place-bid { width:100%; padding:15px 20px; font-size:15px; font-weight:700; border-radius:50px; background:var(--accent); color:var(--text); border:none; cursor:pointer; transition:opacity .2s; letter-spacing:.3px; }
        .btn-place-bid:hover { opacity:.88; }
        .btn-place-bid:disabled { background:#262626; color:var(--muted); cursor:not-allowed; opacity:1; }
        .own-pill { width:100%; border-radius:50px; padding:14px 18px; background:#111; border:1px solid #252525; color:var(--muted); text-align:center; font-size:14px; font-weight:600; }
        .bid-feedback { font-size:13px; line-height:1.6; margin-top:10px; min-height:18px; text-align:center; }
        .bid-feedback.success { color:var(--success); }
        .bid-feedback.error { color:var(--accent); }
        .panel-meta { border-top:1px solid var(--border); padding:16px 24px; display:grid; gap:10px; }
        .panel-meta-row { display:flex; justify-content:space-between; font-size:13px; color:var(--muted); }
        .panel-meta-row strong { color:var(--text); font-weight:500; }
        .loading-state { text-align:center; padding:140px 24px; color:var(--muted); font-size:16px; }
        .error-state { text-align:center; padding:140px 24px; }
        .error-heading { font-family:'Barlow Condensed',sans-serif; font-size:34px; font-weight:800; text-transform:uppercase; margin-bottom:12px; }
        .error-sub { color:var(--muted); margin-bottom:28px; }
        .status-badge { display:inline-flex; align-items:center; gap:6px; border-radius:50px; padding:5px 14px; font-size:11px; font-weight:700; margin-bottom:12px; }
        .status-badge.live { background:rgba(230,57,70,.15); color:var(--accent); border:1px solid rgba(230,57,70,.3); }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
        .status-badge.live::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--accent); animation:pulse 1.4s infinite; }
        .status-badge.ended { background:rgba(110,110,115,.15); color:var(--muted); border:1px solid rgba(110,110,115,.25); }
        @media (max-width:900px) {
          .page-shell { padding:72px 20px 60px; }
          .listing-grid { grid-template-columns:1fr; }
          .bid-panel { position:static; }
          .specs-grid { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="page-shell">
        {state === 'loading' && <div className="loading-state">Loading auction details…</div>}
        {state === 'error' && (
          <div className="error-state">
            <div className="error-heading">Auction Not Found</div>
            <p className="error-sub">This auction doesn't exist or couldn't be loaded.</p>
            <Link to="/auctions" className="btn-primary-sm">Back to Auctions</Link>
          </div>
        )}
        {state === 'detail' && auction && (
          <>
            <div className="breadcrumb">
              <Link to="/auctions">Auctions</Link>
              <span className="breadcrumb-sep">›</span>
              <span>{auction.camera_model}</span>
            </div>

            <div className={`status-badge ${activeAuction ? 'live' : 'ended'}`}>
              {activeAuction ? 'LIVE' : 'ENDED'}
            </div>
            <h1 className="listing-title">{auction.camera_model}</h1>
            <p className="listing-subtitle">Auction #{auction.auction_id} · Listed by Seller #{auction.seller_id}</p>

            <div className="listing-grid">
              {/* Left: image + details */}
              <div>
                <div className="image-main">
                  {cameraData?.s3_image_url ? (
                    <img
                      src={cameraData.s3_image_url}
                      alt={auction.camera_model}
                      onError={e => { e.target.parentElement.innerHTML = '<span class="image-placeholder">📷</span>'; }}
                    />
                  ) : (
                    <span className="image-placeholder">📷</span>
                  )}
                </div>

                {cameraData && (
                  <div className="details-section">
                    <div className="section-heading">Camera Details</div>
                    <div className="specs-grid">
                      {(() => {
                        const score = cameraData.ai_condition_score ?? cameraData.condition_score ?? null;
                        const scorePct = score != null ? Math.round((score / 10) * 100) : null;
                        const specs = [
                          { label: 'Model', value: cameraData.model || '—' },
                          { label: 'Shutter Count', value: cameraData.shutter_count != null ? `${Number(cameraData.shutter_count).toLocaleString()} shots` : '—' },
                          { label: 'Camera ID', value: `#${cameraData.camera_id}` },
                          { label: 'Seller ID', value: `#${cameraData.seller_id}` },
                          ...(score != null ? [{ label: 'AI Condition Score', value: score.toFixed(1) + ' / 10', bar: scorePct }] : []),
                          { label: 'Listed', value: cameraData.status || '—' },
                        ];
                        return specs.map((s, i) => (
                          <div key={i} className="spec-item">
                            <div className="spec-label">{s.label}</div>
                            <div className="spec-value">{s.value}</div>
                            {s.bar != null && (
                              <div className="condition-bar">
                                <div className="bar-track"><div className="bar-fill" style={{ width: `${s.bar}%` }}></div></div>
                                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{s.bar}%</span>
                              </div>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                    {cameraData.description && (
                      <div className="description-section">
                        <div className="section-heading" style={{ marginTop: '32px' }}>Description</div>
                        <p className="description-text">{cameraData.description}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: sticky bid panel */}
              <div>
                <div className="bid-panel">
                  <div className="bid-panel-inner">
                    {/* Countdown */}
                    {countdown.noEnd ? (
                      <div className="countdown-ended-wrap"><div className="countdown-ended-text">No End Date Set</div></div>
                    ) : countdown.ended ? (
                      <div className="countdown-ended-wrap"><div className="countdown-ended-text">Auction Ended</div></div>
                    ) : (
                      <div className="countdown-wrap">
                        <div className="countdown-unit"><div className="countdown-num">{countdown.d}</div><div className="countdown-label">Days</div></div>
                        <div className="countdown-unit"><div className="countdown-num">{countdown.h}</div><div className="countdown-label">Hours</div></div>
                        <div className="countdown-unit"><div className="countdown-num">{countdown.m}</div><div className="countdown-label">Mins</div></div>
                        <div className="countdown-unit"><div className="countdown-num">{countdown.s}</div><div className="countdown-label">Secs</div></div>
                      </div>
                    )}

                    <div className="bid-label-sm">Current Highest Bid</div>
                    <div className="bid-amount-lg">
                      {auction.current_highest_bid > 0 ? fmtSGD(auction.current_highest_bid) : 'No bids yet'}
                    </div>
                    <div className="bid-starting-sm">Starting at {fmtSGD(auction.start_price)}</div>

                    <div>{renderBidArea()}</div>
                  </div>

                  <div className="panel-meta">
                    <div className="panel-meta-row"><span>Auction ID</span><strong>#{auction.auction_id}</strong></div>
                    <div className="panel-meta-row"><span>Ends</span><strong>{fmtDate(auction.end_time)}</strong></div>
                    {auction.highest_bidder_id && (
                      <div className="panel-meta-row"><span>Highest Bidder</span><strong>#{auction.highest_bidder_id}</strong></div>
                    )}
                    <div className="panel-meta-row"><span>Status</span><strong>{auction.status}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
