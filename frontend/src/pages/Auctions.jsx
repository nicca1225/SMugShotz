import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

function isEndingSoon(auction) {
  if (!auction.end_time) return false;
  const diff = new Date(auction.end_time).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

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
    status: raw.status || 'ACTIVE',
    image_url: raw.image_url || raw.ImageUrl || null
  };
}

function normaliseCamera(raw) {
  const payload = raw?.data || raw?.Out1 || raw?.camera || raw?.Camera || raw;
  if (!payload || typeof payload !== 'object') return null;

  return {
    camera_id: payload.camera_id ?? payload.id ?? null,
    model: payload.model ?? payload.camera_model ?? null,
    shutter_count: payload.shutter_count ?? payload.shutterCount ?? null,
    condition_score: payload.condition_score ?? payload.ai_condition_score ?? payload.aiConditionScore ?? null,
    description: payload.description ?? null,
    image_url: payload.image_url ?? payload.s3_image_url ?? payload.ImageUrl ?? null
  };
}

export default function Auctions() {
  const navigate = useNavigate();
  const [allAuctions, setAllAuctions] = useState([]);
  const [cameraDetails, setCameraDetails] = useState({});
  const [currentFilter, setCurrentFilter] = useState('all');
  const [auctionCount, setAuctionCount] = useState('Loading…');
  const [bidModal, setBidModal] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidFeedback, setBidFeedback] = useState({ text: '', cls: '' });
  const [bidSubmitting, setBidSubmitting] = useState(false);

  const currentUserId = (() => {
    const user = getUser();
    return user && user.user_id ? Number(user.user_id) : null;
  })();

  const filteredAuctions = useCallback(() => {
    switch (currentFilter) {
      case 'active': return allAuctions.filter(isActive);
      case 'mine': return currentUserId ? allAuctions.filter(a => Number(a.seller_id) === Number(currentUserId)) : [];
      case 'ending': return allAuctions.filter(isEndingSoon);
      default: return allAuctions;
    }
  }, [allAuctions, currentFilter, currentUserId]);

  const fetchAuctions = useCallback(async () => {
    try {
      const res = await fetch(AUCTIONS_API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.Out1 || []);
      setAllAuctions(list.map(normaliseAuction).filter(a => a.auction_id));
    } catch (err) {
      console.error('Failed to fetch auctions:', err);
      setAllAuctions([]);
    }
  }, []);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  useEffect(() => {
    async function fetchCameraDetails() {
      const updates = {};

      await Promise.all(
        allAuctions.map(async (auction) => {
          if (!auction.camera_id) return;

          try {
            const res = await fetch(`${CAMERA_SERVICE_URL}/${auction.camera_id}`);
            if (!res.ok) return;

            const raw = await res.json();
            const camera = normaliseCamera(raw);

            if (camera) {
              updates[auction.camera_id] = camera;
            }
          } catch (err) {
            console.warn(`Failed to fetch camera ${auction.camera_id}:`, err);
          }
        })
      );

      setCameraDetails(updates);
    }

    if (allAuctions.length > 0) {
      fetchCameraDetails();
    }
  }, [allAuctions]);

  useEffect(() => {
    const visible = filteredAuctions();
    setAuctionCount(`${visible.length} auction${visible.length !== 1 ? 's' : ''}`);
  }, [filteredAuctions]);

  function openBidModal(auction) {
    if (!currentUserId) {
      navigate('/signup');
      return;
    }
    setBidAmount('');
    setBidFeedback({ text: '', cls: '' });
    setBidModal({ auction });
  }

  function closeBidModal() {
    setBidModal(null);
  }

  async function submitBid(e) {
    e.preventDefault();
    if (!bidModal) return;
    const { auction } = bidModal;
    setBidSubmitting(true);
    setBidFeedback({ text: '', cls: '' });
    try {
      const res = await fetch(getBidApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: Number(auction.auction_id),
          bidder_id: currentUserId,
          bid_amount: Number(bidAmount)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setBidFeedback({ text: data.message || 'Bid placed successfully.', cls: 'success' });
      setTimeout(async () => { closeBidModal(); await fetchAuctions(); }, 900);
    } catch (err) {
      setBidFeedback({ text: err.message || 'Failed to place bid.', cls: 'error' });
    } finally {
      setBidSubmitting(false);
    }
  }

  const visible = filteredAuctions();

  const minBidForModal = bidModal
    ? Math.max(Number(bidModal.auction.start_price || 0), Number(bidModal.auction.current_highest_bid || 0)) + 1
    : 0;

  return (
    <>
      <style>{`
        .page-hero { background:#000; padding:100px 24px 54px; border-bottom:1px solid #1a1a1a; text-align:center; }
        .page-hero-heading { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:clamp(52px,7vw,88px); line-height:.92; text-transform:uppercase; }
        .page-hero-sub { max-width:780px; margin:18px auto 0; color:var(--muted); line-height:1.7; font-size:16px; }
        .user-strip { padding:18px 64px; border-bottom:1px solid #1a1a1a; display:flex; gap:16px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
        .user-chip { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
        .pill { padding:10px 14px; border-radius:14px; border:1px solid #232323; background:#090909; }
        .pill span { display:block; font-size:11px; color:var(--muted); letter-spacing:1.4px; text-transform:uppercase; margin-bottom:5px; }
        .pill strong { font-family:'Barlow Condensed',sans-serif; font-size:28px; }
        .filter-bar { padding:28px 64px; border-bottom:1px solid #1a1a1a; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .filter-pills { display:flex; gap:8px; flex-wrap:wrap; }
        .filter-pill { border-radius:50px; padding:8px 18px; font-size:13px; font-weight:500; cursor:pointer; border:1px solid #2a2a2a; background:transparent; color:var(--muted); }
        .filter-pill.active { background:var(--accent); color:var(--text); border-color:var(--accent); }
        .filter-right { display:flex; gap:12px; align-items:center; }
        .auctions-section { padding:42px 64px 72px; }
        .auction-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:24px; }
        .auction-card { background:var(--surface); border:1px solid var(--border); border-radius:18px; overflow:hidden; transition:border-color .25s ease, transform .25s ease, box-shadow .25s ease; cursor:pointer; text-decoration:none; color:inherit; display:block; }
        .auction-card:hover { border-color:var(--accent); transform:translateY(-4px); box-shadow:0 16px 40px rgba(230,57,70,.12); }
        .card-image { width:100%; height:180px; background:linear-gradient(135deg,#111,#181818); display:flex; align-items:center; justify-content:center; position:relative; }
        .card-placeholder { font-size:34px; opacity:.42; }
        .card-status { position:absolute; top:12px; right:12px; border-radius:50px; padding:4px 12px; font-size:11px; font-weight:700; }
        .card-status.live { background:rgba(230,57,70,.2); color:var(--accent); border:1px solid rgba(230,57,70,.35); }
        .card-status.ended { background:rgba(110,110,115,.2); color:var(--muted); border:1px solid rgba(110,110,115,.3); }
        .card-body { padding:24px; }
        .card-model { font-family:'Barlow Condensed',sans-serif; font-size:28px; font-weight:800; line-height:.95; margin-bottom:12px; }
        .card-meta { display:grid; gap:8px; margin-bottom:18px; }
        .meta-row { display:flex; justify-content:space-between; gap:16px; color:var(--muted); font-size:13px; }
        .meta-row strong { color:var(--text); font-weight:600; }
        .card-divider { border:none; border-top:1px solid #1a1a1a; margin:16px 0; }
        .bid-label { font-size:10px; font-weight:600; color:var(--muted); letter-spacing:2px; text-transform:uppercase; margin-bottom:4px; }
        .bid-amount { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:34px; line-height:1; }
        .bid-starting { font-size:13px; color:var(--muted); margin:10px 0 16px; }
        .btn-view { width:100%; border-radius:50px; padding:13px 18px; background:var(--accent); border:none; color:var(--text); text-align:center; font-size:14px; font-weight:600; cursor:pointer; }
        .camera-note { font-size:13px; color:var(--muted); margin-bottom:14px; }
      `}</style>

      <div className="page-hero">
        <span className="overline">Auctions</span>
        <h1 className="page-hero-heading">Live Camera Listings</h1>
        <p className="page-hero-sub">Every logged-in user can browse auctions, create their own listings, and place bids on everyone else's. Your own auctions stay visible here too, but the bid button is disabled so you can't bid on your own listing.</p>
      </div>

      <div className="user-strip">
        <div className="user-chip">
          <div className="pill"><span>Current User</span><strong>{currentUserId || 'Guest'}</strong></div>
          <div className="pill"><span>Bid Access</span><strong>{currentUserId ? 'Can create & bid' : 'Create an account first'}</strong></div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-pills">
          {['all', 'active', 'mine', 'ending'].map(f => (
            <button
              key={f}
              className={`filter-pill${currentFilter === f ? ' active' : ''}`}
              onClick={() => setCurrentFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'mine' ? 'My Listings' : 'Ending Soon'}
            </button>
          ))}
        </div>
        <div className="filter-right">
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{auctionCount}</span>
          <button className="btn-ghost-sm" onClick={fetchAuctions}>Refresh</button>
        </div>
      </div>

      <section className="auctions-section">
        <div className="auction-grid">
          {visible.map(auction => {
            const active = isActive(auction) && String(auction.status).toUpperCase() !== 'COMPLETED';
            const bidText = auction.current_highest_bid > 0 ? fmtSGD(auction.current_highest_bid) : 'No bids yet';
            const camera = auction.camera_id ? cameraDetails[auction.camera_id] : null;

            return (
              <div key={auction.auction_id} className="auction-card" onClick={() => navigate(`/auctions/${auction.auction_id}`)}>
                <div className="card-image">
                  {(auction.image_url || camera?.image_url) ? (
                    <img
                      src={auction.image_url || camera?.image_url}
                      alt={camera?.model || auction.camera_model}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span className="card-placeholder">📷</span>
                  )}
                  <div className={`card-status ${active ? 'live' : 'ended'}`}>{active ? 'LIVE' : 'ENDED'}</div>
                </div>

                <div className="card-body">
                  <div className="card-model">{camera?.model || auction.camera_model || 'Camera Listing'}</div>
                  <div className="card-meta">
                    <div className="meta-row"><span>Auction ID</span><strong>{auction.auction_id}</strong></div>
                    <div className="meta-row"><span>Seller ID</span><strong>{auction.seller_id}</strong></div>
                    <div className="meta-row"><span>Camera ID</span><strong>{auction.camera_id ?? '—'}</strong></div>
                    <div className="meta-row"><span>Shutter Count</span><strong>{camera?.shutter_count ?? '—'}</strong></div>
                    <div className="meta-row"><span>Condition Score</span><strong>{camera?.condition_score ?? '—'}</strong></div>
                  </div>

                  {!camera && <div className="camera-note">No camera details available</div>}

                  <hr className="card-divider" />
                  <div className="bid-label">Current Highest Bid</div>
                  <div className="bid-amount">{bidText}</div>
                  <div className="bid-starting">Starting at {fmtSGD(auction.start_price)}</div>
                  <div className="btn-view" style={{ textAlign: 'center' }}>View Details →</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}