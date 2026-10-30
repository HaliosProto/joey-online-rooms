export function validateDeck(deck,catalog){
 const cards=new Map(catalog.cards.map(c=>[c.id,c]));
 if(!deck||!Array.isArray(deck.main)||!Array.isArray(deck.extra)||deck.main.length<40||deck.main.length>60||deck.extra.length>60)throw Error('Use 40–60 cards in the main deck.');
 const counts=new Map();for(const code of [...deck.main,...deck.extra]){if(!Number.isInteger(code)||!cards.has(code))throw Error('This deck contains an unavailable card.');counts.set(code,(counts.get(code)||0)+1);if(counts.get(code)>3)throw Error('Use at most three copies of a card.');}
 if(deck.main.some(code=>cards.get(code).kind==='fusion')||deck.extra.some(code=>cards.get(code).kind!=='fusion'))throw Error('Put Fusion monsters in the Fusion deck.');
 return {main:[...deck.main],extra:[...deck.extra]};
}
