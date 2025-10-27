import React, { useState } from 'react';
import './Header.css';
import logo from '../../picture/logo.png';
import supabase from '../supabaseClient';

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
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications for the current user
  const fetchNotifications = async () => {
    if (!user) {
      console.log("No user found");
      return;
    }

    // Determine user ID and type based on role
    let userId, userType;
    if (userRole === 'Secretary' && user.secretary_id) {
      userId = user.secretary_id;
      userType = 'secretary';
    } else if (userRole === 'Doctor' && user.doctor_id) {
      userId = user.doctor_id;
      userType = 'doctor';
    } else if (user.admin_id) {
      userId = user.admin_id;
      userType = 'admin';
    } else {
      console.log("Could not determine user ID and type. User:", user, "Role:", userRole);
      return;
    }
    
    console.log("Fetching notifications for:", { userId, userType, userRole });
    
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("user_role", userType)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching notifications:", error.message);
      setNotifications([]);
      setUnreadCount(0);
    } else {
      console.log("Fetched notifications:", data);
      setNotifications(data || []);
      // Count unread notifications
      const unread = (data || []).filter(notif => !notif.is_read).length;
      setUnreadCount(unread);
    }
  };

  // Handle opening notifications popup
  const handleOpenNotifications = async () => {
    setLoadingNotifications(true);
    await fetchNotifications();
    setLoadingNotifications(false);
    setShowUsersPopup(true);
  };

  // Mark notification as read
  const markNotificationAsRead = async (notificationId) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("notification_id", notificationId);

    if (error) {
      console.error("Error marking notification as read:", error.message);
    } else {
      // Update local state
      setNotifications(notifications.map(notif => 
        notif.notification_id === notificationId 
          ? { ...notif, is_read: true } 
          : notif
      ));
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notif) => {
    // Mark as read if unread
    if (!notif.is_read) {
      await markNotificationAsRead(notif.notification_id);
    }

    // Handle navigation based on notification type
    if (notif.type === 'appointment' || notif.type === 'Appointment') {
      setActivePage('dashboard');
      setShowUsersPopup(false);
    } else if (notif.type === 'patient' || notif.type === 'Patient') {
      setActivePage('patient-list');
      setShowUsersPopup(false);
    } else if (notif.type === 'report' || notif.type === 'Report') {
      setActivePage('reports');
      setShowUsersPopup(false);
    } else {
      // For other types, just go to dashboard
      setActivePage('dashboard');
      setShowUsersPopup(false);
    }
  };
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
          <button className="notification-icon" onClick={handleOpenNotifications}>
            <img src="../picture/notif.svg" alt="Notifications" className="header-icon-img" />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
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
          <div className="popup-overlay" onClick={() => setShowUsersPopup(false)}>
            <div className="popup-content notifications-popup" onClick={(e) => e.stopPropagation()}>
              <div className="popup-header">
                <h3>Notifications</h3>
                <button className="close-btn" onClick={() => setShowUsersPopup(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="notifications-list">
                {loadingNotifications ? (
                  <div className="no-notifications">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading notifications...</p>
                  </div>
                ) : notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div
                      key={notif.notification_id}
                      className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className="notification-title">
                        <strong>{notif.title}</strong>
                        {!notif.is_read && <span className="unread-badge">New</span>}
                      </div>
                      <div className="notification-message">{notif.message}</div>
                      <div className="notification-time">
                        {new Date(notif.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-notifications">
                    <i className="fas fa-bell-slash"></i>
                    <p>No notifications at this time</p>
                  </div>
                )}
              </div>
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
