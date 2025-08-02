// ✅ FULL AdminDashboard.jsx WITH SIDEBAR LAYOUT

import React, { useState, useEffect } from "react";
import supabase from "./supabaseClient";
import "./AdminDashboard.css";
import logo from "../picture/logo.png"; // Import the logo image
import AuditLogs from "./AuditLogs"; // Import the AuditLogs component
import { logSystemAction, logPatientDataChange } from "./auditLogger"; // Import audit logging functions

const AdminDashboard = ({ onLogout, user }) => {
  const [secretaries, setSecretaries] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard"); // Default to dashboard tab
  const [message, setMessage] = useState("");
  const [adminName, setAdminName] = useState("Admin"); // State for admin name

  const [filteredDoctors, setFilteredDoctors] = useState([]);

  // New state for selected list type in the "List" dropdown
  const [selectedListType, setSelectedListType] = useState("patients"); // Default to showing patients

  // New state to control the dropdown visibility
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [showUsersPopup, setShowUsersPopup] = useState(false);
  const [showMessagePopup, setShowMessagePopup] = useState(false);

  const [doctorForm, setDoctorForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    specialization: "",
    secretaryId: "",
  });

  const [secretaryForm, setSecretaryForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    doctorId: "",
  });

  const [newLinkSecretary, setNewLinkSecretary] = useState("");
  const [newLinkDoctor, setNewLinkDoctor] = useState("");

  // New states for pagination
  const [currentPagePatients, setCurrentPagePatients] = useState(1);
  const [patientsPerPage] = useState(6); // Max 6 items per page

  const [currentPageDoctors, setCurrentPageDoctors] = useState(1);
  const [doctorsPerPage] = useState(6); // Max 6 items per page

  // New states for secretary pagination
  const [currentPageSecretaries, setCurrentPageSecretaries] = useState(1);
  const [secretariesPerPage] = useState(6); // Max 6 items per page

  // New states for patient editing
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [editPatientForm, setEditPatientForm] = useState({
    first_name: "",
    last_name: "",
    password: "",
    date_of_birth: "",
    contact_info: "",
  });

  // New states for doctor editing
  const [editingDoctorId, setEditingDoctorId] = useState(null);
  const [editDoctorForm, setEditDoctorForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "", // Password for doctors too
    specialization: "",
  });

  // New states for secretary editing
  const [editingSecretaryId, setEditingSecretaryId] = useState(null);
  const [editSecretaryForm, setEditSecretaryForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });

  // New state for search queries
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [secretarySearchQuery, setSecretarySearchQuery] = useState('');


  useEffect(() => {
    fetchSecretaries();
    fetchDoctors();
    fetchLinks();
  }, []);

  // Effect to update adminName when the user prop changes
  useEffect(() => {
    if (user && user.first_name && user.last_name) {
      setAdminName(`${user.first_name} ${user.last_name}`);
    } else {
      setAdminName("Admin"); // Fallback if user data isn't complete
    }
  }, [user]);


  // Effect for fetching patients
  useEffect(() => {
    fetchPatients();
  }, [currentPagePatients]); // Re-fetch patients when page changes

  // Effect for fetching doctors with secretary info
  useEffect(() => {
    fetchDoctorsWithSecretaryInfo(); // Call the new function
  }, [currentPageDoctors]); // Re-fetch doctors when page changes

  // Effect for fetching secretaries (for the new table)
  useEffect(() => {
    fetchSecretaries(); // Already fetching all, pagination will slice
  }, [currentPageSecretaries]); // Re-fetch secretaries when page changes


  const fetchSecretaries = async () => {
    const { data, error } = await supabase.from("secretaries").select("*");
    if (error) setMessage(`Error fetching secretaries: ${error.message}`);
    else setSecretaries(data);
  };

  const fetchDoctors = async () => {
    const { data } = await supabase.from("doctors").select("*");
    setDoctors(data);
  };

  const fetchPatients = async () => {
    // Corrected select to join with 'doctors' table using 'preferred_doctor_id'
    let query = supabase.from("patients").select("*, preferred_doctor_id:doctors(first_name, last_name)");
    const { data, error } = await query;
    if (error) setMessage(`Error fetching patients: ${error.message}`);
    else setPatients(data);
  };

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from("secretary_doctor_links")
      .select("link_id, secretary_id, doctor_id, secretaries(first_name, last_name), doctors(first_name, last_name)");
    if (error) setMessage(`Error fetching links: ${error.message}`);
    else setLinks(data);
  };

  // Renamed and modified from fetchDoctorsBySecretary
  const fetchDoctorsWithSecretaryInfo = async () => {
    // Fetch all doctors and their linked secretaries
    const { data, error } = await supabase
      .from("doctors")
      .select("*, secretary_doctor_links(secretaries(first_name, last_name))"); // Join through link table to secretaries

    if (error) {
      setMessage(`Error fetching doctors with secretary info: ${error.message}`);
      setFilteredDoctors([]); // Clear doctors if error
      return;
    }
    setFilteredDoctors(data); // Set all doctors with their secretary info
  };


  const createDoctor = async () => {
    const confirm = window.confirm("Are you sure you want to create this doctor?");
    if (!confirm) {
      setMessage("Doctor creation canceled.");
      return;
    }

    const { data, error } = await supabase
      .from("doctors")
      .insert({
        first_name: doctorForm.firstName,
        last_name: doctorForm.lastName,
        email: doctorForm.email,
        password: doctorForm.password,
        specialization: doctorForm.specialization,
      })
      .select("doctor_id")
      .single();

    if (error) {
      setMessage(`Error creating doctor: ${error.message}`);
      return;
    }

    if (doctorForm.secretaryId) {
      await supabase.from("secretary_doctor_links").insert({
        secretary_id: doctorForm.secretaryId, // Corrected this to use doctorForm.secretaryId
        doctor_id: data.doctor_id,
      });
      
      // Log the linking action
      await logSystemAction(
        'admin',
        user?.admin_id || 'unknown-admin',
        adminName,
        'user_management',
        'create',
        `Linked doctor ${doctorForm.firstName} ${doctorForm.lastName} to secretary`,
        'Admin Dashboard'
      );
    }

    // Log doctor creation
    await logSystemAction(
      'admin',
      user?.admin_id || 'unknown-admin',
      adminName,
      'user_management',
      'create',
      `Created doctor account: ${doctorForm.firstName} ${doctorForm.lastName} (${doctorForm.email})`,
      'Admin Dashboard'
    );

    setMessage("Doctor created and linked successfully!");
    fetchDoctors();
    fetchLinks();
    fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info to update the list
    setDoctorForm({ firstName: "", lastName: "", email: "", password: "", specialization: "", secretaryId: "" }); // Clear form
  };

  const createSecretary = async () => {
    const confirm = window.confirm("Are you sure you want to create this secretary?");
    if (!confirm) {
      setMessage("Secretary creation canceled.");
      return;
    }

    const { data, error } = await supabase
      .from("secretaries")
      .insert({
        first_name: secretaryForm.firstName,
        last_name: secretaryForm.lastName,
        email: secretaryForm.email,
        password: secretaryForm.password,
      })
      .select("secretary_id")
      .single();

    if (error) {
      setMessage(`Error creating secretary: ${error.message}`);
      return;
    }

    if (secretaryForm.doctorId) {
      await supabase.from("secretary_doctor_links").insert({
        secretary_id: data.secretary_id,
        doctor_id: secretaryForm.doctorId,
      });
      
      // Log the linking action
      await logSystemAction(
        'admin',
        user?.admin_id || 'unknown-admin',
        adminName,
        'user_management',
        'create',
        `Linked secretary ${secretaryForm.firstName} ${secretaryForm.lastName} to doctor`,
        'Admin Dashboard'
      );
    }

    // Log secretary creation
    await logSystemAction(
      'admin',
      user?.admin_id || 'unknown-admin',
      adminName,
      'user_management',
      'create',
      `Created secretary account: ${secretaryForm.firstName} ${secretaryForm.lastName} (${secretaryForm.email})`,
      'Admin Dashboard'
    );

    setMessage("Secretary created and linked successfully!");
    fetchSecretaries();
    fetchLinks();
    setSecretaryForm({ firstName: "", lastName: "", email: "", password: "", doctorId: "" }); // Clear form
  };

  const unlinkPair = async (linkId) => {
    const confirm = window.confirm("Are you sure you want to unlink this secretary-doctor pair?");
    if (!confirm) {
      setMessage("Unlinking canceled.");
      return;
    }

    // Get the link details before deleting for audit log
    const { data: linkData } = await supabase
      .from("secretary_doctor_links")
      .select("*, secretaries(first_name, last_name), doctors(first_name, last_name)")
      .eq("link_id", linkId)
      .single();

    const { error } = await supabase.from("secretary_doctor_links").delete().eq("link_id", linkId);
    if (error) setMessage(`Error unlinking: ${error.message}`);
    else {
      // Log the unlinking action
      if (linkData) {
        await logSystemAction(
          'admin',
          user?.admin_id || 'unknown-admin',
          adminName,
          'user_management',
          'delete',
          `Unlinked secretary ${linkData.secretaries?.first_name} ${linkData.secretaries?.last_name} from doctor ${linkData.doctors?.first_name} ${linkData.doctors?.last_name}`,
          'Admin Dashboard'
        );
      }
      
      setMessage("Link removed successfully!");
      fetchLinks();
      fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info to update the list
    }
  };

  const linkNewPair = async (secretaryId, doctorId) => {
    if (!secretaryId || !doctorId) {
      setMessage("Please select both a secretary and a doctor.");
      return;
    }

    const confirm = window.confirm("Are you sure you want to link this secretary to this doctor?");
    if (!confirm) {
      setMessage("Linking canceled.");
      return;
    }

    const { error } = await supabase.from("secretary_doctor_links").insert({
      secretary_id: secretaryId,
      doctor_id: doctorId,
    });

    if (error) setMessage(`Error linking: ${error.message}`);
    else {
      // Get secretary and doctor names for audit log
      const { data: secretaryData } = await supabase
        .from("secretaries")
        .select("first_name, last_name")
        .eq("secretary_id", secretaryId)
        .single();
      
      const { data: doctorData } = await supabase
        .from("doctors")
        .select("first_name, last_name")
        .eq("doctor_id", doctorId)
        .single();

      // Log the linking action
      await logSystemAction(
        'admin',
        user?.admin_id || 'unknown-admin',
        adminName,
        'user_management',
        'create',
        `Linked secretary ${secretaryData?.first_name} ${secretaryData?.last_name} to doctor ${doctorData?.first_name} ${doctorData?.last_name}`,
        'Admin Dashboard'
      );

      setMessage("Link added successfully!");
      setNewLinkSecretary(""); // Clear selection
      setNewLinkDoctor(""); // Clear selection
      fetchLinks();
      fetchDoctorsWithSecretaryInfo(); // Re-fetch doctors with secretary info to update the list
    }
  };

  // Patient editing functions
  const handleEditPatient = (patient) => {
    setEditingPatientId(patient.patient_id);
    setEditPatientForm({
      first_name: patient.first_name,
      last_name: patient.last_name,
      password: "",
      date_of_birth: patient.date_of_birth,
      contact_info: patient.contact_info,
    });
  };

  const handleEditPatientChange = (e) => {
    const { name, value } = e.target;
    setEditPatientForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const savePatientChanges = async () => {
    if (!editingPatientId) return;

    const confirmSave = window.confirm("Are you sure you want to save these changes?");
    if (!confirmSave) {
      setMessage("Patient changes canceled.");
      return;
    }

    const { data: originalPatient } = await supabase
      .from("patients")
      .select("*")
      .eq("patient_id", editingPatientId)
      .single();

    const updates = {
      first_name: editPatientForm.first_name,
      last_name: editPatientForm.last_name,
      date_of_birth: editPatientForm.date_of_birth,
      contact_info: editPatientForm.contact_info,
    };

    if (editPatientForm.password) {
      updates.password = editPatientForm.password;
    }

    const { error } = await supabase
      .from("patients")
      .update(updates)
      .eq("patient_id", editingPatientId);

    if (error) {
      setMessage(`Error updating patient: ${error.message}`);
    } else {
      const changes = [];
      if (originalPatient?.first_name !== editPatientForm.first_name) {
        changes.push(`Name: ${originalPatient?.first_name} → ${editPatientForm.first_name}`);
      }
      if (originalPatient?.last_name !== editPatientForm.last_name) {
        changes.push(`Last Name: ${originalPatient?.last_name} → ${editPatientForm.last_name}`);
      }
      if (originalPatient?.date_of_birth !== editPatientForm.date_of_birth) {
        changes.push(`DOB: ${originalPatient?.date_of_birth} → ${editPatientForm.date_of_birth}`);
      }
      if (originalPatient?.contact_info !== editPatientForm.contact_info) {
        changes.push(`Contact: ${originalPatient?.contact_info} → ${editPatientForm.contact_info}`);
      }
      if (editPatientForm.password) {
        changes.push("Password updated");
      }

      if (changes.length > 0) {
        await logPatientDataChange(
          'admin',
          user?.admin_id || 'unknown-admin',
          adminName,
          editingPatientId,
          'profile',
          'edit',
          changes.join(', '),
          `Updated patient: ${editPatientForm.first_name} ${editPatientForm.last_name}`,
          'Admin Dashboard'
        );
      }

      setMessage("Patient updated successfully!");
      setEditingPatientId(null);
      setEditPatientForm({
        first_name: "",
        last_name: "",
        password: "",
        date_of_birth: "",
        contact_info: "",
      });
      fetchPatients();
    }
  };

  const cancelEdit = () => {
    setEditingPatientId(null);
    setEditPatientForm({
      first_name: "",
      last_name: "",
      password: "",
      date_of_birth: "",
      contact_info: "",
    });
    setMessage("Patient editing canceled.");
  };

  const handleViewPatient = (patient) => {
    alert(`Patient Details:\nName: ${patient.first_name} ${patient.last_name}\nEmail: ${patient.email}\nDate of Birth: ${patient.date_of_birth}\nContact: ${patient.contact_info}`);
  };

  const handleDeletePatient = async (patientId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this patient? This action cannot be undone.");
    if (!confirmDelete) {
      setMessage("Patient deletion canceled.");
      return;
    }

    const { data: patientData } = await supabase
      .from("patients")
      .select("first_name, last_name, email")
      .eq("patient_id", patientId)
      .single();

    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("patient_id", patientId);

    if (error) {
      setMessage(`Error deleting patient: ${error.message}`);
    } else {
      await logPatientDataChange(
        'admin',
        user?.admin_id || 'unknown-admin',
        adminName,
        patientId,
        'profile',
        'delete',
        `Patient: ${patientData?.first_name} ${patientData?.last_name} (${patientData?.email})`,
        'Account deleted',
        'Admin Dashboard'
      );

      setMessage("Patient deleted successfully!");
      fetchPatients();
    }
  };

  // Doctor editing functions
  const handleEditDoctor = (doctor) => {
    setEditingDoctorId(doctor.doctor_id);
    setEditDoctorForm({
      first_name: doctor.first_name,
      last_name: doctor.last_name,
      email: doctor.email,
      password: "",
      specialization: doctor.specialization,
    });
  };

  const handleEditDoctorChange = (e) => {
    const { name, value } = e.target;
    setEditDoctorForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const saveDoctorChanges = async () => {
    if (!editingDoctorId) return;

    const confirmSave = window.confirm("Are you sure you want to save these doctor changes?");
    if (!confirmSave) {
      setMessage("Doctor changes canceled.");
      return;
    }

    const { data: originalDoctor } = await supabase
      .from("doctors")
      .select("*")
      .eq("doctor_id", editingDoctorId)
      .single();

    const updates = {
      first_name: editDoctorForm.first_name,
      last_name: editDoctorForm.last_name,
      email: editDoctorForm.email,
      specialization: editDoctorForm.specialization,
    };

    if (editDoctorForm.password) {
      updates.password = editDoctorForm.password;
    }

    const { error } = await supabase
      .from("doctors")
      .update(updates)
      .eq("doctor_id", editingDoctorId);

    if (error) {
      setMessage(`Error updating doctor: ${error.message}`);
    } else {
      const changes = [];
      if (originalDoctor?.first_name !== editDoctorForm.first_name) {
        changes.push(`Name: ${originalDoctor?.first_name} → ${editDoctorForm.first_name}`);
      }
      if (originalDoctor?.last_name !== editDoctorForm.last_name) {
        changes.push(`Last Name: ${originalDoctor?.last_name} → ${editDoctorForm.last_name}`);
      }
      if (originalDoctor?.email !== editDoctorForm.email) {
        changes.push(`Email: ${originalDoctor?.email} → ${editDoctorForm.email}`);
      }
      if (originalDoctor?.specialization !== editDoctorForm.specialization) {
        changes.push(`Specialization: ${originalDoctor?.specialization} → ${editDoctorForm.specialization}`);
      }
      if (editDoctorForm.password) {
        changes.push("Password updated");
      }

      if (changes.length > 0) {
        await logSystemAction(
          'admin',
          user?.admin_id || 'unknown-admin',
          adminName,
          'user_management',
          'edit',
          `Updated doctor: ${editDoctorForm.first_name} ${editDoctorForm.last_name} - ${changes.join(', ')}`,
          'Admin Dashboard'
        );
      }

      setMessage("Doctor updated successfully!");
      setEditingDoctorId(null);
      setEditDoctorForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        specialization: "",
      });
      fetchDoctorsWithSecretaryInfo();
      fetchDoctors();
    }
  };

  const cancelDoctorEdit = () => {
    setEditingDoctorId(null);
    setEditDoctorForm({
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      specialization: "",
    });
    setMessage("Doctor editing canceled.");
  };

  const handleViewDoctor = (doctor) => {
    alert(`Doctor Details:\nName: ${doctor.first_name} ${doctor.last_name}\nEmail: ${doctor.email}\nSpecialization: ${doctor.specialization}`);
  };

  const handleDeleteDoctor = async (doctorId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this doctor? This action cannot be undone.");
    if (!confirmDelete) {
      setMessage("Doctor deletion canceled.");
      return;
    }

    const { data: doctorData } = await supabase
      .from("doctors")
      .select("first_name, last_name, email, specialization")
      .eq("doctor_id", doctorId)
      .single();

    const { error } = await supabase
      .from("doctors")
      .delete()
      .eq("doctor_id", doctorId);

    if (error) {
      setMessage(`Error deleting doctor: ${error.message}`);
    } else {
      await logSystemAction(
        'admin',
        user?.admin_id || 'unknown-admin',
        adminName,
        'user_management',
        'delete',
        `Deleted doctor: ${doctorData?.first_name} ${doctorData?.last_name} (${doctorData?.email}) - ${doctorData?.specialization}`,
        'Admin Dashboard'
      );

      setMessage("Doctor deleted successfully!");
      fetchDoctorsWithSecretaryInfo();
      fetchDoctors();
      fetchLinks();
    }
  };

  // Secretary editing functions
  const handleEditSecretary = (secretary) => {
    setEditingSecretaryId(secretary.secretary_id);
    setEditSecretaryForm({
      first_name: secretary.first_name,
      last_name: secretary.last_name,
      email: secretary.email,
      password: "",
    });
  };

  const handleEditSecretaryChange = (e) => {
    const { name, value } = e.target;
    setEditSecretaryForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const saveSecretaryChanges = async () => {
    if (!editingSecretaryId) return;

    const confirmSave = window.confirm("Are you sure you want to save these secretary changes?");
    if (!confirmSave) {
      setMessage("Secretary changes canceled.");
      return;
    }

    const { data: originalSecretary } = await supabase
      .from("secretaries")
      .select("*")
      .eq("secretary_id", editingSecretaryId)
      .single();

    const updates = {
      first_name: editSecretaryForm.first_name,
      last_name: editSecretaryForm.last_name,
      email: editSecretaryForm.email,
    };

    if (editSecretaryForm.password) {
      updates.password = editSecretaryForm.password;
    }

    const { error } = await supabase
      .from("secretaries")
      .update(updates)
      .eq("secretary_id", editingSecretaryId);

    if (error) {
      setMessage(`Error updating secretary: ${error.message}`);
    } else {
      const changes = [];
      if (originalSecretary?.first_name !== editSecretaryForm.first_name) {
        changes.push(`Name: ${originalSecretary?.first_name} → ${editSecretaryForm.first_name}`);
      }
      if (originalSecretary?.last_name !== editSecretaryForm.last_name) {
        changes.push(`Last Name: ${originalSecretary?.last_name} → ${editSecretaryForm.last_name}`);
      }
      if (originalSecretary?.email !== editSecretaryForm.email) {
        changes.push(`Email: ${originalSecretary?.email} → ${editSecretaryForm.email}`);
      }
      if (editSecretaryForm.password) {
        changes.push("Password updated");
      }

      if (changes.length > 0) {
        await logSystemAction(
          'admin',
          user?.admin_id || 'unknown-admin',
          adminName,
          'user_management',
          'edit',
          `Updated secretary: ${editSecretaryForm.first_name} ${editSecretaryForm.last_name} - ${changes.join(', ')}`,
          'Admin Dashboard'
        );
      }

      setMessage("Secretary updated successfully!");
      setEditingSecretaryId(null);
      setEditSecretaryForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
      });
      fetchSecretaries();
      fetchLinks();
    }
  };

  const cancelSecretaryEdit = () => {
    setEditingSecretaryId(null);
    setEditSecretaryForm({
      first_name: "",
      last_name: "",
      email: "",
      password: "",
    });
    setMessage("Secretary editing canceled.");
  };

  const handleViewSecretary = (secretary) => {
    alert(`Secretary Details:\nName: ${secretary.first_name} ${secretary.last_name}\nEmail: ${secretary.email}`);
  };

  const handleDeleteSecretary = async (secretaryId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this secretary? This action cannot be undone.");
    if (!confirmDelete) {
      setMessage("Secretary deletion canceled.");
      return;
    }

    const { data: secretaryData } = await supabase
      .from("secretaries")
      .select("first_name, last_name, email")
      .eq("secretary_id", secretaryId)
      .single();

    const { error } = await supabase
      .from("secretaries")
      .delete()
      .eq("secretary_id", secretaryId);

    if (error) {
      setMessage(`Error deleting secretary: ${error.message}`);
    } else {
      await logSystemAction(
        'admin',
        user?.admin_id || 'unknown-admin',
        adminName,
        'user_management',
        'delete',
        `Deleted secretary: ${secretaryData?.first_name} ${secretaryData?.last_name} (${secretaryData?.email})`,
        'Admin Dashboard'
      );

      setMessage("Secretary deleted successfully!");
      fetchSecretaries();
      fetchLinks();
    }
  };

  // Filtering logic for patients
  const filteredPatients = patients.filter(patient => {
    const query = patientSearchQuery.toLowerCase();
    const doctorName = patient.preferred_doctor_id
      ? `${patient.preferred_doctor_id.first_name} ${patient.preferred_doctor_id.last_name}`.toLowerCase()
      : "n/a";
    return (
      patient.first_name.toLowerCase().includes(query) ||
      patient.last_name.toLowerCase().includes(query) ||
      patient.email.toLowerCase().includes(query) ||
      (patient.date_of_birth && patient.date_of_birth.toLowerCase().includes(query)) ||
      (patient.contact_info && patient.contact_info.toLowerCase().includes(query)) ||
      doctorName.includes(query)
    );
  });

  // Filtering logic for doctors
  const filteredDoctorsForSearch = filteredDoctors.filter(doctor => {
    const query = doctorSearchQuery.toLowerCase();
    const secretaryName = doctor.secretary_doctor_links?.[0]?.secretaries
      ? `${doctor.secretary_doctor_links[0].secretaries.first_name} ${doctor.secretary_doctor_links[0].secretaries.last_name}`.toLowerCase()
      : "n/a";
    return (
      doctor.first_name.toLowerCase().includes(query) ||
      doctor.last_name.toLowerCase().includes(query) ||
      doctor.email.toLowerCase().includes(query) ||
      doctor.specialization.toLowerCase().includes(query) ||
      secretaryName.includes(query)
    );
  });

  // Filtering logic for secretaries
  const filteredSecretaries = secretaries.filter(secretary => {
    const query = secretarySearchQuery.toLowerCase();
    return (
      secretary.first_name.toLowerCase().includes(query) ||
      secretary.last_name.toLowerCase().includes(query) ||
      secretary.email.toLowerCase().includes(query)
    );
  });

  // Pagination for patients
  const indexOfLastPatient = currentPagePatients * patientsPerPage;
  const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
  const currentPatients = filteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);

  // Pagination for doctors
  const indexOfLastDoctor = currentPageDoctors * doctorsPerPage;
  const indexOfFirstDoctor = indexOfLastDoctor - doctorsPerPage;
  const currentDoctors = filteredDoctorsForSearch.slice(indexOfFirstDoctor, indexOfLastDoctor);

  // Pagination for secretaries
  const indexOfLastSecretary = currentPageSecretaries * secretariesPerPage;
  const indexOfFirstSecretary = indexOfLastSecretary - secretariesPerPage;
  const currentSecretaries = filteredSecretaries.slice(indexOfFirstSecretary, indexOfLastSecretary);

  return (
    <div className="dashboard-container">
      {/* Global Header */}
      <div className="global-header">
        <div className="header-left">
          <div className="search-container">
            <i className="fas fa-search search-icon"></i>
            <span className="search-text">Audit Monitoring Page</span>
          </div>
        </div>
        <div className="header-right">
          <button className="header-icon">
            <i className="fas fa-cog"></i>
          </button>
          <button className="header-icon" onClick={() => setShowUsersPopup(true)}>
            <i className="fas fa-bell"></i>
          </button>
          <div className="user-profile-header">
            <img src="../picture/secretary.png" alt="User Avatar" className="user-avatar-header" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/40x40/aabbcc/ffffff?text=User"; }}/>
            <div className="user-info-header">
              <span className="user-name-header">{adminName}</span>
              <span className="user-role-header">Admin</span>
            </div>
          </div>
          <button className="header-icon logout-btn" onClick={() => {
            if (window.confirm("Are you sure you want to sign out?")) onLogout();
          }}>
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Sidebar Navigation */}
        <div className="sidebar">
          <div className="sidebar-header">
            <img src={logo} alt="DiaTrack Logo" className="sidebar-logo" />
            <h1 className="sidebar-title">
              <span style={{ color: "#00aaff" }}>Dia</span>
              <span style={{ color: "#ff9800" }}>Track</span>
            </h1>
          </div>
          
          <nav className="sidebar-nav">
            <ul className="nav-menu">
              <li className={activeTab === "dashboard" ? "nav-item active" : "nav-item"} 
                  onClick={() => setActiveTab("dashboard")}>
                <i className="fas fa-tachometer-alt nav-icon"></i>
                <span>Dashboard</span>
              </li>
              <li className={activeTab === "manage" ? "nav-item active" : "nav-item"} 
                  onClick={() => setActiveTab("manage")}>
                <i className="fas fa-users-cog nav-icon"></i>
                <span>Manage</span>
              </li>
              <li className="nav-item dropdown-menu">
                <div className={`nav-item-header ${activeTab === "list" ? "active" : ""}`}
                     onClick={() => {
                       setIsDropdownOpen(!isDropdownOpen);
                       setActiveTab("list");
                     }}>
                  <i className="fas fa-list nav-icon"></i>
                  <span>Masterlist</span>
                  <i className={`fas fa-chevron-down dropdown-arrow ${isDropdownOpen ? "open" : ""}`}></i>
                </div>
                <ul className={`dropdown-submenu ${isDropdownOpen ? "show" : ""}`}>
                  <li onClick={(e) => {
                    e.stopPropagation();
                    setSelectedListType("patients");
                    setActiveTab("list");
                  }}>Patients</li>
                  <li onClick={(e) => {
                    e.stopPropagation();
                    setSelectedListType("doctors");
                    setActiveTab("list");
                  }}>Doctors</li>
                  <li onClick={(e) => {
                    e.stopPropagation();
                    setSelectedListType("secretaries");
                    setActiveTab("list");
                  }}>Secretaries</li>
                </ul>
              </li>
              <li className={activeTab === "accounts" ? "nav-item active" : "nav-item"} 
                  onClick={() => setActiveTab("accounts")}>
                <i className="fas fa-user-friends nav-icon"></i>
                <span>Accounts</span>
              </li>
              <li className={activeTab === "audit" ? "nav-item active" : "nav-item"} 
                  onClick={() => setActiveTab("audit")}>
                <i className="fas fa-clipboard-list nav-icon"></i>
                <span>Audit Logs</span>
              </li>
              <li className={activeTab === "compliance" ? "nav-item active" : "nav-item"} 
                  onClick={() => setActiveTab("compliance")}>
                <i className="fas fa-shield-alt nav-icon"></i>
                <span>Compliance</span>
              </li>
              <li className={activeTab === "ml" ? "nav-item active" : "nav-item"} 
                  onClick={() => setActiveTab("ml")}>
                <i className="fas fa-brain nav-icon"></i>
                <span>ML Settings</span>
              </li>
            </ul>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="main-content">
          {/* Content Header */}
          {activeTab !== "audit" && (
            <div className="content-header">
              <h1 className="page-title">
                {activeTab === "dashboard" && "Welcome, System Admin! 👋"}
                {activeTab === "manage" && "Manage Users"}
                {activeTab === "list" && "Master Lists"}
                {activeTab === "accounts" && "User Accounts"}
                {activeTab === "compliance" && "Compliance Management"}
                {activeTab === "ml" && "ML Settings"}
              </h1>
            </div>
          )}

          {/* Content Body */}
          <div className="content-body">
            {activeTab === "dashboard" && (
              <>
                <div className="summary-widget-grid">
                  <div className="summary-widget total-patients">
                    <div className="summary-widget-icon">
                      <i className="fas fa-users"></i>
                    </div>
                    <div className="summary-widget-content">
                      <h3>Total Patients</h3>
                      <p className="summary-number">{patients.length}</p>
                      <p className="summary-subtitle">Patients registered in the system</p>
                    </div>
                  </div>

                  <div className="summary-widget total-doctors">
                    <div className="summary-widget-icon">
                      <i className="fas fa-user-md"></i>
                    </div>
                    <div className="summary-widget-content">
                      <h3>Total Doctors</h3>
                      <p className="summary-number">{doctors.length}</p>
                      <p className="summary-subtitle">Doctors registered in the system</p>
                    </div>
                  </div>

                  <div className="summary-widget total-secretaries">
                    <div className="summary-widget-icon">
                      <i className="fas fa-user-tie"></i>
                    </div>
                    <div className="summary-widget-content">
                      <h3>Total Secretaries</h3>
                      <p className="summary-number">{secretaries.length}</p>
                      <p className="summary-subtitle">Secretaries registered in the system</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "manage" && (
              <>
                <h2>Create Accounts</h2>
                <div className="panels-container">
                  <div className="left-panel">
                    <h3>Add Doctor</h3>
                    <input placeholder="First Name" value={doctorForm.firstName} onChange={(e) => setDoctorForm({ ...doctorForm, firstName: e.target.value })} />
                    <input placeholder="Last Name" value={doctorForm.lastName} onChange={(e) => setDoctorForm({ ...doctorForm, lastName: e.target.value })} />
                    <input placeholder="Email" value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} />
                    <input placeholder="Password" type="password" value={doctorForm.password} onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} />
                    <input placeholder="Specialization" value={doctorForm.specialization} onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
                    <select value={doctorForm.secretaryId} onChange={(e) => setDoctorForm({ ...doctorForm, secretaryId: e.target.value })}>
                      <option value="">Assign to Secretary (optional)</option>
                      {secretaries.map((sec) => (
                        <option key={sec.secretary_id} value={sec.secretary_id}>
                          {sec.first_name} {sec.last_name}
                        </option>
                      ))}
                    </select>
                    <button className="action-button" onClick={createDoctor}>Create Doctor</button>
                  </div>

                  <div className="right-panel">
                    <h3>Add Secretary</h3>
                    <input placeholder="First Name" value={secretaryForm.firstName} onChange={(e) => setSecretaryForm({ ...secretaryForm, firstName: e.target.value })} />
                    <input placeholder="Last Name" value={secretaryForm.lastName} onChange={(e) => setSecretaryForm({ ...secretaryForm, lastName: e.target.value })} />
                    <input placeholder="Email" value={secretaryForm.email} onChange={(e) => setSecretaryForm({ ...secretaryForm, email: e.target.value })} />
                    <input placeholder="Password" type="password" value={secretaryForm.password} onChange={(e) => setSecretaryForm({ ...secretaryForm, password: e.target.value })} />
                    <select value={secretaryForm.doctorId} onChange={(e) => setSecretaryForm({ ...secretaryForm, doctorId: e.target.value })}>
                      <option value="">Assign to Doctor (optional)</option>
                      {doctors.map((doc) => (
                        <option key={doc.doctor_id} value={doc.doctor_id}>
                          {doc.first_name} {doc.last_name}
                        </option>
                      ))}
                    </select>
                    <button className="action-button" onClick={createSecretary}>Create Secretary</button>
                  </div>
                </div>

                <h2>Existing Secretary-Doctor Links</h2>
                <table className="master-list">
                  <thead>
                    <tr>
                      <th>Secretary Name</th>
                      <th>Doctor Name</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.length > 0 ? (
                      links.map((link) => (
                        <tr key={link.link_id}>
                          <td>{link.secretaries?.first_name} {link.secretaries?.last_name}</td>
                          <td>{link.doctors?.first_name} {link.doctors?.last_name}</td>
                          <td>
                            <button onClick={() => unlinkPair(link.link_id)}>Unlink</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3">No secretary-doctor links found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <h2>Create New Link</h2>
                <div className="link-creation-section">
                  <select value={newLinkSecretary} onChange={(e) => setNewLinkSecretary(e.target.value)}>
                    <option value="">Select Secretary</option>
                    {secretaries.map((sec) => (
                      <option key={sec.secretary_id} value={sec.secretary_id}>
                        {sec.first_name} {sec.last_name}
                      </option>
                    ))}
                  </select>

                  <select value={newLinkDoctor} onChange={(e) => setNewLinkDoctor(e.target.value)}>
                    <option value="">Select Doctor</option>
                    {doctors.map((doc) => (
                      <option key={doc.doctor_id} value={doc.doctor_id}>
                        {doc.first_name} {doc.last_name}
                      </option>
                    ))}
                  </select>

                  <button className="action-button" onClick={() => linkNewPair(newLinkSecretary, newLinkDoctor)}>
                    Link Secretary to Doctor
                  </button>
                </div>
              </>
            )}

            {activeTab === "list" && (
              <>
                {selectedListType === "patients" && (
                  <>
                    <h2>Master List of All Patients</h2>
                    <input
                      type="text"
                      placeholder="Search patients..."
                      className="search-input"
                      value={patientSearchQuery}
                      onChange={(e) => setPatientSearchQuery(e.target.value)}
                    />
                    <table className="master-list">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Assigned Doctor</th>
                          <th>Email</th>
                          <th>Date of Birth</th>
                          <th>Contact Info</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPatients.length > 0 ? (
                          currentPatients.map((pat) => (
                            <tr key={pat.patient_id}>
                              <td>{pat.first_name} {pat.last_name}</td>
                              <td>
                                {pat.preferred_doctor_id ? `${pat.preferred_doctor_id.first_name} ${pat.preferred_doctor_id.last_name}` : "N/A"}
                              </td>
                              <td>{pat.email}</td>
                              <td>{pat.date_of_birth}</td>
                              <td>{pat.contact_info}</td>
                              <td>
                                <button className="edit-btn" onClick={() => handleEditPatient(pat)}>Edit</button>
                                <button className="view-btn" onClick={() => handleViewPatient(pat)}>View</button>
                                <button className="delete-btn" onClick={() => handleDeletePatient(pat.patient_id)}>Delete</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6">No patients found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                )}

                {selectedListType === "doctors" && (
                  <>
                    <h2>Master List of All Doctors</h2>
                    <input
                      type="text"
                      placeholder="Search doctors..."
                      className="search-input"
                      value={doctorSearchQuery}
                      onChange={(e) => setDoctorSearchQuery(e.target.value)}
                    />
                    <table className="master-list">
                      <thead>
                        <tr>
                          <th>Doctor Name</th>
                          <th>Specialization</th>
                          <th>Secretary</th>
                          <th>Email</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDoctors.length > 0 ? (
                          currentDoctors.map((doctor) => (
                            <tr key={doctor.doctor_id}>
                              <td>{doctor.first_name} {doctor.last_name}</td>
                              <td>{doctor.specialization}</td>
                              <td>
                                {doctor.secretary_doctor_links?.[0]?.secretaries
                                  ? `${doctor.secretary_doctor_links[0].secretaries.first_name} ${doctor.secretary_doctor_links[0].secretaries.last_name}`
                                  : "N/A"}
                              </td>
                              <td>{doctor.email}</td>
                              <td>
                                <button className="edit-btn" onClick={() => handleEditDoctor(doctor)}>Edit</button>
                                <button className="view-btn" onClick={() => handleViewDoctor(doctor)}>View</button>
                                <button className="delete-btn" onClick={() => handleDeleteDoctor(doctor.doctor_id)}>Delete</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5">No doctors found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                )}

                {selectedListType === "secretaries" && (
                  <>
                    <h2>Master List of All Secretaries</h2>
                    <input
                      type="text"
                      placeholder="Search secretaries..."
                      className="search-input"
                      value={secretarySearchQuery}
                      onChange={(e) => setSecretarySearchQuery(e.target.value)}
                    />
                    <table className="master-list">
                      <thead>
                        <tr>
                          <th>Secretary Name</th>
                          <th>Email</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSecretaries.length > 0 ? (
                          currentSecretaries.map((sec) => (
                            <tr key={sec.secretary_id}>
                              <td>{sec.first_name} {sec.last_name}</td>
                              <td>{sec.email}</td>
                              <td>
                                <button className="edit-btn" onClick={() => handleEditSecretary(sec)}>Edit</button>
                                <button className="view-btn" onClick={() => handleViewSecretary(sec)}>View</button>
                                <button className="delete-btn" onClick={() => handleDeleteSecretary(sec.secretary_id)}>Delete</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="3">No secretaries found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}

            {activeTab === "audit" && (
              <AuditLogs onLogout={onLogout} user={user} />
            )}

            {activeTab === "accounts" && (
              <div>
                <p>User Accounts management coming soon...</p>
              </div>
            )}

            {activeTab === "compliance" && (
              <div>
                <p>Compliance management features coming soon...</p>
              </div>
            )}

            {activeTab === "ml" && (
              <div>
                <p>Machine Learning settings coming soon...</p>
              </div>
            )}

            {message && <p className="message">{message}</p>}
          </div>
        </div>
      </div>

      {/* Pop-ups */}
      {showUsersPopup && (
        <div className="popup-overlay">
          <div className="popup-content">
            <h3>Notifications</h3>
            <p>You have new notifications!</p>
            <button onClick={() => setShowUsersPopup(false)}>Close</button>
          </div>
        </div>
      )}

      {showMessagePopup && (
        <div className="popup-overlay">
          <div className="popup-content">
            <h3>Messages</h3>
            <p>You have new messages!</p>
            <button onClick={() => setShowMessagePopup(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
