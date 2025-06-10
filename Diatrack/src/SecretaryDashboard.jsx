import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./SecretaryDashboard.css";
import logo from "../picture/logo.png"; // Import the logo image

const PatientSummaryWidget = ({ totalPatients, pendingLabResults, preOp, postOp }) => (
  <>
    <div className="summary-widget-grid">
      <div className="summary-widget total-patients">
        <div className="summary-widget-icon">
          <i className="fas fa-users"></i>
        </div>
        <div className="summary-widget-content">
          <h3>Total Patients</h3>
          {/* TODO: Implement dynamic fetching for totalPatients */}
          <p className="summary-number">{totalPatients}</p>
          <p className="summary-subtitle">Patients who have been registered to the system</p>
        </div>
      </div>
      <div className="summary-widget pending-lab-results">
        <div className="summary-widget-icon">
          <i className="fas fa-hourglass-half"></i>
        </div>
        <div className="summary-widget-content">
          <h3>Pending Lab Results</h3>
          {/* TODO: Implement dynamic fetching for pendingLabResults based on lab results table/status */}
          <p className="summary-number">{pendingLabResults}</p>
          <p className="summary-subtitle">Patients who have consulted the doctor, but still haven't turned over test results</p>
        </div>
      </div>
    </div>
    <div className="patient-categories-widget">
      <h3>Patient Categories</h3>
      <div className="category-bar-container">
        {/* These widths are hardcoded to match the image ratios for display, you might want to calculate them dynamically */}
        {/* TODO: Implement dynamic calculation for preOp and postOp based on patient status/category */}
        <div className="category-bar pre-op" style={{ width: `${(preOp / (preOp + postOp)) * 100}%` }}></div>
        <div className="category-bar post-op" style={{ width: `${(postOp / (preOp + postOp)) * 100}%` }}></div>
      </div>
      <div className="category-legend">
        <span><span className="legend-color pre-op-color"></span> Pre-Op ({preOp})</span>
        <span><span className="legend-color post-op-color"></span> Post-Op ({postOp})</span>
      </div>

      <h3>Pre-Op Risk Classes</h3>
      {/* TODO: Implement dynamic fetching for risk classes */}
      <div className="risk-class-item">
        <span className="risk-class-number">69</span>
        <div className="risk-bar-container">
          <div className="risk-bar low-risk" style={{ width: "70%" }}></div> {/* Placeholder width to match image */}
        </div>
        <span className="risk-label">Low Risk</span>
      </div>
      <div className="risk-class-item">
        <span className="risk-class-number">34</span>
        <div className="risk-bar-container">
          <div className="risk-bar moderate-risk" style={{ width: "30%" }}></div> {/* Placeholder width to match image */}
        </div>
        <span className="risk-label">Moderate Risk</span>
      </div>
      <div className="risk-class-item">
        <span className="risk-class-number">12</span>
        <div className="risk-bar-container">
          <div className="risk-bar high-risk" style={{ width: "10%" }}></div> {/* Placeholder width to match image */}
        </div>
        <span className="risk-label">High Risk</span>
      </div>
    </div>
  </>
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
    contactInfo: "",
    // Retaining all these fields for UI, but not sending to DB for now
    middleName: "",
    gender: "",
    address: "",
    emergencyContactNumber: "",
    diabetesType: "",
    allergies: "",
    currentMedications: "",
    footUlcersAmputation: "",
    eyeIssues: "",
    kidneyIssues: "",
    stroke: "",
    heartAttack: "",
    hypertensive: "",
    smokingStatus: "",
    monitoringFrequencyGlucose: "",
    lastDoctorVisit: "",
    lastEyeExam: "",
    preparedBy: "", // This will be set by the secretary's ID
  });
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [labEntryStep, setLabEntryStep] = useState(1);
  const [selectedPatientDetail, setSelectedPatientDetail] = useState(null);
  const [message, setMessage] = useState("");
  const [currentPatientStep, setCurrentPatientStep] = useState(0); // Re-added for multi-step form

  // Static values from the image for dashboard display - these are now placeholders
  const [totalPatientsCount, setTotalPatientsCount] = useState(0);
  const [pendingLabResultsCount, setPendingLabResultsCount] = useState(3);
  const [preOpCount, setPreOpCount] = useState(115);
  const [postOpCount, setPostOpCount] = useState(39);

  const [appointmentsToday, setAppointmentsToday] = useState([]);

  const [appointmentForm, setAppointmentForm] = useState({
    doctorId: "",
    patientId: "",
    date: "",
    time: "",
    notes: ""
  });

  const steps = [
    "Demographics",
    "Diabetes History",
    "Complication History",
    "Lifestyle",
    "Assignment",
  ];

  useEffect(() => {
    if (user && user.secretary_id) {
      fetchLinkedDoctors();
      fetchAppointmentsToday();
    } else {
      console.error("User or secretary_id is undefined");
      setMessage("Error: Secretary account not loaded properly.");
    }
  }, [user]);

  useEffect(() => {
    if (linkedDoctors.length > 0) {
      fetchPatients();
    } else if (linkedDoctors.length === 0 && user && user.secretary_id) {
      setPatients([]);
      setTotalPatientsCount(0);
    }
  }, [linkedDoctors, user]);

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
    if (doctorIds.length === 0) {
      setPatients([]);
      setTotalPatientsCount(0);
      return;
    }

    const { data, error } = await supabase
      .from("patients")
      .select("*, doctors (doctor_id, first_name, last_name)")
      .in("preferred_doctor_id", doctorIds);

    if (!error) {
      setPatients(data);
      setTotalPatientsCount(data.length);
    }
    else console.error(error);
  };

  const fetchAppointmentsToday = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        appointment_id,
        appointment_datetime,
        notes,
        patients (first_name, last_name),
        doctors (first_name, last_name)
      `)
      .eq("secretary_id", user.secretary_id)
      .gte("appointment_datetime", today.toISOString())
      .lt("appointment_datetime", tomorrow.toISOString())
      .order("appointment_datetime", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      setMessage(`Error fetching appointments: ${error.message}`);
    } else {
      setAppointmentsToday(data.map(app => ({
        ...app,
        patient_name: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : 'Unknown Patient',
        doctor_name: app.doctors ? `${app.doctors.first_name} ${app.doctors.last_name}` : 'Unknown Doctor',
        time: new Date(app.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })));
    }
  };

  const handleInputChange = (field, value) => {
    setPatientForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAppointmentChange = (field, value) => {
    setAppointmentForm(prev => ({ ...prev, [field]: value }));
  };

  const createPatient = async () => {
    if (currentPatientStep < steps.length - 1) {
      setMessage("Please complete all steps before creating the patient.");
      return;
    }

    if (!selectedDoctorId) {
      setMessage("Please select a doctor to assign the patient to.");
      return;
    }

    const confirmAction = window.confirm("Are you sure you want to create this patient?");
    if (!confirmAction) {
      setMessage("Action canceled by user.");
      return;
    }

    // Only send fields that are confirmed to be in the database
    const patientData = {
      first_name: patientForm.firstName,
      last_name: patientForm.lastName,
      email: patientForm.email,
      password: patientForm.password, // IMPORTANT: In a real app, hash this password!
      date_of_birth: patientForm.dateOfBirth,
      contact_info: patientForm.contactInfo,
      preferred_doctor_id: selectedDoctorId,
      // Do NOT include fields like middle_name, gender, address, diabetes_type, etc.,
      // as they are not yet confirmed in the database schema.
    };

    const { error } = await supabase.from("patients").insert([patientData]);

    if (error) setMessage(`Error creating patient: ${error.message}`);
    else {
      setMessage(`Patient ${patientForm.firstName} created successfully!`);
      // Reset form fields after creation
      setPatientForm({
        firstName: "", lastName: "", email: "", password: "", dateOfBirth: "", contactInfo: "",
        middleName: "", gender: "", address: "", emergencyContactNumber: "", diabetesType: "", allergies: "",
        currentMedications: "", footUlcersAmputation: "", eyeIssues: "", kidneyIssues: "", stroke: "",
        heartAttack: "", hypertensive: "", smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
        lastEyeExam: "", preparedBy: ""
      });
      setSelectedDoctorId("");
      setEditingPatientId(null);
      setCurrentPatientStep(0); // Reset step
      fetchPatients();
      setActivePage("dashboard");
    }
  };

  const handleEditPatient = (patient) => {
    // Populate form fields for editing with only existing database fields
    // Other fields in patientForm will remain at their default (empty) values
    setPatientForm({
      firstName: patient.first_name || "",
      lastName: patient.last_name || "",
      email: patient.email || "",
      password: patient.password || "", // Security warning: do not pre-fill passwords
      dateOfBirth: patient.date_of_birth || "",
      contactInfo: patient.contact_info || "",
      // Placeholder for other fields, they won't be filled from DB unless explicitly added
      middleName: "", gender: "", address: "", emergencyContactNumber: "", diabetesType: "", allergies: "",
      currentMedications: "", footUlcersAmputation: "", eyeIssues: "", kidneyIssues: "", stroke: "",
      heartAttack: "", hypertensive: "", smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
      lastEyeExam: "", preparedBy: ""
    });
    setSelectedDoctorId(patient.preferred_doctor_id || "");
    setEditingPatientId(patient.patient_id);
    setCurrentPatientStep(0); // Start from the first step for editing
    setActivePage("create-patient");
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

  const handleNextStep = () => {
    // Basic validation before moving to the next step
    if (currentPatientStep === 0) { // Demographics
      if (!patientForm.firstName || !patientForm.lastName || !patientForm.email || !patientForm.password || !patientForm.dateOfBirth || !patientForm.contactInfo) {
        setMessage("Please fill in all required demographic fields.");
        return;
      }
    }
    // Add more validation for other steps if needed
    if (currentPatientStep < steps.length - 1) {
      setCurrentPatientStep(currentPatientStep + 1);
      setMessage(""); // Clear message on step change
    }
  };

  const handlePreviousStep = () => {
    if (currentPatientStep > 0) {
      setCurrentPatientStep(currentPatientStep - 1);
      setMessage(""); // Clear message on step change
    }
  };

  const createAppointment = async () => {
    if (!appointmentForm.doctorId || !appointmentForm.patientId || !appointmentForm.date || !appointmentForm.time) {
      setMessage("Please fill in all required appointment fields.");
      return;
    }

    const appointmentDateTime = new Date(`${appointmentForm.date}T${appointmentForm.time}`);

    const { data, error } = await supabase
      .from("appointments")
      .insert([
        {
          doctor_id: appointmentForm.doctorId,
          patient_id: appointmentForm.patientId,
          secretary_id: user.secretary_id,
          appointment_datetime: appointmentDateTime.toISOString(),
          notes: appointmentForm.notes,
        },
      ]);

    if (error) {
      console.error("Error creating appointment:", error);
      setMessage(`Error scheduling appointment: ${error.message}`);
    } else {
      setMessage("Appointment scheduled successfully!");
      setAppointmentForm({ doctorId: "", patientId: "", date: "", time: "", notes: "" });
      fetchAppointmentsToday();
    }
  };

  const filteredPatients = patients.filter((pat) =>
    `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="dashboard-container">
      <div className="top-navbar">
        {/* Updated title to include logo and styled text */}
        <h1 className="app-title">
          <img src={logo} alt="DiaTrack Logo" className="app-logo" />
          <span style={{ color: 'var(--primary-blue)' }}>Dia</span>
          <span style={{ color: 'var(--secondary-orange)' }}>Track</span>
        </h1>
        <ul className="navbar-menu">
          <li className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>Dashboard</li>
          <li className={activePage === "patient-list" ? "active" : ""} onClick={() => setActivePage("patient-list")}>Patient List</li>
          <li className={activePage === "appointments" ? "active" : ""} onClick={() => setActivePage("appointments")}>Appointments</li>
          <li className={activePage === "reports" ? "active" : ""} onClick={() => setActivePage("reports")}>Reports</li>
        </ul>
        <div className="navbar-right">
          <div className="user-profile">
            {/* Using a placeholder image with a fallback */}
            <img src="https://placehold.co/40x40/aabbcc/ffffff?text=User" alt="User Avatar" className="user-avatar" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}/>
            <div className="user-info">
              <span className="user-name">{user ? `${user.first_name} ${user.last_name}` : 'Maria Batumbakal'}</span>
              <span className="user-role">Secretary</span>
            </div>
          </div>
          <div className="header-icons">
            <i className="fas fa-bell"></i>
            <i className="fas fa-envelope"></i>
            <button className="signout-button" onClick={() => {
              if (window.confirm("Are you sure you want to sign out?")) onLogout();
            }}><i className="fas fa-sign-out-alt"></i></button>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="dashboard-header-section">
          <h2 className="welcome-message">Welcome Back {user ? user.first_name : 'Maria'} 👋</h2>
          <p className="reports-info">Patient reports here always update in real time</p>
          <div className="header-actions">
            <div className="search-bar">
              <input type="text" placeholder="Search for patients here" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <i className="fas fa-search"></i>
            </div>
            <button className="create-new-patient-button" onClick={() => {
              setActivePage("create-patient");
              setPatientForm({ // Reset all fields
                firstName: "", lastName: "", email: "", password: "", dateOfBirth: "", contactInfo: "",
                middleName: "", gender: "", address: "", emergencyContactNumber: "", diabetesType: "", allergies: "",
                currentMedications: "", footUlcersAmputation: "", eyeIssues: "", kidneyIssues: "", stroke: "",
                heartAttack: "", hypertensive: "", smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
                lastEyeExam: "", preparedBy: ""
              });
              setSelectedDoctorId("");
              setEditingPatientId(null);
              setCurrentPatientStep(0); // Reset step
            }}>
              <i className="fas fa-plus"></i> Create New Patient
            </button>
          </div>
        </div>

        <div className="dashboard-content">
          {activePage === "dashboard" && (
            <div className="dashboard-columns-container">
              {/* Left Column */}
              <div className="dashboard-left-column">
                <div className="quick-links">
                  <h3>Quick links</h3>
                  <div className="quick-links-grid">
                    <div className="quick-link-item" onClick={() => setActivePage("lab-result-entry")}>
                      <div className="quick-link-icon lab-result">
                        <i className="fas fa-flask"></i>
                      </div>
                      <span>Lab Result Entry</span>
                    </div>
                    <div className="quick-link-item" onClick={() => setActivePage("appointments")}>
                      <div className="quick-link-icon set-appointment">
                        <i className="fas fa-calendar-plus"></i>
                      </div>
                      <span>Set Appointment</span>
                    </div>
                  </div>
                </div>

                <div className="widgets">
                  <h3>Widgets</h3>
                  <PatientSummaryWidget
                    totalPatients={totalPatientsCount}
                    pendingLabResults={pendingLabResultsCount}
                    preOp={preOpCount}
                    postOp={postOpCount}
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="dashboard-right-column">
                <div className="appointments-today">
                  <h3>Appointments Today</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Patient Name</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentsToday.length > 0 ? (
                        appointmentsToday.map((appointment) => (
                          <tr key={appointment.appointment_id}>
                            <td>{appointment.time}</td>
                            <td>{appointment.patient_name}</td>
                            <td className="appointment-actions">
                              No actions available without status
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3">No appointments today.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activePage === "create-patient" && (
            <div className="create-patient-section">
              <div className="create-patient-header">
                <h2>{editingPatientId ? "Edit Patient Account" : "Create Patient Account"}</h2>
                <button className="close-form-button" onClick={() => setActivePage("dashboard")}>
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Progress Indicator */}
              <div className="progress-indicator">
                {steps.map((step, index) => (
                  <React.Fragment key={step}>
                    <div className={`step ${index === currentPatientStep ? "active" : ""} ${index < currentPatientStep ? "completed" : ""}`}>
                      <div className="step-number">{index + 1}</div>
                      <div className="step-name">{step}</div>
                    </div>
                    {index < steps.length - 1 && <div className={`progress-line ${index < currentPatientStep ? "completed" : ""}`}></div>}
                  </React.Fragment>
                ))}
              </div>

              <div className="patient-form-content">
                {currentPatientStep === 0 && (
                  <div className="form-step demographics-form-step">
                    <h3>Demographics</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>First Name:</label>
                        <input className="patient-input" placeholder="First Name" value={patientForm.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Middle Name (Optional):</label>
                        <input className="patient-input" placeholder="Middle Name" value={patientForm.middleName} onChange={(e) => handleInputChange("middleName", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Last Name:</label>
                        <input className="patient-input" placeholder="Last Name" value={patientForm.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Email:</label>
                        <input className="patient-input" placeholder="Email" type="email" value={patientForm.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Password:</label>
                        <input className="patient-input" placeholder="Password" type="password" value={patientForm.password} onChange={(e) => handleInputChange("password", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Gender:</label>
                        <select className="patient-input" value={patientForm.gender} onChange={(e) => handleInputChange("gender", e.target.value)}>
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Date of Birth:</label>
                        <input className="patient-input" placeholder="Date of Birth" type="date" value={patientForm.dateOfBirth} onChange={(e) => handleInputChange("dateOfBirth", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Contact Info:</label>
                        <input className="patient-input" placeholder="Contact Info" value={patientForm.contactInfo} onChange={(e) => handleInputChange("contactInfo", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Address:</label>
                        <input className="patient-input" placeholder="Address" value={patientForm.address} onChange={(e) => handleInputChange("address", e.target.value)} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Emergency Contact Number:</label>
                        <input className="patient-input" placeholder="Emergency Contact Number" value={patientForm.emergencyContactNumber} onChange={(e) => handleInputChange("emergencyContactNumber", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {currentPatientStep === 1 && (
                  <div className="form-step diabetes-history-form-step">
                    <h3>Diabetes History</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Diabetes Type:</label>
                        <select className="patient-input" value={patientForm.diabetesType} onChange={(e) => handleInputChange("diabetesType", e.target.value)}>
                          <option value="">Select Type</option>
                          <option value="Type 1">Type 1</option>
                          <option value="Type 2">Type 2</option>
                          <option value="Gestational">Gestational</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Allergies:</label>
                        <input className="patient-input" placeholder="Allergies" value={patientForm.allergies} onChange={(e) => handleInputChange("allergies", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Current Medications:</label>
                        <input className="patient-input" placeholder="Current Medications" value={patientForm.currentMedications} onChange={(e) => handleInputChange("currentMedications", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {currentPatientStep === 2 && (
                  <div className="form-step complication-history-form-step">
                    <h3>Complication History</h3>
                    <div className="form-row">
                      <div className="form-group checkbox-group">
                        <input type="checkbox" id="footUlcers" checked={patientForm.footUlcersAmputation} onChange={(e) => handleInputChange("footUlcersAmputation", e.target.checked)} />
                        <label htmlFor="footUlcers">Foot Ulcers/Amputation</label>
                      </div>
                      <div className="form-group checkbox-group">
                        <input type="checkbox" id="eyeIssues" checked={patientForm.eyeIssues} onChange={(e) => handleInputChange("eyeIssues", e.target.checked)} />
                        <label htmlFor="eyeIssues">Eye Issues</label>
                      </div>
                      <div className="form-group checkbox-group">
                        <input type="checkbox" id="kidneyIssues" checked={patientForm.kidneyIssues} onChange={(e) => handleInputChange("kidneyIssues", e.target.checked)} />
                        <label htmlFor="kidneyIssues">Kidney Issues</label>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group checkbox-group">
                        <input type="checkbox" id="stroke" checked={patientForm.stroke} onChange={(e) => handleInputChange("stroke", e.target.checked)} />
                        <label htmlFor="stroke">Stroke</label>
                      </div>
                      <div className="form-group checkbox-group">
                        <input type="checkbox" id="heartAttack" checked={patientForm.heartAttack} onChange={(e) => handleInputChange("heartAttack", e.target.checked)} />
                        <label htmlFor="heartAttack">Heart Attack</label>
                      </div>
                      <div className="form-group checkbox-group">
                        <input type="checkbox" id="hypertensive" checked={patientForm.hypertensive} onChange={(e) => handleInputChange("hypertensive", e.target.checked)} />
                        <label htmlFor="hypertensive">Hypertensive</label>
                      </div>
                    </div>
                  </div>
                )}

                {currentPatientStep === 3 && (
                  <div className="form-step lifestyle-form-step">
                    <h3>Lifestyle</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Smoking Status:</label>
                        <select className="patient-input" value={patientForm.smokingStatus} onChange={(e) => handleInputChange("smokingStatus", e.target.value)}>
                          <option value="">Select Status</option>
                          <option value="Never Smoked">Never Smoked</option>
                          <option value="Former Smoker">Former Smoker</option>
                          <option value="Current Smoker">Current Smoker</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Monitoring Frequency (Glucose):</label>
                        <input className="patient-input" placeholder="e.g., Daily, Weekly" value={patientForm.monitoringFrequencyGlucose} onChange={(e) => handleInputChange("monitoringFrequencyGlucose", e.target.value)} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Last Doctor Visit:</label>
                        <input className="patient-input" type="date" value={patientForm.lastDoctorVisit} onChange={(e) => handleInputChange("lastDoctorVisit", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Last Eye Exam:</label>
                        <input className="patient-input" type="date" value={patientForm.lastEyeExam} onChange={(e) => handleInputChange("lastEyeExam", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {currentPatientStep === 4 && (
                  <div className="form-step assignment-form-step">
                    <h3>Assignment</h3>
                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Assign Doctor:</label>
                        <select className="doctor-select" value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
                          <option value="">Select Doctor</option>
                          {linkedDoctors.map((doc) => (
                            <option key={doc.doctor_id} value={doc.doctor_id}>{doc.doctor_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Prepared By:</label>
                        {/* This field is read-only and should display the current secretary's name */}
                        <input className="patient-input" type="text" value={user ? `${user.first_name} ${user.last_name}` : ''} readOnly />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {message && <p className="form-message">{message}</p>}

              <div className="form-navigation-buttons">
                {currentPatientStep > 0 && (
                  <button className="previous-step-button" onClick={handlePreviousStep}>Previous</button>
                )}
                {currentPatientStep < steps.length - 1 && (
                  <button className="next-step-button" onClick={handleNextStep}>Next</button>
                )}
                {currentPatientStep === steps.length - 1 && (
                  <button className="next-step-button" onClick={createPatient}>
                    {editingPatientId ? "Update Patient" : "Create Patient"}
                  </button>
                )}
                <button className="cancel-button" onClick={() => setActivePage("dashboard")}>Cancel</button>
              </div>
            </div>
          )}

          {activePage === "patient-list" && (
            <div className="patient-list-section">
              <h2>My Patients</h2>
              <table className="patient-table"> {/* Changed from ul to table */}
                <thead>
                  <tr>
                  <th>Patient Name</th>
                  <th>Age/Sex</th>
                  <th>Assigned Doctor</th>
                  <th>Classification</th>
                  <th>Lab Status</th>
                  <th>Profile Status</th>
                  <th>Last Visit</th>
                  <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((pat) => (
                      <tr key={pat.patient_id}>
                        <td>{pat.first_name}</td>
                        <td>{pat.last_name}</td>
                        <td>{pat.doctors ? `${pat.doctors.first_name} ${pat.doctors.last_name}` : 'Unknown'}</td>
                        <td>N/A</td>
                        <td>n/a</td>
                        <td>n/a</td>
                        <td>n/a</td>
                        <td className="patient-actions-cell"> {/* Added class for styling buttons */}
                          <button className="view-button" onClick={() => setSelectedPatientDetail(pat)}>View</button>
                          <button className="edit-button" onClick={() => handleEditPatient(pat)}>Edit</button>
                          <button className="delete-button" onClick={() => handleDeletePatient(pat.patient_id)}>Delete</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">No patients found.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {selectedPatientDetail && (
                <div className="patient-detail-card">
                  <h3>Patient Details</h3>
                  <p><strong>Name:</strong> {selectedPatientDetail.first_name} {selectedPatientDetail.last_name}</p>
                  <p><strong>Email:</strong> {selectedPatientDetail.email}</p>
                  <p><strong>Date of Birth:</strong> {selectedPatientDetail.date_of_birth}</p>
                  <p><strong>Contact Info:</strong> {selectedPatientDetail.contact_info}</p>
                  {/* These fields won't populate if they are not in the DB, but their placeholders are ready */}
                  <p><strong>Middle Name:</strong> {selectedPatientDetail.middle_name || 'N/A'}</p>
                  <p><strong>Gender:</strong> {selectedPatientDetail.gender || 'N/A'}</p>
                  <p><strong>Address:</strong> {selectedPatientDetail.address || 'N/A'}</p>
                  <p><strong>Emergency Contact:</strong> {selectedPatientDetail.emergency_contact_number || 'N/A'}</p>
                  <p><strong>Diabetes Type:</strong> {selectedPatientDetail.diabetes_type || 'N/A'}</p>
                  <p><strong>Allergies:</strong> {selectedPatientDetail.allergies || 'N/A'}</p>
                  <p><strong>Current Medications:</strong> {selectedPatientDetail.current_medications || 'N/A'}</p>
                  <p><strong>Foot Ulcers/Amputation:</strong> {selectedPatientDetail.foot_ulcers_amputation ? 'Yes' : 'No'}</p>
                  <p><strong>Eye Issues:</strong> {selectedPatientDetail.eye_issues ? 'Yes' : 'No'}</p>
                  <p><strong>Kidney Issues:</strong> {selectedPatientDetail.kidney_issues ? 'Yes' : 'No'}</p>
                  <p><strong>Stroke:</strong> {selectedPatientDetail.stroke ? 'Yes' : 'No'}</p>
                  <p><strong>Heart Attack:</strong> {selectedPatientDetail.heart_attack ? 'Yes' : 'No'}</p>
                  <p><strong>Hypertensive:</strong> {selectedPatientDetail.hypertensive ? 'Yes' : 'No'}</p>
                  <p><strong>Smoking Status:</strong> {selectedPatientDetail.smoking_status || 'N/A'}</p>
                  <p><strong>Glucose Monitoring Frequency:</strong> {selectedPatientDetail.monitoring_frequency_glucose || 'N/A'}</p>
                  <p><strong>Last Doctor Visit:</strong> {selectedPatientDetail.last_doctor_visit || 'N/A'}</p>
                  <p><strong>Last Eye Exam:</strong> {selectedPatientDetail.last_eye_exam || 'N/A'}</p>
                  <button className="close-details-button" onClick={() => setSelectedPatientDetail(null)}>Close Details</button>
                </div>
              )}
              {message && <p className="form-message">{message}</p>}
            </div>
          )}

          {activePage === "appointments" && (
            <div className="appointments-section">
              <h2>Schedule New Appointment</h2>
              <div className="form-group">
                <label>Select Doctor:</label>
                <select value={appointmentForm.doctorId} onChange={(e) => handleAppointmentChange("doctorId", e.target.value)}>
                  <option value="">Select Doctor</option>
                  {linkedDoctors.map(doc => (
                    <option key={doc.doctor_id} value={doc.doctor_id}>{doc.doctor_name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Select Patient:</label>
                <select value={appointmentForm.patientId} onChange={(e) => handleAppointmentChange("patientId", e.target.value)}>
                  <option value="">Select Patient</option>
                  {patients.map(pat => (
                    <option key={pat.patient_id} value={pat.patient_id}>{pat.first_name} {pat.last_name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Date:</label>
                <input type="date" value={appointmentForm.date} onChange={(e) => handleAppointmentChange("date", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Time:</label>
                <input type="time" value={appointmentForm.time} onChange={(e) => handleAppointmentChange("time", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes (optional):</label>
                <textarea placeholder="Notes (optional)" value={appointmentForm.notes} onChange={(e) => handleAppointmentChange("notes", e.target.value)} />
              </div>
              <button onClick={createAppointment}>Schedule Appointment</button>
              {message && <p className="form-message">{message}</p>}

            </div>
          )}

          {activePage === "lab-result-entry" && (
            <div className="lab-result-entry-section">
              <h2>Enter Patient Lab Results</h2>
              <p style={{ marginBottom: "25px", color: "#666", fontSize: "15px" }}>
                Input the patient's baseline laboratory values to support risk classification and care planning. Once submitted, values will be locked for data integrity.
              </p>

              <div className="lab-stepper">
                <div className="step active">
                  <div className="step-number">1</div>
                  <div className="step-label">Search Patient</div>
                </div>
                <div className="divider"></div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-label">Lab Input Form</div>
                </div>
                <div className="divider"></div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-label">Lock-in Data</div>
                </div>
              </div>

              {labEntryStep === 1 && (<div className="lab-patient-search">
                <div className="search-header">
                  <h4>Patient List</h4>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input type="text" placeholder="Search by name or Patient ID" />
                    <button><i className="fas fa-filter" style={{ marginRight: "5px" }}></i> Filter</button>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Age/Sex</th>
                      <th>Classification</th>
                      <th>Lab Status</th>
                      <th>Profile Status</th>
                      <th>Last Visit</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        name: "Mary Shanley Sencil", age: "21", sex: "F", class: "Not Available",
                        lab: "Awaiting", profile: "Pending", date: "June 9, 2025", action: "Enter Labs"
                      },
                      {
                        name: "Gio Anthony Callos", age: "21", sex: "M", class: "Not Available",
                        lab: "Requested", profile: "Pending", date: "June 9, 2025", action: "Update"
                      },
                      {
                        name: "Iloy Bugris", age: "46", sex: "F", class: "Not Available",
                        lab: "Requested", profile: "Pending", date: "June 9, 2025", action: "Update"
                      }
                    ].map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td>{p.age}/{p.sex}</td>
                        <td className="classification-not-available">❌ {p.class}</td>
                        <td className={p.lab === "Awaiting" ? "lab-status-awaiting" : "lab-status-requested"}>
                          {p.lab === "Awaiting" ? "❌" : "⚠️"} {p.lab}
                        </td>
                        <td>🟡 {p.profile}</td>
                        <td>{p.date}</td>
                        <td>
                          <button className="action-button" onClick={() => setLabEntryStep(2)}>
                            {p.action === "Enter Labs" ? "✏️ Enter Labs" : "🛠️ Update"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>)}

{labEntryStep === 2 && (
  <div className="lab-input-form">
    <div className="form-row">
      <div className="form-group">
        <label>Patient Name</label>
        <input type="text" value="Mary Shanley Sencil" readOnly />
      </div>
      <div className="form-group">
        <label>Date Submitted</label>
        <input type="date" />
      </div>
      <div className="form-group">
        <label>HbA1c (%)</label>
        <input type="text" />
      </div>
    </div>
    <div className="form-row">
      <div className="form-group">
        <label>Creatinine (umol/L)</label>
        <input type="text" />
      </div>
      <div className="form-group">
        <label>GOT (AST) - U/L</label>
        <input type="text" />
      </div>
      <div className="form-group">
        <label>GPT (ALT) - U/L</label>
        <input type="text" />
      </div>
    </div>
    <div className="form-row">
      <div className="form-group">
        <label>Cholesterol (mmol/L)</label>
        <input type="text" />
      </div>
      <div className="form-group">
        <label>Triglycerides (mmol/L)</label>
        <input type="text" />
      </div>
      <div className="form-group">
        <label>HDL Cholesterol (mmol/L)</label>
        <input type="text" />
      </div>
      <div className="form-group">
        <label>LDL Cholesterol (mmol/L)</label>
        <input type="text" />
      </div>
    </div>
    <div className="form-actions">
      <button className="previous-button" onClick={() => setLabEntryStep(1)}>Previous Step</button>
      <button className="next-button" onClick={() => setLabEntryStep(3)}>Next Step</button>

    </div>
  </div>
)}

            </div>
          )}
              {labEntryStep === 3 && (
              <div className="lab-lock-confirm">
                <div className="lock-container">
                  <div className="lock-image">
                    <img src="/assets/lock-check.png" alt="Locked Padlock" style={{ width: '140px', height: '140px' }} />
                  </div>
                  <div className="lock-text">
                    <h2 style={{ fontSize: '1.8rem', color: '#000', marginBottom: '10px' }}>Confirm Lab Result Submission</h2>
                    <p style={{ fontSize: '1rem', color: '#666', maxWidth: '500px', lineHeight: '1.6' }}>
                      Please take a moment to <strong>review all entered laboratory values</strong>.<br/>
                      If you need to make any corrections, you may go back to the previous step.<br/><br/>
                      <span style={{ color: '#007bff', fontWeight: '500' }}>
                        Once you finalize this entry, the <strong>lab results will be permanently locked</strong> and can no longer be edited.
                      </span>
                      This ensures clinical accuracy and audit compliance.
                    </p>
                    <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
                      <button
                        className="cancel-button"
                        style={{ padding: '12px 30px' }}
                        onClick={() => setLabEntryStep(2)}
                      >
                        Go Back to Edit
                      </button>
                      <button
                        className="create-new-patient-button"
                        style={{ padding: '12px 30px' }}
                        onClick={() => setLabEntryStep(4)} // Move to locked success modal
                      >
                        Confirm & Finalize
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          {activePage === "reports" && (
            <div className="reports-section">
              <h2>Reports</h2>
              <p>This section is a placeholder for generating various patient reports.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecretaryDashboard;