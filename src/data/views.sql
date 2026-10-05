CREATE OR REPLACE VIEW checkin_members AS SELECT c.*,n.lifecycle AS member_lifecycle,n.ltv AS member_ltv FROM checkins c LEFT JOIN new n USING(member_id);
CREATE OR REPLACE VIEW sale_members AS SELECT s.*,n.source AS acquisition_source,n.month AS cohort_month,n.ltv AS member_ltv FROM sales s LEFT JOIN new n USING(member_id);
CREATE OR REPLACE VIEW lapsed_members AS SELECT l.*,n.source AS acquisition_source,n.ltv AS member_ltv FROM lapsed l LEFT JOIN new n USING(member_id);
CREATE OR REPLACE VIEW lead_members AS SELECT l.*,n.ltv AS member_ltv,n.lifecycle AS member_lifecycle FROM leads l LEFT JOIN new n USING(member_id);
CREATE OR REPLACE VIEW session_payroll AS SELECT s.*,p.revenue AS month_attributed_revenue,p.sessions AS month_teaching_sessions FROM sessions s LEFT JOIN payroll p ON s.trainer_id=p.trainer_id AND s.month=p.month AND s.location=p.location;
CREATE OR REPLACE VIEW session_attendees AS SELECT s.session_id,s.date,s.location,s.trainer,s.format,c.member_id,c.member,c.attended,c.source_row AS checkin_source_row FROM sessions s LEFT JOIN checkins c ON s.session_id=c.session_id;
CREATE OR REPLACE VIEW booking_sessions AS SELECT b.*,s.session_id AS resolved_session_id FROM bookings b LEFT JOIN sessions s ON (b.unique_id1 IS NOT NULL AND b.unique_id1=s.unique_id1) OR (b.unique_id2 IS NOT NULL AND b.unique_id2=s.unique_id2);
