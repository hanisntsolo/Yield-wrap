import { DesktopLeaderboardAd, MobileBannerAd, SidebarRectangleAd } from '../AdBanner';

/**
 * Page frame for dashboards: leaderboard ad (desktop), page header, optional right sidebar
 * (with a 300x250 rectangle ad on desktop) and a mobile banner ad on small screens.
 */
export default function DashboardShell({ title, subtitle, actions, page, sidebar, sidebarAd = false, banner, children }) {
  const hasSidebar = Boolean(sidebar) || sidebarAd;
  return (
    <div className="container-page py-5 sm:py-8">
      <DesktopLeaderboardAd page={page} className="mb-6" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {banner ? <div className="mb-6">{banner}</div> : null}
      {hasSidebar ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">{children}</div>
          <aside className="min-w-0" aria-label="Sidebar">
            <div className="space-y-6 lg:sticky lg:top-24">
              {sidebar}
              {sidebarAd ? <SidebarRectangleAd page={page} /> : null}
            </div>
          </aside>
        </div>
      ) : (
        <div className="space-y-6">{children}</div>
      )}
      <MobileBannerAd page={page} className="mt-6" />
    </div>
  );
}
