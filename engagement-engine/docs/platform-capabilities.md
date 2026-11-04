# Platform capabilities and API limitations

This is what each platform's **official** API lets the engine do, and therefore
what each adapter implements. Where an API cannot do something, the adapter says
so (`unsupported` or `manual`) and the engine does not work around it — no
scraping, no browser automation, no unofficial endpoints.

> Platform APIs, review requirements and terms change. Re-check every row
> against the live documentation and your app's approved permissions before
> enabling a capability in production. Capabilities that depend on a permission
> your app has not been granted fail closed. They do not fall back to anything.

## Summary matrix

| Capability | Instagram (Graph API) | Facebook Pages | LinkedIn | YouTube Data API v3 | X API v2 | TikTok |
| --- | --- | --- | --- | --- | --- | --- |
| Connect account (OAuth) | ✅ Business/Creator via Facebook Login for Business | ✅ Pages via Facebook Login | ✅ Member + Organization (Community Management API) | ✅ Google OAuth | ⚠️ Possible, not enabled | ❌ Not enabled |
| Discover by hashtag/keyword | ⚠️ Hashtag search only: 30 unique hashtags per account per 7 days, `recent_media` covers the last 24 h, **no author username** | ❌ No public post search | ❌ No post search API | ✅ `search.list` (100 quota units/call) | ⚠️ Paid tier only | ❌ Research API is academic-only |
| Monitor target profiles | ⚠️ Business Discovery: only Business/Creator accounts, basic profile + recent media | ❌ | ❌ | ✅ Channel uploads | ⚠️ Paid tier | ❌ |
| Comments on **own** posts (inbound) | ✅ | ✅ | ✅ Organization posts | ✅ Own videos | ⚠️ | ❌ |
| Mentions / tags of the account | ✅ `/{ig-user-id}/tags`, mentioned comments | ✅ `/{page-id}/tagged` | ⚠️ Notifications, limited | ❌ | ⚠️ | ❌ |
| Get author profile | ⚠️ Business/Creator only (Business Discovery) | ⚠️ Public Page info only | ❌ Other members' profiles not available | ✅ `channels.list` | ⚠️ | ❌ |
| **Publish** reply to comment on own post | ✅ `POST /{comment-id}/replies` | ✅ `POST /{comment-id}/comments` | ✅ `POST /rest/socialActions/{urn}/comments` | ✅ `comments.insert` | ⚠️ | ❌ |
| **Publish** comment on own post | ✅ `POST /{media-id}/comments` | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| **Publish** reply where the account was @mentioned | ✅ `POST /{ig-user-id}/mentions` | ✅ | ⚠️ | n/a | ⚠️ | ❌ |
| **Publish** comment on a third-party post | ❌ **Not supported** → manual action | ❌ → manual action | ⚠️ Comments API accepts a post URN with `w_organization_social` / `w_member_social`; off by default, verify it is within your approved product use → otherwise manual action | ✅ `commentThreads.insert` on any video with comments enabled (50 units) | 🚫 Disabled: X automation rules prohibit unsolicited automated replies | ❌ |
| Comment metrics (likes/replies) | ✅ Own comments | ✅ | ✅ `socialMetadata` | ✅ | ⚠️ | ❌ |
| Profile metrics (followers etc.) | ✅ `followers_count`, insights | ✅ Page insights | ✅ Follower statistics (org) | ✅ Channel statistics | ⚠️ | ❌ |

✅ implemented · ⚠️ limited, conditional or not enabled in MVP · ❌ the official API has no such capability · 🚫 the API could do it but platform rules prohibit the use case.

## What "manual action" means

Approval is still required. Once a comment is approved for a destination the
API cannot publish to (e.g. a third-party Instagram post found via hashtag
search), the publishing job becomes **Manual action required**. The queue shows
the approved text, a copy button and the post link. A team member posts it from
the client's own account and records the resulting URL, which marks the comment
published and keeps analytics complete. The engine never publishes these
itself.

## Instagram (Instagram API with Facebook Login)

* **Account type:** Instagram Professional (Business or Creator) linked to a
  Facebook Page. Personal accounts cannot be connected.
* **Permissions (App Review):** `instagram_basic`, `instagram_manage_comments`,
  `pages_show_list`, `pages_read_engagement`, `business_management`.
  Hashtag search additionally requires the *Instagram Public Content Access*
  feature.
* **Hashtag search:** `GET /ig_hashtag_search?user_id=&q=` →
  `GET /{hashtag-id}/recent_media|top_media?user_id=&fields=…`.
  - Max **30 unique hashtags per account per rolling 7 days**. The adapter
    records each queried hashtag in `usage_events` and stops at the limit.
  - `recent_media` only returns media from the last 24 hours.
  - Returned media **do not include the author's username**, so "author
    relevance" for hashtag results relies on content only, and the
    explanation says so.
* **Business Discovery:** `GET /{ig-user-id}?fields=business_discovery.username(x){…}` —
  only for Business/Creator accounts; returns follower count, bio, recent
  media. Used for target profiles and author analysis.
* **Publishing:** only on the account's own media, replies to comments on its
  own media, and replies to media/comments where it was @mentioned. Creating
  a comment on someone else's media is not supported by the API, so those
  opportunities are `manual_only`.
* **Rate limits:** Business Use Case rate limiting
  (`X-Business-Use-Case-Usage` header). The adapter reads it and backs off.

## Facebook Pages

* **Permissions:** `pages_show_list`, `pages_read_engagement`,
  `pages_read_user_content`, `pages_manage_engagement`.
* **Discovery:** comments on the Page's own posts (`/{page-id}/posts`,
  `/{post-id}/comments`) and posts the Page is tagged in (`/{page-id}/tagged`).
  There is no public post search.
* **Publishing:** replies as the Page to comments on its own posts. Commenting
  on other Pages' or people's posts is manual-only.

## LinkedIn

* **Products:** *Sign In with LinkedIn using OpenID Connect* (`openid`,
  `profile`, `email`), *Share on LinkedIn* (`w_member_social`) and, for company
  pages, the **Community Management API** (`r_organization_social`,
  `w_organization_social`, `rw_organization_admin`). This is a gated product
  that needs LinkedIn approval, and the member must be an admin of the page.
* **Versioning:** every `/rest/*` call sends `LinkedIn-Version: YYYYMM`
  (`LINKEDIN_API_VERSION`) and `X-Restli-Protocol-Version: 2.0.0`.
* **Discovery:** there is **no post search API**. The engine can read the
  organisation's own posts and their comments (inbound conversations).
  Outbound opportunities come from **manual intake** (paste a post URL and
  text).
* **Publishing:** `POST /rest/socialActions/{postUrn}/comments` with
  `actor` = organisation or member URN. Replies to comments on the
  organisation's own posts are enabled. Commenting on third-party posts is
  behind `LINKEDIN_ALLOW_THIRD_PARTY_COMMENTS=false` (off by default) because
  that use must be inside the approved scope of your LinkedIn developer
  application. Until then those opportunities are manual-only.
* **Author data:** other members' profiles are not available through the API.
  Author fields come from manual intake.

## YouTube (Data API v3)

* **Scope:** `https://www.googleapis.com/auth/youtube.force-ssl`.
* **Discovery:** `search.list` (`type=video`, `q`, `publishedAfter`,
  `regionCode`); **100 units per call** against a default **10,000
  units/day** project quota. The adapter tracks units in `usage_events`.
* **Publishing:** `commentThreads.insert` (top-level comment on a video) and
  `comments.insert` (reply), 50 units each. Videos with comments disabled are
  skipped.
* Implemented as an adapter but **not part of the MVP UI by default**
  (`ENABLED_PLATFORMS`).

## X (API v2)

* Keyword search (`/2/tweets/search/recent`) needs a paid access tier.
* X's automation rules prohibit sending automated, unsolicited replies to
  posts found by keyword search. The adapter declares publishing to
  third-party posts **prohibited**, and the platform is disabled.

## TikTok

* The Research API is restricted to academic researchers. The Content Posting
  and Display APIs do not provide discovery of others' content or commenting
  on it. The adapter declares every engagement capability **unsupported**.

## Internal limits vs platform limits

`usage_limits` (daily opportunities, daily approved/published comments,
minimum minutes between comments per account, monthly AI generations) are
**internal** controls GBS sets per client and platform. They are always applied
*in addition to* platform limits, never instead of them. When a platform
returns a rate-limit or quota error, the job is rescheduled with exponential
back-off. The engine has no rate-limit bypass logic.
