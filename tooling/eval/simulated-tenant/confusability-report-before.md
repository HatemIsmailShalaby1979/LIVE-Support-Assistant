# Confusability report — procedure pairs per language

**data_mode: "simulated".** Read-only corpus geometry. No procedure was modified and no query was run.

Corpus: `tooling/eval/simulated-tenant/corpus.json` — 7 procedures, 92 passages, SHA-256 `e9e058685d255b24…`
Embedding: Xenova/all-MiniLM-L6-v2 (751bff37182d3f1213fa05d7196b954e230abad9, q8).

## How to read this

For each pair of procedures and each language, the table reports the **highest cosine similarity between any passage of one and any passage of the other**. That is the best-case route by which a single query could bring the two level, which is what makes a pair a risk for a low gate margin. The `own` columns give the same procedure's highest similarity between two of its *own* passages, as a reference: a pair whose cross-similarity approaches that level is as close to its neighbour as it is to itself.

This measures corpus geometry, not query behaviour. A high value means a pair *can* be confused; whether it is confused in practice is measured by running the batch, not here.

**Language attribution.** 85 of 92 passages were classified; 7 were not (7.6%) and are excluded from the tables below rather than guessed at.

## Top 5 riskiest pairs, all languages

| Rank | Language | Procedure A | Procedure B | Max similarity | Mean similarity | Passages compared |
|---:|---|---|---|---:|---:|---:|
| 1 | es | `wc-gifts` | `wc-payout` | **0.6704** | 0.5128 | 9 |
| 2 | pt-BR | `wc-login` | `wc-security` | **0.6636** | 0.5013 | 9 |
| 3 | es | `wc-security` | `wc-appeal` | **0.6584** | 0.4622 | 9 |
| 4 | fr | `wc-security` | `wc-appeal` | **0.6459** | 0.5597 | 3 |
| 5 | es | `wc-payout` | `wc-live` | **0.6407** | 0.4052 | 12 |

## en

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.5895 · `wc-payout` 0.7008 · `wc-login` 0.6250 · `wc-security` 0.2849 · `wc-live` 0.6965 · `wc-appeal` 0.7391 · `wc-eligibility` 0.4170.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-login` | `wc-security` | **0.6319** | 0.4295 | Never ask a customer to send a password, one-time code, or recovery li… ↔ Direct the customer to secure the recovery email from a trusted device… |
| `wc-appeal` | `wc-eligibility` | **0.5574** | 0.3019 | Content and LIVE restriction appeals require Trust & Safety review. ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-live` | `wc-eligibility` | **0.5010** | 0.2800 | If several creators report the same regional failure, route it as a po… ↔ Region availability can change. |
| `wc-login` | `wc-live` | **0.4808** | 0.2192 | For a routine login problem, use Forgot password on the sign-in screen… ↔ For an isolated LIVE connection problem, confirm app version and netwo… |
| `wc-gifts` | `wc-payout` | **0.4367** | 0.2990 | A duplicate charge or a purchase the account holder did not authorize … ↔ Ask the creator to confirm the payout date and masked destination deta… |
| `wc-payout` | `wc-security` | **0.4308** | 0.1824 | Ask the creator to confirm the payout date and masked destination deta… ↔ Do not disclose account changes or ask the customer to share credentia… |
| `wc-gifts` | `wc-security` | **0.3842** | 0.2148 | A duplicate charge or a purchase the account holder did not authorize … ↔ Do not disclose account changes or ask the customer to share credentia… |
| `wc-login` | `wc-eligibility` | **0.3800** | 0.1795 | Never ask a customer to send a password, one-time code, or recovery li… ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-gifts` | `wc-eligibility` | **0.3785** | 0.1212 | A duplicate charge or a purchase the account holder did not authorize … ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-live` | `wc-appeal` | **0.3777** | 0.1795 | Do not ask the creator to repeatedly restart a scheduled broadcast. ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-gifts` | `wc-login` | **0.3696** | 0.1719 | A duplicate charge or a purchase the account holder did not authorize … ↔ A recovery code that does not arrive after a phone change, or a passwo… |
| `wc-payout` | `wc-login` | **0.3637** | 0.1245 | Ask the creator to confirm the payout date and masked destination deta… ↔ Never ask a customer to send a password, one-time code, or recovery li… |
| `wc-gifts` | `wc-appeal` | **0.3605** | 0.1184 | A duplicate charge or a purchase the account holder did not authorize … ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-security` | `wc-eligibility` | **0.3485** | 0.1775 | Direct the customer to secure the recovery email from a trusted device… ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-security` | `wc-live` | **0.3329** | 0.1589 | Direct the customer to secure the recovery email from a trusted device… ↔ If several creators report the same regional failure, route it as a po… |
| `wc-payout` | `wc-eligibility` | **0.3142** | 0.1604 | Ask the creator to confirm the payout date and masked destination deta… ↔ If all checks appear satisfied but the LIVE control is absent, route t… |
| `wc-security` | `wc-appeal` | **0.2882** | 0.1677 | Direct the customer to secure the recovery email from a trusted device… ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-login` | `wc-appeal` | **0.2725** | 0.0935 | Check that the recovery email or phone is still available and install … ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-gifts` | `wc-live` | **0.2625** | 0.0649 | A duplicate charge or a purchase the account holder did not authorize … ↔ If several creators report the same regional failure, route it as a po… |
| `wc-payout` | `wc-appeal` | **0.2580** | 0.0988 | Ask the creator to confirm the payout date and masked destination deta… ↔ A creator who disputes a content action or LIVE restriction should ope… |
| `wc-payout` | `wc-live` | **0.2208** | 0.1241 | Ask the creator to confirm the payout date and masked destination deta… ↔ Do not ask the creator to repeatedly restart a scheduled broadcast. |

## es

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.6797 · `wc-payout` 0.6830 · `wc-login` 0.6654 · `wc-security` 0.6304 · `wc-live` 0.5601 · `wc-appeal` 0.4517 · `wc-eligibility` 0.6352.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-gifts` | `wc-payout` | **0.6704** | 0.5128 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Un pago marcado como procesado que aún no aparece en la cuenta bancari… |
| `wc-security` | `wc-appeal` | **0.6584** | 0.4622 | Un posible acceso no autorizado requiere una revisión especializada de… ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-payout` | `wc-live` | **0.6407** | 0.4052 | Si han pasado más de siete días hábiles, remite el caso a Pagos. ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-security` | `wc-live` | **0.6265** | 0.4016 | Indica a la persona que proteja el correo de recuperación desde un dis… ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-live` | `wc-eligibility` | **0.6190** | 0.4502 | Si varias personas de la misma región notifican el problema, remítelo … ↔ En esta simulación ficticia, para acceder a LIVE la persona debe tener… |
| `wc-security` | `wc-eligibility` | **0.6115** | 0.5179 | Un posible acceso no autorizado requiere una revisión especializada de… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-payout` | `wc-eligibility` | **0.5928** | 0.5149 | Si han pasado más de siete días hábiles, remite el caso a Pagos. ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-login` | `wc-security` | **0.5829** | 0.4816 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Indica a la persona que proteja el correo de recuperación desde un dis… |
| `wc-gifts` | `wc-eligibility` | **0.5724** | 0.4973 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-appeal` | `wc-eligibility` | **0.5720** | 0.4721 | Si un creador no está de acuerdo con una medida sobre el contenido o u… ↔ Si cumple todos los requisitos pero no aparece el botón LIVE, remite e… |
| `wc-payout` | `wc-security` | **0.5546** | 0.4562 | Un pago marcado como procesado que aún no aparece en la cuenta bancari… ↔ Indica a la persona que proteja el correo de recuperación desde un dis… |
| `wc-gifts` | `wc-live` | **0.5518** | 0.4370 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-gifts` | `wc-login` | **0.5479** | 0.4576 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Comprueba que todavía tienes acceso al correo o teléfono de recuperaci… |
| `wc-live` | `wc-appeal` | **0.5348** | 0.4001 | Si varias personas de la misma región notifican el problema, remítelo … ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-gifts` | `wc-security` | **0.5273** | 0.4377 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Indica a la persona que proteja el correo de recuperación desde un dis… |
| `wc-login` | `wc-appeal` | **0.5225** | 0.3743 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-login` | `wc-live` | **0.5131** | 0.4104 | Para un problema habitual de inicio de sesión, usa «Olvidé mi contrase… ↔ Si varias personas de la misma región notifican el problema, remítelo … |
| `wc-payout` | `wc-login` | **0.4952** | 0.4272 | Un pago marcado como procesado que aún no aparece en la cuenta bancari… ↔ Comprueba que todavía tienes acceso al correo o teléfono de recuperaci… |
| `wc-login` | `wc-eligibility` | **0.4829** | 0.4396 | Comprueba que todavía tienes acceso al correo o teléfono de recuperaci… ↔ En esta simulación ficticia, para acceder a LIVE la persona debe tener… |
| `wc-payout` | `wc-appeal` | **0.4675** | 0.3844 | Un pago marcado como procesado que aún no aparece en la cuenta bancari… ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |
| `wc-gifts` | `wc-appeal` | **0.4634** | 0.3582 | Si el recibo confirma la compra pero las monedas aún no aparecen, comp… ↔ Confianza y Seguridad revisa el contenido y la decisión originales; so… |

## pt-BR

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.5349 · `wc-payout` 0.6214 · `wc-login` 0.6642 · `wc-security` 0.5601 · `wc-live` 0.6908 · `wc-appeal` 0.6654 · `wc-eligibility` 0.6191.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-login` | `wc-security` | **0.6636** | 0.5013 | Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. ↔ Oriente a pessoa a proteger o e-mail de recuperação usando um disposit… |
| `wc-gifts` | `wc-eligibility` | **0.6402** | 0.5143 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-security` | `wc-appeal` | **0.6267** | 0.5141 | Uma possível invasão da conta exige análise especializada de Segurança… ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-payout` | `wc-appeal` | **0.6266** | 0.5575 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-appeal` | `wc-eligibility` | **0.6146** | 0.5786 | Se um criador contestar uma medida de conteúdo ou restrição de LIVE, d… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-gifts` | `wc-payout` | **0.6070** | 0.5541 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Um saque marcado como processado que ainda não aparece na conta bancár… |
| `wc-live` | `wc-appeal` | **0.6052** | 0.5453 | Para um problema isolado de conexão durante uma transmissão LIVE, conf… ↔ Se um criador contestar uma medida de conteúdo ou restrição de LIVE, d… |
| `wc-gifts` | `wc-live` | **0.5995** | 0.5084 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Se várias pessoas da mesma região relatarem a falha, encaminhe como po… |
| `wc-live` | `wc-eligibility` | **0.5958** | 0.5719 | Para um problema isolado de conexão durante uma transmissão LIVE, conf… ↔ Nesta simulação fictícia, para acessar o LIVE a pessoa precisa ter pel… |
| `wc-payout` | `wc-eligibility` | **0.5950** | 0.5590 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Nesta simulação fictícia, para acessar o LIVE a pessoa precisa ter pel… |
| `wc-gifts` | `wc-login` | **0.5892** | 0.3970 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. |
| `wc-payout` | `wc-live` | **0.5884** | 0.5451 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Se várias pessoas da mesma região relatarem a falha, encaminhe como po… |
| `wc-security` | `wc-eligibility` | **0.5825** | 0.5171 | Uma possível invasão da conta exige análise especializada de Segurança… ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-security` | `wc-live` | **0.5762** | 0.5064 | Oriente a pessoa a proteger o e-mail de recuperação usando um disposit… ↔ Se várias pessoas da mesma região relatarem a falha, encaminhe como po… |
| `wc-payout` | `wc-security` | **0.5641** | 0.5199 | Um saque marcado como processado que ainda não aparece na conta bancár… ↔ Uma possível invasão da conta exige análise especializada de Segurança… |
| `wc-login` | `wc-live` | **0.5451** | 0.4719 | Se o código não chega após a troca de telefone, trata-se de recuperaçã… ↔ Se a transmissão LIVE cai após alguns segundos ou perde o áudio apesar… |
| `wc-gifts` | `wc-appeal` | **0.5383** | 0.4789 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-login` | `wc-eligibility` | **0.5201** | 0.4573 | Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. ↔ Se todos os requisitos forem atendidos, mas o botão LIVE não aparecer,… |
| `wc-gifts` | `wc-security` | **0.5189** | 0.4568 | Se o recibo confirma a compra, mas as Moedas ainda não aparecem, verif… ↔ Oriente a pessoa a proteger o e-mail de recuperação usando um disposit… |
| `wc-login` | `wc-appeal` | **0.5075** | 0.4421 | Para um problema comum de acesso à conta, use «Esqueci minha senha» e … ↔ Confiança e Segurança analisa o conteúdo e a decisão originais; o supo… |
| `wc-payout` | `wc-login` | **0.4931** | 0.4652 | Um pagamento padrão ao criador pode levar de dois a cinco dias úteis d… ↔ Confirme se ainda tem acesso ao e-mail ou telefone de recuperação. |

## fr

Within-procedure reference (highest similarity between two passages of the same procedure): `wc-gifts` 0.6460 · `wc-payout` 0.5788 · `wc-login` 0.6622 · `wc-security` 0.6115 · `wc-live` 0.5553 · `wc-appeal` n/a · `wc-eligibility` 0.3684.

| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |
|---|---|---:|---:|---|
| `wc-security` | `wc-appeal` | **0.6459** | 0.5597 | Demandez à la personne de sécuriser son adresse de récupération depuis… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-payout` | `wc-eligibility` | **0.6380** | 0.4399 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-login` | `wc-security` | **0.6235** | 0.4012 | Ne demandez jamais le mot de passe ni le code. ↔ Ne révélez aucune modification et ne demandez aucun identifiant ni cod… |
| `wc-payout` | `wc-security` | **0.5844** | 0.4525 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Une suspicion de piratage du compte nécessite l’examen d’un spécialist… |
| `wc-gifts` | `wc-payout` | **0.5811** | 0.5206 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… |
| `wc-gifts` | `wc-appeal` | **0.5672** | 0.5158 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-security` | `wc-eligibility` | **0.5655** | 0.4085 | Une suspicion de piratage du compte nécessite l’examen d’un spécialist… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-gifts` | `wc-security` | **0.5135** | 0.4122 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Une suspicion de piratage du compte nécessite l’examen d’un spécialist… |
| `wc-payout` | `wc-appeal` | **0.5098** | 0.4659 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-live` | `wc-eligibility` | **0.4996** | 0.4482 | Un LIVE qui se déconnecte après quelques secondes ou perd le son malgr… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-appeal` | `wc-eligibility` | **0.4935** | 0.4108 | L’équipe Confiance et sécurité examine le contenu et la décision d’ori… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-payout` | `wc-login` | **0.4696** | 0.3413 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Ne demandez jamais le mot de passe ni le code. |
| `wc-live` | `wc-appeal` | **0.4643** | 0.4147 | Pour un problème de connexion isolé pendant un LIVE, vérifiez la versi… ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-login` | `wc-eligibility` | **0.4464** | 0.3199 | Pour un problème de connexion courant, utilisez « Mot de passe oublié … ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-gifts` | `wc-eligibility` | **0.4395** | 0.3723 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Si toutes les conditions semblent réunies mais que le bouton LIVE est … |
| `wc-payout` | `wc-live` | **0.4259** | 0.3487 | Après plus de sept jours ouvrés, transmettez le dossier à l’équipe Pai… ↔ Pour un problème de connexion isolé pendant un LIVE, vérifiez la versi… |
| `wc-login` | `wc-live` | **0.4190** | 0.2719 | Pour un problème de connexion courant, utilisez « Mot de passe oublié … ↔ Un LIVE qui se déconnecte après quelques secondes ou perd le son malgr… |
| `wc-login` | `wc-appeal` | **0.4116** | 0.3269 | Pour un problème de connexion courant, utilisez « Mot de passe oublié … ↔ L’équipe Confiance et sécurité examine le contenu et la décision d’ori… |
| `wc-security` | `wc-live` | **0.4115** | 0.3508 | Une suspicion de piratage du compte nécessite l’examen d’un spécialist… ↔ Un LIVE qui se déconnecte après quelques secondes ou perd le son malgr… |
| `wc-gifts` | `wc-login` | **0.3962** | 0.3124 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Un code qui n’arrive pas après un changement de téléphone relève de la… |
| `wc-gifts` | `wc-live` | **0.3282** | 0.3003 | Si le reçu confirme l’achat mais que les pièces ne sont pas encore cré… ↔ Pour un problème de connexion isolé pendant un LIVE, vérifiez la versi… |

## Method notes

- Passages come from `buildCorpusPassages` (`packages/vector-store/src/chunk.ts`): each procedure's title, each summary sentence of at least 24 characters, and the escalation reason. 92 passages across 7 procedures.
- Similarity is the dot product of unit-length embeddings, which is cosine similarity.
- The language detector is a marker-word and diacritic score over a fixed vocabulary. It is deliberately reported with its unclassified count, and it is the one part of this report that is a heuristic rather than a measurement.
- Procedure titles (`${procedureIds.length} passages`) carry no language and fall into the unclassified count.

