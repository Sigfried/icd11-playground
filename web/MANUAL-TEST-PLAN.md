# Manual Test Plan for ICD-11 Visual Maintenance Tool

## Prerequisites

- Docker API running:
  ```bash
  docker run -p 80:80 -e acceptLicense=true -e include=2024-01_en whoicd/icd-api
  ```
- Dev server running:
  ```bash
  cd web && pnpm dev
  ```
- Open http://localhost:5173

---

## 1. Initial Load

- [ ] App loads without console errors
- [ ] Header shows "ICD-11 Foundation Explorer"
- [ ] TreeView shows "ICD-11 Foundation" root node (auto-expanded)
- [ ] Root's children (chapters) are visible below it
- [ ] Chapters show `[N↓]` badges (child counts)

## 2. TreeView Navigation

- [ ] Click expand arrow (▶) on a chapter → children load and appear
- [ ] Arrow changes to ▼ when expanded
- [ ] Click ▼ → collapses, hides children
- [ ] Nodes with multiple parents show `[N↑]` badge (may need to drill down to find one)
- [ ] Loading shows `⋯` indicator while fetching

## 3. Node Selection

- [ ] Click a node title → node highlights (blue background)
- [ ] DetailPanel updates to show that node's info
- [ ] NodeLinkView updates to show neighborhood

## 4. DetailPanel

- [ ] Shows title (yellow) and definition (if available)
- [ ] Shows entity ID
- [ ] "View in Foundation Browser" link works (opens WHO site)
- [ ] Click "Parents" header → expands to show parent list
- [ ] Click "Children" header → expands to show child list
- [ ] Click a parent/child in list → selects that node (all panels update)
- [ ] "Load more" button appears if not all parents/children loaded

## 5. NodeLinkView

- [ ] Shows selected node (yellow border) in center-ish
- [ ] Parents appear above, children below (hierarchical layout)
- [ ] Edges connect nodes with orthogonal lines
- [ ] Badges (`[N↑]`, `[N↓]`) appear on nodes
- [ ] Click a node → selects it (TreeView selection changes too)
- [ ] "Expand neighborhood" button loads more connections

## 6. Cross-Panel Sync

- [ ] Select in TreeView → DetailPanel + NodeLinkView update
- [ ] Click in NodeLinkView → TreeView selection updates (may need to expand to see it)
- [ ] Click in DetailPanel parent/child list → all panels update

## 7. Edge Cases

- [ ] Select root node → NodeLinkView shows root + children (no parents)
- [ ] Deep navigation still works (expand 3-4 levels deep)
- [ ] Rapid clicking doesn't break anything

---

## Test Entities

If you want to test specific entities:

| Entity | Path | ID |
|--------|------|-----|
| Cholera | Chapters → "01 Certain infectious..." → Cholera | 257068234 |
| Diabetes | Chapters → "05 Endocrine..." → Diabetes mellitus | 1217915084 |
