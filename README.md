# Cubi e Ombre

Gioco React (Vite) con tre modalità puzzle: Block Puzzle 3D, Incastro Perfetto, Tasselli Ruotati.
Salvataggio dei record e dei puzzle in corso su `localStorage` (nessun backend richiesto).

## Sviluppo locale

```bash
npm install
npm run dev
```

Apri l'indirizzo che stampa in console (di solito `http://localhost:5173`).

## Build di produzione

```bash
npm run build
npm run preview   # per testare la build in locale prima di pubblicarla
```

L'output va in `dist/`.

## Deploy: GitHub → Vercel

1. Crea un repository su GitHub e caricaci questa cartella (`node_modules` e `dist` sono già esclusi da `.gitignore`, non serve toccarli):
   ```bash
   git init
   git add .
   git commit -m "Cubi e Ombre"
   git branch -M main
   git remote add origin <URL_DEL_TUO_REPO>
   git push -u origin main
   ```
2. Su [vercel.com](https://vercel.com) → **Add New... → Project** → importa il repository appena creato.
3. Vercel riconosce automaticamente il framework **Vite**; le impostazioni corrette dovrebbero già essere precompilate:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Deploy. Ogni push su `main` farà un nuovo deploy automatico.

## Note tecniche

- Dipendenze reali usate dal gioco: `react`, `react-dom`, `three` (scena 3D), `tone` (audio), `lucide-react` (icone).
- Tutto il CSS è incorporato nel componente stesso (iniettato via `<style>`), non servono fogli di stile esterni.
- Il bundle di produzione supera i 500kB principalmente per `three.js`: è normale per un gioco con rendering 3D e non impedisce il deploy.
