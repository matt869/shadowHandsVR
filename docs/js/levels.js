// The 10 Story levels + the first-launch tutorial. Masks/overlays live in assets/sil/.
// Thresholds: 0.65 for 1-3, 0.70 for 4-7, 0.75 for 8-10. Shapes 1-6 one hand, 7-10 two hands.
export const LEVELS = [
  { file: '01_bird',     name: 'Bird',     hint: 'Flat hand sideways, thumb up for the crest',          thr: 0.65, motion: 'flapAway', sfx: 'sfx_bird' },
  { file: '02_rabbit',   name: 'Rabbit',   hint: 'Two fingers up for ears, curl the rest',              thr: 0.65, motion: 'hop',      sfx: 'sfx_rabbit' },
  { file: '03_dog',      name: 'Dog',      hint: 'Fingers forward, drop your pinky for the jaw',        thr: 0.65, motion: 'bark',     sfx: 'sfx_dog' },
  { file: '04_snail',    name: 'Snail',    hint: 'Make a fist, two fingers forward for feelers',        thr: 0.70, motion: 'crawl',    sfx: 'sfx_snail' },
  { file: '05_swan',     name: 'Swan',     hint: 'Arm up, bend your wrist down, fingers together',      thr: 0.70, motion: 'glide',    sfx: 'sfx_swan' },
  { file: '06_wolf',     name: 'Wolf',     hint: 'Like the dog, but open the jaw wide',                 thr: 0.70, motion: 'howl',     sfx: 'sfx_wolf' },
  { file: '07_deer',     name: 'Deer',     hint: 'Two hands: spread your fingers up for antlers',       thr: 0.70, motion: 'walkOff',  sfx: 'sfx_deer' },
  { file: '08_elephant', name: 'Elephant', hint: 'Two hands: palms out for ears, one arm as the trunk', thr: 0.75, motion: 'spray',    sfx: 'sfx_elephant' },
  { file: '09_crab',     name: 'Crab',     hint: 'Two hands: wrists together, fingers up as claws',     thr: 0.75, motion: 'scuttle',  sfx: 'sfx_crab' },
  { file: '10_dragon',   name: 'Dragon',   hint: 'Two hands: one open jaw, one spread-finger wing',     thr: 0.75, motion: 'fire',     sfx: 'sfx_dragon' },
];

export const TUTORIAL = {
  ...LEVELS[0], name: 'Your first shadow', hint: 'Put your hand between the lamp and the wall', thr: 0.55,
};

/** Same puzzle for everyone on a given day; changes at local midnight. Matches the Unity version. */
export function dailyIndex(count, date = new Date()) {
  if (count <= 0) return -1;
  const d0 = Date.UTC(2026, 0, 1);
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((d - d0) / 86400000);
  const h = Math.imul(days, 2654435761) >>> 0;   // Knuth multiplicative hash, uint32
  return h % count;
}
