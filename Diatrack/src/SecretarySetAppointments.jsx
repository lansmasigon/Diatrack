import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./SecretaryDashboard.css";
import logo from "../picture/logo.png"; // Import the logo image

const SecretarySetAppointments = () => {
  return (
    <div className="dashboard-container">
      <div className="top-navbar">
        <h1 className="app-title">
          <img src={logo} alt="DiaTrack Logo" className="app-logo" />
          <span style={{ color: 'var(--primary-blue)' }}>Dia</span>
          <span style={{ color: 'var(--secondary-orange)' }}>Track</span>
        </h1>
        <ul className="navbar-menu">
          <li className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>Dashboard</li>
          <li className={activePage === "patient-list" ? "active" : ""} onClick={() => setActivePage("patient-list")}>Patient List</li>
          <li className={activePage === "appointments" ? "active" : ""} onClick={() => setActivePage("appointments")}>Appointments</li>
          <li className={activePage === "reports" ? "active" : ""} onClick={() => setActivePage("reports")}>Reports</li>
        </ul>
        <div className="navbar-right">
          <div className="user-profile">
            <img src="https://placehold.co/40x40/aabbcc/ffffff?text=User" alt="User Avatar" className="user-avatar" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}/>
            <div className="user-info">
              <span className="user-name">{user ? `${user.first_name} ${user.last_name}` : 'Maria Batumbakal'}</span>
              <span className="user-role">Secretary</span>
            </div>
          </div>
          <div className="header-icons">
            <i className="fas fa-bell"></i>
            <i className="fas fa-envelope"></i>
            <button className="signout-button" onClick={() => {
              if (window.confirm("Are you sure you want to sign out?")) onLogout();
            }}><i className="fas fa-sign-out-alt"></i></button>
          </div>
        </div>
      </div>
    </div>
  );
};