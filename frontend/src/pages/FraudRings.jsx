import Navbar from "../components/Navbar";

export default function FraudRings() {
  const rings = [
    {
      id: "Ring-101",
      members: 12,
      mastermind: "ACC901",
    },
    {
      id: "Ring-204",
      members: 8,
      mastermind: "ACC712",
    },
  ];

  return (
    <div>
      <Navbar />

      <div style={{ padding: "30px" }}>
        <h1>Fraud Rings</h1>

        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>Ring ID</th>
              <th>Members</th>
              <th>Mastermind</th>
            </tr>
          </thead>

          <tbody>
            {rings.map((ring) => (
              <tr key={ring.id}>
                <td>{ring.id}</td>
                <td>{ring.members}</td>
                <td>{ring.mastermind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}