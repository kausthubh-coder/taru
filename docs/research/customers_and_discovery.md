# Customers and Customer Discovery for an AI-native GitHub Layer / Forge (as of 2026-10-12)

Scope: who buys a GitHub layer (review inbox, stacked PRs, AI-PR triage, agent CLI/MCP) and later a self-hostable forge; evidence of demand; how a solo, low-budget founder should run customer discovery.

Labels used below: **[Evidence]** = sourced fact; **[Inference]** = my reasoning; **[Unverified]** = from a secondary/aggregator source or from background knowledge not re-fetched in this session. Research was capped at ~16 tool calls, so several pricing and segment details are background knowledge flagged as such.

---

## 1. Has the bottleneck moved from writing code to reviewing and merging it?

### Takeaway
Yes, and the evidence is strong. PR volume is growing fast and agents now author PRs at scale. In the best telemetry study, teams with high AI adoption merged nearly 2x the PRs, but review time almost doubled and company-level delivery metrics did not improve. Review, triage and merge are where the queue now builds.

### Cited Findings
- GitHub Octoverse 2025 (published 2025-10-28): developers merged an average of 43.2M PRs per month (+23% YoY) and a record 518.7M PRs over the year (+29% YoY). — [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- Octoverse 2025: the Copilot coding agent authored over 1M PRs between May and September 2025. Copilot has 20M+ users, and 80% of new GitHub developers use Copilot in their first week. — [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- Faros AI 2025 telemetry (10,000+ developers, 1,255 teams): teams with high AI adoption completed 21% more tasks and merged 98% more PRs, but PR review time rose 91%, average PR size rose 154% and bugs rose 9%. Company-level DORA metrics showed no measurable improvement. — via [Augment Code summary](https://www.augmentcode.com/guides/ai-productivity-paradox-engineering-delivery) and [SoftwareSeni summary](https://www.softwareseni.com/why-individual-ai-productivity-gains-disappear-at-the-organisational-level/) **[secondary summaries; the primary Faros report was not fetched]**
- DORA 2025 "State of AI-assisted Software Development" (~5,000 respondents): 90% of organizations have adopted AI in software development. AI adoption now correlates positively with delivery throughput but still correlates with higher instability: more change failures, more rework, longer cycle times to resolve issues. AI "is exposing the downstream bottlenecks in testing, code review, and quality assurance," and AI acts as an "amplifier" of existing organizational strengths and weaknesses. — [Splunk review of DORA 2025](https://www.splunk.com/en-us/blog/learn/state-of-devops.html); [cusy.io summary](https://cusy.io/en/blog/dora-report-2025.html); [DevOps.com](https://devops.com/dora-2025-faster-but-are-we-any-better/)
- Cursor (Anysphere) bought Graphite in December 2025 for cash and stock, at a price reported as "way over" Graphite's last private valuation of about $290M. The deal was framed as joining code creation to code review. — [Fortune, 2025-12-19](https://fortune.com/2025/12/19/cursor-ai-coding-startup-graphite-competition-heats-up/); [Axios Pro, 2025-12-19](https://www.axios.com/pro/enterprise-software-deals/2025/12/19/cursor-buys-code-review-platform-graphite); [Tessl](https://tessl.io/blog/cursor-acquires-graphite-to-bridge-code-creation-and-review/)
- Open source shows the same pressure in its worst form. In February 2026 GitHub publicly acknowledged that low-quality AI-generated PRs were overwhelming maintainers, considered options such as turning PRs off, limiting them to collaborators, AI triage and AI-attribution labels, and added a setting to disable PRs entirely. — [OpenSourceForU, Feb 2026](https://www.opensourceforu.com/2026/02/github-weighs-pull-request-kill-switch-as-ai-slop-floods-open-source/); [The New Stack](https://thenewstack.io/ai-slop-open-source/)

### Inferences
- [Inference] The strongest pitch is not "write code faster" (already commoditized by Claude Code, Codex and Cursor). It is "get through the review and merge queue that your agents create." The founder's three Phase-1 features (review inbox, stacked PRs, AI-PR triage) are all aimed at that queue.
- [Inference] Cursor buying Graphite shows the incumbents in agentic coding see review as the next battleground. That validates the market but raises competitive pressure: Graphite now ships with Cursor's distribution behind it.
- [Inference] Faros' "PR size +154%" finding suggests stacked PRs and small-diff discipline are a real fix, not a nostalgia feature, for agent-heavy teams.

### Gaps
- LinearB 2025/2026 benchmark figures (cycle time, review pickup time for AI vs. human PRs) were not retrieved.
- I found no reliable public figure for the share of all GitHub PRs authored by agents in 2026, beyond the Copilot agent's 1M+ PRs in May–Sep 2025.
- Graphite and CodeRabbit publish their own "state of code review" data. I did not retrieve those reports.
- Stack Overflow Developer Survey 2025 data on AI trust and usage was not retrieved.

---

## 2. Who pays for AI code review today? (proof of willingness to pay)

### Takeaway
Willingness to pay is proven and large. CodeRabbit went from about $5M to $40M ARR in a year and has 17,000+ customers. Graphite sold to Cursor above a $290M valuation. Greptile raised $25M from Benchmark. Prices cluster at $12–40 per developer per month, charged per seat or per active committer, and bought by teams rather than individuals.

### Cited Findings
- **CodeRabbit:** $40M ARR in April 2026, up from about $5M in April 2025. 17,000+ customers (including NVIDIA, BMW Group, Adyen, trivago), 2M+ code reviews per week, 150,000 open-source projects. $143M round announced 2026-08-12 at a reported $1.5B post-money valuation. Earlier rounds: $16M Series A (Aug 2024) and $60M Series B at $550M (Sept 2025). Total raised about $231M. — [arr.club](https://www.arr.club/coderabbit/coderabbit-revenue-up-5x-yoy-with-143m-series-c-at-1-5b-valuation); [SaaSRise](https://www.saasrise.com/deals/nvidia-backed-startup-coderabbit-valued-at-15-billion-in-round-5956b336-a8e0-4421-8234-b1b4973dd9c3); [ai2.work](https://ai2.work/blog/coderabbit-hits-1-5b-as-ai-code-review-becomes-infrastructure); Series B: [TechCrunch, 2025-09-16](https://techcrunch.com/2025/09/16/coderabbit-raises-60m-valuing-the-2-year-old-ai-code-review-startup-at-550m/) **[2026 ARR and valuation come from secondary aggregators]**
- CodeRabbit in Sept 2025: "over 8,000 paying organizations with 20% month-over-month ARR growth." Pricing about $12–15 per developer per month. — [Sacra (Greptile page)](https://sacra.com/c/greptile)
- **Greptile:** $25M Series A (Sept 2025, led by Benchmark) and $4.1M seed (June 2024, Initialized and YC). Total about $29.1M. Pricing about $30 per active developer per month for cloud, plus custom annual contracts for self-hosted. ARR and customer count not disclosed. — [Sacra](https://sacra.com/c/greptile)
- **Graphite:** 500+ companies and tens of thousands of engineers, including Shopify, Snowflake, Figma and Perplexity. $52M Series B (March 2025) with Anthropic's Anthology Fund plus the Figma and Shopify venture arms, both of them customers. Acquired by Cursor in Dec 2025. — [Fortune](https://fortune.com/2025/12/19/cursor-ai-coding-startup-graphite-competition-heats-up/); [DevOps.com](https://devops.com/cursor-acquires-graphite-to-streamline-ai-powered-development/)
- Graphite pricing: aggregators list Starter at about $20 and Team at about $40 per user per month, billed annually (checked May 2026). An earlier "Diamond" AI-review add-on was listed at $15–20 per active committer. — [CostBench](https://costbench.com/software/ai-code-review/graphite/); [Sacra](https://sacra.com/c/greptile) **[aggregator data; the sources describe different plan generations]**
- GitHub Copilot code review: about $20–39 per developer per month (bundled into Copilot tiers). — [Sacra](https://sacra.com/c/greptile)
- [Unverified, background knowledge, not re-fetched] GitHub list prices: Team about $4/user/mo and Enterprise about $21/user/mo; Copilot Business about $19 and Copilot Enterprise about $39 per user/mo. — [github.com/pricing](https://github.com/pricing), [Copilot plans](https://github.com/features/copilot/plans)

### Inferences
- [Inference] A team of 10 engineers already paying GitHub Team ($40/mo) can easily be paying $150–400/mo for AI review on top. The review layer gets a larger budget than the forge itself. Phase 1 (the layer) is therefore where the money is. A Phase-2 forge competes against a $4/user product and against free Forgejo/Gitea.
- [Inference] CodeRabbit's free tier for open source (150k OSS projects) and its paid conversion of companies is the proven motion: free for OSS to build reputation and distribution, paid per seat for private repos.
- [Inference] Competing head-on on generic AI review comments is a crowded, well-funded fight (CodeRabbit at $231M raised, Graphite inside Cursor, Copilot bundled). An open-source solo founder can win on what they don't do well: (a) a review *inbox* and triage across many agent-authored PRs, (b) agent-native CLI/MCP so agents can respond to review and restack, (c) self-hostability and open-source trust.

### Gaps
- No verified ARR for Graphite at acquisition, Greptile or Qodo. Qodo pricing and funding were not retrieved.
- No public data on what share of CodeRabbit's 17k customers are small teams versus enterprise.
- Current (Oct 2026) GitHub and Copilot prices were not re-verified. GitHub has changed Copilot pricing and premium-request billing several times.

---

## 3. Customer segments: pains, current spend, buyer, discovery channels, switching costs

### Takeaway
The best early segments are (a) small, AI-heavy startups where agents open many PRs and one tech lead both feels the pain and holds the card, and (b) maintainers of active, mid-to-large OSS projects drowning in AI-generated PRs. Maintainers have acute pain and high visibility but little money. EU public-sector sovereignty buyers are a real, growing Phase-2 market, but their sales cycles are slow and procurement-driven and they prefer fully free software, so they don't fit a solo founder's first year.

### Cited Findings
- **OSS maintainers (pain is acute):** the "AI slop" PR flood led Mitchell Hashimoto to ban AI-generated code from Ghostty, led tldraw's Steve Ruiz to auto-close all external PRs, and pushed GitHub to add a "disable pull requests" setting. One industry figure estimated only about 1 in 10 AI-created PRs is legitimate. — [OpenSourceForU](https://www.opensourceforu.com/2026/02/github-weighs-pull-request-kill-switch-as-ai-slop-floods-open-source/); [The New Stack](https://thenewstack.io/ai-slop-open-source/)
- Reported: on 2026-10-01 Sindre Sorhus disabled external PRs across all his repos ("Open source, as we have known it, was fun while it lasted"). — [OpenSourceForU](https://www.opensourceforu.com/2026/02/github-weighs-pull-request-kill-switch-as-ai-slop-floods-open-source/) **[Unverified: the date postdates the article's Feb 2026 URL. Confirm against Sorhus's own posts before quoting.]**
- **Mid-size and enterprise buyers already pay for review tooling:** Graphite's customers include Shopify, Snowflake, Figma and Perplexity. CodeRabbit's include NVIDIA, BMW, Adyen and trivago. — [Fortune](https://fortune.com/2025/12/19/cursor-ai-coding-startup-graphite-competition-heats-up/); [arr.club](https://www.arr.club/coderabbit/coderabbit-revenue-up-5x-yoy-with-143m-series-c-at-1-5b-valuation)
- Greptile sells self-hosted deployments on custom annual contracts. That is evidence of enterprise and regulated demand for self-hosted AI review. — [Sacra](https://sacra.com/c/greptile)
- **EU public sector (Netherlands):** the Dutch government chose Forgejo as its forge. code.overheid.nl soft-launched on 2026-04-24, with the ministries of Finance, Foreign Affairs, Agriculture and Interior and the municipalities of The Hague, Utrecht, Leiden and Arnhem; the Kiesraad hosts election software there. GitHub was rejected as proprietary and GitLab for its open-core model. Forgejo won as fully FOSS, governed by the nonprofit Codeberg e.V. with "no enterprise tier, proprietary upsell, or vendor lock-in." SSC-ICT runs the infrastructure. It is still a pilot. — [It's FOSS](https://itsfoss.com/news/netherlands-forgejo-migration/); [OpenSourceForU](https://www.opensourceforu.com/?p=98020)
- **EU public sector (Germany):** openCode.de is the federal platform where federal, state and municipal authorities find, publish and collaborate on open-source code. It has 5,000+ users and 1,900+ repositories (2026), up from 4,000+ users and 1,300 repos in 2024. ZenDiS, which runs openCode and openDesk, began a strategic reorientation in April 2026 to spread both across German and European agencies. — [cosinex blog, 2026-04-16](https://blog.cosinex.de/2026/04/16/zendis-strategische-neuausrichtung-open-source/); [Vergabeblog, 2026-04-21](https://vergabeblog.de/2026-04-21/zendis-strategische-neuausrichtung-mit-fokus-auf-open-source/)
- **Schleswig-Holstein:** moved 40,000+ mailboxes from Exchange/Outlook to Open-Xchange/Thunderbird (Oct 2025). About 80% of workplaces used LibreOffice by Dec 2025. The state expects to save €15M+ a year in licenses from 2026 after a one-time investment of about €9M. Its program covers office, email, directory, telephony, Linux workstations and AI assistance. Git hosting was not mentioned in the sources found. — [The DropTimes](https://www.thedroptimes.com/node/70889); [ayedo](https://ayedo.de/en/posts/digitale-souveranitat-im-echtbetrieb-warum-schleswig-holstein-mit-open-source-massstabe-setzt/)
- Self-hosted forge interest in general is driven by GitHub pricing, worry about AI training on hosted code, and EU sovereignty policy. — [drweb.de](https://www.drweb.de/warum-verlassen-sie-github-fuer-forgejo-wegen-der-souveraenitaet/); [tech-insider (Gitea vs Forgejo vs GitLab CE)](https://tech-insider.org/?p=20561) **[opinion and blog sources]**

### Inferences (segment map; reasoning, not sourced data unless cross-referenced above)

| Segment | Core pain (2026) | Pays today | Decides / pays | Discovery | Switching cost for a *layer* | Budget signal | Fit for solo founder |
|---|---|---|---|---|---|---|---|
| Solo/indie devs | Reviewing their own agents' PRs; juggling parallel agent branches | GitHub Free/Pro, Claude/Cursor subs ($20–200/mo) | Self | X, HN, Reddit, YouTube, agent-tool Discords | Very low | Low; will pay $10–20 only for clear time savings | Great for **usage/feedback and distribution**, weak for revenue |
| Students | Learning; little review pain | Free (GitHub Education) | Self/school | Campus, Discord | None | ~0 | Skip, except as OSS contributors |
| OSS maintainers, small | Occasional AI-slop PRs | $0 | Self | GitHub, X, Mastodon/Bluesky | Low | ~0 | Advocates, not payers |
| OSS maintainers, large/active | Flood of AI PRs; triage burden; burnout | $0 (CodeRabbit/others free for OSS); sometimes foundation or sponsor money | Core team; foundation (CNCF, Linux Foundation, NumFOCUS) for infra | Maintainer communities, GitHub Discussions, FOSDEM, conferences | Low for a layer (a GitHub App); very high for a forge move | Small, but high visibility | **Top-2 for credibility and distribution**; monetize indirectly |
| AI-heavy startups (2–20 eng) | Agents open more PRs than humans can review; giant PRs; merge conflicts across parallel agent branches | GitHub Team, Copilot or Cursor/Claude seats, often CodeRabbit/Graphite/Greptile ($12–40/dev/mo) | CTO / tech lead / founder, often the same person, on a company card | X, HN, YC/accelerator Slacks, Claude Code / Cursor / Codex communities, word of mouth | Low (GitHub App, per-repo install, cancel anytime) | $100–1,000/mo team budgets already exist | **Top-1 paying segment** |
| Mid-size (50–500 eng) | Review latency, governance of AI PRs, metrics | GitHub Enterprise, Copilot Business/Enterprise, LinearB/Jellyfish/Faros, Graphite | VP Eng / platform team; procurement + security review | Peers, analysts, conferences, outbound | Medium (security review, SSO, SOC 2) | Large but slow | Year-2 target |
| Enterprise | SSO, audit, compliance, data residency, AI-code provenance | GitHub Enterprise Cloud/Server, GitLab Ultimate, Copilot Enterprise | CIO/CISO + procurement | RFPs, partners, analysts | High | Very large, very slow | Not a solo founder's first customer |
| EU public sector / sovereignty | Vendor lock-in, data sovereignty, FOSS mandates | Self-hosted GitLab CE/EE, Forgejo, openCode.de (GitLab-based) | Central IT bodies (ZenDiS, SSC-ICT), state CIOs; public tenders | Tenders, FOSS-in-government events, integrators | High; procurement-driven | Real but tender-shaped; NL explicitly prefers fully free, no-upsell software | Phase-2 only; enter via integrators or as an *upstream FOSS contributor/plugin* to Forgejo |

- [Inference] For a solo founder, the "who feels pain = who holds the card = who can install in 5 minutes" overlap is tightest in AI-heavy startups of 2–20 engineers. That is the paying ideal customer.
- [Inference] Large-OSS maintainers are the best *design partners and distribution*: the pain is public and severe, their endorsement spreads, and an open-source product fits their values. Treat them as a free tier, as CodeRabbit does with its 150k OSS projects.
- [Inference] For EU sovereignty buyers, the Dutch "no enterprise tier, no proprietary upsell" criterion means an open-core business model may be disqualified, as GitLab was. A Phase-2 forge aimed at this segment should either be fully FOSS with paid support/hosting, or ship as features contributed to or built on Forgejo rather than as a competing forge.

### Gaps
- No primary data on what indie developers actually pay for review tools; segment budgets above are inference.
- Did not confirm what forge openCode.de runs in 2026 (historically GitLab, per background knowledge) or whether Schleswig-Holstein has a git-hosting plan.
- No survey data on switching costs or GitHub churn intent. Stack Overflow 2025 and JetBrains surveys were not retrieved.

---

## 4. How comparable developer tools found their first customers

### Takeaway
They hand-picked motivated users from a narrow community they belonged to, onboarded them a cohort at a time, rebuilt the product per cohort, and launched publicly with a sharp one-line positioning in places developers already gather (HN, X, GitHub, ecosystem marketplaces).

### Cited Findings
- **Linear:** before quitting their jobs, the founders spent more than a year on informal research with colleagues at Airbnb, Uber and Coinbase, meeting weekly at a bar to compare notes. They asked what was bad about current tools and what would make people more productive. Saarinen: "The incumbent in this market is like the floors in the building — you don't think about the floors, you just walk on them." — [First Round Review](https://review.firstround.com/linears-path-to-product-market-fit.md)
- Linear launched an invite-only beta in April 2019 (blog post, tweet, waitlist) and collected about 10,000 emails. A survey asked "Why do you want to use it and what are your current problems?" and Saarinen hand-picked about 10 users per week matching the ideal customer (individual contributors at fast-growing startups). About 10% of the waitlist became users in year one. "With each 10-person cohort, we basically made a new version of the product." They reached about 1,000 DAU before opening publicly in early 2020 and raised a $4.2M seed in Nov 2019. Quote: "I wanted to find the most motivated users and focus on them as much as possible." — [First Round Review](https://review.firstround.com/linears-path-to-product-market-fit.md)
- Linear's private-alpha playbook: manual onboarding of friends at other hot startups, which created a waitlist and FOMO. — [DevTools Brew #62](https://morganperry.substack.com/p/devtools-brew-62-building-linear)
- **Supabase:** early users posted it to HN as "an open source Firebase alternative" (1.1K+ upvotes). After adopting the tagline "the open-source Firebase alternative," Supabase went from 8 to 800 hosted databases in three days. It grew by shipping small developer-facing features and announcing them on GitHub, HN, Twitter and in the Next.js/Vercel ecosystem. The Vercel Marketplace later became its largest partner channel. — [Contrary Research](https://research.contrary.com/company/supabase); [DevTools Brew #23](https://morganperry.substack.com/p/devtools-brew-23-supabase-journey); [Vercel blog](https://vercel.com/blog/how-supabase-increased-signups-through-the-vercel-marketplace)
- **Graphite:** founded in 2020 by Merrill Lutsky, Greg Foster (ex-Airbnb infrastructure) and Tomas Reimers. Its later customers (Shopify, Figma) also became investors. — [startupintros](https://startupintros.com/people/merrill-lutsky); [Fortune](https://fortune.com/2025/12/19/cursor-ai-coding-startup-graphite-competition-heats-up/)

### Inferences
- [Inference] Lessons for this founder: (1) "Open-source X alternative" positioning is proven for HN-driven launches (Supabase). "The open-source review inbox for agent-written PRs" has a similar shape. (2) Run a gated beta with a qualifying survey, as Linear did, so the founder talks to the 10 most motivated users a week instead of the median signup. (3) Ecosystem marketplaces (GitHub Marketplace, MCP registries, Claude Code / Cursor plugin directories) can play the role the Vercel Marketplace played for Supabase.
- [Inference, background knowledge, not verified in this session] Graphite's origin story is commonly told as ex-Meta/Phabricator-style stacked-diff users wanting that workflow on GitHub. "Engineers who already know the better workflow" is a reusable targeting heuristic: ex-Meta and ex-Google engineers now at startups.

### Gaps
- Not retrieved: Raycast's and Vercel's first-customer stories, and Graphite's documented early-user acquisition.
- Lenny's Newsletter pieces on finding first customers (for example, the "how the biggest consumer/B2B apps got their first users" series) were not retrieved.

---

## 5. Candidate ideal first customers

### Takeaway
Primary ICP: a 2–20 engineer startup where most PRs are now opened by Claude Code, Codex, Cursor or Copilot agents, already on GitHub Team, already paying for at least one AI review tool or having tried one, and where one tech lead spends more than an hour a day reviewing. Secondary (design partner and distribution): maintainers of active OSS repos who got hit by AI-generated PRs in 2026.

### Cited Findings
- AI-heavy teams merge 98% more PRs and see review time rise 91% with PRs 154% larger, so the pain concentrates where agent use is heaviest. — [Augment Code summary of Faros AI](https://www.augmentcode.com/guides/ai-productivity-paradox-engineering-delivery)
- Teams already pay $12–40/dev/mo for AI review (CodeRabbit, Greptile, Graphite, Copilot). — [Sacra](https://sacra.com/c/greptile); [CostBench](https://costbench.com/software/ai-code-review/graphite/)
- Maintainers are publicly closing PRs, banning AI code or disabling PRs because of AI-generated submissions. — [OpenSourceForU](https://www.opensourceforu.com/2026/02/github-weighs-pull-request-kill-switch-as-ai-slop-floods-open-source/)

### Inferences
- [Inference] **ICP-A, "agent-heavy startup" qualifiers:** (1) more than 30% of merged PRs agent-authored, or engineers running 3+ agents in parallel; (2) self-reported review backlog or "PRs sitting for days"; (3) already paying for, or having churned from, CodeRabbit, Graphite, Greptile or Copilot review (proof of budget and of an unmet need); (4) the buyer is the tech lead or CTO personally; (5) GitHub-hosted (fits the Phase-1 layer).
- [Inference] **ICP-B, "flooded maintainer" qualifiers:** repo with 1k+ stars and steady external PRs; publicly complained about AI PRs, added a contribution policy on AI, or turned on PR restrictions in 2026. What they would value: triage that separates human-reviewed from agent-dumped PRs, contributor reputation, bulk close with templated replies, an AI-attribution signal.
- [Inference] **Anti-ICP for year one:** enterprises needing SSO, SOC 2 or audit logs; public-sector tenders; students. Talk to two or three platform engineers at mid-size companies only to learn what Phase 2 would need.
- [Inference] **Wedge test:** if ICP-A interviewees describe their review pain mostly as "too many comments, low-quality AI review," the market is CodeRabbit's and the founder should not compete there. If they describe *coordination* (which PRs to look at first, stacking agent branches, agents not responding to review feedback, merge conflicts between parallel agents), that is the open gap for an inbox plus agent CLI/MCP.

### Gaps
- No direct evidence yet on what share of 2–20 person startups use agents heavily enough to qualify. Discovery interviews should establish it.

---

## 6. Customer-discovery plan: method, interview script, where to find people, commitment signals, how many interviews

### Takeaway
Run about 30–40 Mom-Test-style interviews over 3–4 weeks, split about 60/40 between agent-heavy startup leads and flooded OSS maintainers. Ask only about past behavior and current spend. Count commitments (follow-up time, intros, installs on real repos, pilot payment), not compliments. Because building is cheap, show a working prototype on the interviewee's own repo from interview ~10 onward, but keep it separate from the learning questions.

### Cited Findings
- The Mom Test's three rules: talk about the customer's life rather than your idea; ask about specifics in the past rather than generics or opinions about the future; talk less and listen more. — [mtlynch.io book report](https://mtlynch.io/book-reports/the-mom-test/); [Unusual Ventures](https://www.unusual.vc/rob-fitzpatricks-mom-test/)
- A meeting should end in *commitment* (giving up time, reputation or money) and *advancement* (moving to the next step toward purchase). The currencies: time (the next meeting booked before this one ends, a workflow walkthrough), reputation (an intro to a colleague or decision-maker), money (LOI, pre-payment, pilot fee). "The more they're giving up, the more seriously you can take what they're saying." — [Koji summary](https://www.koji.so/docs/mom-test-methodology); [Unusual Ventures](https://www.unusual.vc/rob-fitzpatricks-mom-test/)
- Linear's model: a qualifying survey on current problems, hand-picked cohorts of about 10 per week, and a product iteration after each cohort. — [First Round Review](https://review.firstround.com/linears-path-to-product-market-fit.md)

### Inferences

**A. Where to find interviewees** (my recommendations; channels named from background knowledge, not verified for activity in Oct 2026)
- *ICP-A (agent-heavy startups):*
  - X/Twitter: people posting screenshots of many parallel Claude Code/Codex agents, "my agents opened 40 PRs" complaints, and people who post about CodeRabbit, Graphite or Greptile. Reply or DM with a specific question about their setup.
  - Hacker News: commenters on Graphite-Cursor, CodeRabbit-funding and "AI productivity paradox" threads. Their HN profiles often link to a company.
  - Reddit: r/ClaudeAI, r/ChatGPTCoding, r/cursor, r/ExperiencedDevs, r/devops. Read threads about review overload and message the authors.
  - Tool communities: the Anthropic/Claude Discord, the Cursor forum, OpenAI developer forum / Codex discussions, MCP server builder communities, and GitHub issues on popular agent tools (Claude Code, Aider, OpenHands, Cline), where power users file issues.
  - Accelerator networks: YC/Bookface needs a YC founder intro; otherwise ask friendly founders for warm intros. Recent YC batches are heavily AI-native.
  - Public repos of startups whose commit history shows agent co-author trailers (for example, "Co-Authored-By: Claude"). That is a very precise list of heavy agent users.
- *ICP-B (maintainers):* maintainers who publicly posted about AI-generated PRs (the Ghostty, tldraw and Sorhus cases above as a starting list), GitHub Discussions on the AI-PR policy, CNCF/OpenSSF/Linux Foundation maintainer channels, the Sustain OSS community, FOSDEM and local OSS meetups, and Mastodon/Bluesky FOSS circles.
- *Phase-2 sovereignty (exploratory, 3–5 calls only):* the Forgejo/Codeberg Matrix rooms, openCode.de community, SSC-ICT's code.overheid.nl pilot participants (they are invited to file issues), and FOSS-in-government events.

**B. Approach (solo, no budget)**
- Ask for a 20-minute call about *their* workflow, not a demo: "I'm researching how teams with heavy Claude Code/Codex use handle PR review. Saw your post about X. Could I ask you 5 questions? Not selling anything." Offer a small favor in return: share anonymized findings, or a free script that adds an agent-authored label to their PRs.
- Lead with an artifact that shows you understand the problem (a short public write-up of the Faros/DORA/Octoverse data above). It works as content marketing and as an icebreaker.
- After about 10 interviews, use the cheap-build advantage: a "concierge" version where you install a rough triage bot or inbox on their real repo for two weeks. Usage on real repos is the key evidence.

**C. Interview script, ICP-A: agent-heavy startup tech lead (12 questions, past behavior only)**
1. Walk me through the last PR you merged yesterday. Who or what wrote it, and how did it get to merged?
2. Over the last week, roughly how many PRs did agents open on your repos, and how many did humans open? How do you know?
3. Tell me about the last time a PR sat waiting for review longer than it should have. What happened, and what did it cost you?
4. How do you currently decide which PR to look at first in the morning? Show me (screen share your GitHub notifications or tool).
5. When did you last throw away or close an agent-authored PR without merging? Why?
6. What tools have you tried for review in the last 12 months (CodeRabbit, Graphite, Greptile, Copilot review, custom scripts)? Which do you still pay for, what does it cost, and why did you drop the others?
7. Tell me about the last time two agents' branches conflicted, or a big agent PR had to be split. What did you do?
8. When an agent gets review feedback, what happens next today? Who relays it back to the agent, and how long does that take?
9. Have you built any internal scripts, bots, GitHub Actions or MCP servers to manage this? Can you show me? (Homemade workarounds are the strongest pain signal.)
10. Who else on the team spends time on this, and how many hours a week, roughly, last week?
11. The last time you bought a dev tool for the team, who approved it, what was the budget, and how long did it take from trial to paid?
12. Who else do you know dealing with this that I should talk to? (Asks for a reputation commitment.)

**D. Interview script, ICP-B: maintainer of an active OSS project (11 questions)**
1. Walk me through how you handled the last batch of incoming PRs on [repo].
2. In the last month, how many external PRs came in, and how many were clearly AI-generated without review by the submitter? How did you tell?
3. Tell me about the most recent AI-generated PR that cost you real time. What did you do with it?
4. What policies or settings have you changed this year (CONTRIBUTING rules, AI policy, PR restrictions, labels, bots)? What triggered each?
5. What tools or bots do you run on the repo today (CodeRabbit OSS, Dependabot, stale bots, custom Actions)? What have you turned off, and why?
6. Have you lost a good human contributor's PR in the noise? Tell me about it.
7. How do you decide whose PRs to look at first?
8. Who else helps triage, and how is the work split? How many hours did triage take last week?
9. Does the project have any money (sponsors, foundation, company backing)? Has it ever paid for tooling or infrastructure, and who approved it?
10. Have you considered moving the project off GitHub (Codeberg/Forgejo, GitLab, self-hosted)? What happened when you looked into it?
11. Which other maintainers are dealing with this? Would you introduce me?

(Avoid "Would you use…?", "Would you pay…?" and "Do you think X is a good idea?". Those are the hypotheticals the Mom Test rules out. Pitch only at the end, if at all, then ask for a concrete next step.)

**E. Signals of real demand (ranked weakest to strongest)**
- Weak/false: compliments, "cool, send it to me when it's ready," feature requests without a story behind them, "I would pay $X."
- Moderate: a specific recent story told unprompted, with numbers (hours, PR counts); an existing homemade workaround (scripts, Actions, MCP servers); currently paying for a competitor and complaining about a specific gap.
- Strong commitments: they book a second call or a screen-share walkthrough before you hang up (time); they intro a co-founder, teammate or another maintainer (reputation); they install your prototype on a *real, private* repo and are still using it after 2 weeks (time plus risk); they agree to a paid pilot or pre-pay, even $50–200/mo (money). For maintainers, a public endorsement or adopting the tool on a well-known repo counts as reputation currency.
- Kill or pivot signals: after 15+ ICP-A interviews, fewer than about a third report review/merge as a top-3 pain, or nobody has a homemade workaround, or everyone is satisfied with CodeRabbit/Graphite.

**F. How many interviews before building (heavily)**
- About 15 interviews per segment before committing to a wedge; about 30–40 total over 3–4 weeks (roughly 10 a week, matching Linear's 10-person cohort pace). Stop a segment early once the last ~5 interviews produce no new pain patterns.
- Because building with AI agents is cheap, prototyping can run *in parallel* from about interview 10 onward. Don't wait. The gate for "build the real product" is commitments, not interview count: target 5+ teams using it weekly on real repos and 2–3 paid pilots (or pre-payments) from ICP-A, plus 3–5 maintainer design partners from ICP-B, before going deep on Phase 1. Treat Phase 2 (forge) as unvalidated until several paying Phase-1 customers ask for self-hosting or leaving GitHub, and a sovereignty buyer has said what it would procure.

### Gaps
- YC "talk to users" material (Startup School, Michael Seibel/Eric Migicovsky's "How to Talk to Users") was not retrieved. Its main advice (ask about the hardest part, the last time it happened, what was done, why existing solutions don't work) is consistent with the Mom Test but is cited here from background knowledge only.
- No published benchmark for "how many interviews" exists. The numbers in F are judgment-based heuristics, not sourced figures.
- Current activity levels of the named Discords, subreddits and Slack groups were not verified in Oct 2026.
