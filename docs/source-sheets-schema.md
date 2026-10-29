# Source Sheets: URLs, Schemas, and Structure

This document inventories every external Google Sheets source configured for the Numbers Template data pipeline. The source of truth for spreadsheet IDs, tab names, tab IDs (GIDs), and expected ordered headers is [`server/sheets.json`](../server/sheets.json).

> Scope: this is the application’s declared source contract. Header names and tab locations are taken from configuration; field types, nullability, formulas, and live row-level contents are not declared there. Grain descriptions below are inferred from the configured names and fields.

## Index

| Key | Tab | Spreadsheet / tab URL | Expected columns |
|---|---|---|---:|
| `sessions` | Sessions | [Open source](https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=2108019763) | 26 |
| `recurring` | Recurring | [Open source](https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=0) | 36 |
| `teacher_recurring` | Teacher Recurring | [Open source](https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=1778490418) | 36 |
| `sales` | Sales | [Open source](https://docs.google.com/spreadsheets/d/1HbGnJk-peffUp7XoXSlsL55924E9yUt8cP_h93cdTT0/edit#gid=0) | 49 |
| `new` | New | [Open source](https://docs.google.com/spreadsheets/d/149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI/edit#gid=1398234978) | 46 |
| `payroll` | Payroll | [Open source](https://docs.google.com/spreadsheets/d/149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI/edit#gid=1898477983) | 31 |
| `lapsed` | Lapsed | [Open source](https://docs.google.com/spreadsheets/d/1x-0iFgnYmEqt-b2MfAgHVx5CErcX5NtZYB9p5Rh6f1I/edit#gid=0) | 38 |
| `bookings` | Bookings | [Open source](https://docs.google.com/spreadsheets/d/1OO-Pk7P__1uqsRdmFZ82JBl4-LGPPr7MCTbwKgeLqL0/edit#gid=0) | 29 |
| `leads` | Leads | [Open source](https://docs.google.com/spreadsheets/d/1dQMNF69WnXVQdhlLvUZTig3kL97NA21k6eZ9HRu6xiQ/edit#gid=256104486) | 26 |
| `checkins` | Checkins | [Open source](https://docs.google.com/spreadsheets/d/1a7XKv2WCog7o8nYuV8YcFdqtfPYJNRO6DelJ6Hn_z6Q/edit#gid=0) | 28 |
| `meta` | Meta | [Open source](https://docs.google.com/spreadsheets/d/1mfZQlccKdAVHzkP2eo_HpHK6lZe6Y0oQbtaVS9o6aeI/edit#gid=1995330774) | 29 |

## Sheet details

### 1. Sessions (`sessions`)

- **URL:** [https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=2108019763](https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=2108019763)
- **Spreadsheet ID:** `16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys`
- **Tab GID:** `2108019763` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 26, in the following order.
- **Structure / likely grain:** Session-level class schedule and attendance, capacity, revenue, location, and sales-channel measures.

| Position | Header |
|---:|---|
| 1 | `TrainerID` |
| 2 | `FirstName` |
| 3 | `LastName` |
| 4 | `Trainer` |
| 5 | `SessionID` |
| 6 | `SessionName` |
| 7 | `Capacity` |
| 8 | `CheckedIn` |
| 9 | `LateCancelled` |
| 10 | `Booked` |
| 11 | `Complimentary` |
| 12 | `Location` |
| 13 | `Date` |
| 14 | `Day` |
| 15 | `Time` |
| 16 | `Revenue` |
| 17 | `NonPaid` |
| 18 | `UniqueID1` |
| 19 | `UniqueID2` |
| 20 | `Memberships` |
| 21 | `Packages` |
| 22 | `IntroOffers` |
| 23 | `SingleClasses` |
| 24 | `Type` |
| 25 | `Class` |
| 26 | `Classes` |

### 2. Recurring (`recurring`)

- **URL:** [https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=0](https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=0)
- **Spreadsheet ID:** `16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys`
- **Tab GID:** `0` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 36, in the following order.
- **Structure / likely grain:** Recurring class summary with session-level fields plus aggregate attendance, capacity, fill, and trainer ranking measures.

| Position | Header |
|---:|---|
| 1 | `TrainerID` |
| 2 | `FirstName` |
| 3 | `LastName` |
| 4 | `Trainer` |
| 5 | `SessionID` |
| 6 | `SessionName` |
| 7 | `Capacity` |
| 8 | `CheckedIn` |
| 9 | `LateCancelled` |
| 10 | `Booked` |
| 11 | `Complimentary` |
| 12 | `Location` |
| 13 | `Date` |
| 14 | `Day` |
| 15 | `Time` |
| 16 | `Revenue` |
| 17 | `NonPaid` |
| 18 | `UniqueID1` |
| 19 | `UniqueID2` |
| 20 | `Memberships` |
| 21 | `Packages` |
| 22 | `IntroOffers` |
| 23 | `SingleClasses` |
| 24 | `Type` |
| 25 | `Class` |
| 26 | `Classes` |
| 27 | `EmptySessions` |
| 28 | `NonEmptySessions` |
| 29 | `TotalCheckedInSum` |
| 30 | `TotalCapacitySum` |
| 31 | `TotalRevenueSum` |
| 32 | `ClassAvgInclEmpty` |
| 33 | `ClassAvgExclEmpty` |
| 34 | `FillRate` |
| 35 | `WeightedAverage` |
| 36 | `Top5Trainers` |

### 3. Teacher Recurring (`teacher_recurring`)

- **URL:** [https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=1778490418](https://docs.google.com/spreadsheets/d/16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys/edit#gid=1778490418)
- **Spreadsheet ID:** `16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys`
- **Tab GID:** `1778490418` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 36, in the following order.
- **Structure / likely grain:** Teacher-level recurring class summary with session-level fields plus aggregate performance measures.

| Position | Header |
|---:|---|
| 1 | `TrainerID` |
| 2 | `FirstName` |
| 3 | `LastName` |
| 4 | `Trainer` |
| 5 | `SessionID` |
| 6 | `SessionName` |
| 7 | `Capacity` |
| 8 | `CheckedIn` |
| 9 | `LateCancelled` |
| 10 | `Booked` |
| 11 | `Complimentary` |
| 12 | `Location` |
| 13 | `Date` |
| 14 | `Day` |
| 15 | `Time` |
| 16 | `Revenue` |
| 17 | `NonPaid` |
| 18 | `UniqueID1` |
| 19 | `UniqueID2` |
| 20 | `Memberships` |
| 21 | `Packages` |
| 22 | `IntroOffers` |
| 23 | `SingleClasses` |
| 24 | `Type` |
| 25 | `Class` |
| 26 | `Classes` |
| 27 | `TotalSessions` |
| 28 | `EmptySessions` |
| 29 | `NonEmptySessions` |
| 30 | `TotalCheckedInSum` |
| 31 | `TotalCapacitySum` |
| 32 | `TotalRevenueSum` |
| 33 | `ClassAvgInclEmpty` |
| 34 | `ClassAvgExclEmpty` |
| 35 | `FillRate` |
| 36 | `WeightedAverage` |

### 4. Sales (`sales`)

- **URL:** [https://docs.google.com/spreadsheets/d/1HbGnJk-peffUp7XoXSlsL55924E9yUt8cP_h93cdTT0/edit#gid=0](https://docs.google.com/spreadsheets/d/1HbGnJk-peffUp7XoXSlsL55924E9yUt8cP_h93cdTT0/edit#gid=0)
- **Spreadsheet ID:** `1HbGnJk-peffUp7XoXSlsL55924E9yUt8cP_h93cdTT0`
- **Tab GID:** `0` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 49, in the following order.
- **Structure / likely grain:** Sale or sale-item transaction records, including payment, product, discount, location, and membership details.

| Position | Header |
|---:|---|
| 1 | `Member ID` |
| 2 | `Customer Name` |
| 3 | `Customer Email` |
| 4 | `Paying Member ID` |
| 5 | `Sale Item ID` |
| 6 | `Payment Date` |
| 7 | `Payment Value` |
| 8 | `Paid In Money` |
| 9 | `Credits` |
| 10 | `Payment VAT` |
| 11 | `Payment Status` |
| 12 | `Payment Method` |
| 13 | `Payment Transaction ID` |
| 14 | `Stripe Token` |
| 15 | `Sold By` |
| 16 | `Sale Reference` |
| 17 | `Calculated Location` |
| 18 | `Cleaned Product` |
| 19 | `Cleaned Category` |
| 20 | `Host Id` |
| 21 | `Purchase Type` |
| 22 | `Payment Source` |
| 23 | `Paid In Event Credits` |
| 24 | `Price Excluding VAT In Currency` |
| 25 | `Discount Value In Currency` |
| 26 | `Discount Code` |
| 27 | `Created At` |
| 28 | `Modified At` |
| 29 | `Sale ID` |
| 30 | `Sale Total Discount Value` |
| 31 | `Sale Item Quantity` |
| 32 | `Sale Item Unit Price Including VAT` |
| 33 | `Sale Item Unit Price Excluding VAT` |
| 34 | `Sale Item Unit VAT Amount` |
| 35 | `Sale Item Unit Discount Value` |
| 36 | `Sec. Is Voided` |
| 37 | `Sec. Membership ID` |
| 38 | `Sec. Membership Start Date` |
| 39 | `Sec. Membership End Date` |
| 40 | `Sec. Membership Total Classes` |
| 41 | `Sec. Membership Classes Left` |
| 42 | `Sec. Membership Total Money` |
| 43 | `Sec. Membership Money Left` |
| 44 | `Sec. Membership Type` |
| 45 | `Sec. Membership Is Freezed` |
| 46 | `Sec. Membership Used Session Credits` |
| 47 | `Sec. Membership Revenue Per Event Credit Incl VAT` |
| 48 | `Sec. Membership Activated On First Use` |
| 49 | `Sec. Membership Name` |

### 5. New (`new`)

- **URL:** [https://docs.google.com/spreadsheets/d/149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI/edit#gid=1398234978](https://docs.google.com/spreadsheets/d/149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI/edit#gid=1398234978)
- **Spreadsheet ID:** `149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI`
- **Tab GID:** `1398234978` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 46, in the following order.
- **Structure / likely grain:** New-member or first-visit cohort records with post-trial visits, purchases, conversion, retention, and lifecycle attributes.

| Position | Header |
|---:|---|
| 1 | `Member Id` |
| 2 | `First Name` |
| 3 | `Last Name` |
| 4 | `Email` |
| 5 | `Phone Number` |
| 6 | `First Visit Date` |
| 7 | `First Visit Entity Name` |
| 8 | `First Visit Type` |
| 9 | `First Visit Location` |
| 10 | `Payment Method` |
| 11 | `Membership Used` |
| 12 | `Home Location` |
| 13 | `Class No` |
| 14 | `Trainer Name` |
| 15 | `Is New` |
| 16 | `Visits Post Trial` |
| 17 | `Visits Post Trial Same Month` |
| 18 | `Late Cancellations Post Trial` |
| 19 | `Memberships Bought Post Trial` |
| 20 | `Purchase Count Post Trial` |
| 21 | `First Purchase Post Trial` |
| 22 | `First Purchase Value` |
| 23 | `Ltv` |
| 24 | `Retention Status` |
| 25 | `Conversion Status` |
| 26 | `First Purchase Date` |
| 27 | `No of Visits` |
| 28 | `Last Visit Date` |
| 29 | `Days Since Last Visit` |
| 30 | `Conversion Span (Days)` |
| 31 | `Days To Second Visit` |
| 32 | `Unique Locations Visited Post Trial` |
| 33 | `Month Year` |
| 34 | `Source` |
| 35 | `Ltv Post Trial` |
| 36 | `Avg Purchase Value Post Trial` |
| 37 | `Last Purchase Date` |
| 38 | `Last Purchase Value` |
| 39 | `Total Purchases All Time` |
| 40 | `Days Active` |
| 41 | `Visits Per Month` |
| 42 | `Late Cancel Rate Post Trial` |
| 43 | `First Visit Day` |
| 44 | `First Visit Time Slot` |
| 45 | `Conversion Speed Bucket` |
| 46 | `Lifecycle Status` |

### 6. Payroll (`payroll`)

- **URL:** [https://docs.google.com/spreadsheets/d/149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI/edit#gid=1898477983](https://docs.google.com/spreadsheets/d/149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI/edit#gid=1898477983)
- **Spreadsheet ID:** `149ILDqovzZA6FRUJKOwzutWdVqmqWBtWPfzG3A0zxTI`
- **Tab GID:** `1898477983` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 31, in the following order.
- **Structure / likely grain:** Teacher-by-period operational and commercial totals, grouped by class format and conversion/retention measures.

| Position | Header |
|---:|---|
| 1 | `Teacher ID` |
| 2 | `Teacher Name` |
| 3 | `Teacher Email` |
| 4 | `Location` |
| 5 | `Cycle Sessions` |
| 6 | `Empty Cycle Sessions` |
| 7 | `Non-Empty Cycle Sessions` |
| 8 | `Cycle Customers` |
| 9 | `Cycle Paid` |
| 10 | `Strength Sessions` |
| 11 | `Empty Strength Sessions` |
| 12 | `Non-Empty Strength Sessions` |
| 13 | `Strength Customers` |
| 14 | `Strength Paid` |
| 15 | `Barre Sessions` |
| 16 | `Empty Barre Sessions` |
| 17 | `Non-Empty Barre Sessions` |
| 18 | `Barre Customers` |
| 19 | `Barre Paid` |
| 20 | `Total Sessions` |
| 21 | `Total Empty Sessions` |
| 22 | `Total Non-Empty Sessions` |
| 23 | `Total Customers` |
| 24 | `Total Paid` |
| 25 | `Month Year` |
| 26 | `Unique Key` |
| 27 | `Converted` |
| 28 | `Conversion Rate` |
| 29 | `Retained` |
| 30 | `Retention Rate` |
| 31 | `New` |

### 7. Lapsed (`lapsed`)

- **URL:** [https://docs.google.com/spreadsheets/d/1x-0iFgnYmEqt-b2MfAgHVx5CErcX5NtZYB9p5Rh6f1I/edit#gid=0](https://docs.google.com/spreadsheets/d/1x-0iFgnYmEqt-b2MfAgHVx5CErcX5NtZYB9p5Rh6f1I/edit#gid=0)
- **Spreadsheet ID:** `1x-0iFgnYmEqt-b2MfAgHVx5CErcX5NtZYB9p5Rh6f1I`
- **Tab GID:** `0` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 38, in the following order.
- **Structure / likely grain:** Lapsed membership/customer records with membership dates, attendance, cancellation, freeze, and engagement measures.

| Position | Header |
|---:|---|
| 1 | `Member Name` |
| 2 | `Member ID` |
| 3 | `Member Email` |
| 4 | `Member Phone` |
| 5 | `Host ID` |
| 6 | `Status` |
| 7 | `Membership Name` |
| 8 | `Sessions Limit` |
| 9 | `Purchase Date` |
| 10 | `Start Date` |
| 11 | `End Date` |
| 12 | `Churned Date` |
| 13 | `Amount Paid` |
| 14 | `Discount Code` |
| 15 | `Discount Value` |
| 16 | `Original Amount (Before Discount)` |
| 17 | `Sold By` |
| 18 | `Created By` |
| 19 | `Most Recent Visit Date` |
| 20 | `First Visit Date` |
| 21 | `Total Sessions Completed` |
| 22 | `Sessions Used %` |
| 23 | `Remaining Sessions` |
| 24 | `Total Cancellations` |
| 25 | `Late Cancellations` |
| 26 | `No Shows` |
| 27 | `Cancellation Rate %` |
| 28 | `Preferred Booking Method` |
| 29 | `Primary Location` |
| 30 | `Locations Attended` |
| 31 | `Membership Freeze Count` |
| 32 | `Days Frozen` |
| 33 | `Membership Duration (Days)` |
| 34 | `Days Active` |
| 35 | `Days Since Last Visit` |
| 36 | `Average Sessions Per Month` |
| 37 | `Revenue Per Session` |
| 38 | `Attendance Rate %` |

### 8. Bookings (`bookings`)

- **URL:** [https://docs.google.com/spreadsheets/d/1OO-Pk7P__1uqsRdmFZ82JBl4-LGPPr7MCTbwKgeLqL0/edit#gid=0](https://docs.google.com/spreadsheets/d/1OO-Pk7P__1uqsRdmFZ82JBl4-LGPPr7MCTbwKgeLqL0/edit#gid=0)
- **Spreadsheet ID:** `1OO-Pk7P__1uqsRdmFZ82JBl4-LGPPr7MCTbwKgeLqL0`
- **Tab GID:** `0` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 29, in the following order.
- **Structure / likely grain:** Booking or session-attendance records with customer, session, payment, cancellation, teacher, and class attributes.

| Position | Header |
|---:|---|
| 1 | `Member Id` |
| 2 | `Sale Date` |
| 3 | `Customer Name` |
| 4 | `Customer Email` |
| 5 | `Sale Value` |
| 6 | `Sale Item` |
| 7 | `Sale Id` |
| 8 | `Session Date` |
| 9 | `Payment Method` |
| 10 | `Membership Used` |
| 11 | `Stripe Token` |
| 12 | `Refunded` |
| 13 | `Vat` |
| 14 | `Location Name` |
| 15 | `Sold By` |
| 16 | `Cancelled` |
| 17 | `Late Cancelled` |
| 18 | `No Show` |
| 19 | `Trainer Id` |
| 20 | `Teacher Name` |
| 21 | `Cleaned Class` |
| 22 | `Attended` |
| 23 | `Class No` |
| 24 | `Is New` |
| 25 | `Day Of Week` |
| 26 | `Time Slot` |
| 27 | `Host Id` |
| 28 | `UniqueID1` |
| 29 | `UniqueID2` |

### 9. Leads (`leads`)

- **URL:** [https://docs.google.com/spreadsheets/d/1dQMNF69WnXVQdhlLvUZTig3kL97NA21k6eZ9HRu6xiQ/edit#gid=256104486](https://docs.google.com/spreadsheets/d/1dQMNF69WnXVQdhlLvUZTig3kL97NA21k6eZ9HRu6xiQ/edit#gid=256104486)
- **Spreadsheet ID:** `1dQMNF69WnXVQdhlLvUZTig3kL97NA21k6eZ9HRu6xiQ`
- **Tab GID:** `256104486` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 26, in the following order.
- **Structure / likely grain:** Lead/contact records with acquisition source, conversion, stage, owner, follow-up, center, and channel details.

| Position | Header |
|---:|---|
| 1 | `ID` |
| 2 | `Full Name` |
| 3 | `Phone Number` |
| 4 | `Email` |
| 5 | `Created At` |
| 6 | `Source ID` |
| 7 | `Source Name` |
| 8 | `Member ID` |
| 9 | `Converted To Customer At` |
| 10 | `Stage Name` |
| 11 | `Associate` |
| 12 | `Remarks` |
| 13 | `Follow Up 1 Date` |
| 14 | `Follow Up Comments (1)` |
| 15 | `Follow Up 2 Date` |
| 16 | `Follow Up Comments (2)` |
| 17 | `Follow Up 3 Date` |
| 18 | `Follow Up Comments (3)` |
| 19 | `Follow Up 4 Date` |
| 20 | `Follow Up Comments (4)` |
| 21 | `Center` |
| 22 | `Class Type` |
| 23 | `Host ID` |
| 24 | `Status` |
| 25 | `Channel` |
| 26 | `Period` |

### 10. Checkins (`checkins`)

- **URL:** [https://docs.google.com/spreadsheets/d/1a7XKv2WCog7o8nYuV8YcFdqtfPYJNRO6DelJ6Hn_z6Q/edit#gid=0](https://docs.google.com/spreadsheets/d/1a7XKv2WCog7o8nYuV8YcFdqtfPYJNRO6DelJ6Hn_z6Q/edit#gid=0)
- **Spreadsheet ID:** `1a7XKv2WCog7o8nYuV8YcFdqtfPYJNRO6DelJ6Hn_z6Q`
- **Tab GID:** `0` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 28, in the following order.
- **Structure / likely grain:** Member-by-session check-in records with payment, attendance, session, class, and teacher attributes.

| Position | Header |
|---:|---|
| 1 | `Member ID` |
| 2 | `First Name` |
| 3 | `Last Name` |
| 4 | `Email` |
| 5 | `Order At` |
| 6 | `Paid` |
| 7 | `Payment Method Name` |
| 8 | `Checked In` |
| 9 | `Complementary` |
| 10 | `Is Late Cancelled` |
| 11 | `Session ID` |
| 12 | `Session Name` |
| 13 | `Capacity` |
| 14 | `Location` |
| 15 | `Date (IST)` |
| 16 | `Day of Week` |
| 17 | `Time` |
| 18 | `Duration (Minutes)` |
| 19 | `Teacher Name` |
| 20 | `Cleaned Product` |
| 21 | `Cleaned Category` |
| 22 | `Cleaned Class` |
| 23 | `Host ID` |
| 24 | `Month Year` |
| 25 | `Class No` |
| 26 | `Is New` |
| 27 | `UniqueID1` |
| 28 | `UniqueID2` |

### 11. Meta (`meta`)

- **URL:** [https://docs.google.com/spreadsheets/d/1mfZQlccKdAVHzkP2eo_HpHK6lZe6Y0oQbtaVS9o6aeI/edit#gid=1995330774](https://docs.google.com/spreadsheets/d/1mfZQlccKdAVHzkP2eo_HpHK6lZe6Y0oQbtaVS9o6aeI/edit#gid=1995330774)
- **Spreadsheet ID:** `1mfZQlccKdAVHzkP2eo_HpHK6lZe6Y0oQbtaVS9o6aeI`
- **Tab GID:** `1995330774` (GID `0` refers to the spreadsheet’s default/first tab.)
- **Expected columns:** 29, in the following order.
- **Structure / likely grain:** Meta advertising performance records at date/account/campaign/ad-set/ad/platform dimensions.

| Position | Header |
|---:|---|
| 1 | `date` |
| 2 | `account_id` |
| 3 | `account_name` |
| 4 | `campaign_id` |
| 5 | `campaign_name` |
| 6 | `objective` |
| 7 | `adset_id` |
| 8 | `adset_name` |
| 9 | `ad_id` |
| 10 | `ad_name` |
| 11 | `publisher_platform` |
| 12 | `impressions` |
| 13 | `reach` |
| 14 | `frequency` |
| 15 | `spend` |
| 16 | `clicks` |
| 17 | `inline_link_clicks` |
| 18 | `ctr` |
| 19 | `cpc` |
| 20 | `cpm` |
| 21 | `leads` |
| 22 | `on_facebook_lead` |
| 23 | `purchases` |
| 24 | `purchase_value` |
| 25 | `add_to_cart` |
| 26 | `initiate_checkout` |
| 27 | `cpl` |
| 28 | `cpa` |
| 29 | `roas` |
