import React, { useState } from "react";
import supabase from "./supabaseClient"; // Import Supabase client
import "./Login.css"; // Ensure the path is correct
import landingpic from "../picture/landingpic.png"; // Import your image

const LoginPage = ({ onLogin, goToSignUp }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notification, setNotification] = useState(""); // Notification state

  const handleLogin = async (e) => {
    e.preventDefault();

    // Trim values to remove extra spaces
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      // Querying Supabase for the user with matching email and password
      const { data, error } = await supabase
        .from("doctors")
        .select("*")
        .eq("email", trimmedEmail) // Match email
        .eq("password", trimmedPassword)   // Match password
        .single(); // Ensure only one user is returned

      if (error) {
        throw error;
      }

      if (data) {
        onLogin(data); // Pass user data to parent for further processing
        setNotification("Login successful!");
        setTimeout(() => setNotification(""), 3000); // Clear notification after 3 seconds
      } else {
        setError("Invalid credentials.");
        setNotification(""); // Clear previous notifications
      }
    } catch (err) {
      setError("Login failed: ");
      setNotification(""); // Clear previous notifications
    }
  };

  return (
    <div className="login-page">
      <h1 className="login-title">
        <span className="title-blue">Dia</span>
        <span className="title-orange">Track</span>
      </h1>
      <div className="login-form-container">
        <h2>Welcome Back to Diatrack</h2> {/* Added the h2 */}
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <input
              type="email" // Changed input type to email
              id="email" // Changed id to email
              value={email}
              onChange={(e) => setEmail(e.target.value)} // Changed setEmail
              placeholder="Email" // Changed placeholder
              required
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="login-btn">Login</button>
        </form>
        <p className="signup-link">
          New here? <span onClick={goToSignUp}>Create a new account</span>
        </p>
      </div>

      {/* Notification */}
      {notification && (
        <div className="notification">
          {notification}
        </div>
      )}

      {/* Image at the bottom */}
      <div className="landingpic-container">
        <img src={landingpic} alt="Landing" className="landingpic"/>
      </div>
    </div>
  );
};

export default LoginPage;