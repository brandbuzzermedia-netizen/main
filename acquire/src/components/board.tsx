"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Badge, cx } from "./ui";

export type BoardColumn = { id: string; title: string; tone: "neutral" | "info" | "brand" | "ok" | "danger" | "warn"; count: number; footer?: string; moreHref?: string };
export type BoardCard = { id: string; columnId: string; href: string; title: string; lines: string[]; aside?: string };

/**
 * Kanban board. Drag a card to another column, or use its "Move to" menu (keyboard and touch).
 * The move is shown immediately and rolled back if the server refuses it.
 */
export function Board({
  columns, cards, canMove, move, label,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
  canMove: boolean;
  move: (cardId: string, columnId: string) => Promise<{ error?: string }>;
  label: string;
}) {
  const [optimistic, applyMove] = useOptimistic(cards, (state, m: { id: string; to: string }) =>
    state.map((c) => (c.id === m.id ? { ...c, columnId: m.to } : c)),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const doMove = (id: string, to: string) => {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.columnId === to) return;
    setError(null);
    startTransition(async () => {
      applyMove({ id, to });
      const r = await move(id, to);
      if (r.error) setError(r.error);
    });
  };

  // Column counts include cards not shown on the board; adjust them for moves made here.
  const delta = new Map<string, number>();
  for (const c of cards) {
    const now = optimistic.find((o) => o.id === c.id)?.columnId;
    if (now && now !== c.columnId) {
      delta.set(c.columnId, (delta.get(c.columnId) ?? 0) - 1);
      delta.set(now, (delta.get(now) ?? 0) + 1);
    }
  }

  return (
    <>
      {error && <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" aria-label={label} role="region">
        <div className="flex gap-3" style={{ minWidth: `${columns.length * 15.75}rem` }}>
          {columns.map((col) => {
            const colCards = optimistic.filter((c) => c.columnId === col.id);
            const count = col.count + (delta.get(col.id) ?? 0);
            return (
              <section
                key={col.id}
                aria-label={`${col.title}: ${count}`}
                onDragOver={canMove ? (e) => { e.preventDefault(); setOver(col.id); } : undefined}
                onDragLeave={canMove ? () => setOver((o) => (o === col.id ? null : o)) : undefined}
                onDrop={canMove ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) doMove(id, col.id); } : undefined}
                className={cx(
                  "flex w-60 shrink-0 flex-col rounded-xl border bg-surface-2/60 transition-colors",
                  over === col.id && dragging ? "border-brand bg-brand-soft/40" : "border-line",
                )}
              >
                <header className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={col.tone}>{col.title}</Badge>
                    <span className="tabular text-xs text-muted">{count}</span>
                  </div>
                  {col.footer && <div className="tabular mt-1 text-xs text-muted">{col.footer}</div>}
                </header>
                <ul className="flex min-h-16 flex-col gap-2 px-2 pb-2">
                  {colCards.map((card) => (
                    <li
                      key={card.id}
                      draggable={canMove}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; setDragging(card.id); }}
                      onDragEnd={() => setDragging(null)}
                      className={cx("rounded-lg border border-line bg-surface p-2.5 text-sm", canMove && "cursor-grab active:cursor-grabbing", dragging === card.id && "opacity-50")}
                    >
                      <Link href={card.href} className="font-medium hover:text-brand">{card.title}</Link>
                      {card.lines.map((line, i) => <div key={i} className="truncate text-xs text-muted">{line}</div>)}
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {card.aside ? <span className="tabular truncate text-xs text-muted">{card.aside}</span> : <span />}
                        {canMove && (
                          <>
                            <label htmlFor={`move-${card.id}`} className="sr-only">Move {card.title} to</label>
                            <select
                              id={`move-${card.id}`}
                              value={card.columnId}
                              onChange={(e) => doMove(card.id, e.target.value)}
                              className="max-w-24 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-muted"
                            >
                              {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                  {count === 0 && <li className="px-1 py-3 text-center text-xs text-muted">Empty</li>}
                  {col.moreHref && count > colCards.length && (
                    <li><Link href={col.moreHref} className="block px-1 py-1 text-center text-xs text-brand">All {count} →</Link></li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
