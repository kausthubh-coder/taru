# Business model and competition for a solo, low-budget open-source GitHub alternative / GitHub-layer product (as of October 12, 2026)

Notes from web research on 2026-10-12. Dates are labelled. "Unverified" means a single secondary or aggregator source, or a claim I could not check against a primary page. Calculations marked "my calculation" use the cited prices plus stated assumptions; they are not measured figures.

## 1. Competitive landscape (status Oct 2026)

### Takeaway
The space split during 2025-2026. Incumbents (GitHub, GitLab, Bitbucket) compete on price and bundling. Well-funded "agent-era" entrants (Cursor Origin, Entire, ERSC, GitButler, CodeRabbit) compete with tens to hundreds of millions in VC. A long tail of open-source forges (Forgejo/Codeberg, sourcehut, Gitea, Tangled, Radicle, Gerrit) compete on ownership, ethics and self-hosting. Two "git storage for agents" infrastructure plays (Pierre's Code Storage, Cloudflare Artifacts) now set public reference prices for raw git hosting. A solo founder cannot outspend any funded player. The open niches are trust/ownership, self-hosting and specific workflows.

### Cited Findings
**Incumbents**
- **GitHub (reference point):** stacked pull requests went GA on Oct 6, 2026 on all github.com plans, with GHES support coming later, plus the `gh stack` CLI extension — [GitHub changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/). Copilot Business costs $19/user/month. Since June 1, 2026 all Copilot plans bill premium AI use, including code review, through "GitHub AI Credits" (1 credit = $0.01) — [aicodereview.cc](https://aicodereview.cc/blog/github-copilot-pricing) (secondary, unverified against GitHub's own page). Linux 2-core Actions minutes are $0.006/min after a price cut of up to 39% on Jan 1, 2026. A proposed $0.002/min fee for self-hosted runners was withdrawn within 48 hours — [Platform Engineering substack](https://theplatformengineering.substack.com/p/github-actions-2026-pricing-changes) (secondary).
- **GitLab:** Free ($0, 400 compute min, 10 GiB); Premium $29/user/month (10,000 min, 500 GiB, 12 AI credits/user); Ultimate at custom pricing (50,000 min). The same tiers apply self-managed. AI "GitLab Credits" are $1 each — [GitLab pricing](https://about.gitlab.com/pricing/). Open core and self-hostable. Public company. Q2 FY2027 (reported Sept 1, 2026): revenue $286.3M (+21% YoY), GAAP gross margin 84% / non-GAAP 86%, GAAP operating loss $56.9M, non-GAAP operating income $42.6M, dollar-based net retention 117% — [GitLab press release via BusinessWire](https://secure.businesswire.com/news/home/20260901768402/en/GitLab-Reports-Second-Quarter-Fiscal-Year-2027-Financial-Results); [Pulse2](https://pulse2.com/gitlab-q2-fiscal-2027-revenue-rises-21-to-286-3-million-as-net-arr-growth-exceeds-40/).
- **Bitbucket (Atlassian):** Free for up to 5 users (50 build min, 1 GB LFS); Standard $3.65/user/month; Premium $7.25/user/month. Extra build minutes cost $10 per 1,000, and extra storage $10 per 100 GB — [Bitbucket pricing](https://www.atlassian.com/software/bitbucket/pricing). Proprietary. Self-hosting through Data Center not re-verified this session.

**Open-source forges**
- **Gitea:** MIT-licensed, self-hostable. The commercial entity is CommitGo, Inc., which sells Gitea Cloud (managed instances) and Gitea Enterprise at $9.50-$19/user/month on annual terms (SSO, audit logs, SLA) — [Gitea pricing](https://about.gitea.com/pricing); [Gitea Cloud blog](https://blog.gitea.com/gitea-cloud/).
- **Forgejo:** Gitea fork launched by Codeberg in Dec 2022 after a dispute over Gitea's direction. Moved from MIT to GPL in Aug 2024. Free, self-hostable, nonprofit-governed — [Wikipedia: Forgejo](https://en.wikipedia.org/wiki/Forgejo); [forgejo.org](https://forgejo.org/).
- **Codeberg:** nonprofit Codeberg e.V. (Germany), funded by donations and membership fees with "no large sponsor, no venture capital"; 1,691 paying members (May 15, 2026); first public budget published May 2026 — [Codeberg blog](https://blog.codeberg.org/codebergs-budget-of-2026.html). Over 300,000 repos and 200,000 accounts as of Nov 2025 — [Wikipedia: Codeberg](https://en.wikipedia.org/wiki/Codeberg). Hosting is for free/open-source projects; private commercial use is limited — [Codeberg FAQ](https://docs.codeberg.org/getting-started/faq/).
- **sourcehut:** $4, $8 or $12 per month, with identical features at every price. Payment is required only to host your own projects. Still in public "alpha", 100% FOSS (AGPL and others), self-hostable, and explicitly "no AI features whatsoever" — [sourcehut pricing](https://sourcehut.org/pricing/). Last public financial report (2022): $132,226.50 subscription revenue ($123,677.57 after payment fees), +25% YoY; 5,651 paying users out of 35,877 registered (~11%); "sustainable, profitable, and growing" — [sourcehut 2022 financial report](https://sourcehut.org/blog/2023-03-27-2022-financial-report/).
- **Tangled:** federated "social coding" forge on Bluesky's AT Protocol, with stacked PRs and CI ("spindles"). Raised a €3.8M ($4.5M) seed on Mar 2, 2026, led by byFounders with Bain Capital Crypto, Antler, Thomas Dohmke and Avery Pennarun. 7,000+ users and 5,000+ repos after about a year. No monetization plan disclosed — [Tangled blog](https://blog.tangled.org/seed); [SiliconANGLE](https://siliconangle.com/2026/03/02/tangled-announces-4-5m-round-build-github-alternative-built-blueskys-protocol/). License not confirmed this session.
- **Radicle:** peer-to-peer forge, version 1.0 shipped. Funded by the Radworks token treasury/DAO rather than customer revenue. A centralized paid seed-node service (fiat or crypto) was planned; no pricing found — [Radworks forum](https://community.radworks.org/t/incentivising-seed-nodes-the-next-challenge-for-radworks/3434); [RGP-22](https://community.radworks.org/t/discussion-rgp-22-start-the-radworks-seed-network-rsn-org/3479).
- **Gerrit:** Apache 2.0, community-maintained, no license fees. Used by Android, Chromium, Qt and OpenInfra. GerritHub.io offers free hosting. Current release 3.14.4 — [gerritcodereview.com](https://www.gerritcodereview.com/).

**GitHub layers and AI review**
- **Graphite:** Hobby (free, personal repos), Starter $20/user/month, Team $40/user/month (unlimited AI reviews, merge queue), Enterprise custom — [Graphite pricing](https://graphite.com/pricing). Closed source; a layer on top of GitHub. Raised a $52M Series B in Mar 2025; 500+ companies; acquired by Cursor (Anysphere) on Dec 19, 2025 for undisclosed cash plus equity, and continues as an independent product — [SiliconANGLE](https://siliconangle.com/2025/12/19/cursor-acquires-ai-code-review-startup-graphite/). SpaceX then completed its $60B acquisition of Cursor on Aug 14, 2026 — [Mobile World Live](https://www.mobileworldlive.com/ai-cloud/spacex-completes-60b-cursor-acquisition/).
- **Cursor Origin:** code hosting on Cursor's infrastructure, launched Aug 17, 2026 in "early beta on all paid plans". Supports native repos and two-way GitHub sync (for synced repos GitHub stays the source of truth). CI through Depot and Buildkite. No separate price — [Cursor changelog](https://cursor.com/changelog/origin-code-hosting). One secondary source claims the Graphite team was set to build Origin — [learncursor.dev](https://www.learncursor.dev/compare/github-stacked-prs-vs-graphite-vs-origin) (unverified).
- **CodeRabbit:** AI PR review at $24/user/month (Pro) and $48 (Pro Plus), billed only for developers who open PRs. Raised $143M at a $1.5B post-money valuation on Aug 12, 2026; about $231M raised in total. Founded 2023 — [Sacra](https://sacra.com/c/coderabbit/); [ai2.work](https://ai2.work/blog/coderabbit-hits-1-5b-as-ai-code-review-becomes-infrastructure). Estimated $40M ARR in Apr 2026, up from about $5M in Apr 2025 — [Sacra](https://sacra.com/research/coderabbit) (estimate, unverified).
- **Greptile:** free tier of 50 reviews/month. Pro is $30/seat/month including 50 reviews per seat, then $1 per review; the top plan was cut from $50 to $30 on May 20, 2026. Enterprise includes self-hosting — [Costbench](https://www.costbench.com/changelog/greptile-price-decrease-2026-05/) (aggregator, unverified). About $41.9M raised; valued at $179M in Aug 2025 — [Premier Alts](https://www.premieralts.com/companies/greptile/funding-history) (aggregator, unverified).
- **GitButler:** Git client founded by GitHub co-founder Scott Chacon. $17M Series A led by a16z (Peter Levine joined the board), with Fly Ventures and A Capital; about Apr 2026. Now positioned as "infrastructure for how software gets built next", with a CLI for human and agent workflows and stacked branches. No pricing or license stated in the announcement — [GitButler blog](https://blog.gitbutler.com/series-a); [raising.fi](https://raising.fi/news/gitbutler-inc-series-a-april-2026).

**Agent-era platforms and infrastructure**
- **ERSC (East River Source Control):** New York, founded 2025, early-stage and venture-backed (amount not found). On Sept 1, 2026, jj creator Martin von Zweigbergk joined from Google as CTO; jj stays Apache 2.0. Building "next generation version control platforms for humans and machines". No public product or pricing found — [ERSC blog](https://ersc.io/blog/martin-joins-ersc); [ersc.io](https://ersc.io/).
- **Entire:** founded by former GitHub CEO Thomas Dohmke. $60M seed at a $300M valuation on Feb 10, 2026, led by Felicis with Madrona and M12; Felicis called it the largest dev-tool seed ever. First product is the open-source "Checkpoints" CLI, which stores agent context in repos — [TechCrunch](https://techcrunch.com/2026/02/10/former-github-ceo-raises-record-60m-dev-tool-seed-round-at-300m-valuation/embed/). Jul 8, 2026: launched a distributed VCS / "fast, independent Git network built for agents" that mirrors GitHub repos — [Entire news](https://entire.io/news). Pricing not found.
- **GitCafe:** public beta. Free tier for public projects (1 GiB per repo, 2 GiB total); Pro $20/month; Team 5x $40/seat/month; Team 10x $80/seat/month; Enterprise custom. Private repos are free during the beta. Pricing is tiered by storage, egress and API rate limits rather than features — [GitCafe pricing](https://git.cafe/pricing). Earlier notes: agent-readable docs, MCP access, native stacks, CI through Buildkite — [GitCafe docs](https://git.cafe/docs/agent-workflows). The operator, OSS status and self-hosting were not stated on the pricing page.
- **Pierre / Code Storage:** Pierre (YC; co-founders Jacob Thornton, Bootstrap co-creator, and Ian) launched as "a new way to review code" — [YC launch](https://www.ycombinator.com/launches/I6t-pierre-a-new-way-to-review-code). It has since paused signups for its code review app to focus on Code Storage — [HN thread, ~Feb 2026](https://news.ycombinator.com/item?id=46961760). Code Storage is usage-priced git infrastructure: hot storage $0.005/GB-hour, cold (untouched for 7+ days) $0.0002/GB-hour, bandwidth $0.06/GB in and $0.15/GB out. Customers include Lovable, Bolt, Amp, Poke and Parahelp — [code.storage](https://code.storage/).
- **Cloudflare Artifacts:** git-compatible versioned storage for agents ("tens of millions of repos"). $0.15 per 1,000 operations (first 10,000/month free) and $0.50/GB-month (first 1 GB free). Runs a custom Zig git server compiled to about 100 KB of WASM on Workers and Durable Objects — [Cloudflare Artifacts](https://www.cloudflare.com/products/artifacts/); [Cloudflare docs preview](https://41dd6664.previews.developers.cloudflare.com/artifacts/platform/pricing/index.md); [lilting.ch](https://lilting.ch/en/articles/cloudflare-artifacts-agent-filesystem). A Spanish-language outlet reports a Cloudflare $25K prize for "the next GitHub for AI agents" — [ecosistemastartup](https://ecosistemastartup.com/?p=113472) (unverified).

**Demand signals**
- Apr 28, 2026: Mitchell Hashimoto announced Ghostty is leaving GitHub, citing near-daily outages ("no longer a place for serious work"). He was talking to "multiple providers (both commercial and FOSS)" — [mitchellh.com](https://mitchellh.com/writing/ghostty-leaving-github).
- May 27, 2026: Theo (t3.gg) posted "GitHub is dying and git is not the right primitive" and asked someone else to "fix source control" — [X post](https://x.com/theo/status/2059428277786468407) (saved in `evidence/theo-source-control.json`).

### Inferences
- Pricing bands for 2026: low-cost hosting at $3.65-$12/user (Bitbucket, Gitea Enterprise, sourcehut); full DevOps platform at about $29/user (GitLab Premium); AI review and workflow layers at $20-$48/user (Graphite, CodeRabbit, Greptile). Pure git storage is now a metered commodity, from cents to a few dollars per GB-month (Code Storage, Artifacts).
- The funded entrants target "agents as users" and enterprise. Nobody well-funded is chasing reliable, trustworthy, self-hostable hosting for small teams and OSS projects. Codeberg and sourcehut serve that segment, but neither targets private commercial teams: Codeberg by policy, sourcehut by alpha status and its minimalist UX.
- Raw storage from Cloudflare Artifacts or Code Storage means a solo founder doesn't need to run git servers at scale. It also means anyone can build the same thing.

### Gaps
- Cursor Origin's standalone price and whether it requires a specific Cursor tier: not published.
- Entire's and ERSC's pricing, ERSC's funding amount, and Tangled's license and monetization plan: not found.
- GitCafe's operator and whether it is open source or self-hostable: not stated on the pricing page.
- Radicle's paid seed-node pricing: not found.
- Greptile's and CodeRabbit's numbers come from aggregators (Costbench, Sacra) and were not checked against their own pricing pages this session.

## 2. Failures and why (lessons on network effects, monetization, focus)

### Takeaway
Hosts died for four reasons: they ran a free public service subsidized by a shrinking paid line (Gitorious); they lost to a better product with the network (Google Code, Gitorious); the parent lost focus (Fog Creek/Kiln); or they betrayed user trust to monetize (SourceForge). Phacility shows that a one-person commercial steward can walk away, and that an open-source license is what let users continue (the Phorge fork). In 2026, Pierre and Tailwind add an AI-era lesson: a polished review app couldn't sustain itself while infrastructure could, and AI can disintermediate a docs-funnel business.

### Cited Findings
- **Phabricator/Phacility (2021):** on May 29, 2021, Phacility announced it was "winding down operations". No new hosted instances or support billing after June 1, 2021; upstream "will no longer be regularly updated". No reason was given, and commenters asked for one — [Phacility announcement](https://admin.phacility.com/phame/post/view/11/). The community fork Phorge released a stable version on Sept 7, 2022 — [Wikipedia: Phabricator](https://en.wikipedia.org/wiki/Phabricator). Users such as Blender and GHC had to plan migrations — [Blender bf-committers](https://archive.blender.org/lists/bf-committers/2021-May/051005.html); [GHC devs](https://mail.haskell.org/pipermail/ghc-devs/2021-September/020190.html).
- **Fog Creek Kiln / FogBugz:** FogBugz was rebranded Manuscript in late 2017 and sold to DevFactory on Aug 3, 2018. CEO Anil Dash said Fog Creek was "resource-constrained as a small company to do justice to Manuscript" as Glitch took off — [mjtsai.com](https://mjtsai.com/blog/2018/08/23/manuscript-fogbugz-sold-to-devfactory); [Glitch blog](https://blog.glitch.com/post/moving-forward-with-manuscript); [Wikipedia: FogBugz](https://en.wikipedia.org/wiki/FogBugz).
- **Gitorious (2015):** acquired by GitLab on Mar 3, 2015 and shut down on June 1, 2015. Gitorious CEO Rolf Bjaanes: "we saw more and more organizations adopting GitLab. Due to decreased income from on-premises customers, running the free Gitorious.org was no longer sustainable. GitLab was solving the same problem… better." — [Wikipedia: Gitorious](https://en.wikipedia.org/wiki/Gitorious); [The Next Web](https://thenextweb.com/news/gitlab-acquires-rival-gitorious-will-shut-june-1); [GitLab blog](https://about.gitlab.com/blog/gitlab-gitorious-free-software/).
- **Google Code (2015-2016):** new projects stopped in Mar 2015, read-only from Aug 24, 2015, closed in Jan 2016. GitHub and Bitbucket overtook it. Chris DiBona: "as developers migrated away… a growing share of the remaining projects were spam or abuse". Google moved about 1,000 of its own projects to GitHub — [Engadget](https://www.engadget.com/2015-03-13-google-code-closing.html); [The Register](https://www.theregister.com/2015/03/12/google_code_shutdown/).
- **SourceForge decline:** DevShare (Jul 2013) bundled ad-supported installers. In May 2015, SourceForge took over the dormant GIMP-for-Windows account and replaced its installers with adware-wrapped ones. Wine and Notepad++ left. New owners ended DevShare in 2016 — [How-To Geek](https://www.howtogeek.com/218764/warning-don%25e2%2580%2599t-download-software-from-sourceforge-if-you-can-help-it/); [PCWorld](https://www.pcworld.com/article/419579/new-sourceforge-owners-kill-contentious-devshare-bloatware-program.html); [Help Net Security](https://www.helpnetsecurity.com/2016/06/13/sourceforge-trust/).
- **Pierre's pivot (2025-2026):** launched (YC) as a code-review / GitHub-alternative app, then "paused signups on the code review app to focus on the code storage service". An HN commenter: "Productizing the building blocks of the platform seems like the smart play in today's environment". A user replied that they wanted a "beautiful and faster alternative", not building blocks — [HN](https://news.ycombinator.com/item?id=46961760). Code Storage now sells to AI app builders such as Lovable, Bolt and Amp — [code.storage](https://code.storage/).
- **AI-era warning (Tailwind Labs, Jan 2026):** Tailwind laid off 75% of its engineers (4 down to 1). Revenue fell about 80% even though the framework gets about 75M downloads/month, because AI assistants write Tailwind code without sending users to the docs that sold the paid UI kits (docs traffic down about 40% since early 2023) — [DevClass](https://www.devclass.com/2026/01/08/tailwind-labs-lays-off-75-percent-of-its-engineers-thanks-to-brutal-impact-of-ai/); [eWeek](https://www.eweek.com/news/tailwind-labs-lays-off-engineers-due-to-ai/).

### Inferences
- **Network effects:** Google Code and Gitorious lost to the platform where developers already were. A new forge should not compete as a social network first. It should give users single-player value (reliability, speed, ownership, self-hosting) and interoperate with GitHub through mirroring, sync and federation until a network forms. Tangled, Origin and Entire all do this through mirroring or federation.
- **Monetization:** charge paying customers directly for what costs money (private repos, CI, AI) and keep free public hosting small or subsidized by them. Gitorious shows the danger of free public hosting funded by a different business. SourceForge shows that monetizing through ads or bundling destroys a code host's trust.
- **Focus:** Kiln died as a side product of a company whose attention moved elsewhere, and Phacility depended on one steward. A solo founder is exposed to both, so a copyleft or eventually-open license that lets users fork is a selling point; it reassures customers about continuity.
- **Disintermediation:** a business funded by a docs or content funnel (Tailwind) is fragile when agents write the code. Sell the running service, and the trust and uptime around it, not the knowledge.

### Gaps
- Phacility never published a reason for shutting down. Any "why" beyond the announcement is speculation.
- Kiln's own shutdown date and fate, separate from the FogBugz/Manuscript sale, were not confirmed this session.
- SourceForge traffic and revenue decline figures were not found.

## 3. Platform risk of a "layer over GitHub"

### Takeaway
The risk materialized in 2026. GitHub shipped native stacked PRs (preview April, GA Oct 6, 2026), the core of Graphite's product. Graphite had already sold to Cursor (Dec 2025), and GitButler moved its pitch beyond Git and GitHub with a16z money. A solo founder's layer over GitHub is also capped by API rate limits that grow with customer size. Assume GitHub can copy any popular workflow feature within roughly 12-24 months.

### Cited Findings
- GitHub stacked PRs went GA on Oct 6, 2026 on all plans, adding preserved approvals, signed commits through rebases, auto-retargeting and auto-merge. GitHub reports +9% merged code and +5% faster time-to-merge in top repos using stacks — [GitHub changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/).
- Timeline: Cursor acquired Graphite in Dec 2025; GitHub's native stacked PRs preview arrived in Apr 2026. Graphite's remaining edge is maturity on edge cases such as squash-merge — [dev.to comparison](https://dev.to/pyor/graphite-alternatives-in-2026-an-honest-comparison-2p52) (secondary); [learncursor.dev](https://www.learncursor.dev/compare/github-stacked-prs-vs-graphite-vs-origin) (secondary). Graphite itself now leans on AI review (unlimited on the $40 Team plan) and Cursor Cloud Agents inside PRs — [Graphite pricing](https://graphite.com/pricing).
- Graphite's exit before GitHub shipped: Dec 19, 2025, cash plus equity, after a $52M Series B in Mar 2025 — [SiliconANGLE](https://siliconangle.com/2025/12/19/cursor-acquires-ai-code-review-startup-graphite/).
- GitButler's Series A pitch: "We're not building some 'better git'. We're building the infrastructure for how software gets built next" — [GitButler blog](https://blog.gitbutler.com/series-a).
- Cursor Origin hedges both ways: native hosting, plus GitHub sync in which "GitHub stays the source of truth" for synced repos — [Cursor changelog](https://cursor.com/changelog/origin-code-hosting). Entire mirrors GitHub repos onto its own git network — [Entire news](https://entire.io/news).
- **GitHub App API limits:** an installation token gets 5,000 requests/hour. Above 20 repos it gains +50/hour per repo, and above 20 users +50/hour per user, capped at 12,500/hour. Enterprise Cloud org installations get 15,000/hour — [GitHub REST rate limits docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
- GitHub can also change pricing quickly. The self-hosted runner fee was announced and withdrawn within 48 hours in 2026 — [Platform Engineering substack](https://theplatformengineering.substack.com/p/github-actions-2026-pricing-changes).
- Copilot code review is bundled into Copilot seats ($19/user Business) and draws on included AI credits — [aicodereview.cc](https://aicodereview.cc/blog/github-copilot-pricing) (secondary).

### Inferences
- Features that GitHub can reasonably ship (stacks, AI review, merge queues) are poor foundations for a solo business. Bundled Copilot review sets a near-zero perceived price for "good enough" AI review.
- Safer layers either: (a) serve customers GitHub won't prioritize (self-hosted, regulated, EU-sovereignty, Forgejo/Gitea/GitLab users); (b) run across multiple forges, so the product isn't tied to GitHub; or (c) host natively with GitHub sync as an on-ramp, like Origin, so the product can outlive GitHub's API terms.
- Rate limits: at 5,000-12,500 requests/hour per installation, sync-heavy features such as mirroring every PR event or reindexing large monorepos need webhooks, caching and git-protocol fetches rather than REST polling. This is an engineering cost, not a blocker. The cap does not grow beyond 12,500 for non-Enterprise orgs.

### Gaps
- No public statement from Graphite or Cursor on how GitHub's native stacks affected Graphite's revenue or churn.
- GitHub Marketplace or App policy changes in 2026 that target competing review apps: none found.

## 4. Business models that suit this, and which reach profitability with small teams

### Takeaway
Hosted SaaS of an AGPL (or FSL) codebase is the model with the clearest record of small-team profitability: Plausible had about $1M ARR with 4 people in 2022 and about $3.1M ARR by late 2024, fully bootstrapped. Pure community or donation models (Codeberg, sourcehut) are sustainable but small: sourcehut made about $132K in 2022. Open core and enterprise licensing work at scale (GitLab, Gitea Enterprise) but need sales effort. Paid desktop clients (Fork, Tower, Sublime Merge) are a proven niche for one or two people. For a code host, a hybrid works best: AGPL or FSL core, a paid hosted service for private teams, metered CI/AI, and a paid self-hosted license with SSO and audit logs.

### Cited Findings
- **Hosted SaaS of OSS (Plausible):** first paid subscription May 2019; $500K ARR Oct 2021; $1M ARR (MRR $83,637) on June 2, 2022; 7,000+ paying subscribers; 4 team members by Feb 2022. Switched from MIT to AGPL in Oct 2020; "all of the code powering our SaaS" is public. Growth came from content, Hacker News, word of mouth and Indie Hackers, with no paid ads — [Plausible blog](https://plausible.io/blog/open-source-saas). About $3.1M ARR by late 2024, still bootstrapped, team of about 8-11 — [Tiny Empires](https://tinyempires.substack.com/p/inside-a-tiny-empire-plausible-analytics) (secondary, unverified); 15,000+ paying subscribers in 2026 — [5to9](https://5to9.beehiiv.com/p/1m-arr-bootstrapped-startup-competing-google) (secondary, unverified).
- **Pay-what-you-choose subscription (sourcehut):** $4/$8/$12 tiers with identical features; payment required only to host your own projects — [sourcehut pricing](https://sourcehut.org/pricing/). 2022: $132K revenue, 11% paid conversion of registered users, profitable — [sourcehut 2022 report](https://sourcehut.org/blog/2023-03-27-2022-financial-report/). Drew DeVault's description of the model: [How does our business work?](https://sourcehut.org/blog/2022-01-09-how-does-our-business-work/).
- **Nonprofit / membership (Codeberg e.V.):** 1,691 paying members (May 2026); the association spent "only about 300 €" in 2019; members vote on the budget yearly and keep reserves — [Codeberg blog](https://blog.codeberg.org/codebergs-budget-of-2026.html). Liberapay recurring donations were about €459/week at one point — [Codeberg donate docs](https://docs.codeberg.org/improving-codeberg/donate/) (figure from search snippet, date unclear).
- **Open core / per-seat enterprise (GitLab):** $29/user Premium; 84-86% gross margin; still a GAAP operating loss at about $1.1B+ annualized revenue — [GitLab Q2 FY27](https://secure.businesswire.com/news/home/20260901768402/en/GitLab-Reports-Second-Quarter-Fiscal-Year-2027-Financial-Results).
- **Paid enterprise license on an MIT core (Gitea/CommitGo):** $9.50-$19/user/month for SSO, audit logs, autoscaling runners and SLA support; managed Gitea Cloud — [Gitea pricing](https://about.gitea.com/pricing).
- **Source-available / fair source (Sentry FSL):** FSL lets users self-host but bars competing commercial offerings, and converts to Apache 2.0 or MIT after 2 years. Sentry reports 100,000+ orgs on its SaaS and $100M+ ARR — [Sentry open source page](https://open.sentry.io/licensing/); [Sentry blog](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/).
- **Usage-based hosted OSS at venture scale (Supabase):** $170M ARR in May 2026, up about 221% YoY; $500M Series F at a $10.5B valuation in June 2026. Over 60% of new databases are launched by AI tools — [Sacra](https://sacra.com/research/supabase-170m-year-growing-221-yoy/) (estimate, secondary).
- **Bootstrapped dev tools:** Fork (Git GUI by a husband-and-wife team, Dan Pristupov and Tanya Pristupova) reached about $295.5K revenue in 2021 with no outside funding — [GetLatka](https://getlatka.com/companies/fork) (unverified estimate); [fork.dev/about](https://fork.dev/about). Laravel (Forge) bootstrapped profitably for about 13 years; Forge had "thousands of paying customers" within a month of its 2013 launch. Laravel took its first VC round, $57M from Accel, in Sept 2024, and Accel described targeting "bootstrapped companies that are profitable" — [Fortune](https://www.fortune.com/2024/09/05/laravel-raises-57-million-series-a-from-accel); [WorkOS interview](https://workos.com/blog/taylor-otwell-laravel-interview-reinvent-2025); [Accel](https://accel.com/news/our-series-a-investment-in-laravel-the-future-of-shipping). Tailwind UI was a lifetime-purchase product that funded Tailwind Labs until AI cut revenue about 80% — [DevClass](https://www.devclass.com/2026/01/08/tailwind-labs-lays-off-75-percent-of-its-engineers-thanks-to-brutal-impact-of-ai/).
- **Usage-metered AI review:** Greptile moved from flat per-seat pricing to 50 included reviews per seat plus $1/review (Mar 2026) — [Costbench](https://www.costbench.com/changelog/greptile-price-decrease-2026-05/) (aggregator). GitLab sells AI as $1 credits — [GitLab pricing](https://about.gitlab.com/pricing/). GitHub moved Copilot to token-metered credits in June 2026 — [aicodereview.cc](https://aicodereview.cc/blog/github-copilot-pricing) (secondary).

### Inferences
- **Most viable solo path:** an AGPL (or FSL) forge, cloud-hosted, charging per seat for private repos, with metered or capped CI minutes and AI reviews passed through at a markup, plus a paid self-hosted license (SSO/SAML, audit log, support) for teams that can't use cloud. This combines what worked for Plausible, Gitea/CommitGo and Sentry.
- AGPL deters cloud resellers but allows self-hosting, which buys trust. FSL protects more but reads as "not really open" to the FOSS crowd that Codeberg and sourcehut serve. Pick based on the target segment (OSS community versus commercial teams).
- Donations and nonprofit status can sustain a public-good host, but not a salary at small scale. Codeberg needed about 1,700 members and years of growth.
- Paid desktop or CLI clients (Fork-style) are a low-cost on-ramp but face disintermediation as agents drive git directly. Treat them as a supplement, not the core.

### Gaps
- Tower (fournova) and Sublime Merge (Sublime HQ) revenue: no public figures found.
- Plausible 2025-2026 ARR from a primary source: the figures beyond the 2022 blog post are secondary.
- No sourcehut financial report after 2022 was found.
- Codeberg's 2026 budget figures sit in a linked PDF that was not parsed.

## 5. Unit economics: cost to serve, margins, pricing benchmarks, profitability at 10/100/1,000 teams

### Takeaway
Git storage and bandwidth cost very little per team, from cents to low single-digit dollars per month at public infrastructure prices. CI is moderate and should be passed through. AI review is the cost that can wipe out margin: measured at about $0.05-$1.34 per PR depending on the model. Mature forge margins are about 84-86% (GitLab). At an assumed $15/seat and 8 seats per team: 10 teams is side income (about $14K ARR); 100 teams supports one person (about $144K ARR, roughly sourcehut's 2022 revenue); 1,000 teams supports a Plausible-sized small company (about $1.4M ARR). This holds only if AI and CI are metered or capped.

### Cited Findings
**Infrastructure prices (public)**
- Cloudflare Artifacts: $0.50/GB-month (1 GB free) and $0.15 per 1,000 operations (10K free) — [Cloudflare Artifacts](https://www.cloudflare.com/products/artifacts/).
- Code Storage: hot $0.005/GB-hour; cold $0.0002/GB-hour after 7 days untouched; egress $0.15/GB; ingress $0.06/GB — [code.storage](https://code.storage/).
- GitHub-hosted CI: Linux 2-core $0.006/min, Windows $0.010, macOS $0.062 (2026) — [Platform Engineering substack](https://theplatformengineering.substack.com/p/github-actions-2026-pricing-changes). Bitbucket resells 1,000 build minutes for $10 — [Bitbucket pricing](https://www.atlassian.com/software/bitbucket/pricing). GitLab Premium includes 10,000 min/month per namespace at $29/user — [GitLab pricing](https://about.gitlab.com/pricing/).
- Payment processing: sourcehut's 2022 fees took $132,226.50 down to $123,677.57, about 6.5% — [sourcehut 2022 report](https://sourcehut.org/blog/2023-03-27-2022-financial-report/).

**AI review cost (measured and list prices)**
- Kilo (Mar 16, 2026), measured per PR: Claude Opus 4.6 cost $0.73 on a 338-line PR (618,853 input / 6,142 output tokens) and $1.34 on a 598-line PR (1.18M input). Kimi K2.5 cost $0.07 and $0.05 — [Kilo blog](https://blog.kilo.ai/p/we-analyzed-how-much-kilo-code-reviewer).
- Anthropic list prices (Oct 2026): Opus 5.5 is $4 input / $20 output per MTok, $0.20 on cache hits. Sonnet 5.5 is $2 / $10, $0.10 on cache hits. Haiku 5.5 is $0.10 / $0.50 for prompts up to 100K tokens and $0.50 / $2.50 above. The Batch API is 50% off — [Claude pricing docs](https://platform.claude.com/docs/en/about-claude/pricing).
- Deep, multi-agent review tiers are reported at $15-$25 per PR for Anthropic's Claude Code Review — [Codacy blog](https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026) (secondary, unverified).
- Market prices for AI review: CodeRabbit $24-$48 per PR-author per month — [Sacra](https://sacra.com/c/coderabbit/); Greptile $30/seat with 50 reviews, then $1 each — [Costbench](https://www.costbench.com/changelog/greptile-price-decrease-2026-05/); Graphite unlimited AI review at $40/user — [Graphite pricing](https://graphite.com/pricing).

**Margins and seat-price benchmarks**
- GitLab gross margin: 84% GAAP / 86% non-GAAP (Q2 FY27) — [BusinessWire](https://secure.businesswire.com/news/home/20260901768402/en/GitLab-Reports-Second-Quarter-Fiscal-Year-2027-Financial-Results).
- Seat prices: Bitbucket $3.65/$7.25; sourcehut $4-$12 per account; Gitea Enterprise $9.50-$19; Copilot Business $19; Graphite $20/$40; CodeRabbit $24/$48; GitLab Premium $29; Greptile $30; GitCafe Team $40/$80 — sources above.

### Inferences (my calculations; assumptions stated)
- **AI review cost per PR at Oct 2026 list prices**, using Kilo's measured small-PR token counts (about 620K input, 6K output):
  - Opus 5.5 without caching: about $2.60. With about 80% cache hits: about $0.72.
  - Sonnet 5.5 without caching: about $1.30. With about 80% cache hits: about $0.36.
  - Haiku 5.5 (more than 100K tokens): about $0.33.
  - Batch API: halves each figure.
  - Cache-write premiums are ignored, so real cached costs run somewhat higher.
- **Per team, AI review alone:** at 10 developers × 20 PRs/month = 200 PRs, AI costs roughly $70-$520/month. A $15/seat × 10 seats plan brings in $150/month. Unlimited frontier-model review can therefore exceed revenue. Greptile's "$1 per extra review" and GitLab's "$1 credits" suggest vendors price at or above about $1 per review to keep margin.
- **Per team, storage:** a 10-person team with 5 GB of repos costs about $2.50/month on Artifacts plus operations. On Code Storage it is about $18/month if all hot (0.005 × 720 h × 5 GB), or about $0.72 if cold. Egress of 50 GB/month adds about $7.50 on Code Storage. So storage is about 1-15% of a $150 plan. Self-hosting on a VPS or object storage could be cheaper, but this was not priced this session.
- **Per team, CI:** 3,000 Linux minutes/month is about $18 at GitHub's rate. Include a small allowance and charge overage, as Bitbucket does ($10 per 1,000).
- **Profitability bands** (assume $15/seat, 8 seats/team, so $120/team/month; about 6.5% payment fees; AI and CI metered so they are break-even or better; gross margin about 80%):
  - **10 teams:** $1,200 MRR / $14.4K ARR, about $11K gross profit. Covers infrastructure and tools, not a salary.
  - **100 teams:** $12K MRR / $144K ARR, about $115K gross profit. One founder can live on this, about sourcehut's 2022 scale.
  - **1,000 teams:** $120K MRR / $1.44M ARR, about $1.15M gross profit. Supports a 4-8 person team, about Plausible in 2022-2024.
  - At $8/seat (sourcehut/Bitbucket territory) each band needs about twice as many teams. At $29/seat (GitLab Premium), 100 teams yields about $278K ARR.
- **Segment fit:** OSS and individuals ($0-$12/month, with low willingness to pay and high trust demands) are best served as a funnel. Small private teams ($8-$20/seat) are the realistic core. Self-hosted, compliance-bound or EU-sovereignty teams ($10-$30/seat, annual license) have the highest margin per customer but need support and paperwork.

### Gaps
- Gross margins for AI review vendors (CodeRabbit, Greptile, Graphite): not public.
- Real-world average repo size and egress per team: no benchmark found; the figures above are assumptions.
- Self-hosted infrastructure (Hetzner/OVH VPS, R2/S3) cost per team was not priced this session.
- Sourcehut's and Codeberg's infrastructure cost per user: not public in the sources reviewed.

## 6. Defensibility when software is cheap to build with AI

### Takeaway
2026 essays agree that "I built it" is no longer a moat. What stays scarce is distribution (an audience, an email list, community), trust (uptime, security, a credible promise not to rug-pull), and things that don't compress with code generation (compliance, infrastructure, relationships). For a code host, the strongest moats are trust and reliability (GitHub's outages are pushing people like Ghostty to leave), data gravity (repos, issues, history), and community, plus the open-source license as a continuity guarantee. Classic social network effects favor GitHub, so a newcomer should interoperate rather than fight them.

### Cited Findings
- "The strongest competitive advantage in software for over two decades was that software is hard to build… That stopped being true about six months ago." "The new moat is everything around the product that does not compress with better code generation." Moats move toward money movement, compliance and infrastructure — Andrew Stroup, Apr 12, 2026, [stroupaloop.com](https://stroupaloop.com/blog/2026/04/12/when-code-gets-cheap-scarcity-moves/). The same essay cites the Nasdaq shedding about $300B in software and data stocks in Feb 2026 and over $2T in enterprise SaaS market cap erased by mid-March 2026.
- "When the supply of software explodes, the value of the 'built thing' naturally trends toward zero"; "Your email list is a moat. Your community is a moat. Your personal brand is a moat." — [kingy.ai](https://kingy.ai/news/your-product-isnt-the-moat-your-distribution-is/) (opinion). "Distribution is the last moat" — [nzwe.com](https://nzwe.com/journal/distribution-is-the-last-moat) (opinion).
- Network effects: NFX attributes about 70% of tech value creation over two decades to network effects and catalogs 16 types (personal, marketplace, platform, data, language, expertise, bandwagon and others) — [NFX archives](https://nfx.com/post/network-effects-archives). Matt Rickard questions how strong GitHub's social network effects really are; its one-way follow graph and activity feed are "social coding", but programming network effects are "an open question" — [mattrickard.com](https://mattrickard.com/social-coding).
- **Trust/reliability as a wedge:** Ghostty left GitHub over daily outages ("no longer a place for serious work") — [mitchellh.com](https://mitchellh.com/writing/ghostty-leaving-github). SourceForge shows how fast trust collapses for a host that abuses it — [How-To Geek](https://www.howtogeek.com/218764/warning-don%25e2%2580%2599t-download-software-from-sourceforge-if-you-can-help-it/).
- **Open license as continuity:** Phorge forked Phabricator after Phacility quit — [Wikipedia](https://en.wikipedia.org/wiki/Phabricator). Forgejo forked Gitea over governance — [Wikipedia](https://en.wikipedia.org/wiki/Forgejo).
- **Community and content distribution:** Plausible grew on content, HN and word of mouth without paid ads — [Plausible blog](https://plausible.io/blog/open-source-saas). Laravel's organic community-led growth drew Accel — [Accel podcast](https://accel.com/podcast-episodes/spotlight-on-how-laravels-taylor-otwell-builds-products-and-community-that-drive-organic-growth).
- **Distribution risk:** Tailwind lost the docs-traffic channel to AI assistants despite massive usage — [DevClass](https://www.devclass.com/2026/01/08/tailwind-labs-lays-off-75-percent-of-its-engineers-thanks-to-brutal-impact-of-ai/).
- **Capital as a moat for others:** in 2026 VCs put $60M into Entire's seed, $143M into CodeRabbit and $17M into GitButler, and Cursor sits inside SpaceX — sources in section 1.

### Inferences
- A solo founder's defensible assets, roughly in order:
  1. Trust and reliability: a public status history, transparent finances like sourcehut and Codeberg, an open license, and data export and migration in both directions.
  2. Distribution through a personal audience and community. The 2026 demand signals from Theo and Mitchell show influential developers looking for alternatives.
  3. Taste and speed in a narrow workflow the giants underserve.
  4. Data gravity once teams have issues and history in the product.
  5. Compliance packaging (EU hosting, self-hosted audit and SSO), which the essays identify as non-compressible.
- Features alone (stacks, AI review, agent APIs) are the least defensible. Both GitHub and funded entrants ship them.
- Don't depend on organic search or docs funnels for distribution, since AI agents may intercept that traffic (the Tailwind lesson). Direct channels such as newsletters, social posts, HN launches and integrations into agent tools (MCP) are more robust.

### Gaps
- No a16z or NFX essay specific to dev-tool or code-hosting network effects in 2025-2026 was retrieved. The NFX framework is general.
- No quantitative evidence on switching costs or migration rates between forges was found.

## 7. Funding as optional (short)

### Takeaway
Bootstrapping fits this segment (Plausible, sourcehut, Fork and Laravel for its first 13 years). Raise only if the plan is to race funded agent-era players on infrastructure or enterprise. YC Winter 2027 applications are due Nov 2, 2026 at 8pm PT; the 2026 bar is paid conversion and fast revenue growth, not GitHub stars.

### Cited Findings
- YC W27: on-time deadline Nov 2 (2026) at 8pm PT, decisions by Dec 11; batch runs Jan-Mar in San Francisco — [Roundfunded](https://www.roundfunded.com/en/blogs/yc-application-deadlines-2026-2027); [heysuccess](https://www.heysuccess.com/opportunity/Y-Combinator-(winter-2027-batch)-41093) (secondary; confirm on ycombinator.com/apply).
- 2026 seed benchmarks: median US seed about $2.5M at a $14.8M post-money valuation. Dev-tool investors "diligence paid-team conversion, not GitHub stars" — [Causo guide](https://hub.causo.ai/guides/raising-seed-devtools-startup-2026) (secondary, unverified). YC W26 reportedly had 14 of about 200 startups at $1M ARR by Demo Day, averaging 14% weekly revenue growth — [The VC Corner](https://thevccorner.com/p/yc-w26-batch-complete-company-database) (secondary, unverified).
- Comparable 2026 rounds: Tangled $4.5M seed with about 7K users and no stated revenue — [Tangled blog](https://blog.tangled.org/seed); Entire $60M seed — [TechCrunch](https://techcrunch.com/2026/02/10/former-github-ceo-raises-record-60m-dev-tool-seed-round-at-300m-valuation/embed/).
- Bootstrapping to an optional raise: Laravel took $57M from Accel only after years of profitability — [Fortune](https://www.fortune.com/2024/09/05/laravel-raises-57-million-series-a-from-accel).

### Inferences
- Bootstrap if the target is a $150K-$1.5M ARR business (bands above). Consider YC or angels if pursuing agent-scale infrastructure, where Code Storage, Artifacts and Entire compete on capital, or if a protocol or network play like Tangled needs years before revenue.
- A Tangled-style seed is possible without revenue when there is a protocol story and visible community traction. Most investors want paid conversion.

### Gaps
- No primary YC statement on dev-tool traction expectations for W27 was found; the benchmarks are from secondary blogs.
