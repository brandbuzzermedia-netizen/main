"use client";

/** Toolbar above the proposal pages (hidden when printing): back to the editor, and Download PDF. */
export function PrintBar({ back }: { back: string }) {
  return (
    <div className="gbs-noprint" style={{ width: "min(210mm, calc(100% - 32px))", margin: "0 auto 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: "Poppins, sans-serif", fontSize: 13 }}>
      <a href={back} style={{ color: "#196144", fontWeight: 600 }}>← Back to edit</a>
      <span style={{ color: "#666" }}>In the print window choose <b>Save as PDF</b>, paper A4, and turn on <b>Background graphics</b>.</span>
      <button type="button" onClick={() => window.print()} style={{ background: "#196144", color: "#fff", border: 0, borderRadius: 6, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>Download PDF</button>
    </div>
  );
}
