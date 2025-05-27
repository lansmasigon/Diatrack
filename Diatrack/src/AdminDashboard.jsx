
// AdminDashboard.jsx
import React, { useState } from "react";
import supabase from "./supabaseClient";

const AdminDashboard = ({ onLogout }) => {
  const [doctorForm, setDoctorForm] = useState({ firstName: "", lastName: "", email: "", password: "", specialization: "" });
  const [secretaryForm, setSecretaryForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [message, setMessage] = useState("");

  const handleInputChange = (formSetter, field, value) => {
    formSetter((prev) => ({ ...prev, [field]: value }));
  };

  const createDoctor = async () => {
    const { error } = await supabase.from("doctors").insert({
      first_name: doctorForm.firstName,
      last_name: doctorForm.lastName,
      email: doctorForm.email,
      password: doctorForm.password,
      specialization: doctorForm.specialization,
    });
    if (error) setMessage(`Error creating doctor: ${error.message}`);
    else setMessage(`Doctor ${doctorForm.firstName} created successfully!`);
  };

  const createSecretary = async () => {
    const { error } = await supabase.from("secretaries").insert({
      first_name: secretaryForm.firstName,
      last_name: secretaryForm.lastName,
      email: secretaryForm.email,
      password: secretaryForm.password,
    });
    if (error) setMessage(`Error creating secretary: ${error.message}`);
    else setMessage(`Secretary ${secretaryForm.firstName} created successfully!`);
  };

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <button onClick={onLogout}>Logout</button>

      <h2>Create Doctor Account</h2>
      <input placeholder="First Name" onChange={(e) => handleInputChange(setDoctorForm, "firstName", e.target.value)} />
      <input placeholder="Last Name" onChange={(e) => handleInputChange(setDoctorForm, "lastName", e.target.value)} />
      <input placeholder="Email" onChange={(e) => handleInputChange(setDoctorForm, "email", e.target.value)} />
      <input placeholder="Password" type="password" onChange={(e) => handleInputChange(setDoctorForm, "password", e.target.value)} />
      <input placeholder="Specialization" onChange={(e) => handleInputChange(setDoctorForm, "specialization", e.target.value)} />
      <button onClick={createDoctor}>Create Doctor</button>

      <h2>Create Secretary Account</h2>
      <input placeholder="First Name" onChange={(e) => handleInputChange(setSecretaryForm, "firstName", e.target.value)} />
      <input placeholder="Last Name" onChange={(e) => handleInputChange(setSecretaryForm, "lastName", e.target.value)} />
      <input placeholder="Email" onChange={(e) => handleInputChange(setSecretaryForm, "email", e.target.value)} />
      <input placeholder="Password" type="password" onChange={(e) => handleInputChange(setSecretaryForm, "password", e.target.value)} />
      <button onClick={createSecretary}>Create Secretary</button>

      {message && <p>{message}</p>}
    </div>
  );
};

export default AdminDashboard;
