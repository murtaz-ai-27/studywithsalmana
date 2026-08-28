import { useState, useEffect } from "react";
const KEY = "salmana_v2_cards";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const save = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };

export function useCards() {
  const [cards, setCards] = useState(load);
  useEffect(() => save(cards), [cards]);
  return {
    cards,
    addCards: (nc) => setCards(p => [...p, ...nc]),
    addCard: (f, b) => setCards(p => [...p, { front: f, back: b }]),
    deleteCard: (i) => setCards(p => p.filter((_, j) => j !== i)),
    shuffle: () => setCards(p => { const a=[...p]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }),
    clearAll: () => setCards([]),
  };
}
