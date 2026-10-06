// Official Physique 57 India instructor profiles; provenance in public/instructors/sources.json.
export const instructorPortraits: Record<string, string> = {
  "vivaran dhasmana": "/instructors/vivaran.jpg",
  "mrigakshi jaiswal": "/instructors/mrigakshi-n-jaiswal.jpg",
  "maysaa nafis": "/instructors/mayasaa-nafis.jpg",
  "anisha shah": "/instructors/anisha-shah.jpg",
  "anmol sharma": "/instructors/anmol-sharma.jpg",
  "atulan purohit": "/instructors/atulan-purohit.jpg",
  "bret saldanha": "/instructors/bret-saldanha.jpg",
  "cauveri vikrant": "/instructors/cauveri-vikrant.jpg",
  "karan bhatia": "/instructors/karan-bhatia.jpg",
  "mrigakshi n jaiswal": "/instructors/mrigakshi-n-jaiswal.jpg",
  "pranjali jain": "/instructors/pranjali-jain.jpg",
  "raunak khemuka": "/instructors/raunak-khemuka.jpg",
  "reshma sharma": "/instructors/reshma-sharma.jpg",
  "richard dcosta": "/instructors/richard-dcosta.jpg",
  "rohan dahima": "/instructors/rohan-dahima.jpg",
  "simonelle de vitre": "/instructors/simonelle-de-vitre.jpg",
  "simran dutt": "/instructors/simran-dutt.jpg",
  vivaran: "/instructors/vivaran.jpg",
  "chaitanya nahar": "/instructors/chaitanya-nahar.jpg",
  "kajol kanchan": "/instructors/kajol-kanchan.jpg",
  "mayasaa nafis": "/instructors/mayasaa-nafis.jpg",
  "pushyank nahar": "/instructors/pushyank-nahar.jpg",
  "shruti kulkarni": "/instructors/shruti-kulkarni.jpg",
  "siddhartha kusuma": "/instructors/siddhartha-kusuma.jpg",
  "siya mukund": "/instructors/siya-mukund.jpg",
};
export const instructorKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
