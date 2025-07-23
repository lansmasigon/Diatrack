// ✅ FULL AdminDashboard.jsx WITH 'Patients' TAB AND PATIENT TABLE WITH EDIT FUNCTIONALITY

import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./AdminDashboard.css";
import logo from "../picture/logo.png"; // Import the logo image

const AdminDashboard = ({ onLogout, user }) => {
  const [secretaries, setSecretaries] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard"); // Default to dashboard tab
  const [message, setMessage] = useState("");
  const [adminName, setAdminName] = useState("Admin"); // State for admin name

  const [filteredDoctors, setFilteredDoctors] = useState([]);

  // New state for selected list type in the "List" dropdown
  const [selectedListType, setSelectedListType] = useState("patients"); // Default to showing patients

  // New state to control the dropdown visibility
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [showUsersPopup, setShowUsersPopup] = useState(false);
  const [showMessagePopup, setShowMessagePopup] = useState(false);

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

  // New states for pagination
  const [currentPagePatients, setCurrentPagePatients] = useState(1);
  const [patientsPerPage] = useState(6); // Max 6 items per page

  const [currentPageDoctors, setCurrentPageDoctors] = useState(1);
  const [doctorsPerPage] = useState(6); // Max 6 items per page

  // New states for secretary pagination
  const [currentPageSecretaries, setCurrentPageSecretaries] = useState(1);
  const [secretariesPerPage] = useState(6); // Max 6 items per page

  // New states for patient editing
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [editPatientForm, setEditPatientForm] = useState({
    first_name: "",
    last_name: "",
    password: "",
    date_of_birth: "",
    contact_info: "",
  });

  // New states for doctor editing
  const [editingDoctorId, setEditingDoctorId] = useState(null);
  const [editDoctorForm, setEditDoctorForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "", // Password for doctors too
    specialization: "",
  });

  // New states for secretary editing
  const [editingSecretaryId, setEditingSecretaryId] = useState(null);
  const [editSecretaryForm, setEditSecretaryForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });

  // New state for search queries
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [secretarySearchQuery, setSecretarySearchQuery] = useState('');


  useEffect(() => {
    fetchSecretaries();
    fetchDoctors();
    fetchLinks();
  }, []);

  // Effect to update adminName when the user prop changes
  useEffect(() => {
    if (user && user.first_name && user.last_name) {
      setAdminName(`${user.first_name} ${user.last_name}`);
    } else {
      setAdminName("Admin"); // Fallback if user data isn't complete
    }
  }, [user]);


  // Effect for fetching patients
  useEffect(() => {
    fetchPatients();
  }, [currentPagePatients]); // Re-fetch patients when page changes

  // Effect for fetching doctors with secretary info
  useEffect(() => {
    fetchDoctorsWithSecretaryInfo(); // Call the new function
  }, [currentPageDoctors]); // Re-fetch doctors when page changes

  // Effect for fetching secretaries (for the new table)
  useEffect(() => {
    fetchSecretaries(); // Already fetching all, pagination will slice
  }, [currentPageSecretaries]); // Re-fetch secretaries when page changes


  const fetchSecretaries = async () => {
    const { data, error } = await supabase.from("secretaries").select("*");
    if (error) setMessage(`Error fetching secretaries: ${error.message}`);
    else setSecretaries(data);
  };

  const fetchDoctors = async () => {
    const { data } = await supabase.from("doctors").select("*");
    setDoctors(data);
  };

  const fetchPatients = async () => {
    // Corrected select to join with 'doctors' table using 'preferred_doctor_id'
    let query = supabase.from("patients").select("*, preferred_doctor_id:doctors(first_name, last_name)");
    const { data, error } = await query;
    if (error) setMessage(`Error fetching patients: ${error.message}`);
    else setPatients(data);
  };

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from("secretary_doctor_links")
      .select("link_id, secretary_id, doctor_id, secretaries(first_name, last_name), doctors(first_name, last_name)");
    if (error) setMessage(`Error fetching links: ${error.message}`);
    else setLinks(data);
  };

  // Renamed and modified from fetchDoctorsBySecretary
  const fetchDoctorsWithSecretaryInfo = async () => {
    // Fetch all doctors and their linked secretaries
    const { data, error } = await supabase
      .from("doctors")
      .select("*, secretary_doctor_links(secretaries(first_name, last_name))"); // Join through link table to secretaries

    if (error) {
      setMessage(`Error fetching doctors with secretary info: ${error.message}`);
      setFilteredDoctors([]); // Clear doctors if error
      return;
    }
    setFilteredDoctors(data); // Set all doctors with their secretary info
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
        secretary_id: doctorForm.secretaryId, // Corrected this to use doctorForm.secretaryId
        doctor_id: data.doctor_id,
      });
    }

    setMessage("Doctor created and linked successfully!");
    fetchDoctors();
    fetchLinks();
    fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info to update the list
    setDoctorForm({ firstName: "", lastName: "", email: "", password: "", specialization: "", secretaryId: "" }); // Clear form
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
    setSecretaryForm({ firstName: "", lastName: "", email: "", password: "", doctorId: "" }); // Clear form
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
      fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info to update the list
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
      setNewLinkSecretary(""); // Clear selection
      setNewLinkDoctor(""); // Clear selection
      fetchLinks();
      fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info to update the list
    }
  };

  // Patient editing functions
  const handleEditPatient = (patient) => {
    setEditingPatientId(patient.patient_id);
    setEditPatientForm({
      first_name: patient.first_name,
      last_name: patient.last_name,
      // You generally don't pre-fill passwords for security
      password: "", // Leave blank or handle password reset separately
      date_of_birth: patient.date_of_birth,
      contact_info: patient.contact_info,
    });
  };

  const handleEditPatientChange = (e) => {
    const { name, value } = e.target;
    setEditPatientForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const savePatientChanges = async () => {
    if (!editingPatientId) return;

    const confirmSave = window.confirm("Are you sure you want to save these changes?");
    if (!confirmSave) {
      setMessage("Patient changes canceled.");
      return;
    }

    const updates = {
      first_name: editPatientForm.first_name,
      last_name: editPatientForm.last_name,
      date_of_birth: editPatientForm.date_of_birth,
      contact_info: editPatientForm.contact_info,
    };

    // Only update password if a new one is provided
    if (editPatientForm.password) {
      updates.password = editPatientForm.password;
    }

    const { error } = await supabase
      .from("patients")
      .update(updates)
      .eq("patient_id", editingPatientId);

    if (error) {
      setMessage(`Error updating patient: ${error.message}`);
    } else {
      setMessage("Patient updated successfully!");
      setEditingPatientId(null);
      setEditPatientForm({
        first_name: "",
        last_name: "",
        password: "",
        date_of_birth: "",
        contact_info: "",
      });
      fetchPatients(); // Re-fetch patients to show updated data
    }
  };

  const cancelEdit = () => {
    setEditingPatientId(null);
    setEditPatientForm({
      first_name: "",
      last_name: "",
      password: "",
      date_of_birth: "",
      contact_info: "",
    });
    setMessage("Patient editing canceled.");
  };

  // New: Handle view patient details
  const handleViewPatient = (patient) => {
    alert(`Patient Details:\nName: ${patient.first_name} ${patient.last_name}\nEmail: ${patient.email}\nDate of Birth: ${patient.date_of_birth}\nContact: ${patient.contact_info}`);
    // You can replace alert with a more sophisticated modal or navigation
  };

  // New: Handle delete patient
  const handleDeletePatient = async (patientId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this patient? This action cannot be undone.");
    if (!confirmDelete) {
      setMessage("Patient deletion canceled.");
      return;
    }

    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("patient_id", patientId);

    if (error) {
      setMessage(`Error deleting patient: ${error.message}`);
    } else {
      setMessage("Patient deleted successfully!");
      fetchPatients(); // Re-fetch patients to show updated data
    }
  };

  // Doctor editing functions (new)
  const handleEditDoctor = (doctor) => {
    setEditingDoctorId(doctor.doctor_id);
    setEditDoctorForm({
      first_name: doctor.first_name,
      last_name: doctor.last_name,
      email: doctor.email,
      password: "", // Leave blank for security
      specialization: doctor.specialization,
    });
  };

  const handleEditDoctorChange = (e) => {
    const { name, value } = e.target;
    setEditDoctorForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const saveDoctorChanges = async () => {
    if (!editingDoctorId) return;

    const confirmSave = window.confirm("Are you sure you want to save these doctor changes?");
    if (!confirmSave) {
      setMessage("Doctor changes canceled.");
      return;
    }

    const updates = {
      first_name: editDoctorForm.first_name,
      last_name: editDoctorForm.last_name,
      email: editDoctorForm.email,
      specialization: editDoctorForm.specialization,
    };

    if (editDoctorForm.password) {
      updates.password = editDoctorForm.password;
    }

    const { error } = await supabase
      .from("doctors")
      .update(updates)
      .eq("doctor_id", editingDoctorId);

    if (error) {
      setMessage(`Error updating doctor: ${error.message}`);
    } else {
      setMessage("Doctor updated successfully!");
      setEditingDoctorId(null);
      setEditDoctorForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        specialization: "",
      });
      fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info
      fetchDoctors(); // Also re-fetch all doctors for other lists
    }
  };

  const cancelDoctorEdit = () => {
    setEditingDoctorId(null);
    setEditDoctorForm({
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      specialization: "",
    });
    setMessage("Doctor editing canceled.");
  };

  // New: Handle view doctor details
  const handleViewDoctor = (doctor) => {
    alert(`Doctor Details:\nName: ${doctor.first_name} ${doctor.last_name}\nEmail: ${doctor.email}\nSpecialization: ${doctor.specialization}`);
    // You can replace alert with a more sophisticated modal or navigation
  };

  // New: Handle delete doctor
  const handleDeleteDoctor = async (doctorId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this doctor? This action cannot be undone.");
    if (!confirmDelete) {
      setMessage("Doctor deletion canceled.");
      return;
    }

    const { error } = await supabase
      .from("doctors")
      .delete()
      .eq("doctor_id", doctorId);

    if (error) {
      setMessage(`Error deleting doctor: ${error.message}`);
    } else {
      setMessage("Doctor deleted successfully!");
      fetchDoctorsWithSecretaryInfo(); // Re-fetch filtered doctors
      fetchDoctors(); // Re-fetch all doctors to update other lists
      fetchLinks(); // Links might be affected if a linked doctor is deleted
    }
  };

  // Secretary editing functions (new)
  const handleEditSecretary = (secretary) => {
    setEditingSecretaryId(secretary.secretary_id);
    setEditSecretaryForm({
      first_name: secretary.first_name,
      last_name: secretary.last_name,
      email: secretary.email,
      password: "", // Leave blank for security
    });
  };

  const handleEditSecretaryChange = (e) => {
    const { name, value } = e.target;
    setEditSecretaryForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const saveSecretaryChanges = async () => {
    if (!editingSecretaryId) return;

    const confirmSave = window.confirm("Are you sure you want to save these secretary changes?");
    if (!confirmSave) {
      setMessage("Secretary changes canceled.");
      return;
    }

    const updates = {
      first_name: editSecretaryForm.first_name,
      last_name: editSecretaryForm.last_name,
      email: editSecretaryForm.email,
    };

    if (editSecretaryForm.password) {
      updates.password = editSecretaryForm.password; // Corrected: should be editSecretaryForm.password
    }

    const { error } = await supabase
      .from("secretaries")
      .update(updates)
      .eq("secretary_id", editingSecretaryId);

    if (error) {
      setMessage(`Error updating secretary: ${error.message}`);
    } else {
      setMessage("Secretary updated successfully!");
      setEditingSecretaryId(null);
      setEditSecretaryForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
      });
      fetchSecretaries(); // Re-fetch secretaries to show updated data
      fetchLinks(); // Links might be affected if secretary info changes
    }
  };

  const cancelSecretaryEdit = () => {
    setEditingSecretaryId(null);
    setEditSecretaryForm({
      first_name: "",
      last_name: "",
      email: "",
      password: "",
    });
    setMessage("Secretary editing canceled.");
  };

  // New: Handle view secretary details
  const handleViewSecretary = (secretary) => {
    alert(`Secretary Details:\nName: ${secretary.first_name} ${secretary.last_name}\nEmail: ${secretary.email}`);
    // You can replace alert with a more sophisticated modal or navigation
  };

  // New: Handle delete secretary
  const handleDeleteSecretary = async (secretaryId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this secretary? This action cannot be undone.");
    if (!confirmDelete) {
      setMessage("Secretary deletion canceled.");
      return;
    }

    const { error } = await supabase
      .from("secretaries")
      .delete()
      .eq("secretary_id", secretaryId);

    if (error) {
      setMessage(`Error deleting secretary: ${error.message}`);
    } else {
      setMessage("Secretary deleted successfully!");
      fetchSecretaries(); // Re-fetch secretaries to update the list
      fetchLinks(); // Links might be affected if a linked secretary is deleted
    }
  };


  // Filtering logic for patients
  const filteredPatients = patients.filter(patient => {
    const query = patientSearchQuery.toLowerCase();
    const doctorName = patient.preferred_doctor_id
      ? `${patient.preferred_doctor_id.first_name} ${patient.preferred_doctor_id.last_name}`.toLowerCase()
      : "n/a";
    return (
      patient.first_name.toLowerCase().includes(query) ||
      patient.last_name.toLowerCase().includes(query) ||
      patient.email.toLowerCase().includes(query) ||
      (patient.date_of_birth && patient.date_of_birth.toLowerCase().includes(query)) ||
      (patient.contact_info && patient.contact_info.toLowerCase().includes(query)) ||
      doctorName.includes(query)
    );
  });

  // Filtering logic for doctors
  const filteredDoctorsForSearch = filteredDoctors.filter(doctor => {
    const query = doctorSearchQuery.toLowerCase();
    const secretaryName = doctor.secretary_doctor_links?.[0]?.secretaries
      ? `${doctor.secretary_doctor_links[0].secretaries.first_name} ${doctor.secretary_doctor_links[0].secretaries.last_name}`.toLowerCase()
      : "n/a";
    return (
      doctor.first_name.toLowerCase().includes(query) ||
      doctor.last_name.toLowerCase().includes(query) ||
      doctor.email.toLowerCase().includes(query) ||
      doctor.specialization.toLowerCase().includes(query) ||
      secretaryName.includes(query)
    );
  });

  // Filtering logic for secretaries
  const filteredSecretaries = secretaries.filter(secretary => {
    const query = secretarySearchQuery.toLowerCase();
    return (
      secretary.first_name.toLowerCase().includes(query) ||
      secretary.last_name.toLowerCase().includes(query) ||
      secretary.email.toLowerCase().includes(query)
    );
  });


  // Pagination for patients
  const indexOfLastPatient = currentPagePatients * patientsPerPage;
  const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
  const currentPatients = filteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);

  // Pagination for doctors
  const indexOfLastDoctor = currentPageDoctors * doctorsPerPage;
  const indexOfFirstDoctor = indexOfLastDoctor - doctorsPerPage;
  const currentDoctors = filteredDoctorsForSearch.slice(indexOfFirstDoctor, indexOfLastDoctor);

  // Pagination for secretaries
  const indexOfLastSecretary = currentPageSecretaries * secretariesPerPage;
  const indexOfFirstSecretary = indexOfLastSecretary - secretariesPerPage;
  const currentSecretaries = filteredSecretaries.slice(indexOfFirstSecretary, indexOfLastSecretary);

  return (
    <div className="dashboard-container1">
      <div className="header1">
        <div className="header-left1">
          <img src={logo} alt="DiaTrack Logo" className="app-logo1" />
          <h1 className="app-title1">
            <span style={{ color: "#00aaff" }}>DIA</span>
            <span style={{ color: "#ff9800" }}>TRACK</span>
          </h1>
        </div>
        <nav className="main-nav1">
          <ul className="nav-list1">
            <li className={activeTab === "dashboard" ? "active1" : ""} onClick={() => setActiveTab("dashboard")}>
              Dashboard
            </li>
            <li className={activeTab === "manage" ? "active1" : ""} onClick={() => setActiveTab("manage")}>
              Manage
            </li>
            {/* Modified "List" tab to be a dropdown */}
            <li className={`dropdown ${activeTab === "list" ? "active1" : ""} ${isDropdownOpen ? "open" : ""}`}
                onClick={() => {
                  // Only toggle dropdown visibility, do not change activeTab here
                  setIsDropdownOpen(!isDropdownOpen);
                }}>
              List <i className="fas fa-caret-down"></i>
              <div className={`dropdown-content ${isDropdownOpen ? "show" : ""}`}>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("list"); setSelectedListType("patients"); setIsDropdownOpen(false); }}>Patients</a>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("list"); setSelectedListType("doctors"); setIsDropdownOpen(false); }}>Doctors</a>
                <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("list"); setSelectedListType("secretaries"); setIsDropdownOpen(false); }}>Secretaries</a>
              </div>
            </li>
          </ul>
        </nav>
        {/* ✅ RE-ADDED NAVBAR-RIGHT SECTION */}
        <div className="navbar-right">
          <div className="user-profile">
            <img src="../picture/secretary.png" alt="User Avatar" className="user-avatar" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}/>
            <div className="user-info">
              <span className="user-name">{adminName}</span> {/* Using adminName state */}
              <span className="user-role">Admin</span>
            </div>
          </div>
          <div className="header-icons">
            <button className="fas fa-bell notification-icon1" onClick={() => setShowUsersPopup(true)}></button>
            <button className="fas fa-envelope message-icon1" onClick={() => setShowMessagePopup(true)}></button>
            <button className="signout-button1" onClick={() => {
              if (window.confirm("Are you sure you want to sign out?")) onLogout();
            }}><i className="fas fa-sign-out-alt"></i></button>
          </div>
        </div>
        {/* Pop-up for Notification Icon (AdminDashboard) */}
      {showUsersPopup && (
        <div className="popup-overlay3"> {/* Use popup-overlay3 from your shared CSS */}
          <div className="popup-content3"> {/* Use popup-content3 from your shared CSS */}
            <h3>Notifications</h3>
            <p>You have new notifications!</p>
            <button onClick={() => setShowUsersPopup(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Pop-up for Message Icon (AdminDashboard) */}
      {showMessagePopup && (
        <div className="popup-overlay1"> {/* Use popup-overlay3 from your shared CSS */}
          <div className="popup-content1"> {/* Use popup-content3 from your shared CSS */}
            <h3>Messages</h3>
            <p>You have new messages!</p>
            <button onClick={() => setShowMessagePopup(false)}>Close</button>
          </div>
        </div>
      )}
      </div>

      <div className="main-content1">
        <h2 className="welcome-message1">Welcome, {adminName}! 👋</h2> {/* Using adminName state */}

        <div className="admin-dashboard-body1">
          {activeTab === "dashboard" && (
            <>
              <div className="summary-widget-grid1">
                <div className="summary-widget1 total-patients1">
                  <div className="summary-widget-icon1">
                    <i className="fas fa-users"></i>
                  </div>
                  <div className="summary-widget-content1">
                    <h3>Total Patients</h3>
                    <p className="summary-number1">{patients.length}</p>
                    <p className="summary-subtitle1">Patients registered in the system</p>
                  </div>
                </div>

                <div className="summary-widget1 total-doctors1">
                  <div className="summary-widget-icon1">
                    <i className="fas fa-user-md"></i> {/* Icon for doctors */}
                  </div>
                  <div className="summary-widget-content1">
                    <h3>Total Doctors</h3>
                    <p className="summary-number1">{doctors.length}</p>
                    <p className="summary-subtitle1">Doctors registered in the system</p>
                  </div>
                </div>

                <div className="summary-widget1 total-secretaries1">
                  <div className="summary-widget-icon1">
                    <i className="fas fa-user-tie"></i> {/* Icon for secretaries */}
                  </div>
                  <div className="summary-widget-content1">
                    <h3>Total Secretaries</h3>
                    <p className="summary-number1">{secretaries.length}</p>
                    <p className="summary-subtitle1">Secretaries registered in the system</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "manage" && (
            <>
              <h2>Create Accounts</h2>
              <div className="panels-container1">
                <div className="left-panel1">
                  <h3>Add Doctor</h3>
                  <input placeholder="First Name" value={doctorForm.firstName} onChange={(e) => setDoctorForm({ ...doctorForm, firstName: e.target.value })} />
                  <input placeholder="Last Name" value={doctorForm.lastName} onChange={(e) => setDoctorForm({ ...doctorForm, lastName: e.target.value })} />
                  <input placeholder="Email" value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} />
                  <input placeholder="Password" type="password" value={doctorForm.password} onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} />
                  <input placeholder="Specialization" value={doctorForm.specialization} onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
                  <select value={doctorForm.secretaryId} onChange={(e) => setDoctorForm({ ...doctorForm, secretaryId: e.target.value })}>
                    <option value="">Assign to Secretary (optional)</option>
                    {secretaries.map((sec) => (
                      <option key={sec.secretary_id} value={sec.secretary_id}>
                        {sec.first_name} {sec.last_name}
                      </option>
                    ))}
                  </select>
                  <button className="action-button1" onClick={createDoctor}>Create Doctor</button>
                </div>

                <div className="right-panel1">
                  <h3>Add Secretary</h3>
                  <input placeholder="First Name" value={secretaryForm.firstName} onChange={(e) => setSecretaryForm({ ...secretaryForm, firstName: e.target.value })} />
                  <input placeholder="Last Name" value={secretaryForm.lastName} onChange={(e) => setSecretaryForm({ ...secretaryForm, lastName: e.target.value })} />
                  <input placeholder="Email" value={secretaryForm.email} onChange={(e) => setSecretaryForm({ ...secretaryForm, email: e.target.value })} />
                  <input placeholder="Password" type="password" value={secretaryForm.password} onChange={(e) => setSecretaryForm({ ...secretaryForm, password: e.target.value })} />
                  <select value={secretaryForm.doctorId} onChange={(e) => setSecretaryForm({ ...secretaryForm, doctorId: e.target.value })}>
                    <option value="">Assign to Doctor (optional)</option>
                    {doctors.map((doc) => (
                      <option key={doc.doctor_id} value={doc.doctor_id}>
                        {doc.first_name} {doc.last_name}
                      </option>
                    ))}
                  </select>
                  <button className="action-button1" onClick={createSecretary}>Create Secretary</button>
                </div>
              </div>

              <h2>Existing Secretary-Doctor Links</h2>
              <table className="master-list1">
                <thead>
                  <tr>
                    <th>Secretary Name</th>
                    <th>Doctor Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {links.length > 0 ? (
                    links.map((link) => (
                      <tr key={link.link_id}>
                        <td>{link.secretaries?.first_name} {link.secretaries?.last_name}</td>
                        <td>{link.doctors?.first_name} {link.doctors?.last_name}</td>
                        <td>
                          <button onClick={() => unlinkPair(link.link_id)}>Unlink</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3">No secretary-doctor links found.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <h2>Create New Link</h2>
              <div className="link-creation-section1">
                <select value={newLinkSecretary} onChange={(e) => setNewLinkSecretary(e.target.value)}>
                  <option value="">Select Secretary</option>
                  {secretaries.map((sec) => (
                    <option key={sec.secretary_id} value={sec.secretary_id}>
                      {sec.first_name} {sec.last_name}
                    </option>
                  ))}
                </select>

                <select value={newLinkDoctor} onChange={(e) => setNewLinkDoctor(e.target.value)}>
                  <option value="">Select Doctor</option>
                  {doctors.map((doc) => (
                    <option key={doc.doctor_id} value={doc.doctor_id}>
                      {doc.first_name} {doc.last_name}
                    </option>
                  ))}
                </select>

                <button className="action-button1" onClick={() => linkNewPair(newLinkSecretary, newLinkDoctor)}>
                  Link Secretary to Doctor
                </button>
              </div>
            </>
          )}

          {/* Conditional rendering based on selectedListType */}
          {activeTab === "list" && (
            <>
              {selectedListType === "patients" && (
                <>
                  <h2>Master List of All Patients</h2>
                  <input
                    type="text"
                    placeholder="Search patients..."
                    className="search-input"
                    value={patientSearchQuery}
                    onChange={(e) => {
                      setPatientSearchQuery(e.target.value);
                      setCurrentPagePatients(1); // Reset to first page on new search
                    }}
                  />
                  <table className="master-list1">
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Assigned Doctor</th>
                        <th>Email</th>
                        <th>Date of Birth</th>
                        <th>Contact Info</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPatients.length > 0 ? (
                        currentPatients.map((pat) => (
                          <tr key={pat.patient_id}>
                            <td>{pat.first_name} {pat.last_name}</td>
                            <td>
                              {pat.preferred_doctor_id ? `${pat.preferred_doctor_id.first_name} ${pat.preferred_doctor_id.last_name}` : "N/A"}
                            </td>
                            <td>{pat.email}</td>
                            <td>{pat.date_of_birth}</td>
                            <td>{pat.contact_info}</td>
                            <td>
                              <button className= "Editbutton1" onClick={() => handleEditPatient(pat)}>Edit</button>
                              <button className= "Viewbutton1" onClick={() => handleViewPatient(pat)}>View</button>
                              <button className= "Deletebutton1" onClick={() => handleDeletePatient(pat.patient_id)}>Delete</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6">No patients found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pagination-controls1">
                    <button
                      onClick={() => setCurrentPagePatients(prev => Math.max(prev - 1, 1))}
                      disabled={currentPagePatients === 1}
                      className="pagination-button1"
                    >
                      Previous
                    </button>
                    <span>Page {currentPagePatients} of {Math.ceil(filteredPatients.length / patientsPerPage)}</span>
                    <button
                      onClick={() => setCurrentPagePatients(prev => Math.min(prev + 1, Math.ceil(filteredPatients.length / patientsPerPage)))}
                      disabled={currentPagePatients === Math.ceil(filteredPatients.length / patientsPerPage)}
                      className="pagination-button1"
                    >
                      Next
                    </button>
                  </div>

                  {editingPatientId && (
                    <div className="edit-patient-form-container1">
                      <h3>Edit Patient Details</h3>
                      <div className="form-row1">
                        <label>
                          First Name:
                          <input
                            type="text"
                            name="first_name"
                            value={editPatientForm.first_name}
                            onChange={handleEditPatientChange}
                          />
                        </label>
                        <label>
                          Last Name:
                          <input
                            type="text"
                            name="last_name"
                            value={editPatientForm.last_name}
                            onChange={handleEditPatientChange}
                          />
                        </label>
                      </div>
                      <div className="form-row1">
                        <label>
                          Password (leave blank to keep current):
                          <input
                            type="password"
                            name="password"
                            value={editPatientForm.password}
                            onChange={handleEditPatientChange}
                          />
                        </label>
                        <label>
                          Date of Birth:
                          <input
                            type="date"
                            name="date_of_birth"
                            value={editPatientForm.date_of_birth}
                            onChange={handleEditPatientChange}
                          />
                        </label>
                      </div>
                      <div className="form-row1">
                        <label>
                          Contact Info:
                          <input
                            type="text"
                            name="contact_info"
                            value={editPatientForm.contact_info}
                            onChange={handleEditPatientChange}
                          />
                        </label>
                      </div>
                      <div className="form-actions1">
                        <button className="action-button1" onClick={savePatientChanges}>Save Changes</button>
                        <button className="cancel-button1" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedListType === "doctors" && (
                <>
                  <h2>Master List of All Doctors</h2>
                  <input
                    type="text"
                    placeholder="Search doctors..."
                    className="search-input"
                    value={doctorSearchQuery}
                    onChange={(e) => {
                      setDoctorSearchQuery(e.target.value);
                      setCurrentPageDoctors(1); // Reset to first page on new search
                    }}
                  />
                  <table className="master-list1">
                    <thead>
                      <tr>
                        <th>Doctor Name</th>
                        <th>Specialization</th>
                        <th>Secretary</th>
                        <th>Email</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentDoctors.length > 0 ? (
                        currentDoctors.map((doctor) => (
                          <tr key={doctor.doctor_id}>
                            <td>{doctor.first_name} {doctor.last_name}</td>
                            <td>{doctor.specialization}</td>
                            <td>
                              {doctor.secretary_doctor_links?.[0]?.secretaries
                                ? `${doctor.secretary_doctor_links[0].secretaries.first_name} ${doctor.secretary_doctor_links[0].secretaries.last_name}`
                                : "N/A"}
                            </td>
                            <td>{doctor.email}</td>
                            <td>
                              <button className= "Editbutton1" onClick={() => handleEditDoctor(doctor)}>Edit</button>
                              <button className= "Viewbutton1" onClick={() => handleViewDoctor(doctor)}>View</button>
                              <button className= "Deletebutton1" onClick={() => handleDeleteDoctor(doctor.doctor_id)}>Delete</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No doctors found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pagination-controls1">
                    <button
                      onClick={() => setCurrentPageDoctors(prev => Math.max(prev - 1, 1))}
                      disabled={currentPageDoctors === 1}
                      className="pagination-button1"
                    >
                      Previous
                    </button>
                    <span>Page {currentPageDoctors} of {Math.ceil(filteredDoctorsForSearch.length / doctorsPerPage)}</span>
                    <button
                      onClick={() => setCurrentPageDoctors(prev => Math.min(prev + 1, Math.ceil(filteredDoctorsForSearch.length / doctorsPerPage)))}
                      disabled={currentPageDoctors === Math.ceil(filteredDoctorsForSearch.length / doctorsPerPage)}
                      className="pagination-button1"
                    >
                      Next
                    </button>
                  </div>

                  {editingDoctorId && (
                    <div className="edit-patient-form-container1">
                      <h3>Edit Doctor Details</h3>
                      <div className="form-row1">
                        <label>
                          First Name:
                          <input
                            type="text"
                            name="first_name"
                            value={editDoctorForm.first_name}
                            onChange={handleEditDoctorChange}
                          />
                        </label>
                        <label>
                          Last Name:
                          <input
                            type="text"
                            name="last_name"
                            value={editDoctorForm.last_name}
                            onChange={handleEditDoctorChange}
                          />
                        </label>
                      </div>
                      <div className="form-row1">
                        <label>
                          Email:
                          <input
                            type="email"
                            name="email"
                            value={editDoctorForm.email}
                            onChange={handleEditDoctorChange}
                          />
                        </label>
                        <label>
                          Password (leave blank to keep current):
                          <input
                            type="password"
                            name="password"
                            value={editDoctorForm.password}
                            onChange={handleEditDoctorChange}
                          />
                        </label>
                      </div>
                      <div className="form-row1">
                        <label>
                          Specialization:
                          <input
                            type="text"
                            name="specialization"
                            value={editDoctorForm.specialization}
                            onChange={handleEditDoctorChange}
                          />
                        </label>
                      </div>
                      <div className="form-actions1">
                        <button className="action-button1" onClick={saveDoctorChanges}>Save Changes</button>
                        <button className="cancel-button1" onClick={cancelDoctorEdit}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedListType === "secretaries" && (
                <>
                  <h2>Master List of All Secretaries</h2>
                  <input
                    type="text"
                    placeholder="Search secretaries..."
                    className="search-input"
                    value={secretarySearchQuery}
                    onChange={(e) => {
                      setSecretarySearchQuery(e.target.value);
                      setCurrentPageSecretaries(1); // Reset to first page on new search
                    }}
                  />
                  <table className="master-list1">
                    <thead>
                      <tr>
                        <th>Secretary Name</th>
                        <th>Email</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentSecretaries.length > 0 ? (
                        currentSecretaries.map((sec) => (
                          <tr key={sec.secretary_id}>
                            <td>{sec.first_name} {sec.last_name}</td>
                            <td>{sec.email}</td>
                            <td>
                              <button className= "Editbutton1" onClick={() => handleEditSecretary(sec)}>Edit</button>
                              <button className= "Viewbutton1" onClick={() => handleViewSecretary(sec)}>View</button>
                              <button className= "Deletebutton1" onClick={() => handleDeleteSecretary(sec.secretary_id)}>Delete</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3">No secretaries found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pagination-controls1">
                    <button
                      onClick={() => setCurrentPageSecretaries(prev => Math.max(prev - 1, 1))}
                      disabled={currentPageSecretaries === 1}
                      className="pagination-button1"
                    >
                      Previous
                    </button>
                    <span>Page {currentPageSecretaries} of {Math.ceil(filteredSecretaries.length / secretariesPerPage)}</span>
                    <button
                      onClick={() => setCurrentPageSecretaries(prev => Math.min(prev + 1, Math.ceil(filteredSecretaries.length / secretariesPerPage)))}
                      disabled={currentPageSecretaries === Math.ceil(filteredSecretaries.length / secretariesPerPage)}
                      className="pagination-button1"
                    >
                      Next
                    </button>
                  </div>

                  {editingSecretaryId && (
                    <div className="edit-patient-form-container1">
                      <h3>Edit Secretary Details</h3>
                      <div className="form-row1">
                        <label>
                          First Name:
                          <input
                            type="text"
                            name="first_name"
                            value={editSecretaryForm.first_name}
                            onChange={handleEditSecretaryChange}
                          />
                        </label>
                        <label>
                          Last Name:
                          <input
                            type="text"
                            name="last_name"
                            value={editSecretaryForm.last_name}
                            onChange={handleEditSecretaryChange}
                          />
                        </label>
                      </div>
                      <div className="form-row1">
                        <label>
                          Email:
                          <input
                            type="email"
                            name="email"
                            value={editSecretaryForm.email}
                            onChange={handleEditSecretaryChange}
                          />
                        </label>
                        <label>
                          Password (leave blank to keep current):
                          <input
                            type="password"
                            name="password"
                            value={editSecretaryForm.password}
                            onChange={handleEditSecretaryChange}
                          />
                        </label>
                      </div>
                      <div className="form-actions1">
                        <button className="action-button1" onClick={saveSecretaryChanges}>Save Changes</button>
                        <button className="cancel-button1" onClick={cancelSecretaryEdit}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {message && <p className="message1">{message}</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;