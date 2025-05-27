// SecretaryDashboard.jsx
import React, { useState } from "react";
import supabase from "./supabaseClient";

const SecretaryDashboard = ({ onLogout }) => {
  const [patientForm, setPatientForm] = useState({ firstName: "", lastName: "", email: "", password: "", dateOfBirth: "", contactInfo: "" });
  const [message, setMessage] = useState("");

  const handleInputChange = (field, value) => {
    setPatientForm((prev) => ({ ...prev, [field]: value }));
  };

  const createPatient = async () => {
    const { error } = await supabase.from("patients").insert({
      first_name: patientForm.firstName,
      last_name: patientForm.lastName,
      email: patientForm.email,
      password: patientForm.password,
      date_of_birth: patientForm.dateOfBirth,
      contact_info: patientForm.contactInfo,
    });
    if (error) setMessage(`Error creating patient: ${error.message}`);
    else setMessage(`Patient ${patientForm.firstName} created successfully!`);
  };

  return (
    <div>
      <h1>Secretary Dashboard</h1>
      <button onClick={onLogout}>Logout</button>

      <h2>Create Patient Account</h2>
      <input placeholder="First Name" onChange={(e) => handleInputChange("firstName", e.target.value)} />
      <input placeholder="Last Name" onChange={(e) => handleInputChange("lastName", e.target.value)} />
      <input placeholder="Email" onChange={(e) => handleInputChange("email", e.target.value)} />
      <input placeholder="Password" type="password" onChange={(e) => handleInputChange("password", e.target.value)} />
      <input placeholder="Date of Birth" type="date" onChange={(e) => handleInputChange("dateOfBirth", e.target.value)} />
      <input placeholder="Contact Info" onChange={(e) => handleInputChange("contactInfo", e.target.value)} />
      <button onClick={createPatient}>Create Patient</button>

      {message && <p>{message}</p>}
    </div>
  );
};

export default SecretaryDashboard;
