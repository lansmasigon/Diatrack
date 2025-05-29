// ✅ FULL AdminDashboard.jsx WITH 'Patients' TAB AND PATIENT TABLE

import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./AdminDashboard.css";

const AdminDashboard = ({ onLogout }) => {
  const [secretaries, setSecretaries] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [message, setMessage] = useState("");

  const [doctorForm, setDoctorForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    specialization: "",
    secretaryId: "",
  });

  const [secretaryForm, setSecretaryForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    doctorId: "",
  });

  const [newLinkSecretary, setNewLinkSecretary] = useState("");
  const [newLinkDoctor, setNewLinkDoctor] = useState("");

  useEffect(() => {
    fetchSecretaries();
    fetchDoctors();
    fetchPatients();
    fetchLinks();
  }, []);

  const fetchSecretaries = async () => {
    const { data } = await supabase.from("secretaries").select("*");
    setSecretaries(data);
  };

  const fetchDoctors = async () => {
    const { data } = await supabase.from("doctors").select("*");
    setDoctors(data);
  };

  const fetchPatients = async () => {
    const { data } = await supabase.from("patients").select("*");
    setPatients(data);
  };

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from("secretary_doctor_links")
      .select("link_id, secretary_id, doctor_id, secretaries(first_name, last_name), doctors(first_name, last_name)");
    if (error) setMessage(`Error fetching links: ${error.message}`);
    else setLinks(data);
  };

  const createDoctor = async () => {
    const confirm = window.confirm("Are you sure you want to create this doctor?");
    if (!confirm) {
      setMessage("Doctor creation canceled.");
      return;
    }

    const { data, error } = await supabase
      .from("doctors")
      .insert({
        first_name: doctorForm.firstName,
        last_name: doctorForm.lastName,
        email: doctorForm.email,
        password: doctorForm.password,
        specialization: doctorForm.specialization,
      })
      .select("doctor_id")
      .single();

    if (error) {
      setMessage(`Error creating doctor: ${error.message}`);
      return;
    }

    if (doctorForm.secretaryId) {
      await supabase.from("secretary_doctor_links").insert({
        secretary_id: doctorForm.secretaryId,
        doctor_id: data.doctor_id,
      });
    }

    setMessage("Doctor created and linked successfully!");
    fetchDoctors();
    fetchLinks();
  };

  const createSecretary = async () => {
    const confirm = window.confirm("Are you sure you want to create this secretary?");
    if (!confirm) {
      setMessage("Secretary creation canceled.");
      return;
    }

    const { data, error } = await supabase
      .from("secretaries")
      .insert({
        first_name: secretaryForm.firstName,
        last_name: secretaryForm.lastName,
        email: secretaryForm.email,
        password: secretaryForm.password,
      })
      .select("secretary_id")
      .single();

    if (error) {
      setMessage(`Error creating secretary: ${error.message}`);
      return;
    }

    if (secretaryForm.doctorId) {
      await supabase.from("secretary_doctor_links").insert({
        secretary_id: data.secretary_id,
        doctor_id: secretaryForm.doctorId,
      });
    }

    setMessage("Secretary created and linked successfully!");
    fetchSecretaries();
    fetchLinks();
  };

  const unlinkPair = async (linkId) => {
    const confirm = window.confirm("Are you sure you want to unlink this secretary-doctor pair?");
    if (!confirm) {
      setMessage("Unlinking canceled.");
      return;
    }

    const { error } = await supabase.from("secretary_doctor_links").delete().eq("link_id", linkId);
    if (error) setMessage(`Error unlinking: ${error.message}`);
    else {
      setMessage("Link removed successfully!");
      fetchLinks();
    }
  };

  const linkNewPair = async (secretaryId, doctorId) => {
    if (!secretaryId || !doctorId) {
      setMessage("Please select both a secretary and a doctor.");
      return;
    }

    const confirm = window.confirm("Are you sure you want to link this secretary to this doctor?");
    if (!confirm) {
      setMessage("Linking canceled.");
      return;
    }

    const { error } = await supabase.from("secretary_doctor_links").insert({
      secretary_id: secretaryId,
      doctor_id: doctorId,
    });

    if (error) setMessage(`Error linking: ${error.message}`);
    else {
      setMessage("Link added successfully!");
      fetchLinks();
    }
  };

  return (
    <div className="dashboard-container">
      <div className="fixed-sidebar">
        <h1 className="app-title">
          <span style={{ color: "#00aaff" }}>DIA</span>
          <span style={{ color: "#ff9800" }}>TRACK</span>
        </h1>
        <ul>
          <li className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>Dashboard</li>
          <li className={activeTab === "patients" ? "active" : ""} onClick={() => setActiveTab("patients")}>Patients</li>
        </ul>
        <button
          className="signout"
          onClick={() => {
            if (window.confirm("Are you sure you want to sign out?")) onLogout();
          }}
        >
          Sign Out
        </button>
      </div>

      <div className="header">
        <h1>System Management Dashboard</h1>
      </div>

      <div className="main-content">
        <div className="admin-dashboard-container">
          {activeTab === "dashboard" && (
            <>
              <h2>Create Accounts</h2>
              <div className="panels-container">
                <div className="left-panel">
                  <h3>Add Doctor</h3>
                  <input placeholder="First Name" onChange={(e) => setDoctorForm({ ...doctorForm, firstName: e.target.value })} />
                  <input placeholder="Last Name" onChange={(e) => setDoctorForm({ ...doctorForm, lastName: e.target.value })} />
                  <input placeholder="Email" onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} />
                  <input placeholder="Password" type="password" onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} />
                  <input placeholder="Specialization" onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
                  <select onChange={(e) => setDoctorForm({ ...doctorForm, secretaryId: e.target.value })}>
                    <option value="">Assign to Secretary (optional)</option>
                    {secretaries.map((sec) => (
                      <option key={sec.secretary_id} value={sec.secretary_id}>
                        {sec.first_name} {sec.last_name}
                      </option>
                    ))}
                  </select>
                  <button className="action-button" onClick={createDoctor}>Create Doctor</button>
                </div>

                <div className="right-panel">
                  <h3>Add Secretary</h3>
                  <input placeholder="First Name" onChange={(e) => setSecretaryForm({ ...secretaryForm, firstName: e.target.value })} />
                  <input placeholder="Last Name" onChange={(e) => setSecretaryForm({ ...secretaryForm, lastName: e.target.value })} />
                  <input placeholder="Email" onChange={(e) => setSecretaryForm({ ...secretaryForm, email: e.target.value })} />
                  <input placeholder="Password" type="password" onChange={(e) => setSecretaryForm({ ...secretaryForm, password: e.target.value })} />
                  <select onChange={(e) => setSecretaryForm({ ...secretaryForm, doctorId: e.target.value })}>
                    <option value="">Assign to Doctor (optional)</option>
                    {doctors.map((doc) => (
                      <option key={doc.doctor_id} value={doc.doctor_id}>
                        {doc.first_name} {doc.last_name}
                      </option>
                    ))}
                  </select>
                  <button className="action-button" onClick={createSecretary}>Create Secretary</button>
                </div>
              </div>

              <h2>Existing Secretary-Doctor Links</h2>
              <ul>
                {links.map((link) => (
                  <li key={link.link_id}>
                    {link.secretaries.first_name} {link.secretaries.last_name} ↔ {link.doctors.first_name} {link.doctors.last_name}
                    <button onClick={() => unlinkPair(link.link_id)}>Unlink</button>
                  </li>
                ))}
              </ul>

              <h2>Create New Link</h2>
              <select onChange={(e) => setNewLinkSecretary(e.target.value)}>
                <option value="">Select Secretary</option>
                {secretaries.map((sec) => (
                  <option key={sec.secretary_id} value={sec.secretary_id}>
                    {sec.first_name} {sec.last_name}
                  </option>
                ))}
              </select>

              <select onChange={(e) => setNewLinkDoctor(e.target.value)}>
                <option value="">Select Doctor</option>
                {doctors.map((doc) => (
                  <option key={doc.doctor_id} value={doc.doctor_id}>
                    {doc.first_name} {doc.last_name}
                  </option>
                ))}
              </select>

              <button className="action-button" onClick={() => linkNewPair(newLinkSecretary, newLinkDoctor)}>
                Link Secretary to Doctor
              </button>
            </>
          )}

          {activeTab === "patients" && (
            <>
              <h2>Master List of All Patients</h2>
              <table className="master-list">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Email</th>
                    <th>Date of Birth</th>
                    <th>Contact Info</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((pat) => (
                    <tr key={pat.patient_id}>
                      <td>{pat.first_name} {pat.last_name}</td>
                      <td>{pat.email}</td>
                      <td>{pat.date_of_birth}</td>
                      <td>{pat.contact_info}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {message && <p>{message}</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
