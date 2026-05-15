export default function RiskCard({ title, value, type }) {
  // Logic to determine the highlight color
  // "danger" type gets a red border, others get a subtle slate/green border
  const isDanger = type === "danger";
  const borderColor = isDanger ? "#ef4444" : "#334155"; 

  return (
    <div
      style={{
        background: "#1e293b",
        color: "white",
        padding: "20px",
        borderRadius: "12px",
        width: "240px",
        borderLeft: `6px solid ${borderColor}`,
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
        transition: "transform 0.2s ease-in-out",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }}
      // Optional: adds a little lift effect on hover
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0px)")}
    >
      <h3 style={{ 
        fontSize: "0.85rem", 
        textTransform: "uppercase", 
        letterSpacing: "0.05em", 
        color: "#94a3b8" 
      }}>
        {title}
      </h3>
      <h1 style={{ 
        fontSize: "2rem", 
        fontWeight: "bold",
        color: isDanger ? "#fca5a5" : "#f8fafc" 
      }}>
        {value}
      </h1>
    </div>
  );
}