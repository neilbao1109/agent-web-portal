---
name: Statistics Calculator
description: Perform statistical calculations on record lists using JSONata
version: 1.0.0
allowed-tools:
  - jsonata_eval
---

# Statistics Calculator Skill

This skill uses the `jsonata_eval` tool to perform statistical calculations and aggregations on record lists.

## Overview

JSONata provides powerful built-in functions for statistical operations:
- `$sum()` - Sum of values
- `$average()` - Arithmetic mean
- `$count()` - Count of items
- `$min()` / `$max()` - Minimum/Maximum values
- `$sort()` - Sort arrays
- `$distinct()` - Unique values

## Usage Examples

### Example 1: Basic Aggregations

Calculate sum, average, min, max, and count for a list of numbers:

```json
{
  "expression": "{ 'sum': $sum(values), 'average': $average(values), 'min': $min(values), 'max': $max(values), 'count': $count(values) }",
  "input": {
    "values": [10, 20, 30, 40, 50]
  }
}
```

**Result:**
```json
{
  "sum": 150,
  "average": 30,
  "min": 10,
  "max": 50,
  "count": 5
}
```

### Example 2: Field Extraction and Aggregation

Calculate total sales from order records:

```json
{
  "expression": "{ 'total_sales': $sum(orders.amount), 'order_count': $count(orders), 'average_order': $average(orders.amount) }",
  "input": {
    "orders": [
      { "id": 1, "amount": 100, "product": "A" },
      { "id": 2, "amount": 250, "product": "B" },
      { "id": 3, "amount": 75, "product": "A" },
      { "id": 4, "amount": 300, "product": "C" }
    ]
  }
}
```

**Result:**
```json
{
  "total_sales": 725,
  "order_count": 4,
  "average_order": 181.25
}
```

### Example 3: Group By and Aggregate

Group orders by product and calculate subtotals:

```json
{
  "expression": "orders{ product: { 'product': $keys($)[0], 'total': $sum(amount), 'count': $count(amount), 'orders': $  } }.$each(function($v) { $v })",
  "input": {
    "orders": [
      { "id": 1, "amount": 100, "product": "A" },
      { "id": 2, "amount": 250, "product": "B" },
      { "id": 3, "amount": 75, "product": "A" },
      { "id": 4, "amount": 300, "product": "B" }
    ]
  }
}
```

### Example 4: Percentile Calculation

Calculate median (50th percentile):

```json
{
  "expression": "( $sorted := $sort(values); $len := $count($sorted); $mid := $floor($len / 2); $len % 2 = 1 ? $sorted[$mid] : ($sorted[$mid - 1] + $sorted[$mid]) / 2 )",
  "input": {
    "values": [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]
  }
}
```

**Result:** `4`

### Example 5: Standard Deviation

Calculate variance and standard deviation:

```json
{
  "expression": "( $avg := $average(values); $variance := $average(values.($$ - $avg) ** 2); { 'mean': $avg, 'variance': $variance, 'std_dev': $sqrt($variance) } )",
  "input": {
    "values": [2, 4, 4, 4, 5, 5, 7, 9]
  }
}
```

**Result:**
```json
{
  "mean": 5,
  "variance": 4,
  "std_dev": 2
}
```

### Example 6: Filtering Before Aggregation

Calculate statistics for orders above a threshold:

```json
{
  "expression": "( $filtered := orders[amount > 100]; { 'high_value_count': $count($filtered), 'high_value_total': $sum($filtered.amount), 'percentage': $count($filtered) / $count(orders) * 100 } )",
  "input": {
    "orders": [
      { "amount": 50 },
      { "amount": 150 },
      { "amount": 200 },
      { "amount": 75 },
      { "amount": 300 }
    ]
  }
}
```

**Result:**
```json
{
  "high_value_count": 3,
  "high_value_total": 650,
  "percentage": 60
}
```

### Example 7: Time Series Analysis

Calculate running totals and moving averages:

```json
{
  "expression": "data.$map($, function($v, $i, $a) { { 'date': $v.date, 'value': $v.value, 'running_total': $sum($a[[0..$i]].value), 'moving_avg_3': $i >= 2 ? $average($a[[$i-2..$i]].value) : null } })",
  "input": {
    "data": [
      { "date": "2024-01-01", "value": 100 },
      { "date": "2024-01-02", "value": 150 },
      { "date": "2024-01-03", "value": 120 },
      { "date": "2024-01-04", "value": 180 },
      { "date": "2024-01-05", "value": 200 }
    ]
  }
}
```

### Example 8: Histogram / Frequency Distribution

Count occurrences of each value:

```json
{
  "expression": "( $vals := $distinct(values); $vals.{ $string($): $count(values[$ = $$]) } )",
  "input": {
    "values": ["A", "B", "A", "C", "B", "A", "D", "B", "A"]
  }
}
```

**Result:**
```json
{
  "A": 4,
  "B": 3,
  "C": 1,
  "D": 1
}
```

## Common Statistical Patterns

| Operation | Expression |
|-----------|------------|
| Sum | `$sum(array)` |
| Average | `$average(array)` |
| Count | `$count(array)` |
| Min/Max | `$min(array)` / `$max(array)` |
| Range | `$max(array) - $min(array)` |
| Distinct values | `$distinct(array)` |
| Sort ascending | `$sort(array)` |
| Sort descending | `$sort(array, function($a,$b){$b-$a})` |
| Filter then aggregate | `array[condition]` then `$sum(...)` |
| Extract field | `records.fieldName` |
| Group by | `records{groupField: ...}` |

## Tips

1. Use `$` to reference the current context and `$$` for parent context
2. Chain operations with `.` (dot notation)
3. Use parentheses `(...)` for complex expressions with multiple steps
4. Use `$map()` for element-wise transformations
5. Use `$reduce()` for custom aggregations
6. Filter arrays with predicate expressions: `array[condition]`
