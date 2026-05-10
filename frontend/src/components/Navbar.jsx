import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <div
      style={{
        background: "#0f172a",
        color: "white",
        padding: "20px",
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <h2>SecureLedger</h2>

      <div style={{ display: "flex", gap: "20px" }}>
        <Link to="/" style={{ color: "white" }}>
          Dashboard
        </Link>

        <Link to="/risk" style={{ color: "white" }}>
          Risk Table
        </Link>

        <Link to="/rings" style={{ color: "white" }}>
          Fraud Rings
        </Link>

        <Link to="/investigator" style={{ color: "white" }}>
          Investigator
        </Link>
      </div>
    </div>
  );
}