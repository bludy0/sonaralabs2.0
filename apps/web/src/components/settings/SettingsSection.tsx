import { C } from "../../theme";

// ── Bölüm başlığı ─────────────────────────────────────────────────────────────
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase", color: C.text3,
        marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>{title}</h2>
      {children}
    </div>
  );
}

export function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, color: C.text1 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
