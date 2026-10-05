# Atlas metric dictionary

112 registered metrics. Formulas run in DuckDB against normalised source facts. All UI values use this registry; INR formatting and rate deltas are shared.

Rates aggregate by recomputing numerator / denominator. Revenue sources remain distinct: session recognition, sale payments, membership purchase value, check-in attribution and Payroll attribution are different measures.

| ID | Label | Formula | Original source columns | Format | Aggregation | Minimum sample |
|---|---|---|---|---|---|---|
| `sessions` | Studio sessions | `SUM(sessions)` | Sessions.SessionID | integer | sum | 5 |
| `capacity` | Seats offered | `SUM(capacity)` | Sessions.Capacity | integer | sum | 5 |
| `attendance` | Attendance | `SUM(checked_in)` | Sessions.CheckedIn | integer | sum | 5 |
| `fill_rate` | Fill rate | `(SUM(checked_in)) / NULLIF((SUM(capacity)),0)` | Sessions.CheckedIn, Sessions.Capacity | percent | weighted | 5 |
| `booking_fill_rate` | Booking fill | `(SUM(booked)) / NULLIF((SUM(capacity)),0)` | Sessions.Booked, Sessions.Capacity | percent | weighted | 5 |
| `show_up_rate` | Show-up rate | `(SUM(checked_in)) / NULLIF((SUM(booked)),0)` | Sessions.CheckedIn, Sessions.Booked | percent | weighted | 5 |
| `booked` | Booked seats | `SUM(booked)` | Sessions.Booked | integer | sum | 5 |
| `no_shows` | No-shows | `SUM(booked-checked_in-late_cancelled)` | Sessions.Booked, Sessions.CheckedIn, Sessions.LateCancelled | integer | sum | 5 |
| `no_show_rate` | No-show rate | `(SUM(booked-checked_in-late_cancelled)) / NULLIF((SUM(booked)),0)` | Sessions.Booked, Sessions.CheckedIn, Sessions.LateCancelled | percent | weighted | 5 |
| `late_cancel_rate` | Late-cancel rate | `(SUM(late_cancelled)) / NULLIF((SUM(booked)),0)` | Sessions.LateCancelled, Sessions.Booked | percent | weighted | 5 |
| `avg_class_size_incl` | Average class size | `(SUM(checked_in)) / NULLIF((SUM(sessions)),0)` | Sessions.CheckedIn, Sessions.SessionID | decimal | weighted | 5 |
| `avg_class_size_excl` | Average size, non-empty | `SUM(checked_in)/NULLIF(SUM(CASE WHEN checked_in>0 THEN COALESCE(non_empty,sessions) ELSE 0 END),0)` | Sessions.CheckedIn | decimal | weighted | 5 |
| `empty_sessions` | Empty sessions | `SUM(empty)` | Sessions.CheckedIn | integer | sum | 5 |
| `empty_session_rate` | Empty-session rate | `(SUM(empty)) / NULLIF((SUM(sessions)),0)` | Sessions.CheckedIn, Sessions.SessionID | percent | weighted | 5 |
| `unsold_seats` | Unsold seats | `SUM(capacity)-SUM(checked_in)` | Sessions.Capacity, Sessions.CheckedIn | integer | sum | 5 |
| `overbooked_sessions` | Overbooked sessions | `COUNT(*) FILTER (WHERE booked>capacity)` | Sessions.Booked, Sessions.Capacity | integer | sum | 5 |
| `attendance_cv` | Attendance variability | `STDDEV_POP(checked_in)/NULLIF(AVG(checked_in),0)` | Sessions.CheckedIn | ratio | weighted | 5 |
| `revenue` | Session revenue | `SUM(revenue)` | Sessions.Revenue | currency | sum | 5 |
| `gross_revenue` | Gross revenue | `SUM(revenue)` | Sales.Payment Value | currency | sum | 5 |
| `net_revenue` | Net of VAT | `SUM(net)` | Sales.Price Excluding VAT In Currency | currency | sum | 5 |
| `vat` | VAT | `SUM(vat)` | Sales.Payment VAT | currency | sum | 5 |
| `transactions` | Transactions | `COUNT(DISTINCT sale_id)` | Sales.Sale ID | integer | sum | 5 |
| `units` | Units sold | `SUM(units)` | Sales.Sale Item Quantity | integer | sum | 5 |
| `revenue_per_session` | Revenue / session | `SUM(revenue)/NULLIF(SUM(sessions),0)` | Sessions.Revenue, Sessions.CheckedIn, Sessions.Capacity | currency | weighted | 5 |
| `rev_pac` | Revenue / attendee | `SUM(revenue)/NULLIF(SUM(checked_in),0)` | Sessions.Revenue, Sessions.CheckedIn, Sessions.Capacity | currency | weighted | 5 |
| `rev_pas` | Revenue / seat | `SUM(revenue)/NULLIF(SUM(capacity),0)` | Sessions.Revenue, Sessions.CheckedIn, Sessions.Capacity | currency | weighted | 5 |
| `lost_revenue` | Opportunity at current yield | `(SUM(capacity)-SUM(checked_in))*SUM(revenue)/NULLIF(SUM(checked_in),0)` | Sessions.Capacity, Sessions.CheckedIn, Sessions.Revenue | currency | weighted | 5 |
| `aov` | Average order value | `SUM(revenue)/NULLIF(COUNT(DISTINCT sale_id),0)` | Sales.Payment Value, Sales.Sale ID, Sales.Member ID | currency | weighted | 5 |
| `arpu` | Revenue / buyer | `SUM(revenue)/NULLIF(COUNT(DISTINCT member_id),0)` | Sales.Payment Value, Sales.Sale ID, Sales.Member ID | currency | weighted | 5 |
| `buyers` | Unique buyers | `COUNT(DISTINCT member_id)` | Sales.Member ID | integer | sum | 5 |
| `discount_value` | Discount given | `SUM(discount)` | Sales.Discount Value In Currency | currency | sum | 5 |
| `discount_rate` | Discount rate | `(SUM(discount)) / NULLIF((SUM(revenue)+SUM(discount)),0)` | Sales.Discount Value In Currency, Sales.Payment Value | percent | weighted | 5 |
| `deferred_revenue` | Deferred balance | `SUM(money_left)` | Sales.Sec. Membership Money Left | currency | sum | 5 |
| `unused_session_liability` | Unused session liability | `SUM(COALESCE(classes_left,remaining)*rev_credit)` | Sales.Sec. Membership Classes Left, Sales.Sec. Membership Revenue Per Event Credit Incl VAT | currency | sum | 5 |
| `membership_rev_share` | Membership revenue share | `(SUM(revenue) FILTER (WHERE category='Memberships')) / NULLIF((SUM(revenue)),0)` | Sales.Cleaned Category, Sales.Payment Value | percent | weighted | 5 |
| `paid_attendance` | Paid attendance | `SUM(checked_in)-SUM(non_paid)` | Sessions.CheckedIn, Sessions.NonPaid | integer | sum | 5 |
| `non_paid_rate` | Non-paid share | `(SUM(non_paid)) / NULLIF((SUM(checked_in)),0)` | Sessions.NonPaid, Sessions.CheckedIn | percent | weighted | 5 |
| `membership_att_share` | Membership attendance share | `(SUM(memberships)) / NULLIF((SUM(memberships+packages+intro+single)),0)` | Sessions.Memberships, Sessions.Packages, Sessions.IntroOffers, Sessions.SingleClasses | percent | weighted | 5 |
| `intro_penetration` | Intro attendances / session | `(SUM(intro)) / NULLIF((SUM(sessions)),0)` | Sessions.IntroOffers, Sessions.SessionID | decimal | weighted | 5 |
| `new_clients` | Newcomers | `COUNT(*) FILTER (WHERE is_new)` | New.Is New | integer | sum | 3 |
| `conversion_rate` | Trial conversion | `(COUNT(*) FILTER (WHERE is_new AND conversion='Converted')) / NULLIF((COUNT(*) FILTER (WHERE is_new)),0)` | New.Is New, New.Conversion Status, New.Visits Post Trial | percent | weighted | 5 |
| `second_visit_rate` | Second-visit rate | `(COUNT(*) FILTER (WHERE is_new AND visits_post>0)) / NULLIF((COUNT(*) FILTER (WHERE is_new)),0)` | New.Is New, New.Conversion Status, New.Visits Post Trial | percent | weighted | 5 |
| `zero_return_rate` | Zero-return rate | `(COUNT(*) FILTER (WHERE is_new AND visits_post=0)) / NULLIF((COUNT(*) FILTER (WHERE is_new)),0)` | New.Is New, New.Conversion Status, New.Visits Post Trial | percent | weighted | 5 |
| `avg_conversion_span` | Days to convert | `AVG(conversion_days) FILTER (WHERE conversion='Converted')` | New.Conversion Span (Days) | days | avg | 3 |
| `median_conversion_span` | Median days to convert | `MEDIAN(conversion_days) FILTER (WHERE conversion='Converted')` | New.Conversion Span (Days) | days | median | 3 |
| `avg_ltv` | Average lifetime value | `AVG(ltv)` | New.Ltv | currency | avg | 3 |
| `avg_first_purchase` | Average first purchase | `AVG(first_purchase)` | New.First Purchase Value | currency | avg | 3 |
| `ltv_to_first_purchase` | LTV / first purchase | `AVG(ltv)/NULLIF(AVG(first_purchase),0)` | New.Ltv, New.First Purchase Value | ratio | weighted | 3 |
| `retention_rate` | Retention rate | `(COUNT(*) FILTER (WHERE retention='Retained')) / NULLIF((COUNT(*)),0)` | New.Retention Status | percent | weighted | 5 |
| `active_base` | Active member base | `COUNT(DISTINCT member_id) FILTER (WHERE lifecycle='Active')` | New.Lifecycle Status, New.Member Id | integer | sum | 5 |
| `at_risk_actives` | At-risk active members | `COUNT(*) FILTER (WHERE lifecycle='Active' AND days_absent>21)` | New.Lifecycle Status, New.Days Since Last Visit | integer | sum | 5 |
| `visits_post_trial` | Post-trial visits | `SUM(visits_post)` | New.Visits Post Trial | integer | sum | 5 |
| `active_memberships` | Active memberships | `COUNT(*) FILTER (WHERE status='Active' AND (end_date IS NULL OR end_date >= '{today}'))` | Lapsed.Status, Lapsed.End Date | integer | sum | 5 |
| `churn_rate` | Churn rate | `(COUNT(*) FILTER (WHERE churned_date IS NOT NULL)) / NULLIF((COUNT(*)),0)` | Lapsed.Churned Date | percent | weighted | 5 |
| `utilisation` | Membership utilisation | `SUM(session_limit-remaining) FILTER (WHERE session_limit>0 AND remaining BETWEEN 0 AND session_limit)/NULLIF(SUM(session_limit) FILTER (WHERE session_limit>0 AND remaining BETWEEN 0 AND session_limit),0)` | Lapsed → Sessions Limit, Lapsed → Remaining Sessions | percent | weighted | 5 |
| `zero_usage_memberships` | Unused memberships | `COUNT(*) FILTER (WHERE completed=0 AND date_diff('day',TRY_CAST(start_date AS DATE),DATE '{today}')>7)` | Lapsed.Completed Sessions, Lapsed.Start Date | integer | sum | 5 |
| `dormant_actives` | Dormant active memberships | `COUNT(*) FILTER (WHERE status='Active' AND days_absent>21)` | Lapsed.Status, Lapsed.Days Since Last Visit | integer | sum | 5 |
| `revenue_at_risk_30d` | Expiring in 30 days | `SUM(amount_paid) FILTER (WHERE TRY_CAST(end_date AS DATE) BETWEEN DATE '{today}' AND DATE '{today}'+INTERVAL 30 DAY)` | Lapsed.Amount Paid, Lapsed.End Date | currency | sum | 5 |
| `risk_score` | Member risk score | `AVG(100*(0.3*(1-LEAST(completed/NULLIF(session_limit,0),1))+0.35*LEAST(days_absent/60,1)+0.15*cancel_rate+0.20*(1-attendance_rate)))` | Lapsed.Completed Sessions, Lapsed.Sessions Limit, Lapsed.Days Since Last Visit, Lapsed.Cancellation Rate %, Lapsed.Attendance Rate % | decimal | avg | 3 |
| `memberships_count` | Memberships held | `COUNT(*)` | Lapsed.Member ID | integer | sum | 5 |
| `remaining_sessions` | Remaining sessions | `SUM(remaining)` | Lapsed.Remaining Sessions | integer | sum | 5 |
| `days_absent` | Days since last visit | `AVG(days_absent)` | Lapsed.Days Since Last Visit | days | avg | 3 |
| `bookings` | Bookings | `COUNT(*)` | Bookings.Member Id | integer | sum | 5 |
| `unique_bookers` | Unique bookers | `COUNT(DISTINCT member_id)` | Bookings.Member Id | integer | sum | 5 |
| `cancellation_rate` | Cancellation rate | `(COUNT(*) FILTER (WHERE cancelled)) / NULLIF((COUNT(*)),0)` | Bookings.Cancellation rate | percent | weighted | 5 |
| `booking_late_rate` | Late-cancel rate | `(COUNT(*) FILTER (WHERE late_cancelled>0)) / NULLIF((COUNT(*)),0)` | Bookings.Late-cancel rate | percent | weighted | 5 |
| `booking_no_show_rate` | No-show rate | `(COUNT(*) FILTER (WHERE no_show)) / NULLIF((COUNT(*)),0)` | Bookings.No-show rate | percent | weighted | 5 |
| `booking_attendance_rate` | Attended share | `(COUNT(*) FILTER (WHERE attended)) / NULLIF((COUNT(*)),0)` | Bookings.Attended share | percent | weighted | 5 |
| `refund_rate` | Refund rate | `(COUNT(*) FILTER (WHERE refunded)) / NULLIF((COUNT(*)),0)` | Bookings.Refund rate | percent | weighted | 5 |
| `effective_attendance` | Effective attendance | `COUNT(*) FILTER (WHERE attended AND NOT COALESCE(cancelled,FALSE) AND NOT COALESCE(late_cancelled>0,FALSE) AND NOT COALESCE(no_show,FALSE))::DOUBLE/NULLIF(COUNT(*),0)` | Bookings.Attended, Bookings.Cancelled, Bookings.Late Cancelled, Bookings.No Show | percent | weighted | 5 |
| `booking_lead_time_days` | Booking lead time | `AVG(lead_time) FILTER (WHERE lead_time>=0)` | Bookings.Session Date, Bookings.Sale Date | days | avg | 5 |
| `same_day_share` | Same-day bookings | `(COUNT(*) FILTER (WHERE lead_time>=0 AND lead_time<1)) / NULLIF((COUNT(*) FILTER (WHERE NOT imported)),0)` | Bookings.Session Date, Bookings.Sale Date | percent | weighted | 5 |
| `revenue_per_booking` | Revenue / booking | `SUM(revenue) FILTER (WHERE NOT imported)/NULLIF(COUNT(*) FILTER (WHERE NOT imported),0)` | Bookings.Sale Value | currency | weighted | 5 |
| `leads` | Leads | `COUNT(*)` | Leads.ID | integer | sum | 3 |
| `lead_conversion_rate` | Lead win rate | `(COUNT(*) FILTER (WHERE status='Won')) / NULLIF((COUNT(*)),0)` | Leads.Status | percent | weighted | 5 |
| `response_time_hours` | First response time | `AVG(response_hours) FILTER (WHERE response_hours>=0)` | Leads.Follow Up 1 Date, Leads.Created At | decimal | avg | 3 |
| `untouched_leads` | Untouched leads | `COUNT(*) FILTER (WHERE touches=0 AND date_diff('hour',TRY_CAST(date AS TIMESTAMP),TIMESTAMP '{today}')>48 AND status NOT IN ('Won','Lost'))` | Leads.Follow Up 1 Date, Leads.Created At, Leads.Status | integer | sum | 3 |
| `touches` | Average follow-ups | `AVG(touches)` | Leads.Follow Up 1 Date, Leads.Follow Up 2 Date, Leads.Follow Up 3 Date, Leads.Follow Up 4 Date | decimal | avg | 3 |
| `open_leads` | Open pipeline | `COUNT(*) FILTER (WHERE status NOT IN ('Won','Lost') OR status IS NULL)` | Leads.Status | integer | sum | 3 |
| `pipeline_value` | Estimated pipeline value | `(COUNT(*) FILTER (WHERE status NOT IN ('Won','Lost') OR status IS NULL))*(COUNT(*) FILTER (WHERE status='Won'))::DOUBLE/NULLIF(COUNT(*),0)*(SELECT AVG(first_purchase) FROM new WHERE is_new)` | Leads.Status, New.First Purchase Value | currency | weighted | 3 |
| `checkins` | Check-ins | `COUNT(*) FILTER (WHERE attended)` | Checkins.Checked In | integer | sum | 5 |
| `unique_attendees` | Unique attendees | `COUNT(DISTINCT member_id) FILTER (WHERE attended)` | Checkins.Member ID, Checkins.Checked In | integer | sum | 5 |
| `visits_per_member` | Visits / member | `COUNT(*) FILTER (WHERE attended)/NULLIF(COUNT(DISTINCT member_id) FILTER (WHERE attended),0)` | Checkins.Member ID, Checkins.Checked In | decimal | weighted | 5 |
| `complimentary_rate` | Complimentary share | `COUNT(*) FILTER (WHERE complimentary AND attended)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE attended),0)` | Checkins.Complementary, Checkins.Checked In | percent | weighted | 5 |
| `revenue_per_checkin` | Revenue / check-in | `SUM(revenue)/NULLIF(COUNT(*) FILTER (WHERE attended),0)` | Checkins.Paid, Checkins.Checked In | currency | weighted | 5 |
| `teaching_hours` | Recorded teaching hours | `SUM(duration)/60` | Checkins.Duration (Minutes) | decimal | sum | 5 |
| `revenue_per_hour` | Revenue / recorded hour | `SUM(revenue)/NULLIF(SUM(duration)/60,0)` | Checkins.Paid, Checkins.Duration (Minutes) | currency | weighted | 5 |
| `trainers` | Active instructors | `COUNT(DISTINCT trainer_id)` | Teacher Recurring.TrainerID | integer | sum | 5 |
| `teacher_dependency` | Single-trainer dependence | `MAX(teacher_dependency)` | Recurring.Top5Trainers | percent | last | 5 |
| `trainer_depth` | Trainer depth | `MAX(trainer_depth)` | Recurring.Top5Trainers | integer | last | 5 |
| `payroll_revenue` | Attributed revenue | `SUM(revenue)` | Payroll.Total Paid | currency | sum | 5 |
| `payroll_cost` | Estimated payroll | `SUM(sessions)*{rate}` | Payroll.Total Sessions, Settings.rate_per_session | currency | sum | 5 |
| `contribution` | Estimated contribution | `SUM(revenue)-SUM(sessions)*{rate}` | Payroll.Total Paid, Payroll.Total Sessions, Settings.rate_per_session | currency | sum | 5 |
| `contribution_margin` | Estimated contribution margin | `(SUM(revenue)-SUM(sessions)*{rate}) / NULLIF((SUM(revenue)),0)` | Payroll.Total Paid, Payroll.Total Sessions, Settings.rate_per_session | percent | weighted | 5 |
| `payroll_pct_of_revenue` | Estimated payroll share | `(SUM(sessions)*{rate}) / NULLIF((SUM(revenue)),0)` | Payroll.Total Paid, Payroll.Total Sessions, Settings.rate_per_session | percent | weighted | 5 |
| `empty_session_cost` | Cost of empty sessions | `SUM(empty)*{rate}` | Payroll.Total Empty Sessions, Settings.rate_per_session | currency | sum | 5 |
| `break_even_class_size` | Break-even class size | `{rate}/NULLIF(SUM(revenue)/NULLIF(SUM(checked_in),0),0)` | Sessions.Revenue, Sessions.CheckedIn, Settings.rate_per_session | decimal | weighted | 5 |
| `payroll_conversion` | Instructor trial conversion | `(SUM(converted)) / NULLIF((SUM(new_count)),0)` | Payroll.Converted, Payroll.New | percent | weighted | 5 |
| `payroll_retention` | Instructor retention | `(SUM(retained)) / NULLIF((SUM(new_count)),0)` | Payroll.Retained, Payroll.New | percent | weighted | 5 |
| `new_handled` | Newcomers taught | `SUM(new_count)` | Payroll.New | integer | sum | 5 |
| `records` | Source records | `COUNT(*)` | Source.row | integer | sum | 1 |
| `draw_premium_pp` | Draw premium vs slot | `SUM(checked_in)/NULLIF(SUM(capacity),0)-SUM(capacity*slot_fill)/NULLIF(SUM(capacity),0)` | Sessions.CheckedIn, Sessions.Capacity, Sessions.Location, Sessions.Class, Sessions.Day, Sessions.Time | percent | weighted | 5 |
| `booking_attended` | Attended bookings | `COUNT(*) FILTER (WHERE attended)` | Bookings.Attended | integer | sum | 5 |
| `booking_cancelled` | Cancelled bookings | `COUNT(*) FILTER (WHERE cancelled)` | Bookings.Cancelled | integer | sum | 5 |
| `booking_no_shows` | No-show bookings | `COUNT(*) FILTER (WHERE no_show)` | Bookings.No Show | integer | sum | 5 |
| `booking_late_cancelled` | Late-cancelled bookings | `COUNT(*) FILTER (WHERE late_cancelled>0)` | Bookings.Late Cancelled | integer | sum | 5 |
| `membership_revenue` | Membership purchase value | `SUM(revenue)` | Lapsed.Amount Paid | currency | sum | 5 |
| `checkin_revenue` | Attributed check-in revenue | `SUM(revenue)` | Checkins.Paid | currency | sum | 5 |
| `payroll_revenue_per_session` | Attributed revenue / session | `SUM(revenue)/NULLIF(SUM(sessions),0)` | Payroll.Total Paid, Payroll.Total Sessions | currency | weighted | 5 |
| `nonempty_reliability` | Non-empty reliability | `1-SUM(empty)/NULLIF(SUM(sessions),0)` | Sessions.CheckedIn, Sessions.SessionID | percent | weighted | 5 |
| `active_slots` | Active schedule slots | `COUNT(DISTINCT CONCAT_WS('\|',location,format,day,time))` | Sessions.Location, Sessions.Class, Sessions.Day, Sessions.Time | integer | sum | 5 |
| `gap_to_break_even` | Attendees above break-even | `SUM(checked_in)/NULLIF(SUM(sessions),0)-{rate}/NULLIF(SUM(revenue)/NULLIF(SUM(checked_in),0),0)` | Sessions.Revenue, Sessions.CheckedIn, Sessions.SessionID, Settings.rate_per_session | decimal | weighted | 5 |
