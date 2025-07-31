import React, { useState } from 'react';
import { 
  logAuditEvent, 
  logAuthEvent, 
  logPatientDataChange, 
  logSystemAction,
  logMedicationChange,
  logMetricsSubmission 
} from './auditLogger';

const AuditLogDemo = () => {
  const [message, setMessage] = useState('');

  const generateSampleLogs = async () => {
    try {
      // Sample admin action
      await logSystemAction(
        'admin',
        '550e8400-e29b-41d4-a716-446655440000',
        'Demo Admin',
        'user_management',
        'create',
        'Created new patient account',
        'Admin Dashboard'
      );

      // Sample patient data change
      await logPatientDataChange(
        'doctor',
        '550e8400-e29b-41d4-a716-446655440001',
        'Dr. Demo',
        '123e4567-e89b-12d3-a456-426614174000',
        'profile',
        'edit',
        'Phone: 555-0123',
        'Phone: 555-0124',
        'Patient Overview'
      );

      // Sample medication change
      await logMedicationChange(
        'doctor',
        '550e8400-e29b-41d4-a716-446655440001',
        'Dr. Demo',
        '123e4567-e89b-12d3-a456-426614174000',
        'edit',
        'Metformin 500mg twice daily',
        'Metformin 750mg twice daily',
        'Care Plan Tab'
      );

      // Sample metrics submission
      await logMetricsSubmission(
        'patient',
        '123e4567-e89b-12d3-a456-426614174000',
        'Patient Demo',
        '123e4567-e89b-12d3-a456-426614174000',
        'create',
        { glucose: 120, bp_systolic: 130, bp_diastolic: 80 },
        'Checkup Notes'
      );

      // Sample auth event
      await logAuthEvent(
        'secretary',
        '550e8400-e29b-41d4-a716-446655440002',
        'Secretary Demo',
        'login',
        'Login Page'
      );

      setMessage('Sample audit logs generated successfully!');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Audit Log Demo</h2>
      <p>This demo component allows you to generate sample audit log entries for testing.</p>
      
      <button 
        onClick={generateSampleLogs}
        style={{
          background: '#3182ce',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: '500'
        }}
      >
        Generate Sample Audit Logs
      </button>

      {message && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: message.includes('Error') ? '#fed7d7' : '#c6f6d5',
          color: message.includes('Error') ? '#c53030' : '#2f855a',
          border: `1px solid ${message.includes('Error') ? '#feb2b2' : '#9ae6b4'}`
        }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <h3>What this demo creates:</h3>
        <ul style={{ lineHeight: '1.6' }}>
          <li>Admin creating a new patient account</li>
          <li>Doctor editing patient profile information</li>
          <li>Doctor modifying medication dosage</li>
          <li>Patient submitting health metrics</li>
          <li>Secretary logging into the system</li>
        </ul>
        <p style={{ fontStyle: 'italic', color: '#666' }}>
          After clicking the button, navigate to the Audit Logs tab to see the generated entries.
        </p>
      </div>
    </div>
  );
};

export default AuditLogDemo;
