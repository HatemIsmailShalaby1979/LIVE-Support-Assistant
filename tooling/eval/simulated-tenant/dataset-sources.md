# Ticket-shape research

**data_mode: "simulated" — this note records public schema metadata, not ticket data.**

Reviewed on 2026-09-28. No dataset rows were downloaded, copied, or used as
generator examples.

| Source | Published fields / structure | Fitness and handling |
|---|---|---|
| [TNE-AI/customer-support-on-twitter-conversation](https://huggingface.co/datasets/TNE-AI/customer-support-on-twitter-conversation) | `conversation_id`, `company`, `conversation`, `summary`; Parquet train split, 794,335 records | Conversation/thread shape is useful for reply chains and summaries. The card does not establish anonymization or a license, and public social text may contain personal data. Metadata only; do not use its message text. |
| [Tobi-Bueck/customer-support-tickets](https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets) | `Queue`, `Priority`, `Language`, `Subject`, `Body`, `Answer`, `Type`, `Business Type`, plus ten tag columns | The author explicitly describes this as a synthetic no-PII dataset. Useful helpdesk field structure, but it is not a real anonymized dataset. Its card lists CC-BY-NC-4.0. Only documented field names and workflow dimensions are borrowed. |
| [gorkemsevinc/customer_support_tickets](https://huggingface.co/datasets/gorkemsevinc/customer_support_tickets) | `Customer Email`, `Product Purchased`, `Ticket Type`, `Ticket Subject`, `Combined Text`, `Ticket Priority`; Parquet train split, 8,469 records | The `Customer Email` field is personal-data-shaped and the card gives no anonymization assurance. Excluded; no rows used. |

The available evidence does **not** support claiming a verified, real,
anonymized ticket dataset. The generator therefore uses only these public
schemas and simulates all messages from scratch. A privacy check rejects
email-like addresses and phone-number-like strings in generated subjects and
messages. This is synthetic-data validation, not a certification that any
external dataset is anonymized.

The product boundary was checked in `apps/web/src/App.tsx` and
`apps/web/src/telemetry.ts`: LIVE Support Assistant accepts a plain-text query.
Ticket metadata such as channel, status, queue, and handoff count remains in the
test harness and is not represented as a supported product input.
