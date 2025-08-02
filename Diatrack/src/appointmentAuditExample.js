// Example implementation for appointment audit logging
// Add to your appointment management components

import { logAppointmentEvent } from './auditLogger';

const scheduleAppointment = async (appointmentData) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: appointmentData.patientId,
        doctor_id: appointmentData.doctorId,
        appointment_date: appointmentData.date,
        appointment_time: appointmentData.time,
        reason: appointmentData.reason,
        status: 'scheduled',
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;

    // Log appointment scheduling
    await logAppointmentEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      appointmentData.patientId,
      'schedule',
      '',
      JSON.stringify(data),
      'Appointment Scheduler'
    );

    // Continue with success handling...
    
  } catch (error) {
    console.error('Error scheduling appointment:', error);
    
    // Log failed scheduling
    await logAppointmentEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      appointmentData.patientId,
      'schedule',
      '',
      `Failed to schedule: ${error.message}`,
      'Appointment Scheduler'
    );
  }
};

const cancelAppointment = async (appointmentId) => {
  try {
    // Get current appointment data
    const { data: currentData } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    // Update appointment status
    const { data, error } = await supabase
      .from('appointments')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw error;

    // Log appointment cancellation
    await logAppointmentEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      currentData.patient_id,
      'cancel',
      JSON.stringify(currentData),
      JSON.stringify(data),
      'Appointment Manager'
    );

  } catch (error) {
    console.error('Error cancelling appointment:', error);
  }
};

const rescheduleAppointment = async (appointmentId, newDateTime) => {
  try {
    // Get current appointment data
    const { data: currentData } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    // Update appointment
    const { data, error } = await supabase
      .from('appointments')
      .update({
        appointment_date: newDateTime.date,
        appointment_time: newDateTime.time,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw error;

    // Log appointment rescheduling
    await logAppointmentEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      currentData.patient_id,
      'reschedule',
      JSON.stringify(currentData),
      JSON.stringify(data),
      'Appointment Manager'
    );

  } catch (error) {
    console.error('Error rescheduling appointment:', error);
  }
};
