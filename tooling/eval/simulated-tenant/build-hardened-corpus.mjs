#!/usr/bin/env node
/**
 * Build a more discriminative, still-fictional corpus for the Phase 5 probe.
 * This does not modify the base corpus or any shipped tenant policy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, 'corpus-phase5-baseline.json');
const outputPath = resolve(here, 'corpus-phase5-hardened.json');
const corpus = JSON.parse(readFileSync(sourcePath, 'utf8'));
if (corpus.data_mode !== 'simulated' || !Array.isArray(corpus.sops)) {
  throw new Error('Phase 5 source corpus must be explicitly simulated');
}

const additions = {
  'wc-gifts': [
    'WaveCast Coins and Gifts remain an in-app purchase balance; they are not a creator payout, bank withdrawal, or deposit.',
    'Las Monedas y los Regalos de WaveCast permanecen como saldo de compras dentro de la aplicación; no son un pago al creador ni un depósito bancario.',
    'As Moedas e os Presentes do WaveCast são um saldo de compra dentro do aplicativo; não são um saque do criador nem um depósito bancário.',
    'Les pièces et les cadeaux WaveCast restent un solde d’achat dans l’application ; ce n’est ni un versement au créateur ni un dépôt bancaire.',
  ],
  'wc-payout': [
    'A creator payout is a bank transfer to the masked destination, not Coins, Gifts, or another in-app purchase balance.',
    'Un pago al creador es una transferencia bancaria al destino enmascarado, no un saldo de Monedas, Regalos ni otra compra dentro de la aplicación.',
    'Um pagamento ao criador é uma transferência bancária para o destino mascarado, não um saldo de Moedas, Presentes ou outra compra no aplicativo.',
    'Un versement au créateur est un transfert bancaire vers le compte de destination masqué, et non un solde de pièces, de cadeaux ou un achat dans l’application.',
  ],
};

let changed = 0;
for (const sop of corpus.sops) {
  if (sop.data_mode !== 'simulated') {
    throw new Error(`SOP ${sop.id} is missing data_mode: "simulated"`);
  }
  if (Object.hasOwn(additions, sop.id)) {
    sop.summary = `${sop.summary} ${(additions[sop.id]).join(' ')}`;
    changed += 1;
  }
  if (sop.id === 'wc-live') {
    const replacements = [
      [', not an eligibility or access question.', '.'],
      [', no de elegibilidad.', '.'],
      [', não de elegibilidade.', '.'],
      [', pas d’une question d’éligibilité.', '.'],
    ];
    for (const [from, to] of replacements) {
      if (sop.summary.includes(from)) {
        sop.summary = sop.summary.replace(from, to);
        changed += 1;
      }
    }
  }
}

if (changed !== 6) {
  throw new Error(`expected six focused Phase 5 corpus edits, observed ${changed}`);
}

writeFileSync(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);
process.stdout.write(`SIMULATED DATA | wrote ${outputPath} from the preserved baseline corpus\n`);
