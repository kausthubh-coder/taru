# Git and GitHub Fundamentals: Technical Model, Workflows, History, Moats, Business (as of 2026-10-12)

Scope note: figures are labeled with their date. Where only aggregator or secondary sources were found, that is flagged. Primary sources were preferred: git-scm.com (Pro Git), jj docs, GitHub blog/changelog/pricing, Microsoft earnings transcripts, GitLab SEC filings.

## 1. Git's technical model, why Git won, what Git does not do, and how Jujutsu differs

### Takeaway
Git is a content-addressable store of immutable snapshots (blobs, trees, commits) plus a small set of mutable pointers (refs/branches); everything else, including "distributed" collaboration, falls out of that design. Git deliberately stops at version history: review, issues, permissions, CI and discovery are what a forge adds. Jujutsu (jj) keeps Git's storage and wire compatibility but changes the user model (working copy is a commit, stable change IDs, conflicts stored in commits, operation log with undo), which matters directly for stacked review UX.

### Cited Findings
**Data model (plain terms)**
- Git is "a content-addressable filesystem": a key-value store where "you can insert any kind of content into a Git repository, for which Git will hand you back a unique key you can use later to retrieve that content." — [Pro Git, Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- Blob = file contents, keyed by a 40-char SHA-1 of a header ("blob <size>\0") plus the content; zlib-compressed and stored at `.git/objects/<first 2 hex>/<remaining 38>`. — [Pro Git, Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- Tree = a directory listing: entries of (mode, type, hash, filename) pointing to blobs or sub-trees; "trees corresponding to UNIX directory entries and blobs corresponding more or less to inodes or file contents." — [Pro Git, Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- Commit = pointer to one top-level tree (a full snapshot, not a diff) plus parent commit(s), author/committer and message. Because a commit's hash covers its tree and parents, the history is a tamper-evident hash chain (a Merkle DAG). — [Pro Git, Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- Refs: branches and tags are just small files/entries naming a commit hash (`refs/heads/main`, `refs/tags/v1.0`); HEAD is a symbolic ref to the current branch. Creating a branch is writing a 41-byte pointer, which is why Git branching is cheap. — [Pro Git, Git References](https://git-scm.com/book/en/v2/Git-Internals-Git-References)
- Packfiles: loose objects are periodically packed into a single `.pack` file with an index, storing similar objects as deltas against each other; this is also the format sent over the network. — [Pro Git, Packfiles](https://git-scm.com/book/en/v2/Git-Internals-Packfiles)
- Remotes and protocols: a remote is a named URL plus remote-tracking refs (`refs/remotes/origin/*`). The "smart" protocols (over SSH or HTTP(S)) run `upload-pack` (for fetch/clone) and `receive-pack` (for push) on the server; client and server negotiate which commits each side has and the server streams a custom packfile of only missing objects. — [Pro Git, Transfer Protocols](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols)
- Distributed design: every clone is a full copy of history, so commit, branch, log, diff and merge are local operations; "central" servers are a social convention, not a technical requirement. Git was created in 2005 by Linus Torvalds for Linux kernel development after the kernel lost free use of BitKeeper. — [Pro Git, A Short History of Git](https://git-scm.com/book/en/v2/Getting-Started-A-Short-History-of-Git)

**Why Git beat SVN and Mercurial**
- In 2005 centralized SVN dominated; contributing to open source meant generating patch files and emailing maintainers. DVCS (Git and Mercurial, both 2005) made branching, merging and forking cheap, enabling the pull-request model. — [Scott Chacon, "Why GitHub Actually Won" (GitButler blog)](https://blog.gitbutler.com/why-github-actually-won)
- Chacon (GitHub co-founder) argues Git vs Mercurial was decided largely by community and hosting: the Ruby/Rails community adopted GitHub aggressively; by December 2008 GitHub hosted ~27,000 public repos vs ~1,000 on Bitbucket (then Mercurial-only). Torvalds: "the Ruby people, strange people, started using Git and suddenly it just exploded." — [GitButler blog](https://blog.gitbutler.com/why-github-actually-won)
- Bitbucket added Git in 2011 and later removed Mercurial entirely (no new hg repos from Feb 1, 2020; hg repos read-only July 1, 2020, then removed), citing that fewer than 1% of new Bitbucket users chose Mercurial. — [Atlassian blog, Sunsetting Mercurial support](https://www.atlassian.com/blog/bitbucket/sunsetting-mercurial-support-in-bitbucket)
- Stack Overflow survey data (2018/2019 era) put Git near 90% developer usage and Mercurial around 3% (reported via secondary source; original survey page not fetched). — [Atlassian blog](https://www.atlassian.com/blog/bitbucket/sunsetting-mercurial-support-in-bitbucket) (secondary framing)

**What Git does NOT do (the forge's job)**
- Git has no concept of a user account, access control, code review/approval, issue tracking, CI, or web discovery; the smart protocol only negotiates objects and ref updates. Hosting servers decide who may push (e.g., via hooks or the forge's auth layer). — [Pro Git, Transfer Protocols](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols); [Pro Git, Git on the Server](https://git-scm.com/book/en/v2/Git-on-the-Server-The-Protocols)
- GitHub's gated features list makes the forge layer explicit: protected branches, required reviewers, CODEOWNERS enforcement, SAML SSO, audit logs, environment protection rules, Actions minutes, Packages storage are all forge features, priced by plan. — [GitHub Pricing](https://github.com/pricing)

**Jujutsu (jj)**
- "The working copy is automatically committed. That results in a simpler and more consistent CLI because the working copy is now treated like any other commit." No staging area/index; `jj split` replaces `git add -p`. — [jj docs, Git comparison](https://docs.jj-vcs.dev/latest/git-comparison/)
- "No need for branch names (but they are supported as bookmarks)"; jj tracks all visible heads so anonymous work is not lost. — [jj docs](https://docs.jj-vcs.dev/latest/git-comparison/)
- Commits can contain conflicts: a rebase or merge that conflicts succeeds and records the conflict in the commit, resolvable later; resolutions propagate on rebase (Git's `rerere` only partially covers this). — [jj docs](https://docs.jj-vcs.dev/latest/git-comparison/)
- Rewriting a commit automatically rebases all descendants ("all its descendants commits will automatically be rebased on top"), which is exactly the pain point of maintaining stacked changes in plain Git. — [jj docs](https://docs.jj-vcs.dev/latest/git-comparison/)
- An operation log records "atomic updates to all refs at once," replacing per-ref reflogs and enabling repo-wide undo. — [jj docs](https://docs.jj-vcs.dev/latest/git-comparison/)
- jj uses a virtual all-zeros root commit (like Mercurial) and stores data in a Git backend, so it interoperates with Git remotes. — [jj docs](https://docs.jj-vcs.dev/latest/git-comparison/)

### Inferences
- Because commits are immutable and hash-addressed, a forge is mostly a database of metadata keyed to commit hashes and refs (PRs, reviews, check results). This is why review data does not travel with `git clone` and why it is a switching cost.
- Git commit hashes change on every rebase/amend, which breaks "review this commit" UX; jj's stable change IDs (and Gerrit's Change-Id trailer) are the standard fix. A forge designed around change IDs could support per-change review and stacks more natively than GitHub's branch-based PRs.
- First-class conflicts and auto-rebase make stacks cheap client-side; the server/forge then needs to understand stacks (GitHub only shipped GA stacks in Oct 2026).

### Gaps
- Did not fetch current Git SHA-256 transition status or protocol v2 details; did not fetch jj adoption numbers (e.g., Google-internal use) from a primary source.
- Change ID specifics (jj change IDs as reverse-hex, separate from commit IDs) are described in jj docs but were not quoted from the fetched page.

## 2. Daily workflows on GitHub, step by step, and who uses what

### Takeaway
The core loop is branch (or fork) → push → pull request → review + automated checks → merge, governed by branch protection/rulesets, CODEOWNERS and optionally a merge queue. Around it sit issues/projects, notifications, releases, Packages, Actions (CI/CD), Codespaces and, increasingly, the Copilot coding agent, which works as a PR author. Stacked PRs went GA on Oct 6, 2026. By July 2026 Microsoft said 1 in 3 PRs on GitHub involves an agent.

### Cited Findings
**Core loop**
- PR model: contributor creates a branch (or a fork if they lack write access), pushes commits, opens a PR comparing head branch to base; reviewers comment line-by-line, approve or request changes; checks (CI statuses) report; maintainer merges (merge commit, squash, or rebase). — [GitHub Docs, About pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests)
- Team plan unlocks "multiple pull request reviewers," "draft pull requests," "code owners enforcement" and protected branches for private repos; Enterprise adds "advanced environment protection rules," SAML SSO, audit log API, Enterprise Managed Users. — [GitHub Pricing](https://github.com/pricing)
- CODEOWNERS: a file mapping paths to users/teams who are auto-requested for review and can be required approvers via branch protection. — [GitHub Docs, About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- Rulesets: named sets of rules (required reviews, required status checks, signed commits, linear history, push restrictions) applied to branches/tags across a repo or org, layered with bypass lists. — [GitHub Docs, About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- Merge queue: PRs that pass review are queued; GitHub builds temporary branches combining the base plus queued PRs and runs required checks on that combination before merging, preventing "green PR breaks main" races on busy repos. — [GitHub Docs, Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

**Stacked PRs (GA 2026-10-06)**
- GA on every github.com plan, coming to GitHub Enterprise Server. A stack splits one large change into a chain of small PRs reviewed one at a time and merged together. — [GitHub Changelog, 2026-10-06](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)
- GA behavior: approvals persist for unchanged code when a stack is rebased (even with stale-approval dismissal on); commits stay signed through rebases; a stack enters and lands through the merge queue as a single merge group; deleting a base branch retargets the stack instead of closing the bottom PR; auto-merge rolling out; Shift+J/Shift+K navigation; `gh stack` CLI extension with worktree support; webhooks gain a `stacked` action. — [GitHub Changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)
- GitHub-reported results: repos using stacks saw 9% more merged code vs peers and 5% faster time-to-merge (top 1% repos); secondary coverage says over two-thirds of the top 1% repos use stacks. — [GitHub Changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/); [daily.dev summary](https://daily.dev/posts/stacked-pull-requests-generally-available-wjmdplbcf) (two-thirds figure not confirmed on the primary page)

**Actions, Packages, Codespaces**
- Included CI minutes/month (Oct 2026 pricing page): Free 2,000; Team 3,000; Enterprise 50,000. Packages storage: 500MB / 2GB / 50GB. Codespaces on Team with usage-based fees. — [GitHub Pricing](https://github.com/pricing)
- Actions pricing changes: GitHub-hosted runner prices cut by up to 39% from Jan 1, 2026; a new $0.002/minute "cloud platform charge" on self-hosted runner usage in private repos from March 1, 2026 (public repos stay free; GHES unchanged); GitHub said 96% of customers would see a lower or unchanged bill. — [GitHub Resources, 2026 pricing changes for Actions](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/); [GitHub Changelog 2025-12-16](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)

**Copilot coding agent**
- GA for all paid Copilot subscribers on 2025-09-25. You assign an issue to Copilot (or use the agents panel / VS Code "Delegate to coding agent"); it works in an Actions-powered environment, opens a draft PR, then requests your review; you iterate by leaving PR comments. — [GitHub Changelog 2025-09-25](https://github.blog/changelog/2025-09-25-copilot-coding-agent-is-now-generally-available/)
- Third-party agents (OpenAI Codex, Anthropic Claude) are available as assignable agents via GitHub's "Agent HQ" as of early 2026 (secondary source). — [Daniel Vaughan blog, 2026-03-28](https://codex.danielvaughan.com/2026/03/28/codex-github-copilot-coding-agent-issue-assignment/)
- Nadella, 2026-07-29: "1 in 3 pull requests on GitHub now involves an agent. Every major coding agent runs on the platform." — [Microsoft FY26 Q4 call transcript (Motley Fool)](https://www.fool.com/earnings/call-transcripts/2026/08/07/microsoft-msft-q4-2026-earnings-call-transcript/)

### Inferences
- Daily-use segmentation (inferred, not sourced): individual/OSS developers live in repos, PRs, issues, notifications, stars and Actions; enterprise engineers live in PRs, review requests, required checks, merge queue and Actions, with admins in rulesets, SSO, audit logs; Releases/Packages/Codespaces are weekly-or-less features for most users; Projects is used mainly by team leads/PMs.
- The PR is now also the interface for AI agents (agent opens draft PR, human reviews). Review throughput, not authoring, becomes the bottleneck, which is a natural wedge for an alternative: better review, stacking, and check orchestration for high-volume agent PRs.
- Stacked PRs, merge queue and rulesets were long-requested features that third parties (Graphite, Mergify, Aviator) filled; GitHub absorbing them shows the platform's habit of commoditizing successful ecosystem products.

### Gaps
- No primary data found on per-feature usage frequency (e.g., % of users using Projects, Codespaces, Packages daily). GitHub does not publish this.
- Notifications/issues/projects/releases docs not fetched; descriptions are standard but not quoted.
- Merge queue and rulesets doc URLs cited from standard docs locations; pages were not fetched in this session.

## 3. History: from "social coding" to Microsoft CoreAI

### Takeaway
GitHub launched in 2008 as "social coding": user-centric Git hosting with forks and pull requests that replaced patch-by-email, at the moment DVCS was taking off. Microsoft bought it in 2018 for $7.5B in stock, then made private repos free (2019), launched Actions (2019) and Copilot (2021). In 2025 GitHub lost its CEO and independence (folded into Microsoft's CoreAI under Jay Parikh); 2026 has been defined by an Azure migration, reliability problems driven by AI-agent load, usage-based Copilot billing, and shipping stacked PRs.

### Cited Findings
- Launched 2008; founders built "for ourselves"; differentiators were user-centric namespacing (projects under usernames), pull-based contribution, and design taste ("not ugly"). Competitors SourceForge and Google Code added Git in 2009, too late; Google Code shut down in 2015 and pointed users to GitHub. GitHub bootstrapped (declined VC early) with Engine Yard hosting. — [Scott Chacon, GitButler blog](https://blog.gitbutler.com/why-github-actually-won)
- PR model vs alternatives: pre-GitHub OSS contribution meant emailing patch files and waiting for manual application (the Linux kernel still uses patch-by-email). — [GitButler blog](https://blog.gitbutler.com/why-github-actually-won). Gerrit and Phabricator instead review each commit individually (a Change-Id per commit, iterated as patch sets), which favors small, stacked changes; GitHub reviews a branch diff. (Gerrit/Phabricator description from general knowledge; no source fetched — see Gaps.)
- 2018-06-04: Microsoft agreed to acquire GitHub for $7.5B in Microsoft stock; GitHub then had "more than 28 million developers"; Nat Friedman became CEO; GitHub to operate independently. — [Microsoft 8-K exhibit 99.1](https://www.sec.gov/Archives/edgar/data/0000789019/000119312518182975/d600091dex991.htm)
- 2019-01-07: GitHub Free gained unlimited private repos (up to 3 collaborators); previously $7/month. — [TechCrunch, 2019-01-07](https://techcrunch.com/2019/01/07/github-free-users-now-get-unlimited-private-repositories)
- July 2024: Nadella said GitHub's annual revenue run rate reached $2B, Copilot drove over 40% of GitHub's revenue growth that year, and Copilot alone was "already a larger business than all of GitHub was when we acquired it"; Copilot adopted by 77,000+ organizations (+180% YoY). — [Siasat (reporting earnings call)](https://www.siasat.com/copilot-driving-githubs-growth-annual-revenue-run-rate-at-2-billion-nadella-3071173/); [Benzinga](https://drupal-cloudfront.benzinga.com/news/24/07/40061358/satya-nadella-says-microsofts-copilot-drives-40-of-githubs-revenue-growth-we-are-also-enabling-anyon)
- August 2025: CEO Thomas Dohmke announced he would leave at end of 2025 "to become a founder again"; GitHub integrated into Microsoft's CoreAI organization led by Jay Parikh; Microsoft would not name a new GitHub CEO. — [DevOps.com](https://devops.com/github-ceo-to-step-down-as-company-is-more-tightly-embraced-by-microsofts-coreai-team/); [Outlook Business](https://www.outlookbusiness.com/technology/github-ceo-thomas-dohmke-to-step-down-unit-folded-into-microsofts-coreai-team)
- 2025-09-25: Copilot coding agent GA. — [GitHub Changelog](https://github.blog/changelog/2025-09-25-copilot-coding-agent-is-now-generally-available/)
- Azure migration: started October 2025; CTO Vladimir Fedorov reportedly paused much feature development to move off GitHub's Virginia data centers; only ~12.5% of traffic served from Azure as of March 2026 (secondary analysis). — [IncidentHub](https://blog.incidenthub.cloud/github-reliability-outage-history-2025-2026)
- 2026-03-12: GitHub said it would move 50% of traffic to Azure by July 2026. Fedorov: "These incidents have occurred during a period of extremely rapid usage growth across our platform, exposing scaling limitations in parts of our current architecture." — [The Stack](https://www.thestack.technology/microsoft-owned-github-says-itll-move-50-traffic-to-azure-by-july-to-help-with-outages/); see also [GitHub blog, An update on GitHub availability](https://github.blog/news-insights/company-news/an-update-on-github-availability/)
- 2026-04-29: The Register reported GitHub apologizing as uptime slipped. — [The Register](https://www.theregister.com/2026/04/29/github_says_sorry_and_says/)
- 2026-05-22: CNBC framed it as "Microsoft's GitHub was positioned to win the AI coding race. Outages got in the way." (article returned 403; headline only). — [CNBC](https://www.cnbc.com/2026/05/22/microsoft-was-positioned-to-win-in-ai-coding-outages-got-in-the-way.html)
- 2026-06-01: all Copilot plans moved to usage-based billing (announced 2026-04-27). — [GitHub blog](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- 2026-08-17/18: ~7h47m global outage affecting GitHub.com, Actions, Copilot, Issues, PRs and auth; GitHub published a postmortem. — [IncidentHub](https://blog.incidenthub.cloud/github-reliability-outage-history-2025-2026); [GitHub blog, The August 17 outage, and the work ahead](https://github.blog/news-insights/company-news/the-august-17-outage-and-the-work-ahead/)
- 2026-10-06: stacked PRs GA. — [GitHub Changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)

### Inferences
- GitHub's arc is "community product → Microsoft developer-cloud asset → AI distribution channel." Organizational absorption into CoreAI plus a feature freeze for infrastructure migration plus repeated outages is the clearest window in a decade for an alternative, especially for teams whose pain is reliability and review throughput.
- AI agents changed the load profile (many more pushes, clones, CI runs, PRs per human). Any new forge must be architected for agent-scale traffic from day one.

### Gaps
- Exact Actions GA date (Nov 2019) and Copilot technical preview date (June 2021) not verified by a fetched source in this session; widely reported but unverified here.
- No primary source fetched on Gerrit/Phabricator review models (Phabricator itself was discontinued by Phacility in 2021; not verified here).
- CNBC article content (403) and any reporting on talent departures not verified; a "survival fight" piece exists ([bipsanfrancisco.com](https://bipsanfrancisco.com/github-faces-a-fight-for-its-survival-at-microsoft)) but is low-reliability.
- Whether the 50%-on-Azure July 2026 target was met: not found.

## 4. Why GitHub won and what keeps people there

### Takeaway
GitHub won on timing (arrived as Git adoption exploded) and taste (developer-built, user-centric, social), then compounded via network effects: the developer profile as identity/resume, forks/stars/discovery, the default home of open source, Actions/Marketplace ecosystem, and "Sign in with GitHub." Retention for paying companies comes from switching costs in metadata (issues, PR/review history), CI pipelines, integrations, and SSO/permission setups, none of which travel with `git clone`.

### Cited Findings
- Chacon: "exactly two reasons" GitHub won: timing and taste. User-centric namespacing and pull-based permissions made contributing to anyone's project trivial. — [GitButler blog](https://blog.gitbutler.com/why-github-actually-won)
- Community seeding: GitHub founders evangelized at Ruby conferences; Rails adoption was decisive; by Dec 2008 ~27,000 public repos vs ~1,000 on Bitbucket. — [GitButler blog](https://blog.gitbutler.com/why-github-actually-won)
- Scale reinforces default status: 180M+ developers, 36M+ joined in the year to Oct 2025 ("a new developer joins GitHub every second"), 630M total repos, 121M new repos in 2025. — [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- Enterprise reach: GitHub used by "over 90% of the Fortune 500" (Nadella, 2026-07-29). — [Microsoft FY26 Q4 transcript](https://www.fool.com/earnings/call-transcripts/2026/08/07/microsoft-msft-q4-2026-earnings-call-transcript/)
- Ecosystem as moat: "Every major coding agent runs on the platform" (Nadella, 2026-07-29); third-party agents are assignable inside GitHub. — [Microsoft FY26 Q4 transcript](https://www.fool.com/earnings/call-transcripts/2026/08/07/microsoft-msft-q4-2026-earnings-call-transcript/); [Vaughan blog](https://codex.danielvaughan.com/2026/03/28/codex-github-copilot-coding-agent-issue-assignment/)
- Enterprise lock-in features are the paid tier: SAML SSO, Enterprise Managed Users/SCIM, audit log API, data residency, FedRAMP, environment protection rules. — [GitHub Pricing](https://github.com/pricing)
- Platform absorbs ecosystem: stacked PRs (previously the domain of tools like Graphite) now native with merge-queue integration. — [GitHub Changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)

### Inferences
- Network-effect layers (inferred): (1) identity: profile, contribution graph and pinned repos act as a developer resume; (2) discovery: stars, trending, topics, forks; (3) OSS gravity: dependencies, issues and maintainers are on GitHub, so contributors must be too; (4) ecosystem: Actions marketplace, Apps, webhooks, and "Sign in with GitHub" used by thousands of dev tools; (5) AI: agents default to GitHub's PR/issue APIs.
- Switching costs (inferred): Git data is trivially portable; the expensive parts are issue/PR/review history and links, Actions YAML and marketplace actions, integrations, branch rules and CODEOWNERS, and SSO/permission mappings. A challenger should ship high-fidelity importers and GitHub-compatible APIs/Actions runners, or a mirror/coexistence mode, rather than requiring a hard cutover.
- OSS is the distribution channel and enterprise is the revenue; a challenger likely has to win one without the other first (e.g., private enterprise teams that do not need OSS network effects).

### Gaps
- No primary data on "Sign in with GitHub" adoption, Marketplace size, or Actions marketplace action count was fetched.
- No quantitative churn/switching studies found.

## 5. Business: scale, revenue, pricing, who pays, GitLab comparable

### Takeaway
GitHub reported 180M+ developers and 630M repos (Octoverse, Oct 2025) and 225M users (Microsoft, July 2026). The last official revenue figure is a $2B annual run rate (July 2024); Microsoft does not break out GitHub revenue since. Copilot is now the growth engine: 4.7M paid subscribers (Jan 2026), 50M total users (July 2026), revenue up 60%+ QoQ after the June 2026 switch to usage-based billing. Revenue comes overwhelmingly from organizations (Team/Enterprise seats, Copilot Business/Enterprise, Actions and Advanced Security), not individuals. GitLab, the main public comparable, did $955.2M revenue in FY2026 (ended Jan 31, 2026), up 26%.

### Cited Findings
**Scale**
- Octoverse 2025 (published 2025-10-28): 180M+ developers; 36M+ new in a year (+23% YoY); 630M total repos; 121M new repos in 2025 (230+/minute); TypeScript overtook Python and JavaScript as #1 language in Aug 2025; India overtook the US in open source contributor count. — [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- Secondary coverage of Octoverse cites contributions split 81.5% private vs 18.5% public (4.97B vs 1.12B contributions; the search snippet mislabeled these as repositories). — [It's FOSS](https://itsfoss.com/github-octoverse-2025/) (verify against primary)
- 2026-07-29: "GitHub now has 225 million users" (Nadella). Note: "users" (Microsoft) vs "developers" (Octoverse) may be measured differently. — [Microsoft FY26 Q4 transcript](https://www.fool.com/earnings/call-transcripts/2026/08/07/microsoft-msft-q4-2026-earnings-call-transcript/)

**Revenue**
- July 2024: GitHub ARR $2B; Copilot >40% of GitHub revenue growth. — [Siasat](https://www.siasat.com/copilot-driving-githubs-growth-annual-revenue-run-rate-at-2-billion-nadella-3071173/)
- Jan 2026 (FY26 Q2): GitHub Copilot 4.7M paid subscribers, +75% YoY. — [TechCrunch, 2026-01-29](https://techcrunch.com/2026/01/29/satya-nadella-insists-people-are-using-microsofts-copilot-ai-a-lot)
- July 2026 (FY26 Q4): Copilot 50M users; Copilot revenue "accelerated over 60% quarter over quarter following a business model shift to usage-based pricing in June"; Amy Hood cited "stronger-than-expected GitHub Copilot consumption"; continued Business and Enterprise seat growth. — [Microsoft FY26 Q4 transcript](https://www.fool.com/earnings/call-transcripts/2026/08/07/microsoft-msft-q4-2026-earnings-call-transcript/)
- Microsoft context FY26: revenue >$331B (+18%), Microsoft Cloud >$214B, Azure >$100B (+41%). GitHub is a small line inside Intelligent Cloud. — [Microsoft FY26 Q4 earnings event](https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4); [CNBC 2026-07-29](https://www.cnbc.com/2026/07/29/microsoft-msft-q4-earnings-report-2026.html)
- Copilot ARR estimates of $900M-$1.1B (Q2 FY26) and enterprise org counts (~140,000 orgs by April 2026) appear only on aggregator/statistics sites with unclear methodology. LOW RELIABILITY. — [Axis Intelligence via getpanto.ai summary](https://www.getpanto.ai/blog/github-copilot-statistics)

**Pricing (as of Oct 2026)**
- GitHub plans: Free $0 (unlimited public/private repos, 2,000 CI min, 500MB Packages); Team $4/user/month ("first 12 months" wording on pricing page; 3,000 min, 2GB); Enterprise $21/user/month ("first 12 months"; 50,000 min, 50GB, SAML, EMU, audit log API, data residency, FedRAMP). Advanced Security is an add-on. — [GitHub Pricing](https://github.com/pricing)
- Copilot (usage-based from 2026-06-01): Pro $10/mo ($10 of AI Credits), Pro+ $39/mo ($39), Business $19/user/mo ($19, promo $30 through August), Enterprise $39/user/mo ($39, promo $70 through August); 1 AI Credit = $0.01; credits consumed by tokens at published model API rates; completions and Next Edit suggestions free and uncapped; rationale: "a quick chat question and a multi-hour autonomous coding session can cost the user the same amount." — [GitHub blog, 2026-04-27](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/); [Community FAQ](https://github.com/orgs/community/discussions/197089)
- A $100/month "Max" individual tier is reported by secondary sources; not confirmed on the GitHub post fetched. — [Tech Insider](https://tech-insider.org/au/github-copilot-usage-based-billing-2026/)
- Developer backlash to usage-based Copilot: "You Will Get Less, but Pay the Same Price." — [Visual Studio Magazine, 2026-04-27](https://visualstudiomagazine.com/articles/2026/04/27/devs-sound-off-on-usage-based-copilot-pricing-change-you-will-get-less-but-pay-the-same-price.aspx)
- Actions: hosted runners cut up to 39% (Jan 2026); $0.002/min platform fee on self-hosted runners in private repos (Mar 2026). — [GitHub Resources](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/)

**GitLab comparable (FY2026, ended 2026-01-31)**
- Revenue $955.2M, +26% from $759.2M; subscription (self-managed + SaaS) $864.7M (+28%); license $90.5M (+8%). — [GitLab 10-K FY2026](https://www.sec.gov/Archives/edgar/data/1653482/000162828026018731/gtlb-20260131.htm)
- Customer mix: 1,456 customers >$100K ARR (vs 1,229); 155 customers >$1M ARR (+26%); 10,682 customers >$5K ARR (+8%); dollar-based net retention 118%. — [GitLab 10-K FY2026](https://www.sec.gov/Archives/edgar/data/1653482/000162828026018731/gtlb-20260131.htm); [GitLab Q4 FY26 8-K](https://www.sec.gov/Archives/edgar/data/1653482/000162828026013795/gitlab-ex99120260131fy26.htm)

### Inferences
- Who pays: free individuals and OSS are the funnel; revenue is enterprise seats plus consumption (Copilot credits, Actions minutes, Codespaces, Advanced Security). GitLab's numbers show the same shape: ~10.7K customers above $5K ARR generate most revenue, with 155 $1M+ accounts and 118% net retention driven by seat expansion and upsell.
- GitHub's revenue is now plausibly well above $2B ARR given Copilot growth, but no official figure exists after July 2024; treat any specific 2026 GitHub revenue number as an estimate.
- GitHub's pricing is moving from seats toward consumption (Copilot credits, Actions platform fee on self-hosted runners). This creates pricing-predictability pain for enterprises and self-hosters, which a challenger could target with flat or transparent pricing.
- Base forge pricing is low ($4/$21 per seat) and the free tier is generous; a challenger is unlikely to win on base price and should win on workflow (review, stacks, agent-scale throughput), reliability, or deployment model (self-hosted/regional).

### Gaps
- No official GitHub revenue or ARR after July 2024; Microsoft does not disclose it.
- No official Copilot revenue in dollars; only growth rates and subscriber counts.
- No breakdown of GitHub revenue by individual vs Team vs Enterprise vs Copilot found.
- Copilot organization count (~140,000 in April 2026) and Copilot ARR estimates come from aggregators only.
- GitLab customer count by tier (Free/Premium/Ultimate) and SaaS vs self-managed revenue split not extracted from the 10-K in this session.
