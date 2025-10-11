import React from 'react';
import './Header.css';
import logo from '../../picture/logo.png';

const Header = ({ 
  user, 
  activePage, 
  setActivePage, 
  onLogout, 
  showUsersPopup, 
  setShowUsersPopup, 
  showMessagePopup, 
  setShowMessagePopup,
  userRole = 'Secretary' // Default role, can be overridden
}) => {
  return (
    <>
      <div className="top-navbar">
        <h1 className="app-title">
          <img src={logo} alt="DiaTrack Logo" className="app-logo" />
          <img src="../picture/diatracktext.png" alt="diatracktext" className="diatracktext" />
        </h1>
        <ul className="navbar-menu">
          <li className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>Dashboard</li>
          <li className={activePage === "patient-list" ? "active" : ""} onClick={() => setActivePage("patient-list")}>Patient List</li>
          <li className={activePage === "appointments" ? "active" : ""} onClick={() => setActivePage("appointments")}>Appointments</li>
          <li className={activePage === "reports" ? "active" : ""} onClick={() => setActivePage("reports")}>Reports</li>
        </ul>
        <div className="navbar-right">
          <button className="notification-icon" onClick={() => setShowUsersPopup(true)}>
            <img src="../picture/notif.svg" alt="Notifications" className="header-icon-img" />
          </button>
          <div className="user-profile">
            <img 
              src={userRole === 'Secretary' ? "../picture/secretary.png" : "https://placehold.co/40x40/aabbcc/ffffff?text=User"} 
              alt="User Avatar" 
              className="user-avatar" 
              onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}
            />
            <div className="user-info">
              <span className="user-name">{user ? `${user.first_name} ${user.last_name}` : 'Maria Batumbakal'}</span>
              <span className="user-role">{userRole}</span>
            </div>
            <button className="signout-button4" onClick={() => {
              if (window.confirm("Are you sure you want to sign out?")) onLogout();
            }}>
              <img src="../picture/signout.svg" alt="Sign Out" className="header-icon-img" />
            </button>
          </div>
        </div>
        
        {/* Pop-up for Notification Icon */}
        {showUsersPopup && (
          <div className="popup-overlay">
            <div className="popup-content">
              <h3>Notifications</h3>
              <p>You have new notifications!</p>
              <button onClick={() => setShowUsersPopup(false)}>Close</button>
            </div>
          </div>
        )}

        {/* Pop-up for Message Icon */}
        {showMessagePopup && (
          <div className="popup-overlay">
            <div className="popup-content">
              <h3>Messages</h3>
              <p>You have new messages!</p>
              <button onClick={() => setShowMessagePopup(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Header;
