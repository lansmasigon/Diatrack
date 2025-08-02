// Example implementation for lab results audit logging
// Add to your lab results management components

import { logLabResultEvent } from './auditLogger';

const uploadLabResult = async (labResultData, file) => {
  try {
    // Upload file to storage first (if applicable)
    let fileUrl = null;
    if (file) {
      const { data: fileData, error: uploadError } = await supabase.storage
        .from('lab-results')
        .upload(`${labResultData.patientId}/${Date.now()}_${file.name}`, file);
      
      if (uploadError) throw uploadError;
      fileUrl = fileData.path;
    }

    // Insert lab result record
    const { data, error } = await supabase
      .from('lab_results')
      .insert({
        patient_id: labResultData.patientId,
        test_type: labResultData.testType,
        test_date: labResultData.testDate,
        results: labResultData.results,
        file_url: fileUrl,
        uploaded_by: user.id,
        notes: labResultData.notes
      })
      .select()
      .single();

    if (error) throw error;

    // Log lab result upload
    await logLabResultEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      labResultData.patientId,
      'upload',
      '',
      JSON.stringify(data),
      'Lab Results Manager'
    );

    // Continue with success handling...
    
  } catch (error) {
    console.error('Error uploading lab result:', error);
    
    // Log failed upload
    await logLabResultEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      labResultData.patientId,
      'upload',
      '',
      `Failed to upload: ${error.message}`,
      'Lab Results Manager'
    );
  }
};

const updateLabResult = async (labResultId, updatedData) => {
  try {
    // Get current lab result data
    const { data: currentData } = await supabase
      .from('lab_results')
      .select('*')
      .eq('id', labResultId)
      .single();

    // Update lab result
    const { data, error } = await supabase
      .from('lab_results')
      .update({
        ...updatedData,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', labResultId)
      .select()
      .single();

    if (error) throw error;

    // Log lab result update
    await logLabResultEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      currentData.patient_id,
      'update',
      JSON.stringify(currentData),
      JSON.stringify(data),
      'Lab Results Manager'
    );

  } catch (error) {
    console.error('Error updating lab result:', error);
  }
};

const deleteLabResult = async (labResultId) => {
  try {
    // Get current lab result data
    const { data: currentData } = await supabase
      .from('lab_results')
      .select('*')
      .eq('id', labResultId)
      .single();

    // Delete lab result
    const { error } = await supabase
      .from('lab_results')
      .delete()
      .eq('id', labResultId);

    if (error) throw error;

    // Delete associated file if exists
    if (currentData.file_url) {
      await supabase.storage
        .from('lab-results')
        .remove([currentData.file_url]);
    }

    // Log lab result deletion
    await logLabResultEvent(
      user.userType,
      user.id,
      `${user.first_name} ${user.last_name}`,
      currentData.patient_id,
      'delete',
      JSON.stringify(currentData),
      'Lab result deleted',
      'Lab Results Manager'
    );

  } catch (error) {
    console.error('Error deleting lab result:', error);
  }
};
