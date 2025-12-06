import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import { logAppointmentEvent, logPatientDataChange, logSystemAction } from "./auditLogger";
import Pagination from "./components/Pagination";
import RiskFilter from "./components/RiskFilter";
import Header from "./components/Header";
import "./SecretaryDashboard.css";
import logo from "../picture/logo.png"; // Import the logo image
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

// Import Chart.js components - These will no longer be directly used for the bars but might be used elsewhere
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler } from'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2'; // Doughnut will be removed for the bars

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler);

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24h) => {
  if (!time24h) return 'N/A';
  const [hours, minutes] = time24h.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12; // Converts 0 (midnight) to 12 AM, 13 to 1 PM etc.
  const displayMinutes = String(minutes).padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`; // Corrected typo here (ampm instead of amppm)
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

// Helper function to determine lab status
const getLabStatus = (latestLabResult) => {
  if (!latestLabResult) {
    console.log("getLabStatus: No lab result provided, returning ❌Awaiting");
    return '❌Awaiting';
  }

  const requiredLabFields = [
    'Hba1c', 'ucr', 'got_ast', 'gpt_alt',
    'cholesterol', 'triglycerides', 'hdl_cholesterol', 'ldl_cholesterol',
    'urea', 'bun', 'uric', 'egfr'
  ];

  let missingFields = false;
  let hasAnyField = false;

  for (const field of requiredLabFields) {
    if (latestLabResult[field] === null || latestLabResult[field] === undefined || latestLabResult[field] === '') {
      missingFields = true;
    } else {
      hasAnyField = true;
    }
  }

  let status;
  if (!hasAnyField || missingFields) {
      status = '❌Awaiting'; // Missing any field or no data = Awaiting
  } else {
      status = '✅Submitted'; // All fields complete = Submitted
  }

  console.log("getLabStatus: Result for lab data", latestLabResult, "is:", status);
  return status;
};

// Helper function to determine profile status
const getProfileStatus = (patient) => {
  if (
    patient &&
    patient.first_name && patient.first_name.trim() !== '' &&
    patient.last_name && patient.last_name.trim() !== '' &&
    patient.email && patient.email.trim() !== '' &&
    patient.date_of_birth && patient.date_of_birth.trim() !== '' &&
    patient.contact_info && patient.contact_info.trim() !== '' && // Using contact_number based on previous context
    patient.gender && patient.gender.trim() !== '' &&
    patient.address && patient.address.trim() !== '' &&
    patient.allergies && patient.allergies.trim() !== '' &&
    patient.diabetes_type && patient.diabetes_type.trim() !== '' &&
    patient.smoking_status && patient.smoking_status.trim() !== ''
  ) {
    return '🟢Finalized';
  } else {
    return '🟡Pending';
  }
};

// Helper function to get classification display with colored circle and phase
const getClassificationDisplay = (patient) => {
  const phase = patient.phase || 'Pre-Operative';
  const labStatus = patient.lab_status || '❌Awaiting';
  const riskClassification = (patient.risk_classification || '').toLowerCase();
  
  // Shorten phase names
  const phaseDisplay = phase === 'Pre-Operative' ? 'Pre-Op' : phase === 'Post-Operative' ? 'Post-Op' : phase;
  
  // If lab status is Awaiting, show ⛔ with phase
  if (labStatus === '❌Awaiting') {
    return `⛔${phaseDisplay}`;
  }
  
  // Otherwise, show color based on risk classification (for Submitted or any other status)
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
    labels: pendingLabHistory?.labels || [],
    datasets: [
      {
        label: 'Submitted Lab Results',
        data: pendingLabHistory?.data || [],
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
            <img src="../picture/patients.svg" alt="Patient Categories" className="widget-icon" /> Patient Categories
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
            <img src="../picture/preop.svg" alt="Pre-Op Risk Classes" className="widget-icon" /> Pre-Op Risk Classes
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

// Helper function to send notifications
const sendNotification = async (userId, userRole, title, message, type = 'general') => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert([
        {
          user_id: userId,
          user_role: userRole,
          title: title,
          message: message,
          type: type,
          is_read: false,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error sending notification:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in sendNotification function:', error);
    return false;
  }
};

// ... (rest of the SecretaryDashboard component remains unchanged) ...
const SecretaryDashboard = ({ user, onLogout }) => {
  const [activePage, setActivePage] = useState("dashboard");
  const [linkedDoctors, setLinkedDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [profilePicture, setProfilePicture] = useState(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [patientForm, setPatientForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    dateOfBirth: "",
    contactInfo: "",
    middleName: "",
    gender: "",
    address: "",
    emergencyContactNumber: "",
    diabetesType: "",
    allergies: "",
    diabetes_duration: "",
    footUlcersAmputation: "",
    eyeIssues: "",
    kidneyIssues: "",
    stroke: "",
    heartAttack: "",
    hypertensive: "",
    family_diabetes: "",
    family_hypertension: "",
    cardiovascular: "",
    smokingStatus: "",
    monitoringFrequencyGlucose: "",
    lastDoctorVisit: "",
    lastEyeExam: "",
    preparedBy: "", // This will be set by the secretary's ID
    patientHeight: "",
    patientWeight: "",
    bmi: "",
  });
  const [medications, setMedications] = useState([{ drugName: "", dosage: "", frequency: "", prescribedBy: "" }]);
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [labEntryStep, setLabEntryStep] = useState(1); // Corrected to use useState
  const [selectedPatientDetail, setSelectedPatientDetail] = useState(null); // Corrected syntax here
  const [message, setMessage] = useState("");
  const [currentPatientStep, setCurrentPatientStep] = useState(0); // Initialize with 0

  // const [showPatientDetailModal, setShowPatientDetailModal] = useState(false); // REMOVED: No longer a modal
  const [selectedPatientForDetail, setSelectedPatientForDetail] = useState(null); // This is good, renamed for clarity
  const [selectedPatientForLabView, setSelectedPatientForLabView] = useState(null); // New state for lab view
  
  // State for report widget detail view
  const [reportDetailView, setReportDetailView] = useState(null); // 'total-patients', 'full-compliance', 'missing-logs', 'non-compliant'
  
  // Pagination for report detail views
  const [currentPageReportDetail, setCurrentPageReportDetail] = useState(1);
  const REPORT_DETAIL_PER_PAGE = 10;

  // State for filtered patients in report detail view
  const [reportDetailPatients, setReportDetailPatients] = useState([]);

  // State for chart data (dynamically fetched)
  const [totalPatientsCount, setTotalPatientsCount] = useState(0);
  const [pendingLabResultsCount, setPendingLabResultsCount] = useState(0);
  const [preOpCount, setPreOpCount] = useState(0);
  const [postOpCount, setPostOpCount] = useState(0);
  const [lowRiskCount, setLowRiskCount] = useState(0);
  const [moderateRiskCount, setModerateRiskCount] = useState(0);
  const [highRiskCount, setHighRiskCount] = useState(0);

  // State for report widgets (real data)
  const [fullComplianceCount, setFullComplianceCount] = useState(0);
  const [missingLogsCount, setMissingLogsCount] = useState(0);
  const [nonCompliantCount, setNonCompliantCount] = useState(0);

  // State for compliance history charts
  const [fullComplianceHistory, setFullComplianceHistory] = useState({ labels: [], data: [] });
  const [missingLogsHistory, setMissingLogsHistory] = useState({ labels: [], data: [] });
  const [nonCompliantHistory, setNonCompliantHistory] = useState({ labels: [], data: [] });

  const [appointmentsToday, setAppointmentsToday] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]); // For calendar display

  const [appointmentForm, setAppointmentForm] = useState({
    doctorId: "",
    patientId: "",
    date: "",
    time: "",
    notes: ""
  });
  // NEW state to track if an appointment is being edited
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPatientConfirmationModal, setShowPatientConfirmationModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const [currentPageAppointments, setCurrentPageAppointments] = useState(1);
  const APPOINTMENTS_PER_PAGE = 6; // Define how many appointments per page

  const [upcomingAppointmentsCount, setUpcomingAppointmentsCount] = useState(0);
  
  // Filter state for appointments table (today vs upcoming)
  const [appointmentFilter, setAppointmentFilter] = useState('today'); // 'today' or 'upcoming'

  const [currentPagePatients, setCurrentPagePatients] = useState(1);
  const PATIENTS_PER_PAGE = 10;

  const [currentPageLabSearchPatients, setCurrentPageLabSearchPatients] = useState(1); // New state for this specific patient list
  const LAB_SEARCH_PATIENTS_PER_PAGE = 10; // New: Define how many patients per page (you can adjust this number)

  const [currentPageHealthMetrics, setCurrentPageHealthMetrics] = useState(1); // New state for health metrics pagination
  const HEALTH_METRICS_PER_PAGE = 7; // Define how many health metrics per page
  
  // Risk filter states
  const [selectedRiskFilter, setSelectedRiskFilter] = useState('all'); // For patient list
  const [selectedLabRiskFilter, setSelectedLabRiskFilter] = useState('all'); // For lab entry search
  
  // Lab Status filter states
  const [selectedLabStatusFilter, setSelectedLabStatusFilter] = useState('all'); // For patient list
  const [selectedLabEntryLabStatusFilter, setSelectedLabEntryLabStatusFilter] = useState('all'); // For lab entry search
  
  // Profile Status filter states
  const [selectedProfileStatusFilter, setSelectedProfileStatusFilter] = useState('all'); // For patient list
  const [selectedLabEntryProfileStatusFilter, setSelectedLabEntryProfileStatusFilter] = useState('all'); // For lab entry search
  
  // Sort order filter states
  const [sortOrder, setSortOrder] = useState('desc'); // For patient list (newest first by default)
  const [labEntrySortOrder, setLabEntrySortOrder] = useState('desc'); // For lab entry search (newest first by default)
  
  // State for patient count over the past 6 months
  const [patientCountHistory, setPatientCountHistory] = useState([]);
  
  // State for pending lab results count over the past 6 months
  const [pendingLabHistory, setPendingLabHistory] = useState([]);
  
  // Analysis states for wound photo analysis
  const [analysisResults, setAnalysisResults] = useState(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [selectedWoundPhotoForAnalysis, setSelectedWoundPhotoForAnalysis] = useState(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  
  // State for demographics edit modal
  const [showDemographicsEditModal, setShowDemographicsEditModal] = useState(false);
  const [demographicsForm, setDemographicsForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    contactInfo: "",
    address: "",
    emergencyContactNumber: "",
    password: "",
    patientHeight: "",
    patientWeight: "",
    bmi: ""
  });
  
  useEffect(() => {
    const fetchUpcomingAppointments = async () => {
      const doctorIds = linkedDoctors.map(d => d.doctor_id);
      if (doctorIds.length === 0) {
        setUpcomingAppointmentsCount(0);
        return;
      }
  
      const today = new Date();
      const nowISO = today.toISOString(); // Get current datetime in ISO format
  
      try {
        const { data: upcomingAppointmentsData, error } = await supabase
          .from('appointments')
          .select('appointment_id')
          .in('doctor_id', doctorIds)
          .gte('appointment_datetime', nowISO); // Filter for appointments in the future or today (from current time)
  
        if (error) {
          console.error("Error fetching upcoming appointments:", error.message);
          setUpcomingAppointmentsCount(0);
          return;
        }
  
        setUpcomingAppointmentsCount(upcomingAppointmentsData.length);
  
      } catch (error) {
        console.error("Error fetching upcoming appointments:", error.message);
        setUpcomingAppointmentsCount(0);
      }
    };
  
    if (supabase && linkedDoctors.length > 0) {
      fetchUpcomingAppointments();
    }
  }, [supabase, linkedDoctors]); // Re-run when supabase or linkedDoctors change

  // Function to fetch patient count history for the past 6 months
  const fetchPatientCountHistory = async () => {
    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) {
      setPatientCountHistory([]);
      return;
    }

    try {
      // Get current date and calculate 6 months ago
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);

      // Create array of the past 6 months
      const months = [];
      const monthCounts = [];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(now.getMonth() - i);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        months.push(monthYear);
        
        // Calculate start and end of the month
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        // Fetch patient count for this month (patients registered during this specific month)
        const { data: monthData, error } = await supabase
          .from('patients')
          .select('patient_id, created_at')
          .in('preferred_doctor_id', doctorIds)
          .gte('created_at', startOfMonth.toISOString())
          .lte('created_at', endOfMonth.toISOString());

        if (error) {
          console.error("Error fetching patient count for month:", monthYear, error);
          monthCounts.push(0);
        } else {
          monthCounts.push(monthData ? monthData.length : 0);
        }
      }

      setPatientCountHistory({
        labels: months,
        data: monthCounts
      });

    } catch (error) {
      console.error("Error fetching patient count history:", error);
      setPatientCountHistory([]);
    }
  };

  // Function to fetch lab results submission history for the past 6 months
  // This chart shows how many patients submitted their lab results each month
  const fetchPendingLabHistory = async () => {
    const startTime = performance.now();
    console.log("🔄 Starting optimized lab submission history fetch...");
    
    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) {
      console.log("❌ No linked doctors found for lab submission history");
      setPendingLabHistory({ labels: [], data: [] });
      return;
    }

    console.log("✅ Fetching lab submission history for doctors:", doctorIds);

    try {
      // Get current date
      const now = new Date();
      
      // Calculate date range for the past 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      
      // First, get all patients for linked doctors once
      const { data: allPatientsData, error: patientsError } = await supabase
        .from('patients')
        .select('patient_id, created_at')
        .in('preferred_doctor_id', doctorIds);

      if (patientsError) {
        console.error("Error fetching patients for lab submission history:", patientsError);
        setPendingLabHistory({ labels: [], data: [] });
        return;
      }

      if (!allPatientsData || allPatientsData.length === 0) {
        console.log("❌ No patients found for lab submission history");
        setPendingLabHistory({ labels: [], data: [] });
        return;
      }

      const patientIds = allPatientsData.map(p => p.patient_id);
      console.log(`✅ Found ${patientIds.length} patients total`);

      // Fetch ALL lab submissions for the past 6 months in one query
      const { data: allLabsData, error: labsError } = await supabase
        .from('patient_labs')
        .select('patient_id, date_submitted')
        .in('patient_id', patientIds)
        .gte('date_submitted', sixMonthsAgo.toISOString())
        .lte('date_submitted', now.toISOString());

      if (labsError) {
        console.error("Error fetching lab submissions:", labsError);
        setPendingLabHistory({ labels: [], data: [] });
        return;
      }

      console.log(`✅ Found ${allLabsData?.length || 0} total lab submissions in the past 6 months`);

      // Create array of the past 6 months
      const months = [];
      const submittedCounts = [];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(now.getMonth() - i);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        months.push(monthYear);
        
        // Calculate start and end of the month for comparison
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        // Count unique patients who submitted labs during this specific month
        const patientsWithSubmissionsThisMonth = new Set();
        
        if (allLabsData) {
          allLabsData.forEach(lab => {
            const submissionDate = new Date(lab.date_submitted);
            if (submissionDate >= startOfMonth && submissionDate <= endOfMonth) {
              patientsWithSubmissionsThisMonth.add(lab.patient_id);
            }
          });
        }

        const submittedCount = patientsWithSubmissionsThisMonth.size;
        console.log(`Month ${monthYear}: ${submittedCount} unique patients with submitted labs`);
        submittedCounts.push(submittedCount);
      }

      const endTime = performance.now();
      console.log(`⚡ Lab submission history fetch completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log("📊 Final lab submission history:", { labels: months, data: submittedCounts });

      setPendingLabHistory({
        labels: months,
        data: submittedCounts
      });

    } catch (error) {
      console.error("❌ Error fetching lab submission history:", error);
      setPendingLabHistory({ labels: [], data: [] });
    }
  };

  // useEffect to fetch patient count history and pending lab history
  useEffect(() => {
    if (supabase && linkedDoctors.length > 0) {
      fetchPatientCountHistory();
      fetchPendingLabHistory();
    }
  }, [supabase, linkedDoctors]); // Re-run when supabase or linkedDoctors change

  // New state for lab result inputs
  const [labResults, setLabResults] = useState({
    selectedPatientForLab: null, // To store the patient object selected for lab entry
    dateSubmitted: "",
    Hba1c: "", // Keep this lowercase for the state variable
    UCR: "",
    gotAst: "",
    gptAlt: "",
    cholesterol: "",
    triglycerides: "",
    hdlCholesterol: "",
    ldlCholesterol: "",
    UREA: "",
    BUN: "",
    URIC: "",
    EGFR: "",
  });

  // NEW STATE FOR LAST LAB DATE AND HEALTH METRICS
  const [lastLabDate, setLastLabDate] = useState('N/A');
  const [patientHealthMetrics, setPatientHealthMetrics] = useState({
    bloodGlucoseLevel: 'N/A',
    bloodPressure: 'N/A'
  });
  // NEW STATE FOR WOUND PHOTO URL and its date
  const [allWoundPhotos, setAllWoundPhotos] = useState([]);
  const [woundPhotosLoading, setWoundPhotosLoading] = useState(false);

  // NEW STATE FOR ALL PATIENT HEALTH METRICS HISTORY (FOR CHARTS)
  const [allPatientHealthMetrics, setAllPatientHealthMetrics] = useState([]);

  // NEW STATE FOR HEALTH METRICS LAST SUBMISSIONS (FOR DAYS SINCE SUBMISSION COLUMN)
  const [healthMetricsSubmissions, setHealthMetricsSubmissions] = useState({});

  // Calendar state for appointment scheduling
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Individual time period filters for each chart
  const [glucoseTimeFilter, setGlucoseTimeFilter] = useState('week'); // 'day', 'week', 'month'
  const [bpTimeFilter, setBpTimeFilter] = useState('week');
  const [riskTimeFilter, setRiskTimeFilter] = useState('week');
  const [riskScoreTimeFilter, setRiskScoreTimeFilter] = useState('week');

  // Helper function to filter metrics by time period
  const filterMetricsByTimePeriod = React.useCallback((metrics, timePeriod) => {
    console.log(`[Filter] Filtering ${metrics.length} metrics for period: ${timePeriod}`);
    
    // Sort all metrics by date descending (newest first) for processing
    const sortedMetrics = [...metrics].sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date));
    
    let filtered = [];
    
    switch(timePeriod) {
      case 'day':
        // Show only the 5 most recent submissions
        filtered = sortedMetrics.slice(0, 5);
        console.log(`[Filter Day] Taking 5 most recent submissions from ${metrics.length} total`);
        break;
      case 'week':
        // Show entries from the last 7 days
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = sortedMetrics.filter(metric => {
          const metricDate = new Date(metric.submission_date);
          return metricDate >= oneWeekAgo && metricDate <= now;
        });
        console.log(`[Filter Week] ${filtered.length} metrics in last 7 days`);
        break;
      case 'month':
        // Show entries from the last 30 days
        const nowMonth = new Date();
        const oneMonthAgo = new Date(nowMonth.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = sortedMetrics.filter(metric => {
          const metricDate = new Date(metric.submission_date);
          return metricDate >= oneMonthAgo && metricDate <= nowMonth;
        });
        console.log(`[Filter Month] ${filtered.length} metrics in last 30 days`);
        break;
      default:
        filtered = sortedMetrics;
    }
    
    console.log(`[Filter] ${filtered.length} metrics after ${timePeriod} filter`);
    if (filtered.length > 0) {
      console.log(`[Filter] Most recent:`, filtered[0]);
      console.log(`[Filter] Oldest in range:`, filtered[filtered.length - 1]);
    }
    
    // Sort by date ascending (oldest first) for chart display
    return filtered.sort((a, b) => new Date(a.submission_date) - new Date(b.submission_date));
  }, []);

  // Filtered metrics for each chart based on their individual time filters
  const glucoseFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(allPatientHealthMetrics, glucoseTimeFilter),
    [allPatientHealthMetrics, glucoseTimeFilter, filterMetricsByTimePeriod]
  );

  const bpFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(allPatientHealthMetrics, bpTimeFilter),
    [allPatientHealthMetrics, bpTimeFilter, filterMetricsByTimePeriod]
  );

  const riskFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(allPatientHealthMetrics, riskTimeFilter),
    [allPatientHealthMetrics, riskTimeFilter, filterMetricsByTimePeriod]
  );

  const riskScoreFilteredMetrics = React.useMemo(() => 
    filterMetricsByTimePeriod(allPatientHealthMetrics, riskScoreTimeFilter),
    [allPatientHealthMetrics, riskScoreTimeFilter, filterMetricsByTimePeriod]
  );

  // NEW STATE FOR PATIENT-SPECIFIC LAB RESULTS (ALL HISTORY)
  const [allPatientLabResultsHistory, setAllPatientLabResultsHistory] = useState([]);


  // NEW STATE FOR PATIENT-SPECIFIC LAB RESULTS AND APPOINTMENTS
  const [patientLabResults, setPatientLabResults] = useState({
    Hba1c: 'N/A', UCR: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
    cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
    UREA: 'N/A', BUN: 'N/A', URIC: 'N/A', EGFR: 'N/A',
  });
  const [patientAppointments, setPatientAppointments] = useState([]);

  // NEW STATE FOR SPECIALIST ASSIGNMENT
  const [availableSpecialists, setAvailableSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("");
  const [patientForSpecialistAssignment, setPatientForSpecialistAssignment] = useState(null);
  const [currentPatientSpecialists, setCurrentPatientSpecialists] = useState([]);
  
  // Handle appointment cancellation with improved logging
  const handleCancelAppointment = async (appointmentId) => {
  const isConfirmed = window.confirm("Are you sure you want to cancel this appointment?");
  if (!isConfirmed) {
    return;
  }
  
  console.log("Attempting to cancel appointment with ID:", appointmentId);
  try {
    const { error } = await supabase
      .from('appointments')
      .update({ 
        appointment_state: 'cancelled'
      })
      .eq('appointment_id', appointmentId);

    if (error) {
      console.error("Supabase error cancelling appointment:", error);
      throw error;
    }
    
    console.log("Appointment cancelled successfully:", appointmentId);
    setMessage("Appointment cancelled successfully.");
    fetchAllAppointments(); // Refresh the list
  } catch (error) {
    console.error("Error cancelling appointment:", error.message);
    setMessage(`Error: ${error.message}`);
  }
  };

// Handle appointment 'in queue' status with improved logging
  const handleInQueueAppointment = async (appointmentId) => {
  const isConfirmed = window.confirm("Are you sure you want to set this appointment to 'In Queue'?");
  if (!isConfirmed) {
    return;
  }
  
  console.log("Attempting to set appointment to 'in queue' with ID:", appointmentId);
  try {
    const { error } = await supabase
      .from('appointments')
      .update({ 
        appointment_state: 'in queue'
      })
      .eq('appointment_id', appointmentId);

    if (error) {
      console.error("Supabase error setting appointment to 'in queue':", error);
      throw error;
    }
    
    console.log("Appointment status updated to 'In Queue':", appointmentId);
    setMessage("Appointment status updated to 'In Queue'.");
    fetchAllAppointments(); // Refresh the list
  } catch (error) {
    console.error("Error setting appointment to 'in queue':", error.message);
    setMessage(`Error: ${error.message}`);
  }
  };

  const steps = [
    "Demographics",
    "Diabetes History",
    "Complication History",
    "Lifestyle",
    "Assignment",
  ];

  const [appointmentChartData, setAppointmentChartData] = useState({
    labels: [],
    datasets: [],
  });
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointmentError, setAppointmentError] = useState(null);
  
  // Lab Submission Chart State
  const [labSubmissionChartData, setLabSubmissionChartData] = useState({
    labels: [],
    datasets: [],
  });
  const [loadingLabSubmissionData, setLoadingLabSubmissionData] = useState(false);
  const [labSubmissionError, setLabSubmissionError] = useState(null);
  
  // States for popup messages (NEW)
  const [showUsersPopup, setShowUsersPopup] = useState(false);
  const [showMessagePopup, setShowMessagePopup] = useState(false);

  // Helper function to get the start of the week (Monday)
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay(); // Sunday - Saturday : 0 - 6
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday (0) to be last day of prev week or first day of current
    return new Date(d.setDate(diff));
  };
  
  // Helper function to format date to YYYY-MM-DD for Supabase query
  const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // NEW STATE: Medications for selected patient
  const [patientMedications, setPatientMedications] = useState([]);

  useEffect(() => {
    if (user && user.secretary_id) {
      const initializeDashboard = async () => {
        await fetchLinkedDoctors();
        await fetchAllAppointments(); // Changed to fetchAllAppointments
        // fetchPatients will be called by the linkedDoctors useEffect
      };
      initializeDashboard();
    } else {
      console.error("User or secretary_id is undefined");
      setMessage("Error: Secretary account not loaded properly.");
    }
  }, [user]);

  // Re-fetch appointments when the filter changes
  useEffect(() => {
    if (user && user.secretary_id) {
      fetchAllAppointments();
    }
  }, [appointmentFilter]);

  // This useEffect will run when linkedDoctors changes, and then fetch patients and update counts
  useEffect(() => {
    if (linkedDoctors.length > 0 && user && user.secretary_id) {
      fetchPatients();
    } else if (linkedDoctors.length === 0 && user && user.secretary_id) {
      // Reset all patient-related states if no doctors are linked
      setPatients([]);
      setTotalPatientsCount(0);
      setPreOpCount(0);
      setPostOpCount(0);
      setLowRiskCount(0);
      setModerateRiskCount(0);
      setHighRiskCount(0);
      setPendingLabResultsCount(0);
      // Reset compliance metrics
      setFullComplianceCount(0);
      setMissingLogsCount(0);
      setNonCompliantCount(0);
      // Reset compliance history
      setFullComplianceHistory({ labels: [], data: [] });
      setMissingLogsHistory({ labels: [], data: [] });
      setNonCompliantHistory({ labels: [], data: [] });
    }
  }, [linkedDoctors, user]); // Dependencies ensure it runs when doctors are fetched


  // New useEffect to fetch appointment data for the chart
// New useEffect to fetch appointment data for the chart
// New useEffect to fetch appointment data for the chart (updated for daily view)
useEffect(() => {
  const fetchAppointmentsForChart = async () => {
    setLoadingAppointments(true);
    setAppointmentError(null);

    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) {
      setAppointmentChartData({ labels: [], datasets: [] });
      setLoadingAppointments(false);
      return;
    }

    // Calculate dates for the last two weeks (14 days total)
    const today = new Date();
    // Get start of this week (Monday)
    const thisWeekStart = new Date(today);
    const dayOfWeek = thisWeekStart.getDay(); // 0 for Sunday, 1 for Monday
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust if today is Sunday or other day
    thisWeekStart.setDate(thisWeekStart.getDate() + diffToMonday);
    thisWeekStart.setHours(0, 0, 0, 0); // Set to beginning of the day

    // Get the start of the period (Monday of last week)
    const twoWeeksAgoStart = new Date(thisWeekStart);
    twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);

    // Get the end of the period (Sunday of this week)
    const endOfThisWeek = new Date(thisWeekStart);
    endOfThisWeek.setDate(endOfThisWeek.getDate() + 6);
    endOfThisWeek.setHours(23, 59, 59, 999); // Set to end of the day

    const startDateFormatted = formatDateToYYYYMMDD(twoWeeksAgoStart);
    const endDateFormatted = formatDateToYYYYMMDD(endOfThisWeek);

    console.log("Fetching appointments from:", startDateFormatted, "to", endDateFormatted);

    try {
      // Fetch all appointments within the 2-week period
      const { data: appointmentsData, error } = await supabase
        .from('appointments')
        .select('appointment_id, appointment_datetime, doctor_id') // Select necessary columns
        .in('doctor_id', doctorIds)
        .gte('appointment_datetime', startDateFormatted)
        .lte('appointment_datetime', endDateFormatted);

      if (error) throw error;

      // Initialize daily counts and labels
      const dailyCounts = {};
      const chartLabels = [];
      const chartData = [];

      // Populate dailyCounts map and chartLabels
      for (let d = new Date(twoWeeksAgoStart); d <= endOfThisWeek; d.setDate(d.getDate() + 1)) {
        const dateString = formatDateToYYYYMMDD(d);
        dailyCounts[dateString] = 0; // Initialize count for each day
        chartLabels.push(new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })); // e.g., "Jun 23"
      }

      // Aggregate counts from fetched data
      appointmentsData.forEach(appointment => {
        const appointmentDate = new Date(appointment.appointment_datetime).toISOString().split('T')[0]; // Get YYYY-MM-DD
        if (dailyCounts.hasOwnProperty(appointmentDate)) {
          dailyCounts[appointmentDate]++;
        }
      });

      // Populate chartData array in the correct order
      chartLabels.forEach(label => {
        // Find the full date string corresponding to the short label
        const fullDate = new Date(
          new Date().getFullYear(), // Use current year for accurate date construction
          new Date(label + ', 2000').getMonth(), // Dummy year for parsing month/day
          new Date(label + ', 2000').getDate()
        ).toISOString().split('T')[0];

        // Search for the corresponding day in the original date range from twoWeeksAgoStart
        let foundCount = 0;
        for (let d = new Date(twoWeeksAgoStart); d <= endOfThisWeek; d.setDate(d.getDate() + 1)) {
            const tempDateString = formatDateToYYYYMMDD(d);
            if (tempDateString === fullDate) {
                foundCount = dailyCounts[tempDateString];
                break;
            }
        }
        chartData.push(foundCount);
      });

      setAppointmentChartData({
        labels: chartLabels,
        datasets: [
          {
            label: 'Number of Appointments',
            data: chartData,
            backgroundColor: 'rgba(144, 238, 144, 0.8)', // Light green color
            borderColor: 'rgba(144, 238, 144, 1)',
            borderWidth: 1,
            borderRadius: {
              topLeft: 8,
              topRight: 8,
              bottomLeft: 8,
              bottomRight: 8
            },
            borderSkipped: false,
          },
        ],
      });

    } catch (error) {
      console.error("Error fetching daily appointment data:", error.message);
      setAppointmentError("Failed to load daily appointment history.");
    } finally {
      setLoadingAppointments(false);
    }
  };

  if (supabase && linkedDoctors.length > 0) {
    fetchAppointmentsForChart();
  }
}, [supabase, linkedDoctors]); // Re-run when supabase or linkedDoctors change

// New useEffect to fetch lab submission data for the chart
useEffect(() => {
  const fetchLabSubmissionData = async () => {
    setLoadingLabSubmissionData(true);
    setLabSubmissionError(null);

    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) {
      setLabSubmissionChartData({ labels: [], datasets: [] });
      setLoadingLabSubmissionData(false);
      return;
    }

    try {
      // Get all patients for linked doctors
      const { data: allPatientsData, error: patientsError } = await supabase
        .from('patients')
        .select('patient_id, created_at')
        .in('preferred_doctor_id', doctorIds);

      if (patientsError) throw patientsError;

      if (!allPatientsData || allPatientsData.length === 0) {
        setLabSubmissionChartData({ labels: [], datasets: [] });
        setLoadingLabSubmissionData(false);
        return;
      }

      const patientIds = allPatientsData.map(p => p.patient_id);
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Get all lab submissions for these patients
      const { data: allLabsData, error: labsError } = await supabase
        .from('patient_labs')
        .select('patient_id, date_submitted')
        .in('patient_id', patientIds);

      if (labsError) throw labsError;

      // Calculate the three metrics
      const patientsWithLabs = new Set(allLabsData?.map(lab => lab.patient_id) || []);
      
      // 1. Pending lab entries (patients with no lab submissions)
      const pendingLabEntries = patientIds.length - patientsWithLabs.size;

      // 2. Labs submitted this week
      const labsThisWeek = allLabsData?.filter(lab => {
        const submissionDate = new Date(lab.date_submitted);
        return submissionDate >= oneWeekAgo && submissionDate <= now;
      }).length || 0;

      // 3. Patients with outdated labs (last submission > 3 months ago)
      const patientsWithOutdatedLabs = new Set();
      if (allLabsData) {
        // Group labs by patient and find their latest submission
        const patientLatestLabs = {};
        allLabsData.forEach(lab => {
          const submissionDate = new Date(lab.date_submitted);
          if (!patientLatestLabs[lab.patient_id] || submissionDate > patientLatestLabs[lab.patient_id]) {
            patientLatestLabs[lab.patient_id] = submissionDate;
          }
        });

        // Check which patients have their latest submission > 3 months ago
        Object.entries(patientLatestLabs).forEach(([patientId, latestDate]) => {
          if (latestDate < threeMonthsAgo) {
            patientsWithOutdatedLabs.add(patientId);
          }
        });
      }

      setLabSubmissionChartData({
        labels: ['Pending Lab Entries', 'Labs Submitted This Week', 'Outdated Labs (>3 Months)'],
        datasets: [
          {
            label: 'Lab Submission Status',
            data: [pendingLabEntries, labsThisWeek, patientsWithOutdatedLabs.size],
            backgroundColor: [
              'rgba(255, 193, 7, 0.8)',  // Warning yellow for pending
              'rgba(40, 167, 69, 0.8)',  // Success green for submitted this week
              'rgba(220, 53, 69, 0.8)',  // Danger red for outdated
            ],
            borderColor: [
              'rgba(255, 193, 7, 1)',
              'rgba(40, 167, 69, 1)',
              'rgba(220, 53, 69, 1)',
            ],
            borderWidth: 1,
            borderRadius: {
              topLeft: 8,
              topRight: 8,
              bottomLeft: 8,
              bottomRight: 8
            },
            borderSkipped: false,
          },
        ],
      });

    } catch (error) {
      console.error("Error fetching lab submission data:", error.message);
      setLabSubmissionError("Failed to load lab submission data.");
    } finally {
      setLoadingLabSubmissionData(false);
    }
  };

  if (supabase && linkedDoctors.length > 0) {
    fetchLabSubmissionData();
  }
}, [supabase, linkedDoctors]); // Re-run when supabase or linkedDoctors change


const [woundPhotoData, setWoundPhotoData] = useState([]);

  // NEW function to fetch wound photos separately
  const fetchAllWoundPhotos = async (patientId) => {
    if (!patientId) {
      console.log("WOUND PHOTOS FETCH: No patient ID provided.");
      setAllWoundPhotos([]); // Only clear if no patient ID
      setWoundPhotosLoading(false);
      return;
    }
    
    setWoundPhotosLoading(true);
    console.log(`WOUND PHOTOS FETCH: Attempting to fetch for patient ID: ${patientId}`);
  
    try {
      const { data: healthData, error: healthError } = await supabase
        .from('health_metrics')
        .select('wound_photo_url, updated_at') // Select updated_at for the date
        .eq('patient_id', patientId)
        .not('wound_photo_url', 'is', null) // Only get entries that actually have a URL
        .order('updated_at', { ascending: false }); // Order by date, latest first
  
      console.log("WOUND PHOTOS FETCH: Raw health data from 'health_metrics':", healthData);
      console.log("WOUND PHOTOS FETCH: Health data error:", healthError);
  
      if (healthError) {
        console.error("WOUND PHOTOS FETCH: Error fetching wound photo URLs from DB:", healthError.message);
        setAllWoundPhotos([]);
        setWoundPhotosLoading(false);
        return;
      }
  
      if (healthData && healthData.length > 0) {
        const photosArray = [];
        for (const entry of healthData) {
          const woundPhotoPathOrUrl = entry?.wound_photo_url;
          const updatedDate = entry?.updated_at;
  
          let photoUrl = '';
          if (typeof woundPhotoPathOrUrl === 'string' && (woundPhotoPathOrUrl.startsWith('http://') || woundPhotoPathOrUrl.startsWith('https://'))) {
            photoUrl = woundPhotoPathOrUrl.trim();
          } else if (typeof woundPhotoPathOrUrl === 'string' && woundPhotoPathOrUrl.trim().length > 0) {
            const trimmedPath = woundPhotoPathOrUrl.trim();
            const { data: publicUrlData, error: publicUrlError } = supabase
              .storage
              .from('wound-photos')
              .getPublicUrl(trimmedPath);
  
            if (publicUrlError) {
              console.error("WOUND PHOTOS FETCH: Error getting public URL for wound photo:", publicUrlError.message);
            } else if (publicUrlData && publicUrlData.publicUrl) {
              photoUrl = publicUrlData.publicUrl;
            }
          }
  
          if (photoUrl) {
            photosArray.push({
              url: photoUrl,
              date: updatedDate ? new Date(updatedDate).toLocaleDateString() : 'N/A'
            });
          }
        }
        
        // Only update state if we have actual photos or if it's different from current state
        setAllWoundPhotos(photosArray);
        if (photosArray.length > 0) {
          console.log("WOUND PHOTOS FETCH: Successfully set all wound photos:", photosArray);
        } else {
          console.log("WOUND PHOTOS FETCH: No wound photos found for this patient.");
        }
      } else {
        setAllWoundPhotos([]);
        console.log("WOUND PHOTOS FETCH: No healthData found for this patient or healthData is empty.");
      }
    } catch (error) {
      console.error("WOUND PHOTOS FETCH: Unexpected error during wound photo fetch:", error);
      setAllWoundPhotos([]);
    } finally {
      setWoundPhotosLoading(false);
    }
  };

  // NEW useEffect for fetching wound photos (with debouncing to prevent flickering)
  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates if component unmounts
    
    const fetchWoundPhotosDebounced = async () => {
      if (selectedPatientForDetail && selectedPatientForDetail.patient_id && isMounted) {
        await fetchAllWoundPhotos(selectedPatientForDetail.patient_id);
      } else if (isMounted) {
        setAllWoundPhotos([]); // Reset wound photos when no patient is selected
      }
    };

    // Add a small delay to prevent rapid successive calls
    const timeoutId = setTimeout(fetchWoundPhotosDebounced, 100);

    // Cleanup function
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [selectedPatientForDetail?.patient_id]); // Only depend on patient_id, not the entire object


  // Updated useEffect to fetch other patient details and ALL health metrics
  useEffect(() => {
    const fetchPatientDetailsData = async () => {
      if (selectedPatientForDetail && selectedPatientForDetail.patient_id) {
        // --- Fetch Latest Lab Results for text display ---
        const { data: labData, error: labError } = await supabase
          .from('patient_labs')
          .select('date_submitted, Hba1c, ucr, got_ast, gpt_alt, cholesterol, triglycerides, hdl_cholesterol, ldl_cholesterol, urea, bun, uric, egfr')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('date_submitted', { ascending: false })
          .limit(1);

        if (labError) {
          console.error("Error fetching latest lab results:", labError);
          setLastLabDate('Error');
          setPatientLabResults({
            Hba1c: 'Error', UCR: 'Error', gotAst: 'Error', gptAlt: 'Error',
            cholesterol: 'Error', triglycerides: 'Error', hdlCholesterol: 'Error', ldlCholesterol: 'Error',
            UREA: 'Error', BUN: 'Error', URIC: 'Error', EGFR: 'Error',
          });
        } else if (labData && labData.length > 0) {
          const latestLab = labData[0];
          const dateObj = new Date(latestLab.date_submitted);
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getUTCDate()).padStart(2, '0');
          setLastLabDate(`${year}-${month}-${day}`);
          setPatientLabResults({
            Hba1c: latestLab.Hba1c || 'N/A',
            UCR: latestLab.ucr || 'N/A',
            gotAst: latestLab.got_ast || 'N/A',
            gptAlt: latestLab.gpt_alt || 'N/A',
            cholesterol: latestLab.cholesterol || 'N/A',
            triglycerides: latestLab.triglycerides || 'N/A',
            hdlCholesterol: latestLab.hdl_cholesterol || 'N/A',
            ldlCholesterol: latestLab.ldl_cholesterol || 'N/A',
            UREA: latestLab.urea || 'N/A',
            BUN: latestLab.bun || 'N/A',
            URIC: latestLab.uric || 'N/A',
            EGFR: latestLab.egfr || 'N/A',
          });
        } else {
          setLastLabDate('N/A');
          setPatientLabResults({
            Hba1c: 'N/A', UCR: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
            cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
            UREA: 'N/A', BUN: 'N/A', URIC: 'N/A', EGFR: 'N/A',
          });
        }

        // --- Fetch ALL Lab Results History ---
        const { data: allLabsData, error: allLabsError } = await supabase
          .from('patient_labs')
          .select('*')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('date_submitted', { ascending: true }); // Order by date for timeline

        if (allLabsError) {
          console.error("Error fetching all historical lab results:", allLabsError.message);
          setAllPatientLabResultsHistory([]);
        } else if (allLabsData) {
          setAllPatientLabResultsHistory(allLabsData);
        } else {
          setAllPatientLabResultsHistory([]);
        }


        // --- Fetch Latest Health Metrics (Blood Glucose, Blood Pressure) for text display ---
        const { data: currentHealthData, error: currentHealthError } = await supabase
          .from('health_metrics')
          .select('blood_glucose, bp_systolic, bp_diastolic, risk_classification')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('submission_date', { ascending: false })
          .limit(1);

        if (currentHealthError) {
          console.error("Error fetching latest health metrics for text display:", currentHealthError.message);
          setPatientHealthMetrics({ bloodGlucoseLevel: 'Error', bloodPressure: 'Error' });
        } else if (currentHealthData && currentHealthData.length > 0) {
          const latestHealth = currentHealthData[0];
          setPatientHealthMetrics({
            bloodGlucoseLevel: latestHealth.blood_glucose || 'N/A',
            bloodPressure: (latestHealth.bp_systolic !== null && latestHealth.bp_diastolic !== null) ? `${latestHealth.bp_systolic}/${latestHealth.bp_diastolic}` : 'N/A'
          });
          // Update the selected patient's risk classification with the latest from health_metrics
          setSelectedPatientForDetail(prev => ({
            ...prev,
            risk_classification: latestHealth.risk_classification
          }));
        } else {
          setPatientHealthMetrics({ bloodGlucoseLevel: 'N/A', bloodPressure: 'N/A' });
        }

        // --- Fetch ALL Health Metrics for Charts and Table ---
        const { data: historyHealthData, error: historyHealthError } = await supabase
          .from('health_metrics')
          .select('blood_glucose, bp_systolic, bp_diastolic, submission_date, risk_classification, risk_score')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('submission_date', { ascending: true });

        if (historyHealthError) {
            console.error("Error fetching historical health metrics for charts:", historyHealthError.message);
            setAllPatientHealthMetrics([]);
        } else if (historyHealthData) {
            // Use the actual risk classification from each health metric entry
            console.log(`[Health Metrics] Fetched ${historyHealthData.length} health metrics for patient ${selectedPatientForDetail.patient_id}`);
            if (historyHealthData.length > 0) {
              console.log('[Health Metrics] Sample data:', historyHealthData[0]);
              console.log('[Health Metrics] Date range:', 
                new Date(historyHealthData[0].submission_date).toISOString(), 
                'to', 
                new Date(historyHealthData[historyHealthData.length - 1].submission_date).toISOString()
              );
            }
            setAllPatientHealthMetrics(historyHealthData);
        } else {
            console.log('[Health Metrics] No health metrics data returned');
            setAllPatientHealthMetrics([]);
        }


        // --- Fetch Appointments for the Patient ---
        const { data: apptData, error: apptError } = await supabase
          .from('appointments')
          .select('*')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('appointment_datetime', { ascending: false });

        if (apptError) {
          console.error("Error fetching patient appointments:", apptError);
          setPatientAppointments([]); // Clear appointments on error
        } else if (apptData) {
          setPatientAppointments(apptData);
        } else {
          setPatientAppointments([]);
        }

        // --- Fetch Medications for the Patient, including doctor info ---
        const { data: medsData, error: medsError } = await supabase
          .from('medications')
          .select('id, name, dosage, user_id, created_at, prescribed_by, doctors:prescribed_by (first_name, last_name), medication_frequencies (frequency:time_of_day, start_date)')
          .eq('user_id', selectedPatientForDetail.patient_id)
          .order('created_at', { ascending: true });
        if (medsError) {
          console.error('Error fetching patient medications:', medsError);
          setPatientMedications([]);
        } else if (medsData) {
          setPatientMedications(medsData);
        } else {
          setPatientMedications([]);
        }

        // --- Fetch Patient Specialists ---
        fetchPatientSpecialists(selectedPatientForDetail.patient_id);
      } else {
        // Reset all states if no patient selected
        setLastLabDate('N/A');
        setPatientLabResults({
          Hba1c: 'N/A', UCR: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
          cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
          UREA: 'N/A', BUN: 'N/A', URIC: 'N/A', EGFR: 'N/A',
        });
        setAllPatientLabResultsHistory([]); // Reset all lab results history
        setPatientHealthMetrics({ bloodGlucoseLevel: 'N/A', bloodPressure: 'N/A' });
        setAllPatientHealthMetrics([]); // Reset historical data
        setWoundPhotoData({ url: '', date: '' }); // Reset wound photo URL
        setPatientAppointments([]);
        setPatientMedications([]); // Reset medications
        setCurrentPatientSpecialists([]); // Reset specialists
      }
    };

    fetchPatientDetailsData();
  }, [selectedPatientForDetail]); // Re-run when selectedPatientForDetail changes


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
      setPreOpCount(0);
      setPostOpCount(0);
      setLowRiskCount(0);
      setModerateRiskCount(0);
      setHighRiskCount(0);
      setPendingLabResultsCount(0);
      // Reset compliance metrics
      setFullComplianceCount(0);
      setMissingLogsCount(0);
      setNonCompliantCount(0);
      // Reset compliance history
      setFullComplianceHistory({ labels: [], data: [] });
      setMissingLogsHistory({ labels: [], data: [] });
      setNonCompliantHistory({ labels: [], data: [] });
      return;
    }
  
    const { data: patientsData, error: patientsError } = await supabase
      .from("patients")
      .select("*, doctors (doctor_id, first_name, last_name)");
  
    if (patientsError) {
      console.error("Error fetching patients:", patientsError);
      setMessage("Error fetching patients.");
      return;
    }
  
    const filteredAndProcessedPatients = await Promise.all(
      patientsData
        .filter(patient => doctorIds.includes(patient.preferred_doctor_id))
        .map(async (patient) => {
          // Fetch the latest lab results for each patient, including only date_submitted
          const { data: latestLabData, error: labError } = await supabase
            .from('patient_labs')
            .select('Hba1c, ucr, got_ast, gpt_alt, cholesterol, triglycerides, hdl_cholesterol, ldl_cholesterol, urea, bun, uric, egfr, date_submitted')
            .eq('patient_id', patient.patient_id)
            .order('date_submitted', { ascending: false })
            .limit(1);

          let labStatus = '❌Awaiting';
          let latestLabDate = null;

          if (labError) {
            console.error(`Error fetching lab results for patient ${patient.patient_id}:`, labError.message);
            labStatus = 'Error'; // Handle error case
          } else if (latestLabData && latestLabData.length > 0) {
            console.log(`Patient ${patient.patient_id} - Latest Lab Data fetched:`, latestLabData[0]); // Debug log
            labStatus = getLabStatus(latestLabData[0]);
            // Store date only if status is 'Submitted'
            if (labStatus === 'Submitted') {
              latestLabDate = latestLabData[0].date_submitted;
            }
          }

          // Fetch the latest risk classification from health_metrics table
          const { data: latestHealthData, error: healthError } = await supabase
            .from('health_metrics')
            .select('risk_classification')
            .eq('patient_id', patient.patient_id)
            .order('submission_date', { ascending: false })
            .limit(1);

          let riskClassification = null;
          if (healthError) {
            console.error(`Error fetching health metrics for patient ${patient.patient_id}:`, healthError.message);
          } else if (latestHealthData && latestHealthData.length > 0) {
            riskClassification = latestHealthData[0].risk_classification;
          }

          const processedPatient = {
            ...patient,
            lab_status: labStatus,
            latest_lab_date: latestLabDate,
            profile_status: getProfileStatus(patient),
            risk_classification: riskClassification, // Use the risk classification from health_metrics
          };
          console.log(`Patient ${patient.patient_id} - Processed Patient Object:`, processedPatient); // Debug log
          return processedPatient;
        })
    );    setPatients(filteredAndProcessedPatients);
    console.log("Final patients state after fetch:", filteredAndProcessedPatients); // Debug log
    setTotalPatientsCount(filteredAndProcessedPatients.length);
  
    // Recalculate counts for charts based on the new data
    let preOp = 0;
    let postOp = 0;
    let lowRisk = 0;
    let moderateRisk = 0;
    let highRisk = 0;
    let pendingLabs = 0;
  
    filteredAndProcessedPatients.forEach(patient => {
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
  
      // Pending Lab Results (including N/A)
      if (patient.lab_status === '❌Awaiting' || patient.lab_status === 'N/A') {
        pendingLabs++;
      }
    });
  
    setPreOpCount(preOp);
    setPostOpCount(postOp);
    setLowRiskCount(lowRisk);
    setModerateRiskCount(moderateRisk);
    setHighRiskCount(highRisk);
    setPendingLabResultsCount(pendingLabs);

    // Calculate compliance metrics with real data
    calculateComplianceMetrics(filteredAndProcessedPatients);

    // Calculate compliance history for charts
    calculateComplianceHistory();

    // Fetch health metrics last submissions for days since submission column
    fetchHealthMetricsSubmissions();
  };

  // Function to fetch last health metrics submissions for each patient
  const fetchHealthMetricsSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from("health_metrics")
        .select("patient_id, updated_at")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching health metrics submissions:", error);
        setMessage(`Error fetching health metrics: ${error.message}`);
        return;
      }

      // Create a map to store the most recent updated_at timestamp for each patient
      const lastSubmissions = new Map();
      data.forEach((metric) => {
        if (!lastSubmissions.has(metric.patient_id)) {
          lastSubmissions.set(metric.patient_id, metric.updated_at);
        }
      });

      // Convert the Map to an object for state
      setHealthMetricsSubmissions(Object.fromEntries(lastSubmissions));
    } catch (error) {
      console.error("Error fetching health metrics submissions:", error);
      setHealthMetricsSubmissions({});
    }
  };

  // Function to calculate real compliance metrics
  const calculateComplianceMetrics = async (patientsData) => {
    if (!patientsData || patientsData.length === 0) {
      setFullComplianceCount(0);
      setMissingLogsCount(0);
      setNonCompliantCount(0);
      return;
    }

    let fullCompliance = 0;
    let missingLogs = 0;
    let nonCompliant = 0;

    // For each patient, check ALL their metrics from all time
    for (const patient of patientsData) {
      try {
        // Get ALL health metrics from all time (not just latest)
        const { data: healthMetrics, error: healthError } = await supabase
          .from('health_metrics')
          .select('blood_glucose, bp_systolic, bp_diastolic, wound_photo_url, risk_classification')
          .eq('patient_id', patient.patient_id)
          .order('submission_date', { ascending: false });

        // Check if patient has EVER submitted each metric
        let hasBloodGlucose = false;
        let hasBloodPressure = false;
        let hasWoundPhoto = false;
        let riskClassification = '';

        if (!healthError && healthMetrics && healthMetrics.length > 0) {
          // Get latest risk classification
          const latestRisk = healthMetrics.find(m => m.risk_classification);
          riskClassification = latestRisk?.risk_classification || '';
          
          // Check across ALL metrics if any have the required data
          healthMetrics.forEach(metric => {
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

        // Count submitted metrics
        const submittedMetrics = [hasBloodGlucose, hasBloodPressure, hasWoundPhoto].filter(Boolean).length;
        const isHighRisk = riskClassification.toLowerCase() === 'high';
        
        // Categorize patient based on logic:
        if (submittedMetrics === 3) {
          // All 3 metrics submitted = Full Compliance
          fullCompliance++;
        } else if (submittedMetrics < 3) {
          // Less than 3 metrics submitted = at least 1 missing
          if (submittedMetrics > 0 || !isHighRisk) {
            // Has some metrics OR not high risk = Missing Logs
            missingLogs++;
          } else if (submittedMetrics === 0 && isHighRisk) {
            // High risk + all 3 missing = Non-Compliant
            nonCompliant++;
          }
        }

      } catch (error) {
        console.error(`Error checking metrics for patient ${patient.patient_id}:`, error);
        // On error, count as missing logs
        missingLogs++;
      }
    }

    console.log('Compliance Metrics Calculated:', {
      totalPatients: patientsData.length,
      fullCompliance,
      missingLogs,
      nonCompliant
    });

    setFullComplianceCount(fullCompliance);
    setMissingLogsCount(missingLogs);
    setNonCompliantCount(nonCompliant);
  };

  // Function to get filtered patients for each report widget category
  const getFilteredPatientsForWidget = async (widgetType) => {
    if (!patients || patients.length === 0) {
      return [];
    }

    let filteredPatients = [];

    for (const patient of patients) {
      try {
        // Get ALL health metrics from all time for compliance check
        const { data: healthMetrics, error: healthError } = await supabase
          .from('health_metrics')
          .select('blood_glucose, bp_systolic, bp_diastolic, wound_photo_url')
          .eq('patient_id', patient.patient_id)
          .order('submission_date', { ascending: false });

        // Check if patient has EVER submitted each metric
        let hasBloodGlucose = false;
        let hasBloodPressure = false;
        let hasWoundPhoto = false;

        if (!healthError && healthMetrics && healthMetrics.length > 0) {
          // Check across ALL metrics if any have the required data
          healthMetrics.forEach(metric => {
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

        // Count submitted metrics
        const submittedMetrics = [hasBloodGlucose, hasBloodPressure, hasWoundPhoto].filter(Boolean).length;
        const isHighRisk = (patient.risk_classification || '').toLowerCase() === 'high';

        // Filter based on widget type
        switch (widgetType) {
          case 'total-patients':
            // All patients
            filteredPatients.push(patient);
            break;
          case 'full-compliance':
            // Patients with all 3 metrics ever submitted
            if (submittedMetrics === 3) {
              filteredPatients.push(patient);
            }
            break;
          case 'missing-logs':
            // Patients with at least 1 missing metric (not full compliance)
            // This includes: patients with 1-2 metrics submitted, OR non-high-risk patients with 0 metrics
            if (submittedMetrics < 3) {
              if (submittedMetrics > 0 || !isHighRisk) {
                filteredPatients.push(patient);
              }
            }
            break;
          case 'non-compliant':
            // High risk patients with 0 metrics ever submitted
            if (submittedMetrics === 0 && isHighRisk) {
              filteredPatients.push(patient);
            }
            break;
        }

      } catch (error) {
        console.error(`Error filtering patient ${patient.patient_id}:`, error);
        // On error, include in missing logs for safety
        if (widgetType === 'missing-logs' || widgetType === 'total-patients') {
          filteredPatients.push(patient);
        }
      }
    }

    return filteredPatients;
  };

  // Function to calculate compliance history over the past 6 months
  const calculateComplianceHistory = async () => {
    const doctorIds = linkedDoctors.map(d => d.doctor_id);
    if (doctorIds.length === 0) {
      setFullComplianceHistory({ labels: [], data: [] });
      setMissingLogsHistory({ labels: [], data: [] });
      setNonCompliantHistory({ labels: [], data: [] });
      return;
    }

    try {
      const now = new Date();
      const months = [];
      const fullComplianceData = [];
      const missingLogsData = [];
      const nonCompliantData = [];
      
      console.log('Starting compliance history calculation...');

      // Calculate for the past 6 months
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(now.getMonth() - i);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        months.push(monthYear);
        
        // Calculate start and end of this specific month for filtering
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        console.log(`Processing month: ${monthYear} (${startOfMonth.toISOString()} to ${endOfMonth.toISOString()})`);

        // Get patients registered in this specific month only
        const { data: monthPatientsData, error: patientsError } = await supabase
          .from('patients')
          .select('patient_id')
          .in('preferred_doctor_id', doctorIds)
          .gte('created_at', startOfMonth.toISOString())
          .lte('created_at', endOfMonth.toISOString());

        if (patientsError) {
          console.error(`Error fetching patients for month ${monthYear}:`, patientsError);
          fullComplianceData.push(0);
          missingLogsData.push(0);
          nonCompliantData.push(0);
          continue;
        }

        if (!monthPatientsData || monthPatientsData.length === 0) {
          console.log(`No patients found for month ${monthYear}`);
          fullComplianceData.push(0);
          missingLogsData.push(0);
          nonCompliantData.push(0);
          continue;
        }

        console.log(`Found ${monthPatientsData.length} patients for month ${monthYear}`);

        // Get ALL health metrics for these patients from ALL TIME (not limited by month)
        const patientIds = monthPatientsData.map(p => p.patient_id);
        const { data: allHealthMetrics, error: healthError } = await supabase
          .from('health_metrics')
          .select('patient_id, blood_glucose, bp_systolic, bp_diastolic, wound_photo_url, risk_classification, submission_date')
          .in('patient_id', patientIds)
          .order('submission_date', { ascending: false });

        if (healthError) {
          console.error(`Error fetching health metrics for month ${monthYear}:`, healthError);
          fullComplianceData.push(0);
          missingLogsData.push(0);
          nonCompliantData.push(0);
          continue;
        }

        // Group ALL health metrics by patient (not just latest)
        const metricsByPatient = {};
        if (allHealthMetrics) {
          allHealthMetrics.forEach(metric => {
            if (!metricsByPatient[metric.patient_id]) {
              metricsByPatient[metric.patient_id] = [];
            }
            metricsByPatient[metric.patient_id].push(metric);
          });
        }

        let monthFullCompliance = 0;
        let monthMissingLogs = 0;
        let monthNonCompliant = 0;

        // Check compliance for each patient based on ALL TIME data
        for (const patient of monthPatientsData) {
          const patientMetrics = metricsByPatient[patient.patient_id] || [];
          
          // Check if patient has EVER submitted each metric
          let hasBloodGlucose = false;
          let hasBloodPressure = false;
          let hasWoundPhoto = false;
          let riskClassification = '';

          if (patientMetrics.length > 0) {
            // Get latest risk classification
            const latestRisk = patientMetrics.find(m => m.risk_classification);
            riskClassification = latestRisk?.risk_classification || '';
            
            // Check across ALL metrics if any have the required data
            patientMetrics.forEach(metric => {
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

          // Count submitted metrics
          const submittedMetrics = [hasBloodGlucose, hasBloodPressure, hasWoundPhoto].filter(Boolean).length;
          const isHighRisk = riskClassification.toLowerCase() === 'high';

          // Categorize patient for this month using the same logic
          if (submittedMetrics === 3) {
            // All 3 metrics submitted = Full Compliance
            monthFullCompliance++;
          } else if (submittedMetrics < 3) {
            // Less than 3 metrics submitted = at least 1 missing
            if (submittedMetrics > 0 || !isHighRisk) {
              // Has some metrics OR not high risk = Missing Logs
              monthMissingLogs++;
            } else if (submittedMetrics === 0 && isHighRisk) {
              // High risk + all 3 missing = Non-Compliant
              monthNonCompliant++;
            }
          }
        }

        console.log(`Month ${monthYear} results: Full Compliance: ${monthFullCompliance}, Missing Logs: ${monthMissingLogs}, Non-Compliant: ${monthNonCompliant}`);

        fullComplianceData.push(monthFullCompliance);
        missingLogsData.push(monthMissingLogs);
        nonCompliantData.push(monthNonCompliant);
      }

      setFullComplianceHistory({ labels: months, data: fullComplianceData });
      setMissingLogsHistory({ labels: months, data: missingLogsData });
      setNonCompliantHistory({ labels: months, data: nonCompliantData });

      console.log('Compliance History Calculated:', {
        months,
        fullCompliance: fullComplianceData,
        missingLogs: missingLogsData,
        nonCompliant: nonCompliantData
      });

    } catch (error) {
      console.error("Error calculating compliance history:", error);
      setFullComplianceHistory({ labels: [], data: [] });
      setMissingLogsHistory({ labels: [], data: [] });
      setNonCompliantHistory({ labels: [], data: [] });
    }
  };

 const fetchAllAppointments = async () => {
  // Since we're storing appointments as UTC, we need to adjust our date range
  // to account for the fact that a "today" appointment might be stored as tomorrow in UTC
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today in local time
  
  // Determine date range based on filter
  let startDate, endDate;
  
  if (appointmentFilter === 'today') {
    // For today: expand the search range to include appointments that might appear as different dates due to UTC storage
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 1); // Start from yesterday
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 2); // Go to day after tomorrow
  } else {
    // For upcoming: from today onwards
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 1); // Include today with buffer
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 90); // Next 90 days
  }

  console.log("Fetching appointments in range:", startDate.toISOString(), "to", endDate.toISOString());

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      appointment_id,
      appointment_datetime,
      appointment_state,
      notes,
      patient_id,
      doctor_id,
      patients (first_name, last_name),
      doctors (first_name, last_name)
    `)
    .eq("secretary_id", user.secretary_id)
    .gte("appointment_datetime", startDate.toISOString())
    .lt("appointment_datetime", endDate.toISOString())
    .order("appointment_datetime", { ascending: true });

  console.log("Raw appointment data fetched:", data);
  console.log("Appointment fetch error:", error);

  if (error) {
    console.error("Error fetching appointments:", error);
    setMessage(`Error fetching appointments: ${error.message}`);
  } else {
    const todayDateString = today.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    // Filter based on selected filter option
    const filteredAppointments = data.filter(app => {
      const state = (app.appointment_state || '').toLowerCase();
      const isActive = state !== 'finished' && state !== 'done' && state !== 'cancelled';
      
      // Extract the date part from the stored datetime
      const appointmentDateString = app.appointment_datetime.substring(0, 10); // Gets YYYY-MM-DD
      
      if (appointmentFilter === 'today') {
        const isToday = appointmentDateString === todayDateString;
        console.log("Checking appointment:", app.appointment_id, "Date:", appointmentDateString, "Today:", todayDateString, "IsToday:", isToday, "IsActive:", isActive);
        return isActive && isToday;
      } else {
        // For upcoming: include today and future dates
        const appointmentDate = new Date(appointmentDateString);
        appointmentDate.setHours(0, 0, 0, 0);
        const isUpcoming = appointmentDate >= today;
        console.log("Checking appointment:", app.appointment_id, "Date:", appointmentDateString, "IsUpcoming:", isUpcoming, "IsActive:", isActive);
        return isActive && isUpcoming;
      }
    });

    console.log("Filtered appointments:", filteredAppointments);

    const processedAppointments = filteredAppointments.map(app => {
      // Extract time directly from the ISO string (HH:MM format)
      const timeString = app.appointment_datetime.substring(11, 16); // Gets HH:MM
      const dateString = app.appointment_datetime.substring(0, 10); // Gets YYYY-MM-DD
      
      console.log("Processing appointment:", app.appointment_id, "Raw datetime:", app.appointment_datetime, "Extracted time:", timeString);
      
      return {
        ...app,
        patient_name: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : 'Unknown Patient',
        doctor_name: app.doctors ? `${app.doctors.first_name} ${app.doctors.last_name}` : 'Unknown Doctor',
        timeDisplay: formatTimeTo12Hour(timeString),
        dateDisplay: formatDateToReadable(dateString),
      };
    });

    console.log("Final processed appointments:", processedAppointments);
    setAppointmentsToday(processedAppointments);
    
    // Fetch ALL appointments for calendar (not limited by date range filter)
    const { data: allApptsData, error: allApptsError } = await supabase
      .from("appointments")
      .select(`
        appointment_id,
        appointment_datetime,
        appointment_state,
        notes,
        patient_id,
        doctor_id,
        patients (first_name, last_name),
        doctors (first_name, last_name)
      `)
      .eq("secretary_id", user.secretary_id)
      .order("appointment_datetime", { ascending: true });

    if (!allApptsError && allApptsData) {
      // Filter only by active status, not by date
      const allActiveAppointments = allApptsData
        .filter(app => {
          const state = (app.appointment_state || '').toLowerCase();
          return state !== 'finished' && state !== 'done' && state !== 'cancelled';
        })
        .map(app => {
          const timeString = app.appointment_datetime.substring(11, 16);
          const dateString = app.appointment_datetime.substring(0, 10);
          return {
            ...app,
            patient_name: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : 'Unknown Patient',
            doctor_name: app.doctors ? `${app.doctors.first_name} ${app.doctors.last_name}` : 'Unknown Doctor',
            timeDisplay: formatTimeTo12Hour(timeString),
            dateDisplay: formatDateToReadable(dateString),
          };
        });
      setAllAppointments(allActiveAppointments);
      console.log("Calendar appointments set (all active):", allActiveAppointments.length);
    }
  }
};

  const handleInputChange = (field, value) => {
    setPatientForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAppointmentChange = (field, value) => {
    setAppointmentForm(prev => ({ ...prev, [field]: value }));
  };

  const handleMedicationChange = (index, field, value) => {
    const newMedications = [...medications];
    newMedications[index][field] = value;
    setMedications(newMedications);
  };

  const handleAddMedication = () => {
    setMedications([...medications, { drugName: "", dosage: "", frequency: "", prescribedBy: "" }]);
  };

  const handleRemoveMedication = (index) => {
    const newMedications = medications.filter((_, i) => i !== index);
    setMedications(newMedications);
  };

  const handleProfilePictureChange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setMessage("File size must be less than 10MB");
        return;
      }

      setMessage("Uploading profile picture...");
      
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('patient-profile')
        .upload(fileName, file);

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: publicUrl } = supabase.storage
        .from('patient-profile')
        .getPublicUrl(fileName);

      setProfilePicture(publicUrl.publicUrl);
      setMessage("Profile picture uploaded successfully!");
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      setMessage("Error uploading profile picture. Please try again.");
    }
  };

  const savePatient = async () => {
    // Check for duplicate email before saving
    const { data: existingPatient, error: emailCheckError } = await supabase
      .from("patients")
      .select("patient_id, email")
      .eq("email", patientForm.email)
      .single();

    // If we found a patient with this email and it's not the one we're editing
    if (existingPatient && (!editingPatientId || existingPatient.patient_id !== editingPatientId)) {
      setMessage(`Error: A patient with email "${patientForm.email}" already exists. Please use a different email address.`);
      return;
    }

    const patientData = {
        first_name: patientForm.firstName,
        last_name: patientForm.lastName,
        patient_picture: profilePicture, // Add the profile picture URL
        email: patientForm.email,
        password: patientForm.password, // Consider hashing in production
        preferred_doctor_id: selectedDoctorId,
        date_of_birth: patientForm.dateOfBirth,
        contact_info: patientForm.contactInfo,
        gender: patientForm.gender,
        address: patientForm.address,
        emergency_contact: patientForm.emergencyContactNumber,
        diabetes_type: patientForm.diabetesType,
        allergies: patientForm.allergies,
        diabetes_duration: patientForm.diabetes_duration,
        medication: JSON.stringify(medications), // Store medications as a JSON string
        complication_history: [
          patientForm.footUlcersAmputation && "Foot Ulcers/Amputation",
          patientForm.eyeIssues && "Eye Issues",
          patientForm.kidneyIssues && "Kidney Issues",
          patientForm.stroke && "Stroke",
          patientForm.heartAttack && "Heart Attack",
          patientForm.hypertensive && "Hypertensive",
          patientForm.family_diabetes && "Family Diabetes",
          patientForm.family_hypertension && "Family Hypertension",
          patientForm.cardiovascular && "Cardiovascular",
        ].filter(Boolean).join(", ") || null,
        smoking_status: patientForm.smokingStatus,
        monitoring_frequency: patientForm.monitoringFrequencyGlucose,
        last_doctor_visit: patientForm.lastDoctorVisit,
        last_eye_exam: patientForm.lastEyeExam,
        phase: 'Pre-Operative', // Default to Pre-Operative on creation
        patient_height: patientForm.patientHeight || null,
        patient_weight: patientForm.patientWeight || null,
        BMI: patientForm.bmi || null,
      };

      let error;
      if (editingPatientId) {
        // Get current patient data for audit log
        const { data: currentPatientData } = await supabase
          .from("patients")
          .select('*')
          .eq("patient_id", editingPatientId)
          .single();

        // Update existing patient
        const { data: updatedData, error: updateError } = await supabase
          .from("patients")
          .update(patientData)
          .eq("patient_id", editingPatientId)
          .select()
          .single();
        
        error = updateError;

        // Log patient update
        if (!error) {
          await logPatientDataChange(
            'secretary',
            user.secretary_id,
            `${user.first_name} ${user.last_name}`,
            editingPatientId,
            'user_management',
            'edit',
            JSON.stringify(currentPatientData),
            JSON.stringify(updatedData),
            'Secretary Dashboard - Patient Management'
          );
        }
      } else {
        // Create new patient
        const { data: newPatientData, error: insertError } = await supabase
          .from("patients")
          .insert([patientData])
          .select()
          .single();
        
        error = insertError;

        // Log patient creation
        if (!error) {
          await logSystemAction(
            'secretary',
            user.secretary_id,
            `${user.first_name} ${user.last_name}`,
            'user_management',
            'create',
            `Created new patient: ${patientData.first_name} ${patientData.last_name}`,
            'Secretary Dashboard - Patient Management'
          );
        }
      }

      if (error) {
        setMessage(`Error saving patient: ${error.message}`);
      } else {
        // Only clear message and refresh patient list. No success modal or immediate page navigation.
        setMessage(""); // Clear any previous messages
        fetchPatients(); // Refresh patient list and chart data
      }
    };

    const handleSavePatientWithConfirmation = () => {
      console.log("PATIENT CONFIRMATION: handleSavePatientWithConfirmation called. Current step:", currentPatientStep); // New log
      if (currentPatientStep < steps.length - 1) {
        setMessage("Please complete all steps before saving the patient.");
        console.log("PATIENT CONFIRMATION: Validation failed. Not showing modal."); // New log
        return;
      }
      if (!selectedDoctorId) {
        setMessage("Please select a doctor to assign the patient to.");
        console.log("PATIENT CONFIRMATION: No doctor selected. Not showing modal."); // New log
        return;
      }
      setMessage(""); // Clear any previous messages
      setShowPatientConfirmationModal(true); // Show the confirmation modal
      console.log("PATIENT CONFIRMATION: showPatientConfirmationModal state set to true."); // New log
    };

    const confirmAndSavePatient = async () => {
      setShowPatientConfirmationModal(false); // Hide confirmation modal
      await savePatient(); // Proceed with saving the patient
      // After save, the patient creation/edit form will remain open.
      // If the user wants to clear the form or navigate, they can use the "Cancel" button.
      // Reset form and navigate after confirmed action, so it's ready for a new entry
      setPatientForm({
        firstName: "", lastName: "", email: "", password: "", dateOfBirth: "", contactInfo: "",
        middleName: "", gender: "", address: "", emergencyContactNumber: "", diabetesType: "", allergies: "", diabetes_duration: "",
        footUlcersAmputation: false, eyeIssues: false, kidneyIssues: false, stroke: false,
        heartAttack: false, hypertensive: false, smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
        lastEyeExam: "", preparedBy: "", patientHeight: "", patientWeight: "", bmi: ""
      });
      setMedications([{ drugName: "", dosage: "", frequency: "", prescribedBy: "" }]);
      setSelectedDoctorId("");
      setEditingPatientId(null);
      setCurrentPatientStep(0);
      setActivePage("patient-list"); // Navigate to patient list after successful confirmation and save
    };


  const handleEditPatient = (patient) => {
    setPatientForm({
      firstName: patient.first_name || "",
      lastName: patient.last_name || "",
      email: patient.email || "",
      password: patient.password || "", // In a real app, never pre-fill password
      dateOfBirth: patient.date_of_birth || "",
      contactInfo: patient.contact_info || "",
      middleName: patient.middle_name || "",
      gender: patient.gender || "",
      address: patient.address || "",
      emergencyContactNumber: patient.emergency_contact || "",
      diabetesType: patient.diabetes_type || "",
      allergies: patient.allergies || "",
      diabetes_duration: patient.diabetes_duration || "",
      footUlcersAmputation: patient.complication_history?.includes("Foot Ulcers/Amputation") || false,
      eyeIssues: patient.complication_history?.includes("Eye Issues") || false,
      kidneyIssues: patient.complication_history?.includes("Kidney Issues") || false,
      stroke: patient.complication_history?.includes("Stroke") || false,
      heartAttack: patient.complication_history?.includes("Heart Attack") || false,
      hypertensive: patient.complication_history?.includes("Hypertensive") || false,
      smokingStatus: patient.smoking_status || "",
      monitoringFrequencyGlucose: patient.monitoringFrequencyGlucose || "",
      lastDoctorVisit: patient.last_doctor_visit || "",
      lastEyeExam: patient.last_eye_exam || "",
      patientHeight: patient.patient_height || "",
      patientWeight: patient.patient_weight || "",
      bmi: patient.BMI || ""
    });
    try {
      setMedications(patient.medication ? JSON.parse(patient.medication) : [{ drugName: "", dosage: "", frequency: "", prescribedBy: "" }]);
    } catch (e) {
      console.error("Error parsing medications in handleEditPatient:", e);
      setMedications([{ drugName: String(patient.medication) || "", dosage: "", frequency: "", prescribedBy: "" }]); // Fallback: put raw string if not JSON
    }

    setSelectedDoctorId(patient.preferred_doctor_id || "");
    setEditingPatientId(patient.patient_id);
    setCurrentPatientStep(0); // Start from the first step for editing
    setActivePage("create-patient");
  };

  const handleDeletePatient = async (patientId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this patient? This will also delete all associated lab results, appointments, and other data.");
    if (!confirmDelete) return;

    try {
      // Get patient data before deletion for audit log
      const { data: patientData } = await supabase
        .from("patients")
        .select('*')
        .eq("patient_id", patientId)
        .single();

      // Delete related records first to avoid foreign key constraint violations
      // Delete patient lab results
      const { error: labError } = await supabase
        .from("patient_labs")
        .delete()
        .eq("patient_id", patientId);

      if (labError) {
        console.error("Error deleting patient labs:", labError);
        setMessage(`Error deleting patient lab data: ${labError.message}`);
        return;
      }

      // Delete appointments
      const { error: appointmentError } = await supabase
        .from("appointments")
        .delete()
        .eq("patient_id", patientId);

      if (appointmentError) {
        console.error("Error deleting appointments:", appointmentError);
        setMessage(`Error deleting patient appointments: ${appointmentError.message}`);
        return;
      }

      // Delete any other related records (add more as needed based on your schema)
      // For example, if you have patient medications, medical history, etc.

      // Finally, delete the patient record
      const { error: patientError } = await supabase
        .from("patients")
        .delete()
        .eq("patient_id", patientId);
      
      if (patientError) {
        console.error("Error deleting patient:", patientError);
        setMessage(`Error deleting patient: ${patientError.message}`);
        return;
      }

      // Log patient deletion
      await logSystemAction(
        'secretary',
        user.secretary_id,
        `${user.first_name} ${user.last_name}`,
        'user_management',
        'delete',
        `Deleted patient: ${patientData?.first_name} ${patientData?.last_name} (ID: ${patientId}) including all associated data`,
        'Secretary Dashboard - Patient Management'
      );

      setMessage("Patient and all associated data deleted successfully!");
      fetchPatients(); // Refresh patient list and chart data
      
    } catch (error) {
      console.error("Unexpected error during patient deletion:", error);
      setMessage(`Unexpected error deleting patient: ${error.message}`);
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

    // Create appointment datetime without timezone conversion - store exactly what user enters
    // We'll treat the input as if it's in UTC to avoid any timezone issues
    const dateTimeString = `${appointmentForm.date}T${appointmentForm.time}:00.000Z`; // Force UTC
    const appointmentDateTime = new Date(dateTimeString);
    
    console.log("Creating appointment - User input:", `${appointmentForm.date} ${appointmentForm.time}`);
    console.log("Storing as UTC:", dateTimeString);
    console.log("DateTime object:", appointmentDateTime);

    let error;
    let appointmentData;
    
    if (editingAppointmentId) {
      // Get current appointment data for audit log
      const { data: currentData } = await supabase
        .from("appointments")
        .select('*')
        .eq("appointment_id", editingAppointmentId)
        .single();

      // Update existing appointment
      const { data: updatedData, error: updateError } = await supabase
        .from("appointments")
        .update({
          doctor_id: appointmentForm.doctorId,
          patient_id: appointmentForm.patientId,
          appointment_datetime: appointmentDateTime.toISOString(),
          notes: appointmentForm.notes,
        })
        .eq("appointment_id", editingAppointmentId)
        .select()
        .single();
      
      error = updateError;
      appointmentData = updatedData;

      // Log appointment update
      if (!error) {
        await logAppointmentEvent(
          'secretary',
          user.secretary_id,
          `${user.first_name} ${user.last_name}`,
          appointmentForm.patientId,
          'reschedule',
          JSON.stringify(currentData),
          JSON.stringify(appointmentData),
          'Secretary Dashboard - Appointment Management'
        );
      }
    } else {
      // Create new appointment
      const { data, error: insertError } = await supabase
        .from("appointments")
        .insert([
          {
            doctor_id: appointmentForm.doctorId,
            patient_id: appointmentForm.patientId,
            secretary_id: user.secretary_id,
            appointment_datetime: appointmentDateTime.toISOString(),
            notes: appointmentForm.notes,
            appointment_state: "Pending",
          },
        ])
        .select()
        .single();
      
      error = insertError;
      appointmentData = data;

      console.log("New appointment created:", appointmentData);

      // Log new appointment creation
      if (!error) {
        await logAppointmentEvent(
          'secretary',
          user.secretary_id,
          `${user.first_name} ${user.last_name}`,
          appointmentForm.patientId,
          'schedule',
          '',
          JSON.stringify(appointmentData),
          'Secretary Dashboard - Appointment Management'
        );
      }
    }

    if (error) {
      console.error("Error saving appointment:", error);
      setMessage(`Error saving appointment: ${error.message}`);
    } else {
      setMessage(`Appointment ${editingAppointmentId ? 'updated' : 'scheduled'} successfully!`);
      // Reset form and editing state
      setAppointmentForm({ doctorId: "", patientId: "", date: "", time: "", notes: "" });
      setEditingAppointmentId(null);
      console.log("About to fetch all appointments to refresh the list...");
      fetchAllAppointments(); // Refresh appointment list
    }
  };

  // Handler for "Cancel" and "Done" buttons (delete appointment)
  const handleDeleteAppointment = async (appointmentId, actionType) => {
    const confirmMessage = `Are you sure you want to ${actionType} this appointment? This action cannot be undone.`;
    if (window.confirm(confirmMessage)) {
      // Get appointment data before deletion for audit log
      const { data: appointmentData } = await supabase
        .from("appointments")
        .select('*')
        .eq("appointment_id", appointmentId)
        .single();

      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("appointment_id", appointmentId);

      if (error) {
        console.error(`Error ${actionType}ing appointment:`, error);
        setMessage(`Error ${actionType}ing appointment: ${error.message}`);
      } else {
        // Log appointment cancellation/completion
        await logAppointmentEvent(
          'secretary',
          user.secretary_id,
          `${user.first_name} ${user.last_name}`,
          appointmentData?.patient_id,
          actionType === 'cancel' ? 'cancel' : 'delete',
          JSON.stringify(appointmentData),
          `Appointment ${actionType}ed`,
          'Secretary Dashboard - Appointment Management'
        );

        setMessage(`Appointment ${actionType} successfully!`);
        fetchAllAppointments(); // Refresh the list of appointments
      }
    }
  };

  // Handler for "Edit" button
  const handleEditAppointment = (appointment) => {
    // Extract date and time directly from the ISO string
    const [datePart, timePart] = appointment.appointment_datetime.split('T');
    const formattedTime = timePart.substring(0, 5); // Gets HH:MM

    console.log("Editing appointment - Raw datetime:", appointment.appointment_datetime, "Extracted date:", datePart, "Extracted time:", formattedTime);

    setAppointmentForm({
      doctorId: appointment.doctor_id,
      patientId: appointment.patient_id,
      date: datePart,
      time: formattedTime,
      notes: appointment.notes,
    });
    setEditingAppointmentId(appointment.appointment_id);
    setActivePage("appointments"); // Navigate to the appointment scheduling page
  };

  // Handler for "Flag" button in missing logs table
  const handleFlagPatient = async (patient) => {
    try {
      setMessage("Sending notifications...");
      
      // Send notification to patient - using 'patient' type instead of 'compliance'
      const patientNotificationSuccess = await sendNotification(
        patient.patient_id,
        'patient',
        'Missing Health Metrics Submission',
        'You have missing health metrics that need to be submitted. Please log your blood pressure, blood glucose, and wound photos as required for your treatment plan.',
        'patient'
      );

      // Send notification to preferred doctor if patient has one - using 'patient' type
      let doctorNotificationSuccess = true;
      if (patient.preferred_doctor_id) {
        doctorNotificationSuccess = await sendNotification(
          patient.preferred_doctor_id,
          'doctor',
          'Patient Flagged for Missing Metrics',
          `Patient ${patient.first_name} ${patient.last_name} has been flagged for missing health metrics submissions. They have been notified to submit their required data.`,
          'patient'
        );
      }

      // Note: Audit logging removed temporarily to avoid constraint violations

      if (patientNotificationSuccess && doctorNotificationSuccess) {
        setMessage(`✅ Notifications sent successfully to ${patient.first_name} ${patient.last_name} and their doctor.`);
      } else {
        setMessage(`⚠️ Some notifications may have failed to send. Please try again.`);
      }

      // Clear the message after 5 seconds
      setTimeout(() => setMessage(""), 5000);

    } catch (error) {
      console.error('Error flagging patient:', error);
      setMessage(`❌ Error sending notifications: ${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    }
  };


  const filteredPatients = patients.filter((pat) => {
    const nameMatch = `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Risk classification filter
    let riskMatch = true;
    if (selectedRiskFilter !== 'all') {
      const patientRisk = (pat.risk_classification || '').toLowerCase();
      riskMatch = patientRisk === selectedRiskFilter;
    }
    
    // Lab status filter
    let labStatusMatch = true;
    if (selectedLabStatusFilter !== 'all') {
      if (selectedLabStatusFilter === 'awaiting') {
        labStatusMatch = pat.lab_status === '❌Awaiting';
      } else if (selectedLabStatusFilter === 'submitted') {
        labStatusMatch = pat.lab_status === '✅Submitted';
      }
    }
    
    // Profile status filter
    let profileStatusMatch = true;
    if (selectedProfileStatusFilter !== 'all') {
      if (selectedProfileStatusFilter === 'pending') {
        profileStatusMatch = pat.profile_status === '🟡Pending';
      } else if (selectedProfileStatusFilter === 'finalized') {
        profileStatusMatch = pat.profile_status === '🟢Finalized';
      }
    }
    
    return nameMatch && riskMatch && labStatusMatch && profileStatusMatch;
  });

  // Filtered patients for lab entry search with separate risk filter
  const filteredLabSearchPatients = patients.filter((pat) => {
    const nameMatch = `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Risk classification filter for lab search
    let riskMatch = true;
    if (selectedLabRiskFilter !== 'all') {
      const patientRisk = (pat.risk_classification || '').toLowerCase();
      riskMatch = patientRisk === selectedLabRiskFilter;
    }
    
    // Lab status filter for lab entry
    let labStatusMatch = true;
    if (selectedLabEntryLabStatusFilter !== 'all') {
      if (selectedLabEntryLabStatusFilter === 'awaiting') {
        labStatusMatch = pat.lab_status === '❌Awaiting';
      } else if (selectedLabEntryLabStatusFilter === 'submitted') {
        labStatusMatch = pat.lab_status === '✅Submitted';
      }
    }
    
    // Profile status filter for lab entry
    let profileStatusMatch = true;
    if (selectedLabEntryProfileStatusFilter !== 'all') {
      if (selectedLabEntryProfileStatusFilter === 'pending') {
        profileStatusMatch = pat.profile_status === '🟡Pending';
      } else if (selectedLabEntryProfileStatusFilter === 'finalized') {
        profileStatusMatch = pat.profile_status === '🟢Finalized';
      }
    }
    
    return nameMatch && riskMatch && labStatusMatch && profileStatusMatch;
  });

  const indexOfLastPatient = currentPagePatients * PATIENTS_PER_PAGE;
    const indexOfFirstPatient = indexOfLastPatient - PATIENTS_PER_PAGE;
    const paginatedPatients = filteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);
    const totalPatientPages = Math.ceil(filteredPatients.length / PATIENTS_PER_PAGE);


    const totalLabSearchPatients = filteredLabSearchPatients.length;
    const totalLabSearchPatientPages = Math.ceil(filteredLabSearchPatients.length / LAB_SEARCH_PATIENTS_PER_PAGE);
  
    const startIndexLabSearchPatient = (currentPageLabSearchPatients - 1) * LAB_SEARCH_PATIENTS_PER_PAGE;
    const endIndexLabSearchPatient = startIndexLabSearchPatient + LAB_SEARCH_PATIENTS_PER_PAGE;
    const paginatedLabSearchPatients = filteredLabSearchPatients.slice(startIndexLabSearchPatient, endIndexLabSearchPatient);

    // Health Metrics pagination calculations
    const sortedHealthMetrics = [...allPatientHealthMetrics].sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date));
    const totalHealthMetricsPages = Math.ceil(sortedHealthMetrics.length / HEALTH_METRICS_PER_PAGE);
    const startIndexHealthMetrics = (currentPageHealthMetrics - 1) * HEALTH_METRICS_PER_PAGE;
    const endIndexHealthMetrics = startIndexHealthMetrics + HEALTH_METRICS_PER_PAGE;
    const paginatedHealthMetrics = sortedHealthMetrics.slice(startIndexHealthMetrics, endIndexHealthMetrics);
    
  // Risk filter handlers
  const handleRiskFilterChange = (riskLevel) => {
    setSelectedRiskFilter(riskLevel);
    setCurrentPagePatients(1); // Reset to first page when filter changes
  };

  const handleLabRiskFilterChange = (riskLevel) => {
    setSelectedLabRiskFilter(riskLevel);
    setCurrentPageLabSearchPatients(1); // Reset to first page when filter changes
  };

  // Lab Status filter handlers
  const handleLabStatusFilterChange = (status) => {
    setSelectedLabStatusFilter(status);
    setCurrentPagePatients(1); // Reset to first page when filter changes
  };

  const handleLabEntryLabStatusFilterChange = (status) => {
    setSelectedLabEntryLabStatusFilter(status);
    setCurrentPageLabSearchPatients(1); // Reset to first page when filter changes
  };

  // Profile Status filter handlers
  const handleProfileStatusFilterChange = (status) => {
    setSelectedProfileStatusFilter(status);
    setCurrentPagePatients(1); // Reset to first page when filter changes
  };

  const handleLabEntryProfileStatusFilterChange = (status) => {
    setSelectedLabEntryProfileStatusFilter(status);
    setCurrentPageLabSearchPatients(1); // Reset to first page when filter changes
  };

  // Sort order handlers
  const handleSortOrderChange = (order) => {
    setSortOrder(order);
    setCurrentPagePatients(1); // Reset to first page when sort order changes
  };

  const handleLabEntrySortOrderChange = (order) => {
    setLabEntrySortOrder(order);
    setCurrentPageLabSearchPatients(1); // Reset to first page when sort order changes
  };

  // Calculate risk counts for filter buttons
  const calculateRiskCounts = (patientList) => {
    const searchFilteredPatients = patientList.filter((pat) =>
      `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return {
      all: searchFilteredPatients.length,
      low: searchFilteredPatients.filter(pat => (pat.risk_classification || '').toLowerCase() === 'low').length,
      moderate: searchFilteredPatients.filter(pat => (pat.risk_classification || '').toLowerCase() === 'moderate').length,
      high: searchFilteredPatients.filter(pat => (pat.risk_classification || '').toLowerCase() === 'high').length,
      ppd: searchFilteredPatients.filter(pat => (pat.risk_classification || '').toLowerCase() === 'ppd').length
    };
  };

  // Calculate lab status counts for filter buttons
  const calculateLabStatusCounts = (patientList) => {
    const searchFilteredPatients = patientList.filter((pat) =>
      `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return {
      all: searchFilteredPatients.length,
      awaiting: searchFilteredPatients.filter(pat => pat.lab_status === '❌Awaiting').length,
      submitted: searchFilteredPatients.filter(pat => pat.lab_status === '✅Submitted').length
    };
  };

  // Calculate profile status counts for filter buttons
  const calculateProfileStatusCounts = (patientList) => {
    const searchFilteredPatients = patientList.filter((pat) =>
      `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return {
      all: searchFilteredPatients.length,
      pending: searchFilteredPatients.filter(pat => pat.profile_status === '🟡Pending').length,
      finalized: searchFilteredPatients.filter(pat => pat.profile_status === '🟢Finalized').length
    };
  };

  const patientRiskCounts = calculateRiskCounts(patients);
  const labSearchRiskCounts = calculateRiskCounts(patients);
  const patientLabStatusCounts = calculateLabStatusCounts(patients);
  const labSearchLabStatusCounts = calculateLabStatusCounts(patients);
  const patientProfileStatusCounts = calculateProfileStatusCounts(patients);
  const labSearchProfileStatusCounts = calculateProfileStatusCounts(patients);
    
  const handleLabInputChange = (field, value) => {
    setLabResults(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectPatientForLab = (patient) => {
    setLabResults(prev => ({ ...prev, selectedPatientForLab: patient }));
    setLabEntryStep(2); // Go to the input form
    // Optionally pre-fill date if desired, or leave it for manual entry
    setLabResults(prev => ({ ...prev, dateSubmitted: new Date().toISOString().slice(0, 10) }));
  };

  // Function to open the patient detail view (not a modal anymore)
  const handleViewPatientDetails = (patient) => {
    setSelectedPatientForDetail(patient);
    setCurrentPageHealthMetrics(1); // Reset health metrics pagination when viewing new patient
    setActivePage("patient-detail-view"); // Change to new page state
  };

  // Function to handle photo expansion
  const handleExpandPhoto = (photo) => {
    setSelectedPhoto(photo);
    setShowPhotoModal(true);
  };

  const handleClosePhotoModal = () => {
    setShowPhotoModal(false);
    setSelectedPhoto(null);
  };

  // Function to fetch and display saved analysis for a specific wound photo
  const handleViewWoundAnalysis = async (photo) => {
    setIsLoadingAnalysis(true);
    setAnalysisError(null);
    setSelectedWoundPhotoForAnalysis(photo);
    setShowAnalysisModal(true);

    try {
      console.log('Fetching analysis for photo:', photo.url);
      console.log('Patient ID:', selectedPatientForDetail.patient_id);
      
      // Fetch the health metric associated with this wound photo including treatment plan
      const { data: healthMetric, error: metricError } = await supabase
        .from('health_metrics')
        .select('wound_photo_grad_url, wound_photo_mask_url, risk_classification, wound_diagnosis, wound_care, wound_dressing, wound_medication, "wound_follow-up", "wound_important-notes"')
        .eq('patient_id', selectedPatientForDetail.patient_id)
        .eq('wound_photo_url', photo.url)
        .order('submission_date', { ascending: false })
        .limit(1)
        .single();

      if (metricError) {
        console.error('Error fetching analysis:', metricError);
        console.error('Error code:', metricError.code);
        console.error('Error message:', metricError.message);
        console.error('Error details:', metricError.details);
        
        // If no rows found, show a more specific message
        if (metricError.code === 'PGRST116') {
          setAnalysisError('No analysis found for this wound photo. The doctor may not have submitted analysis results yet.');
        } else {
          setAnalysisError(`Error loading analysis: ${metricError.message}`);
        }
        setAnalysisResults(null);
        setIsLoadingAnalysis(false);
        return;
      }

      if (!healthMetric || !healthMetric.wound_photo_grad_url || !healthMetric.wound_photo_mask_url) {
        setAnalysisError('No saved analysis found for this wound photo.');
        setAnalysisResults(null);
        setIsLoadingAnalysis(false);
        return;
      }

      // Set the analysis results with the saved URLs and treatment plan
      setAnalysisResults({
        gradcam: healthMetric.wound_photo_grad_url,
        segmentation: healthMetric.wound_photo_mask_url,
        className: healthMetric.risk_classification || 'Unknown',
        originalImage: photo.url,
        treatmentPlan: {
          diagnosis: healthMetric.wound_diagnosis || 'N/A',
          care: healthMetric.wound_care || 'N/A',
          dressing: healthMetric.wound_dressing || 'N/A',
          medication: healthMetric.wound_medication || 'N/A',
          followUp: healthMetric['wound_follow-up'] || 'N/A',
          importantNotes: healthMetric['wound_important-notes'] || 'N/A'
        }
      });

    } catch (error) {
      console.error('Error fetching wound analysis:', error);
      setAnalysisError('Failed to load analysis. Please try again.');
      setAnalysisResults(null);
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Function to close the analysis modal
  const handleCloseAnalysisModal = () => {
    setShowAnalysisModal(false);
    setAnalysisResults(null);
    setAnalysisError(null);
    setSelectedWoundPhotoForAnalysis(null);
  };

  // Function to open demographics edit modal
  const handleOpenDemographicsEdit = () => {
    if (selectedPatientForDetail) {
      setDemographicsForm({
        firstName: selectedPatientForDetail.first_name || "",
        lastName: selectedPatientForDetail.last_name || "",
        dateOfBirth: selectedPatientForDetail.date_of_birth || "",
        gender: selectedPatientForDetail.gender || "",
        contactInfo: selectedPatientForDetail.contact_info || "",
        address: selectedPatientForDetail.address || "",
        emergencyContactNumber: selectedPatientForDetail.emergency_contact || "",
        password: selectedPatientForDetail.password || "",
        patientHeight: selectedPatientForDetail.patient_height || "",
        patientWeight: selectedPatientForDetail.patient_weight || "",
        bmi: selectedPatientForDetail.BMI || ""
      });
      setShowDemographicsEditModal(true);
    }
  };

  // Function to close demographics edit modal
  const handleCloseDemographicsEdit = () => {
    setShowDemographicsEditModal(false);
    setDemographicsForm({
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: "",
      contactInfo: "",
      address: "",
      emergencyContactNumber: "",
      password: "",
      patientHeight: "",
      patientWeight: "",
      bmi: ""
    });
  };

  // Function to handle demographics form input changes
  const handleDemographicsInputChange = (field, value) => {
    setDemographicsForm(prev => ({ ...prev, [field]: value }));
  };

  // Function to save demographics changes
  const handleSaveDemographics = async () => {
    if (!selectedPatientForDetail) {
      setMessage("No patient selected.");
      return;
    }

    try {
      const { error } = await supabase
        .from('patients')
        .update({
          first_name: demographicsForm.firstName,
          last_name: demographicsForm.lastName,
          date_of_birth: demographicsForm.dateOfBirth,
          gender: demographicsForm.gender,
          contact_info: demographicsForm.contactInfo,
          address: demographicsForm.address,
          emergency_contact: demographicsForm.emergencyContactNumber,
          password: demographicsForm.password,
          patient_height: demographicsForm.patientHeight || null,
          patient_weight: demographicsForm.patientWeight || null,
          BMI: demographicsForm.bmi || null
        })
        .eq('patient_id', selectedPatientForDetail.patient_id);

      if (error) {
        console.error("Error updating patient demographics:", error);
        setMessage(`Error: ${error.message}`);
        return;
      }

      setMessage("Patient demographics updated successfully!");
      
      // Update the selected patient detail with new data
      setSelectedPatientForDetail(prev => ({
        ...prev,
        first_name: demographicsForm.firstName,
        last_name: demographicsForm.lastName,
        date_of_birth: demographicsForm.dateOfBirth,
        gender: demographicsForm.gender,
        contact_info: demographicsForm.contactInfo,
        address: demographicsForm.address,
        emergency_contact: demographicsForm.emergencyContactNumber,
        password: demographicsForm.password,
        patient_height: demographicsForm.patientHeight,
        patient_weight: demographicsForm.patientWeight,
        BMI: demographicsForm.bmi
      }));

      // Refresh the patients list
      await fetchPatients();

      // Close the modal
      handleCloseDemographicsEdit();

      // Log the update
      await logSystemAction(
        'secretary',
        user.secretary_id,
        `${user.first_name} ${user.last_name}`,
        'patient_update',
        'update',
        `Updated demographics for patient: ${demographicsForm.firstName} ${demographicsForm.lastName}`,
        'Secretary Dashboard - Patient Demographics Update'
      );

    } catch (error) {
      console.error("Error saving demographics:", error);
      setMessage(`Error: ${error.message}`);
    }
  };

// ... rest of the component's functions and return statement ...

  // New function to handle viewing lab details
  const handleViewPatientLabDetails = (patient) => {
    // This will trigger the useEffect to fetch lab history
    setSelectedPatientForDetail(patient); // Reuse selectedPatientForDetail to fetch data
    setSelectedPatientForLabView(patient); // Set for the new lab view page's title etc.
    setActivePage("lab-details-view"); // Set active page to the new lab details view
  };

  // Function to close the patient detail view and return to patient list
  const handleClosePatientDetailModal = () => {
    setActivePage("patient-list"); // Go back to patient list
    setSelectedPatientForDetail(null); // Clear the selected patient when closing
    setCurrentPageHealthMetrics(1); // Reset health metrics pagination
    setLastLabDate('N/A'); // Reset last lab date
    setPatientLabResults({ // Reset lab results when closing
      Hba1c: 'N/A', UCR: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
      cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
      UREA: 'N/A', BUN: 'N/A', URIC: 'N/A', EGFR: 'N/A',
    });
    setAllPatientLabResultsHistory([]); // Reset all lab results history
    setPatientHealthMetrics({ bloodGlucoseLevel: 'N/A', bloodPressure: 'N/A' }); // Reset health metrics
    setAllPatientHealthMetrics([]); // Reset historical data
    setWoundPhotoData({ url: '', date: '' }); // Reset wound photo URL
    setAllWoundPhotos([]); // Reset wound photos
    setWoundPhotosLoading(false); // Reset wound photos loading state
    setPatientAppointments([]);
  };

  // Function to close the lab details view and return to lab entry step 1
  const handleCloseLabDetailsView = () => {
    setActivePage("lab-result-entry"); // Go back to lab result entry
    setLabEntryStep(1); // Ensure it's on patient search step
    setSelectedPatientForLabView(null); // Clear the selected patient for lab view
    // No need to reset patientLabResults or allPatientLabResultsHistory here,
    // as they will be re-fetched if a patient is selected again.
  };

  // NEW FUNCTIONS FOR SPECIALIST ASSIGNMENT
  const fetchAvailableSpecialists = async () => {
    try {
      const { data, error } = await supabase
        .from("doctors")
        .select("doctor_id, first_name, last_name, specialization")
        .order("first_name", { ascending: true });

      if (error) {
        console.error("Error fetching specialists:", error);
        setAvailableSpecialists([]);
        return;
      }

      setAvailableSpecialists(data || []);
    } catch (error) {
      console.error("Error in fetchAvailableSpecialists:", error);
      setAvailableSpecialists([]);
    }
  };

  const fetchPatientSpecialists = async (patientId) => {
    try {
      const { data, error } = await supabase
        .from("patient_specialists")
        .select(`
          id,
          doctor_id,
          specialization,
          assigned_at,
          doctors (first_name, last_name, specialization)
        `)
        .eq("patient_id", patientId)
        .order("assigned_at", { ascending: false });

      if (error) {
        console.error("Error fetching patient specialists:", error);
        setCurrentPatientSpecialists([]);
        return;
      }

      setCurrentPatientSpecialists(data || []);
    } catch (error) {
      console.error("Error in fetchPatientSpecialists:", error);
      setCurrentPatientSpecialists([]);
    }
  };

  const handleEditSpecialist = (patient) => {
    setPatientForSpecialistAssignment(patient);
    setSelectedSpecialistId("");
    fetchAvailableSpecialists();
    fetchPatientSpecialists(patient.patient_id);
    setActivePage("specialist-assignment");
  };

  const handleAssignSpecialist = async () => {
    if (!selectedSpecialistId) {
      setMessage("Please select a specialist to assign.");
      return;
    }

    if (!patientForSpecialistAssignment) {
      setMessage("No patient selected for specialist assignment.");
      return;
    }

    try {
      // Get the selected doctor's information
      const selectedDoctor = availableSpecialists.find(doc => doc.doctor_id === selectedSpecialistId);

      // Send notification to the doctor for confirmation (don't add to database yet)
      // Store necessary data in the message with special format: PATIENT_ID|PATIENT_NAME|SECRETARY_ID|SECRETARY_NAME
      const notificationData = `${patientForSpecialistAssignment.patient_id}|${patientForSpecialistAssignment.first_name} ${patientForSpecialistAssignment.last_name}|${user.secretary_id}|${user.first_name} ${user.last_name}`;
      
      const { error: notifError } = await supabase
        .from("notifications")
        .insert([
          {
            user_id: selectedSpecialistId,
            user_role: 'doctor',
            type: 'patient',
            title: 'New Patient Assignment Request',
            message: `ASSIGNMENT_REQUEST:${notificationData}`,
            is_read: false
          }
        ]);

      if (notifError) {
        console.error("Error sending notification:", notifError);
        setMessage(`Error sending notification: ${notifError.message}`);
        return;
      }

      setMessage(`Assignment request sent to ${selectedDoctor?.first_name} ${selectedDoctor?.last_name}. Waiting for confirmation.`);
      setSelectedSpecialistId("");
      
      // Log the assignment request
      await logSystemAction(
        'secretary',
        user.secretary_id,
        `${user.first_name} ${user.last_name}`,
        'specialist_assignment',
        'request',
        `Requested specialist assignment for patient: ${patientForSpecialistAssignment.first_name} ${patientForSpecialistAssignment.last_name} to doctor: ${selectedDoctor?.first_name} ${selectedDoctor?.last_name}`,
        'Secretary Dashboard - Specialist Assignment'
      );

    } catch (error) {
      console.error("Error in handleAssignSpecialist:", error);
      setMessage(`Error assigning specialist: ${error.message}`);
    }
  };

  const handleRemoveSpecialist = async (assignmentId) => {
    const confirmRemove = window.confirm("Are you sure you want to remove this specialist assignment?");
    if (!confirmRemove) return;

    try {
      const { error } = await supabase
        .from("patient_specialists")
        .delete()
        .eq("id", assignmentId);

      if (error) {
        console.error("Error removing specialist:", error);
        setMessage(`Error removing specialist: ${error.message}`);
        return;
      }

      setMessage("Specialist removed successfully!");
      
      // Refresh the current patient specialists list
      if (patientForSpecialistAssignment) {
        fetchPatientSpecialists(patientForSpecialistAssignment.patient_id);
      }

      // Log the removal
      await logSystemAction(
        'secretary',
        user.secretary_id,
        `${user.first_name} ${user.last_name}`,
        'specialist_assignment',
        'remove',
        `Removed specialist assignment for patient: ${patientForSpecialistAssignment?.first_name} ${patientForSpecialistAssignment?.last_name}`,
        'Secretary Dashboard - Specialist Assignment'
      );

    } catch (error) {
      console.error("Error in handleRemoveSpecialist:", error);
      setMessage(`Error removing specialist: ${error.message}`);
    }
  };

  const handleCancelSpecialistAssignment = () => {
    setActivePage("patient-detail-view");
    setPatientForSpecialistAssignment(null);
    setSelectedSpecialistId("");
    setMessage("");
    // Keep currentPatientSpecialists so they still display in patient details
  };

  const handleDoneSpecialistAssignment = () => {
    // Refresh the patient specialists data before going back
    if (patientForSpecialistAssignment) {
      fetchPatientSpecialists(patientForSpecialistAssignment.patient_id);
    }
    setActivePage("patient-detail-view");
    setPatientForSpecialistAssignment(null);
    setSelectedSpecialistId("");
    setMessage("");
  };


  const handleFinalizeLabSubmission = async () => {
    // --- Start Debugging ---
    console.log("handleFinalizeLabSubmission called.");

    if (!labResults.selectedPatientForLab) {
      setMessage("Please select a patient to submit lab results for.");
      console.error("No patient selected for lab results.");
      return;
    }

    // Validate if required fields have values before parsing
    if (!labResults.dateSubmitted ||
        labResults.Hba1c === "" ||
        labResults.UCR === "" ||
        labResults.gotAst === "" ||
        labResults.gptAlt === "" ||
        labResults.cholesterol === "" ||
        labResults.triglycerides === "" ||
        labResults.hdlCholesterol === "" ||
        labResults.ldlCholesterol === "" ||
        labResults.UREA === "" ||
        labResults.BUN === "" ||
        labResults.URIC === "" ||
        labResults.EGFR === "") {
        setMessage("Please fill in all lab result fields.");
        return;
    }

    // Prepare data for insertion into the 'patient_labs' table
    const dataToInsert = {
      patient_id: labResults.selectedPatientForLab.patient_id,
      date_submitted: labResults.dateSubmitted,
      // !!! IMPORTANT CHANGE HERE: Use 'HbA1c' to match your database column name exactly !!!
      Hba1c: parseFloat(labResults.Hba1c) || null,
      ucr: parseFloat(labResults.UCR) || null,
      got_ast: parseFloat(labResults.gotAst) || null,
      gpt_alt: parseFloat(labResults.gptAlt) || null,
      cholesterol: parseFloat(labResults.cholesterol) || null,
      triglycerides: parseFloat(labResults.triglycerides) || null,
      hdl_cholesterol: parseFloat(labResults.hdlCholesterol) || null,
      ldl_cholesterol: parseFloat(labResults.ldlCholesterol) || null,
      urea: parseFloat(labResults.UREA) || null,
      bun: parseFloat(labResults.BUN) || null,
      uric: parseFloat(labResults.URIC) || null,
      egfr: parseFloat(labResults.EGFR) || null,
    };

    console.log("Attempting to insert lab data:", dataToInsert);
    // --- End Debugging ---

    const { error: labInsertError } = await supabase
      .from("patient_labs") // Targeting the correct table
      .insert([dataToInsert]);

    if (labInsertError) {
      console.error("Error inserting lab results:", labInsertError);
      setMessage(`Error submitting lab results: ${labInsertError.message}`);
      // Log the state of the modal after an error
      console.log("Modal state after error (on error path):", showSuccessModal);
    } else {
      console.log("Lab results successfully submitted.");
      setMessage("Lab results successfully submitted!");
      setShowSuccessModal(true); // THIS IS WHERE IT SHOULD SHOW
      console.log("Modal state set to true (on success path):", showSuccessModal); // Add this log to confirm state change
      // Clear the lab input form after successful submission
      setLabResults({
        selectedPatientForLab: null,
        dateSubmitted: "",
        Hba1c: "",
        UCR: "",
        gotAst: "",
        gptAlt: "",
        cholesterol: "",
        triglycerides: "",
        hdlCholesterol: "",
        ldlCholesterol: "",
        UREA: "",
        BUN: "",
        URIC: "",
        EGFR: "",
      });
      // No fetchPatients() here as we are not updating patient_status yet.
      // If you want to see the patient list update for *other reasons*, you might keep it.
      // For now, let's keep it minimal as requested.
    }
  };


  return (
    <div className="dashboard-container">
      <Header 
        user={user}
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={onLogout}
        showUsersPopup={showUsersPopup}
        setShowUsersPopup={setShowUsersPopup}
        showMessagePopup={showMessagePopup}
        setShowMessagePopup={setShowMessagePopup}
        userRole="Secretary"
      />

      <div className="main-content">
        {activePage === "dashboard" && ( // MODIFIED: Only show header actions on dashboard
          <div className="dashboard-header-section">
            <h2 className="welcome-message">Welcome Back, {user ? user.first_name : 'Maria'} 👋</h2>
            <div className="header-actions">
              <div className="search-bar">
                <input type="text" placeholder="Search for patients here" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <img src="../picture/search.svg" alt="Search" className="search-icon" />
              </div>
              <button className="create-new-patient-button" onClick={() => {
                setActivePage("create-patient");
                setPatientForm({ // Reset all fields
                  firstName: "", lastName: "", email: "", password: "", dateOfBirth: "", contactInfo: "",
                  middleName: "", gender: "", address: "", emergencyContactNumber: "", diabetesType: "", allergies: "", diabetes_duration: "",
                  footUlcersAmputation: "", eyeIssues: "", kidneyIssues: "", stroke: "",
                  heartAttack: "", hypertensive: "", smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
                  lastEyeExam: "", preparedBy: "", patientHeight: "", patientWeight: "", bmi: ""
                });
                setMedications([{ drugName: "", dosage: "", frequency: "", prescribedBy: "" }]); // Reset medications state
                setSelectedDoctorId("");
                setEditingPatientId(null);
                setCurrentPatientStep(0); // Reset step
              }}>
                <i className="fas fa-plus"></i> Add New Patient
              </button>
            </div>
          </div>
        )}

        <div className="dashboard-content">
          {activePage === "dashboard" && (
            <div className="dashboard-columns-container">
              <div className="dashboard-left-column">
                <div className="quick-links">
                <h3>Quick links</h3>
                <div className="quick-links-grid">
                  <div className="quick-link-item" onClick={() => setActivePage("lab-result-entry")}>
                    <div className="quick-link-icon lab-result">
                      <img src="../picture/labresult.png" alt="Lab Result" className="quick-link-image" />
                    </div>
                    <span>Lab Result Entry</span>
                  </div>
                  <div className="quick-link-item" onClick={() => setActivePage("appointments")}>
                    <div className="quick-link-icon set-appointment">
                      <img src="../picture/appointment.png" alt="Appointment" className="quick-link-image" />
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
                    lowRisk={lowRiskCount}
                    moderateRisk={moderateRiskCount}
                    highRisk={highRiskCount}
                    patientCountHistory={patientCountHistory}
                    pendingLabHistory={pendingLabHistory}
                  />
                </div>
              </div>

              <div className="dashboard-right-column">
                <div className="appointments-today">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3>{appointmentFilter === 'today' ? 'Appointments Today' : 'All Upcoming Appointments'}</h3>
                    <select 
                      value={appointmentFilter} 
                      onChange={(e) => {
                        setAppointmentFilter(e.target.value);
                        setCurrentPageAppointments(1); // Reset to first page when filter changes
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '5px',
                        border: '1px solid #ddd',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      <option value="today">Today</option>
                      <option value="upcoming">All Upcoming</option>
                    </select>
                  </div>
                  <div className="appointment-list-container"> {/* Added container for table + pagination */}
                    <table className="appointment-list-table"> {/* Class added for potential styling */}
                      <thead>
                        <tr>
                          {appointmentFilter === 'upcoming' && <th>Date</th>}
                          <th>Time</th> {/* Changed to Time only */}
                          <th>Patient Name</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Slice the appointmentsToday array for pagination */}
                        {appointmentsToday
                          .slice(
                            (currentPageAppointments - 1) * APPOINTMENTS_PER_PAGE,
                            currentPageAppointments * APPOINTMENTS_PER_PAGE
                          )
                          .map((appointment) => (
                            <tr key={appointment.appointment_id}>
                              {appointmentFilter === 'upcoming' && <td>{appointment.dateDisplay}</td>}
                              <td>{appointment.timeDisplay}</td> {/* Use the new timeDisplay */}
                              <td>{appointment.patient_name}</td>
                              <td className="appointment-status">
                                <span className={`status-${(appointment.appointment_state || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                                  {(() => {
                                    const state = appointment.appointment_state || 'pending';
                                    if (state === 'in queue') return 'In Queue';
                                    if (state === 'cancelled') return 'Cancelled';
                                    if (state === 'pending') return 'Pending';
                                    return state.charAt(0).toUpperCase() + state.slice(1);
                                  })()}
                                </span>
                              </td>
                              <td className="appointment-actions">
                                <button
                                  onClick={() => handleCancelAppointment(appointment.appointment_id)}
                                  className="action-btn5 cancel-btn5"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleInQueueAppointment(appointment.appointment_id)}
                                  className="action-btn5 queue-btn5"
                                >
                                  In Queue
                                </button>
                              </td>
                            </tr>
                          ))}
                        {/* Message for no appointments on the current page */}
                        {appointmentsToday.length === 0 && (
                          <tr>
                            <td colSpan={appointmentFilter === 'upcoming' ? "5" : "4"} style={{ textAlign: "center" }}>
                              {appointmentFilter === 'today' ? 'No appointments today.' : 'No upcoming appointments.'}
                            </td>
                          </tr>
                        )}
                        {/* Message if no appointments for the current page slice */}
                        {appointmentsToday.length > 0 &&
                        appointmentsToday.slice(
                          (currentPageAppointments - 1) * APPOINTMENTS_PER_PAGE,
                          currentPageAppointments * APPOINTMENTS_PER_PAGE
                        ).length === 0 && (
                          <tr>
                            <td colSpan={appointmentFilter === 'upcoming' ? "5" : "4"} style={{ textAlign: "center" }}>
                              No appointments on this page.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Pagination Controls */}
                    {appointmentsToday.length > APPOINTMENTS_PER_PAGE && ( // Only show controls if there's more than one page
                      <Pagination
                        currentPage={currentPageAppointments}
                        totalPages={Math.ceil(appointmentsToday.length / APPOINTMENTS_PER_PAGE)}
                        onPageChange={setCurrentPageAppointments}
                        itemsPerPage={APPOINTMENTS_PER_PAGE}
                        totalItems={appointmentsToday.length}
                        showPageInfo={false}
                      />
                    )}
                  </div>
                </div>

                {/* Calendar Section */}
                <div className="dashboard-calendar-section" style={{ marginTop: '20px' }}>
                  <h3>Calendar</h3>
                  <div className="dashboard-appointment-schedule-container">
                    <div className="dashboard-appointment-calendar-container">
                      <Calendar
                        value={calendarDate}
                        onChange={setCalendarDate}
                        tileDisabled={({ date, view }) => {
                          // Disable weekends (Saturday = 6, Sunday = 0)
                          if (view === 'month') {
                            const day = date.getDay();
                            return day === 0 || day === 6;
                          }
                          return false;
                        }}
                        tileClassName={({ date, view }) => {
                          if (view === 'month') {
                            // Check if this date has an appointment - use allAppointments to show all
                            const hasAppointment = allAppointments.some(appointment => {
                              // Parse the appointment date string (YYYY-MM-DD format from substring)
                              const appointmentDateStr = appointment.appointment_datetime.substring(0, 10);
                              const [year, month, day] = appointmentDateStr.split('-').map(Number);
                              
                              // Compare with calendar tile date
                              const matches = (
                                date.getDate() === day &&
                                date.getMonth() === (month - 1) && // Month is 0-indexed in JS
                                date.getFullYear() === year
                              );
                              return matches;
                            });
                            return hasAppointment ? 'dashboard-appointment-date' : null;
                          }
                        }}
                        tileContent={({ date, view }) => {
                          if (view === 'month') {
                            const dayAppointments = allAppointments.filter(appointment => {
                              // Parse the appointment date string (YYYY-MM-DD format from substring)
                              const appointmentDateStr = appointment.appointment_datetime.substring(0, 10);
                              const [year, month, day] = appointmentDateStr.split('-').map(Number);
                              
                              // Compare with calendar tile date
                              return (
                                date.getDate() === day &&
                                date.getMonth() === (month - 1) && // Month is 0-indexed in JS
                                date.getFullYear() === year
                              );
                            });
                            if (dayAppointments.length > 0) {
                              return (
                                <div className="appointment-indicator">
                                  <span className="appointment-count">{dayAppointments.length}</span>
                                </div>
                              );
                            }
                          }
                        }}
                      />
                    </div>
                    
                    {/* Appointment Details List */}
                    <div className="dashboard-appointment-details-list">
                      <h4>
                        {(() => {
                          const now = new Date();
                          const futureAppointments = allAppointments.filter(appointment => 
                            new Date(appointment.appointment_datetime) > now
                          );
                          return futureAppointments.length > 0 ? 'Upcoming Appointments' : 'Recent Appointments';
                        })()}
                      </h4>
                      {(() => {
                        const now = new Date();
                        const futureAppointments = allAppointments.filter(appointment => 
                          new Date(appointment.appointment_datetime) > now
                        );
                        
                        let appointmentsToShow = [];
                        if (futureAppointments.length > 0) {
                          appointmentsToShow = futureAppointments.slice(0, 3);
                        } else {
                          // Show 3 most recent appointments
                          appointmentsToShow = allAppointments
                            .sort((a, b) => new Date(b.appointment_datetime) - new Date(a.appointment_datetime))
                            .slice(0, 3);
                        }
                        
                        if (appointmentsToShow.length > 0) {
                          return (
                            <ul className="dashboard-appointment-list">
                              {appointmentsToShow.map((appointment, idx) => (
                                <li key={idx} className="dashboard-appointment-item">
                                  <div className="dashboard-appointment-date-time">
                                    <strong>{appointment.dateDisplay || formatDateToReadable(appointment.appointment_datetime.split('T')[0])}</strong>
                                    <span className="dashboard-appointment-time">{appointment.timeDisplay || formatTimeTo12Hour(appointment.appointment_datetime.substring(11, 16))}</span>
                                  </div>
                                  <div className="dashboard-appointment-patient">
                                    <strong>Patient:</strong> {appointment.patient_name}
                                  </div>
                                  <div className="dashboard-appointment-notes">
                                    {appointment.notes || 'No notes'}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          );
                        } else {
                          return <p className="no-appointments">No appointments scheduled.</p>;
                        }
                      })()}
                    </div>
                  </div>
                </div>
                  </div>
                </div>
              )}

              {activePage === "create-patient" && (
                <div className="create-patient-section">
                  <div className="create-patient-header">
                    <h2>{editingPatientId ? "Edit Patient Account" : "Create New Patient"}</h2>
                    <button className="close-form-button" onClick={() => setActivePage("dashboard")}>
                      <i className="fas fa-times"></i>
                    </button>
                    
                  </div>
                  

                  <div className="progress-indicator">
                    <div className="steps-container">
                      {steps.map((step, index) => (
                        <React.Fragment key={step}>
                          <div className={`step ${index === currentPatientStep ? "active" : ""} ${index < currentPatientStep ? "completed" : ""}`}>
                            <div className="step-number">
                              <img 
                                src={index <= currentPatientStep ? "./picture/progress.svg" : "./picture/notprogress.svg"} 
                                alt={index <= currentPatientStep ? "Completed" : "Pending"} 
                                style={{ width: '100%', height: '100%' }}
                                onError={(e) => {
                                  console.log('Image failed to load:', e.target.src);
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="step-name">{step}</div>
                          </div>
                          {index < steps.length - 1 && <div className={`progress-line ${index < currentPatientStep ? "completed" : ""}`}></div>}
                        </React.Fragment>
                      ))}
                    </div>
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
                            <label>Contact Number:</label>
                            <input className="patient-input" placeholder="Contact Info" value={patientForm.contactInfo} onChange={(e) => handleInputChange("contactInfo", e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label>Address:</label>
                            <input className="patient-input" placeholder="Address" value={patientForm.address} onChange={(e) => handleInputChange("address", e.target.value)} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Height (cm):</label>
                            <input 
                              className="patient-input" 
                              placeholder="Height in cm" 
                              type="number" 
                              step="1"
                              value={patientForm.patientHeight} 
                              onChange={(e) => handleInputChange("patientHeight", e.target.value)} 
                            />
                          </div>
                          <div className="form-group">
                            <label>Weight (kg):</label>
                            <input 
                              className="patient-input" 
                              placeholder="Weight in kg" 
                              type="number" 
                              step="0.1"
                              value={patientForm.patientWeight} 
                              onChange={(e) => handleInputChange("patientWeight", e.target.value)} 
                            />
                          </div>
                          <div className="form-group">
                            <label>BMI:</label>
                            <input 
                              className="patient-input" 
                              placeholder="BMI" 
                              type="number" 
                              step="0.1"
                              value={patientForm.bmi} 
                              onChange={(e) => handleInputChange("bmi", e.target.value)} 
                            />
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
                            <label>Duration of Diabetes:</label>
                            <input className="patient-input" placeholder="e.g., 5 years" value={patientForm.diabetes_duration} onChange={(e) => handleInputChange("diabetes_duration", e.target.value)} />
                          </div>
                        </div>
                         <div className="medications-table-container">
                          <label>Current Medications:</label>
                          <table className="medications-table">
                            <thead>
                              <tr>
                                <th>Drug Name</th>
                                <th>Dosage</th>
                                <th>Frequency</th>
                                <th>Prescribed by</th>
                              </tr>
                            </thead>
                            <tbody>
                              {medications.map((med, index) => (
                                <tr key={index}>
                                  <td><input type="text" className="med-input" value={med.drugName} onChange={(e) => handleMedicationChange(index, "drugName", e.target.value)} /></td>
                                  <td><input type="text" className="med-input" value={med.dosage} onChange={(e) => handleMedicationChange(index, "dosage", e.target.value)} /></td>
                                  <td><input type="text" className="med-input" value={med.frequency} onChange={(e) => handleMedicationChange(index, "frequency", e.target.value)} /></td>
                                  <td><input type="text" className="med-input" value={med.prescribed_by} onChange={(e) => handleMedicationChange(index, "prescribed_by", e.target.value)} /></td>
                                  <td className="med-actions">
                                    {medications.length > 1 && (
                                      <button type="button" className="remove-med-button" onClick={() => handleRemoveMedication(index)}>
                                        <img src="../picture/minus.svg" alt="Remove" className="icon-button-img" />
                                      </button>
                                    )}
                                    {index === medications.length - 1 && (
                                      <button type="button" className="add-med-button" onClick={handleAddMedication}>
                                        <img src="../picture/add.svg" alt="Add" className="icon-button-img" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
                        <div className="form-row">
                          <div className="form-group checkbox-group">
                            <input type="checkbox" id="family_diabetes" checked={patientForm.family_diabetes} onChange={(e) => handleInputChange("family_diabetes", e.target.checked)} />
                            <label htmlFor="family_diabetes">Family Diabetes</label>
                          </div>
                          <div className="form-group checkbox-group">
                            <input type="checkbox" id="family_hypertension" checked={patientForm.family_hypertension} onChange={(e) => handleInputChange("family_hypertension", e.target.checked)} />
                            <label htmlFor="family_hypertension">Family Hypertension</label>
                          </div>
                          <div className="form-group checkbox-group">
                            <input type="checkbox" id="cardiovascular" checked={patientForm.cardiovascular} onChange={(e) => handleInputChange("cardiovascular", e.target.checked)} />
                            <label htmlFor="cardiovascular">Cardiovascular</label>
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
                          <div className="form-group">
                            <label>Assign Doctor:</label>
                            <select className="doctor-select" value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
                              <option value="">Select Doctor</option>
                              {linkedDoctors.map((doc) => (
                                <option key={doc.doctor_id} value={doc.doctor_id}>{doc.doctor_name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Prepared By:</label>
                            <input className="patient-input" type="text" value={user ? `${user.first_name} ${user.last_name}` : ''} readOnly />
                          </div>
                        </div>
                        
                        <div className="profile-picture-section">
                          <h4>Optional Profile Picture</h4>
                          <div className="profile-picture-upload">
                            <div className="upload-area" >
                              {profilePicture ? (
                                <div className="preview-container">
                                  <img 
                                    src={profilePicture} 
                                    alt="Profile Preview" 
                                    className="profile-preview"
                                    onError={(e) => e.target.src = "../picture/secretary.png"}
                                  />
                                  <button className="change-photo-btn" onClick={() => document.getElementById('profile-picture-input').click()}>
                                    Change Photo
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="upload-icon">
                                    <i className="fas fa-camera"></i>
                                  </div>
                                  <p className="upload-text">
                                    Drop your file here, or <span className="upload-link" onClick={() => document.getElementById('profile-picture-input').click()}>Browse</span>
                                  </p>
                                  <p className="upload-subtext">Max size 10MB</p>
                                </>
                              )}
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="file-input-hidden" 
                                id="profile-picture-input"
                                onChange={handleProfilePictureChange}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

              

                  <div className="form-navigation-buttons">
                    {currentPatientStep === 0 ? (
                      <button className="cancel-button" onClick={() => setActivePage("dashboard")}>Cancel</button>
                    ) : (
                      <button className="previous-step-button" onClick={handlePreviousStep}>Previous</button>
                    )}
                    {currentPatientStep < steps.length - 1 && (
                      <button className="next-step-button" onClick={handleNextStep}>Next</button>
                    )}
                    {currentPatientStep === steps.length - 1 && (
                      <button className="next-step-button" onClick={handleSavePatientWithConfirmation}>
                        {editingPatientId ? "Update Patient" : "Create Patient"}
                      </button>
                    )}
                  </div>
                  {message && <p className="form-message">{message}</p>}
                </div>
              )}


              {activePage === "patient-list" && (
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
                      <img src="../picture/search.svg" alt="Search" className="search-icon" />
                    </div>
                    
                    {/* Risk Classification Filter */}
                    <RiskFilter
                      selectedRisk={selectedRiskFilter}
                      onRiskChange={handleRiskFilterChange}
                      selectedLabStatus={selectedLabStatusFilter}
                      onLabStatusChange={handleLabStatusFilterChange}
                      selectedProfileStatus={selectedProfileStatusFilter}
                      onProfileStatusChange={handleProfileStatusFilterChange}
                      sortOrder={sortOrder}
                      onSortOrderChange={handleSortOrderChange}
                      showCounts={true}
                      counts={patientRiskCounts}
                      labStatusCounts={patientLabStatusCounts}
                      profileStatusCounts={patientProfileStatusCounts}
                    />
                  </div>
                  <table className="patient-table">
                    <thead>
                      <tr>
                      <th>Patient Name</th>
                      <th>Age</th>
                      <th>Sex</th>
                      <th>Classification</th>
                      <th>Lab Status</th>
                      <th>Profile Status</th>
                      <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPatients.map.length > 0 ? (
                        paginatedPatients.map((pat) => (
                          <tr key={pat.patient_id}>
                            <td className="patient-name-cell">
                              <div className="patient-name-container">
                                <img 
                                  src={pat.patient_picture || "../picture/secretary.png"} 
                                  alt="Patient Avatar" 
                                  className="patient-avatar-table"
                                  onError={(e) => e.target.src = "../picture/secretary.png"}
                                />
                                <span className="patient-name-text">{pat.first_name} {pat.last_name}</span>
                              </div>
                            </td>
                            <td>{pat.date_of_birth ? Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A'}</td>
                            <td>{pat.gender || 'N/A'}</td>
                            <td className={`classification-cell ${
                              pat.lab_status === '❌Awaiting' ? 'classification-awaiting' :
                              ((pat.risk_classification || '').toLowerCase() === 'low' ? 'classification-low' :
                              (pat.risk_classification || '').toLowerCase() === 'moderate' ? 'classification-moderate' :
                              (pat.risk_classification || '').toLowerCase() === 'high' ? 'classification-high' :
                              (pat.risk_classification || '').toLowerCase() === 'ppd' ? 'classification-ppd' : '')
                            }`}>
                              {getClassificationDisplay(pat)}
                            </td>
                            <td className={
                            pat.lab_status === '✅Submitted' ? 'lab-status-complete' :
                            pat.lab_status === '❌Awaiting' ? 'lab-status-awaiting' : // Add this if you want pending to have a specific style
                            ''
                          }>
                            {pat.lab_status || '❌Awaiting'}
                          </td>
                          <td className={pat.profile_status === 'Finalized' ? 'status-complete' : 'status-incomplete'}>
                            {pat.profile_status}
                          </td>
                            <td className="patient-actions-cell">
                              {/* Enter Labs button to go to lab result entry */}
                              <button className="enter-labs-button" onClick={() => {
                                setLabResults(prev => ({ ...prev, selectedPatientForLab: pat }));
                                setLabEntryStep(2);
                                setActivePage("lab-result-entry");
                              }}>🧪 Enter Labs</button>
                              {/* View button to view patient details */}
                              <button className="view-button" onClick={() => handleViewPatientDetails(pat)}>👁️ View</button>
                            </td>
                          </tr>
                          
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7">No patients found.</td> {/* Updated colspan to 7 */}
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Message display for patient list */}
                  {message && <p className="form-message">{message}</p>}

                  {/* Pagination */}
                  {filteredPatients.length > PATIENTS_PER_PAGE && (
                    <Pagination
                      currentPage={currentPagePatients}
                      totalPages={totalPatientPages}
                      onPageChange={setCurrentPagePatients}
                      itemsPerPage={PATIENTS_PER_PAGE}
                      totalItems={filteredPatients.length}
                    />
                  )}
                </div>
              )}

              {/* Patient Detail View Section */}
              {activePage === "patient-detail-view" && selectedPatientForDetail && (
                <div className="patient-detail-view-section">
                    <div className="detail-view-header">
                        <button className="back-to-list-button" onClick={handleClosePatientDetailModal}>
                            <img src="../picture/back.png" alt="Back" className="icon-button-img" /> Back to List
                        </button>
                        <div className="patient-details-header-row">
                            <h2>Patient Details</h2>
                            <div className="patient-details-header-buttons">
                                <button className="update-patient-button" onClick={handleOpenDemographicsEdit}>
                                    <img src="../picture/edit.png" alt="Update" className="icon-button-img" /> Update Patient
                                </button>
                                <button className="export-pdf-button" onClick={() => {
                                    // Export PDF functionality - will print and allow saving
                                    window.print();
                                }}>
                                    <img src="../picture/upload.png" alt="Export" className="icon-button-img" /> Export PDF
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="patient-details-content-container">
                        <div className="patient-details-left-column">
                            {/* Basic Patient Information Section */}
                            <div className="patient-basic-info-section">
                                <div className="patient-info-container">
                                    <div className="patient-avatar-container">
                                        <img 
                                            src={selectedPatientForDetail?.patient_picture || "../picture/secretary.png"} 
                                            alt="Patient Avatar" 
                                            className="patient-avatar-large"
                                            onError={(e) => e.target.src = "../picture/secretary.png"}
                                        />
                                        <div className={`patient-phase-badge ${
                                            selectedPatientForDetail.phase === 'Post-Op' || selectedPatientForDetail.phase === 'Post-Operative' ? 'post-operative' :
                                            selectedPatientForDetail.phase === 'Pre-Op' || selectedPatientForDetail.phase === 'Pre-Operative' ? 'pre-operative' :
                                            'default'
                                        }`}>
                                            {selectedPatientForDetail.phase === 'Post-Op' || selectedPatientForDetail.phase === 'Post-Operative' ? 'Post-operative' : 
                                             selectedPatientForDetail.phase === 'Pre-Op' || selectedPatientForDetail.phase === 'Pre-Operative' ? 'Pre-operative' : 
                                             selectedPatientForDetail.phase || 'N/A'}
                                        </div>
                                    </div>
                                    <div className="patient-info-details">
                                        <div className="patient-name-section">
                                            <h2 className="patient-name-display">
                                                {selectedPatientForDetail.first_name} {selectedPatientForDetail.middle_name ? selectedPatientForDetail.middle_name + ' ' : ''}{selectedPatientForDetail.last_name}
                                            </h2>
                                        </div>
                                        <div className="patient-details-grid">
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Diabetes Type:</span>
                                                <span className="detail-value">{selectedPatientForDetail.diabetes_type || 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Duration of Diabetes:</span>
                                                <span className="detail-value">{selectedPatientForDetail.diabetes_duration || 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Phone:</span>
                                                <span className="detail-value">{selectedPatientForDetail.contact_info || 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Gender:</span>
                                                <span className="detail-value">{selectedPatientForDetail.gender || 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Age:</span>
                                                <span className="detail-value">
                                                    {selectedPatientForDetail.date_of_birth 
                                                        ? new Date().getFullYear() - new Date(selectedPatientForDetail.date_of_birth).getFullYear() 
                                                        : 'N/A'}
                                                </span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Height:</span>
                                                <span className="detail-value">{selectedPatientForDetail.patient_height ? `${selectedPatientForDetail.patient_height} cm` : 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Weight:</span>
                                                <span className="detail-value">{selectedPatientForDetail.patient_weight ? `${selectedPatientForDetail.patient_weight} kg` : 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">BMI:</span>
                                                <span className="detail-value">{selectedPatientForDetail.BMI || 'N/A'}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Hypertensive:</span>
                                                <span className="detail-value">{selectedPatientForDetail.complication_history?.includes("Hypertensive") ? "Yes" : "No"}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Heart Disease:</span>
                                                <span className="detail-value">{selectedPatientForDetail.complication_history?.includes("Heart Attack") ? "Yes" : "None"}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Smoking History:</span>
                                                <span className="detail-value">{selectedPatientForDetail.smoking_status || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Laboratory Result Section */}
                            <div className="laboratory-results-section">
                                <h3>Laboratory Results (Latest)</h3>
                                <p><strong>Date Submitted:</strong> {formatDateToReadable(lastLabDate)}</p>
                                <p><strong>Hba1c:</strong> {patientLabResults.Hba1c}</p>
                                <p><strong>UCR:</strong> {patientLabResults.UCR}</p>
                                <p><strong>GOT (AST):</strong> {patientLabResults.gotAst}</p>
                                <p><strong>GPT (ALT):</strong> {patientLabResults.gptAlt}</p>
                                <p><strong>Cholesterol:</strong> {patientLabResults.cholesterol}</p>
                                <p><strong>Triglycerides:</strong> {patientLabResults.triglycerides}</p>
                                <p><strong>HDL Cholesterol:</strong> {patientLabResults.hdlCholesterol}</p>
                                <p><strong>LDL Cholesterol:</strong> {patientLabResults.ldlCholesterol}</p>
                                <p><strong>UREA:</strong> {patientLabResults.UREA}</p>
                                <p><strong>BUN:</strong> {patientLabResults.BUN}</p>
                                <p><strong>URIC:</strong> {patientLabResults.URIC}</p>
                                <p><strong>EGFR:</strong> {patientLabResults.EGFR}</p>
                            </div>
                            
                            {/* Latest Health Metrics Section */}
                            <div className="latest-health-metrics-section">
                                <h3>Latest Health Metrics</h3>
                                <p><strong>Blood Glucose Level:</strong> {patientHealthMetrics.bloodGlucoseLevel} {patientHealthMetrics.bloodGlucoseLevel !== 'N/A' && patientHealthMetrics.bloodGlucoseLevel !== 'Error' ? 'mg/dL' : ''}</p>
                                <p><strong>Blood Pressure:</strong> {patientHealthMetrics.bloodPressure} {patientHealthMetrics.bloodPressure !== 'N/A' && patientHealthMetrics.bloodPressure !== 'Error' ? 'mmHg' : ''}</p>
                                <p><strong>Risk Classification:</strong> {selectedPatientForDetail.risk_classification || 'N/A'}</p>
                            </div>

                            {/* History Charts Section - Updated structure */}
                            <div className="history-charts-section">
                              <h3>History Charts</h3>
                              
                              {/* Blood Glucose Chart - Separate div */}
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
                                          gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)'); // Green with opacity
                                          gradient.addColorStop(1, 'rgba(34, 197, 94, 0.1)'); // Light green at bottom
                                          return gradient;
                                        },
                                        borderColor: '#22c55e', // Green border
                                        borderWidth: 2,
                                        pointBackgroundColor: '#22c55e',
                                        pointBorderColor: '#fff',
                                        pointBorderWidth: 2,
                                        pointRadius: 4,
                                        pointHoverRadius: 6,
                                        tension: 0.4, // Smooth line curves
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
                                      <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                                        Total metrics available: {allPatientHealthMetrics.length}<br/>
                                        Filtered for {glucoseTimeFilter}: {glucoseFilteredMetrics.length}<br/>
                                        {allPatientHealthMetrics.length > 0 && (
                                          <>Latest entry: {new Date(allPatientHealthMetrics[allPatientHealthMetrics.length - 1]?.submission_date).toLocaleString()}</>
                                        )}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Blood Pressure Chart - Separate div */}
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
                                          backgroundColor: 'rgba(134, 239, 172, 0.8)', // Light green for diastolic
                                          borderColor: 'rgba(134, 239, 172, 1)',
                                          borderWidth: 1,
                                          barThickness: 15, // Made thinner - reduced from 25
                                          borderRadius: {
                                            topLeft: 0,
                                            topRight: 0,
                                            bottomLeft: 15, // Increased border radius for more rounded corners
                                            bottomRight: 15
                                          },
                                          borderSkipped: false,
                                        },
                                        {
                                          label: 'Systolic',
                                          data: bpFilteredMetrics.map(entry => parseFloat(entry.bp_systolic) || 0),
                                          backgroundColor: 'rgba(34, 197, 94, 0.8)', // Dark green for systolic
                                          borderColor: 'rgba(34, 197, 94, 1)',
                                          borderWidth: 1,
                                          barThickness: 15, // Made thinner - reduced from 25
                                          borderRadius: {
                                            topLeft: 15, // Increased border radius for more rounded corners
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
                                            display: true
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
                                      <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                                        Total metrics available: {allPatientHealthMetrics.length}<br/>
                                        Filtered for {bpTimeFilter}: {bpFilteredMetrics.length}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Risk Classification History Chart - New */}
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
                                
                                {/* Risk Classification Legend */}
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
                                            if (risk === 'low' || risk === 'low risk') return 2;
                                            if (risk === 'moderate' || risk === 'moderate risk') return 3;
                                            if (risk === 'high' || risk === 'high risk') return 4;
                                            if (risk === 'ppd') return 1;
                                            return 1; // For unknown/null values
                                          }),
                                          backgroundColor: riskFilteredMetrics.map(entry => {
                                            const risk = entry.risk_classification?.toLowerCase();
                                            if (risk === 'low' || risk === 'low risk') return 'rgba(34, 197, 94, 0.8)'; // Green
                                            if (risk === 'moderate' || risk === 'moderate risk') return 'rgba(255, 193, 7, 0.8)'; // Yellow
                                            if (risk === 'high' || risk === 'high risk') return 'rgba(244, 67, 54, 0.8)'; // Red
                                            if (risk === 'ppd') return 'rgba(103, 101, 105, 0.8)'; // Purple
                                            return 'rgba(156, 163, 175, 0.8)'; // Gray for unknown
                                          }),
                                          borderColor: riskFilteredMetrics.map(entry => {
                                            const risk = entry.risk_classification?.toLowerCase();
                                            if (risk === 'low' || risk === 'low risk') return 'rgba(34, 197, 94, 1)';
                                            if (risk === 'moderate' || risk === 'moderate risk') return 'rgba(255, 193, 7, 1)';
                                            if (risk === 'high' || risk === 'high risk') return 'rgba(244, 67, 54, 1)';
                                            if (risk === 'ppd') return 'rgba(103, 101, 105, 1)'; // Purple
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
                                          display: false, // Hide legend since colors are self-explanatory
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
                                              const labels = {
                                                1: 'PPD',
                                                2: 'Low',
                                                3: 'Moderate',
                                                4: 'High'
                                              };
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
                                      <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                                        Total metrics available: {allPatientHealthMetrics.length}<br/>
                                        Filtered for {riskTimeFilter}: {riskFilteredMetrics.length}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Risk Score Over Time Chart */}
                              <div className="blood-glucose-chart-container">
                                <div className="chart-header">
                                  <h4>Risk Score Over Time</h4>
                                  <div className="time-filter-buttons">
                                    <button 
                                      className={`time-filter-btn ${riskScoreTimeFilter === 'day' ? 'active' : ''}`}
                                      onClick={() => setRiskScoreTimeFilter('day')}
                                    >
                                      Day
                                    </button>
                                    <button 
                                      className={`time-filter-btn ${riskScoreTimeFilter === 'week' ? 'active' : ''}`}
                                      onClick={() => setRiskScoreTimeFilter('week')}
                                    >
                                      Week
                                    </button>
                                    <button 
                                      className={`time-filter-btn ${riskScoreTimeFilter === 'month' ? 'active' : ''}`}
                                      onClick={() => setRiskScoreTimeFilter('month')}
                                    >
                                      Month
                                    </button>
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
                                                return `Risk Score: ${context.raw}/100`;
                                              }
                                            }
                                          }
                                        },
                                        scales: {
                                          y: {
                                            beginAtZero: true,
                                            title: {
                                              display: true,
                                              text: 'Risk Score',
                                              font: {
                                                size: 12,
                                                weight: 'bold'
                                              }
                                            },
                                            min: 0,
                                            max: 100,
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
                                      <p>No risk score data available for selected time period</p>
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
                                                {selectedPatientForDetail.doctors 
                                                    ? `${selectedPatientForDetail.doctors.first_name} ${selectedPatientForDetail.doctors.last_name}` 
                                                    : 'Alex Bulquiren'}
                                            </h4>
                                            <p className="doctor-specialty">
                                                {selectedPatientForDetail.doctors?.specialization || 'General Surgeon'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Assigned Specialists Cards */}
                                    {currentPatientSpecialists.length > 0 ? (
                                        currentPatientSpecialists.map((specialist, index) => (
                                            <div key={specialist.id} className="doctor-card specialist-card">
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
                                
                                <button className="edit-doctors-button" onClick={() => handleEditSpecialist(selectedPatientForDetail)}>
                                    Edit Assignments
                                </button>
                            </div>
                            
                            {/* Current Medications Section */}
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
                                            <td><input type="text" className="med-input" value={med.medication_frequencies && med.medication_frequencies.length > 0 ? med.medication_frequencies.map(f => `${f.frequency}`).join(', ') : ''} readOnly /></td>
                                            <td><input type="text" className="med-input" value={(med.doctors && med.doctors.first_name) ? `${med.doctors.first_name} ${med.doctors.last_name}` : ''} readOnly /></td>
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
                            
                           

                            {/* Health Metrics History Table */}
                            <div className="health-metrics-history-section">
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
                                                const dateStr = submissionDate.toLocaleDateString('en-US', { 
                                                    month: 'short', 
                                                    day: 'numeric', 
                                                    year: 'numeric' 
                                                });
                                                const timeStr = submissionDate.toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true
                                                });
                                                return (
                                                    <tr key={index}>
                                                        <td>{`${dateStr}, ${timeStr}`}</td>
                                                        <td>{metric.blood_glucose || 'N/A'}</td>
                                                        <td>
                                                            {metric.bp_systolic !== null && metric.bp_diastolic !== null
                                                                ? `${metric.bp_systolic}/${metric.bp_diastolic}`
                                                                : 'N/A'}
                                                        </td>
                                                        <td className="metric-value">
                                                            {metric.risk_score || 'N/A'}
                                                        </td>
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
                                
                                {/* Health Metrics Pagination */}
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
                             {/* Appointment Schedule Section */}
                            <div className="appointment-schedule-section">
                                <h3>Appointment Schedule</h3>
                                <div className="appointment-schedule-container">
                                  <div className="appointment-calendar-container">
                                    <Calendar
                                      value={new Date()}
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
                                          return hasAppointment ? 'appointment-date' : null;
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
                                  <div className="appointment-details-list">
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
                                          <ul className="appointment-list">
                                            {appointmentsToShow.map((appointment, idx) => (
                                              <li key={idx} className="appointment-item">
                                                <div className="appointment-date-time">
                                                  <strong>{formatDateToReadable(appointment.appointment_datetime.split('T')[0])}</strong>
                                                  <span className="appointment-time">{formatTimeTo12Hour(appointment.appointment_datetime.substring(11, 16))}</span>
                                                </div>
                                                <div className="appointment-notes">
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
                    
                    {/* Wound Gallery Section */}
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
                                                <img src="../picture/expand.svg" alt="Expand" className="icon-button-img" />
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
                                                    <span className="submitter-text">by</span> {selectedPatientForDetail.first_name} {selectedPatientForDetail.last_name}
                                                </span>
                                            </div>
                                            
                                            <div className="photo-actions">
                                                <button className="entry-btn">Entry ID: 00{allWoundPhotos.length - index}</button>
                                                <button 
                                                    className="view-details-btn"
                                                    onClick={() => handleViewWoundAnalysis(photo)}
                                                >
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
                </div>
              )}

{/* ... rest of the patient details ...*/}
              {/* Specialist Assignment Section */}
              {activePage === "specialist-assignment" && patientForSpecialistAssignment && (
                <div className="specialist-assignment-section">
                  <div className="specialist-assignment-header">
                    <h2>Assign Specialist to {patientForSpecialistAssignment.first_name} {patientForSpecialistAssignment.last_name}</h2>
                  </div>

                  <div className="specialist-assignment-content">
                    {/* Current Specialists Section */}
                    <div className="current-specialists-section">
                      <h3>Currently Assigned Specialists</h3>
                      {currentPatientSpecialists.length > 0 ? (
                        <table className="specialists-table">
                          <thead>
                            <tr>
                              <th>Specialist Name</th>
                              <th>Specialization</th>
                              <th>Assigned Date</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentPatientSpecialists.map((specialist) => (
                              <tr key={specialist.id}>
                                <td>
                                  {specialist.doctors 
                                    ? `${specialist.doctors.first_name} ${specialist.doctors.last_name}` 
                                    : 'Unknown Doctor'}
                                </td>
                                <td>{specialist.doctors?.specialization || 'General'}</td>
                                <td>{formatDateToReadable(specialist.assigned_at)}</td>
                                <td>
                                  <button 
                                    className="remove-specialist-button"
                                    onClick={() => handleRemoveSpecialist(specialist.id)}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="no-specialists-message">No specialists currently assigned to this patient.</p>
                      )}
                    </div>

                    {/* Add New Specialist Section */}
                    <div className="add-specialist-section">
                      <h3>Assign New Specialist</h3>
                      <div className="specialist-selection-form">
                        <div className="form-group">
                          <label>Select Specialist:</label>
                          <select 
                            value={selectedSpecialistId} 
                            onChange={(e) => setSelectedSpecialistId(e.target.value)}
                            className="specialist-dropdown"
                          >
                            <option value="">Select a specialist...</option>
                            {availableSpecialists.map((doctor) => (
                              <option key={doctor.doctor_id} value={doctor.doctor_id}>
                                {doctor.first_name} {doctor.last_name} {doctor.specialization && `(${doctor.specialization})`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button 
                          className="assign-specialist-button"
                          onClick={handleAssignSpecialist}
                          disabled={!selectedSpecialistId}
                        >
                          Assign Specialist
                        </button>
                      </div>
                    </div>
                  </div>

                  {message && <p className="form-message">{message}</p>}

                  <div className="specialist-assignment-buttons">
                    <button className="cancel-button" onClick={handleCancelSpecialistAssignment}>
                      Cancel
                    </button>
                    <button className="done-button" onClick={handleDoneSpecialistAssignment}>
                      Done
                    </button>
                  </div>
                </div>
              )}

              {activePage === "appointments" && (
                <div className="appointments-section">
                  <h2>{editingAppointmentId ? "Edit Appointment" : "Schedule New Appointment"}</h2>

                  <div className="form-columns"> {/* New wrapper for two-column layout */}
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
                  </div> {/* End of form-columns wrapper */}

                  <div className="form-group full-width"> {/* Added full-width class here */}
                    <label>Notes:</label>
                    <textarea placeholder="Notes" value={appointmentForm.notes} onChange={(e) => handleAppointmentChange("notes", e.target.value)} />
                  </div>

                  <div className="button-group"> {/* New wrapper for buttons */}
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
                  </div> {/* End of button-group wrapper */}

                  {message && <p className="form-message">{message}</p>}
                </div>
              )}

              {activePage === "lab-result-entry" && (
                <>
                  <div className="lab-result-entry-section">
                    <h2>Enter Patient Lab Results</h2>
                    <p>
                      Input the patient's baseline laboratory values to support risk classification and care planning.
                    </p>
                    <p>
                      Once submitted, values will be locked for data integrity.
                    </p>

                    <div className="lab-stepper">
                      <div className={`step ${labEntryStep >= 1 ? "completed" : ""} ${labEntryStep === 1 ? "active" : ""}`}>
                        <div className="step-number">
                          <img 
                            src={labEntryStep >= 1 ? "./picture/progress.svg" : "./picture/notprogress.svg"} 
                            alt={labEntryStep >= 1 ? "Completed" : "Pending"} 
                            style={{ width: '100%', height: '100%' }}
                            onError={(e) => {
                              console.log('Lab stepper image failed to load:', e.target.src);
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="step-label">Search Patient</div>
                      </div>
                      <div className="divider"></div>
                      <div className={`step ${labEntryStep >= 2 ? "completed" : ""} ${labEntryStep === 2 ? "active" : ""}`}>
                        <div className="step-number">
                          <img 
                            src={labEntryStep >= 2 ? "./picture/progress.svg" : "./picture/notprogress.svg"} 
                            alt={labEntryStep >= 2 ? "Completed" : "Pending"} 
                            style={{ width: '100%', height: '100%' }}
                            onError={(e) => {
                              console.log('Lab stepper image failed to load:', e.target.src);
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="step-label">Lab Input Form</div>
                      </div>
                      <div className="divider"></div>
                      <div className={`step ${labEntryStep >= 3 ? "completed" : ""} ${labEntryStep === 3 ? "active" : ""}`}>
                        <div className="step-number">
                          <img 
                            src={labEntryStep >= 3 ? "./picture/progress.svg" : "./picture/notprogress.svg"} 
                            alt={labEntryStep >= 3 ? "Completed" : "Pending"} 
                            style={{ width: '100%', height: '100%' }}
                            onError={(e) => {
                              console.log('Lab stepper image failed to load:', e.target.src);
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="step-label">Lock-in Data</div>
                      </div>
                    </div>


                    {/* Step 1: Patient Search */}
                    {labEntryStep === 1 && (
                    <div className="lab-step-content">
                      <div className="lab-patient-search-header">
                        <h3>Patient List</h3>
                        <div className="search-and-filter-row">
                          <div className="search-bar">
                            <input
                              type="text"
                              placeholder="Search patients by name..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="patient-search-input"
                            />
                            <img src="../picture/search.svg" alt="Search" className="search-icon" />
                          </div>
                          
                          {/* Risk Classification Filter for Lab Entry */}
                          <RiskFilter
                            selectedRisk={selectedLabRiskFilter}
                            onRiskChange={handleLabRiskFilterChange}
                            selectedLabStatus={selectedLabEntryLabStatusFilter}
                            onLabStatusChange={handleLabEntryLabStatusFilterChange}
                            selectedProfileStatus={selectedLabEntryProfileStatusFilter}
                            onProfileStatusChange={handleLabEntryProfileStatusFilterChange}
                            sortOrder={labEntrySortOrder}
                            onSortOrderChange={handleLabEntrySortOrderChange}
                            showCounts={true}
                            counts={labSearchRiskCounts}
                            labStatusCounts={labSearchLabStatusCounts}
                            profileStatusCounts={labSearchProfileStatusCounts}
                          />
                        </div>
                      </div>
                        <table className="patient-table">
                          <thead>
                            <tr>
                              <th>Patient Name</th>
                              <th>Age</th>
                              <th>Sex</th>
                              <th>Classification</th>
                              <th>Lab Status</th>
                              <th>Profile Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Use paginatedLabSearchPatients here */}
                            {paginatedLabSearchPatients.length > 0 ? (
                              paginatedLabSearchPatients.map((pat) => (
                                <tr key={pat.patient_id}>
                                  <td className="patient-name-cell">
                                    <div className="patient-name-container">
                                      <img 
                                        src={pat.patient_picture || "../picture/secretary.png"} 
                                        alt="Patient Avatar" 
                                        className="patient-avatar-table"
                                        onError={(e) => e.target.src = "../picture/secretary.png"}
                                      />
                                      <span className="patient-name-text">{pat.first_name} {pat.last_name}</span>
                                    </div>
                                  </td>
                                  <td>{pat.date_of_birth ? Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A'}</td>
                                  <td>{pat.gender || 'N/A'}</td>
                                  <td className={`classification-cell ${
                                    pat.lab_status === '❌Awaiting' ? 'classification-awaiting' :
                                    ((pat.risk_classification || '').toLowerCase() === 'low' ? 'classification-low' :
                                    (pat.risk_classification || '').toLowerCase() === 'moderate' ? 'classification-moderate' :
                                    (pat.risk_classification || '').toLowerCase() === 'high' ? 'classification-high' :
                                    (pat.risk_classification || '').toLowerCase() === 'ppd' ? 'classification-ppd' : '')
                                  }`}>
                                    {getClassificationDisplay(pat)}
                                  </td>
                                  <td className={
                                    pat.lab_status === '✅Submitted' ? 'lab-status-submitted' :
                                    pat.lab_status === 'Pending' ? 'lab-status-pending' :
                                    pat.lab_status === 'N/A' ? 'lab-status-na' :
                                    '' }> {pat.lab_status === '❌Awaiting' ? '❌Awaiting' : pat.lab_status || 'N/A'}
                                  </td>
                                  <td className={pat.profile_status === 'Finalized' ? 'status-finalized' : 'status-pending'}>
                                    {pat.profile_status}
                                  </td>
                                  <td>
                                    <div className="lab-actions-buttons">
                                      <button className="enter-labs-button" onClick={() => handleSelectPatientForLab(pat)}>
                                        {pat.lab_status === '✅Submitted' ? '🔄 Update': '🧪 Enter Labs'}
                                      </button>
                                      <button className="view-labs-button" onClick={() => handleViewPatientLabDetails(pat)}>
                                        👁️View
                                      </button>
                                    </div>
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

                        {/* Add Pagination Controls for this patient search table */}
                        {filteredLabSearchPatients.length > LAB_SEARCH_PATIENTS_PER_PAGE && (
                          <Pagination
                            currentPage={currentPageLabSearchPatients}
                            totalPages={totalLabSearchPatientPages}
                            onPageChange={setCurrentPageLabSearchPatients}
                            itemsPerPage={LAB_SEARCH_PATIENTS_PER_PAGE}
                            totalItems={filteredLabSearchPatients.length}
                          />
                        )}
                      </div>
                    )}

                    {/* Step 2: Lab Input Form */}
                    {labEntryStep === 2 && (
                      <div className="lab-step-content">
                        <h3>Enter Lab Results for {labResults.selectedPatientForLab?.first_name} {labResults.selectedPatientForLab?.last_name}</h3>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Date Submitted:</label>
                            <input
                              type="date"
                              value={labResults.dateSubmitted}
                              onChange={(e) => handleLabInputChange("dateSubmitted", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>HbA1c (%):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 7.0"
                              value={labResults.Hba1c}
                              onChange={(e) => handleLabInputChange("Hba1c", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>UCR (mg/dL):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 0.8"
                              value={labResults.UCR}
                              onChange={(e) => handleLabInputChange("UCR", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>GOT (AST) (U/L):</label>
                            <input
                              type="number"
                              placeholder="e.g., 25"
                              value={labResults.gotAst}
                              onChange={(e) => handleLabInputChange("gotAst", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>GPT (ALT) (U/L):</label>
                            <input
                              type="number"
                              placeholder="e.g., 30"
                              value={labResults.gptAlt}
                              onChange={(e) => handleLabInputChange("gptAlt", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>Cholesterol (mg/dL):</label>
                            <input
                              type="number"
                              placeholder="e.g., 200"
                              value={labResults.cholesterol}
                              onChange={(e) => handleLabInputChange("cholesterol", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Triglycerides (mg/dL):</label>
                            <input
                              type="number"
                              placeholder="e.g., 150"
                              value={labResults.triglycerides}
                              onChange={(e) => handleLabInputChange("triglycerides", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>HDL Cholesterol (mg/dL):</label>
                            <input
                              type="number"
                              placeholder="e.g., 50"
                              value={labResults.hdlCholesterol}
                              onChange={(e) => handleLabInputChange("hdlCholesterol", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>LDL Cholesterol (mg/dL):</label>
                            <input
                              type="number"
                              placeholder="e.g., 100"
                              value={labResults.ldlCholesterol}
                              onChange={(e) => handleLabInputChange("ldlCholesterol", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>UREA (mg/dL):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 20"
                              value={labResults.UREA}
                              onChange={(e) => handleLabInputChange("UREA", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>BUN (mg/dL):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 15"
                              value={labResults.BUN}
                              onChange={(e) => handleLabInputChange("BUN", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>URIC (mg/dL):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 5"
                              value={labResults.URIC}
                              onChange={(e) => handleLabInputChange("URIC", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>EGFR (mL/min/1.73m²):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 90"
                              value={labResults.EGFR}
                              onChange={(e) => handleLabInputChange("EGFR", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="lab-navigation-buttons">
                          <button className="previous-step-button" onClick={() => setLabEntryStep(1)}>Back</button>
                          <button className="next-step-button" onClick={() => setLabEntryStep(3)}>Review & Finalize</button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Review & Finalize */}
                    {labEntryStep === 3 && (
                      <div className="lab-step-content review-step">
                        <h3>Review Lab Results for {labResults.selectedPatientForLab?.first_name} {labResults.selectedPatientForLab?.last_name}</h3>
                        <div className="review-details">
                          <p><strong>Date Submitted:</strong> {labResults.dateSubmitted}</p>
                          <p><strong>HbA1c:</strong> {labResults.Hba1c} %</p>
                          <p><strong>UCR:</strong> {labResults.UCR} mg/dL</p>
                          <p><strong>GOT (AST):</strong> {labResults.gotAst} U/L</p>
                          <p><strong>GPT (ALT):</strong> {labResults.gptAlt} U/L</p>
                          <p><strong>Cholesterol:</strong> {labResults.cholesterol} mg/dL</p>
                          <p><strong>Triglycerides:</strong> {labResults.triglycerides} mg/dL</p>
                          <p><strong>HDL Cholesterol:</strong> {labResults.hdlCholesterol} mg/dL</p>
                          <p><strong>LDL Cholesterol:</strong> {labResults.ldlCholesterol} mg/dL</p>
                          <p><strong>UREA:</strong> {labResults.UREA} mg/dL</p>
                          <p><strong>BUN:</strong> {labResults.BUN} mg/dL</p>
                          <p><strong>URIC:</strong> {labResults.URIC} mg/dL</p>
                          <p><strong>EGFR:</strong> {labResults.EGFR} mL/min/1.73m²</p>
                        </div>
                        <p className="final-warning">
                          <i className="fas fa-exclamation-triangle"></i> Once finalized, these lab results cannot be edited. Please ensure all data is accurate.
                        </p>
                        <div className="lab-navigation-buttons">
                          <button className="previous-step-button" onClick={() => setLabEntryStep(2)}>Go Back to Edit</button>
                          <button className="next-step-button" onClick={handleFinalizeLabSubmission}>Finalize Submission</button>
                        </div>
                      </div>
                    )}

                    {message && <p className="form-message">{message}</p>}

                  </div>

                  {/* Success Modal */}
                  {showSuccessModal && (
                    <div className="modal-backdrop">
                      <div className="modal-content success-modal">
                        <img src="../picture/labentry.png" alt="Lab Entry Success" className="success-icon" />
                        <div className="modal-text-content">
                          <h2 className="modal-title">Lab Results Successfully Submitted & Locked</h2>
                          <p className="modal-subtext">
                            The laboratory data has been securely stored and is now locked for editing to ensure accuracy and audit compliance. 
                          </p>
                          <p className="modal-subtext">You may now proceed to finalize the patient profile with the attending doctor.</p>
                          <button className="modal-green-button" onClick={() => {
                            setShowSuccessModal(false);
                            setLabEntryStep(1); // Reset to step 1 (patient search)
                            setActivePage("dashboard"); // Optionally navigate to dashboard or patient list
                          }}>
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* New Lab Details View Section */}
              {activePage === "lab-details-view" && selectedPatientForLabView && (
                <div className="lab-details-view-section patient-detail-view-section"> {/* Reuse patient-detail-view-section for consistent styling */}
                  <div className="detail-view-header">
                    <h2>Lab Results History for {selectedPatientForLabView.first_name} {selectedPatientForLabView.last_name}</h2>
                    <button className="back-to-list-button" onClick={handleCloseLabDetailsView}>
                      <img src="../picture/back.png" alt="Back" className="button-icon back-icon" /> Back to Lab Entry
                    </button>
                  </div>
                  <div className="lab-history-table-container">
                    <table className="patient-table"> {/* Reuse patient-table for styling */}
                      <thead>
                        <tr>
                          <th>Date Submitted</th>
                          <th>HbA1c (%)</th>
                          <th>UCR (mg/dL)</th>
                          <th>GOT (AST) (U/L)</th>
                          <th>GPT (ALT) (U/L)</th>
                          <th>Cholesterol (mg/dL)</th>
                          <th>Triglycerides (mg/dL)</th>
                          <th>HDL (mg/dL)</th>
                          <th>LDL (mg/dL)</th>
                          <th>UREA (mg/dL)</th>
                          <th>BUN (mg/dL)</th>
                          <th>URIC (mg/dL)</th>
                          <th>EGFR (mL/min/1.73m²)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPatientLabResultsHistory.length > 0 ? (
                          allPatientLabResultsHistory.map((labEntry, index) => (
                            <tr key={index}>
                              <td>{formatDateToReadable(labEntry.date_submitted)}</td>
                              <td>{labEntry.Hba1c || 'N/A'}</td>
                              <td>{labEntry.ucr || 'N/A'}</td>
                              <td>{labEntry.got_ast || 'N/A'}</td>
                              <td>{labEntry.gpt_alt || 'N/A'}</td>
                              <td>{labEntry.cholesterol || 'N/A'}</td>
                              <td>{labEntry.triglycerides || 'N/A'}</td>
                              <td>{labEntry.hdl_cholesterol || 'N/A'}</td>
                              <td>{labEntry.ldl_cholesterol || 'N/A'}</td>
                              <td>{labEntry.urea || 'N/A'}</td>
                              <td>{labEntry.bun || 'N/A'}</td>
                              <td>{labEntry.uric || 'N/A'}</td>
                              <td>{labEntry.egfr || 'N/A'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="9">No lab results history available for this patient.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


              {showPatientConfirmationModal && (
                  <div className="modal-backdrop">
                    <div className="modal-content confirmation-modal">
                      <img src="../picture/confirm.png" alt="Confirmation Image" className="confirmation-icon" />
                      <div className="modal-text-content">
                        <h2 className="modal-title"> Finalize Patient Profile?</h2>
                        <p className="modal-subtext">
                          The laboratory data has been securely stored and is now locked for editing to ensure accuracy and audit compliance.
                          You may now proceed to finalize the patient profile with the attending doctor..
                          <br /><br />
                          This action will {editingPatientId ? "update the existing" : "create a new"} patient record.
                        </p>
                        <div className="modal-buttons">
                          <button className="cancel-button"
                            onClick={() => setShowPatientConfirmationModal(false)}>
                            Go Back to Edit
                          </button>
                          <button className="modal-green-button"
                            onClick={confirmAndSavePatient}>
                            Yes, Continue
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>
                )}

{activePage === "reports" && (
  <div className="reports-section">
    <h2>Reports Overview</h2>
    
    {/* New Reports Widgets Row */}
    <div className="reports-widgets-grid">
      {/* Total Patients Report Widget */}
      <div className="report-widget report-total-patients">
        <div className="report-widget-header">
          <img src="../picture/total.png" alt="Total Patients" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/1FAAED/ffffff?text=👥"; }}/>
          <h4>Total Patients</h4>
          <button className="report-widget-view-button" onClick={async () => {
            const filteredPatients = await getFilteredPatientsForWidget('total-patients');
            setReportDetailPatients(filteredPatients);
            setReportDetailView('total-patients');
            setActivePage('report-detail');
            setCurrentPageReportDetail(1);
          }}>View</button>
        </div>
        <div className="report-widget-content">
          <div className="report-widget-left">
            <p className="report-number">{totalPatientsCount}</p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">Patients registered in the system</p>
          </div>
        </div>
        {/* Mini Area Chart for Patient Count History */}
        <div className="mini-chart-container">
          {patientCountHistory?.labels?.length > 0 ? (
            <Line 
              key={`report-patient-count-chart-${patientCountHistory?.data?.join('-') || 'empty'}`}
              data={{
                labels: patientCountHistory.labels,
                datasets: [
                  {
                    label: 'Total Patients',
                    data: patientCountHistory.data,
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
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#1FAAED',
                    borderWidth: 1,
                    cornerRadius: 4,
                    displayColors: false,
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
                    display: false,
                    beginAtZero: true,
                    grid: {
                      display: false
                    }
                  },
                  x: {
                    display: false,
                    grid: {
                      display: false
                    }
                  },
                },
                elements: {
                  point: {
                    radius: 0,
                    hoverRadius: 0,
                  },
                  line: {
                    borderWidth: 2,
                  }
                },
                interaction: {
                  intersect: false,
                  mode: 'index',
                },
              }}
            />
          ) : (
            <div className="no-chart-data">
              <p>No patient data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Full Compliance Report Widget */}
      <div className="report-widget report-full-compliance">
        <div className="report-widget-header">
          <img src="../picture/full.svg" alt="Full Compliance" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/28a745/ffffff?text=✓"; }}/>
          <h4>Full Compliance</h4>
          <button className="report-widget-view-button" onClick={async () => {
            const filteredPatients = await getFilteredPatientsForWidget('full-compliance');
            setReportDetailPatients(filteredPatients);
            setReportDetailView('full-compliance');
            setActivePage('report-detail');
            setCurrentPageReportDetail(1);
          }}>View</button>
        </div>
        <div className="report-widget-content">
          <div className="report-widget-left">
            <p className="report-number">{fullComplianceCount}</p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">Patients with complete metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
          </div>
        </div>
        {/* Mini Area Chart for Full Compliance History */}
        <div className="mini-chart-container">
          {fullComplianceHistory?.labels?.length > 0 ? (
            <Line 
              data={{
                labels: fullComplianceHistory.labels,
                datasets: [
                  {
                    label: 'Full Compliance',
                    data: fullComplianceHistory.data,
                  fill: true,
                  backgroundColor: (context) => {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) {
                      return null;
                    }
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
                  enabled: true,
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  titleColor: '#fff',
                  bodyColor: '#fff',
                  borderColor: '#28a745',
                  borderWidth: 1,
                  cornerRadius: 4,
                  displayColors: false,
                  callbacks: {
                    title: function(context) {
                      return `Month: ${context[0].label}`;
                    },
                    label: function(context) {
                      return `Full Compliance: ${context.raw}`;
                    }
                  }
                }
              },
              scales: {
                y: {
                  display: false,
                  beginAtZero: true,
                  grid: {
                    display: false
                  }
                },
                x: {
                  display: false,
                  grid: {
                    display: false
                  }
                },
              },
              elements: {
                point: {
                  radius: 0,
                  hoverRadius: 0,
                },
                line: {
                  borderWidth: 2,
                }
              },
              interaction: {
                intersect: false,
                mode: 'index',
              },
            }}
          />
          ) : (
            <div className="no-chart-data">
              <p>No historical data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Missing Logs Report Widget */}
      <div className="report-widget report-missing-logs">
        <div className="report-widget-header">
          <img src="../picture/missinglogs.svg" alt="Missing Logs" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/ffc107/ffffff?text=⚠"; }}/>
          <h4>Missing Logs</h4>
          <button className="report-widget-view-button" onClick={async () => {
            const filteredPatients = await getFilteredPatientsForWidget('missing-logs');
            setReportDetailPatients(filteredPatients);
            setReportDetailView('missing-logs');
            setActivePage('report-detail');
            setCurrentPageReportDetail(1);
          }}>View</button>
        </div>
        <div className="report-widget-content">
          <div className="report-widget-left">
            <p className="report-number">{missingLogsCount}</p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">Patients with at least 1 missing metric (Blood Glucose, Blood Pressure, Wound Photos)</p>
          </div>
        </div>
        {/* Mini Area Chart for Missing Logs History */}
        <div className="mini-chart-container">
          {missingLogsHistory?.labels?.length > 0 ? (
            <Line 
              data={{
                labels: missingLogsHistory.labels,
                datasets: [
                  {
                    label: 'Missing Logs',
                    data: missingLogsHistory.data,
                  fill: true,
                  backgroundColor: (context) => {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) {
                      return null;
                    }
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
                  enabled: true,
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  titleColor: '#fff',
                  bodyColor: '#fff',
                  borderColor: '#ffc107',
                  borderWidth: 1,
                  cornerRadius: 4,
                  displayColors: false,
                  callbacks: {
                    title: function(context) {
                      return `Month: ${context[0].label}`;
                    },
                    label: function(context) {
                      return `Missing Logs: ${context.raw}`;
                    }
                  }
                }
              },
              scales: {
                y: {
                  display: false,
                  beginAtZero: true,
                  grid: {
                    display: false
                  }
                },
                x: {
                  display: false,
                  grid: {
                    display: false
                  }
                },
              },
              elements: {
                point: {
                  radius: 0,
                  hoverRadius: 0,
                },
                line: {
                  borderWidth: 2,
                }
              },
              interaction: {
                intersect: false,
                mode: 'index',
              },
            }}
          />
          ) : (
            <div className="no-chart-data">
              <p>No historical data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Non-Compliant Cases Report Widget */}
      <div className="report-widget report-non-compliant">
        <div className="report-widget-header">
          <img src="../picture/noncompliant.svg" alt="Non-Compliant Cases" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/dc3545/ffffff?text=✗"; }}/>
          <h4>Non-Compliant Cases</h4>
          <button className="report-widget-view-button" onClick={async () => {
            const filteredPatients = await getFilteredPatientsForWidget('non-compliant');
            setReportDetailPatients(filteredPatients);
            setReportDetailView('non-compliant');
            setActivePage('report-detail');
            setCurrentPageReportDetail(1);
          }}>View</button>
        </div>
        <div className="report-widget-content">
          <div className="report-widget-left">
            <p className="report-number">{nonCompliantCount}</p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">High-risk patients with 3 missing metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
          </div>
        </div>
        {/* Mini Area Chart for Non-Compliant Cases History */}
        <div className="mini-chart-container">
          {nonCompliantHistory?.labels?.length > 0 ? (
            <Line 
              data={{
                labels: nonCompliantHistory.labels,
                datasets: [
                  {
                    label: 'Non-Compliant Cases',
                    data: nonCompliantHistory.data,
                  fill: true,
                  backgroundColor: (context) => {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) {
                      return null;
                    }
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
                  enabled: true,
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  titleColor: '#fff',
                  bodyColor: '#fff',
                  borderColor: '#dc3545',
                  borderWidth: 1,
                  cornerRadius: 4,
                  displayColors: false,
                  callbacks: {
                    title: function(context) {
                      return `Month: ${context[0].label}`;
                    },
                    label: function(context) {
                      return `Non-Compliant: ${context.raw}`;
                    }
                  }
                }
              },
              scales: {
                y: {
                  display: false,
                  beginAtZero: true,
                  grid: {
                    display: false
                  }
                },
                x: {
                  display: false,
                  grid: {
                    display: false
                  }
                },
              },
              elements: {
                point: {
                  radius: 0,
                  hoverRadius: 0,
                },
                line: {
                  borderWidth: 2,
                }
              },
              interaction: {
                intersect: false,
                mode: 'index',
              },
            }}
          />
          ) : (
            <div className="no-chart-data">
              <p>No historical data available</p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* New container for side-by-side layout */}
    <div className="reports-content-row">
      {/* Appointment History Chart */}
      <div className="appointment-chart-container chart-half-width">
        <h3>Appointment History</h3>
        {loadingAppointments && <p>Loading appointment data...</p>}
        {appointmentError && <p className="error-message">Error: {appointmentError}</p>}
        {!loadingAppointments && !appointmentError && appointmentChartData.labels.length > 0 && (
          <Bar
            data={appointmentChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'top',
                },
                title: {
                  display: false,
                },
              },
              scales: {
                x: {
                  grid: {
                    display: false,
                  },
                  title: {
                    display: true,
                    text: 'Week Period',
                  },
                  categoryPercentage: 0.9, // Reduce gaps between bar groups
                  barPercentage: 0.8, // Reduce gaps between individual bars
                },
                y: {
                  beginAtZero: true,
                  ticks: {
                    precision: 0,
                  },
                  title: {
                    display: true,
                    text: 'Number of Appointments',
                  },
                },
              },
            }}
          />
        )}
        {!loadingAppointments && !appointmentError && appointmentChartData.labels.length === 0 && (
          <p>No appointment data available for the last two weeks.</p>
        )}
      </div>

      {/* Lab Submission Report Chart */}
      <div className="lab-submission-chart-container chart-half-width">
        <h3>Lab Submission Report</h3>
        {loadingLabSubmissionData && <p>Loading lab submission data...</p>}
        {labSubmissionError && <p className="error-message">Error: {labSubmissionError}</p>}
        {!loadingLabSubmissionData && !labSubmissionError && labSubmissionChartData.labels.length > 0 && (
          <Bar
            data={labSubmissionChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                title: {
                  display: false,
                },
                tooltip: {
                  callbacks: {
                    title: function(context) {
                      return context[0].label;
                    },
                    label: function(context) {
                      return `Count: ${context.raw}`;
                    }
                  }
                }
              },
              scales: {
                x: {
                  grid: {
                    display: false,
                  },
                  title: {
                    display: true,
                    text: 'Lab Status Categories',
                  },
                  categoryPercentage: 0.9,
                  barPercentage: 0.8,
                  ticks: {
                    maxRotation: 45,
                    minRotation: 45,
                  },
                },
                y: {
                  beginAtZero: true,
                  ticks: {
                    precision: 0,
                  },
                  title: {
                    display: true,
                    text: 'Number of Patients',
                  },
                },
              },
            }}
          />
        )}
        {!loadingLabSubmissionData && !labSubmissionError && labSubmissionChartData.labels.length === 0 && (
          <p>No lab submission data available.</p>
        )}
      </div>
    </div> {/* End of reports-content-row */}
  </div>
)}

              {/* Report Detail View - Separate Page */}
              {activePage === 'report-detail' && reportDetailView === 'total-patients' && (
                <div className="report-detail-section">
                  <div className="detail-view-header">
                    <button className="back-to-list-button" onClick={() => {
                      setReportDetailView(null);
                      setActivePage('reports');
                    }}>
                      <img src="../picture/back.png" alt="Back" className="button-icon back-icon" /> Back to Reports
                    </button>
                    <h2>Total Patients</h2>
                  </div>
                  <table className="patient-table">
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Age</th>
                        <th>Sex</th>
                        <th>Classification</th>
                        <th>Lab Status</th>
                        <th>Profile Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const startIndex = (currentPageReportDetail - 1) * REPORT_DETAIL_PER_PAGE;
                        const endIndex = startIndex + REPORT_DETAIL_PER_PAGE;
                        const paginatedData = reportDetailPatients.slice(startIndex, endIndex);
                        
                        return paginatedData.length > 0 ? (
                          paginatedData.map((pat) => (
                            <tr key={pat.patient_id}>
                              <td className="patient-name-cell">
                                <div className="patient-name-container">
                                  <img 
                                    src={pat.patient_picture || "../picture/secretary.png"} 
                                    alt="Patient Avatar" 
                                    className="patient-avatar-table"
                                    onError={(e) => e.target.src = "../picture/secretary.png"}
                                  />
                                  <span className="patient-name-text">{pat.first_name} {pat.last_name}</span>
                                </div>
                              </td>
                              <td>{pat.date_of_birth ? Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A'}</td>
                              <td>{pat.gender || 'N/A'}</td>
                              <td className={`classification-cell ${
                                pat.lab_status === '❌Awaiting' ? 'classification-awaiting' :
                                ((pat.risk_classification || '').toLowerCase() === 'low' ? 'classification-low' :
                                (pat.risk_classification || '').toLowerCase() === 'moderate' ? 'classification-moderate' :
                                (pat.risk_classification || '').toLowerCase() === 'high' ? 'classification-high' :
                                (pat.risk_classification || '').toLowerCase() === 'ppd' ? 'classification-ppd' : '')
                              }`}>
                                {getClassificationDisplay(pat)}
                              </td>
                              <td className={
                                pat.lab_status === '✅Submitted' ? 'lab-status-complete' :
                                pat.lab_status === '❌Awaiting' ? 'lab-status-awaiting' : ''
                              }>
                                {pat.lab_status || '❌Awaiting'}
                              </td>
                              <td className={pat.profile_status === 'Finalized' ? 'status-complete' : 'status-incomplete'}>
                                {pat.profile_status}
                              </td>
                              <td className="patient-actions-cell">
                                <button className="enter-labs-button" onClick={() => {
                                  setLabResults(prev => ({ ...prev, selectedPatientForLab: pat }));
                                  setLabEntryStep(2);
                                  setActivePage("lab-result-entry");
                                  setReportDetailView(null);
                                }}>🧪 Enter Labs</button>
                                <button className="view-button" onClick={() => {
                                  handleViewPatientDetails(pat);
                                  setReportDetailView(null);
                                }}>👁️ View</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7">No patients found.</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  {reportDetailPatients.length > REPORT_DETAIL_PER_PAGE && (
                    <Pagination
                      currentPage={currentPageReportDetail}
                      totalPages={Math.ceil(reportDetailPatients.length / REPORT_DETAIL_PER_PAGE)}
                      onPageChange={setCurrentPageReportDetail}
                      itemsPerPage={REPORT_DETAIL_PER_PAGE}
                      totalItems={reportDetailPatients.length}
                    />
                  )}
                </div>
              )}

              {activePage === 'report-detail' && reportDetailView === 'full-compliance' && (
                <div className="report-detail-section">
                  <div className="detail-view-header">
                    <button className="back-to-list-button" onClick={() => {
                      setReportDetailView(null);
                      setActivePage('reports');
                    }}>
                      <img src="../picture/back.png" alt="Back" className="button-icon back-icon" /> Back to Reports
                    </button>
                    <h2>Full Compliance - Patients with Complete Metrics</h2>
                  </div>
                  <table className="patient-table">
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Age</th>
                        <th>Sex</th>
                        <th>Classification</th>
                        <th>Lab Status</th>
                        <th>Profile Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const startIndex = (currentPageReportDetail - 1) * REPORT_DETAIL_PER_PAGE;
                        const endIndex = startIndex + REPORT_DETAIL_PER_PAGE;
                        const paginatedData = reportDetailPatients.slice(startIndex, endIndex);
                        
                        return paginatedData.length > 0 ? (
                          paginatedData.map((pat) => (
                            <tr key={pat.patient_id}>
                              <td className="patient-name-cell">
                                <div className="patient-name-container">
                                  <img 
                                    src={pat.patient_picture || "../picture/secretary.png"} 
                                    alt="Patient Avatar" 
                                    className="patient-avatar-table"
                                    onError={(e) => e.target.src = "../picture/secretary.png"}
                                  />
                                  <span className="patient-name-text">{pat.first_name} {pat.last_name}</span>
                                </div>
                              </td>
                              <td>{pat.date_of_birth ? Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A'}</td>
                              <td>{pat.gender || 'N/A'}</td>
                              <td className={`classification-cell ${
                                pat.lab_status === '❌Awaiting' ? 'classification-awaiting' :
                                ((pat.risk_classification || '').toLowerCase() === 'low' ? 'classification-low' :
                                (pat.risk_classification || '').toLowerCase() === 'moderate' ? 'classification-moderate' :
                                (pat.risk_classification || '').toLowerCase() === 'high' ? 'classification-high' :
                                (pat.risk_classification || '').toLowerCase() === 'ppd' ? 'classification-ppd' : '')
                              }`}>
                                {getClassificationDisplay(pat)}
                              </td>
                              <td className={
                                pat.lab_status === '✅Submitted' ? 'lab-status-complete' :
                                pat.lab_status === '❌Awaiting' ? 'lab-status-awaiting' : ''
                              }>
                                {pat.lab_status || '❌Awaiting'}
                              </td>
                              <td className={pat.profile_status === 'Finalized' ? 'status-complete' : 'status-incomplete'}>
                                {pat.profile_status}
                              </td>
                              <td className="patient-actions-cell">
                                <button className="enter-labs-button" onClick={() => {
                                  setLabResults(prev => ({ ...prev, selectedPatientForLab: pat }));
                                  setLabEntryStep(2);
                                  setActivePage("lab-result-entry");
                                  setReportDetailView(null);
                                }}>🧪 Enter Labs</button>
                                <button className="view-button" onClick={() => {
                                  handleViewPatientDetails(pat);
                                  setReportDetailView(null);
                                }}>👁️ View</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7">No patients with full compliance found.</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  {reportDetailPatients.length > REPORT_DETAIL_PER_PAGE && (
                    <Pagination
                      currentPage={currentPageReportDetail}
                      totalPages={Math.ceil(reportDetailPatients.length / REPORT_DETAIL_PER_PAGE)}
                      onPageChange={setCurrentPageReportDetail}
                      itemsPerPage={REPORT_DETAIL_PER_PAGE}
                      totalItems={reportDetailPatients.length}
                    />
                  )}
                </div>
              )}

              {activePage === 'report-detail' && reportDetailView === 'missing-logs' && (
                <div className="report-detail-section">
                  <div className="detail-view-header">
                    <button className="back-to-list-button" onClick={() => {
                      setReportDetailView(null);
                      setActivePage('reports');
                    }}>
                      <img src="../picture/back.png" alt="Back" className="button-icon back-icon" /> Back to Reports
                    </button>
                    <h2>Missing Logs - Patients with Missing Metrics</h2>
                  </div>
                  {/* Message display for flag notifications */}
                  {message && (
                    <div className="message-display" style={{
                      padding: '10px',
                      margin: '10px 0',
                      borderRadius: '5px',
                      backgroundColor: message.includes('✅') ? '#d4edda' : 
                                      message.includes('⚠️') ? '#fff3cd' : 
                                      message.includes('❌') ? '#f8d7da' : '#cce7ff',
                      color: message.includes('✅') ? '#155724' : 
                             message.includes('⚠️') ? '#856404' : 
                             message.includes('❌') ? '#721c24' : '#004085',
                      border: `1px solid ${message.includes('✅') ? '#c3e6cb' : 
                                           message.includes('⚠️') ? '#ffeaa7' : 
                                           message.includes('❌') ? '#f5c6cb' : '#bee5eb'}`,
                      fontSize: '14px',
                      fontWeight: '500'
                    }}>
                      {message}
                    </div>
                  )}
                  <table className="patient-table">
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Age</th>
                        <th>Sex</th>
                        <th>Classification</th>
                        <th>Lab Status</th>
                        <th>Profile Status</th>
                        <th>Days Since Last Submission</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const startIndex = (currentPageReportDetail - 1) * REPORT_DETAIL_PER_PAGE;
                        const endIndex = startIndex + REPORT_DETAIL_PER_PAGE;
                        const paginatedData = reportDetailPatients.slice(startIndex, endIndex);
                        
                        return paginatedData.length > 0 ? (
                          paginatedData.map((pat) => (
                            <tr key={pat.patient_id}>
                              <td className="patient-name-cell">
                                <div className="patient-name-container">
                                  <img 
                                    src={pat.patient_picture || "../picture/secretary.png"} 
                                    alt="Patient Avatar" 
                                    className="patient-avatar-table"
                                    onError={(e) => e.target.src = "../picture/secretary.png"}
                                  />
                                  <span className="patient-name-text">{pat.first_name} {pat.last_name}</span>
                                </div>
                              </td>
                              <td>{pat.date_of_birth ? Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A'}</td>
                              <td>{pat.gender || 'N/A'}</td>
                              <td className={`classification-cell ${
                                pat.lab_status === '❌Awaiting' ? 'classification-awaiting' :
                                ((pat.risk_classification || '').toLowerCase() === 'low' ? 'classification-low' :
                                (pat.risk_classification || '').toLowerCase() === 'moderate' ? 'classification-moderate' :
                                (pat.risk_classification || '').toLowerCase() === 'high' ? 'classification-high' :
                                (pat.risk_classification || '').toLowerCase() === 'ppd' ? 'classification-ppd' : '')
                              }`}>
                                {getClassificationDisplay(pat)}
                              </td>
                              <td className={
                                pat.lab_status === '✅Submitted' ? 'lab-status-complete' :
                                pat.lab_status === '❌Awaiting' ? 'lab-status-awaiting' : ''
                              }>
                                {pat.lab_status || '❌Awaiting'}
                              </td>
                              <td className={pat.profile_status === 'Finalized' ? 'status-complete' : 'status-incomplete'}>
                                {pat.profile_status}
                              </td>
                              <td>{(() => {
                                const lastSubmissionDate = healthMetricsSubmissions[pat.patient_id];
                                const daysPassed = lastSubmissionDate
                                  ? Math.max(0, Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(lastSubmissionDate).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)))
                                  : "No Submission";
                                
                                return (
                                  <span className={`compliance-status ${
                                    daysPassed === "No Submission" ? "no-submission" : 
                                    daysPassed > 7 ? "overdue" : 
                                    daysPassed > 3 ? "warning" : "good"
                                  }`}>
                                    {daysPassed}
                                  </span>
                                );
                              })()}</td>
                              <td className="patient-actions-cell">
                                <button 
                                  className="action-btn flag-button"
                                  onClick={() => handleFlagPatient(pat)}
                                  title="Flag patient for missing metrics and send notifications"
                                >
                                  🚩 Flag
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="8">No patients with missing logs found.</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  {reportDetailPatients.length > REPORT_DETAIL_PER_PAGE && (
                    <Pagination
                      currentPage={currentPageReportDetail}
                      totalPages={Math.ceil(reportDetailPatients.length / REPORT_DETAIL_PER_PAGE)}
                      onPageChange={setCurrentPageReportDetail}
                      itemsPerPage={REPORT_DETAIL_PER_PAGE}
                      totalItems={reportDetailPatients.length}
                    />
                  )}
                </div>
              )}

              {activePage === 'report-detail' && reportDetailView === 'non-compliant' && (
                <div className="report-detail-section">
                  <div className="detail-view-header">
                    <button className="back-to-list-button" onClick={() => {
                      setReportDetailView(null);
                      setActivePage('reports');
                    }}>
                      <img src="../picture/back.png" alt="Back" className="button-icon back-icon" /> Back to Reports
                    </button>
                    <h2>Non-Compliant Cases - High-Risk Patients with All Missing Metrics</h2>
                  </div>
                  <table className="patient-table">
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Age</th>
                        <th>Sex</th>
                        <th>Classification</th>
                        <th>Lab Status</th>
                        <th>Profile Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const startIndex = (currentPageReportDetail - 1) * REPORT_DETAIL_PER_PAGE;
                        const endIndex = startIndex + REPORT_DETAIL_PER_PAGE;
                        const paginatedData = reportDetailPatients.slice(startIndex, endIndex);
                        
                        return paginatedData.length > 0 ? (
                          paginatedData.map((pat) => (
                            <tr key={pat.patient_id}>
                              <td className="patient-name-cell">
                                <div className="patient-name-container">
                                  <img 
                                    src={pat.patient_picture || "../picture/secretary.png"} 
                                    alt="Patient Avatar" 
                                    className="patient-avatar-table"
                                    onError={(e) => e.target.src = "../picture/secretary.png"}
                                  />
                                  <span className="patient-name-text">{pat.first_name} {pat.last_name}</span>
                                </div>
                              </td>
                              <td>{pat.date_of_birth ? Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 'N/A'}</td>
                              <td>{pat.gender || 'N/A'}</td>
                              <td className={`classification-cell ${
                                pat.lab_status === '❌Awaiting' ? 'classification-awaiting' :
                                ((pat.risk_classification || '').toLowerCase() === 'low' ? 'classification-low' :
                                (pat.risk_classification || '').toLowerCase() === 'moderate' ? 'classification-moderate' :
                                (pat.risk_classification || '').toLowerCase() === 'high' ? 'classification-high' :
                                (pat.risk_classification || '').toLowerCase() === 'ppd' ? 'classification-ppd' : '')
                              }`}>
                                {getClassificationDisplay(pat)}
                              </td>
                              <td className={
                                pat.lab_status === '✅Submitted' ? 'lab-status-complete' :
                                pat.lab_status === '❌Awaiting' ? 'lab-status-awaiting' : ''
                              }>
                                {pat.lab_status || '❌Awaiting'}
                              </td>
                              <td className={pat.profile_status === 'Finalized' ? 'status-complete' : 'status-incomplete'}>
                                {pat.profile_status}
                              </td>
                              <td className="patient-actions-cell">
                                <button className="enter-labs-button" onClick={() => {
                                  setLabResults(prev => ({ ...prev, selectedPatientForLab: pat }));
                                  setLabEntryStep(2);
                                  setActivePage("lab-result-entry");
                                  setReportDetailView(null);
                                }}>🧪 Enter Labs</button>
                                <button className="view-button" onClick={() => {
                                  handleViewPatientDetails(pat);
                                  setReportDetailView(null);
                                }}>👁️ View</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7">No non-compliant cases found.</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  {reportDetailPatients.length > REPORT_DETAIL_PER_PAGE && (
                    <Pagination
                      currentPage={currentPageReportDetail}
                      totalPages={Math.ceil(reportDetailPatients.length / REPORT_DETAIL_PER_PAGE)}
                      onPageChange={setCurrentPageReportDetail}
                      itemsPerPage={REPORT_DETAIL_PER_PAGE}
                      totalItems={reportDetailPatients.length}
                    />
                  )}
                </div>
              )}
              </div>
            </div>
            
            {/* Photo Expansion Modal */}
            {showPhotoModal && selectedPhoto && (
              <div className="modal-backdrop" onClick={handleClosePhotoModal}>
                <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="photo-modal-header">
                    <h3>Wound Photo - {formatDateToReadable(selectedPhoto.date)}</h3>
                    <button className="modal-close" onClick={handleClosePhotoModal}>
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="photo-modal-body">
                    <img
                      src={selectedPhoto.url}
                      alt={`Wound Photo - ${selectedPhoto.date}`}
                      className="photo-modal-image"
                      onError={(e) => {
                        console.error('Failed to load expanded photo:', selectedPhoto.url);
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="photo-modal-footer">
                    <p>Submitted on {formatDateToReadable(selectedPhoto.date)} at {new Date(selectedPhoto.date).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit', 
                      hour12: true 
                    })}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Wound Analysis Modal */}
            {showAnalysisModal && (
              <div className="modal-backdrop" onClick={handleCloseAnalysisModal}>
                <div className="analysis-modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="analysis-modal-header">
                    <h3>Wound Analysis Results</h3>
                    <button className="modal-close" onClick={handleCloseAnalysisModal}>
                      <img src="/picture/close.png" alt="Close" className="icon-button-img" />
                    </button>
                  </div>
                  <div className="analysis-modal-body">
                    {isLoadingAnalysis ? (
                      <div className="loading-message">
                        <p>Loading analysis...</p>
                      </div>
                    ) : analysisError ? (
                      <div className="error-message">
                        <p>{analysisError}</p>
                      </div>
                    ) : analysisResults ? (
                      <>
                        <div className="analysis-images-grid">
                          <div className="analysis-image-item">
                            <h4>Original Image</h4>
                            <img 
                              src={analysisResults.originalImage} 
                              alt="Original" 
                              className="analysis-image"
                            />
                          </div>
                          <div className="analysis-image-item">
                            <h4>Grad-CAM Heatmap</h4>
                            <img 
                              src={analysisResults.gradcam} 
                              alt="Grad-CAM Heatmap" 
                              className="analysis-image"
                            />
                          </div>
                          <div className="analysis-image-item">
                            <h4>Segmentation Mask</h4>
                            <img 
                              src={analysisResults.segmentation} 
                              alt="Segmentation Mask" 
                              className="analysis-image"
                            />
                          </div>
                        </div>
                        <div className="analysis-info">
                          <h4>AI Diagnosis</h4>
                          <p><strong>Risk Classification:</strong> {analysisResults.className}</p>
                          <p className="analysis-note">
                            The Grad-CAM heatmap shows regions of interest identified by the AI model, 
                            and the segmentation mask highlights the wound area.
                          </p>
                        </div>
                        
                        {/* Treatment Plan Section */}
                        {analysisResults.treatmentPlan && (
                          <div className="treatment-plan-section">
                            <h4>Doctor's Treatment Plan</h4>
                            <div className="treatment-plan-grid">
                              <div className="treatment-plan-item">
                                <label>Diagnosis:</label>
                                <p>{analysisResults.treatmentPlan.diagnosis}</p>
                              </div>
                              <div className="treatment-plan-item">
                                <label>Wound Care:</label>
                                <p>{analysisResults.treatmentPlan.care}</p>
                              </div>
                              <div className="treatment-plan-item">
                                <label>Dressing:</label>
                                <p>{analysisResults.treatmentPlan.dressing}</p>
                              </div>
                              <div className="treatment-plan-item">
                                <label>Medication:</label>
                                <p>{analysisResults.treatmentPlan.medication}</p>
                              </div>
                              <div className="treatment-plan-item">
                                <label>Follow-up:</label>
                                <p>{analysisResults.treatmentPlan.followUp}</p>
                              </div>
                              <div className="treatment-plan-item full-width">
                                <label>Important Notes:</label>
                                <p>{analysisResults.treatmentPlan.importantNotes}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Demographics Edit Modal */}
            {showDemographicsEditModal && (
              <div className="modal-backdrop" onClick={handleCloseDemographicsEdit}>
                <div className="demographics-modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="demographics-modal-header">
                    <h3>Update Patient Demographics</h3>
                    <button className="modal-close" onClick={handleCloseDemographicsEdit}>
                      <img src="/picture/close.png" alt="Close" className="icon-button-img" />
                    </button>
                  </div>
                  <div className="demographics-modal-body">
                    <div className="demographics-form-grid">
                      <div className="form-group">
                        <label>First Name *</label>
                        <input
                          type="text"
                          value={demographicsForm.firstName}
                          onChange={(e) => handleDemographicsInputChange('firstName', e.target.value)}
                          placeholder="Enter first name"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Last Name *</label>
                        <input
                          type="text"
                          value={demographicsForm.lastName}
                          onChange={(e) => handleDemographicsInputChange('lastName', e.target.value)}
                          placeholder="Enter last name"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Date of Birth *</label>
                        <input
                          type="date"
                          value={demographicsForm.dateOfBirth}
                          onChange={(e) => handleDemographicsInputChange('dateOfBirth', e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Gender *</label>
                        <select
                          value={demographicsForm.gender}
                          onChange={(e) => handleDemographicsInputChange('gender', e.target.value)}
                          required
                        >
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Contact Number *</label>
                        <input
                          type="text"
                          value={demographicsForm.contactInfo}
                          onChange={(e) => handleDemographicsInputChange('contactInfo', e.target.value)}
                          placeholder="Enter contact number"
                          required
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Address *</label>
                        <input
                          type="text"
                          value={demographicsForm.address}
                          onChange={(e) => handleDemographicsInputChange('address', e.target.value)}
                          placeholder="Enter address"
                          required
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Emergency Contact Number *</label>
                        <input
                          type="text"
                          value={demographicsForm.emergencyContactNumber}
                          onChange={(e) => handleDemographicsInputChange('emergencyContactNumber', e.target.value)}
                          placeholder="Enter emergency contact number"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Password *</label>
                        <input
                          type="password"
                          value={demographicsForm.password}
                          onChange={(e) => handleDemographicsInputChange('password', e.target.value)}
                          placeholder="Enter password"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Height (cm)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={demographicsForm.patientHeight}
                          onChange={(e) => handleDemographicsInputChange('patientHeight', e.target.value)}
                          placeholder="Enter height in cm"
                        />
                      </div>
                      <div className="form-group">
                        <label>Weight (kg)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={demographicsForm.patientWeight}
                          onChange={(e) => handleDemographicsInputChange('patientWeight', e.target.value)}
                          placeholder="Enter weight in kg"
                        />
                      </div>
                      <div className="form-group">
                        <label>BMI</label>
                        <input
                          type="number"
                          step="0.01"
                          value={demographicsForm.bmi}
                          onChange={(e) => handleDemographicsInputChange('bmi', e.target.value)}
                          placeholder="Enter BMI"
                        />
                      </div>
                    </div>
                    <div className="demographics-modal-footer">
                      <button className="cancel-button" onClick={handleCloseDemographicsEdit}>
                        Cancel
                      </button>
                      <button className="save-button" onClick={handleSaveDemographics}>
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      };

      export default SecretaryDashboard;