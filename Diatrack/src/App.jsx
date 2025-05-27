// App.jsx (updated)
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
    if (role === "admin") table = "admins";
    else if (role === "doctor") table = "doctors";
    else if (role === "secretary") table = "secretaries";
    else {
      alert("Invalid role selected");
      return;
    }

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (error || !data) {
      alert("Login failed: Check credentials");
    } else {
      setUser(data);
      setRole(role);
      if (role === "admin") setCurrentPage("admin-dashboard");
      else if (role === "doctor") setCurrentPage("doctor-dashboard");
      else if (role === "secretary") setCurrentPage("secretary-dashboard");
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
        <SecretaryDashboard onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;
