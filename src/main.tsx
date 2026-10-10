import ReactDOM from "react-dom/client";
import App from "./App";
import { ReportPage } from "./components/report/ReportPage";
import {KraPerformance} from "./components/KraPerformance";
const path=window.location.pathname.replace(/\/$/,"");
const standalone=path==="/kra/jimmeey-gondaa"||path==="/kra";
document.documentElement.dataset.theme=localStorage.getItem("floor-theme")||"gloss";
ReactDOM.createRoot(document.getElementById("root")!).render(
  path === "/report" ? <ReportPage/> : standalone?<main className="kra-standalone"><KraPerformance/></main>:<App/>
);
