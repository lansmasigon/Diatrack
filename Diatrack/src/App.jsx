// App.jsx (updated with fixed login logic)
import React, { useState } from "react";
import LandingPage from "./landingpage";
import LoginPage from "./Login";
import Dashboard from "./Dashboard";
import AdminDashboard from "./AdminDashboard";
import SecretaryDashboard from "./SecretaryDashboard";
import supabase from "./supabaseClient";
import "./index.css";

const App = () => {
  const [currentPage, setCurrentPage] = useState("landing");
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");

  const goToLogin = () => setCurrentPage("login");
  const goToLanding = () => setCurrentPage("landing");

  const handleLogin = async (email, password, role) => {
    let table = "";
    let idField = "";
    
    // Set table and ID field based on role
    if (role === "admin") {
      table = "admins";
      idField = "admin_id";
    } else if (role === "doctor") {
      table = "doctors";
      idField = "doctor_id";
    } else if (role === "secretary") {
      table = "secretaries";
      idField = "secretary_id";
    } else {
      alert("Invalid role selected");
      return;
    }

    try {
      // Fetch user data with explicit ID field selection
      const { data, error } = await supabase
        .from(table)
        .select(`${idField}, first_name, last_name, email`) // Include relevant fields
        .eq("email", email)
        .eq("password", password)
        .single();

      if (error || !data) {
        console.error("Login error:", error);
        alert("Login failed: Check credentials");
        return;
      }

      // Verify that the ID field exists in the returned data
      if (!data[idField]) {
        console.error(`Missing ${idField} in login response:`, data);
        alert("Login failed: User ID not found");
        return;
      }

      console.log(`Login successful for ${role}:`, data); // Debug log

      setUser(data);
      setRole(role);
      
      // Navigate to appropriate dashboard
      if (role === "admin") {
        setCurrentPage("admin-dashboard");
      } else if (role === "doctor") {
        setCurrentPage("doctor-dashboard");
      } else if (role === "secretary") {
        setCurrentPage("secretary-dashboard");
      }
    } catch (err) {
      console.error("Login exception:", err);
      alert("Login failed: An error occurred");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setRole("");
    setCurrentPage("landing");
  };

  return (
    <div>
      {currentPage === "landing" && (
        <LandingPage goToLogin={goToLogin} />
      )}
      {currentPage === "login" && (
        <LoginPage onLogin={handleLogin} />
      )}
      {currentPage === "doctor-dashboard" && (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
      {currentPage === "admin-dashboard" && (
        <AdminDashboard onLogout={handleLogout} />
      )}
      {currentPage === "secretary-dashboard" && (
        <SecretaryDashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;