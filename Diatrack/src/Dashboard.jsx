// ✅ FULL UPDATED Dashboard.jsx WITH HEADER NAVIGATION (Notes replaced with Appointment Schedule)

import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./Dashboard.css";
import logo from '../picture/logo.png'; // Make sure this path is correct

const Dashboard = ({ user, onLogout }) => {
  const [activePage, setActivePage] = useState("dashboard");
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]); // Doctor's appointments
  const [patientAppointments, setPatientAppointments] = useState([]); // Patient-specific appointments
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientMetrics, setPatientMetrics] = useState([]);

  // New states for medication management
  const [patientMedications, setPatientMedications] = useState([]); // State for medications
  const [newMedication, setNewMedication] = useState({ name: '', dosage: '' }); // State for new medication input
  // Changed timeOfDay from string to array for checkboxes
  const [newMedicationFrequency, setNewMedicationFrequency] = useState({ timeOfDay: [], startDate: '' }); // State for new medication frequency input

  // New states for editing medication
  const [editingMedicationId, setEditingMedicationId] = useState(null);
  const [editMedicationData, setEditMedicationData] = useState({ name: '', dosage: '' });
  const [editMedicationFrequencyData, setEditMedicationFrequencyData] = useState({ timeOfDay: [], startDate: '' });


  useEffect(() => {
    if (activePage === "dashboard" || activePage === "patient-list") {
      fetchPatients();
    }
    if (activePage === "dashboard" || activePage === "appointments") {
        fetchAppointments();
    }
    if (activePage === "patient-profile" && selectedPatient) {
      fetchPatientDetails(selectedPatient.patient_id);
    }
  }, [activePage, user.doctor_id, selectedPatient]);

  const fetchPatients = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("preferred_doctor_id", user.doctor_id)
        .order("patient_id", { ascending: true });

      if (error) throw error;
      setPatients([...data]);
    } catch (err) {
      setError("Error fetching patients: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name)")
        .eq("doctor_id", user.doctor_id)
        .order("appointment_datetime", { ascending: true });

      if (error) throw error;
      setAppointments(data);
    } catch (err) {
      console.error("Error fetching appointments:", err);
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

      // Fetch medications for the patient, including their frequencies
      const { data: meds, error: medsError } = await supabase
        .from("medications")
        .select(`
            *,
            medication_frequencies (
                time_of_day,
                start_date
            )
        `)
        .eq("user_id", patientId) // 'user_id' in medications table refers to patient_id
        .order("created_at", { ascending: true });

      if (medsError) throw medsError;

      // Fetch ALL medication schedules for this patient's medications, ordered by date and time_of_day
      const { data: schedules, error: schedulesError } = await supabase
        .from("medication_schedules")
        .select("medication_id, date, time_of_day, taken")
        .in("medication_id", meds.map(m => m.id)) // Only fetch schedules for the medications found for this patient
        .order("date", { ascending: false }) // Order by date descending
        .order("time_of_day", { ascending: false }); // Then by time_of_day descending

      if (schedulesError) throw schedulesError;

      // Process to determine status for each medication based on its LATEST schedule
      const medicationsWithStatus = meds.map(med => {
        const relevantSchedules = schedules ? schedules.filter(s => s.medication_id === med.id) : [];

        let status = "N/A"; // Default status if no schedules found for this medication

        if (relevantSchedules.length > 0) {
          const latestSchedule = relevantSchedules[0];
          status = latestSchedule.taken ? "Taken" : "Not Yet";
        }

        return {
          ...med,
          overall_status: status // Add the calculated status to the medication object
        };
      });

      setPatientMedications(medicationsWithStatus);

      // --- NEW: Fetch appointments for the selected patient ---
      const { data: patientAppts, error: patientApptsError } = await supabase
        .from("appointments")
        .select("*") // Select all fields for the appointment
        .eq("patient_id", patientId)
        .order("appointment_datetime", { ascending: true }); // Order by date ascending

      if (patientApptsError) throw patientApptsError;
      setPatientAppointments(patientAppts);

    } catch (err) {
      setError("Error fetching patient details: " + err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      onLogout();
    }
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleViewClick = (patient) => {
    setSelectedPatient(patient);
    setActivePage("patient-profile");
  };

  const handleDeleteClick = async (patient) => {
    if (window.confirm(`Are you sure you want to delete patient ${patient.first_name} ${patient.last_name}?`)) {
      setLoading(true);
      setError("");
      try {
        const { error } = await supabase.from("patients").delete().eq("patient_id", patient.patient_id);

        if (error) {
          setError(`Error deleting patient: ${error.message}`);
        } else {
          alert("Patient deleted successfully!");
          fetchPatients();
        }
      } catch (err) {
        setError("Error deleting patient: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleNewMedicationInputChange = (e) => {
    const { name, value } = e.target;
    setNewMedication({ ...newMedication, [name]: value });
  };

  // Modified to handle checkboxes for timeOfDay
  const handleNewMedicationFrequencyChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "timeOfDay") {
      // If it's a checkbox for timeOfDay
      let updatedTimeOfDay = [...newMedicationFrequency.timeOfDay];
      if (checked) {
        updatedTimeOfDay.push(value);
      } else {
        updatedTimeOfDay = updatedTimeOfDay.filter((time) => time !== value);
      }
      setNewMedicationFrequency({ ...newMedicationFrequency, timeOfDay: updatedTimeOfDay });
    } else {
      // For other inputs like startDate
      setNewMedicationFrequency({ ...newMedicationFrequency, [name]: value });
    }
  };

  const handleAddMedication = async () => {
    // Check if medication name, dosage, and at least one time of day and start date are provided
    if (!newMedication.name || !newMedication.dosage || newMedicationFrequency.timeOfDay.length === 0 || !newMedicationFrequency.startDate) {
      alert("All medication fields (name, dosage, time, start date) must be filled, and at least one time must be selected.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Insert into medications table
      const { data: medication, error: medError } = await supabase
        .from("medications")
        .insert({
          user_id: selectedPatient.patient_id,
          name: newMedication.name,
          dosage: newMedication.dosage,
          prescribed_by: user.doctor_id, // Use the logged-in doctor's ID
        })
        .select()
        .single(); // Get the single inserted record

      if (medError) throw medError;

      // Insert into medication_frequencies table
      // time_of_day is now directly an array from state
      const { error: freqError } = await supabase
        .from("medication_frequencies")
        .insert({
          medication_id: medication.id,
          time_of_day: newMedicationFrequency.timeOfDay,
          start_date: newMedicationFrequency.startDate,
        });

      if (freqError) throw freqError;

      // Re-fetch patient details to get the newly added medication and its frequency details
      await fetchPatientDetails(selectedPatient.patient_id);
      setNewMedication({ name: '', dosage: '' }); // Clear medication input fields
      setNewMedicationFrequency({ timeOfDay: [], startDate: '' }); // Clear frequency input fields
      alert("Medication and frequency added successfully!");
    } catch (err) {
      console.error("Error adding medication:", err);
      setError("Error adding medication: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMedication = async (medId) => {
    if (window.confirm("Are you sure you want to remove this medication? This will also remove its associated frequencies.")) {
      setLoading(true);
      setError("");
      try {
        // First, remove associated frequencies
        const { error: freqError } = await supabase
          .from("medication_frequencies")
          .delete()
          .eq("medication_id", medId);

        if (freqError) throw freqError;

        // Then, remove the medication itself
        const { error: medError } = await supabase
          .from("medications")
          .delete()
          .eq("id", medId); // 'id' is the primary key for medications table

        if (medError) throw medError;

        // Re-fetch to update the UI
        await fetchPatientDetails(selectedPatient.patient_id);
        alert("Medication and its frequencies removed successfully!");
      } catch (err) {
        setError("Error removing medication: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleEditClick = (medication) => {
    setEditingMedicationId(medication.id);
    setEditMedicationData({
      name: medication.name,
      dosage: medication.dosage,
    });
    // Set edit frequency data, handling cases where frequency might not exist or is empty
    setEditMedicationFrequencyData({
      timeOfDay: medication.medication_frequencies && medication.medication_frequencies.length > 0
        ? medication.medication_frequencies[0].time_of_day
        : [],
      startDate: medication.medication_frequencies && medication.medication_frequencies.length > 0
        ? medication.medication_frequencies[0].start_date
        : ''
    });
  };

  const handleEditMedicationInputChange = (e) => {
    const { name, value } = e.target;
    setEditMedicationData({ ...editMedicationData, [name]: value });
  };

  const handleEditMedicationFrequencyChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "timeOfDay") {
      let updatedTimeOfDay = [...editMedicationFrequencyData.timeOfDay];
      if (checked) {
        updatedTimeOfDay.push(value);
      } else {
        updatedTimeOfDay = updatedTimeOfDay.filter((time) => time !== value);
      }
      setEditMedicationFrequencyData({ ...editMedicationFrequencyData, timeOfDay: updatedTimeOfDay });
    } else {
      setEditMedicationFrequencyData({ ...editMedicationFrequencyData, [name]: value });
    }
  };

  const handleSaveMedication = async (medId) => {
    if (!editMedicationData.name || !editMedicationData.dosage || editMedicationFrequencyData.timeOfDay.length === 0 || !editMedicationFrequencyData.startDate) {
      alert("All medication fields (name, dosage, time, start date) must be filled, and at least one time must be selected.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Update medications table
      const { error: medError } = await supabase
        .from("medications")
        .update({
          name: editMedicationData.name,
          dosage: editMedicationData.dosage,
        })
        .eq("id", medId);

      if (medError) throw medError;

      // Update medication_frequencies table
      // Assuming one frequency entry per medication for simplicity based on current structure
      const { error: freqError } = await supabase
        .from("medication_frequencies")
        .update({
          time_of_day: editMedicationFrequencyData.timeOfDay,
          start_date: editMedicationFrequencyData.startDate,
        })
        .eq("medication_id", medId); // Ensure you update the correct frequency entry

      if (freqError) throw freqError;

      await fetchPatientDetails(selectedPatient.patient_id); // Re-fetch to update the UI
      setEditingMedicationId(null); // Exit edit mode
      alert("Medication updated successfully!");
    } catch (err) {
      console.error("Error updating medication:", err);
      setError("Error updating medication: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingMedicationId(null);
    setEditMedicationData({ name: '', dosage: '' });
    setEditMedicationFrequencyData({ timeOfDay: [], startDate: '' });
  };

  const filteredPatients = patients.filter((patient) =>
    `${patient.first_name} ${patient.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderPatientList = () => (
    <div className="card patient-list-card">
        <h2>My Patients</h2>
        <div className="search-bar-patients">
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <i className="fas fa-search search-icon"></i>
          </div>
        <div className="table-responsive">
            <table className="patient-list-table">
              <thead>
                <tr>
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
      </div>
  );

  const renderAppointments = () => (
    <div className="card appointments-card">
        <h2>Upcoming Appointments</h2>
        <div className="table-responsive">
            <table className="appointment-list-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr><td colSpan="4">No upcoming appointments.</td></tr>
                ) : (
                  appointments.map((appt) => (
                    <tr key={appt.appointment_id}>
                      <td>{appt.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : "Unknown"}</td>
                      <td>{new Date(appt.appointment_datetime).toLocaleDateString()}</td>
                      <td>{new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{appt.notes || "N/A"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
      </div>
  );

  const renderDashboardContent = () => (
    <div className="dashboard-grid">
      {renderPatientList()}
      {renderAppointments()}
    </div>
  );

  const renderPatientProfile = () => {
    if (loading) return <div className="loading-message">Loading patient details...</div>;
    if (error) return <div className="error-message">{error}</div>;

    const latestMetric = patientMetrics.length > 0 ? patientMetrics[0] : null;

    return (
      <div className="patient-profile-wrapper">
        <div className="patient-profile-header">
          <h2>Patient Profile: {selectedPatient.first_name} {selectedPatient.last_name}</h2>
          <button className="back-button" onClick={() => setActivePage("dashboard")}>Back to Dashboard</button>
        </div>

        <div className="patient-profile-content-grid">
          <div className="card patient-details-card">
            <h3>Patient Information</h3>
            <div className="patient-info-display">
                <p><strong>Date of Birth:</strong> {selectedPatient.date_of_birth}</p>
                <p><strong>Contact Info:</strong> {selectedPatient.contact_info}</p>
                <p><strong>Risk Classification:</strong> <span className={`risk-classification ${selectedPatient.risk_classification}`}>{selectedPatient.risk_classification}</span></p>
                <p><strong>Phase:</strong> <span className={`phase ${selectedPatient.phase}`}>{selectedPatient.phase}</span></p>
                <p><strong>Preferred Doctor ID:</strong> {selectedPatient.preferred_doctor_id}</p>
            </div>
          </div>

          {latestMetric && (
            <div className="card latest-metrics-card">
              <h3>Latest Health Metrics</h3>
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
              </div>
            </div>
          )}

          {latestMetric && (latestMetric.wound_photo_url || latestMetric.food_photo_url) && (
            <div className="card assignments-card">
              <h3>Photos</h3>
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
          {/* New Medication Management Card */}
          <div className="card medication-card">
            <h3>Medication Management</h3>
            <div className="medication-input-group">
                <input
                    type="text"
                    name="name"
                    placeholder="Medication Name"
                    value={newMedication.name}
                    onChange={handleNewMedicationInputChange}
                    className="medication-input"
                />
                <input
                    type="text"
                    name="dosage"
                    placeholder="Dosage"
                    value={newMedication.dosage}
                    onChange={handleNewMedicationInputChange}
                    className="medication-input"
                />
                {/* Checkboxes for timeOfDay */}
                <div className="medication-checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            name="timeOfDay"
                            value="morning"
                            checked={newMedicationFrequency.timeOfDay.includes('morning')}
                            onChange={handleNewMedicationFrequencyChange}
                        /> Morning
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            name="timeOfDay"
                            value="noon"
                            checked={newMedicationFrequency.timeOfDay.includes('noon')}
                            onChange={handleNewMedicationFrequencyChange}
                        /> Noon
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            name="timeOfDay"
                            value="dinner"
                            checked={newMedicationFrequency.timeOfDay.includes('dinner')}
                            onChange={handleNewMedicationFrequencyChange}
                        /> Dinner
                    </label>
                </div>
                <input
                    type="date"
                    name="startDate"
                    value={newMedicationFrequency.startDate}
                    onChange={handleNewMedicationFrequencyChange}
                    className="medication-input"
                />
                <button onClick={handleAddMedication} className="add-medication-button">Add Medication</button>
            </div>

            <div className="medication-list table-responsive"> {/* Added table-responsive for overflow */}
                {patientMedications.length === 0 ? (
                    <p className="no-medication-text">No medications listed for this patient.</p>
                ) : (
                    <table className="medication-list-table">
                        <thead>
                            <tr>
                                <th>Medication Name</th>
                                <th>Dosage</th>
                                <th>Frequency</th>
                                <th>Start Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patientMedications.map((med) => (
                                <tr key={med.id}>
                                    {editingMedicationId === med.id ? (
                                        <>
                                            <td>
                                                <input
                                                    type="text"
                                                    name="name"
                                                    value={editMedicationData.name}
                                                    onChange={handleEditMedicationInputChange}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    name="dosage"
                                                    value={editMedicationData.dosage}
                                                    onChange={handleEditMedicationInputChange}
                                                />
                                            </td>
                                            <td>
                                                <div className="medication-checkbox-group-edit">
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            name="timeOfDay"
                                                            value="morning"
                                                            checked={editMedicationFrequencyData.timeOfDay.includes('morning')}
                                                            onChange={handleEditMedicationFrequencyChange}
                                                        /> M
                                                    </label>
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            name="timeOfDay"
                                                            value="noon"
                                                            checked={editMedicationFrequencyData.timeOfDay.includes('noon')}
                                                            onChange={handleEditMedicationFrequencyChange}
                                                        /> N
                                                    </label>
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            name="timeOfDay"
                                                            value="dinner"
                                                            checked={editMedicationFrequencyData.timeOfDay.includes('dinner')}
                                                            onChange={handleEditMedicationFrequencyChange}
                                                        /> D
                                                    </label>
                                                </div>
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    name="startDate"
                                                    value={editMedicationFrequencyData.startDate}
                                                    onChange={handleEditMedicationFrequencyChange}
                                                />
                                            </td>
                                            <td>
                                                {/* Empty cell to maintain column alignment in edit mode for the Status column */}
                                            </td>
                                            <td>
                                                <button
                                                    className="action-button save-button"
                                                    onClick={() => handleSaveMedication(med.id)}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    className="action-button cancel-button"
                                                    onClick={handleCancelEdit}
                                                >
                                                    Cancel
                                                </button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>{med.name}</td>
                                            <td>{med.dosage}</td>
                                            <td>
                                                {med.medication_frequencies && med.medication_frequencies.length > 0 ?
                                                    med.medication_frequencies.map((freq) => freq.time_of_day.join(', ')).join('; ')
                                                    : 'N/A'
                                                }
                                            </td>
                                            <td>
                                                {med.medication_frequencies && med.medication_frequencies.length > 0 ?
                                                    new Date(med.medication_frequencies[0].start_date).toLocaleDateString()
                                                    : 'N/A'
                                                }
                                            </td>
                                            <td>
                                                {med.overall_status || 'N/A'} {/* Use the new 'overall_status' property */}
                                            </td>
                                            <td>
                                                <button
                                                    className="remove-medication-button"
                                                    onClick={() => handleRemoveMedication(med.id)}
                                                >
                                                    Remove
                                                </button>
                                                <button
                                                    className="edit-medication-button"
                                                    onClick={() => handleEditClick(med)}
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
          </div>

          {/* REPLACED NOTES WITH APPOINTMENT SCHEDULE */}
          <div className="card appointment-schedule-card">
            <h3>Patient Appointment Schedule</h3>
            {patientAppointments.length === 0 ? (
              <p className="no-appointments-text">No appointments scheduled for this patient.</p>
            ) : (
              <div className="table-responsive">
                <table className="appointment-list-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientAppointments.map((appt) => (
                      <tr key={appt.appointment_id}>
                        <td>{new Date(appt.appointment_datetime).toLocaleDateString()}</td>
                        <td>{new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{appt.notes || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container-header-only">
      <header className="main-header">
        <div className="header-left">
          <img src={logo} alt="DiaTrack Logo" className="app-logo" />
          <span className="app-title">
            <span style={{ color: 'var(--primary-blue)' }}>Dia</span>
            <span style={{ color: 'var(--secondary-orange)' }}>Track</span>
          </span>
        </div>

        <nav className="header-nav">
          <ul>
            <li className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>
              <i className="fas fa-home"></i> <span>Dashboard</span>
            </li>
            <li className={activePage === "patient-list" ? "active" : ""} onClick={() => setActivePage("patient-list")}>
              <i className="fas fa-users"></i> <span>Patient List</span>
            </li>
            <li className={activePage === "reports" ? "active" : ""} onClick={() => setActivePage("reports")}>
              <i className="fas fa-chart-line"></i> <span>Reports</span>
            </li>
          </ul>
        </nav>

        <div className="header-right">
            <div className="header-icons">
                <i className="fas fa-bell notification-icon"></i>
                <i className="fas fa-envelope message-icon"></i>
            </div>
            <div className="user-profile-header">
                <img src="https://placehold.co/40x40/aabbcc/ffffff?text=User" alt="User Avatar" className="user-avatar" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}/>
                <div className="user-info-header">
                  <span className="user-name">{user ? `${user.first_name} ${user.last_name}` : 'Maria Batumbakal'}</span>
                  <span className="user-role">Doctor</span>
                </div>
            </div>
            <button className="signout-button-header" onClick={handleLogout}><i className="fas fa-sign-out-alt"></i> <span>Logout</span></button>
        </div>
      </header>

      <main className="content-area-full-width">
        <h1>Welcome, Dr. {user.first_name} 👋</h1>
        {activePage === "dashboard" && renderDashboardContent()}
        {activePage === "patient-profile" && selectedPatient && renderPatientProfile()}
        {activePage === "patient-list" && renderPatientList()}
        {activePage === "reports" && <div className="card reports-card"><h2>Reports Section</h2><p>Content for Reports...</p></div>}
      </main>
    </div>
  );
};

export default Dashboard;