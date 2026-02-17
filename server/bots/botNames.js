/**
 * Bot Name Generator
 * Produces unique, trading-themed display names for bot players.
 */

const ADJECTIVES = [
  'Swift', 'Clever', 'Bold', 'Sharp', 'Keen',
  'Rapid', 'Savvy', 'Nimble', 'Wily', 'Astute',
  'Brisk', 'Sly', 'Crafty', 'Agile', 'Deft'
];

const NOUNS = [
  'Trader', 'Dealer', 'Broker', 'Merchant', 'Agent',
  'Vendor', 'Bidder', 'Quant', 'Arb', 'Hawk'
];

const usedNames = new Set();

function generateBotName() {
  // Try every adj+noun combination in shuffled order
  const adjs = [...ADJECTIVES].sort(() => Math.random() - 0.5);
  const nouns = [...NOUNS].sort(() => Math.random() - 0.5);

  for (const adj of adjs) {
    for (const noun of nouns) {
      const name = `${adj} ${noun}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
  }

  // Fallback: numbered bot
  const name = `Bot ${usedNames.size + 1}`;
  usedNames.add(name);
  return name;
}

function resetBotNames() {
  usedNames.clear();
}

module.exports = { generateBotName, resetBotNames };
