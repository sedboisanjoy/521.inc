import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// NOTE: Arwes' Animator is incompatible with React.StrictMode's double-invoke,
// so the app is rendered without StrictMode (per the Arwes setup guidance).
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
