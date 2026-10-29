/** Plain-language summaries. Detailed source, scope and missing-data rules remain in the metric reference. */
export const simpleMetricDefinitions: Record<string, { meaning: string; calculation: string }> = {
  "sessions": {
    "meaning": "The number of studio sessions in your filtered selection.",
    "calculation": "Count one per Sessions-sheet row. For summary sheets, add the session totals recorded on each row."
  },
  "capacity": {
    "meaning": "How many seats were offered across the selected sessions.",
    "calculation": "Add recorded seat capacities."
  },
  "attendance": {
    "meaning": "How many attendance visits were recorded across the selected sessions.",
    "calculation": "Add recorded check-ins; repeat visits count again."
  },
  "fill_rate": {
    "meaning": "The percentage of offered seats filled by attendance.",
    "calculation": "Total attendance divided by total offered seats, multiplied by 100."
  },
  "booking_fill_rate": {
    "meaning": "The percentage of offered seats reserved.",
    "calculation": "Total booked seats divided by total offered seats, multiplied by 100."
  },
  "show_up_rate": {
    "meaning": "Attendance compared with the number of booked seats.",
    "calculation": "Total attendance divided by total booked seats, multiplied by 100."
  },
  "booked": {
    "meaning": "How many seats were booked across the selected sessions.",
    "calculation": "Add recorded booked-seat counts."
  },
  "no_shows": {
    "meaning": "An estimate of booked seats left unused without a late cancellation.",
    "calculation": "For sessions with all inputs recorded, subtract attendance and late cancellations from bookings, use zero for negative results, then add."
  },
  "no_show_rate": {
    "meaning": "Estimated no-shows as a percentage of recorded bookings.",
    "calculation": "Estimated no-show seats divided by all recorded booked seats, multiplied by 100."
  },
  "late_cancel_rate": {
    "meaning": "The percentage of booked seats recorded as late cancellations.",
    "calculation": "Total late-cancelled seats divided by total booked seats, multiplied by 100."
  },
  "avg_class_size_incl": {
    "meaning": "Average attendance per session, including empty sessions.",
    "calculation": "Total attendance divided by total represented sessions."
  },
  "avg_class_size_excl": {
    "meaning": "Average attendance per non-empty session.",
    "calculation": "Total attendance divided by recorded non-empty sessions on rows with positive attendance."
  },
  "empty_sessions": {
    "meaning": "How many represented sessions had explicitly recorded zero attendance.",
    "calculation": "Add recorded empty-session counts."
  },
  "empty_session_rate": {
    "meaning": "The percentage of represented sessions recorded as empty.",
    "calculation": "Empty sessions divided by all represented sessions, multiplied by 100."
  },
  "unsold_seats": {
    "meaning": "How many offered seats were left unoccupied.",
    "calculation": "For rows with capacity and attendance, subtract attendance from capacity, use zero for negative results, then add."
  },
  "overbooked_sessions": {
    "meaning": "How many source rows show bookings above seat capacity.",
    "calculation": "Count rows where recorded bookings exceed recorded capacity."
  },
  "attendance_cv": {
    "meaning": "How much recorded session attendance varies relative to its average.",
    "calculation": "Population standard deviation of attendance divided by average attendance."
  },
  "revenue": {
    "meaning": "Revenue attributed to the selected studio sessions.",
    "calculation": "Add session-attributed revenue; this differs from cash collected by payment date."
  },
  "gross_revenue": {
    "meaning": "Cash collected on eligible Sales payment lines in the selected payment dates.",
    "calculation": "Add Payment Value on non-voided lines with succeeded or missing payment status."
  },
  "net_revenue": {
    "meaning": "Eligible cash collections after subtracting recorded payment tax.",
    "calculation": "Subtract GST from Payment Value on eligible Sales lines where both are recorded, then add."
  },
  "vat": {
    "meaning": "Recorded payment GST on eligible Sales lines.",
    "calculation": "Add recorded payment GST, including source columns named VAT."
  },
  "transactions": {
    "meaning": "How many known sales transactions appear in eligible payment lines.",
    "calculation": "Count different recorded Sale IDs."
  },
  "units": {
    "meaning": "How many sale-item units appear in eligible payment lines.",
    "calculation": "Add recorded item quantities."
  },
  "revenue_per_session": {
    "meaning": "Session-attributed revenue earned per represented session.",
    "calculation": "Total session-attributed revenue divided by represented sessions."
  },
  "rev_pac": {
    "meaning": "Session-attributed revenue earned per attendance visit.",
    "calculation": "Total session-attributed revenue divided by total attendance."
  },
  "rev_pas": {
    "meaning": "Session-attributed revenue earned per offered seat.",
    "calculation": "Total session-attributed revenue divided by total seat capacity."
  },
  "lost_revenue": {
    "meaning": "Estimated value of unoccupied seats at the current revenue per visit.",
    "calculation": "Unoccupied seats multiplied by session revenue per attendance visit; this is a scenario, not measured lost cash."
  },
  "aov": {
    "meaning": "Average collected revenue per known sales transaction.",
    "calculation": "Eligible Sales collections divided by different known Sale IDs."
  },
  "arpu": {
    "meaning": "Average collected revenue per known buyer.",
    "calculation": "Eligible Sales collections divided by different known buyer Member IDs."
  },
  "buyers": {
    "meaning": "How many identified buyers appear in eligible Sales lines.",
    "calculation": "Count different recorded buyer Member IDs."
  },
  "discount_value": {
    "meaning": "Total recorded item-level discounts on eligible payment lines.",
    "calculation": "Multiply each item's unit discount by its quantity, then add."
  },
  "discount_rate": {
    "meaning": "Discounts as a share of collections plus discounts.",
    "calculation": "Total item discounts divided by collections plus item discounts, multiplied by 100."
  },
  "deferred_revenue": {
    "meaning": "Current unused membership money attached to the selected Sales cohort.",
    "calculation": "Add the latest recorded money-left balance once per membership within the selected cohort."
  },
  "unused_session_liability": {
    "meaning": "Estimated value of remaining session credits.",
    "calculation": "Multiply remaining credits by recorded revenue per credit, then add; the membership fields used depend on the workspace."
  },
  "membership_rev_share": {
    "meaning": "The percentage of eligible Sales collections from the Memberships category.",
    "calculation": "Memberships-category payment value divided by all eligible payment value, multiplied by 100."
  },
  "paid_attendance": {
    "meaning": "Attendance remaining after subtracting recorded NonPaid visits.",
    "calculation": "Total attendance minus total NonPaid visits."
  },
  "non_paid_rate": {
    "meaning": "The percentage of attendance recorded as NonPaid visits.",
    "calculation": "Total NonPaid visits divided by total attendance, multiplied by 100."
  },
  "membership_att_share": {
    "meaning": "Membership visits as a share of the recorded access-type visit mix.",
    "calculation": "Membership visits divided by combined membership, package, intro and single-class visits, multiplied by 100."
  },
  "intro_penetration": {
    "meaning": "Average intro-offer visits per represented session.",
    "calculation": "Total IntroOffers attendance divided by represented sessions."
  },
  "new_clients": {
    "meaning": "How many selected New-sheet records are classified as newcomers.",
    "calculation": "Count records classified as new; repeated member records are not deduplicated."
  },
  "conversion_rate": {
    "meaning": "The percentage of newcomer records currently marked Converted.",
    "calculation": "Converted newcomer records divided by all newcomer records, multiplied by 100; dates select first visits."
  },
  "second_visit_rate": {
    "meaning": "The percentage of newcomer records with a recorded visit after trial.",
    "calculation": "Newcomer records with positive Visits Post Trial divided by all newcomer records, multiplied by 100."
  },
  "zero_return_rate": {
    "meaning": "The percentage of newcomer records explicitly reporting no post-trial visits.",
    "calculation": "Newcomer records with Visits Post Trial equal to zero divided by all newcomer records, multiplied by 100."
  },
  "avg_conversion_span": {
    "meaning": "Average recorded days to conversion for converted newcomers.",
    "calculation": "Average nonnegative recorded conversion days among converted newcomer records."
  },
  "median_conversion_span": {
    "meaning": "The middle recorded conversion time for converted newcomers.",
    "calculation": "Take the median of nonnegative recorded conversion days among converted newcomer records."
  },
  "avg_ltv": {
    "meaning": "Average recorded lifetime spend of the selected newcomer cohort.",
    "calculation": "Average recorded Ltv values among newcomer records; this is observed spend, not a forecast."
  },
  "first_visitors": {
    "meaning": "How many New-sheet records fall in the selected first-visit scope.",
    "calculation": "Count all selected New-sheet rows, including rows not classified as newcomers."
  },
  "new_converted": {
    "meaning": "How many newcomer records currently have Converted status.",
    "calculation": "Count newcomer records whose latest recorded Conversion Status is Converted."
  },
  "new_retained": {
    "meaning": "How many newcomer records currently have Retained status.",
    "calculation": "Count newcomer records whose latest recorded Retention Status is Retained."
  },
  "new_total_spend": {
    "meaning": "Recorded lifetime spend attached to the selected newcomer cohort.",
    "calculation": "Add newcomer Ltv values; dates select first visits, not payment dates."
  },
  "new_post_trial_spend": {
    "meaning": "Recorded spending after trial attached to the newcomer cohort.",
    "calculation": "Add recorded Ltv Post Trial for newcomer records."
  },
  "new_post_trial_purchases": {
    "meaning": "Recorded purchases after trial attached to the newcomer cohort.",
    "calculation": "Add recorded Purchase Count Post Trial for newcomer records."
  },
  "new_total_purchases": {
    "meaning": "Recorded all-time purchases attached to the newcomer cohort.",
    "calculation": "Add recorded all-time purchase counts for newcomer records."
  },
  "new_visits": {
    "meaning": "Recorded accumulated visits attached to the newcomer cohort.",
    "calculation": "Add recorded No of Visits for newcomer records."
  },
  "new_revenue_per_visit": {
    "meaning": "Recorded lifetime spend per visit for the newcomer cohort.",
    "calculation": "Newcomer lifetime spend divided by visits on newcomer records with a recorded Ltv."
  },
  "new_late_cancels": {
    "meaning": "Late-cancelled bookings belonging to the selected newcomer cohort.",
    "calculation": "Count late-cancelled bookings linked to the group’s distinct newcomer member IDs, regardless of booking date."
  },
  "avg_first_purchase": {
    "meaning": "Average positive first-purchase value for converted newcomers.",
    "calculation": "Average positive recorded First Purchase Value among converted newcomer records."
  },
  "ltv_to_first_purchase": {
    "meaning": "Recorded lifetime spend compared with first-purchase value for converted newcomers.",
    "calculation": "Average Ltv divided by average first-purchase value among converted newcomer records with a positive first purchase."
  },
  "retention_rate": {
    "meaning": "The percentage of newcomer records currently marked Retained.",
    "calculation": "Retained newcomer records divided by all newcomer records, multiplied by 100; no fixed retention window is implied."
  },
  "active_base": {
    "meaning": "How many identified members have an Active lifecycle row in the current snapshot.",
    "calculation": "Count different Member IDs with an Active lifecycle row across all first-visit dates."
  },
  "at_risk_actives": {
    "meaning": "Active New-sheet records reporting more than 21 days since a visit.",
    "calculation": "Count selected New-sheet rows marked Active with recorded absence above 21 days."
  },
  "visits_post_trial": {
    "meaning": "Recorded post-trial visits across all selected New-sheet rows.",
    "calculation": "Add Visits Post Trial without separately restricting rows to newcomers."
  },
  "active_memberships": {
    "meaning": "How many membership rows are currently running under the app's status rules.",
    "calculation": "Count rows started by today and not ended, with a recorded status other than Lapsed, Not Activated or Frozen."
  },
  "churn_rate": {
    "meaning": "The percentage of the eligible paid renewal cohort confirmed as lapsed.",
    "calculation": "Confirmed lapsed outcomes divided by all eligible renewal outcomes, multiplied by 100, after one-member-per-expiry-month deduplication and the 30-day grace rule."
  },
  "lapsed_members": {
    "meaning": "How many identified members have a latest eligible paid membership confirmed lapsed.",
    "calculation": "Count different members whose latest eligible membership is Lapsed at least 30 days after its churn date, or end date when missing, with expiry in scope."
  },
  "utilisation": {
    "meaning": "The percentage of valid limited membership credits already used.",
    "calculation": "Total allowance minus remaining credits divided by total allowance, multiplied by 100, using only positive allowances with valid remaining balances."
  },
  "zero_usage_memberships": {
    "meaning": "Memberships started over seven days ago with zero or unknown recorded usage.",
    "calculation": "Count non-Renewed rows over seven days old with zero completed usage, or no usage evidence and no last visit; valid allowance minus balance supplies missing usage."
  },
  "dormant_actives": {
    "meaning": "Currently running membership rows reporting more than 21 days since a visit.",
    "calculation": "Count current active-membership rows whose recorded Days Since Last Visit exceeds 21."
  },
  "revenue_at_risk_30d": {
    "meaning": "Recorded purchase value attached to memberships expiring in the next 30 days.",
    "calculation": "Add Amount Paid for expiries from today through 30 days ahead, excluding Renewed, Lapsed and Not Activated statuses."
  },
  "risk_score": {
    "meaning": "An uncalibrated score combining credit usage, absence and booking behaviour.",
    "calculation": "Average a score weighted 30% to unused allowance, 35% to absence scaled to 60 days, 15% to cancellation rate and 20% to inverse attendance rate, then multiply by 100. A missing input counts as the neutral midpoint, not as the worst case."
  },
  "memberships_count": {
    "meaning": "How many selected membership records appear in Lapsed.",
    "calculation": "Count selected membership rows, including multiple memberships for one member."
  },
  "remaining_sessions": {
    "meaning": "Total recorded session credits remaining on selected memberships.",
    "calculation": "Add recorded remaining credits."
  },
  "days_absent": {
    "meaning": "Average recorded days since the last visit across membership rows.",
    "calculation": "Average recorded Days Since Last Visit; members with several memberships can contribute more than once."
  },
  "bookings": {
    "meaning": "How many booking records are in the selected scope.",
    "calculation": "Count all selected Bookings rows, regardless of outcome."
  },
  "unique_bookers": {
    "meaning": "How many identified members appear in selected bookings.",
    "calculation": "Count different recorded Member IDs across all booking outcomes."
  },
  "booking_avg_class_size": {
    "meaning": "Average attended bookings per session represented in Bookings.",
    "calculation": "Attended booking rows divided by different session identities represented in Bookings, including those with no attendance."
  },
  "booking_empty_sessions": {
    "meaning": "Sessions represented in Bookings with no attended booking.",
    "calculation": "Count different represented session identities, then subtract those with an attended row."
  },
  "cancellation_rate": {
    "meaning": "The percentage of booking rows flagged Cancelled.",
    "calculation": "Cancelled booking rows divided by all booking rows, multiplied by 100."
  },
  "booking_late_rate": {
    "meaning": "The percentage of booking rows flagged Late Cancelled.",
    "calculation": "Late-cancelled booking rows divided by all booking rows, multiplied by 100."
  },
  "booking_no_show_rate": {
    "meaning": "The percentage of booking rows flagged No Show.",
    "calculation": "No-show booking rows divided by all booking rows, multiplied by 100."
  },
  "booking_attendance_rate": {
    "meaning": "The percentage of booking rows flagged Attended.",
    "calculation": "Attended booking rows divided by all booking rows, multiplied by 100."
  },
  "refund_rate": {
    "meaning": "The percentage of booking rows flagged Refunded.",
    "calculation": "Refunded booking rows divided by all booking rows, multiplied by 100; this is not a refunded-money rate."
  },
  "effective_attendance": {
    "meaning": "The percentage of bookings attended without a known adverse outcome flag.",
    "calculation": "Attended rows without Cancelled, Late Cancelled or No Show flags divided by all booking rows, multiplied by 100."
  },
  "booking_lead_time_days": {
    "meaning": "Average recorded time from sale to session for nonimported bookings.",
    "calculation": "Average valid nonnegative elapsed days between Sale Date and Session Date."
  },
  "same_day_share": {
    "meaning": "The percentage of nonimported bookings made less than 24 hours before the session.",
    "calculation": "Rows with valid sale-to-session elapsed time from zero to under 24 hours divided by all nonimported booking rows, multiplied by 100."
  },
  "revenue_per_booking": {
    "meaning": "Average recorded booking value per nonimported booking.",
    "calculation": "Recorded Sale Value on nonimported rows divided by all nonimported booking rows."
  },
  "leads": {
    "meaning": "How many lead records were created in the selected period.",
    "calculation": "Count selected lead rows without deduplicating people."
  },
  "lead_conversion_rate": {
    "meaning": "The percentage of selected lead records recorded as Converted.",
    "calculation": "Converted records divided by all creation-date cohort lead records, multiplied by 100."
  },
  "response_time_hours": {
    "meaning": "Average recorded hours from lead creation to first follow-up.",
    "calculation": "Average valid nonnegative elapsed hours between Created At and Follow Up 1 Date."
  },
  "untouched_leads": {
    "meaning": "Open lead records over 48 hours old with no recorded follow-up dates.",
    "calculation": "Count records with no Follow Up 1–4 dates, created over 48 hours before today's midnight, excluding Converted, Lost and Disqualified records."
  },
  "touches": {
    "meaning": "Average number of recorded follow-up date fields per lead.",
    "calculation": "Count populated Follow Up 1–4 dates per row, then average across selected leads."
  },
  "open_leads": {
    "meaning": "Lead records not recorded as converted, lost or disqualified.",
    "calculation": "Count records whose Conversion Status is not Converted and whose status is not Lost or Disqualified; missing status can qualify."
  },
  "pipeline_value": {
    "meaning": "Estimated value of the open lead pipeline.",
    "calculation": "Open lead count multiplied by the cohort conversion rate and average positive first purchase of converted newcomers in the applicable scope."
  },
  "checkins": {
    "meaning": "How many Checkins records are explicitly marked attended.",
    "calculation": "Count attended Checkins rows; repeat visits count again."
  },
  "unique_attendees": {
    "meaning": "How many identified members attended in the selected Checkins scope.",
    "calculation": "Count different recorded Member IDs on attended Checkins rows."
  },
  "attendance_avg_class_size": {
    "meaning": "Average attended check-ins per session represented in Checkins.",
    "calculation": "Attended Checkins rows divided by different known Session IDs represented in Checkins."
  },
  "attendance_empty_sessions": {
    "meaning": "Sessions represented in Checkins with no attended row.",
    "calculation": "Count different known Session IDs, then subtract those with an attended row."
  },
  "visits_per_member": {
    "meaning": "Average attended check-ins per identified attendee.",
    "calculation": "Attended Checkins rows divided by different known attended Member IDs."
  },
  "complimentary_rate": {
    "meaning": "Complimentary Sessions visits as a percentage of Sessions attendance.",
    "calculation": "Total numeric Sessions Complimentary visits divided by Sessions CheckedIn attendance, multiplied by 100."
  },
  "revenue_per_checkin": {
    "meaning": "Average attributed revenue per attended check-in.",
    "calculation": "Recorded Paid value on attended Checkins rows divided by attended Checkins row count."
  },
  "teaching_hours": {
    "meaning": "Recorded teaching duration counted once per attended session.",
    "calculation": "Add valid recorded session minutes once per known attended Session ID, then divide by 60."
  },
  "revenue_per_hour": {
    "meaning": "Attributed attended revenue per recorded teaching hour.",
    "calculation": "Attended revenue on rows with positive valid duration divided by teaching hours counted once per known session."
  },
  "trainers": {
    "meaning": "How many identified instructors appear in Teacher Recurring.",
    "calculation": "Count different recorded TrainerIDs in selected Teacher Recurring rows."
  },
  "teacher_dependency": {
    "meaning": "The largest listed top-instructor attendance share in the selected recurring rows.",
    "calculation": "For each row, divide the leading listed instructor's attendance by attendance across its Top5Trainers list; take the largest share."
  },
  "trainer_depth": {
    "meaning": "The largest instructor-list size in the selected recurring rows.",
    "calculation": "Count instructors in each Top5Trainers list, then take the largest count."
  },
  "payroll_revenue": {
    "meaning": "Monthly instructor-attributed revenue reported by Payroll.",
    "calculation": "Add Payroll Total Paid; this is attributed revenue, not Sales cash collections."
  },
  "payroll_cost": {
    "meaning": "Estimated instructor cost using the configured flat session rate.",
    "calculation": "Payroll session count multiplied by the configured cost per session."
  },
  "contribution": {
    "meaning": "Payroll-attributed revenue after estimated flat instructor costs.",
    "calculation": "Payroll-attributed revenue minus session count multiplied by the configured cost per session."
  },
  "contribution_margin": {
    "meaning": "The percentage of Payroll-attributed revenue left after estimated instructor costs.",
    "calculation": "Scenario contribution divided by Payroll-attributed revenue, multiplied by 100."
  },
  "payroll_pct_of_revenue": {
    "meaning": "Estimated flat instructor costs as a percentage of Payroll-attributed revenue.",
    "calculation": "Session count multiplied by configured cost per session, divided by Payroll-attributed revenue, multiplied by 100."
  },
  "empty_session_cost": {
    "meaning": "Estimated instructor cost of recorded empty sessions.",
    "calculation": "Recorded empty sessions multiplied by the configured cost per session."
  },
  "break_even_class_size": {
    "meaning": "Attendance per session needed to cover the configured instructor cost.",
    "calculation": "Configured cost per session divided by observed session revenue per attendance visit."
  },
  "payroll_conversion": {
    "meaning": "Payroll-reported conversions as a percentage of Payroll newcomers.",
    "calculation": "Total Payroll Converted divided by total Payroll New, multiplied by 100."
  },
  "payroll_retention": {
    "meaning": "Payroll-reported retained newcomers as a percentage of Payroll newcomers.",
    "calculation": "Total Payroll Retained divided by total Payroll New, multiplied by 100."
  },
  "new_handled": {
    "meaning": "Total newcomers attributed to instructors in Payroll.",
    "calculation": "Add Payroll New counts; people may repeat across instructor attributions."
  },
  "records": {
    "meaning": "How many rows are in the current query population.",
    "calculation": "Count rows from the selected source; the source determines what one row represents."
  },
  "draw_premium_pp": {
    "meaning": "Session fill rate above or below the comparable schedule-slot baseline.",
    "calculation": "Subtract the capacity-weighted matching-slot baseline fill rate from session fill rate, expressed in percentage points; the baseline includes all instructors."
  },
  "booking_attended": {
    "meaning": "How many booking records are flagged Attended.",
    "calculation": "Count booking rows flagged Attended, even if another outcome flag is also present."
  },
  "booking_cancelled": {
    "meaning": "How many booking records are flagged Cancelled.",
    "calculation": "Count booking rows flagged Cancelled."
  },
  "booking_no_shows": {
    "meaning": "How many booking records are flagged No Show.",
    "calculation": "Count booking rows flagged No Show."
  },
  "booking_late_cancelled": {
    "meaning": "How many booking records are flagged Late Cancelled.",
    "calculation": "Count booking rows flagged Late Cancelled."
  },
  "membership_revenue": {
    "meaning": "Recorded purchase value attached to selected membership records.",
    "calculation": "Add membership Amount Paid; date scope follows membership expiry rather than payment date."
  },
  "checkin_revenue": {
    "meaning": "Recorded attributed revenue on attended Checkins rows.",
    "calculation": "Add recorded Paid value only on attended Checkins rows."
  },
  "payroll_revenue_per_session": {
    "meaning": "Payroll-attributed revenue per recorded Payroll session.",
    "calculation": "Total Payroll-attributed revenue divided by total Payroll sessions."
  },
  "nonempty_reliability": {
    "meaning": "The percentage of represented sessions not recorded as empty.",
    "calculation": "One minus empty sessions divided by represented sessions, multiplied by 100."
  },
  "active_slots": {
    "meaning": "How many different recurring schedule patterns appear in Sessions.",
    "calculation": "Count different combinations of studio, full format, weekday and time."
  },
  "gap_to_break_even": {
    "meaning": "Average attendance above or below the instructor-cost break-even level.",
    "calculation": "Average attendance per session minus instructor-cost break-even attendance per session."
  },
  "booking_pending": {
    "meaning": "Booking records with no known attendance or cancellation outcome.",
    "calculation": "Count rows without Attended, Cancelled, No Show or Late Cancelled flags; missing flags count as absent."
  },
  "converted_leads": {
    "meaning": "How many lead records are recorded as Converted.",
    "calculation": "Count records whose Conversion Status is Converted, ignoring case and surrounding spaces. Stage Name is not used, so records converted at any stage are counted."
  },
  "trials_completed": {
    "meaning": "How many lead records completed a trial.",
    "calculation": "Count records whose Trial Status is Trial Completed, ignoring case and surrounding spaces. Stage Name is not used, so records that completed a trial and then advanced are counted."
  },
  "complimentary_visits": {
    "meaning": "How many complimentary visits are recorded in Sessions.",
    "calculation": "Add numeric values from Sessions Complimentary."
  },
  "session_complimentary_rate": {
    "meaning": "The percentage of Sessions attendance recorded as complimentary.",
    "calculation": "Sessions Complimentary visits divided by Sessions CheckedIn attendance, multiplied by 100."
  },
  "late_affected_sessions": {
    "meaning": "How many booking-source sessions have at least one late cancellation.",
    "calculation": "Count different session identities among late-cancelled booking rows."
  },
  "late_recorded_value": {
    "meaning": "Recorded booking value attached to nonimported late cancellations.",
    "calculation": "Add Sale Value on late-cancelled, nonimported Bookings rows; this is not measured lost cash."
  },
  "website_contacted": {
    "meaning": "Website lead records with at least one recorded follow-up date.",
    "calculation": "Count Website-cohort records with any populated Follow Up 1–4 date."
  },
  "website_trials": {
    "meaning": "Website lead records currently marked Trial Completed.",
    "calculation": "Count Website creation-date cohort records with Trial Status Trial Completed."
  },
  "website_members": {
    "meaning": "Website lead records currently marked Converted.",
    "calculation": "Count Website creation-date cohort records with Conversion Status Converted."
  },
  "website_retained": {
    "meaning": "Website lead records currently marked Retained.",
    "calculation": "Count Website creation-date cohort records with Retention Status Retained."
  },
  "website_trial_members": {
    "meaning": "Website lead records marked both Trial Completed and Converted.",
    "calculation": "Count Website-cohort rows with both statuses; event order is not established."
  },
  "website_open": {
    "meaning": "Website lead records not converted, lost or disqualified.",
    "calculation": "Count Website records not marked Converted and not explicitly Lost or Disqualified."
  },
  "website_untouched": {
    "meaning": "Open Website leads over 48 hours old with no recorded follow-up.",
    "calculation": "Count open Website records with no Follow Up 1–4 dates, created over 48 hours before today's midnight."
  },
  "website_contact_rate": {
    "meaning": "The percentage of Website lead records with recorded follow-up.",
    "calculation": "Website records with any follow-up date divided by all Website-cohort records, multiplied by 100."
  },
  "website_trial_rate": {
    "meaning": "The percentage of Website lead records currently marked Trial Completed.",
    "calculation": "Website Trial Completed records divided by all Website-cohort records, multiplied by 100."
  },
  "website_win_rate": {
    "meaning": "The percentage of Website lead records currently marked Converted.",
    "calculation": "Website Converted records divided by all Website-cohort records, multiplied by 100."
  },
  "website_trial_win_rate": {
    "meaning": "The percentage of completed-trial Website records also marked Converted.",
    "calculation": "Website records marked both Trial Completed and Converted divided by Website Trial Completed records, multiplied by 100."
  },
  "website_ltv": {
    "meaning": "Average positive lifetime spend recorded for converted Website leads.",
    "calculation": "Average positive recorded LTV among Website-cohort records marked Converted."
  },
  "website_pipeline_value": {
    "meaning": "Estimated value of open Website lead records.",
    "calculation": "Open Website leads multiplied by Website cohort conversion rate and average positive first purchase of converted newcomers in the applicable New-sheet scope."
  },
  "meta_records": {
    "meaning": "How many Meta reporting rows are selected.",
    "calculation": "Count Meta source rows; reporting rows are not unique ads or people."
  },
  "meta_spend": {
    "meaning": "Advertising spend reported by Meta.",
    "calculation": "Add recorded Meta spend across selected reporting rows."
  },
  "meta_impressions": {
    "meaning": "Advertising views reported by Meta, including repeated views.",
    "calculation": "Add recorded Meta impressions."
  },
  "meta_reach": {
    "meaning": "Sum of Meta audience counts across reporting rows.",
    "calculation": "Add row-level reach; people appearing in several rows are counted again."
  },
  "meta_clicks": {
    "meaning": "All clicks reported by Meta.",
    "calculation": "Add recorded Meta clicks, including clicks beyond link clicks."
  },
  "meta_link_clicks": {
    "meaning": "Inline link clicks reported by Meta.",
    "calculation": "Add Meta inline_link_clicks."
  },
  "meta_leads": {
    "meaning": "Lead events attributed by Meta.",
    "calculation": "Add Meta leads; these are platform events rather than identified CRM leads."
  },
  "meta_instant_leads": {
    "meaning": "On-Facebook lead events reported by Meta.",
    "calculation": "Add Meta on_facebook_lead events; these can overlap Meta leads."
  },
  "meta_purchases": {
    "meaning": "Purchase events attributed by Meta.",
    "calculation": "Add Meta purchase events under the source's attribution settings."
  },
  "meta_purchase_value": {
    "meaning": "Purchase value attributed by Meta.",
    "calculation": "Add Meta-reported purchase value; this differs from reconciled Sales collections."
  },
  "meta_add_to_cart": {
    "meaning": "Add-to-cart events reported by Meta.",
    "calculation": "Add Meta add_to_cart events."
  },
  "meta_checkout": {
    "meaning": "Checkout-start events reported by Meta.",
    "calculation": "Add Meta initiate_checkout events, not completed purchases."
  },
  "meta_ctr": {
    "meaning": "The percentage of Meta impressions resulting in a reported click.",
    "calculation": "Total Meta clicks divided by total impressions, multiplied by 100."
  },
  "meta_cpc": {
    "meaning": "Meta spend per reported click.",
    "calculation": "Total Meta spend divided by total clicks."
  },
  "meta_cpm": {
    "meaning": "Meta spend per thousand reported impressions.",
    "calculation": "Total Meta spend divided by total impressions, multiplied by 1,000."
  },
  "meta_cpl": {
    "meaning": "Meta spend per Meta-attributed lead event.",
    "calculation": "Total Meta spend divided by total Meta leads."
  },
  "meta_cpa": {
    "meaning": "Meta spend per Meta-attributed purchase event.",
    "calculation": "Total Meta spend divided by total Meta purchases."
  },
  "meta_roas": {
    "meaning": "Meta-attributed purchase value for each rupee of Meta spend.",
    "calculation": "Total Meta purchase value divided by total Meta spend."
  },
  "meta_frequency": {
    "meaning": "Impressions relative to summed row-level Meta reach.",
    "calculation": "Total impressions divided by summed row reach; repeated audiences prevent a unique-person frequency measure."
  },
  "crm_trials": {
    "meaning": "CRM lead records currently marked Trial Completed.",
    "calculation": "Count creation-date cohort lead rows with Trial Status Trial Completed."
  },
  "crm_members": {
    "meaning": "CRM lead records currently marked Converted.",
    "calculation": "Count creation-date cohort lead rows with Conversion Status Converted."
  },
  "crm_retained": {
    "meaning": "CRM lead records currently marked Retained.",
    "calculation": "Count creation-date cohort lead rows with Retention Status Retained."
  },
  "crm_win_rate": {
    "meaning": "The percentage of CRM lead records currently marked Converted.",
    "calculation": "Converted CRM records divided by all selected CRM lead records, multiplied by 100."
  },
  "crm_google_leads": {
    "meaning": "CRM lead records explicitly classified as Google sourced.",
    "calculation": "Count records classified Google from Source Name or UTM Source tags, with conflicting channel tags kept separate."
  },
  "crm_meta_leads": {
    "meaning": "CRM lead records explicitly classified as Meta sourced.",
    "calculation": "Count records classified Meta from Meta, Facebook or Instagram source tags, with conflicting channel tags kept separate."
  },
  "purchase_frequency": {
    "meaning": "Average known sales transactions per identified buyer.",
    "calculation": "Different Sale IDs linked to a known Member ID divided by different known buyer Member IDs."
  },
  "product_breadth": {
    "meaning": "How many different normalized product names appear in eligible Sales lines.",
    "calculation": "Count different recorded normalized product names, rather than stock codes."
  },
  "lapsed_memberships": {
    "meaning": "Confirmed lapsed outcomes in the eligible paid membership-expiry cohort.",
    "calculation": "Count lapsed outcomes after one-member-per-expiry-month deduplication and the 30-day grace rule, excluding restricted or unpaid memberships."
  }
};
