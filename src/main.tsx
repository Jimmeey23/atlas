import ReactDOM from "react-dom/client";
import App from "./App";
import {KraPerformance} from "./components/KraPerformance";
// The premium layer is imported last so it owns the final say on presentation
// across every workspace, including the standalone KRA page.
import "./design/premium.css";
import "./design/premium-surfaces.css";
import "./design/premium-controls.css";
import "./design/premium-details.css";
const path=window.location.pathname.replace(/\/$/,"");
const standalone=path==="/kra/jimmeey-gondaa"||path==="/kra";
document.documentElement.dataset.theme=localStorage.getItem("floor-theme")||"gloss";
ReactDOM.createRoot(document.getElementById("root")!).render(
  standalone?<main className="kra-standalone"><KraPerformance/></main>:<App/>
);
