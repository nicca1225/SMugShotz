import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getUser } from '../utils/auth.js';

const ORDER_SERVICE_URL = 'http://localhost/order';
const PROCESS_PAYMENT_URL = 'http://localhost/process-payment';
const CAMERA_SERVICE_URL = 'http://localhost/camera';
const AUCTIONS_API_URL = 'https://personal-vsev7crp.outsystemscloud.com/Auction/rest/Auction/all';

export default function WonAuction() {
  const [params] = useSearchParams();
  const auctionId = params.get('auction_id');
  const user = getUser();

  const [state, setState] = useState('loading'); // loading | ready | paying | error
  const [order, setOrder] = useState(null);
  const [cameraModel, setCameraModel] = useState(null);
  const [cameraImage, setCameraImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!auctionId) { setState('error'); setErrorMsg('No auction specified.'); return; }
    async function load() {
      try {
        // Fetch order by auction
        const orderRes = await fetch(`${ORDER_SERVICE_URL}/auction/${auctionId}`);
        if (!orderRes.ok) throw new Error('Order not found. It may still be processing — try again shortly.');
        const orderData = await orderRes.json();
        setOrder(orderData);

        // Try to get camera details from auction list
        try {
          const aucRes = await fetch(AUCTIONS_API_URL);
          if (aucRes.ok) {
            const aucData = await aucRes.json();
            const list = Array.isArray(aucData) ? aucData : [];
            const auc = list.find(a => Number(a.auction_id ?? a.id) === Number(auctionId));
            if (auc?.camera_id) {
              const camRes = await fetch(`${CAMERA_SERVICE_URL}/${auc.camera_id}`);
              if (camRes.ok) {
                const cam = await camRes.json();
                setCameraModel(cam.model || null);
                setCameraImage(cam.s3_image_url || null);
              }
            }
          }
        } catch (_) {}

        setState('ready');
      } catch (err) {
        setErrorMsg(err.message || 'Something went wrong.');
        setState('error');
      }
    }
    load();
  }, [auctionId]);

  async function handlePay() {
    if (!order) return;
    setState('paying');
    try {
      const res = await fetch(PROCESS_PAYMENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.order_id,
          amount: order.amount,
          description: `Digicam Auction #${auctionId}`,
        }),
      });
      if (!res.ok) throw new Error('Could not create payment session.');
      const data = await res.json();
      window.location.href = data.checkout_url;
    } catch (err) {
      setErrorMsg(err.message || 'Payment failed to start.');
      setState('error');
    }
  }

  function fmtSGD(amount) {
    return 'SGD ' + Number(amount || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <>
      <style>{`
        .won-shell { max-width: 560px; margin: 0 auto; padding: 120px 24px 80px; text-align: center; }
        .won-trophy { font-size: 56px; margin-bottom: 24px; }
        .won-overline { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; color: #30d158; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 12px; }
        .won-heading { font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: clamp(40px, 7vw, 64px); text-transform: uppercase; line-height: 0.95; margin-bottom: 16px; }
        .won-sub { color: var(--muted); font-size: 15px; line-height: 1.7; margin-bottom: 32px; }
        .won-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; margin-bottom: 28px; text-align: left; }
        .won-card-image { width: 100%; aspect-ratio: 16/7; background: linear-gradient(135deg, #111, #181818); display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .won-card-image img { width: 100%; height: 100%; object-fit: cover; }
        .won-card-image-placeholder { font-size: 56px; opacity: .2; }
        .won-card-body { padding: 20px 24px; }
        .won-card-model { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-size: 22px; text-transform: uppercase; margin-bottom: 16px; }
        .won-card-rows { display: grid; gap: 10px; }
        .won-card-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
        .won-card-row span { color: var(--muted); }
        .won-card-row strong { color: var(--text); font-weight: 500; }
        .won-amount-row strong { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 900; color: #30d158; }
        .won-pay-btn { width: 100%; padding: 16px 20px; font-size: 16px; font-weight: 700; border-radius: 50px; background: #30d158; color: #000; border: none; cursor: pointer; letter-spacing: .3px; transition: opacity .2s; margin-bottom: 12px; }
        .won-pay-btn:hover { opacity: .88; }
        .won-pay-btn:disabled { background: #262626; color: var(--muted); cursor: not-allowed; opacity: 1; }
        .won-telegram-note { font-size: 13px; color: var(--muted); margin-bottom: 28px; }
        .won-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .won-status-badge { display: inline-block; padding: 4px 14px; border-radius: 50px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .won-status-pending { background: rgba(255,159,10,.12); color: #ff9f0a; border: 1px solid rgba(255,159,10,.3); }
        .won-status-confirmed { background: rgba(48,209,88,.12); color: #30d158; border: 1px solid rgba(48,209,88,.3); }
        .loading-state { text-align: center; padding: 140px 24px; color: var(--muted); font-size: 16px; }
        .error-state { text-align: center; padding: 140px 24px; }
        .error-heading { font-family: 'Barlow Condensed', sans-serif; font-size: 34px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; }
        .error-sub { color: var(--muted); margin-bottom: 28px; font-size: 14px; }
      `}</style>

      {state === 'loading' && <div className="loading-state">Loading your order…</div>}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-heading">Something went wrong</div>
          <p className="error-sub">{errorMsg}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/auctions" className="btn-primary-sm">Back to Auctions</Link>
            <Link to="/" className="btn-ghost-sm">Go Home</Link>
          </div>
        </div>
      )}

      {(state === 'ready' || state === 'paying') && order && (
        <div className="won-shell">
          <div className="won-trophy">🏆</div>
          <div className="won-overline">Congratulations</div>
          <h1 className="won-heading">You won!</h1>
          <p className="won-sub">
            {user?.name ? `Well done, ${user.name}. ` : ''}
            Complete your payment below to secure the camera.
          </p>

          <div className="won-card">
            <div className="won-card-image">
              {cameraImage
                ? <img src={cameraImage} alt={cameraModel || 'Camera'} />
                : <span className="won-card-image-placeholder">📷</span>
              }
            </div>
            <div className="won-card-body">
              <div className="won-card-model">{cameraModel || `Auction #${auctionId}`}</div>
              <div className="won-card-rows">
                <div className="won-card-row">
                  <span>Order ID</span>
                  <strong>#{order.order_id}</strong>
                </div>
                <div className="won-card-row">
                  <span>Auction</span>
                  <strong>#{order.auction_id}</strong>
                </div>
                <div className="won-card-row">
                  <span>Status</span>
                  <strong>
                    <span className={`won-status-badge ${order.status === 'confirmed' ? 'won-status-confirmed' : 'won-status-pending'}`}>
                      {order.status}
                    </span>
                  </strong>
                </div>
                <div className="won-card-row won-amount-row" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
                  <span>Winning Bid</span>
                  <strong>{fmtSGD(order.amount)}</strong>
                </div>
              </div>
            </div>
          </div>

          {order.status === 'confirmed' ? (
            <>
              <p className="won-sub" style={{ color: '#30d158' }}>Payment already confirmed — you're all set!</p>
              <div className="won-actions">
                <Link to="/auctions" className="btn-primary-sm">Browse Auctions</Link>
                <Link to="/" className="btn-ghost-sm">Go Home</Link>
              </div>
            </>
          ) : (
            <>
              <button className="won-pay-btn" onClick={handlePay} disabled={state === 'paying'}>
                {state === 'paying' ? 'Redirecting to payment…' : 'Proceed to Payment →'}
              </button>
              <p className="won-telegram-note">A payment link was also sent to your Telegram.</p>
              <div className="won-actions">
                <Link to={`/auctions/${auctionId}`} className="btn-ghost-sm">Back to Auction</Link>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
