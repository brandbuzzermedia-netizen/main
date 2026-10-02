export function FAQ({ items, title = 'Frequently asked' }: { items: { q: string; a: string }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="section-tight border-t border-line" aria-labelledby="faq-heading">
      <div className="shell grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="eyebrow text-stone">FAQ</p>
          <h2 id="faq-heading" className="display-2 mt-5 text-paper">
            {title}
          </h2>
        </div>
        <div className="divide-y divide-line border-t border-line">
          {items.map((item) => (
            <details key={item.q} className="group py-6">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[1.0625rem] font-medium text-paper marker:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="relative mt-2.5 h-3 w-3 shrink-0 transition-transform duration-300 ease-editorial group-open:rotate-45"
                >
                  <span className="absolute left-0 top-1/2 h-px w-full bg-graphite" />
                  <span className="absolute left-1/2 top-0 h-full w-px bg-graphite" />
                </span>
              </summary>
              <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-mist">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
