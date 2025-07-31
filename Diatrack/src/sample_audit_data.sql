-- Sample audit log data for testing the Audit Logs page
-- This script inserts sample data to demonstrate the audit logging functionality

INSERT INTO public.audit_logs (
  actor_type, actor_id, actor_name, user_id, module, action_type, 
  old_value, new_value, source_page, ip_address, user_agent, session_id
) VALUES
-- Sample Admin Actions
(
  'secretary', 
  '550e8400-e29b-41d4-a716-446655440001', 
  'Mary Shanley Sencil', 
  '303', 
  'metrics', 
  'edit', 
  'Glucose: 185', 
  'Glucose: 160', 
  'Checkup Notes',
  '192.168.1.100',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_abc123'
),
(
  'doctor', 
  '550e8400-e29b-41d4-a716-446655440002', 
  'Gio Anthony Callos', 
  '304', 
  'profile', 
  'create', 
  'N/A', 
  'Profile Created', 
  'Patient Overview',
  '192.168.1.101',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_def456'
),
(
  'admin', 
  '550e8400-e29b-41d4-a716-446655440003', 
  'Iloy Bugris', 
  '305', 
  'credentials', 
  'reset', 
  NULL, 
  'Password Reset Issued', 
  'Credential Manager',
  '192.168.1.102',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_ghi789'
),
(
  'doctor', 
  '550e8400-e29b-41d4-a716-446655440004', 
  'Mary Shanley Sencil', 
  '306', 
  'medications', 
  'edit', 
  'Dosage: 5mg', 
  'Dosage: 10mg', 
  'Care Plan Tab',
  '192.168.1.103',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_jkl012'
),
(
  'patient', 
  '550e8400-e29b-41d4-a716-446655440005', 
  'Gio Anthony Callos', 
  '307', 
  'metrics', 
  'create', 
  NULL, 
  'BP: 120/80 → BP Logged', 
  'Checkup Notes',
  '192.168.1.104',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_mno345'
),
(
  'secretary', 
  '550e8400-e29b-41d4-a716-446655440006', 
  'Iloy Bugris', 
  '308', 
  'profile', 
  'edit', 
  'Address: Brgy 12', 
  'Address: Brgy 19', 
  'Patient Overview',
  '192.168.1.105',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_pqr678'
),
(
  'doctor', 
  '550e8400-e29b-41d4-a716-446655440007', 
  'Mary Shanley Sencil', 
  '309', 
  'ml_settings', 
  'edit', 
  'Trigger: Daily', 
  'Trigger: Weekly', 
  'ML Model Config',
  '192.168.1.106',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_stu901'
),
(
  'doctor', 
  '550e8400-e29b-41d4-a716-446655440008', 
  'Gio Anthony Callos', 
  '310', 
  'metrics', 
  'delete', 
  'Glucose: 210 Entry', 
  NULL, 
  'Checkup Notes',
  '192.168.1.107',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_vwx234'
),
(
  'admin', 
  '550e8400-e29b-41d4-a716-446655440009', 
  'Iloy Bugris', 
  '311', 
  'metrics', 
  'create', 
  NULL, 
  'Temp Password Generated: 123456', 
  'Checkup Notes',
  '192.168.1.108',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_yza567'
),
(
  'doctor', 
  '550e8400-e29b-41d4-a716-446655440010', 
  'Regine Velasquez', 
  '312', 
  'profile', 
  'edit', 
  'Contact No: 09123456789', 
  'Contact No: 09987654321', 
  'Patient Overview',
  '192.168.1.109',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sess_bcd890'
);

-- Add some older entries for date filtering testing
INSERT INTO public.audit_logs (
  timestamp, actor_type, actor_id, actor_name, user_id, module, action_type, 
  old_value, new_value, source_page
) VALUES
(
  '2025-07-29 14:30:00+00',
  'admin',
  '550e8400-e29b-41d4-a716-446655440011',
  'System Admin',
  '313',
  'user_management',
  'create',
  NULL,
  'New patient account created',
  'User Management'
),
(
  '2025-07-28 09:15:00+00',
  'secretary',
  '550e8400-e29b-41d4-a716-446655440012',
  'Jane Secretary',
  '314',
  'appointments',
  'create',
  NULL,
  'Appointment scheduled for Aug 1, 2025',
  'Appointment Manager'
),
(
  '2025-07-27 16:45:00+00',
  'doctor',
  '550e8400-e29b-41d4-a716-446655440013',
  'Dr. Smith',
  '315',
  'lab_results',
  'create',
  NULL,
  'HbA1c: 7.2%, Cholesterol: 180 mg/dL',
  'Lab Results Portal'
);
