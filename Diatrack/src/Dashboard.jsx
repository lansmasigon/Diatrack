// ✅ FULL UPDATED Dashboard.jsx WITH HEADER NAVIGATION (Notes replaced with Appointment Schedule) AND TREATMENT PLAN SUMMARY

import React, { useState, useEffect, useCallback } from "react";
import supabase from "./supabaseClient";
import { logMedicationChange, logPatientDataChange, logSystemAction } from "./auditLogger";
import Header from "./components/Header";
import RiskFilter from "./components/RiskFilter";
import Pagination from "./components/Pagination";
import "./Dashboard.css";
import logo from '../picture/logo.png'; // Make sure this path is correct
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

// Import Chart.js components
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler);

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24h) => {
  if (!time24h) return 'N/A';
  const [hours, minutes] = time24h.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12; // Converts 0 (midnight) to 12 AM, 13 to 1 PM etc.
  const displayMinutes = String(minutes).padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
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

// Helper function to determine lab status
const getLabStatus = (latestLabResult) => {
  if (!latestLabResult) {
    return 'Awaiting';
  }

  const requiredLabFields = [
    'Hba1c', 'creatinine', 'got_ast', 'gpt_alt',
    'cholesterol', 'triglycerides', 'hdl_cholesterol', 'ldl_cholesterol'
  ];

  let allFieldsFilled = true;
  let hasAnyField = false;

  for (const field of requiredLabFields) {
    const value = latestLabResult[field];
    if (value === null || value === undefined || value === '') {
      allFieldsFilled = false;
    } else {
      hasAnyField = true;
    }
  }

  // If no fields have any value, status is Awaiting
  if (!hasAnyField) {
    return 'Awaiting';
  }
  
  // If all fields are filled, status is Submitted
  if (allFieldsFilled) {
    return 'Submitted';
  }
  
  // If some fields are filled but not all, status is Awaiting
  return 'Awaiting';
};

// Helper function to get classification display with colored indicator and phase
const getClassificationDisplay = (patient) => {
  const phase = patient.phase || 'Pre-Operative';
  const labStatus = getLabStatus(patient.latest_lab_result);
  const riskClassification = (patient.risk_classification || '').toLowerCase();
  
  // Shorten phase names
  const phaseDisplay = phase === 'Pre-Operative' ? 'Pre-Op' : phase === 'Post-Operative' ? 'Post-Op' : phase;
  
  // If lab status is Awaiting, show ⛔ with phase
  if (labStatus === 'Awaiting') {
    return `⛔${phaseDisplay}`;
  }
  
  // Otherwise, show color based on risk classification (for Submitted status)
  if (riskClassification === 'low') {
    return `🟢${phaseDisplay}`;
  } else if (riskClassification === 'moderate') {
    return `🟡${phaseDisplay}`;
  } else if (riskClassification === 'high') {
    return `🔴${phaseDisplay}`;
  } else if (riskClassification === 'ppd') {
    return `⚪${phaseDisplay}`;
  } else if (riskClassification === 'n/a' || !riskClassification) {
    return `⚫${phaseDisplay}`;
  }
  
  // Default case (no risk classification available)
  return `⚫${phaseDisplay}`;
};

// Helper function to determine profile status
const getProfileStatus = (patient) => {
  if (
    patient &&
    patient.first_name && patient.first_name.trim() !== '' &&
    patient.last_name && patient.last_name.trim() !== '' &&
    patient.email && patient.email.trim() !== '' &&
    patient.date_of_birth && patient.date_of_birth.trim() !== '' &&
    patient.contact_info && patient.contact_info.trim() !== '' &&
    patient.gender && patient.gender.trim() !== '' &&
    patient.address && patient.address.trim() !== '' &&
    patient.allergies && patient.allergies.trim() !== '' &&
    patient.diabetes_type && patient.diabetes_type.trim() !== '' &&
    patient.smoking_status && patient.smoking_status.trim() !== ''
  ) {
    return 'Complete';
  } else {
    return 'Incomplete';
  }
};

// Helper function to check patient compliance status for reports
const getPatientComplianceStatus = (patient) => {
  // Check if patient has submitted blood pressure, blood glucose, and wound photo
  let submittedItems = 0;
  
  // Check for blood pressure
  if (patient.has_blood_pressure) {
    submittedItems++;
  }
  
  // Check for blood glucose
  if (patient.has_blood_glucose) {
    submittedItems++;
  }
  
  // Check for wound photo
  if (patient.has_wound_photo) {
    submittedItems++;
  }
  
  return {
    submittedCount: submittedItems,
    isFullCompliance: submittedItems === 3,
    isMissingLogs: submittedItems < 3, // Any patient missing at least one metric
    isNonCompliant: submittedItems === 0
  };
};

// PatientSummaryWidget component for dashboard stats and charts
const PatientSummaryWidget = ({ totalPatients, pendingLabResults, preOp, postOp, lowRisk, moderateRisk, highRisk, patientCountHistory, pendingLabHistory }) => {

  // Debug logging to see what data we're working with
  console.log("PatientSummaryWidget - pendingLabResults:", pendingLabResults);
  console.log("PatientSummaryWidget - pendingLabHistory:", pendingLabHistory);
  console.log("PatientSummaryWidget - pendingLabHistory data length:", pendingLabHistory?.data?.length);
  console.log("PatientSummaryWidget - pendingLabHistory labels length:", pendingLabHistory?.labels?.length);

  // Calculate percentages for Patient Categories
  const totalPatientCategories = preOp + postOp;
  const preOpPercentage = totalPatientCategories > 0 ? (preOp / totalPatientCategories) * 100 : 0;
  const postOpPercentage = totalPatientCategories > 0 ? (postOp / totalPatientCategories) * 100 : 0;

  // Calculate percentages for Pre-Op Risk Classes
  const totalRiskClasses = lowRisk + moderateRisk + highRisk;
  const lowRiskPercentage = totalRiskClasses > 0 ? (lowRisk / totalRiskClasses) * 100 : 0;
  const moderateRiskPercentage = totalRiskClasses > 0 ? (moderateRisk / totalRiskClasses) * 100 : 0;
  const highRiskPercentage = totalRiskClasses > 0 ? (highRisk / totalRiskClasses) * 100 : 0;

  // Prepare data for the area chart
  const areaChartData = {
    labels: patientCountHistory?.labels || [],
    datasets: [
      {
        label: 'Total Patients',
        data: patientCountHistory?.data || [],
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) {
            return null;
          }
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(31, 170, 237, 0.6)');
          gradient.addColorStop(0.5, 'rgba(31, 170, 237, 0.3)');
          gradient.addColorStop(1, 'rgba(31, 170, 237, 0.1)');
          return gradient;
        },
        borderColor: '#1FAAED', // Visible blue line
        borderWidth: 2, // Line thickness
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
        pointBorderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0, // No points on hover
        pointHoverBackgroundColor: '#1FAAED',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 3,
        tension: 0.4, // Smooth curves
        hoverBackgroundColor: 'rgba(31, 170, 237, 0.7)', // Slightly darker on hover
      },
    ],
  };

  // Prepare data for the submitted lab results area chart
  // This chart displays how many patients submitted their lab results each month
  const pendingLabChartData = {
    labels: pendingLabHistory?.labels?.length > 0 ? pendingLabHistory.labels : ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
    datasets: [
      {
        label: 'Submitted Lab Results',
        data: pendingLabHistory?.data?.length > 0 ? pendingLabHistory.data : [0, 0, 0, 0, 0, 0],
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) {
            return null;
          }
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(217, 19, 65, 0.6)');
          gradient.addColorStop(0.5, 'rgba(217, 19, 65, 0.3)');
          gradient.addColorStop(1, 'rgba(217, 19, 65, 0.1)');
          return gradient;
        },
        borderColor: '#D91341', // Visible red line
        borderWidth: 2, // Line thickness
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
        pointBorderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0, // No points on hover
        pointHoverBackgroundColor: '#D91341',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 3,
        tension: 0.5, // Smooth curves (same as total patients chart)
        hoverBackgroundColor: 'rgba(217, 19, 65, 0.7)', // Slightly darker on hover
      },
    ],
  };

  const pendingLabChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 5,
        bottom: 5,
        left: 2,
        right: 2
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true, // Ensure tooltips are enabled
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#D91341',
        borderWidth: 1,
        cornerRadius: 4,
        displayColors: false, // Remove color box in tooltip
        callbacks: {
          title: function(context) {
            return `Month: ${context[0].label}`;
          },
          label: function(context) {
            return `Submitted Labs: ${context.raw}`;
          }
        }
      }
    },
    scales: {
      y: {
        display: false, // Hide y-axis
        beginAtZero: true,
        grid: {
          display: false
        }
      },
      x: {
        display: false, // Hide x-axis
        grid: {
          display: false
        }
      },
    },
    elements: {
      point: {
        radius: 0, // Hide points normally
        hoverRadius: 0, // No hover points
      },
      line: {
        borderWidth: 2, // Line thickness
      }
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  const areaChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 5,
        bottom: 5,
        left: 2,
        right: 2
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true, // Ensure tooltips are enabled
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#1FAAED',
        borderWidth: 1,
        cornerRadius: 4,
        displayColors: false, // Remove color box in tooltip
        callbacks: {
          title: function(context) {
            return `Month: ${context[0].label}`;
          },
          label: function(context) {
            return `Total Patients: ${context.raw}`;
          }
        }
      }
    },
    scales: {
      y: {
        display: false, // Hide y-axis
        beginAtZero: true,
        grid: {
          display: false
        }
      },
      x: {
        display: false, // Hide x-axis
        grid: {
          display: false
        }
      },
    },
    elements: {
      point: {
        radius: 0, // Hide points normally
        hoverRadius: 0, // No hover points
      },
      line: {
        borderWidth: 2, // Line thickness
      }
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

   return (
    <>
      <div className="summary-widget-grid">
        <div className="summary-widget total-patients">
          <div className="summary-widget-header">
            <img src="../picture/total.png" alt="Total Patients" className="summary-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/1FAAED/ffffff?text=👥"; }}/>
            <h4>Total Patients</h4>
          </div>
          <div className="summary-widget-content">
            <div className="summary-widget-left">
              <p className="summary-number">{totalPatients}</p>
            </div>
            <div className="summary-widget-right">
              <p className="summary-subtitle">Patients who have been registered to the system</p>
            </div>
          </div>
          {/* Mini Area Chart for Patient Count History */}
          <div className="mini-chart-container">
            {patientCountHistory?.labels?.length > 0 ? (
              <Line 
                key={`patient-count-chart-${patientCountHistory?.data?.join('-') || 'empty'}`}
                data={areaChartData} 
                options={areaChartOptions} 
              />
            ) : (
              <div className="no-chart-data">
                <p>No patient data available</p>
              </div>
            )}
          </div>
        </div>
        <div className="summary-widget pending-lab-results">
          <div className="summary-widget-header">
            <img src="../picture/pending.png" alt="Pending Lab Results" className="summary-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/ff9800/ffffff?text=⏳"; }}/>
            <h4>Pending Lab Results</h4>
          </div>
          <div className="summary-widget-content">
            <div className="summary-widget-left">
              <p className="summary-number">{pendingLabResults}</p>
            </div>
            <div className="summary-widget-right">
              <p className="summary-subtitle">Patients who have consulted the doctor, but still haven't turned over test results</p>
            </div>
          </div>
          {/* Mini Area Chart for Submitted Lab Results History */}
          <div className="mini-chart-container">
            {pendingLabHistory?.labels?.length > 0 ? (
              <Line 
                key={`pending-lab-chart-${pendingLabHistory?.data?.join('-') || 'empty'}`}
                data={pendingLabChartData} 
                options={pendingLabChartOptions} 
              />
            ) : (
              <div className="no-chart-data">
                <p>No lab submission data available</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="widget-side-by-side-container">
        <div className="patient-categories-widget small-widget">
          <h3>
            <i className="fas fa-users"></i> Patient Categories
          </h3>
          <div className="progress-bars-container">
            <div className="progress-bar-row">
              <span className="progress-count">{preOp}</span>
              <div className="progress-bar-background">
                <div className="progress-bar-fill progress-bar-pre-op" style={{ width: `${preOpPercentage}%` }}></div>
              </div>
            </div>
            <div className="progress-bar-row">
              <span className="progress-count">{postOp}</span>
              <div className="progress-bar-background">
                <div className="progress-bar-fill progress-bar-post-op" style={{ width: `${postOpPercentage}%` }}></div>
              </div>
            </div>
          </div>
          <div className="legend-container">
            <div className="legend-item">
              <span className="legend-color-box legend-color-pre-op"></span>
              Pre-Op
            </div>
            <div className="legend-item">
              <span className="legend-color-box legend-color-post-op"></span>
              Post-Op
            </div>
          </div>
        </div>

        <div className="risk-classes-widget small-widget">
          <h3>
            <i className="fas fa-users"></i> Pre-Op Risk Classes
          </h3>
          <div className="progress-bars-container">
            <div className="progress-bar-row">
              <span className="progress-count">{lowRisk}</span>
              <div className="progress-bar-background">
                <div className="progress-bar-fill progress-bar-low-risk" style={{ width: `${lowRiskPercentage}%` }}></div>
              </div>
            </div>
            <div className="progress-bar-row">
              <span className="progress-count">{moderateRisk}</span>
              <div className="progress-bar-background">
                <div className="progress-bar-fill progress-bar-moderate-risk" style={{ width: `${moderateRiskPercentage}%` }}></div>
              </div>
            </div>
            <div className="progress-bar-row">
              <span className="progress-count">{highRisk}</span>
              <div className="progress-bar-background">
                <div className="progress-bar-fill progress-bar-high-risk" style={{ width: `${highRiskPercentage}%` }}></div>
              </div>
            </div>
          </div>
          <div className="legend-container">
            <div className="legend-item">
              <span className="legend-color-box legend-color-low-risk"></span>
              Low Risk
            </div>
            <div className="legend-item">
              <span className="legend-color-box legend-color-moderate-risk"></span>
              Moderate Risk
            </div>
            <div className="legend-item">
              <span className="legend-color-box legend-color-high-risk"></span>
              High Risk
            </div>
          </div>
        </div>
      </div>
    </>
  );
};


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

  // NEW: States for popup messages
  const [showUsersPopup, setShowUsersPopup] = useState(false);
  const [showMessagePopup, setShowMessagePopup] = useState(false);

  // Dashboard analytics states
  const [totalPatientsCount, setTotalPatientsCount] = useState(0);
  const [pendingLabResultsCount, setPendingLabResultsCount] = useState(0);
  const [preOpCount, setPreOpCount] = useState(0);
  const [postOpCount, setPostOpCount] = useState(0);
  const [lowRiskCount, setLowRiskCount] = useState(0);
  const [moderateRiskCount, setModerateRiskCount] = useState(0);
  const [highRiskCount, setHighRiskCount] = useState(0);

  // Chart data states for dashboard widgets
  const [appointmentChartData, setAppointmentChartData] = useState({
    labels: [],
    data: [],
  });
  const [labSubmissionChartData, setLabSubmissionChartData] = useState({
    labels: [],
    data: [],
  });
  const [fullComplianceChartData, setFullComplianceChartData] = useState({
    labels: [],
    data: [],
  });
  const [missingLogsChartData, setMissingLogsChartData] = useState({
    labels: [],
    data: [],
  });
  const [nonCompliantChartData, setNonCompliantChartData] = useState({
    labels: [],
    data: [],
  });

  // Patient list filtering and pagination states
  const [selectedRiskFilter, setSelectedRiskFilter] = useState('all');
  const [currentPagePatients, setCurrentPagePatients] = useState(1);
  const PATIENTS_PER_PAGE = 10;

  // Health metrics pagination states
  const [currentPageHealthMetrics, setCurrentPageHealthMetrics] = useState(1);
  const HEALTH_METRICS_PER_PAGE = 7;

  // Appointment management states
  const [appointmentForm, setAppointmentForm] = useState({
    doctorId: "",
    patientId: "",
    date: "",
    time: "",
    notes: ""
  });
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [message, setMessage] = useState("");
  const [appointmentsToday, setAppointmentsToday] = useState([]);
  const [currentPageAppointments, setCurrentPageAppointments] = useState(1);
  const APPOINTMENTS_PER_PAGE = 5;

  const [showModal, setShowModal] = useState(false);
  const [appointmentToConfirm, setAppointmentToConfirm] = useState(null);
  const [actionType, setActionType] = useState(""); // "cancel" or "done"

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

  // NEW: State for enhanced patient profile features
  const [allPatientHealthMetrics, setAllPatientHealthMetrics] = useState([]); // For charts
  const [allWoundPhotos, setAllWoundPhotos] = useState([]); // For wound gallery
  const [woundPhotosLoading, setWoundPhotosLoading] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null); // For photo expansion
  const [selectedWoundPhoto, setSelectedWoundPhoto] = useState(null); // For treatment plan specific photo
  const [calendarDate, setCalendarDate] = useState(new Date()); // For calendar
  const [currentPatientSpecialists, setCurrentPatientSpecialists] = useState([]); // For specialist assignments
  const [fetchingPatientDetails, setFetchingPatientDetails] = useState(false); // To prevent multiple fetches
  const [selectedMetricsFilter, setSelectedMetricsFilter] = useState('all'); // For filtering health metrics charts by risk
  
  // Individual time period filters for each chart
  const [glucoseTimeFilter, setGlucoseTimeFilter] = useState('week'); // 'day', 'week', 'month'
  const [bpTimeFilter, setBpTimeFilter] = useState('week');
  const [riskTimeFilter, setRiskTimeFilter] = useState('week');


  // Filter patient metrics based on selected risk filter
  const filteredPatientMetrics = React.useMemo(() => {
    if (selectedMetricsFilter === 'all') {
      return allPatientHealthMetrics;
    }
    return allPatientHealthMetrics.filter(metric => {
      const riskLevel = metric.risk_classification?.toLowerCase();
      return riskLevel === selectedMetricsFilter;
    });
  }, [allPatientHealthMetrics, selectedMetricsFilter]);

  // Helper function to filter metrics by time period
  const filterMetricsByTimePeriod = React.useCallback((metrics, timePeriod) => {
    const now = new Date();
    const filtered = metrics.filter(metric => {
      const metricDate = new Date(metric.submission_date);
      const diffTime = Math.abs(now - metricDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      switch(timePeriod) {
        case 'day':
          return diffDays <= 1;
        case 'week':
          return diffDays <= 7;
        case 'month':
          return diffDays <= 30;
        default:
          return true;
      }
    });
    
    // Sort by date ascending (oldest first)
    return filtered.sort((a, b) => new Date(a.submission_date) - new Date(b.submission_date));
  }, []);

  // Filtered metrics for each chart based on their individual time filters
  const glucoseFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(filteredPatientMetrics, glucoseTimeFilter),
    [filteredPatientMetrics, glucoseTimeFilter, filterMetricsByTimePeriod]
  );

  const bpFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(filteredPatientMetrics, bpTimeFilter),
    [filteredPatientMetrics, bpTimeFilter, filterMetricsByTimePeriod]
  );

  const riskFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(filteredPatientMetrics, riskTimeFilter),
    [filteredPatientMetrics, riskTimeFilter, filterMetricsByTimePeriod]
  );


  useEffect(() => {
    console.log("useEffect triggered - activePage:", activePage, "selectedPatient?.patient_id:", selectedPatient?.patient_id);
    
    if (activePage === "dashboard" || activePage === "patient-list") {
      fetchPatients();
    }
    if (activePage === "dashboard" || activePage === "appointments" || activePage === "reports") { // Added 'reports' here
        fetchAppointments();
    }
    if (activePage === "patient-profile" && selectedPatient?.patient_id) {
      console.log("Calling fetchPatientDetails for patient:", selectedPatient.patient_id);
      fetchPatientDetails(selectedPatient.patient_id);
    }
  }, [activePage, user.doctor_id, selectedPatient?.patient_id]); // Only depend on patient_id, not the full object

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

      // Fetch latest risk classification for each patient from health_metrics
      const patientsWithRisk = await Promise.all(
        data.map(async (patient) => {
          // Get current month date range
          const now = new Date();
          const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

          // Fetch ALL health metrics for current month
          const { data: healthData, error: healthError } = await supabase
            .from('health_metrics')
            .select('risk_classification, blood_glucose, bp_systolic, bp_diastolic, wound_photo_url, submission_date')
            .eq('patient_id', patient.patient_id)
            .gte('submission_date', currentMonthStart.toISOString())
            .lt('submission_date', currentMonthEnd.toISOString())
            .order('submission_date', { ascending: false });

          let riskClassification = null;
          let hasBloodGlucose = false;
          let hasBloodPressure = false;
          let hasWoundPhoto = false;

          if (healthError) {
            console.error(`Error fetching health metrics for patient ${patient.patient_id}:`, healthError.message);
          } else if (healthData && healthData.length > 0) {
            // Check across ALL metrics in current month
            healthData.forEach(metric => {
              if (!riskClassification && metric.risk_classification) {
                riskClassification = metric.risk_classification;
              }
              if (!hasBloodGlucose && metric.blood_glucose !== null && metric.blood_glucose !== undefined && metric.blood_glucose !== '') {
                hasBloodGlucose = true;
              }
              if (!hasBloodPressure && ((metric.bp_systolic !== null && metric.bp_systolic !== undefined && metric.bp_systolic !== '') ||
                                       (metric.bp_diastolic !== null && metric.bp_diastolic !== undefined && metric.bp_diastolic !== ''))) {
                hasBloodPressure = true;
              }
              if (!hasWoundPhoto && metric.wound_photo_url !== null && metric.wound_photo_url !== undefined && metric.wound_photo_url !== '') {
                hasWoundPhoto = true;
              }
            });
          }

          // Fetch latest lab result from patient_labs table
          const { data: labData, error: labError } = await supabase
            .from('patient_labs')
            .select('*')
            .eq('patient_id', patient.patient_id)
            .order('date_submitted', { ascending: false })
            .limit(1);

          let latestLabResult = null;
          if (labError) {
            console.error(`Error fetching lab results for patient ${patient.patient_id}:`, labError.message);
          } else if (labData && labData.length > 0) {
            latestLabResult = labData[0];
          }

          return {
            ...patient,
            risk_classification: riskClassification,
            has_blood_glucose: hasBloodGlucose,
            has_blood_pressure: hasBloodPressure,
            has_wound_photo: hasWoundPhoto,
            latest_lab_result: latestLabResult
          };
        })
      );

      setPatients(patientsWithRisk);
      
      // Calculate dashboard metrics
      setTotalPatientsCount(patientsWithRisk.length);
      
      // Calculate counts for charts based on the new data
      let preOp = 0;
      let postOp = 0;
      let lowRisk = 0;
      let moderateRisk = 0;
      let highRisk = 0;
      let pendingLabs = 0;
      
      patientsWithRisk.forEach(patient => {
        // Patient Categories
        if (patient.phase === 'Pre-Operative') {
          preOp++;
        } else if (patient.phase === 'Post-Operative') {
          postOp++;
        }
        
        // Risk Classification  
        const risk = (patient.risk_classification || '').toLowerCase();
        if (risk === 'low') {
          lowRisk++;
        } else if (risk === 'moderate') {
          moderateRisk++;
        } else if (risk === 'high') {
          highRisk++;
        }
        
        // Pending Lab Results (patients who need lab work)
        // This can be determined by checking if they have recent lab results
        // For now, we'll use a simple check - you can modify this logic based on your needs
        if (!patient.latest_lab_result || patient.lab_status === 'Awaiting' || patient.lab_status === 'N/A') {
          pendingLabs++;
        }
      });
      
      setPreOpCount(preOp);
      setPostOpCount(postOp);
      setLowRiskCount(lowRisk);
      setModerateRiskCount(moderateRisk);
      setHighRiskCount(highRisk);
      setPendingLabResultsCount(pendingLabs);

      // Generate chart data based on actual database records
      await generateChartData(patientsWithRisk);
    } catch (err) {
      setError("Error fetching patients: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Function to generate real chart data based on actual database records
  const generateChartData = async (patientsWithRiskData) => {
    // Generate last 6 months of data
    const months = [];
    const monthKeys = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      months.push(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    
    try {
      // Fetch all patients with their created_at dates
      const { data: allPatients, error: patientsError } = await supabase
        .from('patients')
        .select('patient_id, created_at')
        .eq('preferred_doctor_id', user.doctor_id);

      if (patientsError) throw patientsError;

      // Count patients registered per month (NOT cumulative)
      const patientData = monthKeys.map((monthKey) => {
        const [year, month] = monthKey.split('-');
        return allPatients.filter(p => {
          const createdDate = new Date(p.created_at);
          return createdDate.getFullYear() === parseInt(year) && 
                 (createdDate.getMonth() + 1) === parseInt(month);
        }).length;
      });

      // Fetch all lab submissions with their dates
      const { data: allLabs, error: labsError } = await supabase
        .from('patient_labs')
        .select('lab_id, date_submitted, patient_id')
        .in('patient_id', allPatients.map(p => p.patient_id));

      if (labsError) throw labsError;

      // Count lab submissions per month
      const labData = monthKeys.map((monthKey) => {
        const [year, month] = monthKey.split('-');
        return allLabs.filter(lab => {
          const labDate = new Date(lab.date_submitted);
          return labDate.getFullYear() === parseInt(year) && 
                 (labDate.getMonth() + 1) === parseInt(month);
        }).length;
      });

      setAppointmentChartData({
        labels: months,
        data: patientData,
      });
      
      setLabSubmissionChartData({
        labels: months,
        data: labData,
      });

      // Calculate full compliance per month by checking health_metrics
      const fullComplianceData = await Promise.all(monthKeys.map(async (monthKey) => {
        const [year, month] = monthKey.split('-');
        const monthStart = new Date(`${year}-${month}-01`);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        // Get all health metrics for this month
        const { data: monthMetrics, error: metricsError } = await supabase
          .from('health_metrics')
          .select('patient_id, blood_glucose, bp_systolic, bp_diastolic, wound_photo_url')
          .in('patient_id', allPatients.map(p => p.patient_id))
          .gte('submission_date', monthStart.toISOString())
          .lt('submission_date', monthEnd.toISOString());

        if (metricsError) {
          console.error('Error fetching metrics for month:', metricsError);
          return 0;
        }

        // Group metrics by patient and check for full compliance
        const patientMetricsMap = {};
        monthMetrics.forEach(metric => {
          if (!patientMetricsMap[metric.patient_id]) {
            patientMetricsMap[metric.patient_id] = {
              hasBloodGlucose: false,
              hasBloodPressure: false,
              hasWoundPhoto: false
            };
          }
          if (metric.blood_glucose) patientMetricsMap[metric.patient_id].hasBloodGlucose = true;
          if (metric.bp_systolic || metric.bp_diastolic) patientMetricsMap[metric.patient_id].hasBloodPressure = true;
          if (metric.wound_photo_url) patientMetricsMap[metric.patient_id].hasWoundPhoto = true;
        });

        // Count patients with full compliance
        return Object.values(patientMetricsMap).filter(metrics => 
          metrics.hasBloodGlucose && metrics.hasBloodPressure && metrics.hasWoundPhoto
        ).length;
      }));

      setFullComplianceChartData({
        labels: months,
        data: fullComplianceData,
      });

      // Calculate missing logs per month (patients missing at least one metric)
      const missingLogsData = await Promise.all(monthKeys.map(async (monthKey) => {
        const [year, month] = monthKey.split('-');
        const monthStart = new Date(`${year}-${month}-01`);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        const { data: monthMetrics, error: metricsError } = await supabase
          .from('health_metrics')
          .select('patient_id, blood_glucose, bp_systolic, bp_diastolic, wound_photo_url')
          .in('patient_id', allPatients.map(p => p.patient_id))
          .gte('submission_date', monthStart.toISOString())
          .lt('submission_date', monthEnd.toISOString());

        if (metricsError) {
          console.error('Error fetching metrics for month:', metricsError);
          return 0;
        }

        // Check all patients registered to this doctor - not just those with metrics
        const patientMetricsMap = {};
        
        // Initialize all patients with false flags
        allPatients.forEach(patient => {
          patientMetricsMap[patient.patient_id] = {
            hasBloodGlucose: false,
            hasBloodPressure: false,
            hasWoundPhoto: false
          };
        });
        
        // Update flags based on submitted metrics (if any exist)
        if (monthMetrics && monthMetrics.length > 0) {
          monthMetrics.forEach(metric => {
            if (patientMetricsMap[metric.patient_id]) {
              if (metric.blood_glucose) patientMetricsMap[metric.patient_id].hasBloodGlucose = true;
              if (metric.bp_systolic || metric.bp_diastolic) patientMetricsMap[metric.patient_id].hasBloodPressure = true;
              if (metric.wound_photo_url) patientMetricsMap[metric.patient_id].hasWoundPhoto = true;
            }
          });
        }

        // Count patients who are missing ANY of the three metrics
        const missingLogsCount = Object.values(patientMetricsMap).filter(metrics => {
          const submittedCount = (metrics.hasBloodGlucose ? 1 : 0) + 
                                (metrics.hasBloodPressure ? 1 : 0) + 
                                (metrics.hasWoundPhoto ? 1 : 0);
          
          // Patient has missing logs if they have less than 3 metrics (missing at least one)
          return submittedCount < 3;
        }).length;

        console.log(`Missing logs for ${monthKey}:`, missingLogsCount);
        return missingLogsCount;
      }));

      console.log('Missing Logs Chart Data:', { labels: months, data: missingLogsData });

      setMissingLogsChartData({
        labels: months,
        data: missingLogsData,
      });

      // Calculate non-compliant per month (high risk patients with all 3 metrics missing)
      const nonCompliantData = await Promise.all(monthKeys.map(async (monthKey) => {
        const [year, month] = monthKey.split('-');
        const monthStart = new Date(`${year}-${month}-01`);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        // Get high risk patients
        const highRiskPatients = allPatients.filter(p => {
          const patient = patients.find(pat => pat.patient_id === p.patient_id);
          return patient && (patient.risk_classification || '').toLowerCase() === 'high';
        });

        console.log(`High risk patients for ${monthKey}:`, highRiskPatients.length);

        if (highRiskPatients.length === 0) return 0;

        const { data: monthMetrics, error: metricsError } = await supabase
          .from('health_metrics')
          .select('patient_id, blood_glucose, bp_systolic, bp_diastolic, wound_photo_url')
          .in('patient_id', highRiskPatients.map(p => p.patient_id))
          .gte('submission_date', monthStart.toISOString())
          .lt('submission_date', monthEnd.toISOString());

        if (metricsError) {
          console.error('Error fetching metrics for month:', metricsError);
          return 0;
        }

        // Initialize all high-risk patients with false flags
        const patientMetricsMap = {};
        highRiskPatients.forEach(patient => {
          patientMetricsMap[patient.patient_id] = {
            hasBloodGlucose: false,
            hasBloodPressure: false,
            hasWoundPhoto: false
          };
        });

        // Update flags based on submitted metrics (if any exist)
        if (monthMetrics && monthMetrics.length > 0) {
          monthMetrics.forEach(metric => {
            if (patientMetricsMap[metric.patient_id]) {
              if (metric.blood_glucose) patientMetricsMap[metric.patient_id].hasBloodGlucose = true;
              if (metric.bp_systolic || metric.bp_diastolic) patientMetricsMap[metric.patient_id].hasBloodPressure = true;
              if (metric.wound_photo_url) patientMetricsMap[metric.patient_id].hasWoundPhoto = true;
            }
          });
        }

        // Count high risk patients with 0 metrics (all 3 missing - non-compliant)
        const nonCompliantCount = Object.values(patientMetricsMap).filter(metrics => {
          const submittedCount = (metrics.hasBloodGlucose ? 1 : 0) + 
                                (metrics.hasBloodPressure ? 1 : 0) + 
                                (metrics.hasWoundPhoto ? 1 : 0);
          // Non-compliant = 0 metrics submitted (all 3 missing)
          return submittedCount === 0;
        }).length;
        
        console.log(`Non-compliant for ${monthKey}:`, nonCompliantCount);
        return nonCompliantCount;
      }));

      console.log('Non-Compliant Chart Data:', { labels: months, data: nonCompliantData });

      setNonCompliantChartData({
        labels: months,
        data: nonCompliantData,
      });

    } catch (error) {
      console.error('Error generating chart data:', error);
      // Fallback to empty data
      setAppointmentChartData({
        labels: months,
        data: new Array(6).fill(0),
      });
      
      setLabSubmissionChartData({
        labels: months,
        data: new Array(6).fill(0),
      });

      setFullComplianceChartData({
        labels: months,
        data: new Array(6).fill(0),
      });

      setMissingLogsChartData({
        labels: months,
        data: new Array(6).fill(0),
      });

      setNonCompliantChartData({
        labels: months,
        data: new Array(6).fill(0),
      });
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
    // Prevent multiple simultaneous fetches for the same patient
    if (fetchingPatientDetails) {
      console.log("Already fetching patient details, skipping...");
      return;
    }
    
    console.log(`Fetching details for patient ID: ${patientId}`);
    setFetchingPatientDetails(true);
    setLoading(true);
    setError("");
    try {
      // Fetch the patient with their assigned doctor information
      const { data: patientWithDoctor, error: patientError } = await supabase
        .from("patients")
        .select(`
          *,
          doctors!preferred_doctor_id (
            doctor_id,
            first_name,
            last_name,
            specialization
          )
        `)
        .eq("patient_id", patientId)
        .single();

      if (patientError) {
        console.error("Error fetching patient details:", patientError);
        // If there's a relationship error, try fetching without the relationship
        const { data: patientOnly, error: simplePatientError } = await supabase
          .from("patients")
          .select("*")
          .eq("patient_id", patientId)
          .single();
        
        if (simplePatientError) {
          console.error("Error fetching simple patient data:", simplePatientError);
          throw simplePatientError;
        }
        console.log("Successfully fetched simple patient data:", patientOnly);
        setSelectedPatient(patientOnly);
      } else {
        // Update selected patient with doctor information
        console.log("Successfully fetched patient with doctor:", patientWithDoctor);
        setSelectedPatient(patientWithDoctor);
      }

      const { data: metrics, error: metricsError } = await supabase
        .from("health_metrics")
        .select("*")
        .eq("patient_id", patientId)
        .order("submission_date", { ascending: false });

      if (metricsError) {
        console.error("Error fetching health metrics:", metricsError);
        throw metricsError;
      }
      console.log(`Fetched ${metrics?.length || 0} health metrics`);
      setPatientMetrics(metrics || []);
      setAllPatientHealthMetrics(metrics || []); // Store all metrics for charts

      // Filter for wound photos and set the state
      const photos = metrics.filter(metric => metric.wound_photo_url).map(metric => ({
        metric_id: metric.metric_id, // Include metric_id to identify the row
        url: metric.wound_photo_url,
        date: metric.submission_date,
        notes: metric.notes,
      }));
      setWoundPhotos(photos);
      setAllWoundPhotos(photos); // Store all wound photos for gallery

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

      // --- NEW: Fetch specialist assignments for the selected patient ---
      console.log(`Fetching specialists for patient ID: ${patientId}`);
      const { data: specialists, error: specialistsError } = await supabase
        .from("patient_specialists")
        .select(`
          id,
          doctor_id,
          specialization,
          assigned_at,
          doctors!doctor_id (
            doctor_id,
            first_name,
            last_name,
            specialization
          )
        `)
        .eq("patient_id", patientId)
        .order("assigned_at", { ascending: false });

      if (specialistsError) {
        console.error("Error fetching specialists:", specialistsError);
        // Try fetching without the relationship if there's an error
        const { data: simpleSpecialists, error: simpleSpecialistsError } = await supabase
          .from("patient_specialists")
          .select("id, doctor_id, specialization, assigned_at")
          .eq("patient_id", patientId)
          .order("assigned_at", { ascending: false });
        
        if (simpleSpecialistsError) {
          console.error("Error fetching simple specialists:", simpleSpecialistsError);
          setCurrentPatientSpecialists([]);
        } else {
          console.log("Fetched simple specialists:", simpleSpecialists);
          setCurrentPatientSpecialists(simpleSpecialists || []);
        }
      } else {
        console.log("Fetched specialists:", specialists);
        setCurrentPatientSpecialists(specialists || []);
      }

    } catch (err) {
      console.error("Error in fetchPatientDetails:", err);
      setError("Error fetching patient details: " + err.message);
    } finally {
      console.log("fetchPatientDetails completed, setting loading to false");
      setLoading(false);
      setFetchingPatientDetails(false);
    }
  };

  // Helper function to handle photo expansion
  const handleExpandPhoto = (photo) => {
    setExpandedPhoto(photo);
  };

  // Helper function to close expanded photo
  const handleCloseExpandedPhoto = () => {
    setExpandedPhoto(null);
  };

  // Helper function to check if date has appointments for calendar
  const getAppointmentsForDate = (date) => {
    return patientAppointments.filter(appointment => {
      const appointmentDate = new Date(appointment.appointment_datetime).toDateString();
      return appointmentDate === date.toDateString();
    });
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      onLogout();
    }
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleViewClick = useCallback((patient) => {
    // Reset loading states when selecting a new patient
    setLoading(false);
    setFetchingPatientDetails(false);
    setError("");
    // Reset pagination when selecting new patient
    setCurrentPageHealthMetrics(1);
    setSelectedPatient(patient);
    setActivePage("patient-profile");
  }, []);

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

  const handlePhaseToggle = async (patient) => {
    const newPhase = patient.phase === 'Pre-Operative' ? 'Post-Operative' : 'Pre-Operative';
    
    if (window.confirm(`Are you sure you want to change ${patient.first_name} ${patient.last_name}'s phase from ${patient.phase} to ${newPhase}?`)) {
      setLoading(true);
      setError("");
      try {
        const { error } = await supabase
          .from("patients")
          .update({ phase: newPhase })
          .eq("patient_id", patient.patient_id);

        if (error) {
          setError(`Error updating patient phase: ${error.message}`);
        } else {
          // Log the phase change
          await logPatientDataChange(
            'doctor',
            user.doctor_id,
            `${user.first_name} ${user.last_name}`,
            patient.patient_id,
            'phase_update',
            'edit',
            `Phase changed from ${patient.phase} to ${newPhase}`,
            `Updated phase for ${patient.first_name} ${patient.last_name}`,
            'Doctor Dashboard - Patient Phase Management'
          );
          
          alert(`Patient phase updated to ${newPhase} successfully!`);
          fetchPatients(); // Refresh the patient list to show the updated phase
        }
      } catch (err) {
        setError("Error updating patient phase: " + err.message);
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

      // Log medication addition
      await logMedicationChange(
        'doctor',
        user.doctor_id,
        `${user.first_name} ${user.last_name}`,
        selectedPatient.patient_id,
        'create',
        '',
        JSON.stringify({
          medication: medication,
          frequency: {
            time_of_day: newMedicationFrequency.timeOfDay,
            start_date: newMedicationFrequency.startDate
          }
        }),
        'Patient Profile - Doctor Dashboard'
      );

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
        // Get medication data before deletion for audit log
        const { data: medicationData } = await supabase
          .from("medications")
          .select(`
            *,
            medication_frequencies (*)
          `)
          .eq("id", medId)
          .single();

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

        // Log medication removal
        await logMedicationChange(
          'doctor',
          user.doctor_id,
          `${user.first_name} ${user.last_name}`,
          selectedPatient.patient_id,
          'delete',
          JSON.stringify(medicationData),
          'Medication removed',
          'Patient Profile - Doctor Dashboard'
        );

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
      // Get current medication data for audit log
      const { data: currentData } = await supabase
        .from("medications")
        .select(`
          *,
          medication_frequencies (*)
        `)
        .eq("id", medId)
        .single();

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

      // Get updated data for audit log
      const { data: updatedData } = await supabase
        .from("medications")
        .select(`
          *,
          medication_frequencies (*)
        `)
        .eq("id", medId)
        .single();

      // Log medication update
      await logMedicationChange(
        'doctor',
        user.doctor_id,
        `${user.first_name} ${user.last_name}`,
        selectedPatient.patient_id,
        'edit',
        JSON.stringify(currentData),
        JSON.stringify(updatedData),
        'Patient Profile - Doctor Dashboard'
      );

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

  // Appointment handling functions
  const handleAppointmentChange = (field, value) => {
    setAppointmentForm({ ...appointmentForm, [field]: value });
  };

  const createAppointment = async () => {
    if (!appointmentForm.doctorId || !appointmentForm.patientId || !appointmentForm.date || !appointmentForm.time) {
      alert("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setMessage("");
    
    try {
      const appointmentDateTime = `${appointmentForm.date}T${appointmentForm.time}:00`;
      
      if (editingAppointmentId) {
        // Update existing appointment
        const { error } = await supabase
          .from("appointments")
          .update({
            doctor_id: appointmentForm.doctorId,
            patient_id: appointmentForm.patientId,
            appointment_datetime: appointmentDateTime,
            notes: appointmentForm.notes,
          })
          .eq("appointment_id", editingAppointmentId);

        if (error) throw error;
        setMessage("Appointment updated successfully!");
        setEditingAppointmentId(null);
      } else {
        // Create new appointment
        const { error } = await supabase
          .from("appointments")
          .insert({
            doctor_id: appointmentForm.doctorId,
            patient_id: appointmentForm.patientId,
            appointment_datetime: appointmentDateTime,
            notes: appointmentForm.notes,
            appointment_state: "pending"
          });

        if (error) throw error;
        setMessage("Appointment scheduled successfully!");
      }

      // Reset form
      setAppointmentForm({ doctorId: "", patientId: "", date: "", time: "", notes: "" });
      
      // Refresh appointments
      fetchAppointments();
      
    } catch (err) {
      setMessage("Error with appointment: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (window.confirm("Are you sure you want to cancel this appointment?")) {
      try {
        const { error } = await supabase
          .from("appointments")
          .update({ appointment_state: "cancelled" })
          .eq("appointment_id", appointmentId);

        if (error) throw error;
        
        setMessage("Appointment cancelled successfully!");
        fetchAppointments();
      } catch (err) {
        setMessage("Error cancelling appointment: " + err.message);
      }
    }
  };

  const handleInQueueAppointment = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ appointment_state: "in queue" })
        .eq("appointment_id", appointmentId);

      if (error) throw error;
      
      setMessage("Appointment moved to queue!");
      fetchAppointments();
    } catch (err) {
      setMessage("Error updating appointment: " + err.message);
    }
  };

  const filteredPatients = patients.filter((patient) =>
    `${patient.first_name} ${patient.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Patient filtering and pagination functions
  const handleRiskFilterChange = (riskLevel) => {
    setSelectedRiskFilter(riskLevel);
    setCurrentPagePatients(1); // Reset to first page when filter changes
  };

  // Filter patients based on search term and risk filter
  const getFilteredPatients = () => {
    let filtered = patients.filter((patient) =>
      `${patient.first_name} ${patient.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Apply risk filter
    if (selectedRiskFilter !== 'all') {
      filtered = filtered.filter(patient => {
        const risk = (patient.risk_classification || '').toLowerCase();
        return risk === selectedRiskFilter;
      });
    }

    return filtered;
  };

  // Get patients for current page
  const getPaginatedPatients = () => {
    const filtered = getFilteredPatients();
    const startIndex = (currentPagePatients - 1) * PATIENTS_PER_PAGE;
    const endIndex = startIndex + PATIENTS_PER_PAGE;
    return filtered.slice(startIndex, endIndex);
  };

  // Calculate risk counts for filter display
  const getPatientRiskCounts = () => {
    const filtered = patients.filter((patient) =>
      `${patient.first_name} ${patient.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const counts = {
      all: filtered.length,
      low: 0,
      moderate: 0,
      high: 0,
      ppd: 0
    };

    filtered.forEach(patient => {
      const risk = (patient.risk_classification || '').toLowerCase();
      if (counts.hasOwnProperty(risk)) {
        counts[risk]++;
      }
    });

    return counts;
  };

  // Calculate total pages
  const getTotalPatientPages = () => {
    const filtered = getFilteredPatients();
    return Math.ceil(filtered.length / PATIENTS_PER_PAGE);
  };

  // Health metrics pagination functions
  const getPaginatedHealthMetrics = () => {
    const startIndex = (currentPageHealthMetrics - 1) * HEALTH_METRICS_PER_PAGE;
    const endIndex = startIndex + HEALTH_METRICS_PER_PAGE;
    return allPatientHealthMetrics.slice(startIndex, endIndex);
  };

  const getTotalHealthMetricsPages = () => {
    return Math.ceil(allPatientHealthMetrics.length / HEALTH_METRICS_PER_PAGE);
  };

  const renderPatientList = () => {
    const paginatedPatients = getPaginatedPatients();
    const patientRiskCounts = getPatientRiskCounts();
    const totalPatientPages = getTotalPatientPages();

    return (
      <div className="patient-list-section">
        <h2>My Patients</h2>
        <div className="search-and-filter-row">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search patients by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="patient-search-input"
            />
            <i className="fas fa-search search-icon"></i>
          </div>
          
          {/* Risk Classification Filter */}
          <RiskFilter
            selectedRisk={selectedRiskFilter}
            onRiskChange={handleRiskFilterChange}
            showCounts={true}
            counts={patientRiskCounts}
          />
        </div>
        
        <table className="patient-table">
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
            {paginatedPatients.length > 0 ? (
              paginatedPatients.map((patient) => (
                <tr key={patient.patient_id}>
                  <td className="patient-name-cell">
                    <div className="patient-name-container">
                      <img 
                        src={patient.patient_picture || "../picture/secretary.png"} 
                        alt="Patient Avatar" 
                        className="patient-avatar-table"
                        onError={(e) => e.target.src = "../picture/secretary.png"}
                      />
                      <span className="patient-name-text">{patient.first_name} {patient.last_name}</span>
                    </div>
                  </td>
                  <td>{patient.date_of_birth ? `${Math.floor((new Date() - new Date(patient.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))}/${patient.gender}` : 'N/A'}</td>
                  <td className={`doctor-classification-cell ${
                    getLabStatus(patient.latest_lab_result) === 'Awaiting' ? 'doctor-classification-awaiting' :
                    ((patient.risk_classification || '').toLowerCase() === 'low' ? 'doctor-classification-low' :
                    (patient.risk_classification || '').toLowerCase() === 'moderate' ? 'doctor-classification-moderate' :
                    (patient.risk_classification || '').toLowerCase() === 'high' ? 'doctor-classification-high' :
                    (patient.risk_classification || '').toLowerCase() === 'ppd' ? 'doctor-classification-ppd' : 
                    'doctor-classification-default')
                  }`}>
                    {getClassificationDisplay(patient)}
                  </td>
                  <td className={
                    getLabStatus(patient.latest_lab_result) === 'Submitted' ? 'lab-status-complete' :
                    getLabStatus(patient.latest_lab_result) === 'Awaiting' ? 'lab-status-awaiting' : 
                    'lab-status-awaiting'
                  }>
                    {getLabStatus(patient.latest_lab_result)}
                  </td>
                  <td className={getProfileStatus(patient) === 'Complete' ? 'status-complete' : 'status-incomplete'}>
                    {getProfileStatus(patient)}
                  </td>
                  <td>{formatDateToReadable(patient.last_doctor_visit)}</td>
                  <td className="patient-actions-cell">
                    <button className="view-button" onClick={() => handleViewClick(patient)}>👁️ View</button>
                    <button className="delete-button" onClick={() => handleDeleteClick(patient)}>🗑️ Delete</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">No patients found.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPatientPages > 1 && (
          <Pagination
            currentPage={currentPagePatients}
            totalPages={totalPatientPages}
            onPageChange={setCurrentPagePatients}
            itemsPerPage={PATIENTS_PER_PAGE}
            totalItems={getFilteredPatients().length}
            showPageInfo={true}
          />
        )}
      </div>
    );
  };

  const renderAppointmentsSection = () => (
    <div className="appointments-section">
      <h2>{editingAppointmentId ? "Edit Appointment" : "Schedule New Appointment"}</h2>

      <div className="form-columns">
        <div className="form-group">
          <label>Select Doctor:</label>
          <select value={appointmentForm.doctorId} onChange={(e) => handleAppointmentChange("doctorId", e.target.value)}>
            <option value="">Select Doctor</option>
            <option value={user.doctor_id}>{user.first_name} {user.last_name}</option>
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
      </div>

      <div className="form-group full-width">
        <label>Notes:</label>
        <textarea placeholder="Notes" value={appointmentForm.notes} onChange={(e) => handleAppointmentChange("notes", e.target.value)} />
      </div>

      <div className="button-group">
        <button onClick={createAppointment}>{editingAppointmentId ? "Update Appointment" : "Schedule Appointment"}</button>
        {editingAppointmentId && (
          <button
            className="cancel-button"
            onClick={() => {
              setEditingAppointmentId(null);
              setAppointmentForm({ doctorId: "", patientId: "", date: "", time: "", notes: "" });
              setActivePage("appointments");
            }}
          >
            Cancel Edit
          </button>
        )}
      </div>

      {message && <p className="form-message">{message}</p>}

    </div>
  );

  const renderReportsSection = () => (
    <div className="reports-section">
      <h2>Reports Overview</h2>
      
      {/* Reports Widgets Grid */}
      <div className="reports-widgets-grid">
        {/* Total Patients Report Widget */}
        <div className="report-widget report-total-patients">
          <div className="report-widget-header">
            <img src="../picture/total.png" alt="Total Patients" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/1FAAED/ffffff?text=👥"; }}/>
            <h4>Total Patients</h4>
          </div>
          <div className="report-widget-content">
            <div className="report-widget-left">
              <p className="report-number">{patients.length}</p>
            </div>
            <div className="report-widget-right">
              <p className="report-subtitle">Patients registered in the system</p>
            </div>
          </div>
          <div className="mini-chart-container">
            {appointmentChartData?.labels?.length > 0 ? (
              <Line 
                key={`report-patient-count-chart-${patients.length}`}
                data={{
                  labels: appointmentChartData.labels,
                  datasets: [
                    {
                      label: 'Total Patients',
                      data: appointmentChartData.data,
                      fill: true,
                      backgroundColor: (context) => {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if (!chartArea) return null;
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, 'rgba(31, 170, 237, 0.6)');
                        gradient.addColorStop(0.5, 'rgba(31, 170, 237, 0.3)');
                        gradient.addColorStop(1, 'rgba(31, 170, 237, 0.1)');
                        return gradient;
                      },
                      borderColor: '#1FAAED',
                      borderWidth: 2,
                      pointBackgroundColor: 'transparent',
                      pointBorderColor: 'transparent',
                      pointBorderWidth: 0,
                      pointRadius: 0,
                      pointHoverRadius: 0,
                      pointHoverBackgroundColor: '#1FAAED',
                      pointHoverBorderColor: '#fff',
                      pointHoverBorderWidth: 3,
                      tension: 0.4,
                      hoverBackgroundColor: 'rgba(31, 170, 237, 0.7)',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  layout: {
                    padding: { top: 5, bottom: 5, left: 2, right: 2 }
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      enabled: true,
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      titleColor: '#fff',
                      bodyColor: '#fff',
                      borderColor: '#1FAAED',
                      borderWidth: 1,
                      cornerRadius: 4,
                      displayColors: false,
                      callbacks: {
                        title: function(context) { return `Month: ${context[0].label}`; },
                        label: function(context) { return `Total Patients: ${context.raw}`; }
                      }
                    }
                  },
                  scales: {
                    y: { display: false, beginAtZero: true, grid: { display: false } },
                    x: { display: false, grid: { display: false } }
                  },
                  elements: {
                    point: { radius: 0, hoverRadius: 0 },
                    line: { borderWidth: 2 }
                  },
                  interaction: { intersect: false, mode: 'index' }
                }}
              />
            ) : (
              <div className="no-chart-data"><p>No patient data available</p></div>
            )}
          </div>
        </div>

        {/* Full Compliance Report Widget */}
        <div className="report-widget report-full-compliance">
          <div className="report-widget-header">
            <img src="../picture/full.svg" alt="Full Compliance" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/28a745/ffffff?text=✓"; }}/>
            <h4>Full Compliance</h4>
          </div>
          <div className="report-widget-content">
            <div className="report-widget-left">
              <p className="report-number">
                {patients.filter(pat => {
                  const compliance = getPatientComplianceStatus(pat);
                  return compliance.isFullCompliance;
                }).length}
              </p>
            </div>
            <div className="report-widget-right">
              <p className="report-subtitle">Patients with complete metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
            </div>
          </div>
          <div className="mini-chart-container">
            <Line 
              data={{
                labels: fullComplianceChartData?.labels || appointmentChartData?.labels || ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
                datasets: [
                  {
                    label: 'Full Compliance',
                    data: fullComplianceChartData?.data || [0, 0, 0, 0, 0, 0],
                    fill: true,
                    backgroundColor: (context) => {
                      const chart = context.chart;
                      const {ctx, chartArea} = chart;
                      if (!chartArea) return null;
                      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                      gradient.addColorStop(0, 'rgba(40, 167, 69, 0.6)');
                      gradient.addColorStop(0.5, 'rgba(40, 167, 69, 0.3)');
                      gradient.addColorStop(1, 'rgba(40, 167, 69, 0.1)');
                      return gradient;
                    },
                    borderColor: '#28a745',
                    borderWidth: 2,
                    pointBackgroundColor: 'transparent',
                    pointBorderColor: 'transparent',
                    pointBorderWidth: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: '#28a745',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 3,
                    tension: 0.4,
                    hoverBackgroundColor: 'rgba(40, 167, 69, 0.7)',
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 5, bottom: 5, left: 2, right: 2 } },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#28a745',
                    borderWidth: 1,
                    cornerRadius: 4,
                    displayColors: false,
                    callbacks: {
                      title: function(context) { return `Month: ${context[0].label}`; },
                      label: function(context) { return `Full Compliance: ${context.raw}`; }
                    }
                  }
                },
                scales: {
                  y: { display: false, beginAtZero: true, grid: { display: false } },
                  x: { display: false, grid: { display: false } }
                },
                elements: {
                  point: { radius: 0, hoverRadius: 0 },
                  line: { borderWidth: 2 }
                },
                interaction: { intersect: false, mode: 'index' }
              }}
            />
          </div>
        </div>

        {/* Missing Logs Report Widget */}
        <div className="report-widget report-missing-logs">
          <div className="report-widget-header">
            <img src="../picture/missinglogs.svg" alt="Missing Logs" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/ffc107/ffffff?text=⚠"; }}/>
            <h4>Missing Logs</h4>
          </div>
          <div className="report-widget-content">
            <div className="report-widget-left">
              <p className="report-number">
                {patients.filter(pat => {
                  const compliance = getPatientComplianceStatus(pat);
                  return compliance.isMissingLogs;
                }).length}
              </p>
            </div>
            <div className="report-widget-right">
              <p className="report-subtitle">Patients missing at least one metric (Blood Glucose, Blood Pressure, or Wound Photos)</p>
            </div>
          </div>
          <div className="mini-chart-container">
            <Line 
              data={{
                labels: missingLogsChartData?.labels || appointmentChartData?.labels || ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
                datasets: [
                  {
                    label: 'Missing Logs',
                    data: missingLogsChartData?.data || [0, 0, 0, 0, 0, 0],
                    fill: true,
                    backgroundColor: (context) => {
                      const chart = context.chart;
                      const {ctx, chartArea} = chart;
                      if (!chartArea) return null;
                      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                      gradient.addColorStop(0, 'rgba(255, 193, 7, 0.6)');
                      gradient.addColorStop(0.5, 'rgba(255, 193, 7, 0.3)');
                      gradient.addColorStop(1, 'rgba(255, 193, 7, 0.1)');
                      return gradient;
                    },
                    borderColor: '#ffc107',
                    borderWidth: 2,
                    pointBackgroundColor: 'transparent',
                    pointBorderColor: 'transparent',
                    pointBorderWidth: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: '#ffc107',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 3,
                    tension: 0.4,
                    hoverBackgroundColor: 'rgba(255, 193, 7, 0.7)',
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 5, bottom: 5, left: 2, right: 2 } },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#ffc107',
                    borderWidth: 1,
                    cornerRadius: 4,
                    displayColors: false,
                    callbacks: {
                      title: function(context) { return `Month: ${context[0].label}`; },
                      label: function(context) { return `Missing Logs: ${context.raw}`; }
                    }
                  }
                },
                scales: {
                  y: { display: false, beginAtZero: true, grid: { display: false } },
                  x: { display: false, grid: { display: false } }
                },
                elements: {
                  point: { radius: 0, hoverRadius: 0 },
                  line: { borderWidth: 2 }
                },
                interaction: { intersect: false, mode: 'index' }
              }}
            />
          </div>
        </div>

        {/* Non-Compliant Report Widget */}
        <div className="report-widget report-non-compliant">
          <div className="report-widget-header">
            <img src="../picture/noncompliant.svg" alt="Non-Compliant" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/dc3545/ffffff?text=✗"; }}/>
            <h4>Non-Compliant</h4>
          </div>
          <div className="report-widget-content">
            <div className="report-widget-left">
              <p className="report-number">
                {patients.filter(pat => {
                  const compliance = getPatientComplianceStatus(pat);
                  const isHighRisk = (pat.risk_classification || '').toLowerCase() === 'high';
                  return compliance.isNonCompliant && isHighRisk;
                }).length}
              </p>
            </div>
            <div className="report-widget-right">
              <p className="report-subtitle">High risk patients with all 3 missing metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
            </div>
          </div>
          <div className="mini-chart-container">
            <Line 
              data={{
                labels: nonCompliantChartData?.labels || appointmentChartData?.labels || ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
                datasets: [
                  {
                    label: 'Non-Compliant',
                    data: nonCompliantChartData?.data || [0, 0, 0, 0, 0, 0],
                    fill: true,
                    backgroundColor: (context) => {
                      const chart = context.chart;
                      const {ctx, chartArea} = chart;
                      if (!chartArea) return null;
                      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                      gradient.addColorStop(0, 'rgba(220, 53, 69, 0.6)');
                      gradient.addColorStop(0.5, 'rgba(220, 53, 69, 0.3)');
                      gradient.addColorStop(1, 'rgba(220, 53, 69, 0.1)');
                      return gradient;
                    },
                    borderColor: '#dc3545',
                    borderWidth: 2,
                    pointBackgroundColor: 'transparent',
                    pointBorderColor: 'transparent',
                    pointBorderWidth: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: '#dc3545',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 3,
                    tension: 0.4,
                    hoverBackgroundColor: 'rgba(220, 53, 69, 0.7)',
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 5, bottom: 5, left: 2, right: 2 } },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#dc3545',
                    borderWidth: 1,
                    cornerRadius: 4,
                    displayColors: false,
                    callbacks: {
                      title: function(context) { return `Month: ${context[0].label}`; },
                      label: function(context) { return `Non-Compliant: ${context.raw}`; }
                    }
                  }
                },
                scales: {
                  y: { display: false, beginAtZero: true, grid: { display: false } },
                  x: { display: false, grid: { display: false } }
                },
                elements: {
                  point: { radius: 0, hoverRadius: 0 },
                  line: { borderWidth: 2 }
                },
                interaction: { intersect: false, mode: 'index' }
              }}
            />
          </div>
        </div>
      </div>

      {/* Reports Content Row - Bar Charts */}
      <div className="reports-content-row">
        {/* Risk Classification Bar Chart */}
        <div className="chart-container-reports">
          <h3>Patients by Risk Classification</h3>
          <Bar
            data={{
              labels: ['Low Risk', 'Moderate Risk', 'High Risk'],
              datasets: [
                {
                  label: 'Number of Patients',
                  data: [
                    patients.filter(p => (p.risk_classification || '').toLowerCase() === 'low').length,
                    patients.filter(p => (p.risk_classification || '').toLowerCase() === 'moderate').length,
                    patients.filter(p => (p.risk_classification || '').toLowerCase() === 'high').length,
                  ],
                  backgroundColor: [
                    'rgba(40, 167, 69, 0.7)',   // Green for Low
                    'rgba(255, 193, 7, 0.7)',   // Yellow for Moderate
                    'rgba(220, 53, 69, 0.7)',   // Red for High
                  ],
                  borderColor: [
                    '#28a745',
                    '#ffc107',
                    '#dc3545',
                  ],
                  borderWidth: 2,
                  borderRadius: 8,
                  barThickness: 60,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  titleColor: '#fff',
                  bodyColor: '#fff',
                  borderColor: '#1FAAED',
                  borderWidth: 1,
                  cornerRadius: 8,
                  padding: 12,
                  displayColors: false,
                  callbacks: {
                    label: function(context) {
                      return `Patients: ${context.raw}`;
                    }
                  }
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1,
                    font: {
                      size: 12,
                      family: 'Poppins',
                    },
                    color: '#6c757d',
                  },
                  grid: {
                    color: 'rgba(0, 0, 0, 0.05)',
                    drawBorder: false,
                  },
                },
                x: {
                  ticks: {
                    font: {
                      size: 13,
                      family: 'Poppins',
                      weight: '500',
                    },
                    color: '#495057',
                  },
                  grid: {
                    display: false,
                  },
                },
              },
            }}
          />
        </div>

        {/* Phase Bar Chart */}
        <div className="chart-container-reports">
          <h3>Patients by Phase</h3>
          <Bar
            data={{
              labels: ['Pre-Operative', 'Post-Operative'],
              datasets: [
                {
                  label: 'Number of Patients',
                  data: [
                    preOpCount,
                    postOpCount,
                  ],
                  backgroundColor: [
                    'rgba(141, 73, 247, 0.7)',  // Purple for Pre-Op
                    'rgba(73, 247, 141, 0.7)',  // Light Green for Post-Op
                  ],
                  borderColor: [
                    '#8D49F7',
                    '#49F78D',
                  ],
                  borderWidth: 2,
                  borderRadius: 8,
                  barThickness: 80,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  titleColor: '#fff',
                  bodyColor: '#fff',
                  borderColor: '#1FAAED',
                  borderWidth: 1,
                  cornerRadius: 8,
                  padding: 12,
                  displayColors: false,
                  callbacks: {
                    label: function(context) {
                      return `Patients: ${context.raw}`;
                    }
                  }
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1,
                    font: {
                      size: 12,
                      family: 'Poppins',
                    },
                    color: '#6c757d',
                  },
                  grid: {
                    color: 'rgba(0, 0, 0, 0.05)',
                    drawBorder: false,
                  },
                },
                x: {
                  ticks: {
                    font: {
                      size: 13,
                      family: 'Poppins',
                      weight: '500',
                    },
                    color: '#495057',
                  },
                  grid: {
                    display: false,
                  },
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );


const handleShowModal = (appointment, action) => {
  setAppointmentToConfirm(appointment);
  setActionType(action);
  setShowModal(true);
};

const handleCancelModal = () => {
  setShowModal(false);
  setAppointmentToConfirm(null);
  setActionType("");
};

const handleConfirmAction = async () => {
  if (!appointmentToConfirm) return;

  if (actionType === "cancel") {
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ appointment_state: "cancelled" })
        .eq("appointment_id", appointmentToConfirm.appointment_id);
      if (error) throw error;
      alert("Appointment cancelled successfully!");
      fetchAppointments();
    } catch (error) {
      console.error("Error cancelling appointment:", error.message);
      alert("Failed to cancel appointment.");
    }
  } else if (actionType === "done") {
    try {
      const { error: apptError } = await supabase
        .from("appointments")
        .update({ appointment_state: "Done" })
        .eq("appointment_id", appointmentToConfirm.appointment_id);
      if (apptError) throw apptError;

      const { data: patientData, error: patientFetchError } = await supabase
        .from("patients")
        .select("patient_visits")
        .eq("patient_id", appointmentToConfirm.patient_id)
        .single();
      if (patientFetchError) throw patientFetchError;

      const newVisits = patientData.patient_visits + 1;
      const { error: patientUpdateError } = await supabase
        .from("patients")
        .update({ patient_visits: newVisits })
        .eq("patient_id", appointmentToConfirm.patient_id);
      if (patientUpdateError) throw patientUpdateError;

      alert("Appointment completed successfully!");
      fetchAppointments();
    } catch (error) {
      console.error("Error completing appointment:", error.message);
      alert("Failed to complete appointment.");
    }
  }

  handleCancelModal();
};
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
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr><td colSpan="4">No upcoming appointments.</td></tr>
                ) : (
                  appointments
                    .filter(appt => appt.appointment_state !== 'Done' && appt.appointment_state !== 'cancelled')
                    .map((appt) => (
                    <tr key={appt.appointment_id}>
                      <td>{appt.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : "Unknown"}</td>
                      <td>{new Date(appt.appointment_datetime).toLocaleDateString()}</td>
                      <td>{new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{appt.notes || "N/A"}</td>
                      <td>{appt.appointment_state || "N/A"}</td> {/* NEW: Added appointment state data */}
                      <td>
                        <button onClick={() => handleShowModal(appt, "cancel")}>Cancel</button>
                        <button onClick={() => handleShowModal(appt, "done")}>Done</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
      </div>
  );

  {showModal && (
  <div className="modal-overlay3">
    <div className="modal-content3">
      <div className="modal-header3">
        <h3>Confirm Action</h3>
        <button className="close-button3" onClick={handleCancelModal}>
          &times;
        </button>
      </div>
      <div className="modal-body3">
        <p>
          Are you sure you want to{" "}
          <strong>{actionType === "cancel" ? "cancel" : "mark as done"}</strong>{" "}
          this appointment?
        </p>
        <div className="modal-button-group3">
          <button className="modal-confirm-button3" onClick={handleConfirmAction}>
            Confirm
          </button>
          <button className="modal-cancel-button3" onClick={handleCancelModal}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
)}

  const renderDashboardContent = () => {
    return (
      <div className="dashboard-columns-container">
        <div className="dashboard-left-column">
          <div className="quick-links">
            <h3>Quick links</h3>
            <div className="quick-links-grid">
              <div className="quick-link-item" onClick={() => setActivePage("patient-list")}>
                <div className="quick-link-icon patient-list">
                  <img src="../picture/secretary.png" alt="Patient List" className="quick-link-image" />
                </div>
                <span>Patient List</span>
              </div>
              <div className="quick-link-item" onClick={() => setActivePage("appointments")}>
                <div className="quick-link-icon set-appointment">
                  <img src="../picture/appointment.png" alt="Appointment" className="quick-link-image" />
                </div>
                <span>Appointments</span>
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
              lowRisk={lowRiskCount}
              moderateRisk={moderateRiskCount}
              highRisk={highRiskCount}
              patientCountHistory={appointmentChartData}
              pendingLabHistory={labSubmissionChartData}
            />
          </div>
        </div>

        <div className="dashboard-right-column">
          <div className="appointments-today">
            <h3>Upcoming Appointments</h3>
            <div className="appointment-list-container">
              <table className="appointment-list-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Patient Name</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center" }}>
                        No upcoming appointments.
                      </td>
                    </tr>
                  ) : (
                    appointments
                      .filter(appt => appt.appointment_state !== 'Done' && appt.appointment_state !== 'cancelled')
                      .slice(0, 5) // Show only first 5 appointments
                      .map((appt) => (
                        <tr key={appt.appointment_id}>
                          <td>{new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td>{appt.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : "Unknown"}</td>
                          <td className="appointment-status">
                            <span className={`status-${(appt.appointment_state || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                              {(() => {
                                const state = appt.appointment_state || 'pending';
                                if (state === 'in queue') return 'In Queue';
                                if (state === 'cancelled') return 'Cancelled';
                                if (state === 'pending') return 'Pending';
                                return state.charAt(0).toUpperCase() + state.slice(1);
                              })()}
                            </span>
                          </td>
                          <td className="appointment-actions">
                            <button onClick={() => handleShowModal(appt, "cancel")} className="action-btn5 cancel-btn5">
                              Cancel
                            </button>
                            <button onClick={() => handleShowModal(appt, "done")} className="action-btn5 done-btn5">
                              Done
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
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


  
  // NEW: Render Reports Content
const renderReportsContent = () => {
  const riskCounts = getPatientRiskCounts();
  const maxRiskCount = Math.max(riskCounts.Low, riskCounts.Moderate, riskCounts.High); // Renamed from maxCount for clarity

  const phaseCounts = getPatientPhaseCounts(); // Get phase counts inside the function
  const maxPhaseCount = Math.max(phaseCounts['Pre-Operative'], phaseCounts['Post-Operative']); // Define maxPhaseCount here

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
                  style={{ height: `${(count / (maxRiskCount || 1)) * 100}%` }} // Use maxRiskCount
                  title={`${risk}: ${count} patients`}
                ></div>
              </div>
              <div className="bar-chart-value3">{count}</div>
            </div>
          ))}
        </div>
      </div>

       {/* NEW: Patient Phase Classification Bar Chart */}
    <div className="card3 phase-chart-card3"> {/* Added new class for specific styling */}
      <h3>Patient Phase Classification</h3>
      <div className="bar-chart-container3">
        {Object.entries(phaseCounts).map(([phase, count]) => (
          <div className="bar-chart-item3" key={phase}>
            <div className="bar-chart-label3">{phase}</div>
            <div className="bar-chart-bar-wrapper3">
              <div className={`bar-chart-bar3 ${phase.toLowerCase().replace('-', '')}-phase-bar3`} style={{ height: `${(count / (maxPhaseCount || 1)) * 100}%` }} title={`${phase}: ${count} patients`} ></div>
            </div>
            <div className="bar-chart-value3">{count}</div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
};

    // NEW: Function to reset treatment plan forms
    const resetTreatmentPlanForms = () => {
        setDiagnosisDetails([{ id: Date.now(), text: '' }]);
        setWoundCareDetails([{ id: Date.now(), text: '' }]);
        setDressingDetails([{ id: Date.now(), text: '' }]);
        setMedicationTreatmentPlan([{ id: Date.now(), text: '' }]);
        setImportantNotes([{ id: Date.now(), text: '' }]);
        setFollowUpDetails([{ id: Date.now(), text: '' }]);
        setSelectedWoundPhoto(null);
    };

    // NEW: Function to handle "Create Treatment Plan" button click
    const handleCreateTreatmentPlan = () => {
        // Reset forms before starting a new treatment plan
        resetTreatmentPlanForms();
        
        // Find the latest wound photo if available
        const latestWoundPhoto = woundPhotos.length > 0 ? woundPhotos[0] : null;
        if (latestWoundPhoto) {
            // Set the selected wound photo
            setSelectedWoundPhoto(latestWoundPhoto);
            // Set active page to 'treatment-plan' to render the new content
            setActivePage("treatment-plan");
        } else {
            alert("No wound photos available for this patient to create a treatment plan.");
        }
    };

    // NEW: Function to handle "Create Treatment Plan" for a specific wound photo
    const handleCreateTreatmentPlanForPhoto = (photo) => {
        if (photo) {
            // Reset forms before starting a new treatment plan
            resetTreatmentPlanForms();
            
            // Set the selected wound photo for the treatment plan
            setSelectedWoundPhoto(photo);
            // Navigate to treatment plan page
            setActivePage("treatment-plan");
        } else {
            alert("No wound photo selected to create a treatment plan.");
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
      // Use the selected wound photo if available, otherwise use the latest one
      const latestWoundPhoto = selectedWoundPhoto || (woundPhotos.length > 0 ? woundPhotos[0] : null);
      // Get the latest metric for risk classification display
      const latestMetric = patientMetrics.length > 0 ? patientMetrics[0] : null;

      if (!selectedPatient) return <p>No patient selected for treatment plan.</p>;

      return (
          <div className="treatment-plan-wrapper3">
              <h2>Treatment Plan for {selectedPatient.first_name} {selectedPatient.last_name}</h2>
                {/* Overall 2-column flexbox layout for patient info block and wound photo */}
                <div className="card3 patient-details-card3" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="patient-info-column"> {/* This is the main column for all patient info */}
                    <h3 className="patientinfo3">Patient Information</h3>
                    <div className="patient-info-two-column-layout"> {/* NEW: Inner div for 2-column patient details */}
                      <div className="patient-details-col-1"> {/* First sub-column for patient details */}
                        <p><strong>Name:</strong> {selectedPatient.first_name} {selectedPatient.last_name}</p>
                        <p><strong>Date of Birth:</strong> {selectedPatient.date_of_birth}</p>
                        <p><strong>Contact Info:</strong> {selectedPatient.contact_info}</p>
                        <p><strong>Gender:</strong> {selectedPatient.gender}</p>
                      </div>
                      <div className="patient-details-col-2"> {/* Second sub-column for patient details */}
                        <p><strong>Diabetes Type:</strong> {selectedPatient.diabetes_type}</p>
                        <p><strong>Smoking Status:</strong> {selectedPatient.smoking_status}</p>
                        <p><strong>Last Doctor Visit:</strong> {selectedPatient.last_doctor_visit}</p>
                        <p><strong>Risk Classification:</strong> 
                          <span className={`risk-classification3 ${(latestMetric?.risk_classification || selectedPatient.risk_classification || 'n-a').toLowerCase()}`}>
                            {latestMetric?.risk_classification || selectedPatient.risk_classification || 'N/A'}
                          </span>
                        </p>
                        <p><strong>Phase:</strong> <span className={`phase3 ${selectedPatient.phase}`}>{selectedPatient.phase}</span></p>
                      </div>
                    </div>
                  </div>

                  {latestWoundPhoto ? (
                      <div className="wound-photo-column" style={{ maxWidth: '300px', marginLeft: '20px', flexShrink: 0, textAlign: 'center' }}> {/* Wound photo column */}
                          <h3 className="latestwound3">Latest Wound Photo</h3>
                          <img src={latestWoundPhoto.url} alt="Latest Wound" className="latest-wound-image3" />
                          <p><strong>Date:</strong> {new Date(latestWoundPhoto.date).toLocaleDateString()}</p>
                          <p><strong>Notes:</strong> {latestWoundPhoto.notes || 'N/A'}</p>
                      </div>
                  ) : (
                      <div className="wound-photo-column" style={{ maxWidth: '300px', marginLeft: '20px', flexShrink: 0 }}>
                          <p>No wound photos available for this patient.</p>
                      </div>
                  )}
                </div>

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

                <div className="three-column-forms3"> {/* Changed from forms-container3 to three-column-forms3 */}
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

        const handleSend = async () => {
            try {
                // Get the metric_id from the wound photo being used for the treatment plan
                const treatmentMetricId = latestWoundPhoto?.metric_id;
                
                if (!treatmentMetricId) {
                    alert("No wound photo record found to attach treatment plan.");
                    return;
                }

                // Diagnosis and Important Notes should be text, others are arrays
                const diagnosisText = diagnosisDetails.map(entry => entry.text).filter(Boolean).join('\n');
                const woundCareArray = woundCareDetails.map(entry => entry.text).filter(Boolean);
                const dressingArray = dressingDetails.map(entry => entry.text).filter(Boolean);
                const importantNotesText = importantNotes.map(entry => entry.text).filter(Boolean).join('\n');
                const followUpArray = followUpDetails.map(entry => entry.text).filter(Boolean);
                const medicationArray = medicationTreatmentPlan.map(entry => entry.text).filter(Boolean);

                console.log('Diagnosis text:', diagnosisText);
                console.log('Wound care array:', woundCareArray);
                console.log('Dressing array:', dressingArray);
                console.log('Medication array:', medicationArray);
                console.log('Important notes text:', importantNotesText);
                console.log('Follow-up array:', followUpArray);
                console.log('Updating metric_id:', treatmentMetricId);

                // Get current timestamp
                const now = new Date().toISOString();

                // Prepare the data object - Update existing row where wound photo exists
                const treatmentPlanData = {
                    wound_diagnosis: diagnosisText || null,
                    wound_care: woundCareArray.length > 0 ? woundCareArray : [],
                    wound_dressing: dressingArray.length > 0 ? dressingArray : [],
                    wound_medication: medicationArray.length > 0 ? medicationArray : [],
                    'wound_important-notes': importantNotesText || null,
                    'wound_follow-up': followUpArray.length > 0 ? followUpArray : [],
                    updated_at: now
                };

                console.log('Sending treatment plan data:', treatmentPlanData);

                // Update the existing row in health_metrics table
                const { data, error } = await supabase
                    .from('health_metrics')
                    .update(treatmentPlanData)
                    .eq('metric_id', treatmentMetricId);

                if (error) {
                    console.error('Error saving treatment plan:', error);
                    console.error('Error details:', JSON.stringify(error, null, 2));
                    alert(`Failed to save treatment plan: ${error.message || JSON.stringify(error)}`);
                    return;
                }

                alert("Treatment Plan saved successfully!");
                
                // Reset all form fields
                setDiagnosisDetails([{ id: Date.now(), text: '' }]);
                setWoundCareDetails([{ id: Date.now(), text: '' }]);
                setDressingDetails([{ id: Date.now(), text: '' }]);
                setMedicationTreatmentPlan([{ id: Date.now(), text: '' }]);
                setImportantNotes([{ id: Date.now(), text: '' }]);
                setFollowUpDetails([{ id: Date.now(), text: '' }]);
                setSelectedWoundPhoto(null);
                
                // Navigate back to patient list
                setActivePage("patient-list");
                
            } catch (err) {
                console.error('Unexpected error:', err);
                alert(`An unexpected error occurred: ${err.message}`);
            }
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
    console.log("Rendering patient profile - loading:", loading, "error:", error, "selectedPatient:", selectedPatient?.patient_id);
    
    if (loading) return <div className="loading-message3">Loading patient details...</div>;
    if (error) return <div className="error-message3">{error}</div>;
    if (!selectedPatient?.patient_id) return <div className="error-message3">No patient selected</div>;

    const latestMetric = patientMetrics.length > 0 ? patientMetrics[0] : null;
    const latestLab = patientLabs.length > 0 ? patientLabs[0] : null; // Get the latest lab result

    return (
      <div key={selectedPatient.patient_id} className="patient-detail-view-section">
        <div className="detail-view-header">
          <button className="back-to-list-button" onClick={() => setActivePage("dashboard")}>
            <i className="fas fa-arrow-left"></i> Back to Dashboard
          </button>
          <div className="patient-details-header-row">
            <h2>Patient Details</h2>
          </div>
        </div>
        <div className="patient-details-content-container">
          <div className="patient-details-left-column">
            {/* Basic Patient Information Section */}
            <div className="patient-basic-info-section">
              <div className="patient-info-container">
                <div className="patient-avatar-container">
                  <img 
                    src={selectedPatient?.patient_picture || "../picture/secretary.png"} 
                    alt="Patient Avatar" 
                    className="patient-avatar-large"
                    onError={(e) => e.target.src = "../picture/secretary.png"}
                  />
                  <div className={`patient-phase-badge ${
                    selectedPatient.phase === 'Post-Op' || selectedPatient.phase === 'Post-Operative' ? 'post-operative' :
                    selectedPatient.phase === 'Pre-Op' || selectedPatient.phase === 'Pre-Operative' ? 'pre-operative' :
                    'default'
                  }`}>
                    {selectedPatient.phase === 'Post-Op' || selectedPatient.phase === 'Post-Operative' ? 'Post-operative' : 
                     selectedPatient.phase === 'Pre-Op' || selectedPatient.phase === 'Pre-Operative' ? 'Pre-operative' : 
                     selectedPatient.phase || 'N/A'}
                  </div>
                </div>
                <div className="patient-info-details">
                  <div className="patient-name-section">
                    <h2 className="patient-name-display">
                      {selectedPatient.first_name} {selectedPatient.middle_name ? selectedPatient.middle_name + ' ' : ''}{selectedPatient.last_name}
                    </h2>
                  </div>
                  <div className="patient-details-grid">
                    <div className="patient-detail-item">
                      <span className="detail-label">Diabetes Type:</span>
                      <span className="detail-value">{selectedPatient.diabetes_type || 'N/A'}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Phone:</span>
                      <span className="detail-value">{selectedPatient.contact_info || 'N/A'}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Gender:</span>
                      <span className="detail-value">{selectedPatient.gender || 'N/A'}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Age:</span>
                      <span className="detail-value">
                        {selectedPatient.date_of_birth 
                          ? new Date().getFullYear() - new Date(selectedPatient.date_of_birth).getFullYear() 
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Height:</span>
                      <span className="detail-value">{selectedPatient.patient_height ? `${selectedPatient.patient_height} cm` : 'N/A'}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Weight:</span>
                      <span className="detail-value">{selectedPatient.patient_weight ? `${selectedPatient.patient_weight} kg` : 'N/A'}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">BMI:</span>
                      <span className="detail-value">{selectedPatient.BMI || 'N/A'}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Hypertensive:</span>
                      <span className="detail-value">{selectedPatient.complication_history?.includes("Hypertensive") ? "Yes" : "No"}</span>
                    </div>
                    <div className="patient-detail-item">
                      <span className="detail-label">Heart Disease:</span>
                      <span className="detail-value">{selectedPatient.complication_history?.includes("Heart Attack") ? "Yes" : "None"}</span>
                    </div>
                  </div>
                  <div className="patient-detail-item">
                    <span className="detail-label">Smoking History:</span>
                    <span className="detail-value">{selectedPatient.smoking_status || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Laboratory Result Section */}
            <div className="laboratory-results-section">
              <h3>Laboratory Results (Latest)</h3>
              {latestLab ? (
                <>
                  <p><strong>Date Submitted:</strong> {new Date(latestLab.date_submitted).toLocaleDateString()}</p>
                  <p><strong>HbA1c:</strong> {latestLab.Hba1c || 'N/A'}</p>
                  <p><strong>Creatinine:</strong> {latestLab.creatinine || 'N/A'}</p>
                  <p><strong>GOT (AST):</strong> {latestLab.got_ast || 'N/A'}</p>
                  <p><strong>GPT (ALT):</strong> {latestLab.gpt_alt || 'N/A'}</p>
                  <p><strong>Cholesterol:</strong> {latestLab.cholesterol || 'N/A'}</p>
                  <p><strong>Triglycerides:</strong> {latestLab.triglycerides || 'N/A'}</p>
                  <p><strong>HDL Cholesterol:</strong> {latestLab.hdl_cholesterol || 'N/A'}</p>
                  <p><strong>LDL Cholesterol:</strong> {latestLab.ldl_cholesterol || 'N/A'}</p>
                </>
              ) : (
                <p>No lab results available for this patient.</p>
              )}
            </div>
            
            {/* Latest Health Metrics Section */}
            <div className="latest-health-metrics-section">
              <h3>Latest Health Metrics</h3>
              {latestMetric ? (
                <>
                  <p><strong>Blood Glucose Level:</strong> {latestMetric.blood_glucose || 'N/A'} {latestMetric.blood_glucose ? 'mg/dL' : ''}</p>
                  <p><strong>Blood Pressure:</strong> {
                    (latestMetric.bp_systolic && latestMetric.bp_diastolic) 
                      ? `${latestMetric.bp_systolic}/${latestMetric.bp_diastolic} mmHg` 
                      : 'N/A'
                  }</p>
                  <p><strong>Risk Classification:</strong> 
                    <span className={`risk-classification-${(latestMetric.risk_classification || 'n-a').toLowerCase()}`}>
                      {latestMetric.risk_classification || 'N/A'}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p><strong>Blood Glucose Level:</strong> N/A</p>
                  <p><strong>Blood Pressure:</strong> N/A</p>
                  <p><strong>Risk Classification:</strong> 
                    <span className={`risk-classification-${(selectedPatient.risk_classification || 'n-a').toLowerCase()}`}>
                      {selectedPatient.risk_classification || 'N/A'}
                    </span>
                  </p>
                </>
              )}
            </div>

            {/* History Charts Section */}
            <div className="history-charts-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>History Charts</h3>
              </div>
              
              {/* Blood Glucose Chart */}
              <div className="blood-glucose-chart-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Blood Glucose Level History</h4>
                  <div className="time-filter-buttons">
                    <button 
                      className={`time-filter-btn ${glucoseTimeFilter === 'day' ? 'active' : ''}`}
                      onClick={() => setGlucoseTimeFilter('day')}
                    >
                      Day
                    </button>
                    <button 
                      className={`time-filter-btn ${glucoseTimeFilter === 'week' ? 'active' : ''}`}
                      onClick={() => setGlucoseTimeFilter('week')}
                    >
                      Week
                    </button>
                    <button 
                      className={`time-filter-btn ${glucoseTimeFilter === 'month' ? 'active' : ''}`}
                      onClick={() => setGlucoseTimeFilter('month')}
                    >
                      Month
                    </button>
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
                          if (!chartArea) {
                            return null;
                          }
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
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `Glucose: ${context.raw} mg/dL`;
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Blood Glucose (mg/dL)',
                            font: {
                              size: 12,
                              weight: 'bold'
                            }
                          },
                          min: 0,
                          max: 300,
                          ticks: {
                            display: true,
                          },
                          grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)',
                          }
                        },
                        x: {
                          grid: {
                            display: false
                          },
                          title: {
                            display: true,
                            text: 'Date',
                            font: {
                              size: 12,
                              weight: 'bold'
                            }
                          },
                          ticks: {
                            display: true,
                            maxRotation: 45,
                            minRotation: 45
                          }
                        }
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

              {/* Blood Pressure Chart */}
              <div className="blood-pressure-chart-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Blood Pressure History</h4>
                  <div className="time-filter-buttons">
                    <button 
                      className={`time-filter-btn ${bpTimeFilter === 'day' ? 'active' : ''}`}
                      onClick={() => setBpTimeFilter('day')}
                    >
                      Day
                    </button>
                    <button 
                      className={`time-filter-btn ${bpTimeFilter === 'week' ? 'active' : ''}`}
                      onClick={() => setBpTimeFilter('week')}
                    >
                      Week
                    </button>
                    <button 
                      className={`time-filter-btn ${bpTimeFilter === 'month' ? 'active' : ''}`}
                      onClick={() => setBpTimeFilter('month')}
                    >
                      Month
                    </button>
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
                          borderRadius: {
                            topLeft: 0,
                            topRight: 0,
                            bottomLeft: 15,
                            bottomRight: 15
                          },
                          borderSkipped: false,
                        },
                        {
                          label: 'Systolic',
                          data: bpFilteredMetrics.map(entry => parseFloat(entry.bp_systolic) || 0),
                          backgroundColor: 'rgba(34, 197, 94, 0.8)',
                          borderColor: 'rgba(34, 197, 94, 1)',
                          borderWidth: 1,
                          barThickness: 15,
                          borderRadius: {
                            topLeft: 15,
                            topRight: 15,
                            bottomLeft: 0,
                            bottomRight: 0
                          },
                          borderSkipped: false,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: {
                        intersect: false,
                        mode: 'index',
                      },
                      plugins: {
                        legend: {
                          display: true,
                          position: 'top',
                          labels: {
                            usePointStyle: true,
                            padding: 20,
                          }
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `${context.dataset.label}: ${context.raw} mmHg`;
                            }
                          }
                        }
                      },
                      scales: {
                        x: {
                          stacked: true,
                          grid: {
                            display: false
                          },
                          title: {
                            display: true,
                            text: 'Date',
                            font: {
                              size: 12,
                              weight: 'bold'
                            }
                          },
                          ticks: {
                            display: true,
                            maxRotation: 45,
                            minRotation: 45
                          },
                          categoryPercentage: 0.95,
                          barPercentage: 0.95,
                        },
                        y: {
                          stacked: true,
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Blood Pressure (mmHg)',
                            font: {
                              size: 12,
                              weight: 'bold'
                            }
                          },
                          min: 0,
                          max: 350,
                          ticks: {
                            display: true,
                          },
                          grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)',
                          }
                        }
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

              {/* Risk Classification History Chart */}
              <div className="risk-classification-chart-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Risk Classification History</h4>
                  <div className="time-filter-buttons">
                    <button 
                      className={`time-filter-btn ${riskTimeFilter === 'day' ? 'active' : ''}`}
                      onClick={() => setRiskTimeFilter('day')}
                    >
                      Day
                    </button>
                    <button 
                      className={`time-filter-btn ${riskTimeFilter === 'week' ? 'active' : ''}`}
                      onClick={() => setRiskTimeFilter('week')}
                    >
                      Week
                    </button>
                    <button 
                      className={`time-filter-btn ${riskTimeFilter === 'month' ? 'active' : ''}`}
                      onClick={() => setRiskTimeFilter('month')}
                    >
                      Month
                    </button>
                  </div>
                </div>
                
                <div className="risk-legend-container">
                  <div className="risk-legend-item">
                    <div className="risk-legend-color low-risk"></div>
                    <span>Low Risk</span>
                  </div>
                  <div className="risk-legend-item">
                    <div className="risk-legend-color moderate-risk"></div>
                    <span>Moderate Risk</span>
                  </div>
                  <div className="risk-legend-item">
                    <div className="risk-legend-color high-risk"></div>
                    <span>High Risk</span>
                  </div>
                  <div className="risk-legend-item">
                    <div className="risk-legend-color ppd-risk"></div>
                    <span>PPD</span>
                  </div>
                </div>

                <div className="chart-wrapper">
                  {riskFilteredMetrics.length > 0 ? (
                  <Bar
                    data={{
                      labels: riskFilteredMetrics.map(entry => formatDateForChart(entry.submission_date)),
                      datasets: [
                        {
                          label: 'Risk Classification',
                          data: riskFilteredMetrics.map(entry => {
                            const risk = entry.risk_classification?.toLowerCase();
                            if (risk === 'low') return 2;
                            if (risk === 'moderate') return 3;
                            if (risk === 'high') return 4;
                            if (risk === 'ppd') return 1;
                            return 0;
                          }),
                          backgroundColor: riskFilteredMetrics.map(entry => {
                            const risk = entry.risk_classification?.toLowerCase();
                            if (risk === 'low') return 'rgba(34, 197, 94, 0.8)';
                            if (risk === 'moderate') return 'rgba(255, 193, 7, 0.8)';
                            if (risk === 'high') return 'rgba(244, 67, 54, 0.8)';
                            if (risk === 'ppd') return 'rgba(103, 101, 105, 0.8)';
                            return 'rgba(156, 163, 175, 0.8)';
                          }),
                          borderColor: riskFilteredMetrics.map(entry => {
                            const risk = entry.risk_classification?.toLowerCase();
                            if (risk === 'low') return 'rgba(34, 197, 94, 1)';
                            if (risk === 'moderate') return 'rgba(255, 193, 7, 1)';
                            if (risk === 'high') return 'rgba(244, 67, 54, 1)';
                            if (risk === 'ppd') return 'rgba(103, 101, 105, 1)';
                            return 'rgba(156, 163, 175, 1)';
                          }),
                          borderWidth: 1,
                          barThickness: 15,
                          borderRadius: {
                            topLeft: 8,
                            topRight: 8,
                            bottomLeft: 8,
                            bottomRight: 8
                          },
                          borderSkipped: false,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: {
                        intersect: false,
                        mode: 'index',
                      },
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              const entry = riskFilteredMetrics[context.dataIndex];
                              return `Risk: ${entry.risk_classification || 'Unknown'}`;
                            }
                          }
                        }
                      },
                      scales: {
                        x: {
                          grid: {
                            display: false
                          },
                          title: {
                            display: true,
                            text: 'Date',
                            font: {
                              size: 12,
                              weight: 'bold'
                            }
                          },
                          ticks: {
                            display: true,
                            maxRotation: 45,
                            minRotation: 45
                          },
                          categoryPercentage: 0.95,
                          barPercentage: 0.95,
                        },
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Risk Level',
                            font: {
                              size: 12,
                              weight: 'bold'
                            }
                          },
                          min: 0,
                          max: 4,
                          ticks: {
                            display: true,
                            stepSize: 1,
                            callback: function(value) {
                              const labels = ['', 'PPD', 'Low', 'Moderate', 'High'];
                              return labels[value] || '';
                            }
                          },
                          grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)',
                          }
                        }
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
            </div>
          </div>

          <div className="patient-details-right-column">
            {/* Doctor Assigned Section */}
            <div className="doctor-assigned-section">
              <div className="doctors-grid">
                {/* Assigned Doctor Card */}
                <div className="doctor-card">
                  <div className="doctor-avatar">
                    <img 
                      src="../picture/secretary.png" 
                      alt="Doctor Avatar"
                    />
                  </div>
                  <div className="doctor-info">
                    <span className="doctor-label">Assigned Doctor:</span>
                    <h4 className="doctor-name">
                      {loading ? 'Loading...' : 
                        selectedPatient?.doctors 
                          ? `${selectedPatient.doctors.first_name} ${selectedPatient.doctors.last_name}` 
                          : user ? `${user.first_name} ${user.last_name}` : 'Dr. Name'}
                    </h4>
                    <p className="doctor-specialty">
                      {loading ? 'Loading...' : 
                        selectedPatient?.doctors?.specialization || user?.specialization || 'General Surgeon'}
                    </p>
                  </div>
                </div>

                {/* Assigned Specialists Cards */}
                {loading ? (
                  <div className="doctor-card specialist-card">
                    <div className="doctor-info">
                      <span className="doctor-label">Loading Specialists...</span>
                    </div>
                  </div>
                ) : currentPatientSpecialists.length > 0 ? (
                  currentPatientSpecialists.map((specialist, index) => (
                    <div key={specialist.id || index} className="doctor-card specialist-card">
                      <div className="doctor-avatar">
                        <img 
                          src="../picture/secretary.png" 
                          alt="Specialist Avatar"
                        />
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
                      <img 
                        src="../picture/secretary.png" 
                        alt="No Specialist"
                      />
                    </div>
                    <div className="doctor-info">
                      <span className="doctor-label">Specialist Doctor</span>
                      <h4 className="doctor-name">No Specialist Assigned</h4>
                      <p className="doctor-specialty">-</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Current Medications Section - Doctor-specific functionality preserved */}
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
                          {editingMedicationId === med.id ? (
                            <>
                              <td>
                                <input
                                  type="text"
                                  name="name"
                                  value={editMedicationData.name}
                                  onChange={handleEditMedicationInputChange}
                                  className="med-input"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  name="dosage"
                                  value={editMedicationData.dosage}
                                  onChange={handleEditMedicationInputChange}
                                  className="med-input"
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
                                  className="med-input"
                                />
                              </td>
                              <td className="med-actions">
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
                              <td><input type="text" className="med-input" value={med.name || ''} readOnly /></td>
                              <td><input type="text" className="med-input" value={med.dosage || ''} readOnly /></td>
                              <td><input type="text" className="med-input" value={
                                med.medication_frequencies && med.medication_frequencies.length > 0 ?
                                  med.medication_frequencies.map((freq) => freq.time_of_day.join(', ')).join('; ')
                                  : 'N/A'
                              } readOnly /></td>
                              <td><input type="text" className="med-input" value={
                                (med.doctors && med.doctors.first_name) ? 
                                  `${med.doctors.first_name} ${med.doctors.last_name}` : 
                                  'Doctor'
                              } readOnly /></td>
                              <td className="med-actions">
                                <button
                                  type="button"
                                  className="edit-medication-button3"
                                  onClick={() => handleEditClick(med)}
                                  title="Edit medication"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  type="button"
                                  className="remove-medication-button3"
                                  onClick={() => handleRemoveMedication(med.id)}
                                  title="Remove medication"
                                >
                                  <i className="fas fa-minus-circle"></i>
                                </button>
                              </td>
                            </>
                          )}
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
                            <i className="fas fa-plus-circle"></i>
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Add New Medication Form - Doctor-specific functionality */}
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
            </div>

            {/* Health Metrics History Section */}
            <div className="health-metrics-history-section">
              <h3>Health Metrics History</h3>
              <div className="health-metrics-table-container">
                {allPatientHealthMetrics.length > 0 ? (
                  <>
                    <table className="health-metrics-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Blood Glucose (mg/dL)</th>
                          <th>Blood Pressure (mmHg)</th>
                          <th>Risk Classification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getPaginatedHealthMetrics().map((metric, index) => (
                          <tr key={index}>
                            <td>{formatDateToReadable(metric.submission_date)}</td>
                            <td className="metric-value">
                              {metric.blood_glucose || 'N/A'}
                            </td>
                            <td className="metric-value">
                              {(metric.bp_systolic && metric.bp_diastolic) 
                                ? `${metric.bp_systolic}/${metric.bp_diastolic}` 
                                : metric.blood_pressure || 'N/A'}
                            </td>
                            <td className={`risk-classification-${(metric.risk_classification || 'N/A').toLowerCase()}`}>
                              {metric.risk_classification || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Health Metrics Pagination */}
                    {getTotalHealthMetricsPages() > 1 && (
                      <Pagination
                        currentPage={currentPageHealthMetrics}
                        totalPages={getTotalHealthMetricsPages()}
                        onPageChange={setCurrentPageHealthMetrics}
                        itemsPerPage={HEALTH_METRICS_PER_PAGE}
                        totalItems={allPatientHealthMetrics.length}
                        showPageInfo={true}
                      />
                    )}
                  </>
                ) : (
                  <div className="no-metrics-message">
                    <p>No health metrics available for this patient.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Appointment Schedule Section */}
            <div className="appointment-schedule-section">
              <h3>Appointment Schedule</h3>
              <div className="dashboard-appointment-schedule-container">
                <div className="dashboard-appointment-calendar-container">
                  <Calendar
                    value={calendarDate}
                    onChange={setCalendarDate}
                    tileClassName={({ date, view }) => {
                      if (view === 'month') {
                        // Check if this date has an appointment
                        const hasAppointment = patientAppointments.some(appointment => {
                          const appointmentDate = new Date(appointment.appointment_datetime);
                          return (
                            appointmentDate.getDate() === date.getDate() &&
                            appointmentDate.getMonth() === date.getMonth() &&
                            appointmentDate.getFullYear() === date.getFullYear()
                          );
                        });
                        return hasAppointment ? 'dashboard-appointment-date' : null;
                      }
                    }}
                    tileContent={({ date, view }) => {
                      if (view === 'month') {
                        const dayAppointments = patientAppointments.filter(appointment => {
                          const appointmentDate = new Date(appointment.appointment_datetime);
                          return (
                            appointmentDate.getDate() === date.getDate() &&
                            appointmentDate.getMonth() === date.getMonth() &&
                            appointmentDate.getFullYear() === date.getFullYear()
                          );
                        });
                      }
                    }}
                  />
                </div>
                
                {/* Appointment Details List */}
                <div className="dashboard-appointment-details-list">
                  <h4>
                    {(() => {
                      const now = new Date();
                      const futureAppointments = patientAppointments.filter(appointment => 
                        new Date(appointment.appointment_datetime) > now
                      );
                      return futureAppointments.length > 0 ? 'Upcoming Appointments' : 'Recent Appointments';
                    })()}
                  </h4>
                  {(() => {
                    const now = new Date();
                    const futureAppointments = patientAppointments.filter(appointment => 
                      new Date(appointment.appointment_datetime) > now
                    );
                    
                    let appointmentsToShow = [];
                    if (futureAppointments.length > 0) {
                      appointmentsToShow = futureAppointments.slice(0, 3);
                    } else {
                      // Show 3 most recent appointments
                      appointmentsToShow = patientAppointments
                        .sort((a, b) => new Date(b.appointment_datetime) - new Date(a.appointment_datetime))
                        .slice(0, 3);
                    }
                    
                    if (appointmentsToShow.length > 0) {
                      return (
                        <ul className="dashboard-appointment-list">
                          {appointmentsToShow.map((appointment, idx) => (
                            <li key={idx} className="dashboard-appointment-item">
                              <div className="dashboard-appointment-date-time">
                                <strong>{formatDateToReadable(appointment.appointment_datetime.split('T')[0])}</strong>
                                <span className="dashboard-appointment-time">{formatTimeTo12Hour(appointment.appointment_datetime.substring(11, 16))}</span>
                              </div>
                              <div className="dashboard-appointment-notes">
                                {appointment.notes || 'No notes'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      );
                    } else {
                      return <p className="no-appointments">No appointments scheduled for this patient.</p>;
                    }
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enhanced Wound Gallery Section */}
        <div className="wound-gallery-section">
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
                      onLoad={() => console.log(`Wound photo ${index} loaded successfully`)}
                      onError={(e) => {
                        console.error(`Failed to load wound photo ${index}:`, photo.url);
                        e.target.style.display = 'none';
                      }}
                    />
                    <button 
                      className="photo-expand-btn"
                      onClick={() => handleExpandPhoto(photo)}
                    >
                      <i className="fas fa-expand"></i>
                    </button>
                  </div>
                  
                  <div className="photo-info">
                    <div className="photo-timestamp">
                      <span className="photo-date">{formatDateToReadable(photo.date)}</span>
                      <span className="photo-time">| {new Date(photo.date).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit', 
                        hour12: true 
                      })}</span>
                    </div>
                    
                    <div className="photo-submitter">
                      <img 
                        src="../picture/secretary.png" 
                        alt="Submitter Avatar" 
                        className="submitter-avatar"
                      />
                      <span className="submitter-info">
                        <span className="submitter-text">by</span> {selectedPatient.first_name} {selectedPatient.last_name}
                      </span>
                    </div>
                    
                    <div className="photo-actions">
                      <button className="entry-btn">Entry ID: 00{allWoundPhotos.length - index}</button>
                      <button 
                        className="treatment-plan-btn"
                        onClick={() => handleCreateTreatmentPlanForPhoto(photo)}
                      >
                        Treatment Plan
                      </button>
                    </div>
                    
                    {photo.notes && (
                      <div className="photo-notes">
                        <strong>Notes:</strong> {photo.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-photos-message">
                <p>No wound photos available for this patient.</p>
              </div>
            )}
          </div>
          
          {/* Treatment Plan Button */}
        </div>

        {/* Photo Expansion Modal */}
        {expandedPhoto && (
          <div className="photo-modal-overlay" onClick={handleCloseExpandedPhoto}>
            <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="photo-modal-close" onClick={handleCloseExpandedPhoto}>
                <i className="fas fa-times"></i>
              </button>
              <img
                src={expandedPhoto.url}
                alt={`Expanded Wound Photo - ${expandedPhoto.date}`}
                className="expanded-photo-image"
              />
              <div className="expanded-photo-info">
                <h4>Wound Photo Details</h4>
                <p><strong>Date:</strong> {formatDateToReadable(expandedPhoto.date)}</p>
                <p><strong>Time:</strong> {new Date(expandedPhoto.date).toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit', 
                  hour12: true 
                })}</p>
                {expandedPhoto.notes && (
                  <p><strong>Notes:</strong> {expandedPhoto.notes}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard-container-header-only3">
      <Header 
        user={user}
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={onLogout}
        showUsersPopup={showUsersPopup}
        setShowUsersPopup={setShowUsersPopup}
        showMessagePopup={showMessagePopup}
        setShowMessagePopup={setShowMessagePopup}
        userRole="Doctor"
      />

      <main className="content-area-full-width3">
        {activePage === "dashboard" && (
          <h1>Welcome, Dr. {user.first_name} 👋</h1>
        )}
        {activePage === "dashboard" && renderDashboardContent()}
        {activePage === "patient-profile" && selectedPatient?.patient_id && renderPatientProfile()}
        {activePage === "patient-list" && renderPatientList()}
        {activePage === "appointments" && renderAppointmentsSection()}
        {activePage === "reports" && renderReportsSection()}
        {activePage === "treatment-plan" && selectedPatient && renderTreatmentPlan()} {/* Render the first step of treatment plan */}
        {activePage === "treatment-plan-next-step" && selectedPatient && renderNextStepForms()} {/* Render the next step of treatment plan */}
        {activePage === "treatment-plan-summary" && selectedPatient && renderTreatmentPlanSummary()} {/* NEW: Render the summary page */}
      </main>

      
        {showModal && (
  <div className="modal-overlay3">
    <div className="modal-content3">
      <div className="modal-header3">
        <h3>Confirm Action</h3>
        <button className="close-button3" onClick={handleCancelModal}>
          &times;
        </button>
      </div>
      <div className="modal-body3">
        <p>
          Are you sure you want to{" "}
          <strong>{actionType === "cancel" ? "cancel" : "mark as done"}</strong>{" "}
          this appointment?
        </p>
        <div className="modal-button-group3">
          <button className="modal-confirm-button3" onClick={handleConfirmAction}>
            Confirm
          </button>
          <button className="modal-cancel-button3" onClick={handleCancelModal}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default Dashboard;