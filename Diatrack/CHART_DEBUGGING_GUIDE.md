# Chart Time Filter Debugging Guide

## Changes Made

### 1. Enhanced Filter Function with Logging
Added comprehensive console logging to the `filterMetricsByTimePeriod` function to help diagnose filtering issues:

```javascript
const filterMetricsByTimePeriod = React.useCallback((metrics, timePeriod) => {
  const now = new Date();
  
  console.log(`[Filter] Filtering ${metrics.length} metrics for period: ${timePeriod}`);
  console.log(`[Filter] Current time: ${now.toISOString()}`);
  
  // ... filter logic with per-metric logging for 'day' filter
  
  console.log(`[Filter] ${filtered.length} metrics after ${timePeriod} filter`);
  // ... more logging
}, []);
```

### 2. Database Fetch Logging
Added logging when fetching health metrics from the database:

```javascript
console.log(`[Health Metrics] Fetched ${historyHealthData.length} health metrics`);
console.log('[Health Metrics] Sample data:', historyHealthData[0]);
console.log('[Health Metrics] Date range:', ...);
```

### 3. Visual Debug Information
Updated all three chart "no data" messages to show diagnostic information:

**Blood Glucose Chart:**
```jsx
<div className="no-chart-data">
  <p>No blood glucose data available for selected time period</p>
  <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
    Total metrics available: {allPatientHealthMetrics.length}<br/>
    Filtered for {glucoseTimeFilter}: {glucoseFilteredMetrics.length}<br/>
    {allPatientHealthMetrics.length > 0 && (
      <>Latest entry: {new Date(allPatientHealthMetrics[...].submission_date).toLocaleString()}</>
    )}
  </p>
</div>
```

**Blood Pressure Chart:**
```jsx
<p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
  Total metrics available: {allPatientHealthMetrics.length}<br/>
  Filtered for {bpTimeFilter}: {bpFilteredMetrics.length}
</p>
```

**Risk Classification Chart:**
```jsx
<p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
  Total metrics available: {allPatientHealthMetrics.length}<br/>
  Filtered for {riskTimeFilter}: {riskFilteredMetrics.length}
</p>
```

## How to Debug

### Step 1: Open Browser Console
1. Navigate to a patient detail view
2. Open browser DevTools (F12)
3. Go to the Console tab

### Step 2: Check Initial Data Load
Look for logs like:
```
[Health Metrics] Fetched X health metrics for patient Y
[Health Metrics] Sample data: {...}
[Health Metrics] Date range: 2025-10-15T... to 2025-10-17T...
```

**What to check:**
- ✅ Are there health metrics being fetched?
- ✅ What's the date range of the data?
- ✅ Is the `submission_date` field populated?

### Step 3: Test Filter Buttons
Click on each filter button (Day, Week, Month) and observe console logs:

**For "Day" filter:**
```
[Filter] Filtering 10 metrics for period: day
[Filter] Current time: 2025-10-17T14:30:00.000Z
[Filter Day] Metric date: 2025-10-17T10:00:00.000Z, 24h ago: 2025-10-16T14:30:00.000Z, Include: true
[Filter Day] Metric date: 2025-10-15T10:00:00.000Z, 24h ago: 2025-10-16T14:30:00.000Z, Include: false
[Filter] 3 metrics after day filter
```

**What to check:**
- ✅ Is the current time correct?
- ✅ Are metric dates being parsed correctly?
- ✅ Is the 24-hour cutoff calculated correctly?
- ✅ Are any metrics passing the filter?

### Step 4: Check Visual Debug Info
If no data shows in the chart, look at the debug information displayed:

```
No blood glucose data available for selected time period
Total metrics available: 10
Filtered for day: 0
Latest entry: 10/15/2025, 10:00:00 AM
```

**What to check:**
- ✅ Total metrics > 0 means data exists in database
- ✅ Filtered count = 0 means filter is too restrictive
- ✅ Latest entry date tells you when the most recent data was submitted

## Common Issues and Solutions

### Issue 1: No Data in Database
**Symptoms:**
```
[Health Metrics] Fetched 0 health metrics for patient X
Total metrics available: 0
```

**Solution:**
- Patient has no health metrics submitted yet
- Need to add health metrics through the patient app or admin interface

### Issue 2: Data Too Old
**Symptoms:**
```
Total metrics available: 10
Filtered for day: 0
Latest entry: 10/10/2025, 3:00:00 PM
```

**Current date:** October 17, 2025

**Solution:**
- All data is older than 24 hours
- Try "Week" or "Month" filter instead
- Or add newer health metrics for testing

### Issue 3: Date Format Issues
**Symptoms:**
```
[Filter Day] Metric date: Invalid Date, 24h ago: 2025-10-16T14:30:00.000Z, Include: false
```

**Solution:**
- The `submission_date` field has an invalid format
- Check database to ensure dates are stored in ISO 8601 format
- Example: `2025-10-17T14:30:00.000Z`

### Issue 4: Timezone Mismatch
**Symptoms:**
- Data shows in "Week" but not "Day"
- Latest entry timestamp seems off

**Solution:**
- Check if dates are stored in UTC
- Verify browser timezone settings
- The filter uses client-side time for comparison

## Testing Checklist

### ✅ Test with Fresh Data
1. Add a health metric entry for the current patient (today)
2. Refresh the patient detail view
3. Select "Day" filter
4. Data should appear

### ✅ Test Date Range Boundaries
**Day Filter (Last 24 hours):**
- Add entry exactly 23 hours ago → Should show ✅
- Add entry exactly 25 hours ago → Should NOT show ❌

**Week Filter (Last 7 days):**
- Add entry 6 days ago → Should show ✅
- Add entry 8 days ago → Should NOT show ❌

**Month Filter (Last 30 days):**
- Add entry 29 days ago → Should show ✅
- Add entry 31 days ago → Should NOT show ❌

### ✅ Test All Three Charts
1. **Blood Glucose Chart:**
   - Requires `blood_glucose` field to be populated
   - Filter: glucoseTimeFilter

2. **Blood Pressure Chart:**
   - Requires `bp_systolic` and `bp_diastolic` fields
   - Filter: bpTimeFilter

3. **Risk Classification Chart:**
   - Requires `risk_classification` field
   - Filter: riskTimeFilter

### ✅ Verify Console Logs
For each filter change, you should see:
```
[Filter] Filtering X metrics for period: day/week/month
[Filter] Current time: ...
[Filter Day] ... (for day filter only)
[Filter] Y metrics after [period] filter
```

## Database Requirements

### Health Metrics Table Schema
```sql
CREATE TABLE health_metrics (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES patients(patient_id),
  blood_glucose DECIMAL,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  risk_classification VARCHAR,
  submission_date TIMESTAMP WITH TIME ZONE,  -- MUST be in ISO format
  wound_photo_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

### Sample Data Insert
```sql
INSERT INTO health_metrics (
  patient_id, 
  blood_glucose, 
  bp_systolic, 
  bp_diastolic, 
  risk_classification, 
  submission_date
) VALUES (
  'patient-uuid-here',
  120.5,
  120,
  80,
  'Low',
  NOW()  -- Current timestamp
);
```

## Quick Test Script

To quickly test if the filter is working, paste this in the browser console after opening a patient detail:

```javascript
// Check available data
console.log('Total metrics:', window.allPatientHealthMetrics?.length || 0);

// Check filtered data for each period
const now = new Date();
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

// This won't work directly, but shows the concept
console.log('Current time:', now.toISOString());
console.log('24h ago:', oneDayAgo.toISOString());
console.log('7d ago:', oneWeekAgo.toISOString());
console.log('30d ago:', oneMonthAgo.toISOString());
```

## Expected Behavior

### ✅ Working Correctly
- Console shows filtering logs
- Debug info shows correct counts
- Chart displays when filtered data > 0
- "No data" message shows when filtered data = 0
- Filter buttons are responsive

### ❌ Not Working
- No console logs appear
- Debug info shows "0" for both total and filtered
- Chart never displays even with data
- Errors in console
- Filter buttons don't respond

## Next Steps If Still Not Working

1. **Share Console Logs:** Copy all `[Filter]` and `[Health Metrics]` logs
2. **Check Database:** Verify actual data in `health_metrics` table
3. **Check Date Format:** Ensure `submission_date` is valid ISO 8601
4. **Browser Timezone:** Check if browser time matches expected timezone
5. **React DevTools:** Inspect `allPatientHealthMetrics` state value

## Success Indicators

When working correctly, you should see:
- ✅ Console logs for filtering
- ✅ Debug counts matching expectations
- ✅ Charts displaying for appropriate time periods
- ✅ Smooth filter transitions
- ✅ No JavaScript errors
