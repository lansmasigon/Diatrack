import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./SecretaryDashboard.css";

// ➜ Summary Widget Component
const PatientSummaryWidget = ({ totalPatients }) => (
  <div className="summary-widget">
    <h3>Total Patients</h3>
    <p className="summary-number">{totalPatients}</p>
  </div>
);

const SecretaryDashboard = ({ user, onLogout }) => {
  const [activePage, setActivePage] = useState("dashboard");
  const [linkedDoctors, setLinkedDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [patientForm, setPatientForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    dateOfBirth: "",
    contactInfo: ""
  });
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
      .select("*, doctors (doctor_id, first_name, last_name)")
      .in("preferred_doctor_id", doctorIds);

    if (!error) setPatients(data);
    else console.error(error);
  };

  const handleInputChange = (field, value) => {
    setPatientForm(prev => ({ ...prev, [field]: value }));
  };

  const createPatient = async () => {
    if (!selectedDoctorId) {
      setMessage("Please select a doctor to assign the patient to.");
      return;
    }

    const confirmAction = window.confirm("Are you sure you want to create this patient?");
    if (!confirmAction) {
      setMessage("Action canceled by user.");
      return;
    }

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
      setPatientForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        dateOfBirth: "",
        contactInfo: ""
      });
      fetchPatients();
      setActivePage("dashboard"); // go back to dashboard after creating
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
    setActivePage("create");
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
    <div className="dashboard-container">
      {/* Sidebar */}
      <div className="fixed-sidebar">
        <h1 className="app-title">
          <span style={{ color: '#00aaff' }}>DIA</span>
          <span style={{ color: '#ff9800' }}>TRACK</span>
        </h1>
        <ul>
          <li className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>Dashboard</li>
          <li className={activePage === "create" ? "active" : ""} onClick={() => {
            setActivePage("create");
            setPatientForm({
              firstName: "",
              lastName: "",
              email: "",
              password: "",
              dateOfBirth: "",
              contactInfo: ""
            });
            setEditingPatientId(null);
          }}>
            Create Patient
          </li>
        </ul>
        <button className="signout" onClick={() => {
          if (window.confirm("Are you sure you want to sign out?")) onLogout();
        }}>
          Sign Out
        </button>
      </div>

      {/* Header */}
      <div className="header">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search patients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <h1>Welcome, {user.first_name}</h1>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="secretary-dashboard-container">
          {activePage === "dashboard" && (
            <>
              <PatientSummaryWidget totalPatients={patients.length} />

              <h2>My Patients</h2>
              <ul className="patient-list">
                {filteredPatients.map((pat) => (
                  <li key={pat.patient_id} className="patient-item">
                    <span>{pat.first_name} {pat.last_name} — Doctor: {pat.doctors ? `${pat.doctors.first_name} ${pat.doctors.last_name}` : 'Unknown'}</span>
                    <div>
                      <button className="view-button" onClick={() => setSelectedPatientDetail(pat)}>View</button>
                      <button className="edit-button" onClick={() => handleEditPatient(pat)}>Edit</button>
                      <button className="delete-button" onClick={() => handleDeletePatient(pat.patient_id)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>

              {selectedPatientDetail && (
                <div className="patient-detail-card">
                  <h3>Patient Details</h3>
                  <p><strong>Name:</strong> {selectedPatientDetail.first_name} {selectedPatientDetail.last_name}</p>
                  <p><strong>Email:</strong> {selectedPatientDetail.email}</p>
                  <p><strong>Date of Birth:</strong> {selectedPatientDetail.date_of_birth}</p>
                  <p><strong>Contact Info:</strong> {selectedPatientDetail.contact_info}</p>
                  <button className="close-details-button" onClick={() => setSelectedPatientDetail(null)}>
                    Close Details
                  </button>
                </div>
              )}
            </>
          )}

          {activePage === "create" && (
            <>
              <h2>{editingPatientId ? "Edit Patient" : "Create Patient Account"}</h2>
              <select className="doctor-select" value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
                <option value="">Select Doctor</option>
                {linkedDoctors.map((doc) => (
                  <option key={doc.doctor_id} value={doc.doctor_id}>{doc.doctor_name}</option>
                ))}
              </select>

              <input className="patient-input" placeholder="First Name" value={patientForm.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} />
              <input className="patient-input" placeholder="Last Name" value={patientForm.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} />
              <input className="patient-input" placeholder="Email" value={patientForm.email} onChange={(e) => handleInputChange("email", e.target.value)} />
              <input className="patient-input" placeholder="Password" type="password" value={patientForm.password} onChange={(e) => handleInputChange("password", e.target.value)} />
              <input className="patient-input" placeholder="Date of Birth" type="date" value={patientForm.dateOfBirth} onChange={(e) => handleInputChange("dateOfBirth", e.target.value)} />
              <input className="patient-input" placeholder="Contact Info" value={patientForm.contactInfo} onChange={(e) => handleInputChange("contactInfo", e.target.value)} />
              <button className="create-patient-button" onClick={createPatient}>Create Patient</button>
            </>
          )}

          {message && <p>{message}</p>}
        </div>
      </div>
    </div>
  );
};

export default SecretaryDashboard;
