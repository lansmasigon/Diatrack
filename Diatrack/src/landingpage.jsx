import React from "react";
import logo from "../picture/logo.png"; // Adjust the path based on where you store the image
import "./index.css"; // Import the CSS file

const LandingPage = ({ goToLogin, goToSignUp }) => {
  return (
    <div className="landing-page-container">
      <div className="landing-header">
        {/* Logo Image */}
        <div className="logo">
          <img src={logo} alt="DIATRACK Logo" className="logo-image" />
        </div>
        <div className="title-container">
          <div className="title-text">
            <h1>
              <span className="title-blue">Dia</span>
              <span className="title-orange">Track</span>
            </h1>
            <p className="subtitle">A Holistic Diabetes Care Management System</p>
            <p className="subtitle">Integrating Personalized Monitoring, Risk Management</p>
            <p className="subtitle">and Long-Term Health Support</p>
          </div>
          <div className="buttons">
            <button className="login-button" onClick={goToLogin}>Login</button>
            <button className="signup-button" onClick={goToSignUp}>SignUp</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;