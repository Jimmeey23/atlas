/**
 * Every column of the New sheet, kept verbatim as text so the register can group by
 * any of them. Field names are the header in snake case with an `nf_` prefix; other
 * tables carry these columns as NULL.
 */
export const newSheetFields: [header: string, field: string][] = [
  ["Member Id", "nf_member_id"], ["First Name", "nf_first_name"], ["Last Name", "nf_last_name"], ["Email", "nf_email"],
  ["Phone Number", "nf_phone_number"], ["First Visit Date", "nf_first_visit_date"], ["First Visit Entity Name", "nf_first_visit_entity_name"],
  ["First Visit Type", "nf_first_visit_type"], ["First Visit Location", "nf_first_visit_location"], ["Payment Method", "nf_payment_method"],
  ["Membership Used", "nf_membership_used"], ["Home Location", "nf_home_location"], ["Class No", "nf_class_no"], ["Trainer Name", "nf_trainer_name"],
  ["Is New", "nf_is_new"], ["Visits Post Trial", "nf_visits_post_trial"], ["Visits Post Trial Same Month", "nf_visits_post_trial_same_month"],
  ["Late Cancellations Post Trial", "nf_late_cancellations_post_trial"], ["Memberships Bought Post Trial", "nf_memberships_bought_post_trial"],
  ["Purchase Count Post Trial", "nf_purchase_count_post_trial"], ["First Purchase Post Trial", "nf_first_purchase_post_trial"],
  ["First Purchase Value", "nf_first_purchase_value"], ["Ltv", "nf_ltv"], ["Retention Status", "nf_retention_status"],
  ["Conversion Status", "nf_conversion_status"], ["First Purchase Date", "nf_first_purchase_date"], ["No of Visits", "nf_no_of_visits"],
  ["Last Visit Date", "nf_last_visit_date"], ["Days Since Last Visit", "nf_days_since_last_visit"], ["Conversion Span (Days)", "nf_conversion_span_days"],
  ["Days To Second Visit", "nf_days_to_second_visit"], ["Unique Locations Visited Post Trial", "nf_unique_locations_visited_post_trial"],
  ["Month Year", "nf_month_year"], ["Source", "nf_source"], ["Ltv Post Trial", "nf_ltv_post_trial"],
  ["Avg Purchase Value Post Trial", "nf_avg_purchase_value_post_trial"], ["Last Purchase Date", "nf_last_purchase_date"],
  ["Last Purchase Value", "nf_last_purchase_value"], ["Total Purchases All Time", "nf_total_purchases_all_time"], ["Days Active", "nf_days_active"],
  ["Visits Per Month", "nf_visits_per_month"], ["Late Cancel Rate Post Trial", "nf_late_cancel_rate_post_trial"],
  ["First Visit Day", "nf_first_visit_day"], ["First Visit Time Slot", "nf_first_visit_time_slot"],
  ["Conversion Speed Bucket", "nf_conversion_speed_bucket"], ["Lifecycle Status", "nf_lifecycle_status"],
];
export const newFieldLabel = Object.fromEntries(newSheetFields.map(([header, field]) => [field, header]));
