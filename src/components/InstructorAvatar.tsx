import { useState } from "react";
import {
  instructorKey,
  instructorPortraits,
} from "../data/instructorPortraits";
export function InstructorAvatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const src = instructorPortraits[instructorKey(name)];
  return src && failed !== src ? (
    <img
      className={`trainer-avatar${large ? " large" : ""}`}
      src={src}
      alt={`${name} portrait`}
      loading="lazy"
      onError={() => setFailed(src)}
    />
  ) : (
    <span
      className={`trainer-avatar${large ? " large" : ""}`}
      aria-hidden="true"
    >
      {name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

export function InstructorName({ name }: { name: string }) {
  return (
    <span className="instructor-name-cell">
      <InstructorAvatar name={name} />
      <span>{name}</span>
    </span>
  );
}
