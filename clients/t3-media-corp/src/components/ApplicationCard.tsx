import Link from 'next/link';
import type { Application } from '@/data/applications';
import { products } from '@/data/products';
import { MaterialPlate } from './MaterialPlate';

const slugFor = (name: string) => products.find((p) => p.name === name)?.slug;

export function ApplicationCard({ application }: { application: Application }) {
  return (
    <article id={application.slug} className="group scroll-mt-28">
      <div className="aspect-[5/4] overflow-hidden bg-charcoal">
        <MaterialPlate
          plate={application.plate}
          alt={`Materials used for ${application.name.toLowerCase()}`}
          className="zoom-plate h-full w-full object-cover"
        />
      </div>
      <h3 className="display-3 mt-6 text-paper">{application.name}</h3>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-mist">{application.body}</p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {application.materials.map((m) => {
          const slug = slugFor(m);
          return (
            <li key={m}>
              {slug ? (
                <Link
                  href={`/products/${slug}/`}
                  className="inline-flex min-h-[40px] items-center border border-line px-3.5 text-[0.6875rem] uppercase tracking-eyebrow text-mist transition-colors duration-200 hover:border-paper hover:bg-paper hover:text-paper"
                >
                  {m}
                </Link>
              ) : (
                <span className="inline-flex min-h-[40px] items-center border border-line px-3.5 text-[0.6875rem] uppercase tracking-eyebrow text-mist">
                  {m}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
