import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, setUser } from '../utils/auth.js';

const API_URL = 'https://personal-vsev7crp.outsystemscloud.com/User/rest/User/user/';

export default function Login() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); // { name, user_id }
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getUser();
    if (u && u.user_id) navigate('/profile', { replace: true });
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSuccess(null);
    setError('');

    const trimmedUserId = String(userId).trim();
    if (!trimmedUserId) {
      setError('Please enter your user ID.');
      return;
    }

    if (!/^\d+$/.test(trimmedUserId)) {
      setError('User ID must be a number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(API_URL + encodeURIComponent(trimmedUserId));
      let data = {};
      try { data = await res.json(); } catch (_) {}

      const payload = data?.data ?? data;
      const user = Array.isArray(payload) ? payload[0] : payload;

      if (!res.ok || !user || !user.user_id) {
        setError('No account found with that user ID. Please try again or create a new account.');
        return;
      }

      const stored = {
        user_id: Number(user.user_id),
        name: user.name || user.Name || '',
        email: user.email || user.Email || '',
        telegram_handle: user.telegram_handle || user.TelegramHandle || '',
        chat_id: user.chat_id || user.ChatId || ''
      };

      setUser(stored);
      setSuccess({ name: stored.name || 'User', user_id: stored.user_id });

      setTimeout(() => {
        const redirect = new URLSearchParams(window.location.search).get('redirect');
        navigate(redirect || '/profile');
      }, 1200);
    } catch (err) {
      setError('Unable to sign in with that user ID right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        .page-shell { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:120px 24px 48px; }
        .login-card { width:100%; max-width:520px; background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:48px; }
        .login-title { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:clamp(38px,5vw,56px); text-transform:uppercase; line-height:0.95; margin-bottom:14px; }
        .login-sub { font-size:15px; color:var(--muted); font-weight:300; line-height:1.6; margin-bottom:36px; }
        .field-group { display:flex; flex-direction:column; gap:6px; margin-bottom:20px; }
        .field-label { font-size:12px; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:1px; }
        .field-input { background:#111; border:1px solid #2a2a2a; border-radius:10px; color:var(--text); padding:14px 16px; font-size:14px; width:100%; font-family:'Inter',sans-serif; }
        .field-input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(230,57,70,0.15); }
        .btn-submit { width:100%; background:var(--accent); color:var(--text); padding:18px; border-radius:50px; font-size:16px; font-weight:600; border:none; cursor:pointer; margin-top:10px; font-family:'Inter',sans-serif; transition:filter 0.2s, transform 0.2s; }
        .btn-submit:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px); }
        .btn-submit:disabled { opacity:0.65; cursor:not-allowed; }
        .status-card { margin-top:24px; border-radius:16px; padding:28px; border:1px solid var(--border); }
        .success-card { background:rgba(48,209,88,0.05); border-left:3px solid var(--success); }
        .error-card { background:rgba(255,68,68,0.05); border-left:3px solid var(--danger,#ff4444); }
        .status-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:24px; text-transform:uppercase; margin-bottom:10px; }
        .success-card .status-title { color:var(--success); }
        .error-card .status-title { color:var(--danger,#ff4444); }
        .status-text { font-size:14px; color:var(--muted); line-height:1.65; }
        .divider { text-align:center; margin:28px 0 0; font-size:14px; color:var(--muted); }
        .divider a { color:var(--accent); text-decoration:none; font-weight:500; }
        .divider a:hover { text-decoration:underline; }
        @media (max-width:768px) { .login-card { padding:30px 24px; } }
      `}</style>

      <main className="page-shell">
        <section className="login-card">
          <span className="overline">Welcome Back</span>
          <h1 className="login-title">Sign In</h1>
          <p className="login-sub">Enter your user ID from the OutSystems user database to continue.</p>

          {!success && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="field-group">
                <label className="field-label" htmlFor="userId">User ID</label>
                <input
                  className="field-input"
                  type="number"
                  id="userId"
                  placeholder="e.g. 28"
                  inputMode="numeric"
                  min="1"
                  required
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}

          {success && (
            <div className="status-card success-card">
              <div className="status-title">Welcome Back!</div>
              <p className="status-text">Signed in as user #{success.user_id}{success.name ? ` (${success.name})` : ''}. Redirecting…</p>
            </div>
          )}

          {error && (
            <div className="status-card error-card">
              <div className="status-title">Sign In Failed</div>
              <p className="status-text">{error}</p>
            </div>
          )}

          <p className="divider">Don't have an account? <Link to="/signup">Create one</Link></p>
        </section>
      </main>
    </>
  );
}
