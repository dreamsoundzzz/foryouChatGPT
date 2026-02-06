# ASCII Town Survival

Minimalistická 2D textová stratégia v JavaScripte s realtime ASCII renderom.
Projekt je základný prototyp town simulatora so simuláciou potrieb obyvateľov,
ekonomiky, stavieb, obrany a extrémne zriedkavých eventov.

## Spustenie

Stačí otvoriť `index.html` v prehliadači.

## Herné mechaniky (prototyp)

- Realtime ASCII render scény s obyvateľmi (role: farmár `ƒ`, stráž `¤`, staviteľ `ß`).
- Potreby obyvateľov: jedlo, spánok, socializácia.
- Rutiny: jedlo, pohyb po mape, rozhovory, vzťahy, pracovné úlohy.
- Spontánne rozhovory a bubliny s textom nad NPC.
- Pamäť NPC: postavy si ukladajú udalosti a môžu na ne neskôr spomínať.
- Ekonomika: drevo, jedlo, mince, morálka, obrana.
- Stavby: domy, farmy, strážne veže + plánovanie s grid snap.
- Hrozby + rare eventy (max ~1 event za 100 hodín).

## Ďalšie kroky

- Systém pracovných rolí (farmár, stráž, staviteľ).
- Detailné plánovanie mesta a grid snap budov.
- Questy a komplexnejšia diplomacia medzi obyvateľmi.
