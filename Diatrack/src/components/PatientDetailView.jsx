import React, { useState, useEffect } from "react";
import supabase from "../supabaseClient";
import Pagination from "./Pagination";
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import "./PatientDetailView.css";

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler);

// Constants
const HEALTH_METRICS_PER_PAGE = 10;
const PATIENT_DETAIL_APPOINTMENTS_PER_PAGE = 5;

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24h) => {
  if (!time24h) return 'N/A';
  const [hours, minutes] = time24h.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = String(minutes).padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
};

// Helper function to format date to "Month Day, Year" format
const formatDateToReadable = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    return 'N/A';
  }
};

// Helper function to format date for charts (MMM DD, YYYY)
const formatDateForChart = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    return 'N/A';
  }
};

// Helper function to filter metrics by time period
const filterMetricsByTimePeriod = (metrics, filter) => {
  if (!metrics || metrics.length === 0) return [];
  
  const now = new Date();
  let cutoffDate;

  switch (filter) {
    case 'day':
      cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return metrics;
  }

  return metrics.filter(metric => {
    const metricDate = new Date(metric.submission_date);
    return metricDate >= cutoffDate;
  });
};

const PatientDetailView = ({
  patient,
  userRole, // "Doctor" or "Secretary"
  onClose,
  onUpdatePatient, // Function to update patient demographics (Secretary only)
  onEditSpecialist, // Function to edit specialist assignments
  user, // Current logged-in user
}) => {
  // State for active tab
  const [activeTab, setActiveTab] = useState("profile");
  
  // State for patient data
  const [patientHealthMetrics, setPatientHealthMetrics] = useState({ bloodGlucoseLevel: 'N/A', bloodPressure: 'N/A' });
  const [allPatientHealthMetrics, setAllPatientHealthMetrics] = useState([]);
  const [patientLabResults, setPatientLabResults] = useState({});
  const [lastLabDate, setLastLabDate] = useState(null);
  const [patientMedications, setPatientMedications] = useState([]);
  const [patientAppointments, setPatientAppointments] = useState([]);
  const [currentPatientSpecialists, setCurrentPatientSpecialists] = useState([]);
  const [allWoundPhotos, setAllWoundPhotos] = useState([]);
  const [woundPhotosLoading, setWoundPhotosLoading] = useState(false);
  
  // State for time filters
  const [glucoseTimeFilter, setGlucoseTimeFilter] = useState('week');
  const [bpTimeFilter, setBpTimeFilter] = useState('week');
  const [riskTimeFilter, setRiskTimeFilter] = useState('week');
  const [riskScoreTimeFilter, setRiskScoreTimeFilter] = useState('week');
  
  // State for pagination
  const [currentPageHealthMetrics, setCurrentPageHealthMetrics] = useState(1);
  const [currentPagePatientDetailAppointments, setCurrentPagePatientDetailAppointments] = useState(1);
  
  // State for calendar
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  // State for expanded photo
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  
  // Loading state
  const [loading, setLoading] = useState(true);

  // Filtered metrics based on time filters
  const glucoseFilteredMetrics = filterMetricsByTimePeriod(allPatientHealthMetrics, glucoseTimeFilter);
  const bpFilteredMetrics = filterMetricsByTimePeriod(allPatientHealthMetrics, bpTimeFilter);
  const riskFilteredMetrics = filterMetricsByTimePeriod(allPatientHealthMetrics, riskTimeFilter);
  const riskScoreFilteredMetrics = filterMetricsByTimePeriod(allPatientHealthMetrics, riskScoreTimeFilter);

  // Pagination for health metrics
  const totalHealthMetricsPages = Math.ceil(allPatientHealthMetrics.length / HEALTH_METRICS_PER_PAGE);
  const paginatedHealthMetrics = allPatientHealthMetrics.slice(
    (currentPageHealthMetrics - 1) * HEALTH_METRICS_PER_PAGE,
    currentPageHealthMetrics * HEALTH_METRICS_PER_PAGE
  );

  // Fetch patient data on mount
  useEffect(() => {
    if (patient?.patient_id) {
      fetchPatientData();
    }
  }, [patient?.patient_id]);

  const fetchPatientData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchHealthMetrics(),
        fetchLabResults(),
        fetchMedications(),
        fetchAppointments(),
        fetchSpecialists(),
        fetchWoundPhotos()
      ]);
    } catch (error) {
      console.error("Error fetching patient data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealthMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from('health_metrics')
        .select('*')
        .eq('patient_id', patient.patient_id)
        .order('submission_date', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setAllPatientHealthMetrics(data);
        const latest = data[0];
        setPatientHealthMetrics({
          bloodGlucoseLevel: latest.blood_glucose || 'N/A',
          bloodPressure: latest.bp_systolic && latest.bp_diastolic 
            ? `${latest.bp_systolic}/${latest.bp_diastolic}` 
            : 'N/A'
        });
      }
    } catch (error) {
      console.error("Error fetching health metrics:", error);
    }
  };

  const fetchLabResults = async () => {
    try {
      const { data, error } = await supabase
        .from('laboratory_results')
        .select('*')
        .eq('patient_id', patient.patient_id)
        .order('date_submitted', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const lab = data[0];
        setPatientLabResults({
          Hba1c: lab.Hba1c,
          UCR: lab.ucr,
          gotAst: lab.got_ast,
          gptAlt: lab.gpt_alt,
          cholesterol: lab.cholesterol,
          triglycerides: lab.triglycerides,
          hdlCholesterol: lab.hdl_cholesterol,
          ldlCholesterol: lab.ldl_cholesterol,
          UREA: lab.urea,
          BUN: lab.bun,
          URIC: lab.uric,
          EGFR: lab.egfr
        });
        setLastLabDate(lab.date_submitted);
      }
    } catch (error) {
      console.error("Error fetching lab results:", error);
    }
  };

  const fetchMedications = async () => {
    try {
      const { data, error } = await supabase
        .from('medications')
        .select(`
          *,
          doctors (first_name, last_name),
          medication_frequencies (*)
        `)
        .eq('patient_id', patient.patient_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPatientMedications(data || []);
    } catch (error) {
      console.error("Error fetching medications:", error);
    }
  };

  const fetchAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patient.patient_id)
        .order('appointment_datetime', { ascending: false });

      if (error) throw error;
      setPatientAppointments(data || []);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    }
  };

  const fetchSpecialists = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_specialists')
        .select(`
          *,
          doctors (doctor_id, first_name, last_name, specialization)
        `)
        .eq('patient_id', patient.patient_id);

      if (error) throw error;
      setCurrentPatientSpecialists(data || []);
    } catch (error) {
      console.error("Error fetching specialists:", error);
    }
  };

  const fetchWoundPhotos = async () => {
    setWoundPhotosLoading(true);
    try {
      const { data, error } = await supabase
        .from('health_metrics')
        .select('wound_picture, submission_date')
        .eq('patient_id', patient.patient_id)
        .not('wound_picture', 'is', null)
        .order('submission_date', { ascending: false });

      if (error) throw error;

      if (data) {
        const photos = data
          .filter(item => item.wound_picture)
          .map(item => ({
            url: item.wound_picture,
            date: item.submission_date
          }));
        setAllWoundPhotos(photos);
      }
    } catch (error) {
      console.error("Error fetching wound photos:", error);
    } finally {
      setWoundPhotosLoading(false);
    }
  };

  const handleExpandPhoto = (photo) => {
    setExpandedPhoto(photo);
  };

  const handleCloseExpandedPhoto = () => {
    setExpandedPhoto(null);
  };

  // Tabs configuration - Doctor has Diasight tab, Secretary doesn't
  const tabs = userRole === "Doctor" 
    ? ["profile", "charts", "medication", "teamcare", "woundgallery", "appointment", "tables", "diasight"]
    : ["profile", "charts", "medication", "teamcare", "woundgallery", "appointment", "tables"];

  const tabLabels = {
    profile: "Patient Profile",
    charts: "History Charts",
    medication: "Medication",
    teamcare: "Team Care",
    woundgallery: "Wound Gallery",
    appointment: "Appointment",
    tables: "Tables",
    diasight: "DiaSight"
  };

  if (loading) {
    return <div className="patient-detail-view-loading">Loading patient details...</div>;
  }

  return (
    <div className="patient-detail-view-section">
      {/* Header */}
      <div className="detail-view-header">
        <button className="back-to-list-button" onClick={onClose}>
          <img src="../picture/back.png" alt="Back" className="icon-button-img" /> 
          {userRole === "Doctor" ? "Back to Dashboard" : "Back to List"}
        </button>
        <div className="patient-details-header-row">
          <div className="patient-details-title-nav">
            <h2>Patient Details</h2>
          </div>
          {userRole === "Secretary" && (
            <div className="patient-details-header-buttons">
              <button className="update-patient-button" onClick={() => onUpdatePatient && onUpdatePatient(patient)}>
                <img src="../picture/edit.png" alt="Update" className="icon-button-img" /> Update Patient
              </button>
              <button className="export-pdf-button" onClick={() => window.print()}>
                <img src="../picture/upload.png" alt="Export" className="icon-button-img" /> Export PDF
              </button>
            </div>
          )}
        </div>
        
        {/* Tab Navigation */}
        <div className="patient-detail-nav-buttons">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`patient-nav-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Content Container */}
      <div className="patient-details-content-container">
        <div className="patient-details-left-column">
          {/* Patient Profile Tab Content */}
          {activeTab === "profile" && (
            <>
              {/* Basic Patient Information Section */}
              <div className="patient-basic-info-section">
                <div className="patient-info-container">
                  <div className="patient-avatar-container">
                    <img 
                      src={patient?.patient_picture || "../picture/secretary.png"} 
                      alt="Patient Avatar" 
                      className="patient-avatar-large"
                      onError={(e) => e.target.src = "../picture/secretary.png"}
                    />
                    <div className={`patient-phase-badge ${
                      patient.phase === 'Post-Op' || patient.phase === 'Post-Operative' ? 'post-operative' :
                      patient.phase === 'Pre-Op' || patient.phase === 'Pre-Operative' ? 'pre-operative' :
                      'default'
                    }`}>
                      {patient.phase === 'Post-Op' || patient.phase === 'Post-Operative' ? 'Post-operative' : 
                       patient.phase === 'Pre-Op' || patient.phase === 'Pre-Operative' ? 'Pre-operative' : 
                       patient.phase || 'N/A'}
                    </div>
                  </div>
                  <div className="patient-info-details">
                    <div className="patient-name-section">
                      <h2 className="patient-name-display">
                        {patient.first_name} {patient.middle_name ? patient.middle_name + ' ' : ''}{patient.last_name}
                      </h2>
                    </div>
                    <div className="patient-details-grid">
                      <div className="patient-detail-item">
                        <span className="detail-label">Diabetes Type:</span>
                        <span className="detail-value">{patient.diabetes_type || 'N/A'}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Duration of Diabetes:</span>
                        <span className="detail-value">{patient.diabetes_duration || 'N/A'} years</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Phone:</span>
                        <span className="detail-value">{patient.contact_info || 'N/A'}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Gender:</span>
                        <span className="detail-value">{patient.gender || 'N/A'}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Age:</span>
                        <span className="detail-value">
                          {patient.date_of_birth 
                            ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() 
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Height:</span>
                        <span className="detail-value">{patient.patient_height ? `${patient.patient_height} cm` : 'N/A'}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Weight:</span>
                        <span className="detail-value">{patient.patient_weight ? `${patient.patient_weight} kg` : 'N/A'}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">BMI:</span>
                        <span className="detail-value">{patient.BMI || 'N/A'}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Hypertensive:</span>
                        <span className="detail-value">{patient.complication_history?.includes("Hypertensive") ? "Yes" : "No"}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Heart Disease:</span>
                        <span className="detail-value">{patient.complication_history?.includes("Heart Attack") ? "Yes" : "None"}</span>
                      </div>
                      <div className="patient-detail-item">
                        <span className="detail-label">Smoking History:</span>
                        <span className="detail-value">{patient.smoking_status || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Latest Health Metrics Section */}
              <div className="latest-health-metrics-section">
                <h3>Latest Health Metrics</h3>
                <p><strong>Blood Glucose Level:</strong> {patientHealthMetrics.bloodGlucoseLevel} {patientHealthMetrics.bloodGlucoseLevel !== 'N/A' ? 'mg/dL' : ''}</p>
                <p><strong>Blood Pressure:</strong> {patientHealthMetrics.bloodPressure} {patientHealthMetrics.bloodPressure !== 'N/A' ? 'mmHg' : ''}</p>
                <p><strong>Risk Classification:</strong> 
                  <span className={`risk-classification-${(patient.risk_classification || 'n-a').toLowerCase()}`}>
                    {patient.risk_classification || 'N/A'}
                  </span>
                </p>
              </div>
            </>
          )}

          {/* Charts Tab Content */}
          {activeTab === "charts" && (
            <div className="history-charts-section">
              {/* Blood Pressure Chart */}
              <div className="blood-pressure-chart-container">
                <div className="chart-header">
                  <h4>Blood Pressure History</h4>
                  <div className="time-filter-buttons">
                    {['day', 'week', 'month'].map(filter => (
                      <button
                        key={filter}
                        className={`time-filter-btn ${bpTimeFilter === filter ? 'active' : ''}`}
                        onClick={() => setBpTimeFilter(filter)}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-wrapper">
                  {bpFilteredMetrics.length > 0 ? (
                    <Bar
                      data={{
                        labels: bpFilteredMetrics.map(entry => formatDateForChart(entry.submission_date)),
                        datasets: [
                          {
                            label: 'Diastolic',
                            data: bpFilteredMetrics.map(entry => parseFloat(entry.bp_diastolic) || 0),
                            backgroundColor: 'rgba(134, 239, 172, 0.8)',
                            borderColor: 'rgba(134, 239, 172, 1)',
                            borderWidth: 1,
                            barThickness: 15,
                            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 15, bottomRight: 15 },
                            borderSkipped: false,
                          },
                          {
                            label: 'Systolic',
                            data: bpFilteredMetrics.map(entry => parseFloat(entry.bp_systolic) || 0),
                            backgroundColor: 'rgba(34, 197, 94, 0.8)',
                            borderColor: 'rgba(34, 197, 94, 1)',
                            borderWidth: 1,
                            barThickness: 15,
                            borderRadius: { topLeft: 15, topRight: 15, bottomLeft: 0, bottomRight: 0 },
                            borderSkipped: false,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: {
                          legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 20 } },
                          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.raw} mmHg` } }
                        },
                        scales: {
                          x: { stacked: true, grid: { display: false }, title: { display: true, text: 'Date', font: { size: 12, weight: 'bold' } }, ticks: { display: true, maxRotation: 45, minRotation: 45 }, categoryPercentage: 0.95, barPercentage: 0.95 },
                          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Blood Pressure (mmHg)', font: { size: 12, weight: 'bold' } }, min: 0, max: 350, ticks: { display: true }, grid: { display: true, color: 'rgba(0, 0, 0, 0.1)' } }
                        }
                      }}
                    />
                  ) : (
                    <div className="no-chart-data">
                      <p>No blood pressure data available for selected time period</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Blood Glucose Chart */}
              <div className="blood-glucose-chart-container">
                <div className="chart-header">
                  <h4>Blood Glucose Level History</h4>
                  <div className="time-filter-buttons">
                    {['day', 'week', 'month'].map(filter => (
                      <button
                        key={filter}
                        className={`time-filter-btn ${glucoseTimeFilter === filter ? 'active' : ''}`}
                        onClick={() => setGlucoseTimeFilter(filter)}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-wrapper">
                  {glucoseFilteredMetrics.length > 0 ? (
                    <Line
                      data={{
                        labels: glucoseFilteredMetrics.map(entry => formatDateForChart(entry.submission_date)),
                        datasets: [{
                          label: 'Blood Glucose',
                          data: glucoseFilteredMetrics.map(entry => parseFloat(entry.blood_glucose) || 0),
                          fill: true,
                          backgroundColor: (context) => {
                            const chart = context.chart;
                            const {ctx, chartArea} = chart;
                            if (!chartArea) return null;
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
                            gradient.addColorStop(1, 'rgba(34, 197, 94, 0.1)');
                            return gradient;
                          },
                          borderColor: '#22c55e',
                          borderWidth: 2,
                          pointBackgroundColor: '#22c55e',
                          pointBorderColor: '#fff',
                          pointBorderWidth: 2,
                          pointRadius: 4,
                          pointHoverRadius: 6,
                          tension: 0.4,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `Glucose: ${context.raw} mg/dL` } } },
                        scales: {
                          y: { beginAtZero: true, title: { display: true, text: 'Blood Glucose (mg/dL)', font: { size: 12, weight: 'bold' } }, min: 0, max: 300, ticks: { display: true }, grid: { display: true, color: 'rgba(0, 0, 0, 0.1)' } },
                          x: { grid: { display: false }, title: { display: true, text: 'Date', font: { size: 12, weight: 'bold' } }, ticks: { display: true, maxRotation: 45, minRotation: 45 } }
                        }
                      }}
                    />
                  ) : (
                    <div className="no-chart-data">
                      <p>No blood glucose data available for selected time period</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="patient-details-right-column">
          {/* Profile Tab - Right Column Content */}
          {activeTab === "profile" && (
            <div className="laboratory-results-section">
              <h3>Laboratory Results (Latest)</h3>
              <div className="lab-date-submitted">
                <strong>Date Submitted:</strong> {formatDateToReadable(lastLabDate)}
              </div>
              <div className="lab-results-grid">
                {[
                  { label: 'Hba1c', value: patientLabResults.Hba1c },
                  { label: 'UCR', value: patientLabResults.UCR },
                  { label: 'GOT (AST)', value: patientLabResults.gotAst },
                  { label: 'GPT (ALT)', value: patientLabResults.gptAlt },
                  { label: 'Cholesterol', value: patientLabResults.cholesterol },
                  { label: 'Triglycerides', value: patientLabResults.triglycerides },
                  { label: 'HDL', value: patientLabResults.hdlCholesterol },
                  { label: 'LDL', value: patientLabResults.ldlCholesterol },
                  { label: 'UREA', value: patientLabResults.UREA },
                  { label: 'BUN', value: patientLabResults.BUN },
                  { label: 'URIC', value: patientLabResults.URIC },
                  { label: 'EGFR', value: patientLabResults.EGFR }
                ].map((item, idx) => (
                  <div key={idx} className="lab-result-item">
                    <span className="lab-label">{item.label}:</span>
                    <span className="lab-value">{item.value || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts Tab - Right Column Content */}
          {activeTab === "charts" && (
            <>
              {/* Risk Classification History Chart */}
              <div className="risk-classification-chart-container">
                <div className="chart-header">
                  <h4>Risk Classification History</h4>
                  <div className="time-filter-buttons">
                    {['day', 'week', 'month'].map(filter => (
                      <button
                        key={filter}
                        className={`time-filter-btn ${riskTimeFilter === filter ? 'active' : ''}`}
                        onClick={() => setRiskTimeFilter(filter)}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="risk-legend-container">
                  <div className="risk-legend-item"><div className="risk-legend-color low-risk"></div><span>Low Risk</span></div>
                  <div className="risk-legend-item"><div className="risk-legend-color moderate-risk"></div><span>Moderate Risk</span></div>
                  <div className="risk-legend-item"><div className="risk-legend-color high-risk"></div><span>High Risk</span></div>
                  <div className="risk-legend-item"><div className="risk-legend-color ppd-risk"></div><span>PPD</span></div>
                </div>

                <div className="chart-wrapper">
                  {riskFilteredMetrics.length > 0 ? (
                    <Bar
                      data={{
                        labels: riskFilteredMetrics.map(entry => formatDateForChart(entry.submission_date)),
                        datasets: [{
                          label: 'Risk Classification',
                          data: riskFilteredMetrics.map(entry => {
                            const risk = entry.risk_classification?.toLowerCase();
                            if (risk === 'low' || risk === 'low risk') return 2;
                            if (risk === 'moderate' || risk === 'moderate risk') return 3;
                            if (risk === 'high' || risk === 'high risk') return 4;
                            if (risk === 'ppd') return 1;
                            return 0;
                          }),
                          backgroundColor: riskFilteredMetrics.map(entry => {
                            const risk = entry.risk_classification?.toLowerCase();
                            if (risk === 'low' || risk === 'low risk') return 'rgba(34, 197, 94, 0.8)';
                            if (risk === 'moderate' || risk === 'moderate risk') return 'rgba(255, 193, 7, 0.8)';
                            if (risk === 'high' || risk === 'high risk') return 'rgba(244, 67, 54, 0.8)';
                            if (risk === 'ppd') return 'rgba(103, 101, 105, 0.8)';
                            return 'rgba(156, 163, 175, 0.8)';
                          }),
                          borderColor: riskFilteredMetrics.map(entry => {
                            const risk = entry.risk_classification?.toLowerCase();
                            if (risk === 'low' || risk === 'low risk') return 'rgba(34, 197, 94, 1)';
                            if (risk === 'moderate' || risk === 'moderate risk') return 'rgba(255, 193, 7, 1)';
                            if (risk === 'high' || risk === 'high risk') return 'rgba(244, 67, 54, 1)';
                            if (risk === 'ppd') return 'rgba(103, 101, 105, 1)';
                            return 'rgba(156, 163, 175, 1)';
                          }),
                          borderWidth: 1,
                          barThickness: 15,
                          borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 8, bottomRight: 8 },
                          borderSkipped: false,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `Risk: ${riskFilteredMetrics[context.dataIndex]?.risk_classification || 'Unknown'}` } } },
                        scales: {
                          x: { grid: { display: false }, title: { display: true, text: 'Date', font: { size: 12, weight: 'bold' } }, ticks: { display: true, maxRotation: 45, minRotation: 45 }, categoryPercentage: 0.95, barPercentage: 0.95 },
                          y: { beginAtZero: true, title: { display: true, text: 'Risk Level', font: { size: 12, weight: 'bold' } }, min: 0, max: 4, ticks: { display: true, stepSize: 1, callback: (value) => ({ 1: 'PPD', 2: 'Low', 3: 'Moderate', 4: 'High' }[value] || '') }, grid: { display: true, color: 'rgba(0, 0, 0, 0.1)' } }
                        }
                      }}
                    />
                  ) : (
                    <div className="no-chart-data">
                      <p>No risk classification data available for selected time period</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Score Over Time Chart */}
              <div className="blood-glucose-chart-container risk-score-chart-container">
                <div className="chart-header">
                  <h4>Risk Score Over Time</h4>
                  <div className="time-filter-buttons">
                    {['day', 'week', 'month'].map(filter => (
                      <button
                        key={filter}
                        className={`time-filter-btn ${riskScoreTimeFilter === filter ? 'active' : ''}`}
                        onClick={() => setRiskScoreTimeFilter(filter)}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-wrapper">
                  {riskScoreFilteredMetrics.length > 0 ? (
                    <Line
                      data={{
                        labels: riskScoreFilteredMetrics.map(entry => formatDateForChart(entry.submission_date)),
                        datasets: [{
                          label: 'Risk Score',
                          data: riskScoreFilteredMetrics.map(entry => parseFloat(entry.risk_score) || 0),
                          fill: true,
                          backgroundColor: (context) => {
                            const chart = context.chart;
                            const {ctx, chartArea} = chart;
                            if (!chartArea) return null;
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
                            gradient.addColorStop(1, 'rgba(34, 197, 94, 0.1)');
                            return gradient;
                          },
                          borderColor: '#22c55e',
                          borderWidth: 2,
                          pointBackgroundColor: '#22c55e',
                          pointBorderColor: '#fff',
                          pointBorderWidth: 2,
                          pointRadius: 4,
                          pointHoverRadius: 6,
                          tension: 0.4,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `Risk Score: ${context.raw}/100` } } },
                        scales: {
                          y: { beginAtZero: true, title: { display: true, text: 'Risk Score', font: { size: 12, weight: 'bold' } }, min: 0, max: 100, ticks: { display: true }, grid: { display: true, color: 'rgba(0, 0, 0, 0.1)' } },
                          x: { grid: { display: false }, title: { display: true, text: 'Date', font: { size: 12, weight: 'bold' } }, ticks: { display: true, maxRotation: 45, minRotation: 45 } }
                        }
                      }}
                    />
                  ) : (
                    <div className="no-chart-data">
                      <p>No risk score data available for selected time period</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Medication Tab - Full Width Content */}
        {activeTab === "medication" && (
          <div className="current-medications-section">
            <div className="medications-table-container">
              <label>Current Medications:</label>
              <table className="medications-table">
                <thead>
                  <tr>
                    <th>Drug Name</th>
                    <th>Dosage</th>
                    <th>Frequency</th>
                    <th>Prescribed by</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {patientMedications.length > 0 ? (
                    patientMedications.map((med, idx) => (
                      <tr key={med.id || idx}>
                        <td><input type="text" className="med-input" value={med.name || ''} readOnly /></td>
                        <td><input type="text" className="med-input" value={med.dosage || ''} readOnly /></td>
                        <td><input type="text" className="med-input" value={med.medication_frequencies?.length > 0 ? med.medication_frequencies.map(f => f.frequency || f.time_of_day?.join(', ')).join(', ') : ''} readOnly /></td>
                        <td><input type="text" className="med-input" value={med.doctors ? `${med.doctors.first_name} ${med.doctors.last_name}` : ''} readOnly /></td>
                        <td className="med-actions">
                          <button type="button" className="add-med-button" title="Add medication">
                            <img src="../picture/add.svg" alt="Add" className="icon-button-img" />
                          </button>
                          <button type="button" className="remove-med-button" title="Remove medication">
                            <img src="../picture/minus.svg" alt="Remove" className="icon-button-img" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td><input type="text" className="med-input" placeholder="No medications" readOnly /></td>
                      <td><input type="text" className="med-input" placeholder="N/A" readOnly /></td>
                      <td><input type="text" className="med-input" placeholder="N/A" readOnly /></td>
                      <td><input type="text" className="med-input" placeholder="N/A" readOnly /></td>
                      <td className="med-actions">
                        <button type="button" className="add-med-button" title="Add medication">
                          <img src="../picture/add.svg" alt="Add" className="icon-button-img" />
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Team Care Tab */}
        {activeTab === "teamcare" && (
          <div className="doctor-assigned-section">
            <h3>Team Care</h3>
            <div className="doctors-grid">
              {/* Assigned Doctor Card */}
              <div className="doctor-card">
                <div className="doctor-avatar">
                  <img src="../picture/secretary.png" alt="Doctor Avatar" />
                </div>
                <div className="doctor-info">
                  <span className="doctor-label">Assigned Doctor:</span>
                  <h4 className="doctor-name">
                    {patient.doctors 
                      ? `${patient.doctors.first_name} ${patient.doctors.last_name}` 
                      : user ? `${user.first_name} ${user.last_name}` : 'Dr. Name'}
                  </h4>
                  <p className="doctor-specialty">
                    {patient.doctors?.specialization || user?.specialization || 'General Surgeon'}
                  </p>
                </div>
              </div>

              {/* Assigned Specialists Cards */}
              {currentPatientSpecialists.length > 0 ? (
                currentPatientSpecialists.map((specialist, index) => (
                  <div key={specialist.id || index} className="doctor-card specialist-card">
                    <div className="doctor-avatar">
                      <img src="../picture/secretary.png" alt="Specialist Avatar" />
                    </div>
                    <div className="doctor-info">
                      <span className="doctor-label">Specialist Doctor</span>
                      <h4 className="doctor-name">
                        {specialist.doctors 
                          ? `${specialist.doctors.first_name} ${specialist.doctors.last_name}` 
                          : 'Unknown Doctor'}
                      </h4>
                      <p className="doctor-specialty">
                        {specialist.doctors?.specialization || 'General'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="doctor-card specialist-card placeholder-card">
                  <div className="doctor-avatar">
                    <img src="../picture/secretary.png" alt="No Specialist" />
                  </div>
                  <div className="doctor-info">
                    <span className="doctor-label">Specialist Doctor</span>
                    <h4 className="doctor-name">No Specialist Assigned</h4>
                    <p className="doctor-specialty">-</p>
                  </div>
                </div>
              )}
            </div>
            
            {userRole === "Secretary" && (
              <button className="edit-doctors-button" onClick={() => onEditSpecialist && onEditSpecialist(patient)}>
                Edit Assignments
              </button>
            )}
          </div>
        )}

        {/* Appointment Tab */}
        {activeTab === "appointment" && (
          <div className="appointment-schedule-section" style={{gridColumn: '1 / -1'}}>
            <h3>Appointment Schedule</h3>
            <div className="patient-appointment-two-column-layout">
              {/* Left Column: Calendar with Appointment Details */}
              <div className="patient-appointment-left-column">
                <div className="patient-appointment-schedule-container">
                  <div className="patient-appointment-calendar-container">
                    <Calendar
                      value={calendarDate}
                      onChange={setCalendarDate}
                      tileClassName={({ date, view }) => {
                        if (view === 'month') {
                          const hasAppointment = patientAppointments.some(appointment => {
                            const appointmentDate = new Date(appointment.appointment_datetime);
                            return (
                              appointmentDate.getDate() === date.getDate() &&
                              appointmentDate.getMonth() === date.getMonth() &&
                              appointmentDate.getFullYear() === date.getFullYear()
                            );
                          });
                          return hasAppointment ? 'patient-appointment-date' : null;
                        }
                      }}
                    />
                  </div>
                  
                  <div className="patient-appointment-details-list">
                    <h4>Upcoming Appointments</h4>
                    {(() => {
                      const now = new Date();
                      const upcomingAppointments = patientAppointments
                        .filter(appointment => new Date(appointment.appointment_datetime) >= now)
                        .sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime));
                      
                      return upcomingAppointments.length > 0 ? (
                        <ul className="patient-appointment-list">
                          {upcomingAppointments.map((appointment, idx) => (
                            <li key={idx} className="patient-appointment-item">
                              <div className="patient-appointment-date-time">
                                <strong>{formatDateToReadable(appointment.appointment_datetime.split('T')[0])}</strong>
                                <span className="patient-appointment-time">
                                  {formatTimeTo12Hour(appointment.appointment_datetime.substring(11, 16))}
                                </span>
                              </div>
                              {appointment.notes && (
                                <p className="patient-appointment-notes">{appointment.notes}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="no-appointments">No upcoming appointments.</p>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Right Column: Appointment Status Table */}
              <div className="patient-appointment-right-column">
                <div className="patient-appointment-table-container">
                  <h4>Appointment Status</h4>
                  {patientAppointments.length > 0 ? (
                    <>
                      <div className="appointment-table-wrapper">
                        <table className="patient-appointment-status-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Time</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const sortedAppointments = [...patientAppointments].sort((a, b) => 
                                new Date(b.appointment_datetime) - new Date(a.appointment_datetime)
                              );
                              const startIndex = (currentPagePatientDetailAppointments - 1) * PATIENT_DETAIL_APPOINTMENTS_PER_PAGE;
                              const endIndex = startIndex + PATIENT_DETAIL_APPOINTMENTS_PER_PAGE;
                              const paginatedAppointments = sortedAppointments.slice(startIndex, endIndex);
                              
                              return paginatedAppointments.map((appointment, idx) => (
                                <tr key={idx}>
                                  <td>{formatDateToReadable(appointment.appointment_datetime.split('T')[0])}</td>
                                  <td>{formatTimeTo12Hour(appointment.appointment_datetime.substring(11, 16))}</td>
                                  <td>
                                    <span className={`appointment-status-badge ${appointment.appointment_state ? appointment.appointment_state.toLowerCase().replace(/\s+/g, '-') : 'pending'}`}>
                                      {appointment.appointment_state || 'Pending'}
                                    </span>
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        currentPage={currentPagePatientDetailAppointments}
                        totalPages={Math.ceil(patientAppointments.length / PATIENT_DETAIL_APPOINTMENTS_PER_PAGE)}
                        onPageChange={setCurrentPagePatientDetailAppointments}
                        itemsPerPage={PATIENT_DETAIL_APPOINTMENTS_PER_PAGE}
                        totalItems={patientAppointments.length}
                      />
                    </>
                  ) : (
                    <p className="no-appointments">No appointments scheduled for this patient.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tables Tab */}
        {activeTab === "tables" && (
          <div className="health-metrics-history-section" style={{gridColumn: '1 / -1'}}>
            <h3>Health Metrics History</h3>
            <table className="health-metrics-table">
              <thead>
                <tr>
                  <th>Date and Time</th>
                  <th>Blood Glucose</th>
                  <th>Blood Pressure</th>
                  <th>Risk Score</th>
                  <th>Risk Classification</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHealthMetrics.length > 0 ? (
                  paginatedHealthMetrics.map((metric, index) => {
                    const submissionDate = new Date(metric.submission_date);
                    const dateStr = submissionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const timeStr = submissionDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    return (
                      <tr key={index}>
                        <td>{`${dateStr}, ${timeStr}`}</td>
                        <td>{metric.blood_glucose || 'N/A'}</td>
                        <td>{metric.bp_systolic && metric.bp_diastolic ? `${metric.bp_systolic}/${metric.bp_diastolic}` : 'N/A'}</td>
                        <td className="metric-value">{metric.risk_score || 'N/A'}</td>
                        <td className={`risk-classification-${(metric.risk_classification || 'N/A').toLowerCase()}`}>
                          {metric.risk_classification || 'N/A'}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5">No health metrics history available for this patient.</td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {allPatientHealthMetrics.length > HEALTH_METRICS_PER_PAGE && (
              <div className="health-metrics-pagination">
                <Pagination
                  currentPage={currentPageHealthMetrics}
                  totalPages={totalHealthMetricsPages}
                  onPageChange={setCurrentPageHealthMetrics}
                  itemsPerPage={HEALTH_METRICS_PER_PAGE}
                  totalItems={allPatientHealthMetrics.length}
                  showPageInfo={false}
                />
              </div>
            )}
          </div>
        )}

        {/* Wound Gallery Tab */}
        {activeTab === "woundgallery" && (
          <div className="wound-gallery-section" style={{gridColumn: '1 / -1'}}>
            <h3>Wound Gallery</h3>
            <div className="wound-gallery-grid">
              {woundPhotosLoading ? (
                <div className="loading-message">
                  <p>Loading wound photos...</p>
                </div>
              ) : allWoundPhotos.length > 0 ? (
                allWoundPhotos.map((photo, index) => (
                  <div key={index} className="wound-gallery-card">
                    <div className="wound-photo-container">
                      <img
                        src={photo.url}
                        alt={`Wound Photo - ${photo.date}`}
                        className="wound-photo-image"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <button className="photo-expand-btn" onClick={() => handleExpandPhoto(photo)}>
                        <img src="../picture/expand.svg" alt="Expand" className="icon-button-img" />
                      </button>
                    </div>
                    
                    <div className="photo-info">
                      <div className="photo-timestamp">
                        <span className="photo-date">{formatDateToReadable(photo.date)}</span>
                        <span className="photo-time">| {new Date(photo.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                      </div>
                      
                      <div className="photo-submitter">
                        <img src="../picture/secretary.png" alt="Submitter Avatar" className="submitter-avatar" />
                        <span className="submitter-info">
                          <span className="submitter-text">by</span> {patient.first_name} {patient.last_name}
                        </span>
                      </div>
                      
                      <div className="photo-actions">
                        <button className="entry-btn">Entry ID: 00{allWoundPhotos.length - index}</button>
                        <button className="view-details-btn" onClick={() => handleExpandPhoto(photo)}>
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-photos-message">
                  <p>No wound photos available for this patient.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DiaSight Tab - Doctor Only */}
        {activeTab === "diasight" && userRole === "Doctor" && (
          <div className="diasight-section" style={{gridColumn: '1 / -1'}}>
            <h3>DiaSight - Diabetic Retinopathy Detection</h3>
            <p className="diasight-description">
              This feature analyzes patient data to detect diabetic retinopathy risk.
              Run a new analysis from the main dashboard or view previous results here.
            </p>
            <div className="no-diasight-results">
              <div className="no-results-icon">🔬</div>
              <p>No DiaSight analysis data available. Run analysis from the DiaSight section.</p>
            </div>
          </div>
        )}
      </div>

      {/* Photo Expansion Modal */}
      {expandedPhoto && (
        <div className="photo-modal-overlay" onClick={handleCloseExpandedPhoto}>
          <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="photo-modal-close" onClick={handleCloseExpandedPhoto}>
              ×
            </button>
            <img
              src={expandedPhoto.url}
              alt={`Expanded Wound Photo - ${expandedPhoto.date}`}
              className="expanded-photo-image"
            />
            <div className="expanded-photo-info">
              <h4>Wound Photo Details</h4>
              <p><strong>Date:</strong> {formatDateToReadable(expandedPhoto.date)}</p>
              <p><strong>Time:</strong> {new Date(expandedPhoto.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDetailView;



