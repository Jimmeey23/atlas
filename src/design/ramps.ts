export const diverging = {
  matte: [
    "#FF3D8A",
    "#B8306C",
    "#6B2A4E",
    "#2A2F38",
    "#1E5A63",
    "#0FA5B8",
    "#00E0FF",
  ],
  gloss: [
    "#8A0A29",
    "#C10F3A",
    "#E8214F",
    "#F4A0B0",
    "#F2F4F8",
    "#9CB6F5",
    "#3B72FF",
    "#1D4ED8",
    "#0B2A6B",
  ],
};
export const formats = {
  matte: {
    Barre: "#FF3D8A",
    Cycle: "#00E0FF",
    Strength: "#FFA62B",
    Pilates: "#9B5CFF",
    Hosted: "#00F5A0",
    Unknown: "#4A515E",
  },
  gloss: {
    Barre: "#C10F3A",
    Cycle: "#1D4ED8",
    Strength: "#A26A00",
    Pilates: "#7A2E7E",
    Hosted: "#0E7C86",
    Unknown: "#AFB8C6",
  },
};
export function formatColor(name: string, theme: "matte" | "gloss") {
  const type = /cycle/i.test(name)
    ? "Cycle"
    : /strength/i.test(name)
      ? "Strength"
      : /pilates|plash/i.test(name)
        ? "Pilates"
        : /hosted| x /i.test(name)
          ? "Hosted"
          : /barre/i.test(name)
            ? "Barre"
            : "Unknown";
  return formats[theme][type];
}
