// App.jsx (updated with session persistence)
import React, { useState, useEffect } from "react";
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
  const [isLoading, setIsLoading] = useState(true);

  const goToLogin = () => setCurrentPage("login");
  const goToLanding = () => setCurrentPage("landing");

  // Session persistence - load session on app start
  useEffect(() => {
    const loadSession = () => {
      try {
        const savedUser = sessionStorage.getItem('diatrack_user');
        const savedRole = sessionStorage.getItem('diatrack_role');
        const savedPage = sessionStorage.getItem('diatrack_page');

        if (savedUser && savedRole && savedPage) {
          setUser(JSON.parse(savedUser));
          setRole(savedRole);
          setCurrentPage(savedPage);
          console.log('Session restored:', { role: savedRole, page: savedPage });
        }
      } catch (error) {
        console.error('Error loading session:', error);
        // Clear corrupted session data
        sessionStorage.removeItem('diatrack_user');
        sessionStorage.removeItem('diatrack_role');
        sessionStorage.removeItem('diatrack_page');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  // Save session whenever user, role, or page changes
  useEffect(() => {
    if (!isLoading) {
      if (user && role && currentPage !== 'landing' && currentPage !== 'login') {
        sessionStorage.setItem('diatrack_user', JSON.stringify(user));
        sessionStorage.setItem('diatrack_role', role);
        sessionStorage.setItem('diatrack_page', currentPage);
      } else if (currentPage === 'landing' || currentPage === 'login') {
        // Clear session when on landing or login page
        sessionStorage.removeItem('diatrack_user');
        sessionStorage.removeItem('diatrack_role');
        sessionStorage.removeItem('diatrack_page');
      }
    }
  }, [user, role, currentPage, isLoading]);

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
    // Clear session storage on logout
    sessionStorage.removeItem('diatrack_user');
    sessionStorage.removeItem('diatrack_role');
    sessionStorage.removeItem('diatrack_page');
    
    setUser(null);
    setRole("");
    setCurrentPage("landing");
  };

  // Show loading spinner while checking for existing session
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

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
        <AdminDashboard onLogout={handleLogout} user={user} />
      )}
      {currentPage === "secretary-dashboard" && (
        <SecretaryDashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;