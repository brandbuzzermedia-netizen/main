#!/usr/bin/env python3
"""
Turn the static export into a flat, fully-relative preview bundle.

The artifact host does not serve an artifact at an origin root, so the export's
absolute references (`/_next/...`, `/plates/...`, `/products/wpc-doors/`) all
resolve outside the artifact and 404. This script rewrites the build so it works
from ANY base path:

  * every page moves to the root as a flat file  (products/wpc-doors/index.html
    -> products-wpc-doors.html), so one relative prefix is correct everywhere
  * `_next/` -> `next-static/` (the host reserves paths beginning with `_`)
  * every absolute URL becomes relative, including webpack's publicPath
  * a capture-phase click handler does plain full-page navigation, so Next's
    client router cannot push the original absolute routes back into the URL

This is a preview-only transform. `out/` stays the canonical build, and a real
static host needs none of it.

    python3 tools/make_preview.py <out-dir> <preview-dir>
"""

import pathlib
import re
import shutil
import sys

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
DST = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'preview')

if DST.exists():
    shutil.rmtree(DST)
DST.mkdir(parents=True)


def flat_name(route: str) -> str:
    """'/products/wpc-doors/' -> 'products-wpc-doors.html'"""
    r = route.strip('/')
    return 'index.html' if not r else r.replace('/', '-') + '.html'


# ---- move pages to flat files, copy assets ---------------------------------
routes = {}
for page in SRC.rglob('index.html'):
    route = '/' + str(page.parent.relative_to(SRC)).replace('\\', '/').strip('.') .strip('/')
    route = '/' if route == '/' else route + '/'
    routes[route] = flat_name(route)

for asset_dir, target in (('_next', 'next-static'), ('plates', 'plates'), ('brand', 'brand')):
    src = SRC / asset_dir
    if src.exists():
        shutil.copytree(src, DST / target)

for extra in ('icon.png', 'apple-icon.png', 'robots.txt', 'sitemap.xml', '404.html'):
    if (SRC / extra).exists():
        shutil.copy2(SRC / extra, DST / extra)

# Full-page navigation, installed before React hydrates so Next's router never
# sees the click and cannot rewrite the address bar to a route that 404s here.
SHIM = """<script>(function(){
var M=__ROUTE_MAP__, PAGE=/^[A-Za-z0-9._-]+\\.html(#.*)?$/;
// Next's <Link> takes its href from the hydration payload, not the DOM, so it
// would push the original absolute route no matter what the markup says.
// Capturing on document runs before React's root listener, so the event never
// reaches the router and navigation stays a plain full-page load.
document.addEventListener('click',function(e){
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
  var h=a.getAttribute('href');if(!h||h[0]==='#')return;
  if(h[0]==='/'){                      // absolute route restored by hydration
    var hash='',i=h.indexOf('#');
    if(i>-1){hash=h.slice(i);h=h.slice(0,i);}
    if(!(h in M))return;
    h=M[h]+hash;
  } else if(!PAGE.test(h))return;      // external, tel:, mailto:, wa.me
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  location.href=h;
},true);
// The router prefetches RSC payloads for the original absolute routes, which
// do not exist in a flat bundle. Nothing consumes them, so answer locally
// instead of letting each one 404 in the console.
var F=window.fetch;
window.fetch=function(u){
  var s=typeof u==='string'?u:(u&&(u.url||u.href))||String(u||'');
  if(s.indexOf('_rsc=')>-1)return Promise.resolve(new Response(null,{status:204}));
  return F.apply(this,arguments);
};
})();</script>"""


def rewrite(html: str) -> str:
    # Assets: absolute -> relative (every page sits at the same depth now).
    html = html.replace('"/_next/', '"next-static/').replace("'/_next/", "'next-static/")
    html = html.replace('"/plates/', '"plates/').replace("'/plates/", "'plates/")
    html = html.replace('"/brand/', '"brand/').replace("'/brand/", "'brand/")
    # The icons carry a cache-busting query string, so match them loosely.
    html = re.sub(r'(?<=["\\])/(apple-)?icon\.png', lambda m: m.group(0).lstrip('/'), html)

    # Internal route links -> flat filenames, longest route first so
    # '/products/acp/' is not eaten by '/products/'.
    for route in sorted(routes, key=len, reverse=True):
        html = html.replace(f'href="{route}"', f'href="{routes[route]}"')
        html = html.replace(f'href="{route}#', f'href="{routes[route]}#')
    html = html.replace('href="/"', 'href="index.html"')

    # Drop the UTF-8 decoder polyfill: it carries literal U+FFFD characters that
    # the artifact publisher rejects, and only pre-ES-module browsers run it.
    html = re.sub(r'<script[^>]*polyfills-[^>]*></script>', '', html)

    route_map = '{' + ','.join(
        f'"{r}":"{n}"' for r, n in sorted(routes.items())
    ) + ',"/":"index.html"}'
    shim = SHIM.replace('__ROUTE_MAP__', route_map)
    return html.replace('</head>', shim + '</head>', 1)


for route, name in routes.items():
    (DST / name).write_text(rewrite((SRC / route.strip('/') / 'index.html').read_text(encoding='utf-8')
                                    if route != '/' else (SRC / 'index.html').read_text(encoding='utf-8')),
                            encoding='utf-8')

if (DST / '404.html').exists():
    (DST / '404.html').write_text(rewrite((DST / '404.html').read_text(encoding='utf-8')), encoding='utf-8')

# The stylesheet's @font-face rules point at /_next/static/media/... Relative to
# the CSS file (next-static/static/css/) the fonts sit one level up in media/.
for css in (DST / 'next-static').rglob('*.css'):
    s = css.read_text(encoding='utf-8')
    t = s.replace('url(/_next/static/media/', 'url(../media/')
    if t != s:
        css.write_text(t, encoding='utf-8')

# webpack's publicPath is the one absolute URL not in the HTML.
for js in (DST / 'next-static').rglob('*.js'):
    s = js.read_text(encoding='utf-8')
    t = s.replace('p="/_next/"', 'p="next-static/"').replace("p='/_next/'", "p='next-static/'")
    t = t.replace('"/_next/', '"next-static/')
    if t != s:
        js.write_text(t, encoding='utf-8')

# The polyfill chunk is referenced by nothing now, and cannot be published.
for p in (DST / 'next-static').rglob('polyfills-*.js'):
    p.unlink()

print(f'{len(routes)} pages flattened into {DST}')
for r, n in sorted(routes.items()):
    print(f'  {r:42s} -> {n}')
