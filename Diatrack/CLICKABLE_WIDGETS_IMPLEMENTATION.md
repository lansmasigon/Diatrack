# Clickable Report Widgets Implementation

## Overview
The report widgets in the Reports section are now clickable and navigate to separate detail pages showing filtered patient data in table views with pagination.

## Changes Made

### 1. Added State Management
- Added `reportDetailView` state to track which widget detail view is active
- Added `currentPageReportDetail` state for pagination in detail views
- Added `REPORT_DETAIL_PER_PAGE` constant (set to 10 items per page)
- Values: `'total-patients'`, `'full-compliance'`, `'missing-logs'`, `'non-compliant'`, or `null`

### 2. Made Widgets Clickable
All four report widgets now have onClick handlers that:
- Set the `reportDetailView` state to the appropriate view
- Navigate to a separate page (`activePage='report-detail'`)
- Reset pagination to page 1
- Apply `cursor: pointer` style for better UX

**Clickable Widgets:**
1. **Total Patients** - Shows all registered patients
2. **Full Compliance** - Shows patients with complete metrics (submitted lab results)
3. **Missing Logs** - Shows patients with 1-2 missing metrics (no lab results but finalized profile)
4. **Non-Compliant Cases** - Shows high-risk patients with 3 missing metrics

### 3. Separate Detail View Pages
Each widget opens a completely separate page (not shown below the widgets) with:
- **Back to Reports** button to return to the reports overview
- **Patient table** with same structure as Patient List section:
  - Patient Name (with avatar)
  - Age/Sex
  - Classification
  - Lab Status
  - Profile Status
  - Last Visit
  - Actions (Enter Labs & View buttons)
- **Pagination component** showing 10 patients per page

### 4. Pagination Implementation
Each detail view includes:
- Uses the existing `Pagination` component from `./components/Pagination`
- Shows 10 patients per page (`REPORT_DETAIL_PER_PAGE = 10`)
- Displays pagination controls only when there are more than 10 patients
- Properly calculates filtered data before pagination
- Shows total items and current page information

### 5. Filter Logic

#### Total Patients
```javascript
// Shows all patients
const paginatedData = patients.slice(startIndex, endIndex);
```

#### Full Compliance
```javascript
// Patients with submitted lab results
const filteredData = patients.filter(pat => {
  const hasLabResults = pat.lab_status === 'Submitted' || pat.lab_status === '✅Submitted';
  return hasLabResults;
});
const paginatedData = filteredData.slice(startIndex, endIndex);
```

#### Missing Logs
```javascript
// Patients without lab results but with finalized profile
const filteredData = patients.filter(pat => {
  const hasLabResults = pat.lab_status === 'Submitted' || pat.lab_status === '✅Submitted';
  return !hasLabResults && pat.profile_status === '🟢Finalized';
});
const paginatedData = filteredData.slice(startIndex, endIndex);
```

#### Non-Compliant Cases
```javascript
// High-risk patients with no lab results and pending profile
const filteredData = patients.filter(pat => {
  const isHighRisk = (pat.risk_classification || '').toLowerCase() === 'high';
  const hasNoLabResults = pat.lab_status === 'Awaiting' || pat.lab_status === 'N/A';
  const hasIncompleteProfile = pat.profile_status === '🟡Pending';
  return isHighRisk && hasNoLabResults && hasIncompleteProfile;
});
const paginatedData = filteredData.slice(startIndex, endIndex);
```

### 6. Action Buttons
Each table row has two action buttons:
- **🧪 Enter Labs** - Opens lab result entry for the patient
- **👁️ View** - Opens detailed patient view

Both buttons properly handle state transitions:
- Close the report detail view (`setReportDetailView(null)`)
- Navigate to the appropriate page
- Set the selected patient

## User Flow

1. **User is on Reports page** viewing the 4 widgets
2. **User clicks on any report widget** (e.g., "Total Patients")
3. **Navigation occurs** to a separate detail page (`activePage='report-detail'`)
4. **Detail page displays:**
   - Back to Reports button
   - Page title (e.g., "Total Patients")
   - Filtered patient table (first 10 patients)
   - Pagination controls (if more than 10 patients)
5. **User can:**
   - Navigate through pages using pagination controls
   - Click "Enter Labs" to add lab results for a patient
   - Click "View" to see full patient details
   - Click "Back to Reports" to return to reports overview
6. **When returning to Reports:**
   - `reportDetailView` is set to `null`
   - `activePage` is set to `'reports'`
   - User sees the original 4 widgets

## Technical Implementation

### Page Navigation
- Widget click sets `activePage='report-detail'` (separate page)
- Each detail view checks: `activePage === 'report-detail' && reportDetailView === 'widget-type'`
- Only one detail view is shown at a time
- Reports overview and detail views never show simultaneously

### Pagination Logic
```javascript
const startIndex = (currentPageReportDetail - 1) * REPORT_DETAIL_PER_PAGE;
const endIndex = startIndex + REPORT_DETAIL_PER_PAGE;
const paginatedData = filteredData.slice(startIndex, endIndex);
```

### Pagination Component Usage
```javascript
<Pagination
  currentPage={currentPageReportDetail}
  totalPages={Math.ceil(filteredData.length / REPORT_DETAIL_PER_PAGE)}
  onPageChange={setCurrentPageReportDetail}
  itemsPerPage={REPORT_DETAIL_PER_PAGE}
  totalItems={filteredData.length}
/>
```

## CSS Classes Used
The implementation uses existing CSS classes from the Patient List section:
- `.report-detail-section`
- `.detail-view-header`
- `.back-to-list-button`
- `.patient-table`
- `.patient-name-cell`
- `.patient-name-container`
- `.patient-avatar-table`
- `.classification-cell`
- `.lab-status-complete`
- `.lab-status-awaiting`
- `.status-complete`
- `.status-incomplete`
- `.patient-actions-cell`
- `.enter-labs-button`
- `.view-button`

## Testing Recommendations

1. Click each widget to verify it navigates to the correct detail page
2. Verify the patient counts match between widget and detail view
3. Test pagination controls to navigate through multiple pages
4. Test "Enter Labs" button functionality from each detail view
5. Test "View" button functionality from each detail view
6. Test "Back to Reports" button returns to reports overview
7. Verify empty states display correctly when no patients match criteria
8. Verify pagination only shows when there are more than 10 patients
9. Test that pagination resets to page 1 when clicking a widget
10. Verify that detail views are completely separate pages (not shown below widgets)
