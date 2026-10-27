# Build once, run on any agent

[![Build once, run on any agent — title slide](assets/cover.png)](slides/talk.pdf)

**A practical guide to agent skills** · GitHub Universe 2026 · BLD1787B

[Talk site](https://gh.io/skills26site) · [Slides (PDF)](slides/talk.pdf)

| Speaker | Role |
| --- | --- |
| Andrea Griffiths | Senior Developer Advocate, GitHub |
| Shishir Tewari | Senior Manager, Data Engineering, Procore |

## About the talk

Most developers use AI the same way: open a chat, type a prompt, move on. The context disappears. The next step starts from scratch.

Agent skills fix that. Andrea Griffiths builds them for her own recurring work: files any coding agent can run. Shishir Tewari builds them for a data engineering team at Procore, where a skill has to encode senior-engineer judgment and survive production.

Different scale, same format. The file you write for yourself tonight is the same file that runs a team’s pipeline.

You will leave with a clear model for when to build a skill instead of writing another prompt.

## Demos

| Skill | What it does | Media | Source |
| --- | --- | --- | --- |
| [**proof-agent**](demos/proof-agent/) | Andrea's independent verifier skill and GitHub Action, pinned to `v1.1.2` | [Narrated demo](assets/recordings/proof-agent-narrated.mp4) (3:52) | [AndreaGriffiths11/proof-agent](https://github.com/AndreaGriffiths11/proof-agent) |
| [**proof-review**](demos/proof-review/) | Andrea's skill for verifying bugfix PRs under production-shaped load, with a Node.js load harness and report template | — | [AndreaGriffiths11/proof-review](https://github.com/AndreaGriffiths11/proof-review) |
| [**dataforge**](demos/dataforge/) | Shishir's four agent skills that build data pipelines from a project manifest, issue to pull request | [Recording](assets/recordings/Dataforge.mp4) | [tewarishishir/dataforge](https://github.com/tewarishishir/dataforge) |

## Repository layout

| Path | Contents |
| --- | --- |
| [`slides/`](slides/) | The talk deck |
| [`demos/`](demos/) | The three skills above, as runnable snapshots |
| [`assets/`](assets/) | Recordings used by the demos and the site |
| [`site/`](site/) | Talk website source and build ([build, deck, and Pages setup](site/README.md)) |
| `resources/` | Reserved for supporting links |
