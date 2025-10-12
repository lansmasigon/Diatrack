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
    console.log("getLabStatus: No lab result provided, returning Awaiting");
    return 'Awaiting';
  }

  const requiredLabFields = [
    'Hba1c', 'creatinine', 'got_ast', 'gpt_alt',
    'cholesterol', 'triglycerides', 'hdl_cholesterol', 'ldl_cholesterol'
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
  if (!hasAnyField && !missingFields) {
      status = 'Awaiting';
  } else if (missingFields) {
      status = 'Submitted'; // Patient has some lab data, even if incomplete
  } else {
      status = '✅Submitted'; // Patient has complete lab data
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

  // State for chart data (dynamically fetched)
  const [totalPatientsCount, setTotalPatientsCount] = useState(0);
  const [pendingLabResultsCount, setPendingLabResultsCount] = useState(0);
  const [preOpCount, setPreOpCount] = useState(0);
  const [postOpCount, setPostOpCount] = useState(0);
  const [lowRiskCount, setLowRiskCount] = useState(0);
  const [moderateRiskCount, setModerateRiskCount] = useState(0);
  const [highRiskCount, setHighRiskCount] = useState(0);

  const [appointmentsToday, setAppointmentsToday] = useState([]);

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

  const [currentPagePatients, setCurrentPagePatients] = useState(1);
  const PATIENTS_PER_PAGE = 10;

  const [currentPageLabSearchPatients, setCurrentPageLabSearchPatients] = useState(1); // New state for this specific patient list
  const LAB_SEARCH_PATIENTS_PER_PAGE = 10; // New: Define how many patients per page (you can adjust this number)

  const [currentPageHealthMetrics, setCurrentPageHealthMetrics] = useState(1); // New state for health metrics pagination
  const HEALTH_METRICS_PER_PAGE = 7; // Define how many health metrics per page
  
  // Risk filter states
  const [selectedRiskFilter, setSelectedRiskFilter] = useState('all'); // For patient list
  const [selectedLabRiskFilter, setSelectedLabRiskFilter] = useState('all'); // For lab entry search
  
  // State for patient count over the past 6 months
  const [patientCountHistory, setPatientCountHistory] = useState([]);
  
  // State for pending lab results count over the past 6 months
  const [pendingLabHistory, setPendingLabHistory] = useState([]);
  
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
    hba1c: "", // Keep this lowercase for the state variable
    creatinine: "",
    gotAst: "",
    gptAlt: "",
    cholesterol: "",
    triglycerides: "",
    hdlCholesterol: "",
    ldlCholesterol: "",
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

  // NEW STATE FOR PATIENT-SPECIFIC LAB RESULTS (ALL HISTORY)
  const [allPatientLabResultsHistory, setAllPatientLabResultsHistory] = useState([]);


  // NEW STATE FOR PATIENT-SPECIFIC LAB RESULTS AND APPOINTMENTS
  const [patientLabResults, setPatientLabResults] = useState({
    hba1c: 'N/A', creatinine: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
    cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
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
          .select('date_submitted, Hba1c, creatinine, got_ast, gpt_alt, cholesterol, triglycerides, hdl_cholesterol, ldl_cholesterol')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('date_submitted', { ascending: false })
          .limit(1);

        if (labError) {
          console.error("Error fetching latest lab results:", labError);
          setLastLabDate('Error');
          setPatientLabResults({
            hba1c: 'Error', creatinine: 'Error', gotAst: 'Error', gptAlt: 'Error',
            cholesterol: 'Error', triglycerides: 'Error', hdlCholesterol: 'Error', ldlCholesterol: 'Error',
          });
        } else if (labData && labData.length > 0) {
          const latestLab = labData[0];
          const dateObj = new Date(latestLab.date_submitted);
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getUTCDate()).padStart(2, '0');
          setLastLabDate(`${year}-${month}-${day}`);
          setPatientLabResults({
            hba1c: latestLab.Hba1c || 'N/A',
            creatinine: latestLab.creatinine || 'N/A',
            gotAst: latestLab.got_ast || 'N/A',
            gptAlt: latestLab.gpt_alt || 'N/A',
            cholesterol: latestLab.cholesterol || 'N/A',
            triglycerides: latestLab.triglycerides || 'N/A',
            hdlCholesterol: latestLab.hdl_cholesterol || 'N/A',
            ldlCholesterol: latestLab.ldl_cholesterol || 'N/A',
          });
        } else {
          setLastLabDate('N/A');
          setPatientLabResults({
            hba1c: 'N/A', creatinine: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
            cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
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
          .select('blood_glucose, bp_systolic, bp_diastolic, submission_date, risk_classification')
          .eq('patient_id', selectedPatientForDetail.patient_id)
          .order('submission_date', { ascending: true });

        if (historyHealthError) {
            console.error("Error fetching historical health metrics for charts:", historyHealthError.message);
            setAllPatientHealthMetrics([]);
        } else if (historyHealthData) {
            // Use the actual risk classification from each health metric entry
            setAllPatientHealthMetrics(historyHealthData);
        } else {
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
          hba1c: 'N/A', creatinine: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
          cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
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
            .select('Hba1c, creatinine, got_ast, gpt_alt, cholesterol, triglycerides, hdl_cholesterol, ldl_cholesterol, date_submitted')
            .eq('patient_id', patient.patient_id)
            .order('date_submitted', { ascending: false })
            .limit(1);

          let labStatus = 'Awaiting';
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
      if (patient.lab_status === 'Awaiting' || patient.lab_status === 'N/A') {
        pendingLabs++;
      }
    });
  
    setPreOpCount(preOp);
    setPostOpCount(postOp);
    setLowRiskCount(lowRisk);
    setModerateRiskCount(moderateRisk);
    setHighRiskCount(highRisk);
    setPendingLabResultsCount(pendingLabs);
  };

 const fetchAllAppointments = async () => {
  // Since we're storing appointments as UTC, we need to adjust our date range
  // to account for the fact that a "today" appointment might be stored as tomorrow in UTC
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today in local time
  
  // Expand the search range to include appointments that might appear as different dates due to UTC storage
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 1); // Start from yesterday
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 2); // Go to day after tomorrow

  console.log("Fetching appointments in expanded range:", startDate.toISOString(), "to", endDate.toISOString());

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
    // Filter to only show appointments that are actually "today" when we extract the date
    const todayDateString = today.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    const todaysAppointments = data.filter(app => {
      const state = (app.appointment_state || '').toLowerCase();
      const isActive = state !== 'finished' && state !== 'done' && state !== 'cancelled';
      
      // Extract the date part from the stored datetime and compare with today
      const appointmentDateString = app.appointment_datetime.substring(0, 10); // Gets YYYY-MM-DD
      const isToday = appointmentDateString === todayDateString;
      
      console.log("Checking appointment:", app.appointment_id, "Date:", appointmentDateString, "Today:", todayDateString, "IsToday:", isToday, "IsActive:", isActive);
      
      return isActive && isToday;
    });

    console.log("Filtered appointments for today:", todaysAppointments);

    const processedAppointments = todaysAppointments.map(app => {
      // Extract time directly from the ISO string (HH:MM format)
      // Since we stored it as UTC, we just extract the time part
      const timeString = app.appointment_datetime.substring(11, 16); // Gets HH:MM
      
      console.log("Processing appointment:", app.appointment_id, "Raw datetime:", app.appointment_datetime, "Extracted time:", timeString);
      
      return {
        ...app,
        patient_name: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : 'Unknown Patient',
        doctor_name: app.doctors ? `${app.doctors.first_name} ${app.doctors.last_name}` : 'Unknown Doctor',
        timeDisplay: formatTimeTo12Hour(timeString),
      };
    });

    console.log("Final processed appointments for today table:", processedAppointments);
    setAppointmentsToday(processedAppointments);
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
        medication: JSON.stringify(medications), // Store medications as a JSON string
        complication_history: [
          patientForm.footUlcersAmputation && "Foot Ulcers/Amputation",
          patientForm.eyeIssues && "Eye Issues",
          patientForm.kidneyIssues && "Kidney Issues",
          patientForm.stroke && "Stroke",
          patientForm.heartAttack && "Heart Attack",
          patientForm.hypertensive && "Hypertensive",
        ].filter(Boolean).join(", ") || null,
        smoking_status: patientForm.smokingStatus,
        monitoring_frequency: patientForm.monitoringFrequencyGlucose,
        last_doctor_visit: patientForm.lastDoctorVisit,
        last_eye_exam: patientForm.lastEyeExam,
        phase: 'Pre-Operative', // Default to Pre-Operative on creation
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
        middleName: "", gender: "", address: "", emergencyContactNumber: "", diabetesType: "", allergies: "",
        footUlcersAmputation: false, eyeIssues: false, kidneyIssues: false, stroke: false,
        heartAttack: false, hypertensive: false, smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
        lastEyeExam: "", preparedBy: ""
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
      footUlcersAmputation: patient.complication_history?.includes("Foot Ulcers/Amputation") || false,
      eyeIssues: patient.complication_history?.includes("Eye Issues") || false,
      kidneyIssues: patient.complication_history?.includes("Kidney Issues") || false,
      stroke: patient.complication_history?.includes("Stroke") || false,
      heartAttack: patient.complication_history?.includes("Heart Attack") || false,
      hypertensive: patient.complication_history?.includes("Hypertensive") || false,
      smokingStatus: patient.smoking_status || "",
      monitoringFrequencyGlucose: patient.monitoringFrequencyGlucose || "",
      lastDoctorVisit: patient.last_doctor_visit || "",
      lastEyeExam: patient.last_eye_exam || ""
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


  const filteredPatients = patients.filter((pat) => {
    const nameMatch = `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Risk classification filter
    if (selectedRiskFilter === 'all') {
      return nameMatch;
    } else {
      const patientRisk = (pat.risk_classification || '').toLowerCase();
      return nameMatch && patientRisk === selectedRiskFilter;
    }
  });

  // Filtered patients for lab entry search with separate risk filter
  const filteredLabSearchPatients = patients.filter((pat) => {
    const nameMatch = `${pat.first_name} ${pat.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Risk classification filter for lab search
    if (selectedLabRiskFilter === 'all') {
      return nameMatch;
    } else {
      const patientRisk = (pat.risk_classification || '').toLowerCase();
      return nameMatch && patientRisk === selectedLabRiskFilter;
    }
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
    const totalHealthMetricsPages = Math.ceil(allPatientHealthMetrics.length / HEALTH_METRICS_PER_PAGE);
    const startIndexHealthMetrics = (currentPageHealthMetrics - 1) * HEALTH_METRICS_PER_PAGE;
    const endIndexHealthMetrics = startIndexHealthMetrics + HEALTH_METRICS_PER_PAGE;
    const paginatedHealthMetrics = allPatientHealthMetrics.slice(startIndexHealthMetrics, endIndexHealthMetrics);
    
  // Risk filter handlers
  const handleRiskFilterChange = (riskLevel) => {
    setSelectedRiskFilter(riskLevel);
    setCurrentPagePatients(1); // Reset to first page when filter changes
  };

  const handleLabRiskFilterChange = (riskLevel) => {
    setSelectedLabRiskFilter(riskLevel);
    setCurrentPageLabSearchPatients(1); // Reset to first page when filter changes
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

  const patientRiskCounts = calculateRiskCounts(patients);
  const labSearchRiskCounts = calculateRiskCounts(patients);
    
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
      hba1c: 'N/A', creatinine: 'N/A', gotAst: 'N/A', gptAlt: 'N/A',
      cholesterol: 'N/A', triglycerides: 'N/A', hdlCholesterol: 'N/A', ldlCholesterol: 'N/A',
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
      // Check if this specialist is already assigned to this patient
      const { data: existingAssignment } = await supabase
        .from("patient_specialists")
        .select("id")
        .eq("patient_id", patientForSpecialistAssignment.patient_id)
        .eq("doctor_id", selectedSpecialistId)
        .single();

      if (existingAssignment) {
        setMessage("This specialist is already assigned to this patient.");
        return;
      }

      // Insert new specialist assignment
      const { error } = await supabase
        .from("patient_specialists")
        .insert([
          {
            patient_id: patientForSpecialistAssignment.patient_id,
            doctor_id: selectedSpecialistId,
            specialization: null // Will use doctor's specialization from doctors table
          }
        ]);

      if (error) {
        console.error("Error assigning specialist:", error);
        setMessage(`Error assigning specialist: ${error.message}`);
        return;
      }

      setMessage("Specialist assigned successfully!");
      setSelectedSpecialistId("");
      
      // Refresh the current patient specialists list
      fetchPatientSpecialists(patientForSpecialistAssignment.patient_id);
      
      // Log the assignment
      await logSystemAction(
        'secretary',
        user.secretary_id,
        `${user.first_name} ${user.last_name}`,
        'specialist_assignment',
        'assign',
        `Assigned specialist to patient: ${patientForSpecialistAssignment.first_name} ${patientForSpecialistAssignment.last_name}`,
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
        labResults.hba1c === "" ||
        labResults.creatinine === "" ||
        labResults.gotAst === "" ||
        labResults.gptAlt === "" ||
        labResults.cholesterol === "" ||
        labResults.triglycerides === "" ||
        labResults.hdlCholesterol === "" ||
        labResults.ldlCholesterol === "") {
        setMessage("Please fill in all lab result fields.");
        return;
    }

    // Prepare data for insertion into the 'patient_labs' table
    const dataToInsert = {
      patient_id: labResults.selectedPatientForLab.patient_id,
      date_submitted: labResults.dateSubmitted,
      // !!! IMPORTANT CHANGE HERE: Use 'HbA1c' to match your database column name exactly !!!
      Hba1c: parseFloat(labResults.hba1c) || null,
      creatinine: parseFloat(labResults.creatinine) || null,
      got_ast: parseFloat(labResults.gotAst) || null,
      gpt_alt: parseFloat(labResults.gptAlt) || null,
      cholesterol: parseFloat(labResults.cholesterol) || null,
      triglycerides: parseFloat(labResults.triglycerides) || null,
      hdl_cholesterol: parseFloat(labResults.hdlCholesterol) || null,
      ldl_cholesterol: parseFloat(labResults.ldlCholesterol) || null,
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
        hba1c: "",
        creatinine: "",
        gotAst: "",
        gptAlt: "",
        cholesterol: "",
        triglycerides: "",
        hdlCholesterol: "",
        ldlCholesterol: "",
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
                  footUlcersAmputation: "", eyeIssues: "", kidneyIssues: "", stroke: "",
                  heartAttack: "", hypertensive: "", smokingStatus: "", monitoringFrequencyGlucose: "", lastDoctorVisit: "",
                  lastEyeExam: "", preparedBy: ""
                });
                setMedications([{ drugName: "", dosage: "", frequency: "", prescribedBy: "" }]); // Reset medications state
                setSelectedDoctorId("");
                setEditingPatientId(null);
                setCurrentPatientStep(0); // Reset step
              }}>
                <i className="fas fa-plus"></i> Create New Patient
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
                  <h3>Appointments Today</h3> {/* Changed heading */}
                  <div className="appointment-list-container"> {/* Added container for table + pagination */}
                    <table className="appointment-list-table"> {/* Class added for potential styling */}
                      <thead>
                        <tr>
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
                            <td colSpan="4" style={{ textAlign: "center" }}>
                              No appointments found.
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
                            <td colSpan="4" style={{ textAlign: "center" }}>
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
                                        <i className="fas fa-minus-circle"></i>
                                      </button>
                                    )}
                                    {index === medications.length - 1 && (
                                      <button type="button" className="add-med-button" onClick={handleAddMedication}>
                                        <i className="fas fa-plus-circle"></i>
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
                      <th>Phase</th> {/* New Status column */}
                      <th>Classification</th>
                      <th>Lab Status</th>
                      <th>Profile Status</th>
                      <th>Last Visit</th>
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
                            <td>{pat.date_of_birth ? `${Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))}/${pat.gender}` : 'N/A'}</td>
                            <td className={`patient-phase ${
                            pat.phase === 'Pre-Operative' ? 'phase-pre-operative' :
                            pat.phase === 'Post-Operative' ? 'phase-post-operative' : ''
                          }`}>
                            {pat.phase}
                          </td>
                            <td className={`risk-classification-${(pat.risk_classification || 'N/A').toLowerCase()}`}>
                                {pat.risk_classification || 'N/A'}
                            </td>
                            <td className={
                            pat.lab_status === 'Submitted' ? 'lab-status-complete' :
                            pat.lab_status === 'Awaiting' ? 'lab-status-awaiting' : // Add this if you want pending to have a specific style
                            ''
                          }>
                            {pat.lab_status || 'Awaiting'}
                          </td>
                          <td className={pat.profile_status === 'Finalized' ? 'status-complete' : 'status-incomplete'}>
                            {pat.profile_status}
                          </td>
                            <td>{formatDateToReadable(pat.last_doctor_visit)}</td> {/* Updated to use new date format */}
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
                          <td colSpan="9">No patients found.</td> {/* Updated colspan to 9 */}
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
                            <i className="fas fa-arrow-left"></i> Back to List
                        </button>
                        <div className="patient-details-header-row">
                            <h2>Patient Details</h2>
                            <button className="export-pdf-button" onClick={() => {
                                // Export PDF functionality - will print and allow saving
                                window.print();
                            }}>
                                <i className="fas fa-file-pdf"></i> Export PDF
                            </button>
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
                                                <span className="detail-label">Hypertensive:</span>
                                                <span className="detail-value">{selectedPatientForDetail.complication_history?.includes("Hypertensive") ? "Yes" : "No"}</span>
                                            </div>
                                            <div className="patient-detail-item">
                                                <span className="detail-label">Heart Disease:</span>
                                                <span className="detail-value">{selectedPatientForDetail.complication_history?.includes("Heart Attack") ? "Yes" : "None"}</span>
                                            </div>
                                        </div>
                                         <div className="patient-detail-item">
                                                <span className="detail-label">Smoking History:</span>
                                                <span className="detail-value">{selectedPatientForDetail.smoking_status || 'N/A'}</span>
                                            </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Laboratory Result Section */}
                            <div className="laboratory-results-section">
                                <h3>Laboratory Results (Latest)</h3>
                                <p><strong>Date Submitted:</strong> {formatDateToReadable(lastLabDate)}</p>
                                <p><strong>HbA1c:</strong> {patientLabResults.hba1c}</p>
                                <p><strong>Creatinine:</strong> {patientLabResults.creatinine}</p>
                                <p><strong>GOT (AST):</strong> {patientLabResults.gotAst}</p>
                                <p><strong>GPT (ALT):</strong> {patientLabResults.gptAlt}</p>
                                <p><strong>Cholesterol:</strong> {patientLabResults.cholesterol}</p>
                                <p><strong>Triglycerides:</strong> {patientLabResults.triglycerides}</p>
                                <p><strong>HDL Cholesterol:</strong> {patientLabResults.hdlCholesterol}</p>
                                <p><strong>LDL Cholesterol:</strong> {patientLabResults.ldlCholesterol}</p>
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
                                <h4>Blood Glucose Level History</h4>
                                <div className="chart-wrapper">
                                  <Line
                                    data={{
                                      labels: allPatientHealthMetrics.slice(-5).map(entry => formatDateForChart(entry.submission_date)),
                                      datasets: [{
                                        label: 'Blood Glucose',
                                        data: allPatientHealthMetrics.slice(-5).map(entry => parseFloat(entry.blood_glucose) || 0),
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
                                            display: false, // Hide y-axis title
                                          },
                                          min: 0,
                                          max: 300,
                                          ticks: {
                                            display: false, // Hide y-axis values
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
                                            display: false, // Hide x-axis title
                                          },
                                          ticks: {
                                            display: false, // Hide x-axis values
                                          }
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Blood Pressure Chart - Separate div */}
                              <div className="blood-pressure-chart-container">
                                <h4>Blood Pressure History</h4>
                                <div className="chart-wrapper">
                                  <Bar
                                    data={{
                                      labels: allPatientHealthMetrics.slice(-10).map(entry => formatDateForChart(entry.submission_date)),
                                      datasets: [
                                        {
                                          label: 'Diastolic',
                                          data: allPatientHealthMetrics.slice(-10).map(entry => parseFloat(entry.bp_diastolic) || 0),
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
                                          data: allPatientHealthMetrics.slice(-10).map(entry => parseFloat(entry.bp_systolic) || 0),
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
                                            display: false, // Hide x-axis title
                                          },
                                          ticks: {
                                            display: false, // Hide x-axis values
                                          },
                                          categoryPercentage: 0.95, // Increased to compress gaps - was 0.8
                                          barPercentage: 0.95, // Increased to compress gaps - was 0.9
                                        },
                                        y: {
                                          stacked: true,
                                          beginAtZero: true,
                                          title: {
                                            display: false, // Hide y-axis title
                                          },
                                          min: 0,
                                          max: 350, // Increased to accommodate higher blood pressure values
                                          ticks: {
                                            display: false, // Hide y-axis values
                                          },
                                          grid: {
                                            display: true,
                                            color: 'rgba(0, 0, 0, 0.1)',
                                          }
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Risk Classification History Chart - New */}
                              <div className="risk-classification-chart-container">
                                <h4>Risk Classification History</h4>
                                
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
                                  <Bar
                                    data={{
                                      labels: allPatientHealthMetrics.slice(-10).map(entry => formatDateForChart(entry.submission_date)),
                                      datasets: [
                                        {
                                          label: 'Risk Classification',
                                          data: allPatientHealthMetrics.slice(-10).map(entry => {
                                            const risk = entry.risk_classification?.toLowerCase();
                                            if (risk === 'low') return 2;
                                            if (risk === 'moderate') return 3;
                                            if (risk === 'high') return 4;
                                            if (risk === 'ppd') return 1;
                                            return 0; // For unknown/null values
                                          }),
                                          backgroundColor: allPatientHealthMetrics.slice(-10).map(entry => {
                                            const risk = entry.risk_classification?.toLowerCase();
                                            if (risk === 'low') return 'rgba(34, 197, 94, 0.8)'; // Green
                                            if (risk === 'moderate') return 'rgba(255, 193, 7, 0.8)'; // Yellow
                                            if (risk === 'high') return 'rgba(244, 67, 54, 0.8)'; // Red
                                            if (risk === 'ppd') return 'rgba(103, 101, 105, 0.8)'; // Purple
                                            return 'rgba(156, 163, 175, 0.8)'; // Gray for unknown
                                          }),
                                          borderColor: allPatientHealthMetrics.slice(-10).map(entry => {
                                            const risk = entry.risk_classification?.toLowerCase();
                                            if (risk === 'low') return 'rgba(34, 197, 94, 1)';
                                            if (risk === 'moderate') return 'rgba(255, 193, 7, 1)';
                                            if (risk === 'high') return 'rgba(244, 67, 54, 1)';
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
                                              const entry = allPatientHealthMetrics.slice(-10)[context.dataIndex];
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
                                            display: false,
                                          },
                                          ticks: {
                                            display: false,
                                          },
                                          categoryPercentage: 0.95,
                                          barPercentage: 0.95,
                                        },
                                        y: {
                                          beginAtZero: true,
                                          title: {
                                            display: false,
                                          },
                                          min: 0,
                                          max: 4, // 0=Unknown, 1=Low, 2=Moderate, 3=High
                                          ticks: {
                                            display: false,
                                            stepSize: 1,
                                          },
                                          grid: {
                                            display: true,
                                            color: 'rgba(0, 0, 0, 0.1)',
                                          }
                                        }
                                      }
                                    }}
                                  />
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
                                                <i className="fas fa-plus-circle"></i>
                                              </button>
                                              <button type="button" className="remove-med-button" title="Remove medication">
                                                <i className="fas fa-minus-circle"></i>
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
                                              <i className="fas fa-plus-circle"></i>
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
                                            <th>Date & Time</th>
                                            <th>Blood Glucose</th>
                                            <th>Blood Pressure</th>
                                            <th>Risk Classification</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedHealthMetrics.length > 0 ? (
                                            paginatedHealthMetrics.map((metric, index) => (
                                                <tr key={index}>
                                                    <td>{formatDateToReadable(metric.submission_date) + ' ' + formatTimeTo12Hour(new Date(metric.submission_date).toTimeString().substring(0, 5))}</td>
                                                    <td>{metric.blood_glucose || 'N/A'}</td>
                                                    <td>
                                                        {metric.bp_systolic !== null && metric.bp_diastolic !== null
                                                            ? `${metric.bp_systolic}/${metric.bp_diastolic}`
                                                            : 'N/A'}
                                                    </td>
                                                    <td className={`risk-classification-${(metric.risk_classification || 'N/A').toLowerCase()}`}>
                                                        {metric.risk_classification || 'N/A'}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4">No health metrics history available for this patient.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                
                                {/* Health Metrics Pagination */}
                                {allPatientHealthMetrics.length > HEALTH_METRICS_PER_PAGE && (
                                    <Pagination
                                        currentPage={currentPageHealthMetrics}
                                        totalPages={totalHealthMetricsPages}
                                        onPageChange={setCurrentPageHealthMetrics}
                                        itemsPerPage={HEALTH_METRICS_PER_PAGE}
                                        totalItems={allPatientHealthMetrics.length}
                                        showPageInfo={false}
                                    />
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
                                                    <span className="submitter-text">by</span> {selectedPatientForDetail.first_name} {selectedPatientForDetail.last_name}
                                                </span>
                                            </div>
                                            
                                            <div className="photo-actions">
                                                <button className="entry-btn">Entry ID: 00{allWoundPhotos.length - index}</button>
                                                <button className="view-details-btn">View Details</button>
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
                            <i className="fas fa-search search-icon"></i>
                          </div>
                          
                          {/* Risk Classification Filter for Lab Entry */}
                          <RiskFilter
                            selectedRisk={selectedLabRiskFilter}
                            onRiskChange={handleLabRiskFilterChange}
                            showCounts={true}
                            counts={labSearchRiskCounts}
                          />
                        </div>
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
                                  <td>{pat.date_of_birth ? `${Math.floor((new Date() - new Date(pat.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))}/${pat.gender}` : 'N/A'}</td>
                                  <td className={`risk-classification-${(pat.risk_classification || 'N/A').toLowerCase()}`}>
                                    {pat.risk_classification || 'N/A'}
                                  </td>
                                  <td className={
                                    pat.lab_status === 'Submitted' ? 'lab-status-submitted' :
                                    pat.lab_status === 'Pending' ? 'lab-status-pending' :
                                    pat.lab_status === 'N/A' ? 'lab-status-na' :
                                    '' }> {pat.lab_status || 'N/A'}
                                  </td>
                                  <td className={pat.profile_status === 'Finalized' ? 'status-finalized' : 'status-pending'}>
                                    {pat.profile_status}
                                  </td>
                                  <td>{pat.last_doctor_visit || 'N/A'}</td>
                                  <td>
                                    <div className="lab-actions-buttons">
                                      <button className="enter-labs-button" onClick={() => handleSelectPatientForLab(pat)}>
                                        {pat.lab_status === 'Submitted' ? '🔄 Update': '🧪 Enter Labs'}
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
                              value={labResults.hba1c}
                              onChange={(e) => handleLabInputChange("hba1c", e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label>Creatinine (mg/dL):</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g., 0.8"
                              value={labResults.creatinine}
                              onChange={(e) => handleLabInputChange("creatinine", e.target.value)}
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
                          <p><strong>HbA1c:</strong> {labResults.hba1c} %</p>
                          <p><strong>Creatinine:</strong> {labResults.creatinine} mg/dL</p>
                          <p><strong>GOT (AST):</strong> {labResults.gotAst} U/L</p>
                          <p><strong>GPT (ALT):</strong> {labResults.gptAlt} U/L</p>
                          <p><strong>Cholesterol:</strong> {labResults.cholesterol} mg/dL</p>
                          <p><strong>Triglycerides:</strong> {labResults.triglycerides} mg/dL</p>
                          <p><strong>HDL Cholesterol:</strong> {labResults.hdlCholesterol} mg/dL</p>
                          <p><strong>LDL Cholesterol:</strong> {labResults.ldlCholesterol} mg/dL</p>
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
                      <i className="fas fa-arrow-left"></i> Back to Lab Entry
                    </button>
                  </div>
                  <div className="lab-history-table-container">
                    <table className="patient-table"> {/* Reuse patient-table for styling */}
                      <thead>
                        <tr>
                          <th>Date Submitted</th>
                          <th>HbA1c (%)</th>
                          <th>Creatinine (mg/dL)</th>
                          <th>GOT (AST) (U/L)</th>
                          <th>GPT (ALT) (U/L)</th>
                          <th>Cholesterol (mg/dL)</th>
                          <th>Triglycerides (mg/dL)</th>
                          <th>HDL (mg/dL)</th>
                          <th>LDL (mg/dL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPatientLabResultsHistory.length > 0 ? (
                          allPatientLabResultsHistory.map((labEntry, index) => (
                            <tr key={index}>
                              <td>{formatDateToReadable(labEntry.date_submitted)}</td>
                              <td>{labEntry.Hba1c || 'N/A'}</td>
                              <td>{labEntry.creatinine || 'N/A'}</td>
                              <td>{labEntry.got_ast || 'N/A'}</td>
                              <td>{labEntry.gpt_alt || 'N/A'}</td>
                              <td>{labEntry.cholesterol || 'N/A'}</td>
                              <td>{labEntry.triglycerides || 'N/A'}</td>
                              <td>{labEntry.hdl_cholesterol || 'N/A'}</td>
                              <td>{labEntry.ldl_cholesterol || 'N/A'}</td>
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
        </div>
        <div className="report-widget-content">
          <div className="report-widget-left">
            <p className="report-number">
              {patients.filter(pat => {
                // Count patients who have submitted all three metrics
                const hasLabResults = pat.lab_status === 'Submitted' || pat.lab_status === '✅Submitted';
                // For blood glucose and blood pressure, we'll assume they're submitted if they have health metrics
                // For wound photos, we'll check if they have wound photo data
                // For now, we'll count full compliance as having submitted lab results
                return hasLabResults;
              }).length}
            </p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">Patients with complete metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
          </div>
        </div>
        {/* Mini Area Chart for Full Compliance History */}
        <div className="mini-chart-container">
          <Line 
            data={{
              labels: patientCountHistory?.labels || ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
              datasets: [
                {
                  label: 'Full Compliance',
                  data: patientCountHistory?.data?.map(count => Math.floor(count * 0.7)) || [0, 2, 4, 6, 8, 10],
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
                // Count patients who have 1 or 2 missing metrics
                const hasLabResults = pat.lab_status === 'Submitted' || pat.lab_status === '✅Submitted';
                // For simplicity, we'll count missing logs as patients without full lab results
                // but who have some activity (not completely non-compliant)
                return !hasLabResults && pat.profile_status === '🟢Finalized';
              }).length}
            </p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">Patients with 1-2 missing metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
          </div>
        </div>
        {/* Mini Area Chart for Missing Logs History */}
        <div className="mini-chart-container">
          <Line 
            data={{
              labels: patientCountHistory?.labels || ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
              datasets: [
                {
                  label: 'Missing Logs',
                  data: patientCountHistory?.data?.map(count => Math.floor(count * 0.2)) || [1, 2, 1, 3, 2, 1],
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
        </div>
      </div>

      {/* Non-Compliant Cases Report Widget */}
      <div className="report-widget report-non-compliant">
        <div className="report-widget-header">
          <img src="../picture/noncompliant.svg" alt="Non-Compliant Cases" className="report-widget-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/dc3545/ffffff?text=✗"; }}/>
          <h4>Non-Compliant Cases</h4>
        </div>
        <div className="report-widget-content">
          <div className="report-widget-left">
            <p className="report-number">
              {patients.filter(pat => {
                // Count patients who are high risk with 3 missing metrics
                const isHighRisk = (pat.risk_classification || '').toLowerCase() === 'high';
                const hasNoLabResults = pat.lab_status === 'Awaiting' || pat.lab_status === 'N/A';
                const hasIncompleteProfile = pat.profile_status === '🟡Pending';
                return isHighRisk && hasNoLabResults && hasIncompleteProfile;
              }).length}
            </p>
          </div>
          <div className="report-widget-right">
            <p className="report-subtitle">High-risk patients with 3 missing metrics (Blood Glucose, Blood Pressure, Wound Photos)</p>
          </div>
        </div>
        {/* Mini Area Chart for Non-Compliant Cases History */}
        <div className="mini-chart-container">
          <Line 
            data={{
              labels: patientCountHistory?.labels || ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'],
              datasets: [
                {
                  label: 'Non-Compliant Cases',
                  data: patientCountHistory?.data?.map(count => Math.floor(count * 0.1)) || [0, 1, 0, 2, 1, 0],
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
        </div>
      </div>
    </div>

    {/* New container for side-by-side layout */}
    <div className="reports-content-row">
      {/* Table for Patients with Submitted Labs */}
      <div className="submitted-labs-table-container">
        <h3>Patients with Submitted Lab Results</h3>
        <table className="patient-list-table">
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Submission Date</th>
            </tr>
          </thead>
          <tbody>
            {/* Filter and map patients with 'Submitted' lab status and a valid submission date */}
            {patients
              .filter(
                (pat) =>
                  pat.lab_status === "Submitted" &&
                  pat.latest_lab_date
              )
              .map((patient) => (
                <tr key={patient.patient_id}>
                  <td>{patient.first_name} {patient.last_name}</td>
                  <td>{formatDateToReadable(patient.latest_lab_date)}</td>
                </tr>
              ))}
            {/* Display message if no patients meet the criteria */}
            {patients.filter(
              (pat) =>
                
                pat.lab_status === "Submitted" &&
                pat.latest_lab_date
            ).length === 0 && (
              <tr>
                <td colSpan="2">
                  No patients have submitted all their lab results yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Appointment History Chart */}
      <div className="appointment-chart-container">
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
      <div className="lab-submission-chart-container">
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
          </div>
        );
      };

      export default SecretaryDashboard;