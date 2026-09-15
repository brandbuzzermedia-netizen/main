# Platform adapters

Every integration implements `PlatformAdapter` (`src/platforms/adapter.js`).
Adding a platform is one subclass and one line in `src/platforms/registry.js`;
nothing else in the system changes, because everything reads capabilities off
the adapter rather than hard-coding platform names.

## The three rules

1. **Official APIs only.** Documented, officially supported endpoints, called
   with credentials the account owner granted through OAuth.
2. **Unsupported means manual.** If an operation is not officially supported,
   the adapter raises `ManualActionRequired` with an explanation and a next
   step. It never invents a workaround.
3. **Rate limits are respected as published.** A 429 is backed off using the
   platform's own `Retry-After`, never routed around.

## Capability matrix

Read from the live adapters at `GET /api/platforms`. As registered today:

| Platform | Publishes | Comments | Public search | Own insights |
| --- | --- | --- | --- | --- |
| Instagram | image, carousel, reel | yes | **no** | yes |
| Facebook | image, text, link, video, reel | yes | **no** | yes |
| LinkedIn | text, link, image, document, video | yes | **no** | yes |
| X | text, link, image, video | yes | yes (paid tiers) | yes |
| Reddit | text, link, image | yes | yes | no |
| Quora | **none** | **no** | **no** | no |
| Threads | text, image, video, link | yes | **no** | yes |
| YouTube | short video, long video | yes | yes | yes |

Capabilities are checked twice: before an item can be scheduled, and again
immediately before publishing — platform capabilities change under us.

## Notable manual-action cases

- **Instagram Stories** — not available to this integration type. Post from the
  app.
- **Instagram/Threads text posts** — no such post type exists.
- **Facebook carousels** — need the paid ads API.
- **LinkedIn media** — requires an asset registered through the Assets API
  first. Without an asset URN the adapter refuses rather than silently
  publishing a text-only version a reviewer did not approve.
- **Quora — everything.** Quora publishes no write API and no public content
  API. Every operation is manual, and the adapter does not scrape. Quora work is
  tracked by hand: a team member adds the question URL, the AI drafts an answer,
  and a person posts it.
- **Instagram, Facebook, LinkedIn, Threads public search** — no general
  public-search API exists. Those adapters return an empty result rather than
  reaching for an unofficial source, and the research run reports this plainly
  per platform.

## Reddit specifically

Reddit is where promotional participation does the most damage, so:

- Reddit opportunities **always** require human approval, whatever they score
  (`ALWAYS_REVIEW_PLATFORMS` in `src/engines/engagement.js`).
- Subreddit rules are fetched through the official API and carried into the
  comment prompt.
- Any promotional phrasing fails the platform-suitability check for Reddit.
- The user agent must identify your app and a contact account, as Reddit's API
  terms require (`REDDIT_USER_AGENT`).

## Adding a platform

```js
export class NewPlatformAdapter extends PlatformAdapter {
  static platform = 'newplatform';
  static displayName = 'New Platform';
  static requiredScopes = ['read', 'write'];
  static capabilities = {
    publish: ['text'], comment: true, readPublicSearch: false,
    readOwnInsights: false, readMentions: false, scheduleNatively: false,
    notes: { image: 'Image posting is not available through the API.' },
  };

  authorizeUrl({ state, redirectUri }) { /* … */ }
  async exchangeCode({ code, redirectUri }) { /* … */ }
  async publish(creds, draft) { this.assertCanPublish(draft.contentType); /* … */ }
}
```

Register it in `registry.js`, add its credentials to `isOAuthConfigured`, and
add its environment variables to `.env.example`. Be conservative in
`capabilities.publish`: claiming a capability the platform does not officially
offer is how a system ends up with a workaround in it.
