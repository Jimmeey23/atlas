import ReactDOM from "react-dom/client";
import { lazy, Suspense } from "react";
import { AuthGate } from "./auth";
import { AccountMenu } from "./components/AccountMenu";
const App = lazy(() => import("./App"));
import { DEFAULT_THEME, THEME_KEY } from "./data/theme";

// The report deck and the KRA page are separate destinations with their own heavy
// dependencies (the deck alone pulls in the whole report engine). Only one of the
// three ever renders, so each is fetched when its route is asked for.
const ReportPage = lazy(() =>
  import("./components/report/ReportPage").then((m) => ({ default: m.ReportPage })),
);
const KraPerformance = lazy(() =>
  import("./components/KraPerformance").then((m) => ({ default: m.KraPerformance })),
);

const path = window.location.pathname.replace(/\/$/, "");
const standalone = path === "/kra/jimmeey-gondaa" || path === "/kra";
document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;

const boot = (
  <Suspense fallback={<div className="route-boot" role="status" aria-live="polite" />}>
    {path === "/report" ? (
      <ReportPage />
    ) : standalone ? (
      <main className="kra-standalone">
        <header className="standalone-account"><a href="/">Atlas overview</a><AccountMenu /></header>
        <KraPerformance />
      </main>
    ) : (
      <App />
    )}
  </Suspense>
);

ReactDOM.createRoot(document.getElementById("root")!).render(<AuthGate>{boot}</AuthGate>);
