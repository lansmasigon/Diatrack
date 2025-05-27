// AdminDashboard.jsx — combined add + edit + unlink features
import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";

const AdminDashboard = ({ onLogout }) => {
  const [secretaries, setSecretaries] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [links, setLinks] = useState([]);
  const [message, setMessage] = useState("");

  const [doctorForm, setDoctorForm] = useState({ firstName: "", lastName: "", email: "", password: "", specialization: "", secretaryId: "" });
  const [secretaryForm, setSecretaryForm] = useState({ firstName: "", lastName: "", email: "", password: "", doctorId: "" });

  useEffect(() => {
    fetchSecretaries();
    fetchDoctors();
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

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from("secretary_doctor_links")
      .select("link_id, secretary_id, doctor_id, secretaries(first_name, last_name), doctors(first_name, last_name)");
    if (error) setMessage(`Error fetching links: ${error.message}`);
    else setLinks(data);
  };

  const createDoctor = async () => {
    const { data, error } = await supabase.from("doctors").insert({
      first_name: doctorForm.firstName,
      last_name: doctorForm.lastName,
      email: doctorForm.email,
      password: doctorForm.password,
      specialization: doctorForm.specialization,
    }).select("doctor_id").single();

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
    const { data, error } = await supabase.from("secretaries").insert({
      first_name: secretaryForm.firstName,
      last_name: secretaryForm.lastName,
      email: secretaryForm.email,
      password: secretaryForm.password,
    }).select("secretary_id").single();

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
    const { error } = await supabase.from("secretary_doctor_links").delete().eq("link_id", linkId);
    if (error) setMessage(`Error unlinking: ${error.message}`);
    else {
      setMessage("Link removed successfully!");
      fetchLinks();
    }
  };

  const linkNewPair = async (secretaryId, doctorId) => {
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

  const [newLinkSecretary, setNewLinkSecretary] = useState("");
  const [newLinkDoctor, setNewLinkDoctor] = useState("");

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <button onClick={onLogout}>Logout</button>

      <h2>Add Doctor</h2>
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
      <button onClick={createDoctor}>Create Doctor</button>

      <h2>Add Secretary</h2>
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
      <button onClick={createSecretary}>Create Secretary</button>

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

      <button onClick={() => linkNewPair(newLinkSecretary, newLinkDoctor)}>
        Link Secretary to Doctor
      </button>

      {message && <p>{message}</p>}
    </div>
  );
};

export default AdminDashboard;
