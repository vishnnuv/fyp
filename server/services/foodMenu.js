// Fixed onboard food menu. Prices are static demo values — no inventory.
const FOOD_MENU = [
  { key: 'veg-meal', name: 'Veg Meal', price: 120 },
  { key: 'non-veg-meal', name: 'Non-Veg Meal', price: 160 },
  { key: 'sandwich', name: 'Sandwich', price: 60 },
  { key: 'tea-coffee', name: 'Tea/Coffee', price: 30 },
  { key: 'snacks-combo', name: 'Snacks Combo', price: 80 },
  { key: 'water-bottle', name: 'Water Bottle', price: 20 },
];

// [name, regex] — order matters: "non-veg" must be consumed before "veg".
const NAME_RULES = [
  ['Non-Veg Meal', /non[\s-]?veg(?:[\s-]?(?:meal|thali))?/i],
  ['Veg Meal', /\bveg(?:etable)?(?:[\s-]?(?:meal|thali))?|\bmeal\b|\bthali\b/i],
  ['Tea/Coffee', /\btea\b|\bcoffee\b|\bchai\b/i],
  ['Sandwich', /\bsandwich(?:es)?\b/i],
  ['Snacks Combo', /\bsnacks?\b|\bcombo\b|\bchaat\b/i],
  ['Water Bottle', /\bwater\b|\bbottle\b/i],
];

function menuIndexOf(name) {
  return FOOD_MENU.findIndex((item) => item.name === name);
}

// Accepts the UI payload ("food items: 1,3"), plain numbers ("2", "1 and 4"),
// "all", and free text ("veg meal and tea"). Returns menu indices.
function parseSelectedItems(message) {
  const raw = String(message || '').trim();
  if (!raw) return [];

  const canonical = raw.match(/^food items:\s*([0-9,\s]+)$/i);
  const picks = new Set();

  if (canonical) {
    canonical[1].split(/[^0-9]+/).filter(Boolean).forEach((value) => {
      const index = Number(value) - 1;
      if (index >= 0 && index < FOOD_MENU.length) picks.add(index);
    });
    return [...picks];
  }

  if (/\ball\b/i.test(raw)) return FOOD_MENU.map((_, index) => index);

  // Bare numbers / ordinals as menu positions.
  const numbers = raw.match(/\b\d{1,2}\b/g);
  const usedByText = NAME_RULES.some(([, rule]) => rule.test(raw));
  if (numbers && !usedByText) {
    numbers.forEach((value) => {
      const index = Number(value) - 1;
      if (index >= 0 && index < FOOD_MENU.length) picks.add(index);
    });
    if (picks.size) return [...picks];
  }

  // Free text: consume matched phrases so "non-veg meal" never yields both.
  let rest = raw;
  NAME_RULES.forEach(([name, rule]) => {
    if (rule.test(rest)) {
      rest = rest.replace(new RegExp(rule.source, rule.flags.replace('g', '') + 'g'), ' ');
      picks.add(menuIndexOf(name));
    }
  });
  return [...picks];
}

module.exports = { FOOD_MENU, parseSelectedItems };
