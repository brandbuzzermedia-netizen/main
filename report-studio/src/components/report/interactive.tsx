"use client";
// The only interactive parts of a report page. They render the same markup on
// the server, so the PDF and the first paint match the prototype.
import { useState, type ReactNode } from "react";

export interface MatrixRow {
  id: string;
  art: ReactNode;
  caption: string;
  type: string;
  date: string;
  dateLabel: string;
  views: number | null;
  likes: string;
  comments: string;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  er: number | null;
  insight: string;
  viewsLabel: string;
  sharesLabel: string;
  savesLabel: string;
  reachLabel: string;
  erLabel: string;
}

type SortKey = "date" | "views" | "shares" | "saves" | "reach" | "er";

/** Content performance matrix, sortable by clicking a column. */
/** `max` is the most views of any piece this month, so bars compare across pages. */
export function ContentMatrix({ rows, max }: { rows: MatrixRow[]; max?: number }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: number }>({ k: "views", dir: -1 });
  const val = (x: MatrixRow) => (sort.k === "date" ? x.date : x[sort.k]) as string | number | null;
  const sorted = rows.slice().sort((a, b) => {
    const fa = val(a) as number, fb = val(b) as number;
    return (fa > fb ? 1 : fa < fb ? -1 : 0) * sort.dir;
  });
  const mx = max ?? Math.max(...rows.map((x) => x.views || 0), 1);
  const th = (k: SortKey, label: string) => (
    <th>
      <button
        type="button"
        className={sort.k === k ? "on" : ""}
        onClick={() => setSort(sort.k === k ? { k, dir: -sort.dir } : { k, dir: k === "date" ? 1 : -1 })}
      >
        {/* One text node, as in the prototype: split nodes shape a hair wider. */}
        {`${label}${sort.k === k ? (sort.dir < 0 ? " ↓" : " ↑") : ""}`}
      </button>
    </th>
  );
  return (
    <table className="cmat">
      <tbody>
        <tr>
          <th></th><th>Content</th><th>Type</th>
          {th("date", "Date")}{th("views", "Views")}
          <th>Likes</th><th>Comments</th>
          {th("shares", "Shares")}{th("saves", "Saves")}{th("reach", "Reach")}{th("er", "Engagement")}
          <th>Key insight</th>
        </tr>
        {sorted.map((x) => (
          <tr key={x.id}>
            <td><span className="th">{x.art}</span></td>
            <td style={{ maxWidth: 170 }}>{x.caption}</td>
            <td>{x.type}</td>
            <td>{x.dateLabel}</td>
            <td><b>{x.viewsLabel}</b><i className="vb" style={{ width: `${((x.views || 0) / mx) * 100}%` }} /></td>
            <td>{x.likes}</td>
            <td>{x.comments}</td>
            <td>{x.sharesLabel}</td>
            <td>{x.savesLabel}</td>
            <td>{x.reachLabel}</td>
            <td>{x.erLabel}</td>
            <td style={{ maxWidth: 150 }}>{x.insight}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Caption clamped to two lines on screen, with a toggle. Printing always shows it in full. */
export function Caption({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className={`cap ${open ? "open" : ""}`}>{text}</p>
      <button type="button" className="lnk nop" onClick={() => setOpen(!open)}>
        {open ? "Hide full caption" : "View full caption"}
      </button>
    </>
  );
}
