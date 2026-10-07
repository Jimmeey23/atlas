// Cache for cleaned values to improve performance
const cleaningCache = new Map<string, string>();

export const HOSTED_CLASS_PATTERN =
  /\b(hosted|guest|workshop|bridal|olympics|soundrise|outdoor|wework|rugby|raheja|birthday|shower|laani|physique|peakst8hosted)\b|(?:\bx\s*p57\b)|(?:\bp57\s*x\b)|(?:\bphysique\s*57\b)|(?:\bstudio\s*sweat\s*in\s*30\b)|(?:\bsweat\s*in\s*30\b)|(?:\bx\b)|(?:\bp57\b)/i;

// Class name patterns
const CLASS_PATTERNS = {
  barre57: /barre 57|barre57/i,
  mat: /mat/i,
  trainer: /Trainer|Trainer's/i,
  cardio: /cardio barre|Studio Cardio/i,
  backBody: /back body/i,
  fit: /fit/i,
  powercycle: /powercycle/i,
  amped: /amped/i,
  sweat: /sweat/i,
  foundation: /foundation/i,
  recovery: /recovery/i,
  prenatal: /pre\/post/i,
  hiit: /hiit/i,
  hosted: HOSTED_CLASS_PATTERN,
  express: /express/i,
  plus: /plus/i,
};

/**
 * Clean class names using pattern matching
 */
export function getCleanedClass(sessionName: string): string {
  if (!sessionName) return "";

  const cacheKey = `class_${sessionName}`;
  if (cleaningCache.has(cacheKey)) {
    return cleaningCache.get(cacheKey)!;
  }

  let result = "";
  const isExpress = CLASS_PATTERNS.express.test(sessionName);

  if (CLASS_PATTERNS.barre57.test(sessionName)) {
    result = isExpress ? "Studio Barre 57 Express" : "Studio Barre 57";
  } else if (CLASS_PATTERNS.mat.test(sessionName)) {
    result = isExpress ? "Studio Mat 57 Express" : "Studio Mat 57";
  } else if (CLASS_PATTERNS.trainer.test(sessionName)) {
    result = isExpress
      ? "Studio Trainer's Choice Express"
      : "Studio Trainer's Choice";
  } else if (CLASS_PATTERNS.cardio.test(sessionName)) {
    if (CLASS_PATTERNS.plus.test(sessionName)) {
      result = "Studio Cardio Barre Plus";
    } else if (isExpress) {
      result = "Studio Cardio Barre Express";
    } else {
      result = "Studio Cardio Barre";
    }
  } else if (CLASS_PATTERNS.backBody.test(sessionName)) {
    result = isExpress
      ? "Studio Back Body Blaze Express"
      : "Studio Back Body Blaze";
  } else if (CLASS_PATTERNS.fit.test(sessionName)) {
    result = isExpress ? "Studio FIT Express" : "Studio FIT";
  } else if (CLASS_PATTERNS.powercycle.test(sessionName)) {
    result = isExpress ? "Studio powerCycle Express" : "Studio powerCycle";
  } else if (CLASS_PATTERNS.amped.test(sessionName)) {
    result = isExpress ? "Studio Amped Up! Express" : "Studio Amped Up!";
  } else if (CLASS_PATTERNS.sweat.test(sessionName)) {
    result = isExpress ? "Studio SWEAT In 30 Express" : "Studio SWEAT In 30";
  } else if (CLASS_PATTERNS.foundation.test(sessionName)) {
    result = isExpress ? "Studio Foundations Express" : "Studio Foundations";
  } else if (CLASS_PATTERNS.recovery.test(sessionName)) {
    result = isExpress ? "Studio Recovery Express" : "Studio Recovery";
  } else if (CLASS_PATTERNS.prenatal.test(sessionName)) {
    result = "Studio Pre/Post Natal";
  } else if (CLASS_PATTERNS.hiit.test(sessionName)) {
    result = isExpress ? "Studio HIIT Express" : "Studio HIIT";
  } else if (CLASS_PATTERNS.hosted.test(sessionName)) {
    result = "Studio Hosted Class";
  } else {
    result = sessionName; // Return original if no pattern matches
  }

  cleaningCache.set(cacheKey, result);
  return result;
}

/**
 * Clean location names
 */
export function getCleanedLocation(location: string): string {
  if (!location) return "";

  const cacheKey = `location_${location}`;
  if (cleaningCache.has(cacheKey)) {
    return cleaningCache.get(cacheKey)!;
  }

  let result = location
    .trim()
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/,\s*/g, ", ") // Standardize comma spacing
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  cleaningCache.set(cacheKey, result);
  return result;
}

/**
 * Clean day names
 */
export function getCleanedDay(day: string): string {
  if (!day) return "";

  const cacheKey = `day_${day}`;
  if (cleaningCache.has(cacheKey)) {
    return cleaningCache.get(cacheKey)!;
  }

  const dayMap: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };

  const result = dayMap[day.toLowerCase()] || day;
  cleaningCache.set(cacheKey, result);
  return result;
}

/**
 * Clean time format
 */
export function getCleanedTime(time: string): string {
  if (!time) return "";

  const cacheKey = `time_${time}`;
  if (cleaningCache.has(cacheKey)) {
    return cleaningCache.get(cacheKey)!;
  }

  // Parse and format time consistently (HH:MM format)
  let result = time;
  try {
    // Remove seconds if present
    result = time.split(":").slice(0, 2).join(":");
  } catch {
    result = time;
  }

  cleaningCache.set(cacheKey, result);
  return result;
}

/**
 * Generate composite keys for grouping
 */
export function generateCompositeKey(
  className: string,
  day: string,
  time: string,
  location: string,
  trainer?: string,
): string {
  const cleanedClass = getCleanedClass(className);
  const cleanedDay = getCleanedDay(day);
  const cleanedTime = getCleanedTime(time);
  const cleanedLocation = getCleanedLocation(location);

  if (trainer) {
    return `${cleanedClass}|${cleanedDay}|${cleanedTime}|${cleanedLocation}|${trainer}`;
  }

  return `${cleanedClass}|${cleanedDay}|${cleanedTime}|${cleanedLocation}`;
}

/**
 * Parse composite key back to components
 */
export function parseCompositeKey(key: string): {
  className: string;
  day: string;
  time: string;
  location: string;
  trainer?: string;
} {
  const parts = key.split("|");
  return {
    className: parts[0] || "",
    day: parts[1] || "",
    time: parts[2] || "",
    location: parts[3] || "",
    trainer: parts[4],
  };
}

/**
 * Clear cleaning cache (useful for memory management)
 */
export function clearCleaningCache(): void {
  cleaningCache.clear();
}
