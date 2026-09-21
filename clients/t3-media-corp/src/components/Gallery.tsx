import { MaterialPlate } from './MaterialPlate';
import { Reveal } from './Reveal';

export function Gallery({
  items,
  productName,
}: {
  items: { plate: string; caption: string }[];
  productName: string;
}) {
  if (!items.length) return null;
  return (
    <section className="section-tight bg-bone" aria-labelledby="gallery-heading">
      <div className="shell">
        <p className="eyebrow text-muted">Gallery</p>
        <h2 id="gallery-heading" className="display-2 mt-5 max-w-xl text-ink">
          {productName}, up close
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={item.plate + i} delay={i * 90}>
              <figure className="group">
                <div className="aspect-[4/3] overflow-hidden bg-mist">
                  <MaterialPlate
                    plate={item.plate}
                    alt={`${productName} — ${item.caption}`}
                    className="zoom-plate h-full w-full object-cover"
                  />
                </div>
                <figcaption className="mt-3 text-[0.8125rem] text-slate">{item.caption}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
        <p className="mt-10 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
          Material studies, not stock photography. The full design range is on display at the
          Begur Road showroom — translucent and gloss materials in particular have to be seen lit.
        </p>
      </div>
    </section>
  );
}
