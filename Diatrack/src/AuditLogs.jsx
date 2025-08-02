import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./AuditLogs.css";
import logo from "../picture/logo.png";

const AuditLogs = ({ onLogout, user }) => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("Admin");
  const [message, setMessage] = useState("");
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(10);

  useEffect(() => {
    if (user && user.first_name && user.last_name) {
      setAdminName(`${user.first_name} ${user.last_name}`);
    }
  }, [user]);

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [auditLogs, searchTerm, filterModule, filterActor, filterAction, filterDate]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) {
        setMessage(`Error fetching audit logs: ${error.message}`);
      } else {
        setAuditLogs(data || []);
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = auditLogs;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.actor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.old_value?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.new_value?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Module filter
    if (filterModule) {
      filtered = filtered.filter(log => log.module === filterModule);
    }

    // Actor filter
    if (filterActor) {
      filtered = filtered.filter(log => log.actor_type === filterActor);
    }

    // Action filter
    if (filterAction) {
      filtered = filtered.filter(log => log.action_type === filterAction);
    }

    // Date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate).toDateString();
      filtered = filtered.filter(log => 
        new Date(log.timestamp).toDateString() === selectedDate
      );
    }

    setFilteredLogs(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterModule("");
    setFilterActor("");
    setFilterAction("");
    setFilterDate("");
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatChangeValue = (oldValue, newValue) => {
    if (!oldValue && !newValue) return <span>N/A</span>;
    
    // Handle simple text values
    if (!oldValue) return <span className="added">Added: {newValue}</span>;
    if (!newValue) return <span className="removed">Removed: {oldValue}</span>;
    
    // Try to parse JSON values for object comparison
    try {
      const oldObj = JSON.parse(oldValue);
      const newObj = JSON.parse(newValue);
      
      // Handle different types of changes
      if (Array.isArray(oldObj) || Array.isArray(newObj)) {
        return <span className="changed">{oldValue} → {newValue}</span>;
      }
      
      // Compare objects and show only changed fields
      const changes = [];
      const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
      
      for (const key of allKeys) {
        const oldVal = oldObj?.[key];
        const newVal = newObj?.[key];
        
        if (oldVal !== newVal) {
          if (oldVal === undefined) {
            changes.push(<div key={`add-${key}`} className="added">{key}: Added "{newVal}"</div>);
          } else if (newVal === undefined) {
            changes.push(<div key={`rem-${key}`} className="removed">{key}: Removed "{oldVal}"</div>);
          } else {
            // Format specific fields for better readability
            if (key === 'password') {
              changes.push(<div key={key} className="changed">{key}: Changed</div>);
            } else if (typeof oldVal === 'string' && typeof newVal === 'string' && 
                      (oldVal.length > 50 || newVal.length > 50)) {
              changes.push(<div key={key} className="changed">{key}: Updated (long text)</div>);
            } else {
              changes.push(<div key={key} className="changed">{key}: "{oldVal}" → "{newVal}"</div>);
            }
          }
        }
      }
      
      return changes.length > 0 ? <div>{changes}</div> : <span>No changes detected</span>;
      
    } catch (e) {
      // If not JSON, handle as simple text
      if (oldValue === newValue) return <span>No changes</span>;
      
      // Truncate long values
      const maxLength = 100;
      const truncateValue = (val) => {
        if (typeof val === 'string' && val.length > maxLength) {
          return val.substring(0, maxLength) + '...';
        }
        return val;
      };
      
      return <span className="changed">"{truncateValue(oldValue)}" → "{truncateValue(newValue)}"</span>;
    }
  };

  const getActorDisplayName = (log) => {
    const role = log.actor_type.charAt(0).toUpperCase() + log.actor_type.slice(1);
    return `${log.actor_name} (${role})`;
  };

  const getSourcePageLink = (sourcePage, log) => {
    if (!sourcePage) return 'N/A';
    
    const pageLinks = {
      'Patient Overview': '#',
      'Checkup Notes': '#',
      'Credential Manager': '#',
      'Care Plan Tab': '#',
      'ML Model Config': '#'
    };

    return pageLinks[sourcePage] || '#';
  };

  // Pagination logic
  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <div className="audit-logs-container">
      {/* Header */}
      <div className="audit-header">
        <div className="header-left">
          <img src={logo} alt="DiaTrack Logo" className="app-logo" />
          <h1 className="app-title">DiaTrack</h1>
        </div>
        <div className="header-center">
          <h2 className="page-title">🔍 Audit Monitoring Page</h2>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-name">{adminName}</span>
            <span className="user-role">Admin</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            ↗
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="audit-main">
        {/* Sidebar Navigation */}
        <div className="audit-sidebar">
          <div className="nav-item active">
            <span className="nav-icon">📊</span>
            Dashboard
          </div>
          <div className="nav-item">
            <span className="nav-icon">👥</span>
            User Management
          </div>
          <div className="nav-item">
            <span className="nav-icon">📋</span>
            Classification
          </div>
          <div className="nav-item">
            <span className="nav-icon">👤</span>
            Accounts
          </div>
          <div className="nav-item current">
            <span className="nav-icon">📝</span>
            Audit Logs
          </div>
          <div className="nav-item">
            <span className="nav-icon">⚙️</span>
            Compliance
          </div>
          <div className="nav-item">
            <span className="nav-icon">🤖</span>
            ML Settings
          </div>
        </div>

        {/* Content Area */}
        <div className="audit-content">
          <div className="content-header">
            <h1 className="content-title">Audit Logs</h1>
            <div className="header-actions">
              <div className="search-container">
                <input
                  type="text"
                  placeholder="Search by name or Patient ID"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <span className="search-icon">🔍</span>
              </div>
              <button 
                className="filter-btn"
                onClick={() => setShowFilters(!showFilters)}
              >
                🎛️ Filter
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="filters-panel">
              <div className="filter-row">
                <select
                  value={filterModule}
                  onChange={(e) => setFilterModule(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Modules</option>
                  <option value="metrics">Metrics</option>
                  <option value="profile">Profile</option>
                  <option value="credentials">Credentials</option>
                  <option value="medications">Medications</option>
                  <option value="appointments">Appointments</option>
                  <option value="ml_settings">ML Settings</option>
                  <option value="lab_results">Lab Results</option>
                  <option value="user_management">User Management</option>
                </select>

                <select
                  value={filterActor}
                  onChange={(e) => setFilterActor(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Actors</option>
                  <option value="admin">Admin</option>
                  <option value="doctor">Doctor</option>
                  <option value="secretary">Secretary</option>
                  <option value="patient">Patient</option>
                  <option value="system">System</option>
                </select>

                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Actions</option>
                  <option value="create">Create</option>
                  <option value="edit">Edit</option>
                  <option value="delete">Delete</option>
                  <option value="reset">Reset</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                </select>

                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="filter-date"
                />

                <button onClick={clearFilters} className="clear-filters-btn">
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {message && (
            <div className="error-message">
              {message}
            </div>
          )}

          {/* Audit Logs Table */}
          {loading ? (
            <div className="loading-spinner">Loading audit logs...</div>
          ) : (
            <div className="table-container">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>UserID</th>
                    <th>Module</th>
                    <th>Action Type</th>
                    <th>Old → New Value</th>
                    <th>Source Page</th>
                  </tr>
                </thead>
                <tbody>
                  {currentLogs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="no-data">
                        No audit logs found
                      </td>
                    </tr>
                  ) : (
                    currentLogs.map((log) => (
                      <tr key={log.log_id}>
                        <td className="timestamp-cell">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="actor-cell">
                          <div className="actor-info">
                            <div className="actor-avatar">
                              {log.actor_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="actor-details">
                              <div className="actor-name">{log.actor_name}</div>
                              <div className="actor-role">{log.actor_type}</div>
                            </div>
                          </div>
                        </td>
                        <td className="user-id-cell">
                          {log.user_id || 'N/A'}
                        </td>
                        <td className="module-cell">
                          <span className={`module-badge module-${log.module}`}>
                            {log.module}
                          </span>
                        </td>
                        <td className="action-cell">
                          <span className={`action-badge action-${log.action_type}`}>
                            {log.action_type}
                          </span>
                        </td>
                        <td className="value-cell change-value-cell">
                          {formatChangeValue(log.old_value, log.new_value)}
                        </td>
                        <td className="source-cell">
                          <a 
                            href={getSourcePageLink(log.source_page, log)}
                            className="source-link"
                          >
                            {log.source_page || 'N/A'}
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className="page-btn"
              >
                ← Previous
              </button>
              
              {[...Array(Math.min(5, totalPages))].map((_, index) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = index + 1;
                } else if (currentPage <= 3) {
                  pageNum = index + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + index;
                } else {
                  pageNum = currentPage - 2 + index;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => paginate(pageNum)}
                    className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="page-btn"
              >
                Next →
              </button>

              <div className="page-info">
                Page {currentPage} of {totalPages} ({filteredLogs.length} total)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
