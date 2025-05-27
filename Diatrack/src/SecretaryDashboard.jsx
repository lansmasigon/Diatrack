// SecretaryDashboard.jsx — fixed null check for user + doctor join
import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";

const SecretaryDashboard = ({ user, onLogout }) => {
  const [linkedDoctors, setLinkedDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [patientForm, setPatientForm] = useState({ firstName: "", lastName: "", email: "", password: "", dateOfBirth: "", contactInfo: "" });
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientDetail, setSelectedPatientDetail] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user && user.secretary_id) {
      fetchLinkedDoctors();
    } else {
      console.error("User or secretary_id is undefined");
      setMessage("Error: Secretary account not loaded properly.");
    }
  }, [user]);

  useEffect(() => {
    if (linkedDoctors.length > 0) fetchPatients();
  }, [linkedDoctors]);

  const fetchLinkedDoctors = async () => {
    const { data, error } = await supabase
      .from("secretary_doctor_links")
      .select("*, doctors (doctor_id, first_name, last_name)")
      .eq("secretary_id", user.secretary_id);

    if (!error && data) {
      const uniqueDoctors = data
        .filter(d => d.doctors)
        .map(d => ({
          doctor_id: d.doctors.doctor_id,
          doctor_name: `${d.doctors.first_name} ${d.doctors.last_name}`
        }));
      setLinkedDoctors(uniqueDoctors);
    } else {
      console.error(error);
      setMessage("Error fetching linked doctors or no links found");
    }
  };

  const fetchPatients = async () => {
    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) return;

    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .in("preferred_doctor_id", doctorIds);

    if (!error) setPatients(data);
    else console.error(error);
  };

  const handleInputChange = (field, value) => {
    setPatientForm((prev) => ({ ...prev, [field]: value }));
  };

  const createOrUpdatePatient = async () => {
    if (!selectedDoctorId) {
      setMessage("Please select a doctor to assign the patient to.");
      return;
    }

    if (editingPatientId) {
      const { error } = await supabase.from("patients").update({
        first_name: patientForm.firstName,
        last_name: patientForm.lastName,
        email: patientForm.email,
        password: patientForm.password,
        date_of_birth: patientForm.dateOfBirth,
        contact_info: patientForm.contactInfo,
        preferred_doctor_id: selectedDoctorId,
      }).eq("patient_id", editingPatientId);

      if (error) setMessage(`Error updating patient: ${error.message}`);
      else {
        setMessage("Patient updated successfully!");
        setEditingPatientId(null);
        fetchPatients();
      }
    } else {
      const { error } = await supabase.from("patients").insert({
        first_name: patientForm.firstName,
        last_name: patientForm.lastName,
        email: patientForm.email,
        password: patientForm.password,
        date_of_birth: patientForm.dateOfBirth,
        contact_info: patientForm.contactInfo,
        preferred_doctor_id: selectedDoctorId,
      });

      if (error) setMessage(`Error creating patient: ${error.message}`);
      else {
        setMessage(`Patient ${patientForm.firstName} created successfully!`);
        fetchPatients();
      }
    }
  };

  const handleEditPatient = (patient) => {
    setPatientForm({
      firstName: patient.first_name,
      lastName: patient.last_name,
      email: patient.email,
      password: patient.password,
      dateOfBirth: patient.date_of_birth,
      contactInfo: patient.contact_info,
    });
    setSelectedDoctorId(patient.preferred_doctor_id);
    setEditingPatientId(patient.patient_id);
  };

  const handleDeletePatient = async (patientId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this patient?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("patients").delete().eq("patient_id", patientId);
    if (error) setMessage(`Error deleting patient: ${error.message}`);
    else {
      setMessage("Patient deleted successfully!");
      fetchPatients();
    }
  };

  const filteredPatients = patients.filter((pat) =>
    `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <h1>Secretary Dashboard</h1>
      <button onClick={onLogout}>Logout</button>

      <h2>{editingPatientId ? "Edit Patient" : "Create Patient Account"}</h2>
      <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
        <option value="">Select Doctor</option>
        {linkedDoctors.map((doc) => (
          <option key={doc.doctor_id} value={doc.doctor_id}>{doc.doctor_name}</option>
        ))}
      </select>

      <input placeholder="First Name" value={patientForm.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} />
      <input placeholder="Last Name" value={patientForm.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} />
      <input placeholder="Email" value={patientForm.email} onChange={(e) => handleInputChange("email", e.target.value)} />
      <input placeholder="Password" type="password" value={patientForm.password} onChange={(e) => handleInputChange("password", e.target.value)} />
      <input placeholder="Date of Birth" type="date" value={patientForm.dateOfBirth} onChange={(e) => handleInputChange("dateOfBirth", e.target.value)} />
      <input placeholder="Contact Info" value={patientForm.contactInfo} onChange={(e) => handleInputChange("contactInfo", e.target.value)} />
      <button onClick={createOrUpdatePatient}>{editingPatientId ? "Update Patient" : "Create Patient"}</button>

      <h2>My Patients</h2>
      <input
        type="text"
        placeholder="Search patients by name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <ul>
        {filteredPatients.map((pat) => (
          <li key={pat.patient_id}>
            {pat.first_name} {pat.last_name} — linked to Doctor ID: {pat.preferred_doctor_id}
            <button onClick={() => setSelectedPatientDetail(pat)}>View Details</button>
            <button onClick={() => handleEditPatient(pat)}>Edit</button>
            <button onClick={() => handleDeletePatient(pat.patient_id)}>Delete</button>
          </li>
        ))}
      </ul>

      {selectedPatientDetail && (
        <div style={{ border: "1px solid #ccc", padding: "10px", marginTop: "10px" }}>
          <h3>Patient Details</h3>
          <p><strong>Name:</strong> {selectedPatientDetail.first_name} {selectedPatientDetail.last_name}</p>
          <p><strong>Email:</strong> {selectedPatientDetail.email}</p>
          <p><strong>Date of Birth:</strong> {selectedPatientDetail.date_of_birth}</p>
          <p><strong>Contact Info:</strong> {selectedPatientDetail.contact_info}</p>
          <button onClick={() => setSelectedPatientDetail(null)}>Close Details</button>
        </div>
      )}

      {message && <p>{message}</p>}
    </div>
  );
};

export default SecretaryDashboard;
