import React, { useState, useRef, useEffect } from 'react';
import './RiskFilter.css';

const RiskFilter = ({ 
  selectedRisk, 
  onRiskChange, 
  showCounts = false, 
  counts = { all: 0, low: 0, moderate: 0, high: 0, ppd: 0 }
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

  const handleOptionSelect = (riskLevel) => {
    onRiskChange(riskLevel);
    setIsDropdownOpen(false);
  };

  const getSelectedLabel = () => {
    switch (selectedRisk) {
      case 'all':
        return 'All Patients';
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
          {showCounts && selectedRisk !== 'all' && (
            <span className="selected-count">({counts[selectedRisk]})</span>
          )}
          <i className={`fas fa-chevron-${isDropdownOpen ? 'up' : 'down'} dropdown-arrow`}></i>
        </button>

        {isDropdownOpen && (
          <div className="filter-dropdown-menu">
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'all' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('all')}
            >
              <span className="filter-option-text">All Patients</span>
              {showCounts && <span className="filter-count">({counts.all})</span>}
            </div>
            
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'low' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('low')}
            >
              <i className="fas fa-circle low-risk-icon"></i>
              <span className="filter-option-text">Low Risk</span>
              {showCounts && <span className="filter-count">({counts.low})</span>}
            </div>
            
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'moderate' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('moderate')}
            >
              <i className="fas fa-circle moderate-risk-icon"></i>
              <span className="filter-option-text">Moderate Risk</span>
              {showCounts && <span className="filter-count">({counts.moderate})</span>}
            </div>
            
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'high' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('high')}
            >
              <i className="fas fa-circle high-risk-icon"></i>
              <span className="filter-option-text">High Risk</span>
              {showCounts && <span className="filter-count">({counts.high})</span>}
            </div>
            
            <div 
              className={`filter-dropdown-item ${selectedRisk === 'ppd' ? 'selected' : ''}`}
              onClick={() => handleOptionSelect('ppd')}
            >
              <i className="fas fa-circle ppd-risk-icon"></i>
              <span className="filter-option-text">PPD</span>
              {showCounts && <span className="filter-count">({counts.ppd})</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskFilter;
