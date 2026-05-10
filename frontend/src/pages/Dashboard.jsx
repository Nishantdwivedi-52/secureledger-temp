import Navbar from "../components/Navbar";
import RiskCard from "../components/RiskCard";

export default function Dashboard() {
  return (
    <div>
      <Navbar />

      <div style={{ padding: "30px" }}>
        <h1>SecureLedger Dashboard</h1>

        <div
          style={{
            display: "flex",
            gap: "20px",
            marginTop: "30px",
          }}
        >
          <RiskCard title="Fraud Rings" value="12" />
          <RiskCard title="High Risk Accounts" value="84" />
          <RiskCard title="Transactions" value="1.2M" />
        </div>
      </div>
    </div>
  );
}