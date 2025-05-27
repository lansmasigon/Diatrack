import React, { useState } from "react";
import LandingPage from "./landingpage";
import LoginPage from "./Login";
import SignUpPage from "./SignUp";
import Dashboard from "./Dashboard"; // Import Dashboard component
import supabase from "./supabaseClient"; // Import Supabase client
import "./index.css";

const App = () => {
  const [currentPage, setCurrentPage] = useState("landing");
  const [user, setUser] = useState(null); // Store logged-in user

  const goToLogin = () => setCurrentPage("login");
  const goToSignUp = () => setCurrentPage("signup");
  const goToLanding = () => setCurrentPage("landing");
  const goToDashboard = () => setCurrentPage("dashboard");

  // Handle login
  const handleLogin = async (userData) => {
    console.log("Logged in:", userData);
    setUser(userData); // Store user data after login
    goToDashboard(); // Navigate to dashboard after successful login
  };

  // Handle sign-up
  const handleSignUp = (userData) => {
    console.log("Signed up:", userData);
    setUser(userData); // Store user data after sign-up
    goToDashboard(); // Navigate to dashboard after successful sign-up
  };

  // Handle logout
  const handleLogout = () => {
    setUser(null); // Clear user data
    goToLanding(); // Go back to the landing page
  };

  return (
    <div>
      {currentPage === "landing" && (
        <LandingPage goToLogin={goToLogin} goToSignUp={goToSignUp} />
      )}
      {currentPage === "login" && <LoginPage onLogin={handleLogin} goToSignUp={goToSignUp} />}
      {currentPage === "signup" && <SignUpPage onSignUp={handleSignUp} goToLogin={goToLogin} />}
      {currentPage === "dashboard" && <Dashboard user={user} onLogout={handleLogout} />}
    </div>
  );
};

export default App;
