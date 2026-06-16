import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import RiskTable from "./components/RiskTable";
import FraudRings from "./pages/FraudRings";
import Investigator from "./pages/Investigator";
import Structuring from "./pages/Structuring";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/risk" element={<RiskTable />} />
        <Route path="/rings" element={<FraudRings />} />
        <Route path="/investigator" element={<Investigator />} />
        <Route path="/structuring" element={<Structuring />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;