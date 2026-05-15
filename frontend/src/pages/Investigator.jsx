import Navbar from "../components/Navbar";

export default function Investigator() {
  const caseData = {
    account: "ACC901",
    risk: 0.97,
    bank: "Global Bank",
    transactions: 148,
    linkedAccounts: 23,
    suspiciousCountries: ["UAE", "Cyprus", "Panama"],
  };

  return (
    <div>
      <Navbar />

      <div style={{ padding: "30px", color: "white" }}>
        <h1>Investigator Dashboard</h1>

        <div
          style={{
            background: "#1e293b",
            padding: "20px",
            borderRadius: "10px",
            marginTop: "20px",
            width: "500px",
          }}
        >
          <h2>Primary Suspect</h2>

          <p>
            <strong>Account:</strong> {caseData.account}
          </p>

          <p>
            <strong>Risk Score:</strong> {caseData.risk}
          </p>

          <p>
            <strong>Bank:</strong> {caseData.bank}
          </p>

          <p>
            <strong>Total Transactions:</strong>{" "}
            {caseData.transactions}
          </p>

          <p>
            <strong>Linked Accounts:</strong>{" "}
            {caseData.linkedAccounts}
          </p>

          <div>
            <strong>Suspicious Countries:</strong>

            <ul>
              {caseData.suspiciousCountries.map((country) => (
                <li key={country}>{country}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}