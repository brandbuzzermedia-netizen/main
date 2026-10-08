/**
 * Renders a material plate from public/plates/.
 *
 * The plates are designed material studies, not photographs of stock — the
 * client's own product photography was not available when this was built.
 * Drop a real image into public/plates/<id>.<ext> and update PLATE_EXT to
 * switch the whole site over to photography with no other code change.
 */

export const PLATE_EXT = 'svg';

type Props = {
  plate: string;
  alt: string;
  className?: string;
  /** Above-the-fold plates should not be lazy-loaded. */
  priority?: boolean;
  sizes?: string;
};

export function MaterialPlate({ plate, alt, className = '', priority = false }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/plates/${plate}.${PLATE_EXT}`}
      alt={alt}
      width={1200}
      height={900}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
      className={className}
    />
  );
}
