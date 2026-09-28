# Simulated client brief: WaveCast Creator Care

**data_mode: "simulated" — fictional profile; no real customer data, and there is no design partner.**

## Operating profile

WaveCast is a fictional, mid-sized live-streaming and creator-commerce platform.
Its Creator Care operation has 120 frontline agents across three shifts, 18
team leads, and a specialist Trust & Safety queue. The service handles about
1,600 inbound tickets per day, with predictable evening and weekend peaks
around creator broadcasts and payout cycles. Support is staffed 24/7; specialist
teams work regional business hours with an on-call path for urgent cases.

Supported languages are English (65%), Spanish (20%), Brazilian Portuguese
(10%), and French (5%). These are planning assumptions for the simulation, not
measured customer demographics. Channels are in-app chat (55%), email/web form
(30%), social direct messages (10%), and callback requests (5%).

## Service targets

| Priority | Typical trigger | First response | Target next action |
|---|---|---:|---:|
| P1 | Suspected account takeover, credible immediate safety concern, or platform-wide LIVE outage | 15 minutes, 24/7 | Contain or route to the specialist on-call queue within 4 hours |
| P2 | Missing/held payout, purchase dispute, or a creator unable to start a scheduled LIVE | 1 business hour | Resolve or provide a named owner and next update within 1 business day |
| P3 | Eligibility questions, routine policy clarification, or non-urgent how-to | 8 business hours | Resolve or give a dated update within 3 business days |

These targets are scenario assumptions for testing; they are not contractual
SLAs and do not describe any real support organization.

## Expected ticket mix

| Category | Share |
|---|---:|
| Gifts, purchases, and refunds | 24% |
| Creator payouts and balance status | 18% |
| Account access and security | 15% |
| LIVE setup, connectivity, and stream health | 14% |
| Content actions and account restrictions | 12% |
| Creator/LIVE eligibility | 9% |
| Other, ambiguous, or specialist-only | 8% |

## Simulation contract

Each synthetic ticket will carry a message, timestamp, channel, language,
category, priority, status, and expected handling label. The shipped assistant
accepts a plain-text question and searches the procedures in the active bundle;
it does not ingest a ticket object or use ticket metadata today. The evaluation
must therefore pass only the ticket message to the existing decision path and
keep the remaining fields as harness-side simulated labels. This exercise adds
no product feature and must not present synthetic outcomes as live operations.
