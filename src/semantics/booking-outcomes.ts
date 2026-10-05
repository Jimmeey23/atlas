// One outcome per booking; source flags may overlap.
export const bookingOutcomeCase = `CASE WHEN late_cancelled>0 THEN 'late' WHEN cancelled THEN 'cancelled' WHEN no_show THEN 'no_show' WHEN attended THEN 'attended' ELSE 'pending' END`;
