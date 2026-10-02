// Stands in for next/link: a plain anchor; the router catches the click.
import type { AnchorHTMLAttributes } from "react";
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  const { prefetch: _p, ...rest } = props;
  return <a {...rest} />;
}
