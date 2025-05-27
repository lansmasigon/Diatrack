import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./Dashboard.css";

const Dashboard = ({ user, onLogout }) => {
  const [activeSection, setActiveSection] = useState("doctor-dashboard");
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientMetrics, setPatientMetrics] = useState([]);
  const [editingPatientDetails, setEditingPatientDetails] = useState(false);
  const [editedPatientData, setEditedPatientData] = useState({});

  useEffect(() => {
    if (activeSection === "doctor-dashboard") {
      fetchPatients();
    } else if (activeSection === "patient-profile" && selectedPatient) {
      fetchPatientDetails(selectedPatient.patient_id);
      setEditedPatientData({ ...selectedPatient });
    }
  }, [activeSection, user.doctor_id, selectedPatient]);

  const fetchPatients = async () => {
    setLoading(true);
    setError("");
    try {
      if (!user || !user.doctor_id) {
        setError("Doctor ID is not available.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("preferred_doctor_id", user.doctor_id)
        .order("patient_id", { ascending: true });

      if (error) throw error;
      setPatients([...data]);
    } catch (err) {
      setError("Error fetching data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientDetails = async (patientId) => {
    setLoading(true);
    setError("");
    try {
      const { data: metrics, error: metricsError } = await supabase
        .from("health_metrics")
        .select("*")
        .eq("patient_id", patientId)
        .order("submission_date", { ascending: false });

      if (metricsError) throw metricsError;
      setPatientMetrics(metrics);
    } catch (err) {
      setError("Error fetching patient details: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    onLogout();
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleViewClick = (patient) => {
    setSelectedPatient(patient);
    setActiveSection("patient-profile");
  };

  const handleDeleteClick = async (patient) => {
    if (window.confirm(`Are you sure you want to delete patient ${patient.first_name} ${patient.last_name}?`)) {
      setLoading(true);
      setError("");
      try {
        const { error } = await supabase
          .from("patients")
          .delete()
          .eq("patient_id", patient.patient_id);

        if (error) {
          console.error("Supabase Delete Error:", error);
          setError(`Error deleting patient: ${error.message}`);
        } else {
          alert("Patient deleted successfully!");
          fetchPatients();
        }
      } catch (err) {
        console.error("Frontend Delete Error:", err);
        setError("Error deleting patient: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePatientInputChange = (e) => {
    const { name, value } = e.target;
    setEditedPatientData({ ...editedPatientData, [name]: value });
  };

  const handleUpdatePatientDetails = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("patients")
        .update(editedPatientData)
        .match({ patient_id: selectedPatient.patient_id })
        .select();

      if (error) {
        console.error("Supabase Update Error:", error);
        setError("Error updating patient details: " + error.message);
        return;
      }

      setSelectedPatient(data[0]);
      setEditingPatientDetails(false);
      alert("Patient details updated successfully!");
    } catch (err) {
      console.error("Frontend Update Error:", err);
      setError("Error updating patient details: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter((patient) =>
    `${patient.first_name} ${patient.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderDoctorDashboard = () => {
    if (loading) return <div>Loading patients...</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (filteredPatients.length === 0 && searchTerm) return <div>No patients found matching your search.</div>;
    if (patients.length === 0 && !searchTerm) return <div>No patients found assigned to you.</div>;

    return (
      <div className="table-responsive">
        <h2>My Patients</h2>
        <table className="patient-list">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Patient Name</th>
              <th>Date of Birth</th>
              <th>Contact Info</th>
              <th>Risk</th>
              <th>Phase</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((patient) => (
              <tr key={patient.patient_id}>
                <td>{patient.patient_id}</td>
                <td>{patient.first_name} {patient.last_name}</td>
                <td>{patient.date_of_birth}</td>
                <td>{patient.contact_info}</td>
                <td>
                  <span className={`risk-classification ${patient.risk_classification}`}>
                    {patient.risk_classification}
                  </span>
                </td>
                <td>
                  <span className={`phase ${patient.phase}`}>
                    {patient.phase}
                  </span>
                </td>
                <td>
                  <button className="action-button view-button" onClick={() => handleViewClick(patient)}>View</button>
                  <button className="action-button delete-button" onClick={() => handleDeleteClick(patient)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPatientProfile = () => {
    if (loading) return <div>Loading patient details...</div>;
    if (error) return <div className="error-message">{error}</div>;

    const latestMetric = patientMetrics.length > 0 ? patientMetrics[0] : null;

    return (
      <div className="patient-profile-layout">
        <div className="patient-profile-main-content">
          <h2>Patient Profile: {selectedPatient.first_name} {selectedPatient.last_name}</h2>

          {latestMetric && (
            <div className="latest-metrics-summary">
              <h3>Latest Health Metrics (as of {latestMetric.submission_date})</h3>
              <div className="metric-cards-container">
                <div className="metric-card blood-glucose">
                  <h4>Blood Glucose</h4>
                  <p className="metric-value">{latestMetric.blood_glucose || 'N/A'}</p>
                  <span className="metric-unit">mg/dL</span>
                </div>
                <div className="metric-card blood-pressure">
                  <h4>Blood Pressure</h4>
                  <p className="metric-value">{latestMetric.bp_systolic || 'N/A'} / {latestMetric.bp_diastolic || 'N/A'}</p>
                  <span className="metric-unit">mmHg</span>
                </div>
                <div className="metric-card pulse-rate">
                  <h4>Pulse Rate</h4>
                  <p className="metric-value">{latestMetric.pulse_rate || 'N/A'}</p>
                  <span className="metric-unit">bpm</span>
                </div>
              </div>

              {/* Always show medication section, even if empty */}
              <div className="latest-medication-display">
                <h4>Medication</h4>
                {editingPatientDetails ? (
                  <input
                    type="text"
                    name="medication"
                    value={editedPatientData.medication || ""}
                    onChange={handlePatientInputChange}
                  />
                ) : (
                  <p>{selectedPatient.medication || "No medication data available"}</p>
                )}
              </div>
            </div>
          )}

          {latestMetric && (latestMetric.wound_photo_url || latestMetric.food_photo_url) && (
            <div className="patient-images-section">
              <h3>Associated Photos</h3>
              <div className="photo-gallery">
                {latestMetric.wound_photo_url && (
                  <div className="photo-card">
                    <h4>Latest Wound Photo</h4>
                    <img src={latestMetric.wound_photo_url} alt="Latest Wound" />
                  </div>
                )}
                {latestMetric.food_photo_url && (
                  <div className="photo-card">
                    <h4>Latest Food Photo</h4>
                    <img src={latestMetric.food_photo_url} alt="Latest Food" />
                  </div>
                )}
              </div>
            </div>
          )}

          {editingPatientDetails ? (
            <div className="patient-profile-actions">
              <button onClick={handleUpdatePatientDetails}>Save</button>
              <button onClick={() => setEditingPatientDetails(false)}>Cancel</button>
            </div>
          ) : (
            <button className="edit-medication-button" onClick={() => setEditingPatientDetails(true)}>Edit Medication</button>
          )}

          <button onClick={() => setActiveSection("doctor-dashboard")}>Back to Dashboard</button>
        </div>

        <div className="patient-profile-right-sidebar">
          <div className="card combined-health-info-card">
            <div className="card-header">
              <h3>Wound Healing Progress</h3>
              <select className="timeframe-select">
                <option value="last-week">Last Week</option>
                <option value="last-month">Last Month</option>
                <option value="last-3-months">Last 3 Months</option>
              </select>
            </div>
            <div className="card-content">
              <div className="progress-meter">
                <div className="meter-item">
                  <span className="meter-label">Moderate Risk</span>
                  <div className="meter-value-container">
                    <span className="meter-value">70</span>
                    <span className="meter-unit">mg/dL</span>
                  </div>
                </div>
                <div className="meter-item">
                  <span className="meter-value-large">24.9</span>
                  <span className="healthy-indicator">You're Healthy</span>
                </div>
              </div>
              <div className="small-metrics">
                <div className="small-metric-item">
                  <img src="path/to/icon1.png" alt="Icon 1" />
                  <span>39 bpm</span>
                </div>
                <div className="small-metric-item">
                  <img src="path/to/icon2.png" alt="Icon 2" />
                  <span>39 bpm</span>
                </div>
              </div>
            </div>

            <hr className="card-section-divider" />

            <div className="card-header">
              <h3>Notes</h3>
            </div>
            <div className="card-content">
              {latestMetric && latestMetric.notes && (
                <div className="latest-notes-card">
                  <div className="card-header">
                    <h3>Notes for this entry</h3>
                  </div>
                  <div className="card-content">
                    <p>{latestMetric.notes}</p>
                  </div>
                </div>
              )}
              <div className="diabetes-visuals">
                <div className="foot-wound-image">
                  <img src="path/to/foot-wound.png" alt="Foot Wound" />
                </div>
                <div className="patient-body-illustration">
                  <img src="path/to/patient-body.png" alt="Patient Body" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="fixed-sidebar">
        <h1 className="app-title">
          <span style={{ color: '#00aaff' }}>DIA</span>
          <span style={{ color: '#ff9800' }}>TRACK</span>
        </h1>
        <ul>
          <li onClick={() => setActiveSection("doctor-dashboard")}>Doctor's Dashboard</li>
          <li onClick={() => setActiveSection("patient-profile")}>Patient Profile</li>
          <li onClick={() => setActiveSection("reports")}>Reports</li>
          <li onClick={() => setActiveSection("integrations")}>Integrations</li>
        </ul>
        <button className="signout" onClick={handleLogout}>Sign Out</button>
      </div>
      <div className="header">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search patients..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>
      <div className="main-content">
        <h1>Welcome, Dr. {user.first_name}</h1>
        {activeSection === "doctor-dashboard" && renderDoctorDashboard()}
        {activeSection === "patient-profile" && renderPatientProfile()}
      </div>
    </div>
  );
};

export default Dashboard;
