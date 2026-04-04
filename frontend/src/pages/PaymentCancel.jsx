import { useSearchParams, Link } from 'react-router-dom';

export default function PaymentCancel() {
  const [params] = useSearchParams();
  const orderId = params.get('order_id');

  return (
    <>
      <style>{`
        .status-shell {
          max-width: 520px;
          margin: 0 auto;
          padding: 140px 24px 80px;
          text-align: center;
        }
        .status-icon {
          width: 72px; height: 72px;
          border-radius: 50%;
          background: rgba(230, 57, 70, 0.12);
          border: 1px solid rgba(230, 57, 70, 0.3);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 28px;
          font-size: 32px;
        }
        .status-overline {
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .status-heading {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900;
          font-size: clamp(36px, 6vw, 56px);
          text-transform: uppercase;
          line-height: 0.95;
          margin-bottom: 16px;
        }
        .status-body {
          color: var(--muted);
          font-size: 15px;
          line-height: 1.7;
          margin-bottom: 8px;
        }
        .status-order {
          display: inline-block;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 50px;
          padding: 8px 20px;
          font-size: 13px;
          color: var(--muted);
          margin: 20px 0 36px;
        }
        .status-order strong { color: var(--text); }
        .status-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      `}</style>

      <div className="status-shell">
        <div className="status-icon">✕</div>
        <div className="status-overline">Payment cancelled</div>
        <h1 className="status-heading">Order pending</h1>
        <p className="status-body">You cancelled the payment. Your order is still pending.</p>
        <p className="status-body">Use the link in your Telegram message to try again.</p>
        {orderId && (
          <div className="status-order">Order <strong>#{orderId}</strong></div>
        )}
        <div className="status-actions">
          <Link to="/auctions" className="btn-primary-sm">Browse Auctions</Link>
          <Link to="/" className="btn-ghost-sm">Go Home</Link>
        </div>
      </div>
    </>
  );
}
