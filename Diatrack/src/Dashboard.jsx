// ✅ FULL UPDATED Dashboard.jsx WITH HEADER NAVIGATION (Notes replaced with Appointment Schedule) AND TREATMENT PLAN SUMMARY

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
  const [error, setError] = useState(""); // Corrected: Initialized with useState
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientMetrics, setPatientMetrics] = useState([]);
  const [patientLabs, setPatientLabs] = useState([]); // New state for patient lab results
  const [woundPhotos, setWoundPhotos] = useState([]); // New state for wound photos


  // New states for medication management (from previous iterations, for patient profile)
  const [patientMedications, setPatientMedications] = useState([]); // State for medications
  const [newMedication, setNewMedication] = useState({ name: '', dosage: '' }); // State for new medication input
  // Changed timeOfDay from string to array for checkboxes
  const [newMedicationFrequency, setNewMedicationFrequency] = useState({ timeOfDay: [], startDate: '' }); // State for new medication frequency input

  // New states for editing medication
  const [editingMedicationId, setEditingMedicationId] = useState(null);
  const [editMedicationData, setEditMedicationData] = useState({ name: '', dosage: '' });
  const [editMedicationFrequencyData, setEditMedicationFrequencyData] = useState({ timeOfDay: [], startDate: '' });

  // NEW: State for Treatment Plan forms (Step 1) - NOW ARRAYS FOR MULTIPLE ENTRIES
  const [diagnosisDetails, setDiagnosisDetails] = useState([{ id: Date.now(), text: '' }]); // Array of objects
  const [woundCareDetails, setWoundCareDetails] = useState([{ id: Date.now() + 1, text: '' }]);
  const [dressingDetails, setDressingDetails] = useState([{ id: Date.now() + 2, text: '' }]);

  // NEW: State for Treatment Plan forms (Step 2) - NOW ARRAYS FOR MULTIPLE ENTRIES
  const [medicationTreatmentPlan, setMedicationTreatmentPlan] = useState([{ id: Date.now() + 3, text: '' }]);
  const [importantNotes, setImportantNotes] = useState([{ id: Date.now() + 4, text: '' }]);
  const [followUpDetails, setFollowUpDetails] = useState([{ id: Date.now() + 5, text: '' }]);


  useEffect(() => {
    if (activePage === "dashboard" || activePage === "patient-list") {
      fetchPatients();
    }
    if (activePage === "dashboard" || activePage === "appointments" || activePage === "reports") { // Added 'reports' here
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
      // Filter appointments to only include future appointments
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name)")
        .eq("doctor_id", user.doctor_id)
        .gte("appointment_datetime", now) // Only fetch appointments from now onwards
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

      // Filter for wound photos and set the state
      const photos = metrics.filter(metric => metric.wound_photo_url).map(metric => ({
        url: metric.wound_photo_url,
        date: metric.submission_date,
        notes: metric.notes,
      }));
      setWoundPhotos(photos);


      // Fetch lab results for the patient
      const { data: labs, error: labsError } = await supabase
        .from("patient_labs")
        .select("*")
        .eq("patient_id", patientId)
        .order("date_submitted", { ascending: false }); // Changed to 'date_submitted'

      if (labsError) throw labsError;
      setPatientLabs(labs);

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
      setError("Error adding medication: "    + err.message);
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
      setError("Error updating medication: "    + err.message);
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
    <div className="card3 patient-list-card3">
        <h2>My Patients</h2>
        <div className="search-bar-patients3">
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <i className="fas fa-search search-icon3"></i>
          </div>
        <div className="table-responsive3">
            <table className="patient-list-table3">
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
                      <span className={`risk-classification3 ${patient.risk_classification}`}>
                        {patient.risk_classification}
                      </span>
                    </td>
                    <td>
                      <span className={`phase3 ${patient.phase}`}>
                        {patient.phase}
                      </span>
                    </td>
                    <td>
                      <button className="action-button3 view-button3" onClick={() => handleViewClick(patient)}>View</button>
                      <button className="action-button3 delete-button3" onClick={() => handleDeleteClick(patient)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>
  );

  const renderAppointments = () => (
    <div className="card3 appointments-card3">
        <h2>Upcoming Appointments</h2>
        <div className="table-responsive3">
            <table className="appointment-list-table3">
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
    <div className="dashboard-grid3">
      {renderPatientList()}
      {renderAppointments()}
    </div>
  );

  // NEW: Function to get counts of patients by risk classification
  const getPatientRiskCounts = () => {
    const counts = { Low: 0, Medium: 0, High: 0 };
    patients.forEach(patient => {
      if (counts.hasOwnProperty(patient.risk_classification)) {
        counts[patient.risk_classification]++;
      }
    });
    return counts;
  };

  // NEW: Helper function to get patient phase counts
  const getPatientPhaseCounts = () => {
    const counts = { 'Pre-Operative': 0, 'Post-Operative': 0 };
    patients.forEach(patient => {
      if (counts.hasOwnProperty(patient.phase)) {
        counts[patient.phase]++;
      }
    });
    return counts;
  };

  const phaseCounts = getPatientPhaseCounts(); // NEW: Get phase counts
  
  // NEW: Render Reports Content
  const renderReportsContent = () => {
    const riskCounts = getPatientRiskCounts();
    const maxCount = Math.max(riskCounts.Low, riskCounts.Medium, riskCounts.High);

    return (
      <div className="reports-grid3">
        <div className="card3 report-widget-card3">
          <div className="summary-widget-icon3">
            <i className="fas fa-users"></i>
          </div>
          <h3>Total Patients</h3>
          <p className="report-value3">{patients.length}</p>
        </div>
        <div className="card3 report-widget-card3">
          <div className="summary-widget-icon3">
            <i className="fas fa-calendar-alt"></i>
          </div>
          <h3>Upcoming Appointments</h3>
          <p className="report-value3">{appointments.length}</p>
        </div>

        {/* NEW: Risk Classification Bar Chart */}
        <div className="card3 risk-chart-card3">
          <h3>Patient Risk Classification</h3>
          <div className="bar-chart-container3">
            {Object.entries(riskCounts).map(([risk, count]) => (
              <div className="bar-chart-item3" key={risk}>
                <div className="bar-chart-label3">{risk}</div>
                <div className="bar-chart-bar-wrapper3">
                  <div
                    className={`bar-chart-bar3 ${risk.toLowerCase()}-risk-bar3`}
                    style={{ height: `${(count / (maxCount || 1)) * 100}%` }}
                    title={`${risk}: ${count} patients`}
                  ></div>
                </div>
                <div className="bar-chart-value3">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

    // NEW: Function to handle "Create Treatment Plan" button click
    const handleCreateTreatmentPlan = () => {
        // Find the latest wound photo if available
        const latestWoundPhoto = woundPhotos.length > 0 ? woundPhotos[0] : null;
        if (latestWoundPhoto) {
            // Set active page to 'treatment-plan' to render the new content
            setActivePage("treatment-plan");
        } else {
            alert("No wound photos available for this patient to create a treatment plan.");
        }
    };

    // NEW: Handlers for dynamic Diagnosis fields
    const handleAddDiagnosis = () => {
      setDiagnosisDetails([...diagnosisDetails, { id: Date.now(), text: '' }]);
    };

    const handleRemoveDiagnosis = (idToRemove) => {
      setDiagnosisDetails(diagnosisDetails.filter(diag => diag.id !== idToRemove));
    };

    const handleDiagnosisChange = (id, newText) => {
      setDiagnosisDetails(diagnosisDetails.map(diag =>
        diag.id === id ? { ...diag, text: newText } : diag
      ));
    };

    // (Add similar handlers for WoundCare, Dressing, MedicationTreatmentPlan, ImportantNotes, FollowUpDetails)
    const handleAddWoundCare = () => {
      setWoundCareDetails([...woundCareDetails, { id: Date.now(), text: '' }]);
    };
    const handleRemoveWoundCare = (idToRemove) => {
      setWoundCareDetails(woundCareDetails.filter(wc => wc.id !== idToRemove));
    };
    const handleWoundCareChange = (id, newText) => {
      setWoundCareDetails(woundCareDetails.map(wc =>
        wc.id === id ? { ...wc, text: newText } : wc
      ));
    };

    const handleAddDressing = () => {
      setDressingDetails([...dressingDetails, { id: Date.now(), text: '' }]);
    };
    const handleRemoveDressing = (idToRemove) => {
      setDressingDetails(dressingDetails.filter(d => d.id !== idToRemove));
    };
    const handleDressingChange = (id, newText) => {
      setDressingDetails(dressingDetails.map(d =>
        d.id === id ? { ...d, text: newText } : d
      ));
    };

    const handleAddMedicationTreatmentPlan = () => {
      setMedicationTreatmentPlan([...medicationTreatmentPlan, { id: Date.now(), text: '' }]);
    };
    const handleRemoveMedicationTreatmentPlan = (idToRemove) => {
      setMedicationTreatmentPlan(medicationTreatmentPlan.filter(mtp => mtp.id !== idToRemove));
    };
    const handleMedicationTreatmentPlanChange = (id, newText) => {
      setMedicationTreatmentPlan(medicationTreatmentPlan.map(mtp =>
        mtp.id === id ? { ...mtp, text: newText } : mtp
      ));
    };

    const handleAddImportantNotes = () => {
      setImportantNotes([...importantNotes, { id: Date.now(), text: '' }]);
    };
    const handleRemoveImportantNotes = (idToRemove) => {
      setImportantNotes(importantNotes.filter(notes => notes.id !== idToRemove));
    };
    const handleImportantNotesChange = (id, newText) => {
      setImportantNotes(importantNotes.map(notes =>
        notes.id === id ? { ...notes, text: newText } : notes
      ));
    };

    const handleAddFollowUpDetails = () => {
      setFollowUpDetails([...followUpDetails, { id: Date.now(), text: '' }]);
    };
    const handleRemoveFollowUpDetails = (idToRemove) => {
      setFollowUpDetails(followUpDetails.filter(fud => fud.id !== idToRemove));
    };
    const handleFollowUpDetailsChange = (id, newText) => {
      setFollowUpDetails(followUpDetails.map(fud =>
        fud.id === id ? { ...fud, text: newText } : fud
      ));
    };


    // NEW: Render Treatment Plan Content (Step 1)
    const renderTreatmentPlan = () => {
        const latestWoundPhoto = woundPhotos.length > 0 ? woundPhotos[0] : null;

        if (!selectedPatient) return <p>No patient selected for treatment plan.</p>;

        return (
            <div className="treatment-plan-wrapper3">
                <h2>Treatment Plan for {selectedPatient.first_name} {selectedPatient.last_name}</h2>
                  <div className="card3 patient-details-card3" style={{ marginBottom: '20px' }}>
                    <h3>Patient Information</h3>
                    <p><strong>Name:</strong> {selectedPatient.first_name} {selectedPatient.last_name}</p>
                    <p><strong>Date of Birth:</strong> {selectedPatient.date_of_birth}</p>
                    <p><strong>Contact Info:</strong> {selectedPatient.contact_info}</p>
                  </div>
                {latestWoundPhoto ? (
                    <div className="card3 latest-wound-photo-card3">
                        <h3>Latest Wound Photo</h3>
                        <img src={latestWoundPhoto.url} alt="Latest Wound" className="latest-wound-image3" />
                        <p><strong>Date:</strong> {new Date(latestWoundPhoto.date).toLocaleDateString()}</p>
                        <p><strong>Notes:</strong> {latestWoundPhoto.notes || 'N/A'}</p>
                    </div>
                ) : (
                    <div className="card3">
                        <p>No wound photos available for this patient.</p>
                    </div>
                )}

                <div className="forms-container3"> {/* New container for two-column forms */}
                    <div className="card3 diagnosis-form3"> {/* NEW: Diagnosis Form */}
                        <h3>Diagnosis</h3>
                        {diagnosisDetails.map((entry, index) => (
                          <div key={entry.id} className="dynamic-textarea-group3">
                            <textarea
                                placeholder="Enter diagnosis details..."
                                rows="4" // Reduced rows to accommodate buttons
                                value={entry.text}
                                onChange={(e) => handleDiagnosisChange(entry.id, e.target.value)}
                            ></textarea>
                          </div>
                        ))}
                    </div>
                    {/* NEW CONTAINER for Wound Care and Dressing to keep them side-by-side */}
                    <div className="wound-dressing-section3">
                        <div className="card3 wound-care-form3">
                            <h3>Wound Care</h3>
                            {woundCareDetails.map((entry, index) => (
                              <div key={entry.id} className="dynamic-textarea-group3">
                                <textarea
                                    placeholder="Enter wound care details..."
                                    rows="4"
                                    value={entry.text}
                                    onChange={(e) => handleWoundCareChange(entry.id, e.target.value)}
                                ></textarea>
                                <div className="dynamic-buttons3">
                                  <button onClick={handleAddWoundCare} className="add-button3">+</button>
                                  {woundCareDetails.length > 1 && (
                                    <button onClick={() => handleRemoveWoundCare(entry.id)} className="remove-button3">-</button>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                        <div className="card3 dressing-form3">
                            <h3>Dressing</h3>
                            {dressingDetails.map((entry, index) => (
                              <div key={entry.id} className="dynamic-textarea-group3">
                                <textarea
                                    placeholder="Enter dressing details..."
                                    rows="4"
                                    value={entry.text}
                                    onChange={(e) => handleDressingChange(entry.id, e.target.value)}
                                ></textarea>
                                <div className="dynamic-buttons3">
                                  <button onClick={handleAddDressing} className="add-button3">+</button>
                                  {dressingDetails.length > 1 && (
                                    <button onClick={() => handleRemoveDressing(entry.id)} className="remove-button3">-</button>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="treatment-plan-actions3">
                    <button className="cancel-button3" onClick={() => setActivePage("patient-profile")}>Cancel</button>
                    <button className="next-step-button3" onClick={() => setActivePage("treatment-plan-next-step")}>Next Step</button>
                </div>
            </div>
        );
    };

    // NEW: Render Next Step Forms (Medication, Important Notes, Follow-up)
    const renderNextStepForms = () => {
        if (!selectedPatient) return <p>No patient selected for treatment plan.</p>;

        const handleSaveTreatmentPlan = () => {
            // Here you would typically save the data to your backend
            // For now, we'll just navigate to the summary page
            setActivePage("treatment-plan-summary");
        };

        return (
            <div className="treatment-plan-wrapper3">
               
                <h2>Additional Treatment Plan Details for {selectedPatient.first_name} {selectedPatient.last_name}</h2>

                <div className="forms-container3"> {/* Using the same forms-container for consistent layout */}
                    <div className="card3 medication-treatment-form3">
                        <h3>Medication</h3>
                        {medicationTreatmentPlan.map((entry, index) => (
                          <div key={entry.id} className="dynamic-textarea-group3">
                            <textarea
                                placeholder="Enter medication details specific to this treatment plan..."
                                rows="4"
                                value={entry.text}
                                onChange={(e) => handleMedicationTreatmentPlanChange(entry.id, e.target.value)}
                            ></textarea>
                            <div className="dynamic-buttons3">
                              <button onClick={handleAddMedicationTreatmentPlan} className="add-button3">+</button>
                              {medicationTreatmentPlan.length > 1 && (
                                <button onClick={() => handleRemoveMedicationTreatmentPlan(entry.id)} className="remove-button3">-</button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="card3 important-notes-form3">
                        <h3>Important Notes</h3>
                        {importantNotes.map((entry, index) => (
                          <div key={entry.id} className="dynamic-textarea-group3">
                            <textarea
                                placeholder="Enter any important notes..."
                                rows="4"
                                value={entry.text}
                                onChange={(e) => handleImportantNotesChange(entry.id, e.target.value)}
                            ></textarea>
                            <div className="dynamic-buttons3">
                              <button onClick={handleAddImportantNotes} className="add-button3">+</button>
                              {importantNotes.length > 1 && (
                                <button onClick={() => handleRemoveImportantNotes(entry.id)} className="remove-button3">-</button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="card3 follow-up-form3">
                        <h3>Follow-up</h3>
                        {followUpDetails.map((entry, index) => (
                          <div key={entry.id} className="dynamic-textarea-group3">
                            <textarea
                                placeholder="Enter follow-up instructions or schedule..."
                                rows="4"
                                value={entry.text}
                                onChange={(e) => handleFollowUpDetailsChange(entry.id, e.target.value)}
                            ></textarea>
                            <div className="dynamic-buttons3">
                              <button onClick={handleAddFollowUpDetails} className="add-button3">+</button>
                              {followUpDetails.length > 1 && (
                                <button onClick={() => handleRemoveFollowUpDetails(entry.id)} className="remove-button3">-</button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                </div>

                <div className="treatment-plan-actions3">
                    <button className="cancel-button3" onClick={() => setActivePage("treatment-plan")}>Back</button> {/* Back button */}
                    <button className="next-step-button3" onClick={handleSaveTreatmentPlan}>Save Treatment Plan</button> {/* Final save button */}
                </div>
            </div>
        );
    };

    // NEW: Render Treatment Plan Summary
    const renderTreatmentPlanSummary = () => {
        if (!selectedPatient) return <p>No patient selected for treatment plan summary.</p>;

        const latestWoundPhoto = woundPhotos.length > 0 ? woundPhotos[0] : null;

        const handlePrint = () => {
            window.print();
        };

        const handleSend = () => {
            alert("Treatment Plan Sent!");
            // Here you would implement actual sending logic (e.g., via email API)
        };

        return (
            <div className="treatment-plan-wrapper3">
                <div className="patient-profile-header3">
                    <button className="back-button3" onClick={() => setActivePage("treatment-plan-next-step")}>Back to Edit Treatment Plan</button>
                </div>
                <h2>Treatment Plan Summary for {selectedPatient.first_name} {selectedPatient.last_name}</h2>

                {latestWoundPhoto && (
                    <div className="card3 latest-wound-photo-card3">
                        <h3>Latest Wound Photo</h3>
                        <img src={latestWoundPhoto.url} alt="Latest Wound" className="latest-wound-image3" />
                        <p><strong>Date:</strong> {new Date(latestWoundPhoto.date).toLocaleDateString()}</p>
                        <p><strong>Notes:</strong> {latestWoundPhoto.notes || 'N/A'}</p>
                    </div>
                )}

                <div className="forms-container3">
                    <div className="card3 diagnosis-form3"> {/* NEW: Diagnosis Summary */}
                        <h3>Diagnosis</h3>
                        {diagnosisDetails.length > 0 ? (
                            diagnosisDetails.map((entry, index) => (
                                <p key={entry.id}>{entry.text || 'N/A'}</p>
                            ))
                        ) : (
                            <p>N/A</p>
                        )}
                    </div>
                    <div className="card3 wound-care-form3">
                        <h3>Wound Care</h3>
                        {woundCareDetails.length > 0 ? (
                            woundCareDetails.map((entry, index) => (
                                <p key={entry.id}>{entry.text || 'N/A'}</p>
                            ))
                        ) : (
                            <p>N/A</p>
                        )}
                    </div>
                    <div className="card3 dressing-form3">
                        <h3>Dressing</h3>
                        {dressingDetails.length > 0 ? (
                            dressingDetails.map((entry, index) => (
                                <p key={entry.id}>{entry.text || 'N/A'}</p>
                            ))
                        ) : (
                            <p>N/A</p>
                        )}
                    </div>
                    <div className="card3 medication-treatment-form3">
                        <h3>Medication</h3>
                        {medicationTreatmentPlan.length > 0 ? (
                            medicationTreatmentPlan.map((entry, index) => (
                                <p key={entry.id}>{entry.text || 'N/A'}</p>
                            ))
                        ) : (
                            <p>N/A</p>
                        )}
                    </div>
                    <div className="card3 important-notes-form3">
                        <h3>Important Notes</h3>
                        {importantNotes.length > 0 ? (
                            importantNotes.map((entry, index) => (
                                <p key={entry.id}>{entry.text || 'N/A'}</p>
                            ))
                        ) : (
                            <p>N/A</p>
                        )}
                    </div>
                    <div className="card3 follow-up-form3">
                        <h3>Follow-up</h3>
                        {followUpDetails.length > 0 ? (
                            followUpDetails.map((entry, index) => (
                                <p key={entry.id}>{entry.text || 'N/A'}</p>
                            ))
                        ) : (
                            <p>N/A</p>
                        )}
                    </div>
                </div>

                <div className="treatment-plan-actions3">
                    <button className="send-button3" onClick={handleSend}>Send</button>
                    <button className="print-button3" onClick={handlePrint}>Print</button>
                </div>
            </div>
        );
    };


  const renderPatientProfile = () => {
    if (loading) return <div className="loading-message3">Loading patient details...</div>;
    if (error) return <div className="error-message3">{error}</div>;

    const latestMetric = patientMetrics.length > 0 ? patientMetrics[0] : null;
    const latestLab = patientLabs.length > 0 ? patientLabs[0] : null; // Get the latest lab result

    return (
      <div className="patient-profile-wrapper3">
        <div className="patient-profile-header3">
          <button className="back-button3" onClick={() => setActivePage("dashboard")}>Back to Dashboard</button>
        </div>

        <div className="patient-profile-content-grid3">
          <div className="card3 patient-details-card3">
              <h2>Patient Profile: {selectedPatient.first_name} {selectedPatient.last_name}</h2>
            <div className="patient-info-display3">
                <p><strong>Date of Birth:</strong> {selectedPatient.date_of_birth}</p>
                <p><strong>Contact Info:</strong> {selectedPatient.contact_info}</p>
                <p><strong>Gender:</strong> {selectedPatient.gender}</p>
                <p><strong>Diabetes Type:</strong> {selectedPatient.diabetes_type}</p>
                <p><strong>Smoking Status:</strong> {selectedPatient.smoking_status}</p>
                <p><strong>Last Doctor Visit:</strong> {selectedPatient.last_doctor_visit}</p>
                <p><strong>Risk Classification:</strong> <span className={`risk-classification3 ${selectedPatient.risk_classification}`}>{selectedPatient.risk_classification}</span></p>
                <p><strong>Phase:</strong> <span className={`phase3 ${selectedPatient.phase}`}>{selectedPatient.phase}</span></p>
            </div>
          </div>

          <div className="card3 latest-metrics-card3">
            <h3>Latest Health Metrics & Lab Results</h3>
            {(latestMetric && (latestMetric.blood_glucose || latestMetric.bp_systolic || latestMetric.bp_diastolic)) || latestLab ? (
              <div className="metric-cards-container3">
                {latestMetric && (latestMetric.blood_glucose || latestMetric.bp_systolic || latestMetric.bp_diastolic) ? (
                    <>
                        <div className="metric-card3 blood-glucose3">
                        <h4>Blood Glucose</h4>
                        <p className="metric-value3">{latestMetric.blood_glucose || 'No available data'}</p>
                        <span className="metric-unit3">mg/dL</span>
                        </div>
                        <div className="metric-card3 blood-pressure3">
                        <h4>Blood Pressure</h4>
                        <p className="metric-value3">
                            {(latestMetric.bp_systolic && latestMetric.bp_diastolic) ?
                            `${latestMetric.bp_systolic} / ${latestMetric.bp_diastolic}` :
                            'No available data'
                            }
                        </p>
                        <span className="metric-unit3">mmHg</span>
                        </div>
                    </>
                ) : null}

                {/* Display Latest Lab Results */}
                {latestLab ? (
                    <>
                        <div className="metric-card3">
                            <h4>Hba1c</h4>
                            <p className="metric-value3">{latestLab.Hba1c || 'N/A'}</p>
                            <span className="metric-unit3">%</span>
                        </div>
                        <div className="metric-card3">
                            <h4>Creatinine</h4>
                            <p className="metric-value3">{latestLab.creatinine || 'N/A'}</p>
                            <span className="metric-unit3">mg/dL</span>
                        </div>
                        <div className="metric-card3">
                            <h4>GOT (AST)</h4>
                            <p className="metric-value3">{latestLab.got_ast || 'N/A'}</p>
                            <span className="metric-unit3">U/L</span>
                        </div>
                        <div className="metric-card3">
                            <h4>GPT (ALT)</h4>
                            <p className="metric-value3">{latestLab.gpt_alt || 'N/A'}</p>
                            <span className="metric-unit3">U/L</span>
                        </div>
                        <div className="metric-card3">
                            <h4>Tryglycerides</h4>
                            <p className="metric-value3">{latestLab.triglycerides || 'N/A'}</p>
                            <span className="metric-unit3">mg/dL</span>
                        </div>
                        <div className="metric-card3">
                            <h4>HDL Cholesterol</h4>
                            <p className="metric-value3">{latestLab.hdl_cholesterol || 'N/A'}</p>
                            <span className="metric-unit3">mg/dL</span>
                        </div>
                        <div className="metric-card3">
                            <h4>LDL Cholesterol</h4>
                            <p className="metric-value3">{latestLab.ldl_cholesterol || 'N/A'}</p>
                            <span className="metric-unit3">mg/dL</span>
                        </div>
                        <div className="metric-card3">
                            <h4>Cholesterol</h4>
                            <p className="metric-value3">{latestLab.cholesterol || 'N/A'}</p>
                            <span className="metric-unit3">mg/dL</span>
                        </div>
                    </>
                ) : null}
              </div>
            ) : (
              <p>No available data for health metrics or lab results.</p>
            )}
          </div>

          {/* REPLACED NOTES WITH APPOINTMENT SCHEDULE */}
          <div className="card3 appointment-schedule-card3">
            <h3>Patient Appointment Schedule</h3>
            {patientAppointments.length === 0 ? (
              <p className="no-appointments-text3">No appointments scheduled for this patient.</p>
            ) : (
              <div className="table-responsive3">
                <table className="appointment-list-table3">
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

          {/* New Medication Management Card */}
          <div className="card3 medication-card3">
            <h3>Medication Management</h3>
            <div className="medication-input-group3">
                <input
                    type="text"
                    name="name"
                    placeholder="Medication Name"
                    value={newMedication.name}
                    onChange={handleNewMedicationInputChange}
                    className="medication-input3"
                />
                <input
                    type="text"
                    name="dosage"
                    placeholder="Dosage"
                    value={newMedication.dosage}
                    onChange={handleNewMedicationInputChange}
                    className="medication-input3"
                />
                {/* Checkboxes for timeOfDay */}
                <div className="medication-checkbox-group3">
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
                    className="medication-input3"
                />
                <button onClick={handleAddMedication} className="add-medication-button3">Add Medication</button>
            </div>

            <div className="medication-list3 table-responsive3"> {/* Added table-responsive for overflow */}
                {patientMedications.length === 0 ? (
                    <p className="no-medication-text3">No medications listed for this patient.</p>
                ) : (
                    <table className="medication-list-table3">
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
                                                <div className="medication-checkbox-group-edit3">
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
                                                    className="action-button3 save-button3"
                                                    onClick={() => handleSaveMedication(med.id)}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    className="action-button3 cancel-button3"
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
                                                    className="remove-medication-button3"
                                                    onClick={() => handleRemoveMedication(med.id)}
                                                >
                                                    Remove
                                                </button>
                                                <button
                                                    className="edit-medication-button3"
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
          <div className="card3 assignments-card3">
            <div className="wound-photo-button3"> {/* New div for header and button */}
                <h3>Wound Photos </h3>
                <button className="treatment-plan-button3" onClick={handleCreateTreatmentPlan}>
                    Create Treatment Plan
                </button>
            </div>
            {woundPhotos.length > 0 ? (
              <div className="photo-gallery3">
                {woundPhotos.map((photo, index) => (
                  <div className="photo-card3" key={index}>
                    <h4>Wound Photo</h4>
                    <img src={photo.url} alt={`Wound ${index}`} />
                    {photo.date && (
                        <p className="photo-date">Date: {new Date(photo.date).toLocaleDateString()}</p>
                    )}
                    {photo.notes && (
                        <p className="photo-notes">Notes: {photo.notes || 'Not Available'}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>No photos available for this patient.</p>
            )}
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container-header-only3">
      <header className="main-header3">
        <div className="header-left3">
          <img src={logo} alt="DiaTrack Logo" className="app-logo3" />
          <span className="app-title3">
            <span style={{ color: 'var(--primary-blue)' }}>Dia</span>
            <span style={{ color: 'var(--secondary-orange)' }}>Track</span>
          </span>
        </div>

        <nav className="header-nav3">
          <ul>
            <li className={activePage === "dashboard" ? "active3" : ""} onClick={() => setActivePage("dashboard")}>
              <i className="fas fa-home"></i> <span>Dashboard</span>
            </li>
            <li className={activePage === "patient-list" ? "active3" : ""} onClick={() => setActivePage("patient-list")}>
              <i className="fas fa-users"></i> <span>Patients</span>
            </li>
            <li className={activePage === "reports" ? "active3" : ""} onClick={() => setActivePage("reports")}>
              <i className="fas fa-chart-line"></i> <span>Reports</span>
            </li>
          </ul>
        </nav>

        <div className="header-right3">
            <div className="user-profile-header3">
                <img src="https://placehold.co/40x40/aabbcc/ffffff?text=User" alt="User Avatar" className="user-avatar3" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}/>
                <div className="user-info-header3">
                  <span className="user-name3">{user ? `${user.first_name} ${user.last_name}` : 'Maria Batumbakal'}</span>
                  <span className="user-role3">Doctor</span>
                </div>
            </div>
            <div className="header-icons3">
                <i className="fas fa-bell notification-icon3"></i>
                <i className="fas fa-envelope message-icon3"></i>
            </div>
            <button className="signout-button-header3" onClick={handleLogout}><i className="fas fa-sign-out-alt"></i> <span>Logout</span></button>
        </div>
      </header>

      <main className="content-area-full-width3">
        {activePage !== "patient-profile" && activePage !== "treatment-plan" && activePage !== "treatment-plan-next-step" && activePage !== "treatment-plan-summary" && (
          <h1>Welcome, Dr. {user.first_name} 👋</h1>
        )}
        {activePage === "dashboard" && renderDashboardContent()}
        {activePage === "patient-profile" && selectedPatient && renderPatientProfile()}
        {activePage === "patient-list" && renderPatientList()}
        {activePage === "reports" && renderReportsContent()}
        {activePage === "treatment-plan" && selectedPatient && renderTreatmentPlan()} {/* Render the first step of treatment plan */}
        {activePage === "treatment-plan-next-step" && selectedPatient && renderNextStepForms()} {/* Render the next step of treatment plan */}
        {activePage === "treatment-plan-summary" && selectedPatient && renderTreatmentPlanSummary()} {/* NEW: Render the summary page */}
      </main>
    </div>
  );
};

export default Dashboard;