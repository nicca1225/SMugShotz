import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getUser, clearUser } from '../utils/auth.js';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setUser(getUser());
  }, [location]);

  function handleLogout() {
    clearUser();
    setUser(null);
    navigate('/');
  }

  function isActive(path) {
    return location.pathname === path ? 'nav-active' : '';
  }

  return (
    <nav>
      <Link to="/" className="nav-logo">SMug<span>Shotz</span></Link>
      <div className="nav-links">
        <Link to="/auctions" className={isActive('/auctions')}>Auctions</Link>
        <Link to="/create" className={isActive('/create')}>Create Auction</Link>
        <Link to="/profile" className={isActive('/profile')}>Profile</Link>
      </div>
      <div className="nav-actions">
        {user && user.user_id ? (
          <>
            <Link to="/profile" className="nav-user" title="View profile">
              <span className="nav-avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </span>
              <span className="nav-username">{user.name || 'Profile'}</span>
            </Link>
            <button className="btn-ghost" onClick={handleLogout}>Log Out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn-ghost">Sign In</Link>
            <Link to="/auctions" className="btn-primary">Get Started</Link>
          </>
        )}
      </div>
    </nav>
  );
}
