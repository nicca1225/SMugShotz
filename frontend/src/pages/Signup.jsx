import { useState } from 'react';
import { Link } from 'react-router-dom';
import { setUser } from '../utils/auth.js';

const API_URL = 'https://personal-vsev7crp.outsystemscloud.com/User/rest/User/user/';
const BOT_USERNAME = 'Smugshotz_bot';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); // { userId, deepLink }
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(null);

    const trimName = name.trim();
    const trimEmail = email.trim();
    const trimTelegram = telegramHandle.trim();

    if (!trimName || !trimEmail) {
      setError('Please fill in your name and email.');
      return;
    }

    const payload = {
      name: trimName,
      email: trimEmail,
      telegram_handle: trimTelegram,
      telegram_chat_id: '',
      role: 'seller'
    };

    setSubmitting(true);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data = {};
      try { data = await response.json(); } catch (_) {}

      if (response.ok) {
        const userId = data?.data?.user_id;
        if (!userId) throw new Error('User was created, but no user_id was returned.');

        const user = {
          user_id: Number(userId),
          name: trimName,
          email: trimEmail,
          telegram_handle: trimTelegram
        };
        setUser(user);

        const deepLink = `https://t.me/${BOT_USERNAME}?start=USER_${userId}`;
        setSuccess({ userId, deepLink });
      } else {
        setError(data?.error || data?.message || `Server returned status ${response.status}.`);
      }
    } catch (err) {
      setError(err.message || 'Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        .page-shell { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:120px 24px 48px; }
        .signup-card { width:100%; max-width:760px; background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:48px; }
        .signup-title { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:clamp(38px,5vw,56px); text-transform:uppercase; line-height:0.95; margin-bottom:14px; }
        .signup-sub { font-size:15px; color:var(--muted); font-weight:300; line-height:1.6; margin-bottom:36px; max-width:520px; }
        .field-group { display:flex; flex-direction:column; gap:6px; margin-bottom:20px; }
        .field-label { font-size:12px; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:1px; }
        .field-input { background:#111; border:1px solid #2a2a2a; border-radius:10px; color:var(--text); padding:14px 16px; font-size:14px; width:100%; }
        .field-input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(230,57,70,0.15); }
        .btn-submit { width:100%; background:var(--accent); color:var(--text); padding:18px; border-radius:50px; font-size:16px; font-weight:600; border:none; cursor:pointer; margin-top:10px; }
        .btn-submit:disabled { opacity:0.65; cursor:not-allowed; }
        .status-card { display:none; margin-top:24px; border-radius:16px; padding:28px; border:1px solid var(--border); }
        .status-card.visible { display:block; }
        .success-card { background:rgba(48,209,88,0.05); border-left:3px solid var(--success); }
        .error-card { background:rgba(255,68,68,0.05); border-left:3px solid #ff4444; }
        .status-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:24px; text-transform:uppercase; margin-bottom:10px; }
        .success-card .status-title { color:var(--success); }
        .error-card .status-title { color:#ff4444; }
        .status-text { font-size:14px; color:var(--muted); line-height:1.65; margin-bottom:10px; }
        .user-id-box { margin:16px 0 22px; background:#111; border:1px solid #2a2a2a; border-radius:12px; padding:14px 16px; }
        .user-id-label { display:block; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px; }
        .user-id-value { font-family:'Barlow Condensed',sans-serif; font-size:28px; font-weight:700; color:var(--text); }
        .action-row { display:flex; gap:12px; flex-wrap:wrap; }
        .btn-telegram { display:inline-flex; align-items:center; justify-content:center; background:var(--accent); color:var(--text); padding:14px 24px; border-radius:50px; font-size:15px; font-weight:600; text-decoration:none; }
        .btn-secondary-link { display:inline-flex; align-items:center; justify-content:center; background:transparent; color:var(--text); padding:14px 24px; border-radius:50px; font-size:15px; font-weight:500; text-decoration:none; border:1px solid var(--border); }
        @media (max-width:768px) { .signup-card { padding:30px 24px; } }
      `}</style>

      <main className="page-shell">
        <section className="signup-card">
          <span className="overline">Seller</span>
          <h1 className="signup-title">Create Seller Account</h1>
          <p className="signup-sub">
            Create your account first, then connect Telegram to link your notifications and start creating or bidding on auctions.
          </p>

          {!success && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="field-group">
                <label className="field-label" htmlFor="name">Name</label>
                <input className="field-input" type="text" id="name" placeholder="e.g. John Tan" required value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="email">Email</label>
                <input className="field-input" type="email" id="email" placeholder="e.g. john@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="telegram">Telegram Username</label>
                <input className="field-input" type="text" id="telegram" placeholder="@optional" value={telegramHandle} onChange={e => setTelegramHandle(e.target.value)} />
              </div>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          )}

          {success && (
            <div className="status-card success-card visible">
              <div className="status-title">Account Created</div>
              <p className="status-text">
                Your account was created successfully. Connect Telegram, then head to the auction pages.
              </p>
              <div className="user-id-box">
                <span className="user-id-label">Your User ID</span>
                <div className="user-id-value">{success.userId}</div>
              </div>
              <div className="action-row">
                <a className="btn-telegram" href={success.deepLink} target="_blank" rel="noopener noreferrer">
                  Connect Telegram
                </a>
                <Link to="/create" className="btn-secondary-link">Create Auction</Link>
              </div>
            </div>
          )}

          {error && (
            <div className="status-card error-card visible">
              <div className="status-title">Signup Failed</div>
              <p className="status-text">{error}</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
