import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import RiskTable from "./pages/RiskTable";
import FraudRings from "./pages/FraudRings";
import Investigator from "./pages/Investigator";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/risk" element={<RiskTable />} />
        <Route path="/rings" element={<FraudRings />} />
        <Route path="/investigator" element={<Investigator />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;