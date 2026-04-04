import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, setUser as storeUser } from '../utils/auth.js';

const USER_API = 'https://personal-vsev7crp.outsystemscloud.com/User/rest/User/user/';
const AUCTIONS_API = 'https://personal-vsev7crp.outsystemscloud.com/Auction/rest/Auction';
const BOT_USERNAME = 'Smugshotz_bot';

function timeRemaining(endTime) {
  const diff = new Date(endTime) - Date.now();
  if (diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${m}m left`;
}

function statusBadgeClass(status) {
  return { active: 'badge-active', failed: 'badge-failed', completed: 'badge-completed' }[status] ?? 'badge-completed';
}

export default function Profile() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [auctions, setAuctions] = useState([]);
  const [bids, setBids] = useState([]);

  // Edit form
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [formStatus, setFormStatus] = useState({ text: '', cls: '' });

  const fadeRefs = useRef([]);
  function addFade(el) {
    if (el && !fadeRefs.current.includes(el)) fadeRefs.current.push(el);
  }

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
  }, [loadingUser]);

  useEffect(() => {
    async function init() {
      const stored = getUser();
      if (!stored) { setLoadingUser(false); return; }

      let user = stored;
      try {
        const res = await fetch(`${USER_API}${stored.user_id}`);
        if (res.ok) {
          const json = await res.json();
          const apiUser = json?.data ?? json;
          user = { ...stored, ...apiUser };
          storeUser(user);
        }
      } catch (_) {}

      setCurrentUser(user);
      setEditName(user.name || '');
      setEditEmail(user.email || '');
      setEditTelegram(user.telegram_handle || '');

      // Fetch auctions and bids
      try {
        const res = await fetch(AUCTIONS_API);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.Out1 || []);
          setAuctions(list.filter(a => Number(a.seller_id) === Number(user.user_id)));
          setBids(list.filter(a => Number(a.highest_bidder_id) === Number(user.user_id)));
        }
      } catch (_) {}

      setLoadingUser(false);
    }
    init();
  }, []);

  async function handleEditSubmit(e) {
    e.preventDefault();
    const payload = {
      name: editName.trim(),
      email: editEmail.trim(),
      telegram_handle: editTelegram.trim()
    };

    try {
      const res = await fetch(USER_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.user_id, ...payload })
      });
      if (!res.ok) throw new Error('non-2xx');
      const updated = { ...currentUser, ...payload };
      storeUser(updated);
      setCurrentUser(updated);
      setFormStatus({ text: 'Changes saved.', cls: 'success' });
    } catch {
      const updated = { ...currentUser, ...payload };
      storeUser(updated);
      setCurrentUser(updated);
      setFormStatus({ text: 'Saved locally (API offline).', cls: 'warning' });
    }
    setTimeout(() => setFormStatus({ text: '', cls: '' }), 3000);
  }

  const handle = currentUser?.telegram_handle
    ? (currentUser.telegram_handle.startsWith('@') ? currentUser.telegram_handle : '@' + currentUser.telegram_handle)
    : null;
  const tgLinked = !!currentUser?.telegram_chat_id;

  return (
    <>
      <style>{`
        .page-header { padding-top:60px; background:linear-gradient(180deg,#0a0a0a 0%,var(--bg) 100%); border-bottom:1px solid var(--border); }
        .page-header-inner { max-width:960px; margin:0 auto; padding:48px 32px 36px; }
        .page-title { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:48px; color:var(--text); text-transform:uppercase; line-height:1; letter-spacing:-1px; }
        .profile-main { max-width:960px; margin:0 auto; padding:48px 32px 120px; display:flex; flex-direction:column; gap:32px; position:relative; z-index:1; }
        .profile-card { background:linear-gradient(160deg,#161616 0%,#111 100%); border:1px solid var(--border); border-top:2px solid var(--accent); border-radius:16px; padding:36px 40px; display:flex; align-items:center; gap:28px; position:relative; overflow:hidden; }
        .profile-card::before { content:''; position:absolute; top:0; left:20%; right:20%; height:1px; background:linear-gradient(90deg,transparent,rgba(230,57,70,0.6),transparent); filter:blur(1px); }
        .profile-avatar { width:72px; height:72px; border-radius:50%; background:linear-gradient(135deg,#f04555 0%,#e63946 50%,#c82333 100%); box-shadow:0 0 24px rgba(230,57,70,0.4),inset 0 1px 0 rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:32px; color:var(--text); flex-shrink:0; overflow:hidden; }
        .profile-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .profile-info { display:flex; flex-direction:column; gap:8px; }
        .profile-name-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .profile-name { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:28px; color:var(--text); text-transform:uppercase; letter-spacing:0.5px; line-height:1; }
        .profile-meta { font-family:'Inter',sans-serif; font-size:13px; color:var(--muted); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .meta-sep { color:#333; }
        .telegram-link { font-family:'Inter',sans-serif; font-size:13px; font-weight:500; color:#2dd4bf; text-decoration:none; letter-spacing:0.3px; display:inline-flex; align-items:center; gap:6px; transition:color 0.2s ease; width:fit-content; }
        .telegram-link::before { content:'↗'; font-size:11px; opacity:0.7; }
        .telegram-link:hover { color:#5eead4; }
        .profile-section { background:linear-gradient(160deg,#161616 0%,#111 100%); border:1px solid var(--border); border-radius:16px; padding:36px 40px; }
        .section-label { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px; color:var(--text); text-transform:uppercase; letter-spacing:1px; margin-bottom:28px; padding-bottom:16px; border-bottom:1px solid var(--border); }
        .edit-form { display:flex; flex-direction:column; gap:20px; }
        .form-row { display:grid; grid-template-columns:140px 1fr; align-items:center; gap:16px; }
        .form-label { font-family:'Inter',sans-serif; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:1px; }
        .form-input { font-family:'Inter',sans-serif; font-size:14px; color:var(--text); background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:8px; padding:10px 14px; outline:none; transition:border-color 0.2s ease,background 0.2s ease; width:100%; }
        .form-input:focus { border-color:rgba(230,57,70,0.55); background:rgba(255,255,255,0.06); }
        .form-input::placeholder { color:#3a3a3a; }
        .form-actions { display:flex; align-items:center; gap:16px; padding-top:4px; padding-left:calc(140px + 16px); }
        .form-status { font-family:'Inter',sans-serif; font-size:13px; font-weight:500; }
        .form-status.success { color:#4ade80; }
        .form-status.warning { color:#facc15; }
        .items-list { display:flex; flex-direction:column; gap:1px; }
        .list-item { display:flex; align-items:center; justify-content:space-between; padding:18px 20px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:10px; gap:16px; transition:background 0.2s ease,border-color 0.2s ease; margin-bottom:8px; }
        .list-item:hover { background:rgba(255,255,255,0.04); border-color:#333; }
        .list-item:last-child { margin-bottom:0; }
        .list-item-info { display:flex; flex-direction:column; gap:4px; }
        .list-item-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:17px; color:var(--text); text-transform:uppercase; letter-spacing:0.5px; }
        .list-item-meta { font-family:'Inter',sans-serif; font-size:12px; color:var(--muted); }
        .list-item-right { display:flex; align-items:center; gap:14px; flex-shrink:0; }
        .list-item-bid { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px; color:var(--text); }
        .status-badge { font-family:'Inter',sans-serif; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; padding:4px 10px; border-radius:50px; }
        .badge-active { background:rgba(74,222,128,0.12); color:#4ade80; border:1px solid rgba(74,222,128,0.3); }
        .badge-failed { background:rgba(230,57,70,0.12); color:#f87171; border:1px solid rgba(230,57,70,0.3); }
        .badge-completed { background:rgba(110,110,115,0.12); color:var(--muted); border:1px solid rgba(110,110,115,0.3); }
        .empty-state { font-family:'Inter',sans-serif; font-size:14px; color:var(--muted); text-align:center; padding:32px 0; }
        .btn-save { font-family:'Inter',sans-serif; font-size:13px; font-weight:700; color:var(--text); background:linear-gradient(135deg,#f04555 0%,#e63946 50%,#c82333 100%); border:none; border-radius:50px; padding:8px 22px; cursor:pointer; letter-spacing:0.3px; box-shadow:0 2px 14px rgba(230,57,70,0.35); display:inline-flex; align-items:center; }
        .btn-connect { display:inline-flex; align-items:center; font-family:'Inter',sans-serif; font-size:12px; font-weight:500; color:rgba(255,255,255,0.8); background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.14); border-radius:50px; padding:6px 16px; cursor:pointer; text-decoration:none; }
        @media (max-width:768px) {
          .page-header-inner { padding:40px 20px 28px; }
          .profile-main { padding:32px 20px 80px; }
          .profile-card { flex-direction:column; align-items:flex-start; padding:28px 24px; }
          .profile-section { padding:28px 24px; }
          .form-row { grid-template-columns:1fr; gap:8px; }
          .form-actions { padding-left:0; }
          .list-item { flex-direction:column; align-items:flex-start; }
          .list-item-right { width:100%; justify-content:space-between; }
        }
      `}</style>

      <div className="page-header">
        <div className="page-header-inner">
          <span className="overline">Account</span>
          <h1 className="page-title">Your Profile</h1>
        </div>
      </div>

      <main className="profile-main">
        {!loadingUser && !currentUser && (
          <section className="profile-card fade-up" ref={addFade}>
            <div className="profile-avatar">?</div>
            <div className="profile-info">
              <div className="profile-name-row"><h2 className="profile-name">No account found</h2></div>
              <div className="profile-meta">
                <Link to="/login" style={{ color: 'var(--accent)' }}>Sign in →</Link>
              </div>
            </div>
          </section>
        )}

        {currentUser && (
          <>
            {/* PROFILE CARD */}
            <section className="profile-card fade-up" ref={addFade}>
              <div className="profile-avatar">
                {currentUser.telegram_photo_url ? (
                  <img
                    src={currentUser.telegram_photo_url}
                    alt="Profile photo"
                    onError={e => { e.target.parentElement.textContent = (currentUser.name || '?').charAt(0).toUpperCase(); }}
                  />
                ) : (
                  (currentUser.name || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className="profile-info">
                <div className="profile-name-row">
                  <h2 className="profile-name">{currentUser.name}</h2>
                </div>
                <div className="profile-meta">
                  <span>{currentUser.email}</span>
                  <span className="meta-sep">·</span>
                  <span>Member since {new Date(currentUser.created_at).toLocaleDateString('en-SG', { year: 'numeric', month: 'long' })}</span>
                </div>
                {handle && (
                  <a
                    className="telegram-link"
                    href={`https://t.me/${handle.slice(1)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: tgLinked ? '#2dd4bf' : '#facc15' }}
                  >
                    {handle + (tgLinked ? ' ✓ Linked' : ' — not linked')}
                  </a>
                )}
                {!tgLinked && currentUser.user_id && (
                  <a
                    className="btn-connect"
                    href={`https://t.me/${BOT_USERNAME}?start=USER_${currentUser.user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginTop: '8px', width: 'fit-content' }}
                  >
                    Connect Telegram
                  </a>
                )}
              </div>
            </section>

            {/* EDIT PROFILE */}
            <section className="profile-section fade-up" ref={addFade}>
              <h3 className="section-label">Edit Profile</h3>
              <form className="edit-form" onSubmit={handleEditSubmit}>
                <div className="form-row">
                  <label className="form-label" htmlFor="editName">Name</label>
                  <input className="form-input" id="editName" type="text" placeholder="Your name" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="form-row">
                  <label className="form-label" htmlFor="editEmail">Email</label>
                  <input className="form-input" id="editEmail" type="email" placeholder="you@example.com" required value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                </div>
                <div className="form-row">
                  <label className="form-label" htmlFor="editTelegram">Telegram</label>
                  <input className="form-input" id="editTelegram" type="text" placeholder="@handle" value={editTelegram} onChange={e => setEditTelegram(e.target.value)} />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-save">Save Changes</button>
                  {formStatus.text && <span className={`form-status ${formStatus.cls}`}>{formStatus.text}</span>}
                </div>
              </form>
            </section>

            {/* MY AUCTIONS */}
            {auctions.length > 0 && (
              <section className="profile-section fade-up" ref={addFade}>
                <h3 className="section-label">My Auctions</h3>
                <div className="items-list">
                  {auctions.map((a, i) => {
                    const model = a.camera_model || `Camera #${a.camera_id || a.auction_id}`;
                    const bid = a.current_highest_bid ?? a.current_bid ?? 0;
                    const status = (a.status || 'active').toLowerCase();
                    return (
                      <div key={i} className="list-item">
                        <div className="list-item-info">
                          <div className="list-item-title">{model}</div>
                          <div className="list-item-meta">{timeRemaining(a.end_time)}</div>
                        </div>
                        <div className="list-item-right">
                          <div className="list-item-bid">SGD {Number(bid).toLocaleString()}</div>
                          <span className={`status-badge ${statusBadgeClass(status)}`}>{status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* MY BIDS */}
            {bids.length > 0 && (
              <section className="profile-section fade-up" ref={addFade}>
                <h3 className="section-label">My Bids</h3>
                <div className="items-list">
                  {bids.map((b, i) => {
                    const model = b.camera_model || `Camera #${b.camera_id || b.auction_id}`;
                    const highest = b.current_highest_bid ?? b.current_bid ?? 0;
                    const isWinning = currentUser && Number(b.highest_bidder_id) === Number(currentUser.user_id);
                    return (
                      <div key={i} className="list-item">
                        <div className="list-item-info">
                          <div className="list-item-title">{model}</div>
                          <div className="list-item-meta">Highest bid: SGD {Number(highest).toLocaleString()} · {timeRemaining(b.end_time)}</div>
                        </div>
                        <div className="list-item-right">
                          <div className="list-item-bid">SGD {Number(highest).toLocaleString()}</div>
                          <span className={`status-badge ${isWinning ? 'badge-active' : 'badge-failed'}`}>{isWinning ? 'Winning' : 'Outbid'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Empty state panels */}
            {auctions.length === 0 && (
              <section className="profile-section fade-up" ref={addFade}>
                <h3 className="section-label">My Auctions</h3>
                <p className="empty-state">No auctions yet. <Link to="/create" style={{ color: 'var(--accent)' }}>List a camera →</Link></p>
              </section>
            )}
            {bids.length === 0 && (
              <section className="profile-section fade-up" ref={addFade}>
                <h3 className="section-label">My Bids</h3>
                <p className="empty-state">No bids yet. <Link to="/auctions" style={{ color: 'var(--accent)' }}>Browse auctions →</Link></p>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
