// SetAppointment.jsx
import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./SetAppointments.css"; // Ensure this CSS file is created and imported

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24h) => {
  if (!time24h) return 'N/A';
  const [hours, minutes] = time24h.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = String(minutes).padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
};


const SetAppointment = ({ user, activePage, setActivePage, linkedDoctors }) => {
  const [appointmentForm, setAppointmentForm] = useState({
    doctorId: "",
    patientId: "",
    date: "",
    time: "",
    notes: ""
  });
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [appointmentsToday, setAppointmentsToday] = useState([]);
  const [patients, setPatients] = useState([]); // Needed to populate patient dropdown
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user && user.secretary_id) {
      fetchAllAppointments();
      fetchPatientsForDropdown();
    }
  }, [user]);

  // Fetch patients specific for the dropdown in appointment form
  const fetchPatientsForDropdown = async () => {
    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) {
      setPatients([]);
      return;
    }

    const { data, error } = await supabase
      .from("patients")
      .select("patient_id, first_name, last_name");

    if (!error) {
      // Filter patients by linked doctors if necessary, or just list all if a patient can be assigned to any doctor
      const filtered = data.filter(patient => doctorIds.includes(patient.preferred_doctor_id));
      setPatients(filtered);
    } else {
      console.error("Error fetching patients for dropdown:", error);
    }
  };


  const fetchAllAppointments = async () => {
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        appointment_id,
        appointment_datetime,
        notes,
        patient_id,
        doctor_id,
        patients (first_name, last_name),
        doctors (first_name, last_name)
      `)
      .eq("secretary_id", user.secretary_id)
      .order("appointment_datetime", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      setMessage(`Error fetching appointments: ${error.message}`);
    } else {
      setAppointmentsToday(data.map(app => {
        const formattedDatePart = app.appointment_datetime.split('T')[0];
        const formattedTimePart = app.appointment_datetime.substring(11, 16);
        return {
          ...app,
          patient_name: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : 'Unknown Patient',
          doctor_name: app.doctors ? `${app.doctors.first_name} ${app.doctors.last_name}` : 'Unknown Doctor',
          dateTimeDisplay: `${formattedDatePart} ${formatTimeTo12Hour(formattedTimePart)}`,
        };
      }));
    }
  };

  const handleAppointmentChange = (field, value) => {
    setAppointmentForm(prev => ({ ...prev, [field]: value }));
  };

  const saveAppointment = async () => {
    // Combine date and time into a single ISO string for Supabase timestamp
    const appointmentDateTime = `${appointmentForm.date}T${appointmentForm.time}:00`;

    const appointmentData = {
      doctor_id: appointmentForm.doctorId,
      patient_id: appointmentForm.patientId,
      appointment_datetime: appointmentDateTime,
      notes: appointmentForm.notes,
      secretary_id: user.secretary_id, // Assign the secretary's ID
    };

    let response;
    if (editingAppointmentId) {
      response = await supabase
        .from("appointments")
        .update(appointmentData)
        .eq("appointment_id", editingAppointmentId);
    } else {
      response = await supabase.from("appointments").insert([appointmentData]);
    }

    const { error } = response;

    if (!error) {
      setMessage(`Appointment ${editingAppointmentId ? "updated" : "set"} successfully!`);
      resetAppointmentForm();
      fetchAllAppointments(); // Refresh the list
    } else {
      console.error("Error saving appointment:", error);
      setMessage(`Error saving appointment: ${error.message}`);
    }
  };

  const handleEditAppointment = (appointment) => {
    setEditingAppointmentId(appointment.appointment_id);
    const datePart = appointment.appointment_datetime.split('T')[0];
    const timePart = appointment.appointment_datetime.substring(11, 16);

    setAppointmentForm({
      doctorId: appointment.doctor_id,
      patientId: appointment.patient_id,
      date: datePart,
      time: timePart,
      notes: appointment.notes || ""
    });
    // setActivePage("setAppointment"); // Stay on the set appointment page
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (window.confirm("Are you sure you want to delete this appointment?")) {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("appointment_id", appointmentId);

      if (!error) {
        setMessage("Appointment deleted successfully!");
        fetchAllAppointments(); // Refresh the list
      } else {
        console.error("Error deleting appointment:", error);
        setMessage(`Error deleting appointment: ${error.message}`);
      }
    }
  };

  const resetAppointmentForm = () => {
    setAppointmentForm({
      doctorId: "",
      patientId: "",
      date: "",
      time: "",
      notes: ""
    });
    setEditingAppointmentId(null);
  };

  return (
    <div className="set-appointment-container">
      {message && <div className="message">{message}</div>}

      {activePage === "setAppointment" && (
        <div className="appointments-section">
          <h2>{editingAppointmentId ? "Edit Appointment" : "Set New Appointment"}</h2>
          <form className="appointment-form" onSubmit={(e) => { e.preventDefault(); saveAppointment(); }}>
            <div className="form-group">
              <label htmlFor="patientId">Patient</label>
              <select
                id="patientId"
                value={appointmentForm.patientId}
                onChange={(e) => handleAppointmentChange("patientId", e.target.value)}
                required
              >
                <option value="">Select Patient</option>
                {patients.map((patient) => (
                  <option key={patient.patient_id} value={patient.patient_id}>
                    {patient.first_name} {patient.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="doctorId">Doctor</label>
              <select
                id="doctorId"
                value={appointmentForm.doctorId}
                onChange={(e) => handleAppointmentChange("doctorId", e.target.value)}
                required
              >
                <option value="">Select Doctor</option>
                {linkedDoctors.map((doctor) => (
                  <option key={doctor.doctor_id} value={doctor.doctor_id}>
                    {doctor.doctor_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="date">Date</label>
              <input
                type="date"
                id="date"
                value={appointmentForm.date}
                onChange={(e) => handleAppointmentChange("date", e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="time">Time</label>
              <input
                type="time"
                id="time"
                value={appointmentForm.time}
                onChange={(e) => handleAppointmentChange("time", e.target.value)}
                required
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="notes">Notes (Optional)</label>
              <textarea
                id="notes"
                value={appointmentForm.notes}
                onChange={(e) => handleAppointmentChange("notes", e.target.value)}
                rows="3"
              ></textarea>
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-button">
                {editingAppointmentId ? "Update Appointment" : "Set Appointment"}
              </button>
              {editingAppointmentId && (
                <button type="button" className="cancel-button" onClick={resetAppointmentForm}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <h3>All Appointments</h3>
          {appointmentsToday.length > 0 ? (
            <div className="appointment-table-container">
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Doctor Name</th>
                    <th>Date & Time</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointmentsToday.map((appt) => (
                    <tr key={appt.appointment_id}>
                      <td data-label="Patient Name">{appt.patient_name}</td>
                      <td data-label="Doctor Name">{appt.doctor_name}</td>
                      <td data-label="Date & Time">{appt.dateTimeDisplay}</td>
                      <td data-label="Notes">{appt.notes || 'N/A'}</td>
                      <td data-label="Actions" className="appointment-actions">
                        <button className="edit-button" onClick={() => handleEditAppointment(appt)}>
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button className="delete-button" onClick={() => handleDeleteAppointment(appt.appointment_id)}>
                          <i className="fas fa-trash-alt"></i> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No appointments scheduled.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SetAppointment;
