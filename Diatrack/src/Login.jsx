import React, { useState } from "react";
import "./Login.css";
import landingpic from "/picture/landingpic.jpg";
import logo from "../picture/logo.png"; 

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!role) {
      setError("Please select a role.");
      return;
    }
    setError("");
    await onLogin(email, password, role, rememberMe);
  };

  return (
    <div className="login-page"> {/* Wrapper for both sections */}

      {/* Form Container */}
      <div className="login-page-wrapper"> 
        <div className="login-form-section">
          <div className="dia-track-logo">
            <img src={logo} alt="DiaTrack Logo" />
            <span className="logo-text">
              <span className="title-blue">Dia</span>
              <span className="title-orange">Track</span>
            </span>
          </div>

          <h1 className="login-heading">Login to Your DiaTrack Account</h1>
          <p className="login-description">
            Please enter your account details to sign in to our platform.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="email">Email or ID</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              >
                <option value="">Select Role</option>
                <option value="admin">Admin</option>
                <option value="doctor">Doctor</option>
                <option value="secretary">Secretary</option>
              </select>
            </div>

            <div className="form-options-row">
              <a href="#" className="forgot-password">Forgot password?</a>
              <label htmlFor="rememberMe" className="remember-me">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember Me
              </label>
            </div>

            <p className="forgot-password-note">
              Please contact DiaTrack admin for account retrieval.
            </p>

            {error && <p className="error-message">{error}</p>}

            <button type="submit" className="login-btn">Login</button>
          </form>
        </div>
      </div>

      {/* Illustration Container - now separate */}
      <div className="illustration-section">
        <img src={landingpic} alt="Medical professionals and patient illustration" className="landingpic" />
      </div>

    </div>
  );
};

export default LoginPage;
