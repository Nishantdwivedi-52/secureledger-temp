
import Navbar from "../components/Navbar";

export default function RiskTable() {
  const accounts = [
    { id: "ACC101", risk: 0.95 },
    { id: "ACC204", risk: 0.89 },
    { id: "ACC777", risk: 0.82 },
  ];

  return (
    <div>
      <Navbar />

      <div style={{ padding: "30px" }}>
        <h1>High Risk Accounts</h1>

        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>Account</th>
              <th>Risk Score</th>
            </tr>
          </thead>

          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id}>
                <td>{acc.id}</td>
                <td>{acc.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}