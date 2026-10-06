import ReactDOM from "react-dom/client";
import App from "./App";
import {KraPerformance} from "./components/KraPerformance";
const path=window.location.pathname.replace(/\/$/,"");
const standalone=path==="/kra/jimmeey-gondaa"||path==="/kra";
document.documentElement.dataset.theme=localStorage.getItem("floor-theme")||"gloss";
ReactDOM.createRoot(document.getElementById("root")!).render(
  standalone?<main className="kra-standalone"><KraPerformance/></main>:<App/>
);
