# Test Plan for ICD-11 Visual Maintenance Tool

## Test Coverage Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Automated (Playwright e2e) |
| 🧪 | Automated (vitest unit) |
| 👁️ | Manual only (visual/subjective) |

---

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

## Running Automated Tests

```bash
# Unit tests (no server needed)
pnpm test:run

# E2E tests (requires Docker API + dev server)
pnpm test:e2e
```

---

## 1. Initial Load

- [ ] ✅ App loads without console errors
- [ ] ✅ Header shows "ICD-11 Foundation Explorer"
- [ ] ✅ TreeView shows "WHO Family of International Classifications Foundation" root node (auto-expanded)
- [ ] ✅ Root's children are visible below it
- [ ] ✅ Children show `↓` badges (child counts)

## 2. TreeView Navigation

- [ ] ✅ Click expand arrow (▶) on a node → children load and appear
- [ ] ✅ Arrow changes to ▼ when expanded
- [ ] ✅ Click ▼ → collapses, hides children
- [ ] ✅ Nodes with multiple parents show `↑` badge
- [ ] 👁️ Loading shows `⋯` indicator while fetching (timing-dependent)
- [ ] ✅ 🧪 **Child order matches WHO Foundation browser** - compare with https://icd.who.int/browse/2025-01/foundation/en

## 3. Node Selection

- [ ] ✅ Click a node title → node highlights (selected class)
- [ ] ✅ DetailPanel updates to show that node's info
- [ ] ✅ NodeLinkView updates to show neighborhood

## 4. DetailPanel

- [ ] ✅ Shows title and definition (if available)
- [ ] ✅ Shows entity ID
- [ ] ✅ "View in Foundation Browser" link has correct URL
- [ ] 👁️ Link actually opens WHO site (requires manual click-through)
- [ ] ✅ Click "Parents" header → expands to show parent list
- [ ] ✅ Click "Children" header → expands to show child list
- [ ] ✅ Click a parent/child in list → selects that node (all panels update)
- [ ] ✅ "Load more" button appears if not all parents/children loaded

## 5. NodeLinkView

- [ ] ✅ Shows selected node (focus class)
- [ ] 👁️ Parents appear above, children below (visual layout check)
- [ ] 👁️ Edges connect nodes with orthogonal lines (visual)
- [ ] ✅ Badges (`↑`, `↓`) appear on nodes with multiple parents/children
- [ ] ✅ Click a node → selects it (DetailPanel updates)
- [ ] ✅ "Expand neighborhood" button is present

## 6. Cross-Panel Sync

- [ ] ✅ Select in TreeView → DetailPanel + NodeLinkView update
- [ ] ✅ Click in NodeLinkView → DetailPanel updates
- [ ] ✅ Click in DetailPanel parent/child list → all panels update

## 7. Edge Cases

- [ ] ✅ Select root node → NodeLinkView shows root + children (no parents)
- [ ] ✅ Deep navigation still works (expand 3+ levels deep)
- [ ] 👁️ Rapid clicking doesn't break anything (stress test)

---

## Test Entities

| Entity | Path | ID |
|--------|------|-----|
| Cholera | ICD Entity → ICD Category → "Certain infectious..." → Cholera | 257068234 |
| Diabetes | ICD Entity → ICD Category → "Endocrine..." → Diabetes mellitus | 1217915084 |
| Multi-parent example | (find node with `↑` badge) | varies |

---

## Unit Tests (vitest)

Located in `src/**/*.test.ts`:

- `GraphProvider.test.ts` - Child ordering logic
  - Preserves API order when filtering loaded children
  - Handles partially loaded children
  - Handles empty/all children loaded

## E2E Tests (Playwright)

Located in `e2e/`:

- `app.spec.ts` - Main application tests
  - Initial load and structure (header, panels visible)
  - API integration (children load with correct order)
  - Deep navigation (expand to ICD Category level)

**Note:** Node selection and cross-panel sync tests are currently skipped pending
addition of `data-testid` attributes for more stable element selection.
