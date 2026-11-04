// A template remounts on every navigation, so each page's blocks rise in afresh.
export default function StudioTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
