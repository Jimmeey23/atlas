import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SourceRegister } from "./StudioCommunityOperations";
import { Register } from "./Register";
import type { TreeRow } from "./NestedTable";
const registers = [
  {
    source: "sessions",
    title: "Room-size utilisation",
    description: "Capacity bands and class economics",
    groups: ["capacity", "location", "format"],
    columns: [
      "sessions",
      "capacity",
      "attendance",
      "fill_rate",
      "revenue_per_session",
      "empty_session_rate",
    ],
  },
  {
    source: "bookings",
    title: "Payment mix",
    description: "Booking outcomes by payment method",
    groups: ["payment_method", "location", "format"],
    columns: [
      "bookings",
      "unique_bookers",
      "booking_attendance_rate",
      "cancellation_rate",
      "booking_no_show_rate",
    ],
  },
  {
    source: "sessions",
    title: "Hosted experiences",
    description: "Sessions identified as hosted in the source",
    predicate: "session_type='Hosted'",
    groups: ["format", "location", "trainer"],
    columns: [
      "sessions",
      "attendance",
      "fill_rate",
      "revenue",
      "revenue_per_session",
    ],
  },
  {
    source: "sessions",
    title: "Overbooking pressure",
    description: "Sessions with reservations above recorded capacity",
    predicate: "booked>capacity",
    groups: ["format", "location", "day", "time"],
    columns: [
      "sessions",
      "capacity",
      "booked",
      "attendance",
      "booking_fill_rate",
      "fill_rate",
    ],
  },
];
function DeepRegister({
  config,
  version,
  onDrill,
}: {
  config: (typeof registers)[number];
  version: string | number;
  onDrill: (r: TreeRow) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="secondary"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {config.title}
        <span className="icon small">
          {open ? "Collapse" : "Explore"}
          <ChevronDown size={13} />
        </span>
      </summary>
      <div className="secondary-content">
        {open && (
          <SourceRegister
            config={config}
            version={version}
            onDrill={onDrill}
            inline
          />
        )}
      </div>
    </details>
  );
}
export function StudioOperationsDeepDive(props: {
  version: string | number;
  onDrill: (r: TreeRow) => void;
}) {
  return (
    <div className="ops-deep-dive">
      <Register
        index="07"
        title="Go one level deeper"
        subtitle="Focused operational registers"
      >
        {registers.map((config) => (
          <DeepRegister key={config.title} config={config} {...props} />
        ))}
      </Register>
    </div>
  );
}
