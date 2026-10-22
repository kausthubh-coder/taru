# Problems developers have with Git and GitHub (2025-2026), and who actually switches

Research date: 2026-10-12. Extends the earlier notes in `git-feedback-research/findings.html` and `alternatives.html` without repeating them. HN point and comment counts come from the HN Algolia API and are a rough measure of how much attention a topic got, not how many people are affected. Unless marked otherwise, everything below is from 2025-2026.

---

## 1. Theo (t3.gg): the May 2026 thread and videos. What does he actually want?

### Takeaway
Theo makes two separate complaints. One is that GitHub the company is unreliable and badly run (April 30 and May 6, 2026 videos). The other is that Git's data model is wrong for agent-heavy work (May 27, 2026 thread). For the second, he wants four things: partial privacy inside public repos, no forced commit or branch bookkeeping (jj-style auto-snapshots), cheap copy-on-write parallel checkouts for agents, and source access that doesn't need a full OS and filesystem. He told his audience to move to Codeberg, donated to it, and then publicly turned on it when Codeberg banned mostly-AI-written projects in July 2026.

### Cited Findings
- **Root post (May 27, 2026, 00:15 UTC):** "I'm going to use my AI psychosis to fix clouds for agents. Someone else needs to use their psychosis to fix source control... GitHub is dying and git is not the right primitive." He is openly asking someone else to build it. — [X/theo root](https://x.com/theo/status/2059428277786468407) (fetched via FxEmbed)
- **Point 1, privacy inside open source:** "'open source' should not always mean '100% of our code is public 100% of the time'". He asks how much effort goes into preventing .env leaks and re-inventing env-var sharing, "How many projects would be open source if they could hide in-flight PRs?", how many "security fixes are sitting unpublished because they will be exploited as soon as they appear in the tracker", and wants "a monorepo with some sub-packages that are 'private' without splitting into multiple repos." — [X/theo #1](https://x.com/theo/status/2059428863135174829)
- **Point 2, commits and branches:** "Commits are a bad primitive. Branches are worse. jj gets much closer to 'right' here. Work is constantly staged as it is done. Snapshots are taken when you run any command at all... We should be able to just edit the code. We can worry about how it is 'tracked' later." — [X/theo #2](https://x.com/theo/status/2059429257038987375)
- **Point 3, worktrees:** "Worktrees are an abomination... Why do we have to implement copy on write ourselves? Why can't I 'check out' the same branch in 2 places at the same time? Why do I have to put so much energy in keeping my worktrees updated to main?... Our agents deserve better." — [X/theo #3](https://x.com/theo/status/2059429524581085647)
- **Further point, per the prior notes and a secondary summary:** source control shouldn't need "a real os + file system". He wants API-level access to files. — [prior notes / findings.html]; [BigGo summary](https://finance.biggo.com/news/2c46ee62f4a34154). I couldn't fetch thread posts after #3 directly, because FxEmbed only walks backwards through replies and Thread Reader returned a login wall.
- **Video "Github is Falling Apart" (published 2026-04-30, about 100K views):** a reaction to the Ghostty departure. Sources in the description include Mitchell's post and Gergely Orosz. — [YouTube R7ex-Gt8dtw](https://www.youtube.com/watch?v=R7ex-Gt8dtw)
- **Secondary summary of that video (BigGo, April 30, 2026; treat with care):** complaints listed are diff-view regressions and slow UX, hours-long outages, "86.75% uptime" (almost certainly from the unofficial "Missing GitHub Status Page" tracker, not GitHub's own figures), the April 23 merge-queue regression, an RCE via git push headers, no CEO with product and engineering in separate reporting chains, a conflict of interest (GitHub reports to a Microsoft EVP said to sit on Atlassian's board; not verified), and ignored npm trademark reports. Quoted fix: "appoint a CEO, collapse the product-engineering divide... The only thing left is to build something new." — [BigGo](https://finance.biggo.com/news/2c46ee62f4a34154)
- **Video "Get In, We're Leaving GitHub" (published 2026-05-06, about 162K views):** "GitHub was my home for over a decade. I think it's time to explore future options. Forgejo, Gitlab, Gitea, Codeberg, Bitbucket and more. Where do we go now?" — [YouTube HuE7OvOckfE](https://www.youtube.com/watch?v=HuE7OvOckfE). I couldn't get a transcript because YouTube caption requests came back empty.
- **Video "Codeberg, are you serious?!?" (published 2026-07-28, about 94K views):** "Codeberg's members just voted 358 to 144 to amend the Terms of Use and prohibit projects that mostly consist of AI-written code just weeks after I donated thousands of dollars and told all of you to move there." — [YouTube Y8cY1DEURtE](https://www.youtube.com/watch?v=Y8cY1DEURtE)
- **Video "The Github Tax" (published 2025-12-17, about 98K views):** "Github is now charging for self hosted action runners. This is really bad..." The description includes affiliate links to Depot and Blacksmith (CI vendors). — [YouTube xTSar1SEmIU](https://www.youtube.com/watch?v=xTSar1SEmIU)
- Older Theo videos on the same theme: "Git is holding us back" (~1y ago), "Why doesn't Facebook use git?" (~2y ago, 210K views), "I Stopped Using GitHub (Kind Of)" (2023). — YouTube search results (channel @t3dotgg)

### Inferences
- Theo is the clearest public statement of the "agent-native source control" thesis, but he has said he won't build it, and he is sponsored by CI vendors. His views are a demand signal from the agent-heavy TypeScript/indie crowd, not neutral evidence.
- His Codeberg swing (moved in May, turned on it by late July) shows a real gap. The people most angry at GitHub include heavy AI users, and the main FOSS-ethics alternative (Codeberg) is now hostile to them. An "AI-friendly, reliable, non-Microsoft" host would sit in that gap.
- His four asks map to products: (1) selective privacy and embargoed security fixes inside public repos, (2) a jj-style working-copy model, (3) copy-on-write workspaces for parallel agents, (4) API-first repo access without a local clone.

### Gaps
- Thread posts after #3 weren't retrieved verbatim. Points 4+ (the OS/filesystem argument and anything about GitHub specifically) rely on the prior notes and a secondary summary.
- No transcript of the May 6 video, so I couldn't confirm which alternative he recommended beyond the Codeberg donation he mentions in the July video description.
- BigGo says Theo invested in a startup with a $60M seed. Entire (Dohmke) raised a $60M seed, but I didn't confirm that Theo invested in it.

---

## 2. Notable migrations: Ghostty, Zig, others. Where did they go, how did it go, who came back?

### Takeaway
High-profile departures are real, but most are partial, slow, or reversible. Zig fully moved to Codeberg in November 2025 and gave up a big funding channel to do it. Ghostty announced its departure on April 28, 2026, but more than five months later it is still developed day-to-day on GitHub and hasn't named a destination. Gentoo is mirroring, Gleam went to Tangled, and some smaller projects have gone back to GitHub. Codeberg's July 2026 bans on AI-generated and crypto projects triggered "regret" posts.

### Cited Findings
**Ghostty (Mitchell Hashimoto)**
- Announced 2026-04-28: "This is no longer a place for serious work if it just blocks you out for hours per day, every day." He kept a journal of outages: "Almost every day has an X." A GitHub Actions outage blocked PR review for about 2 hours on the day he wrote it. He named no destination ("still very much in discussions with multiple providers (both commercial and FOSS)") and planned a read-only GitHub mirror and an incremental move. The post doesn't mention AI, Copilot or pricing. — [mitchellh.com](https://mitchellh.com/writing/ghostty-leaving-github)
- HN: 3,521 points and 1,051 comments, the biggest story in this whole topic. Mitchell commented: "I actually cried writing this blog post... We've been discussing it off and on for months." — [HN 47939579](https://news.ycombinator.com/item?id=47939579)
- **Status as of 2026-10-12:** github.com/ghostty-org/ghostty is not archived, was last pushed 2026-10-12, and is still taking new PRs (for example #14657, opened 2026-10-12) and merging commits daily. — [GitHub API repo](https://api.github.com/repos/ghostty-org/ghostty)
- His writing index after April has no follow-up post naming a new forge. Later posts are "Pledging Another $400,000 to the Zig Software Foundation" (June 21), "Superlogical" (July 29; a new company building a terminal multiplexer on libghostty) and an OSC 7501 protocol post (Oct 6). — [mitchellh.com/writing](https://mitchellh.com/writing); [Superlogical post](https://mitchellh.com/writing/superlogical)
- In an October 2026 HN thread, Mitchell talks about Ghostty's 1.4 release schedule and says nothing about a forge move. — [HN 49996286](https://news.ycombinator.com/item?id=49996286)

**Zig (Andrew Kelley / ZSF)**
- 2025-11-26: Codeberg became canonical and the GitHub repo went read-only (the GitHub description now says "Moved to Codeberg"). Reasons given: "the engineering excellence that created GitHub's success is no longer driving it"; a "bloated, buggy JavaScript framework"; Actions has "inexcusable bugs", is "completely neglected", and schedules jobs seemingly at random; and Copilot promotion conflicts with Zig's "strict no LLM / no AI policy". Existing GitHub issues weren't migrated, and Codeberg issue numbers start at 30000. — [ziglang.org](https://ziglang.org/news/migrating-from-github-to-codeberg/); [GitHub API](https://api.github.com/repos/ziglang/zig)
- Cost: GitHub Sponsors was ZSF's largest single income source in 2024 (over $170K). ZSF called it "a liability" and asked donors to move to Every.org. — [DevClass](https://devclass.com/2025/11/27/zig-project-ditches-github-for-codeberg-but-move-could-be-costly/); [ziglang.org](https://ziglang.org/news/migrating-from-github-to-codeberg/)
- An example CI bug: a `safe_sleep.sh` script in the runner pinned the CPU at 100%. It was reported in April 2025 and not closed until December 2025. — [DevClass](https://devclass.com/2025/11/27/zig-project-ditches-github-for-codeberg-but-move-could-be-costly/)
- HN 927 points / 893 comments. The top comments criticize Kelley's tone ("losers", "monkeys") and the "biggest mall" network-effect argument ("set up your store in the biggest mall"). — [HN 46064571](https://news.ycombinator.com/item?id=46064571)
- Reported knock-on effect: over 1,200 new Codeberg members; Codeberg had 1,691 paying members in May 2026, up from 1,208 the previous November. This comes from a search-result summary and the primary source wasn't fetched. — [search summary; see Codeberg sources](https://codeberg.org/)

**Other migrations, 2025-2026**
- **Gentoo** (2026-02-16): Codeberg mirror, "part of the gradual mirror migration away from GitHub". Gentoo self-hosts its canonical repos. — [gentoo.org](https://www.gentoo.org/news/2026/02/16/codeberg.html)
- **Gleam** moved to Tangled, an ATProto-based federated forge (July 2026, HN 249 points). Tangled reportedly raised a €3.8M seed (byFounders, Bain Capital Crypto, Antler). — [tangled.org/gleam.run](https://tangled.org/gleam.run/gleam); [developersdigest](https://www.developersdigest.tech/blog/gleam-tangled-atproto-code-hosting). Tangled's founder pitches stacked PRs, Nix CI, self-hostable knots, and an open protocol "for you and your agents". — [HN 49331033](https://news.ycombinator.com/item?id=49331033)
- **FFmpeg** moved to self-hosted Forgejo at code.ffmpeg.org (2025), chosen over GitLab by vote because "every GitLab instance... had been incredibly slow". This was a move from mailing-list patches, not from GitHub. — [ffmpeg-devel](https://ffmpeg.org/pipermail/ffmpeg-devel/2025-July/346687.html); [HN 44886997](https://news.ycombinator.com/item?id=44886997)
- **Organic Maps** went to Forgejo after Microsoft blocked its GitHub account (March 2025). — [HN 43525395](https://news.ycombinator.com/item?id=43525395)
- **gallery-dl** moved to Codeberg after a DMCA notice (April 2026). — [HN 47656659](https://news.ycombinator.com/item?id=47656659)
- **Individuals:** "Leaving GitHub for Forgejo" (HN 634 points, May 2026; the post URL now redirects to a portfolio page); "Moving from GitHub to Codeberg, for lazy people" (HN 638); Jonas Hietala (April 2026) uses Codeberg for public repos and self-hosted Forgejo as his main interface. He cites the "embrace AI or get out" CEO quote and third-party uptime logs, says "there are no features I miss", and complains that Codeberg has "been under a DDOS attack for quite some time". — [HN 48121266](https://news.ycombinator.com/item?id=48121266); [HN 47530330](https://news.ycombinator.com/item?id=47530330); [jonashietala.se](https://www.jonashietala.se/blog/2026/04/28/from_github_to_codebergforgejo/)
- ISSOtm (November 2025) found moving repos easy with scripts and porting CI the hard part. Codeberg's CI docs push users to run fewer jobs for energy and cost reasons. — [eldred.fr](https://eldred.fr/blog/forge-migration/)
- **SourceHut** moved its business operations from the US to Europe (June 2025) and changed its ToS on LLMs (August 2026). — [HN 44365246](https://news.ycombinator.com/item?id=44365246); [sourcehut.org](https://sourcehut.org/blog/2026-08-27-tos-changes-and-llms/)

**Reversals and regret**
- **Codeberg policy shock:** members voted on 2026-07-22, 358 to 144 with 14 abstentions on about 50% turnout, to ban projects that "mostly consist of code written by" generative AI. They also banned crypto projects (July 2) and committed never to train AI on hosted code. Codeberg's stated reasons were SSDs going from about €700 to €3,700 each, vibe-coded projects consuming CI and storage, and AI crawlers. — [It's FOSS](https://itsfoss.com/news/codeberg-bans-ai-contributions/); [Hackaday](https://hackaday.com/2026/07/24/codeberg-bans-cryptocurrency-and-llm-generated-code-projects/)
- **"I regret migrating to Codeberg"** (Marius, July 2026; HN 565 points / 567 comments): the author left GitHub over "enshittification" and is now leaving Codeberg for self-hosting because of the policy changes, which were announced via "a dark blue banner at the top of the site on the day it was already settled." — [post](https://xn--gckvb8fzb.com/i-regret-migrating-to-codeberg/); [HN 49021856](https://news.ycombinator.com/item?id=49021856)
- **Endurain** (fitness tracker) merged "chore: migrate from Codeberg to GitHub" on 2026-10-08, moving workflows, GHCR images, Pages docs and issues back to GitHub and adding a GitLab mirror. The PR gives no reason. — [GitHub PR #800](https://github.com/endurain-project/endurain/pull/800)
- **Theo:** he publicly recommended Codeberg and donated, then denounced its AI ban (see Q1). — [YouTube Y8cY1DEURtE](https://www.youtube.com/watch?v=Y8cY1DEURtE)
- **Self-hosted GitLab experience:** "we did it for 6+ years... not always a smooth sailing". The commenter describes Docker upgrade rollbacks, a bad default `shared_buffers`, and major versions that broke pipelines across 200+ repos. — [HN 49331033](https://news.ycombinator.com/item?id=49331033)

**Funded attempts to replace GitHub (signals of investor belief)**
- **Entire** (ex-GitHub CEO Thomas Dohmke, February 2026): $60M seed led by Felicis. Its thesis: "Issues were designed for human planning... not as structured, machine-readable units of work", PRs don't scale for agent code, and agent sessions disappear. Its first product is a Checkpoints CLI that stores agent context alongside commits. — [entire.io](https://entire.io/blog/hello-entire-world/); [HN 46961345](https://news.ycombinator.com/item?id=46961345) (611 points)
- **Cursor Origin** (2026-08-17): git hosting with PRs inside Cursor, two-way GitHub sync, and CI via Depot or Buildkite. It's on paid plans and switched on by default. It launched on the same day as a multi-hour GitHub outage. — [InfoQ](https://infoq.com/news/2026/08/cursor-origin-alternative-github); [HN 49334209](https://news.ycombinator.com/item?id=49334209) (597 points)
- **ERSC (East River Source Control):** Jujutsu creator Martin von Zweigbergk joined as CTO on 2026-09-01. It is backed by Amplify and entered private beta with "ERSC Storage" in September 2026. He said: "the remote server is still Git, which has a ceiling that comes fast for products at scale." — [ersc.io](https://ersc.io/blog/martin-joins-ersc)

### Inferences
- Even the most motivated maintainer (Mitchell, user #1299, wealthy, publicly committed) hasn't left after 5.5 months. That points to high switching costs: CI, contributor accounts, issues, integrations, Dependabot and GHCR. "Announce exit" is much cheaper than "complete exit".
- The projects that actually moved are values-driven (Zig, Gentoo, Gleam, FOSS individuals) and willing to accept fewer contributors. Commercial teams aren't visible in the migration record. They complain, but they stay or add tools on top of GitHub.
- The alternatives carry their own risks: Codeberg's policy and volunteer capacity, DDoS, self-hosting overhead, and a Forgejo critical RCE (16.0.3, September 2026). That makes "reliable, neutral, professionally run" a gap that no one fills yet.

### Gaps
- No public word on Ghostty's chosen forge as of 2026-10-12. I couldn't confirm whether any part (CI, issues) has moved.
- No hard data on how contributor counts changed after Zig's move, or what share of Sponsors income moved to Every.org.
- Endurain's reason for going back isn't stated.
- I found no examples of large commercial companies publicly leaving GitHub in 2025-2026.

---

## 3. Reliability: outages in 2025-2026, the Azure migration, and GitHub's response

### Takeaway
GitHub's reliability got clearly worse in 2026, and GitHub has admitted it. Agent-driven traffic (about 14x commit growth) plus a mid-flight Azure migration produced 23-37 incidents a month on third-party trackers, an April 2026 merge-queue bug that silently reverted code, and repeated Actions outages. For teams whose release process depends on PRs and Actions, this is the most severe pain in the catalogue.

### Cited Findings
- GitHub's own post (Vlad Fedorov, 2026-04-28): "Both of those incidents are not acceptable." The 10X capacity plan started in October 2025, and "By February 2026, it was clear that we needed to design for... 30X today's scale." Driver: "Since the second half of December 2025, agentic development workflows have accelerated sharply." Priorities: "availability first, then capacity, then new features." Work in progress: moving webhooks off MySQL, migrating Ruby-monolith paths to Go, isolating git and Actions, and a "path to multi cloud". Large monorepos are called "a much harder scaling challenge". — [GitHub Blog](https://github.blog/news-insights/company-news/an-update-on-github-availability/)
- **April 23, 2026 merge-queue bug:** squash merges in multi-PR merge groups produced commits that reverted earlier merges. GitHub's final count was 658 repos and 2,092 PRs (the first estimate was about 2,804 PRs, roughly 0.07% of 4M+ merges that day). "No data loss... However, the state of affected default branches was incorrect, and we could not safely repair every repository automatically." The cause was an unreleased feature leaking past a feature flag. — [GitHub Blog](https://github.blog/news-insights/company-news/an-update-on-github-availability/); [githubstatus](https://www.githubstatus.com/incidents/zsg1lk7w13cf); [The Stack](https://www.thestack.technology/github-bug-messed-up-customer-code-coo-plays-down-incident/)
- **Incident counts:** April 2026 had 10 official incidents (26 on the incident history page), May had 9 (23), and June had 12 by mid-month. Commits went from 1B for all of 2025 to 1.4B a month in 2026. Azure: 40% of monolith traffic (up from 8% in February), 30% of git traffic. The official status page shows about 99.9%, while the unofficial tracker shows 78-94% depending on the month (90-day 87.26%). GitHub briefly paused new Copilot subscriptions in April 2026. — [The Register, June 2026](https://www.theregister.com/software/2026/06/12/github-outages-persist-as-ai-coding-drives-traffic-surge/5255125)
- **isgithubcooked.com (third-party, filterable):** 1,151 incidents since March 2016; about 23 a month over the last 3 months (up 10%); worst month February 2026 with 37. Trailing 3-month uptime: Actions 98.21% (6d 12h down), Copilot 98.33%, Pull Requests 98.49%, Git operations 99.51%. Worst days include 2026-02-09 (7 incidents), 2026-04-29 and 2026-04-30 (about a day of downtime each). — [isgithubcooked.com](https://isgithubcooked.com/) (HN 276 points, August 2026)
- More outage stories on HN: "Another GitHub outage in the same day" (Feb 2026, 375 points); "GitHub Actions was down" (May 26, 2026, 655 points); Actions and Pages degraded (Aug 6, 2026, 509 points); an Actions outage that told devs "your account is suspended" (May 27, 2026); EU CI 401s on public repos (Sep 2026); a git ops/PR/Actions incident (Oct 7, 2026). — [HN 46949452](https://news.ycombinator.com/item?id=46949452); [HN 48278374](https://news.ycombinator.com/item?id=48278374); [HN 49198302](https://news.ycombinator.com/item?id=49198302); [The Register](https://www.theregister.com/devops/2026/05/27/github-actions-outage-told-devs-your-account-is-suspended/5246867); [githubstatus](https://www.githubstatus.com/incidents/djlmxz2zd0j7)
- "Red Squares — GitHub outages as contributions" got 767 HN points (May 2026), a sign of how widely the frustration is felt. — [HN 48034587](https://news.ycombinator.com/item?id=48034587)
- Reports (via Business Insider, second-hand) say Microsoft used AWS for emergency GitHub capacity. Microsoft says it is accelerating the Azure migration, not abandoning it. — [tech-insider](https://tech-insider.org/microsoft-aws-github-outages-2026/) (not verified with BI directly)
- Security incidents that add to the trust problem: CVE-2026-3854 (RCE via git push), and a May 2026 breach of about 3,800 internal GitHub repos via a malicious VS Code extension installed by an employee (GitHub says customer data wasn't affected; TeamPCP claimed it). — [DEV](https://dev.to/monkfromearth/github-let-a-git-push-hijack-its-servers-rce-cve-2026-3854-bl8); [BleepingComputer](https://www.bleepingcomputer.com/news/security/github-confirms-breach-of-3-800-repos-via-malicious-vscode-extension/) (HN 1,054 points)
- One commenter says the outages mostly hit Americans: "if you're in a EU timezone... Github is normally pretty good." — [HN 47959108](https://news.ycombinator.com/item?id=47959108) (anecdotal)

### Inferences
- Reliability is the pain most likely to make people act, because it blocks shipping. Mitchell's post, "Ask HN: Alternatives to GitHub" (649 points), and Cursor timing Origin's launch to an outage all point to it.
- GitHub's explanation (agent traffic, 30x scale) suggests the problem lasts as long as agent adoption keeps climbing. Its commitment to publish availability numbers on its status page is a partial fix.
- The merge-queue bug is a different kind of failure: correctness, not availability. Code being silently reverted on main is the scenario enterprises fear most.

### Gaps
- No independent, methodologically sound uptime measurement. Third-party trackers count incidents of every severity across all services, and GitHub's numbers are self-reported.
- No data on how many paying customers churned or downgraded because of outages.

---

## 4. AI push: Copilot everywhere, slop PRs, training opt-out, the CoreAI reorg

### Takeaway
Two opposite AI complaints exist side by side. Anti-AI maintainers (Zig, Codeberg members, Gentoo, curl) object to Copilot being pushed at them, data training, and the flood of slop PRs. AI-heavy users object to platform instability and to restrictions like Codeberg's ban. GitHub's March 2026 PR-ads incident and its default-on training of Copilot data hurt trust, and GitHub's absorption into Microsoft CoreAI with no CEO is often cited as the root cause.

### Cited Findings
- **CoreAI reorg (August 11, 2025):** CEO Thomas Dohmke resigned, GitHub was folded into Microsoft's CoreAI organization, and no replacement CEO was named. HN 1,468 points / 1,121 comments. — [The Verge via HN 44865560](https://news.ycombinator.com/item?id=44865560); [TechCrunch](https://techcrunch.com/2025/08/11/github-ceo-to-step-down/)
- **Copilot "tips" injected into PRs (March 30, 2026):** Copilot inserted promo text, for example a Raycast plug, into PRs, including ones written by humans. The Raycast tip alone appeared in over 11,400 PRs, and a Neowin headline claimed 1.5M PRs (that figure's method is unverified). GitHub turned it off the same day. Copilot PM Tim Rogers: "letting Copilot make changes to PRs written by a human without their knowledge was the wrong judgement call." — [The Register](https://www.theregister.com/2026/03/30/github_copilot_ads_pull_requests/) (HN 614 points); [Neowin via HN 47575212](https://news.ycombinator.com/item?id=47575212)
- **Training on user data by default:** announced March 25, 2026, effective April 24, 2026, for Copilot Free/Pro/Pro+. It covers interaction data, including private-repo code snippets while Copilot is in use (not repos at rest). Business and Enterprise are excluded. "Opt out is not consent" (Brad Feld). — [heise](https://heise.de/-11226787); [implicator](https://www.implicator.ai/github-reverses-policy-will-train-ai-on-copilot-user-data-starting-april-24/); [feld.com](https://feld.com/archives/2026/03/opt-out-is-not-consent/). The HN post "If you don't opt out by Apr 24 GitHub will train on your private repos" got 745 points ([HN 47548243](https://news.ycombinator.com/item?id=47548243)). That headline overstates it, since repos at rest are excluded.
- VS Code 1.117 automatically added Copilot as a commit co-author (April 2026, HN 111 points). — [HN 47958353](https://news.ycombinator.com/item?id=47958353)
- Copilot code review started consuming Actions minutes on 2026-06-01, and Copilot moved to usage-based billing (April 2026, HN 767 points). — [GitHub changelog](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/); [GitHub blog](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- **AI slop burden on maintainers:**
  - curl ended its bug bounty at the end of January 2026. It got 20 submissions in the first 21 days of 2026, seven of them in one 16-hour window. — [The Register](https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/); [BleepingComputer](https://bleepingcomputer.com/news/security/curl-ending-bug-bounty-program-after-flood-of-ai-slop-reports/)
  - Godot's co-founder says AI-slop PRs have become overwhelming (February 2026). — [Game Developer](https://www.gamedeveloper.com/programming/godot-co-founder-says-ai-slop-pull-requests-have-become-overwhelming)
  - The RPCS3 (PS3 emulator) devs asked people to stop flooding them with AI PRs (May 2026, HN 189 points). — [Kotaku](https://kotaku.com/playstation-3-emulator-devs-politely-ask-that-people-stop-flooding-it-with-ai-code-pull-requests-2000694656)
  - GitHub opened a discussion about a PR "kill switch" (February 2026): disabling PRs or limiting them to collaborators, deleting PRs, finer permissions, AI triage, and AI-disclosure attribution. Maintainer quotes: only "1 out of 10 PRs created with AI is legitimate" (Voiceflow); "plausible nonsense"... undisclosed AI "turns people like myself into unknowing AI prompters" (GoCD's Chad Wilson); "reviewers can no longer assume authors understand or wrote the code they submit" (Microsoft Azure). — [The Register](https://www.theregister.com/2026/02/03/github_kill_switch_pull_requests_ai/)
  - Zig said it expects "fewer violations" of its no-LLM policy on Codeberg. — [ziglang.org](https://ziglang.org/news/migrating-from-github-to-codeberg/)
  - Mitchell Hashimoto now builds "Vouch", which the interview describes alongside Ghostty. Its connection to contributor trust is my inference, not stated in the source. — [interview](https://alexalejandre.com/interviews/interview-with-mitchell-hashimoto/)
- An individual who moved to Codeberg: "what ultimately pushed me to ditch it was the way github was shoving copilot/chatgpt in my face without me ever asking." — [HN 49331033](https://news.ycombinator.com/item?id=49331033)
- Speculation about root causes (opinion): Copilot getting the resources instead of core reliability, the Microsoft culture, or "a reliance on vibe coding". — [HN 47939579](https://news.ycombinator.com/item?id=47939579)

### Inferences
- The AI complaints split the market. Anti-AI FOSS projects will pay with effort (migration) but not money, since Codeberg is donation-funded. AI-heavy teams are the ones with budgets, and they want hosting that takes agent volume, not hosting that bans it.
- Slop triage is a real time cost for popular OSS maintainers, but they rarely have budget. Platforms or foundations may pay for it, or it becomes a feature (contributor trust, disclosure, rate limits).
- No CEO plus CoreAI ownership is the main reason people don't trust GitHub, and each AI misstep (ads, opt-out training, auto co-author) reinforces it.

### Gaps
- No quantitative data on the platform-wide share of AI-generated PRs or on maintainer review hours.
- I couldn't verify the Neowin 1.5M PRs figure.

---

## 5. GitHub Actions: YAML, the debug loop, the pricing change, supply chain

### Takeaway
Actions is the most-complained-about part of GitHub by HN attention (several 400-800 point posts). The complaints are a slow push-and-wait debug loop, YAML plus a custom expression language, a log viewer that crashes browsers, opaque caching, an insecure marketplace, and slow runners. The December 2025 attempt to charge $0.002/min for self-hosted runners was pulled back within about 48 hours but still damaged trust. Third-party runner vendors (Blacksmith, Depot, Buildkite, Namespace) already make money from this pain.

### Cited Findings
- **Pricing (December 16, 2025):** GitHub announced a $0.002/min "cloud platform charge" for all Actions, including self-hosted runners. One HN calculation: a 24/7 runner works out to "$2.88/day, $86.4/month, $1051.2/year", the "same price as their hosted 'Linux 1-core'". GitHub postponed it within about 48 hours. As of mid-2026 it hadn't taken effect, though it isn't ruled out. Hosted runner prices were cut by up to 39% on January 1, 2026. — [GitHub resources](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/); [The Register](https://www.theregister.com/2025/12/17/github_charge_dev_own_hardware/); [HN 46291156](https://news.ycombinator.com/item?id=46291156) (802 points / 819 comments); [tenki](https://www.tenki.cloud/blog/github-actions-runner-pricing-2026)
- Reaction from someone who runs self-hosted runners: "one of the most outrageous pricing changes I've encountered... I'm absolutely done with Github." — [HN 46291156](https://news.ycombinator.com/item?id=46291156)
- **"GitHub Actions is slowly killing engineering teams"** (Ian Duncan, February 2026, HN 404 points): the log viewer "has crashed my browser. Not once. Repeatedly."; "YAML with its own expression language bolted on..."; marketplace actions mean "handing a stranger access to your repo, your secrets"; runners are "slow... resource-constrained"; "Cache keys are confusing, cache misses are silent"; "The GITHUB_TOKEN permissions model is a maze." He recommends Buildkite. — [iankduncan.com](https://www.iankduncan.com/engineering/2026-02-05-github-actions-killing-your-team/)
- Other high-scoring Actions complaint posts: "The Pain That Is GitHub Actions" (Feldera, March 2025, 704 points); "I hate GitHub Actions with passion" (January 2026, 490 points); "GitHub Actions has a package manager, and it might be the worst" (December 2025, 444 points); "I'll think twice before using GitHub Actions again" (January 2025, 336 points). — [HN 43419701](https://news.ycombinator.com/item?id=43419701); [HN 46614558](https://news.ycombinator.com/item?id=46614558); [HN 46189692](https://news.ycombinator.com/item?id=46189692); [HN 42764762](https://news.ycombinator.com/item?id=42764762)
- **Supply chain, tj-actions/changed-files (March 14, 2025, CVE-2025-30066, CVSS 8.6):** the attacker rewrote version tags up to v45.0.7 to point at a malicious commit that dumped secrets into logs. It was used by about 23K repos, and 218 repos actually had secrets exposed. It started as a targeted attack on Coinbase's agentkit and chained through reviewdog/action-setup. — [The Hacker News](https://thehackernews.com/2025/03/github-supply-chain-breach-coinbase.html); [StepSecurity via HN 43367987](https://news.ycombinator.com/item?id=43367987)
- Zig: Actions "completely neglected", with jobs scheduled "seemingly at random". — [ziglang.org](https://ziglang.org/news/migrating-from-github-to-codeberg/)
- Actions has the worst uptime of any GitHub service on the third-party tracker (98.21% over the trailing 3 months). — [isgithubcooked.com](https://isgithubcooked.com/)
- Counterpoint: "That CI system created by so called monkeys is the one of the best free CI service in the world. Not everyone has the millions of dollars like Zig Foundation to create their own CI servers." — [HN 46064571](https://news.ycombinator.com/item?id=46064571)

### Inferences
- Actions pain is "hair on fire" for teams with heavy CI (monorepos, many PRs a day, agent-generated PRs), and they already pay: third-party runners are an established category. A new forge doesn't fix CI on its own. Cursor Origin and GitCafe both hand CI to Buildkite or Depot.
- The self-hosted pricing scare showed that customers who self-host to control cost are very sensitive to GitHub taxing their own hardware. That is a wedge for vendor-neutral CI.

### Gaps
- No survey data on how long a typical CI debug loop takes.
- No data on how many orgs moved CI off Actions after December 2025.

---

## 6. Review UX: slow PR pages, notifications, stacked diffs, agents out-producing reviewers

### Takeaway
The PR review page has been slow on large diffs, and GitHub has spent 2026 patching it. Stacked PRs reached GA on 2026-10-06, which takes away a long-standing reason to use other tools. The more structural complaint is that agents now produce more PRs than humans can review, and GitHub's PR model (built for human authors) doesn't triage, summarize or attribute well. This is where the startups (Entire, Graphite, Stage, Haystack) are.

### Cited Findings
- GitHub's February 2026 "Files changed" update: up to 67% faster interactions on large PRs, virtualization for the largest PRs, and tab switching cut "from 10+ seconds to a few seconds". That confirms the earlier baseline was very slow. — [GitHub changelog](https://github.blog/changelog/2026-02-05-improved-pull-request-files-changed-february-5-updates/)
- User complaints about large diffs: "diff too large to display", trouble with 300+ files, manual "Load diff" on every file, lag and high memory use, and comments split across tabs. Third-party extensions like diffy-pr exist because of this. — [search summary of user reports](https://addons.mozilla.org/en-US/firefox/addon/diffy-pr/)
- Earlier notes: October 2026 r/github reports of laggy comment typing even in small repos. — [prior notes / findings.html]
- **Stacked PRs:** gh-stack was announced in April 2026 (HN 900 points), public preview on 2026-07-30 (HN 783 points), and GA on 2026-10-06. GitHub claims stacked repos see 9% more merged code and that "over two-thirds of the top 1% of repos" use stacks, with 5% faster time-to-merge. GA keeps approvals across rebases. These are GitHub's own figures. — [GitHub changelog GA](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available); [HN 47757495](https://news.ycombinator.com/item?id=47757495); [HN 49112232](https://news.ycombinator.com/item?id=49112232)
- Mitchell Hashimoto argued as far back as 2023 for orienting PRs around changesets (older item). — [mitchellh.com](https://mitchellh.com/writing) ("Reorient GitHub Pull Requests Around Changesets", 2023-09-30)
- **Volume:** Octoverse 2025 reports 518.7M PRs merged (+29% YoY, about 43.2M a month) and 180M+ developers. GitHub says agent workflows have "accelerated sharply" since December 2025 and that one PR touches about a dozen subsystems. — [Octoverse](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/); [GitHub Blog](https://github.blog/news-insights/company-news/an-update-on-github-availability/)
- Entire's thesis: "pull requests don't scale for large codebases with agent-generated code". — [entire.io](https://entire.io/blog/hello-entire-world/)
- Review tools for the agent era on HN: "Stage — Putting humans back in control of code review" (April 2026, 130 points), Haystack (September 2025), "Revdiff" TUI reviewer for AI agents, and adamsreview multi-agent review. — [HN 47796818](https://news.ycombinator.com/item?id=47796818); [HN 45201703](https://news.ycombinator.com/item?id=45201703)
- Theo's earlier video "Why doesn't Facebook use git?" (210K views) is the populist version of the Phabricator/Sapling comparison (older item). — YouTube search (@t3dotgg)

### Inferences
- With stacked PRs now GA, a GitHub competitor can't win on stacks alone, as the prior notes already said. The opening is review throughput for agent-generated PRs: triage, risk ranking, provenance, and verified evidence.
- Notification overload came up only as a background complaint. I found no 2025-2026 high-signal post specifically about notifications.

### Gaps
- No direct 2025-2026 primary source comparing GitHub with Google Critique or Meta Phabricator/Sapling. Those comparisons mostly predate 2025.
- No hard numbers on reviewer backlog or time-to-first-review trends.
- No good source on notification overload.

---

## 7. Git UX: commands, conflicts, LFS, submodules, monorepos, Jujutsu adoption

### Takeaway
Complaints about Git itself are chronic, not acute. Jujutsu (jj) is the clearest sign of change: about 32K GitHub stars, regular front-page HN tutorials, Google investment, and now its creator as CTO of a funded startup (ERSC). Agents have made worktrees and parallel checkouts a new pain point. Large files and monorepos are being fixed inside Git (partial clone, large-object promisors) and by GitHub's own scaling work.

### Cited Findings
- **jj adoption signals:** jj-vcs/jj has 31,988 stars (2026-10-12). HN front-page posts: "jj — the CLI for Jujutsu" (April 2026, 549 points / 498 comments), "Jujutsu for everyone" (August 2025, 442), "Jujutsu for busy devs" (July 2025, 383 / 545), "Jujutsu at Google" talk (October 2025, 159), "Defeating Git Rigour Fatigue with Jujutsu" (May 2026, 178), "Jujutsu megamerges" (April 2026, 265), VisualJJ for VS Code (January 2026), the jjui TUI, and "Jujutsu worktrees are convenient". — [GitHub API](https://api.github.com/repos/jj-vcs/jj); [HN 47763759](https://news.ycombinator.com/item?id=47763759); [HN 45083952](https://news.ycombinator.com/item?id=45083952); [HN 44641961](https://news.ycombinator.com/item?id=44641961); [HN 45759572](https://news.ycombinator.com/item?id=45759572); [HN 48259861](https://news.ycombinator.com/item?id=48259861)
- Martin von Zweigbergk (jj creator, previously at Google) joined ERSC as CTO on 2026-09-01 (HN 265 points): "the remote server is still Git, which has a ceiling". — [ersc.io](https://ersc.io/blog/martin-joins-ersc); [HN 49525297](https://news.ycombinator.com/item?id=49525297)
- Mitchell calls Jujutsu a rare bright spot in big-tech open source. — [interview](https://alexalejandre.com/interviews/interview-with-mitchell-hashimoto/)
- **Worktrees for agents:** Theo's "Worktrees are an abomination" (above). Many agent workspace tools (Superset "run 10 parallel coding agents", HN 108 points; Paseo; cmux) work around worktree management. — [X/theo](https://x.com/theo/status/2059429524581085647); [HN 48236770](https://news.ycombinator.com/item?id=48236770)
- **LFS:** problems include GitHub lock-in, cost ($40/yr for 50GB vs about $13 on S3), needing history rewrites to leave, and every contributor needing it installed. Fixes: partial clone (`--filter=blobs:size=100k`, a 97% faster clone in the author's demo) and large-object promisors, merged in March 2025 and meant as "an alternative to Git LFS". — [tylercipriani.com](https://tylercipriani.com/blog/2025/08/15/git-lfs/) (HN 557 points)
- **Monorepos:** GitHub says "the rise of large monorepos" is its hardest scaling challenge and that it is investing in git and PR experience changes plus a new API design. — [GitHub Blog](https://github.blog/news-insights/company-news/an-update-on-github-availability/)
- Everyday branch-switching and stash friction (r/git, July 2025). — [prior notes / findings.html]
- Git is still near-universal: 93.87% use it, and GitHub is used by 81.1% of developers (GitLab 35.6%), per the Stack Overflow 2025 survey. — [Stack Overflow survey 2025](https://survey.stackoverflow.co/2025/technology/) (via search summary)

### Inferences
- jj is the "Git UX" fix that doesn't require leaving GitHub, because its Git backend works with existing remotes. That limits how much Git UX pain alone can push people to switch hosts. ERSC's bet is that the server side has to change too.
- Agent parallelism (many working copies, constant snapshots, cheap branching) is the new reason Git's UX matters to businesses. It falls on teams running many agents at once.

### Gaps
- No good data on jj's actual user count (stars aren't users). No 2025-2026 primary sources on submodule pain specifically.

---

## 8. Counter-evidence: who says GitHub is fine, and why they stay

### Takeaway
Most developers stay, and the reasons are structural. The community lives there (identity, discovery, conventions). Actions is free and integrated. Sponsors funds projects. Alternatives have their own reliability, policy and operating risks. Many critics frame their posts as heartbreak, not as having found something better.

### Cited Findings
- "There are plenty of places to host a Git repository, but remarkably few places to host an open-source community." Alternatives lack shared identity, discovery and conventions. GitLab feels "incredibly corporate", SourceHut's email workflow is unfamiliar, Radicle needs a CLI just to file bugs, and Forgejo federation is experimental. A real replacement must treat "the social layer as the product". — [lalitm.com](https://lalitm.com/post/github-alternatives/) (HN 87 points, 134 comments)
- On Zig, HN's "biggest mall" argument: "have it where people expect and live with your gripes about the platform." — [HN 46064571](https://news.ycombinator.com/item?id=46064571)
- "Actions is one of the best free CI services in the world" (HN commenter); Sponsors gave ZSF $170K+ in 2024. — [HN 46064571](https://news.ycombinator.com/item?id=46064571); [DevClass](https://devclass.com/2025/11/27/zig-project-ditches-github-for-codeberg-but-move-could-be-costly/)
- Scale and momentum: 180M+ developers, 36M new in 2025, 518.7M PRs merged. — [Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- Commenters expect GitHub's cultural embeddedness to win in the short-to-medium term: "I expect this not to gain a huge amount of traction because of the sheer cultural embeddedness of git + GitHub". — [HN 47939579](https://news.ycombinator.com/item?id=47939579)
- Orgs that rely heavily on Actions and GitHub Apps see GitHub Enterprise Server as the only realistic "self-host" option. — [HN 49331033](https://news.ycombinator.com/item?id=49331033)
- Alternatives have their own problems: Codeberg DDoS and July 2026 traffic spikes, plus its AI and crypto bans; a Forgejo critical RCE (≤16.0.3, September 2026, HN 207 points); a SourceHut account takeover via build-log XSS (September 2026); self-hosted GitLab upgrade pain. — [jonashietala.se](https://www.jonashietala.se/blog/2026/04/28/from_github_to_codebergforgejo/); [HN 49645907](https://news.ycombinator.com/item?id=49645907); [HN 49835996](https://news.ycombinator.com/item?id=49835996); [HN 49331033](https://news.ycombinator.com/item?id=49331033)
- GitHub is responding: stacked PRs GA, a faster Files-changed view, availability-first priorities, availability numbers on the status page, and walking back self-hosted runner pricing and PR ads. — sources in sections 3, 5 and 6
- Ghostty is still on GitHub 5.5 months after announcing it would leave. — [GitHub API](https://api.github.com/repos/ghostty-org/ghostty)

### Inferences
- The barrier to switching is the social graph plus free CI plus Sponsors, not Git hosting itself. A challenger has to bring contributors and CI with it (GitHub sync, federation, or both), or win segments that don't need GitHub's public community: private commercial teams and agent-heavy teams.

### Gaps
- No survey showing what share of developers are actively considering leaving. The evidence is HN- and X-weighted, which over-represents OSS maintainers and opinionated devtool users.

---

## 9. Severity: which pains are "hair on fire" (would pay or switch) and which are annoyances?

### Takeaway
Severity depends on who you are. The pains most likely to change behavior or open wallets are reliability for teams whose release depends on PRs and Actions, CI cost and speed for heavy-CI teams, and review capacity for agent-heavy teams. Values-driven FOSS projects do switch, but rarely pay. Git UX complaints are chronic and mostly met by jj without leaving.

### Cited Findings (summary of evidence above)
| Pain | Who raises it | Evidence of behavior change / payment | Rating |
|---|---|---|---|
| Outages / reliability (PRs, Actions, merge queue correctness) | OSS maintainers (Hashimoto), agent-heavy teams, any team blocked on deploys | Ghostty exit announcement; "Ask HN: Alternatives" 649 pts; Cursor Origin launched on outage day; merge-queue reverted code on main — [mitchellh.com](https://mitchellh.com/writing/ghostty-leaving-github); [HN 49331033](https://news.ycombinator.com/item?id=49331033); [GitHub Blog](https://github.blog/news-insights/company-news/an-update-on-github-availability/) | **Hair on fire** for teams that ship many times a day; annoyance for hobbyists |
| Actions CI (debug loop, YAML, speed, cost, pricing shock) | Platform/DevOps engineers, monorepo teams | Paid third-party runner category (Blacksmith, Depot, Buildkite); pricing walked back in 48h — [The Register](https://www.theregister.com/2025/12/17/github_charge_dev_own_hardware/); [iankduncan](https://www.iankduncan.com/engineering/2026-02-05-github-actions-killing-your-team/) | **Hair on fire, already monetized** by vendors |
| Agent-scale review overload / slop PRs | Popular OSS maintainers (curl, Godot, RPCS3, GoCD); teams running many agents | curl killed bug bounty; GitHub considered PR kill switch; Entire raised $60M on this thesis — [The Register](https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/); [The Register](https://www.theregister.com/2026/02/03/github_kill_switch_pull_requests_ai/); [entire.io](https://entire.io/blog/hello-entire-world/) | **Hair on fire** for big OSS (who have no budget) and agent-heavy companies (who do) |
| Copilot push / training opt-out / PR ads / Microsoft trust | Anti-AI FOSS (Zig, Codeberg members, Gentoo), privacy-minded individuals | Zig left; individuals moved to Codeberg; ads killed in a day — [ziglang.org](https://ziglang.org/news/migrating-from-github-to-codeberg/); [The Register](https://www.theregister.com/2026/03/30/github_copilot_ads_pull_requests/) | Switch-worthy for a values segment; **they rarely pay** |
| Partial privacy in public repos, embargoed fixes, secrets | Theo; OSS companies with mixed open/closed code | Only Theo's thread; partial GitHub features exist (private vulnerability forks) — [X/theo](https://x.com/theo/status/2059428863135174829) | Unclear; plausible for open-core companies, not validated |
| Parallel agent workspaces / worktrees / commit bookkeeping | Agent-heavy devs (Theo), jj adopters | jj growth; many agent workspace tools; ERSC funded — [HN 47763759](https://news.ycombinator.com/item?id=47763759); [ersc.io](https://ersc.io/blog/martin-joins-ersc) | Growing; currently solved locally (jj/tools) more than by switching hosts |
| Slow PR pages on large diffs | Reviewers on big repos | GitHub shipped 67% speedups; third-party extensions — [GitHub changelog](https://github.blog/changelog/2026-02-05-improved-pull-request-files-changed-february-5-updates/) | Annoyance to moderate; being fixed |
| Stacked diffs | Ex-Meta/Google engineers, Graphite users | GitHub GA 2026-10-06 — [GitHub changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available) | Largely neutralized as a switching reason |
| LFS / large files / monorepos | Game dev, ML, big monorepos | Native Git fixes in progress; GitHub calls monorepos its hardest problem — [tylercipriani.com](https://tylercipriani.com/blog/2025/08/15/git-lfs/) | Serious for specific verticals; niche |
| Moderation/takedowns (DMCA, account blocks) | Scraper/media tools, sanctioned regions | gallery-dl, Organic Maps moved — [HN 47656659](https://news.ycombinator.com/item?id=47656659); [HN 43525395](https://news.ycombinator.com/item?id=43525395) | Hair on fire for the few affected; niche |

### Inferences
- The best-funded buyer pain is "my agents generate more code than my platform (CI, review, hosting) can absorb reliably". GitHub's own blog confirms this is what is breaking the platform. The FOSS exodus is louder but has less money behind it.
- The reversals (Codeberg's AI ban leading to Theo's turn, the "I regret migrating" post, Endurain going back) show that any alternative which is reliable, neutral on AI, and professionally run still has the field to itself. Cursor Origin is the closest entrant but is tied to Cursor's editor.

### Gaps
- No willingness-to-pay data (pricing surveys or interviews) for any of these pains.
- No enterprise-side evidence (procurement, churn) beyond HN anecdotes. Enterprise sentiment may differ a lot from OSS and X sentiment.
