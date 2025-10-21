# Chart Time Filter Fix

## Issue
The time period filters (Day, Week, Month) in the patient detail charts were not showing data correctly, especially for the "Day" filter. The Blood Glucose Level History, Blood Pressure History, and Risk Classification History charts would not display values when the "Day" filter was selected.

## Root Cause
The original `filterMetricsByTimePeriod` function had the following issues:

1. **Incorrect Day Calculation**: Used `Math.ceil(diffTime / (1000 * 60 * 60 * 24))` which would round up any partial day to a full day
2. **Math.abs Issue**: Used `Math.abs(now - metricDate)` which prevented proper date range filtering
3. **Off-by-one Error**: The condition `diffDays <= 1` would include entries from yesterday and today, not just the last 24 hours

### Original Code (Problematic)
```javascript
const filterMetricsByTimePeriod = React.useCallback((metrics, timePeriod) => {
  const now = new Date();
  const filtered = metrics.filter(metric => {
    const metricDate = new Date(metric.submission_date);
    const diffTime = Math.abs(now - metricDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    switch(timePeriod) {
      case 'day':
        return diffDays <= 1;  // ❌ This doesn't work correctly
      case 'week':
        return diffDays <= 7;
      case 'month':
        return diffDays <= 30;
      default:
        return true;
    }
  });
  
  return filtered.sort((a, b) => new Date(a.submission_date) - new Date(b.submission_date));
}, []);
```

## Solution
Rewrote the function to use proper date range comparisons:

### New Code (Fixed)
```javascript
const filterMetricsByTimePeriod = React.useCallback((metrics, timePeriod) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const filtered = metrics.filter(metric => {
    const metricDate = new Date(metric.submission_date);
    const metricDateStart = new Date(metricDate.getFullYear(), metricDate.getMonth(), metricDate.getDate());
    
    switch(timePeriod) {
      case 'day':
        // Show entries from the last 24 hours
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return metricDate >= oneDayAgo && metricDate <= now;
      case 'week':
        // Show entries from the last 7 days
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return metricDate >= oneWeekAgo && metricDate <= now;
      case 'month':
        // Show entries from the last 30 days
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return metricDate >= oneMonthAgo && metricDate <= now;
      default:
        return true;
    }
  });
  
  return filtered.sort((a, b) => new Date(a.submission_date) - new Date(b.submission_date));
}, []);
```

## Key Improvements

### 1. **Accurate Day Filter**
- **Before**: Used `Math.ceil` which rounded up partial days, causing incorrect filtering
- **After**: Uses exact time comparison (last 24 hours from current time)
- **Result**: Shows all entries from the last 24 hours precisely

### 2. **Proper Date Range Filtering**
- **Before**: Used `Math.abs` which calculated distance regardless of direction
- **After**: Uses range comparison (`metricDate >= startDate && metricDate <= now`)
- **Result**: Only shows entries within the specified time window

### 3. **Time Window Definitions**
- **Day**: Last 24 hours from current moment
- **Week**: Last 7 days (168 hours)
- **Month**: Last 30 days (720 hours)

### 4. **Consistent Behavior**
All three filters now use the same logic pattern:
```javascript
const xAgo = new Date(now.getTime() - x * 24 * 60 * 60 * 1000);
return metricDate >= xAgo && metricDate <= now;
```

## Affected Charts

This fix applies to all three patient detail charts that use time period filters:

1. **Blood Glucose Level History**
   - Located in patient detail view
   - Shows blood glucose readings over time
   - Filter buttons: Day | Week | Month

2. **Blood Pressure History**
   - Located in patient detail view
   - Shows systolic/diastolic readings over time
   - Filter buttons: Day | Week | Month

3. **Risk Classification History**
   - Located in patient detail view
   - Shows risk classification changes over time
   - Filter buttons: Day | Week | Month

## Technical Details

### Filter State Management
```javascript
const [glucoseTimeFilter, setGlucoseTimeFilter] = useState('week');
const [bpTimeFilter, setBpTimeFilter] = useState('week');
const [riskTimeFilter, setRiskTimeFilter] = useState('week');
```

### Memoized Filter Results
```javascript
const glucoseFilteredMetrics = React.useMemo(() => 
  filterMetricsByTimePeriod(allPatientHealthMetrics, glucoseTimeFilter),
  [allPatientHealthMetrics, glucoseTimeFilter, filterMetricsByTimePeriod]
);

const bpFilteredMetrics = React.useMemo(() => 
  filterMetricsByTimePeriod(allPatientHealthMetrics, bpTimeFilter),
  [allPatientHealthMetrics, bpTimeFilter, filterMetricsByTimePeriod]
);

const riskFilteredMetrics = React.useMemo(() => 
  filterMetricsByTimePeriod(allPatientHealthMetrics, riskTimeFilter),
  [allPatientHealthMetrics, riskTimeFilter, filterMetricsByTimePeriod]
);
```

## Testing Recommendations

1. **Test Day Filter**
   - Add health metrics entries for today
   - Select "Day" filter
   - Verify that only entries from the last 24 hours appear
   - Verify chart displays correctly with data points

2. **Test Week Filter**
   - Add entries spanning the last week
   - Select "Week" filter
   - Verify that entries from the last 7 days appear
   - Verify older entries are excluded

3. **Test Month Filter**
   - Add entries spanning the last month
   - Select "Month" filter
   - Verify that entries from the last 30 days appear
   - Verify older entries are excluded

4. **Test Edge Cases**
   - Entries from exactly 24 hours ago
   - Entries from exactly 7 days ago
   - Entries from exactly 30 days ago
   - Future entries (should not appear)
   - Very old entries (should not appear in any filter)

5. **Test Empty States**
   - Patient with no health metrics
   - Patient with metrics older than the filter period
   - Verify appropriate "no data" messages appear

## Performance Considerations

- Uses `React.useCallback` to memoize the filter function
- Uses `React.useMemo` to cache filtered results
- Prevents unnecessary re-renders and re-calculations
- Efficient date comparisons using millisecond timestamps

## Data Source
All three charts pull data from the `allPatientHealthMetrics` state, which is populated from the `health_metrics` table in the database:

```javascript
const { data: historyHealthData, error: historyHealthError } = await supabase
  .from('health_metrics')
  .select('blood_glucose, bp_systolic, bp_diastolic, submission_date, risk_classification')
  .eq('patient_id', selectedPatientForDetail.patient_id)
  .order('submission_date', { ascending: true });
```

## Expected Behavior After Fix

✅ **Day Filter**: Shows entries from the last 24 hours  
✅ **Week Filter**: Shows entries from the last 7 days  
✅ **Month Filter**: Shows entries from the last 30 days  
✅ **All filters**: Display correct data points on charts  
✅ **Empty states**: Show appropriate messages when no data matches the filter
