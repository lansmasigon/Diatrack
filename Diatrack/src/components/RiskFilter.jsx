import React, { useState, useRef, useEffect } from 'react';
import './RiskFilter.css';

const RiskFilter = ({ 
  selectedRisk, 
  onRiskChange,
  selectedLabStatus,
  onLabStatusChange,
  selectedProfileStatus,
  onProfileStatusChange,
  showCounts = false, 
  counts = { all: 0, low: 0, moderate: 0, high: 0, ppd: 0 },
  labStatusCounts = { all: 0, awaiting: 0, submitted: 0 },
  profileStatusCounts = { all: 0, pending: 0, finalized: 0 }
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFilterClick = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleOptionSelect = (type, value) => {
    if (type === 'risk') {
      onRiskChange(value);
    } else if (type === 'labStatus' && onLabStatusChange) {
      onLabStatusChange(value);
    } else if (type === 'profileStatus' && onProfileStatusChange) {
      onProfileStatusChange(value);
    }
    setIsDropdownOpen(false);
  };

  const getSelectedLabel = () => {
    // Check which filter is active and return appropriate label
    if (selectedRisk !== 'all') {
      switch (selectedRisk) {
        case 'low':
          return 'Low Risk';
        case 'moderate':
          return 'Moderate Risk';
        case 'high':
          return 'High Risk';
        case 'ppd':
          return 'PPD';
        default:
          return 'All Patients';
      }
    }
    
    if (selectedLabStatus && selectedLabStatus !== 'all') {
      switch (selectedLabStatus) {
        case 'awaiting':
          return 'Awaiting';
        case 'submitted':
          return 'Submitted';
        default:
          return 'All Patients';
      }
    }
    
    if (selectedProfileStatus && selectedProfileStatus !== 'all') {
      switch (selectedProfileStatus) {
        case 'pending':
          return 'Pending';
        case 'finalized':
          return 'Finalized';
        default:
          return 'All Patients';
      }
    }
    
    return 'All Patients';
  };

  const getActiveCount = () => {
    if (selectedRisk !== 'all') {
      return counts[selectedRisk];
    }
    if (selectedLabStatus && selectedLabStatus !== 'all') {
      return labStatusCounts[selectedLabStatus];
    }
    if (selectedProfileStatus && selectedProfileStatus !== 'all') {
      return profileStatusCounts[selectedProfileStatus];
    }
    return counts.all;
  };

  return (
    <div className="risk-filter-container" ref={dropdownRef}>
      <div className="risk-filter-dropdown">
        <button 
          className="filter-dropdown-button"
          onClick={handleFilterClick}
          aria-haspopup="true"
          aria-expanded={isDropdownOpen}
        >
          <i className="fas fa-filter filter-icon"></i>
          Filter: {getSelectedLabel()}
          {(selectedRisk !== 'all' || selectedLabStatus !== 'all' || selectedProfileStatus !== 'all') && showCounts && (
            <span className="selected-count">({getActiveCount()})</span>
          )}
          <i className={`fas fa-chevron-${isDropdownOpen ? 'up' : 'down'} dropdown-arrow`}></i>
        </button>

        {isDropdownOpen && (
          <div className="filter-dropdown-menu">
            {/* All Patients Option */}
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'all' && selectedLabStatus === 'all' && selectedProfileStatus === 'all' ? 'selected' : ''}`}
              onClick={() => {
                onRiskChange('all');
                if (onLabStatusChange) onLabStatusChange('all');
                if (onProfileStatusChange) onProfileStatusChange('all');
                setIsDropdownOpen(false);
              }}
            >
              <span className="filter-option-text">All Patients</span>
              {showCounts && <span className="filter-count">({counts.all})</span>}
            </div>
            
            {/* Low Risk */}
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'low' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('risk', 'low')}
            >
              <i className="fas fa-circle low-risk-icon"></i>
              <span className="filter-option-text">Low Risk</span>
              {showCounts && <span className="filter-count">({counts.low})</span>}
            </div>
            
            {/* Moderate Risk */}
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'moderate' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('risk', 'moderate')}
            >
              <i className="fas fa-circle moderate-risk-icon"></i>
              <span className="filter-option-text">Moderate Risk</span>
              {showCounts && <span className="filter-count">({counts.moderate})</span>}
            </div>
            
            {/* High Risk */}
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'high' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('risk', 'high')}
            >
              <i className="fas fa-circle high-risk-icon"></i>
              <span className="filter-option-text">High Risk</span>
              {showCounts && <span className="filter-count">({counts.high})</span>}
            </div>
            
            {/* PPD */}
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'ppd' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('risk', 'ppd')}
            >
              <i className="fas fa-circle ppd-risk-icon"></i>
              <span className="filter-option-text">PPD</span>
              {showCounts && <span className="filter-count">({counts.ppd})</span>}
            </div>

            {/* Lab Status - Awaiting */}
            {onLabStatusChange && (
              <div 
                className={`filter-dropdown-item ${selectedLabStatus === 'awaiting' ? 'selected' : ''}`}
                onClick={() => handleOptionSelect('labStatus', 'awaiting')}
              >
                <span className="status-icon">❌</span>
                <span className="filter-option-text">Awaiting</span>
                {showCounts && <span className="filter-count">({labStatusCounts.awaiting})</span>}
              </div>
            )}
            
            {/* Lab Status - Submitted */}
            {onLabStatusChange && (
              <div 
                className={`filter-dropdown-item ${selectedLabStatus === 'submitted' ? 'selected' : ''}`}
                onClick={() => handleOptionSelect('labStatus', 'submitted')}
              >
                <span className="status-icon">✅</span>
                <span className="filter-option-text">Submitted</span>
                {showCounts && <span className="filter-count">({labStatusCounts.submitted})</span>}
              </div>
            )}

            {/* Profile Status - Pending */}
            {onProfileStatusChange && (
              <div 
                className={`filter-dropdown-item ${selectedProfileStatus === 'pending' ? 'selected' : ''}`}
                onClick={() => handleOptionSelect('profileStatus', 'pending')}
              >
                <span className="status-icon">🟡</span>
                <span className="filter-option-text">Pending</span>
                {showCounts && <span className="filter-count">({profileStatusCounts.pending})</span>}
              </div>
            )}
            
            {/* Profile Status - Finalized */}
            {onProfileStatusChange && (
              <div 
                className={`filter-dropdown-item ${selectedProfileStatus === 'finalized' ? 'selected' : ''}`}
                onClick={() => handleOptionSelect('profileStatus', 'finalized')}
              >
                <span className="status-icon">🟢</span>
                <span className="filter-option-text">Finalized</span>
                {showCounts && <span className="filter-count">({profileStatusCounts.finalized})</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskFilter;
