# Confusability report — procedure pairs per language

**data_mode: "simulated".** Read-only corpus geometry. No procedure was modified and no query was run.

Corpus: `tooling/eval/simulated-tenant/corpus.json` — 7 procedures, 92 passages, SHA-256 `5da97ad6b50b9307…`
Embedding: Xenova/all-MiniLM-L6-v2 (751bff37182d3f1213fa05d7196b954e230abad9, q8).

## How to read this

For each pair of procedures and each language, the table reports the **highest cosine similarity between any passage of one and any passage of the other**. That is the best-case route by which a single query could bring the two level, which is what makes a pair a risk for a low gate margin. Each language section also lists a within-procedure reference: the highest similarity between two of a single procedure's *own* passages. A pair whose cross-similarity approaches that level is as close to its neighbour as it is to itself.

This measures corpus geometry, not query behaviour. A high value means a pair *can* be confused; whether it is confused in practice is measured by running the batch, not here.

**Language attribution.** 84 of 92 passages were classified; 8 were not (8.7%) and are excluded from the tables below rather than guessed at.

## Top 5 riskiest pairs, all languages

| Rank | Language | Procedure A | Procedure B | Max similarity | Mean similarity | Passages compared |
|---:|---|---|---|---:|---:|---:|
| 1 | es | `wc-gifts` | `wc-payout` | **0.6819** | 0.5005 | 9 |
| 2 | pt-BR | `wc-login` | `wc-security` | **0.6525** | 0.4910 | 9 |
| 3 | es | `wc-security` | `wc-appeal` | **0.6512** | 0.4498 | 9 |
| 4 | es | `wc-security` | `wc-live` | **0.6419** | 0.3856 | 12 |
| 5 | pt-BR | `wc-security` | `wc-appeal` | **0.6416** | 0.5167 | 6 |

## en

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.6582 · `wc-payout` 0.7207 · `wc-login` 0.6470 · `wc-security` 0.2364 · `wc-live` 0.7503 · `wc-appeal` 0.7404 · `wc-eligibility` 0.5085.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-login` | `wc-security` | **0.6323** | 0.4301 | Never ask a customer to send a password, one-time code, or recovery li… ↔ Direct the customer to secure the recovery email from a trusted device… |
| `wc-appeal` | `wc-eligibility` | **0.5790** | 0.3259 | Content and LIVE restriction appeals require Trust & Safety review. ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-live` | `wc-eligibility` | **0.5102** | 0.2642 | If several creators report the same regional failure, route it as a po… ↔ Region availability can change. |
| `wc-gifts` | `wc-payout` | **0.4316** | 0.2869 | A duplicate charge or a purchase the account holder did not authorize … ↔ Ask the creator to confirm the payout date and masked destination deta… |
| `wc-payout` | `wc-security` | **0.4102** | 0.1648 | Ask the creator to confirm the payout date and masked destination deta… ↔ Do not disclose account changes or ask the customer to share credentia… |
| `wc-live` | `wc-appeal` | **0.3927** | 0.1961 | Do not ask the creator to repeatedly restart a scheduled broadcast. ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-login` | `wc-eligibility` | **0.3745** | 0.1895 | Never ask a customer to send a password, one-time code, or recovery li… ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-gifts` | `wc-eligibility` | **0.3693** | 0.1150 | A duplicate charge or a purchase the account holder did not authorize … ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-gifts` | `wc-security` | **0.3670** | 0.1996 | A duplicate charge or a purchase the account holder did not authorize … ↔ Do not disclose account changes or ask the customer to share credentia… |
| `wc-gifts` | `wc-appeal` | **0.3597** | 0.1264 | A duplicate charge or a purchase the account holder did not authorize … ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-gifts` | `wc-login` | **0.3550** | 0.1606 | A duplicate charge or a purchase the account holder did not authorize … ↔ A recovery code that does not arrive after a phone change, or a passwo… |
| `wc-login` | `wc-live` | **0.3536** | 0.1872 | For a routine login problem, use Forgot password on the sign-in screen… ↔ LIVE stream stability: for an isolated LIVE connection problem, confir… |
| `wc-payout` | `wc-login` | **0.3514** | 0.1162 | Ask the creator to confirm the payout date and masked destination deta… ↔ Never ask a customer to send a password, one-time code, or recovery li… |
| `wc-security` | `wc-eligibility` | **0.3400** | 0.1756 | Direct the customer to secure the recovery email from a trusted device… ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-security` | `wc-live` | **0.3354** | 0.1389 | Direct the customer to secure the recovery email from a trusted device… ↔ If several creators report the same regional failure, route it as a po… |
| `wc-payout` | `wc-eligibility` | **0.3183** | 0.1523 | Ask the creator to confirm the payout date and masked destination deta… ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-security` | `wc-appeal` | **0.3051** | 0.1741 | Direct the customer to secure the recovery email from a trusted device… ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-login` | `wc-appeal` | **0.2811** | 0.1048 | Check that the recovery email or phone is still available and install … ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-payout` | `wc-appeal` | **0.2594** | 0.1043 | If more than seven business days have passed, route the case to Paymen… ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-payout` | `wc-live` | **0.2505** | 0.1188 | Creator payout timing: a standard creator payout can take two to five … ↔ Do not ask the creator to repeatedly restart a scheduled broadcast. |
| `wc-gifts` | `wc-live` | **0.2470** | 0.0594 | A duplicate charge or a purchase the account holder did not authorize … ↔ If several creators report the same regional failure, route it as a po… |

## es

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.6869 · `wc-payout` 0.6872 · `wc-login` 0.6760 · `wc-security` 0.6159 · `wc-live` 0.6352 · `wc-appeal` 0.4281 · `wc-eligibility` 0.6811.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-gifts` | `wc-payout` | **0.6819** | 0.5005 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Un pago marcado como procesado que aún no aparece en la cuenta bancari… |
| `wc-security` | `wc-appeal` | **0.6512** | 0.4498 | Un posible acceso no autorizado requiere una revisión especializada de… ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-security` | `wc-live` | **0.6419** | 0.3856 | Indica a la persona que proteja el correo de recuperación desde un dis… ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-security` | `wc-eligibility` | **0.6393** | 0.4853 | Un posible acceso no autorizado requiere una revisión especializada de… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-payout` | `wc-live` | **0.6391** | 0.3678 | Si han pasado más de siete días hábiles, remite el caso a Pagos. ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-payout` | `wc-eligibility` | **0.6036** | 0.4502 | Si han pasado más de siete días hábiles, remite el caso a Pagos. ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-login` | `wc-security` | **0.5990** | 0.4825 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Indica a la persona que proteja el correo de recuperación desde un dis… |
| `wc-live` | `wc-eligibility` | **0.5956** | 0.4337 | Si varias personas de la misma región notifican el problema, remítelo … ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-appeal` | `wc-eligibility` | **0.5798** | 0.4654 | Si un creador no está de acuerdo con una medida sobre el contenido o u… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-gifts` | `wc-eligibility` | **0.5718** | 0.4486 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-gifts` | `wc-live` | **0.5670** | 0.4105 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-payout` | `wc-security` | **0.5592** | 0.4307 | Un pago marcado como procesado que aún no aparece en la cuenta bancari… ↔ Indica a la persona que proteja el correo de recuperación desde un dis… |
| `wc-gifts` | `wc-login` | **0.5493** | 0.4600 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Comprueba que todavía tienes acceso al correo o teléfono de recuperaci… |
| `wc-gifts` | `wc-security` | **0.5328** | 0.4356 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Indica a la persona que proteja el correo de recuperación desde un dis… |
| `wc-login` | `wc-live` | **0.5324** | 0.4006 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-live` | `wc-appeal` | **0.5302** | 0.3942 | Si varias personas de la misma región notifican el problema, remítelo … ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-login` | `wc-appeal` | **0.5155** | 0.3680 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-payout` | `wc-login` | **0.4901** | 0.4190 | Un pago marcado como procesado que aún no aparece en la cuenta bancari… ↔ Comprueba que todavía tienes acceso al correo o teléfono de recuperaci… |
| `wc-login` | `wc-eligibility` | **0.4768** | 0.3961 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-gifts` | `wc-appeal` | **0.4583** | 0.3463 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Si un creador no está de acuerdo con una medida sobre el contenido o u… |
| `wc-payout` | `wc-appeal` | **0.4482** | 0.3498 | Un pago marcado como procesado que aún no aparece en la cuenta bancari… ↔ Si un creador no está de acuerdo con una medida sobre el contenido o u… |

## pt-BR

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.6639 · `wc-payout` 0.5669 · `wc-login` 0.6675 · `wc-security` 0.5635 · `wc-live` 0.7013 · `wc-appeal` 0.6390 · `wc-eligibility` 0.7002.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-login` | `wc-security` | **0.6525** | 0.4910 | Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. ↔ Oriente a pessoa a proteger o e-mail de recuperação usando um disposit… |
| `wc-security` | `wc-appeal` | **0.6416** | 0.5167 | Uma possível invasão da conta exige análise especializada de Segurança… ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-appeal` | `wc-eligibility` | **0.6352** | 0.5881 | Se um criador contestar uma medida de conteúdo ou restrição de LIVE, d… ↔ Requisitos de elegibilidade para o LIVE: nesta simulação fictícia, par… |
| `wc-gifts` | `wc-eligibility` | **0.6251** | 0.5102 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-payout` | `wc-appeal` | **0.6167** | 0.5238 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-gifts` | `wc-payout` | **0.5997** | 0.5221 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Um saque marcado como processado que ainda não aparece na conta bancár… |
| `wc-gifts` | `wc-live` | **0.5991** | 0.4806 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Se várias pessoas da mesma região relatarem a falha, encaminhe como po… |
| `wc-gifts` | `wc-login` | **0.5941** | 0.3995 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. |
| `wc-payout` | `wc-live` | **0.5902** | 0.4534 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Se várias pessoas da mesma região relatarem a falha, encaminhe como po… |
| `wc-live` | `wc-eligibility` | **0.5860** | 0.5363 | Se várias pessoas da mesma região relatarem a falha, encaminhe como po… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-live` | `wc-appeal` | **0.5778** | 0.5172 | Se a transmissão LIVE cai após alguns segundos ou perde o áudio apesar… ↔ Se um criador contestar uma medida de conteúdo ou restrição de LIVE, d… |
| `wc-security` | `wc-eligibility` | **0.5746** | 0.5004 | Uma possível invasão da conta exige análise especializada de Segurança… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-security` | `wc-live` | **0.5713** | 0.4709 | Oriente a pessoa a proteger o e-mail de recuperação usando um disposit… ↔ Se várias pessoas da mesma região relatarem a falha, encaminhe como po… |
| `wc-payout` | `wc-eligibility` | **0.5591** | 0.4788 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-payout` | `wc-security` | **0.5579** | 0.4471 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Uma possível invasão da conta exige análise especializada de Segurança… |
| `wc-login` | `wc-live` | **0.5410** | 0.4380 | Se o código não chega após a troca de telefone, trata-se de recuperaçã… ↔ Se a transmissão LIVE cai após alguns segundos ou perde o áudio apesar… |
| `wc-gifts` | `wc-appeal` | **0.5266** | 0.4766 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-gifts` | `wc-security` | **0.5216** | 0.4591 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Oriente a pessoa a proteger o e-mail de recuperação usando um disposit… |
| `wc-login` | `wc-eligibility` | **0.5209** | 0.4346 | Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-login` | `wc-appeal` | **0.4996** | 0.4442 | Para um problema comum de acesso à conta, use «Esqueci minha senha» e … ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-payout` | `wc-login` | **0.4911** | 0.3985 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Para um problema comum de acesso à conta, use «Esqueci minha senha» e … |

## fr

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.6017 · `wc-payout` 0.5708 · `wc-login` 0.6550 · `wc-security` 0.6056 · `wc-live` n/a · `wc-appeal` n/a · `wc-eligibility` 0.4600.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-payout` | `wc-eligibility` | **0.6402** | 0.3787 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-security` | `wc-appeal` | **0.6342** | 0.5548 | Demandez à la personne de sécuriser son adresse de récupération depuis… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-login` | `wc-security` | **0.6146** | 0.4003 | Ne demandez jamais le mot de passe ni le code. ↔ Ne révélez aucune modification et ne demandez aucun identifiant ni cod… |
| `wc-gifts` | `wc-payout` | **0.5873** | 0.4536 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… |
| `wc-security` | `wc-eligibility` | **0.5707** | 0.4022 | Demandez à la personne de sécuriser son adresse de récupération depuis… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-payout` | `wc-security` | **0.5701** | 0.4128 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Une suspicion de piratage du compte nécessite l’examen d’un spécialist… |
| `wc-gifts` | `wc-appeal` | **0.5618** | 0.4749 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-payout` | `wc-appeal` | **0.5074** | 0.4321 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-live` | `wc-eligibility` | **0.5072** | 0.4602 | Stabilité du LIVE : pour un problème de connexion isolé pendant un LIV… ↔ Conditions d’éligibilité au LIVE : dans cette simulation fictive, l’ac… |
| `wc-gifts` | `wc-security` | **0.5010** | 0.3845 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Une suspicion de piratage du compte nécessite l’examen d’un spécialist… |
| `wc-appeal` | `wc-eligibility` | **0.5005** | 0.4076 | L’équipe Confiance et sécurité examine le contenu et la décision d’ori… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-payout` | `wc-login` | **0.4748** | 0.3132 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Ne demandez jamais le mot de passe ni le code. |
| `wc-gifts` | `wc-eligibility` | **0.4530** | 0.3243 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-login` | `wc-eligibility` | **0.4413** | 0.3011 | Pour un problème de connexion courant, utilisez « Mot de passe oublié … ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-gifts` | `wc-login` | **0.3896** | 0.2878 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Un code qui n’arrive pas après un changement de téléphone relève de la… |
| `wc-login` | `wc-appeal` | **0.3825** | 0.3221 | Pour un problème de connexion courant, utilisez « Mot de passe oublié … ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-live` | `wc-appeal` | **0.3615** | 0.3615 | Stabilité du LIVE : pour un problème de connexion isolé pendant un LIV… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-login` | `wc-live` | **0.3153** | 0.2206 | Pour un problème de connexion courant, utilisez « Mot de passe oublié … ↔ Stabilité du LIVE : pour un problème de connexion isolé pendant un LIV… |
| `wc-payout` | `wc-live` | **0.3126** | 0.2347 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Stabilité du LIVE : pour un problème de connexion isolé pendant un LIV… |
| `wc-security` | `wc-live` | **0.2913** | 0.2771 | Ne révélez aucune modification et ne demandez aucun identifiant ni cod… ↔ Stabilité du LIVE : pour un problème de connexion isolé pendant un LIV… |
| `wc-gifts` | `wc-live` | **0.2467** | 0.2208 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Stabilité du LIVE : pour un problème de connexion isolé pendant un LIV… |

## Method notes

- Passages come from `buildCorpusPassages` (`packages/vector-store/src/chunk.ts`): each procedure's title, each summary sentence of at least 24 characters, and the escalation reason. 92 passages across 7 procedures.
- Similarity is the dot product of unit-length embeddings, which is cosine similarity.
- The language detector is a marker-word and diacritic score over a fixed vocabulary. It is deliberately reported with its unclassified count, and it is the one part of this report that is a heuristic rather than a measurement.
- Procedure titles (`${procedureIds.length} passages`) carry no language and fall into the unclassified count.

