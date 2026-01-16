# Open Questions
## Exploration Tasks  (Claude suggestions)
### Phase 1: API Familiarity
- [x] Fetch a few entities (Cholera: 257068234, Breast cancer: 254546711)
- [ ] Compare Foundation vs MMS representations of the same concept
  - Foundation: `f 257068234` (Cholera)
  - MMS: `m 1A00` (Cholera)
  - Compare the JSON side-by-side; note `source` property in MMS pointing back to Foundation
- [ ] Understand what properties are available and how they're structured
  - See: [ICD-11 API Reference](https://icd.who.int/icdapi/docs2/ICDAPI-EntityEndpoint/)
### Phase 2: Hierarchy Understanding
- [ ] Navigate parent/child relationships
  - Use `parent` and `child` arrays in entity responses
- [ ] Find an entity with multiple Foundation parents, see how it linearizes to one MMS parent
  - Try: "Diabetic nephropathy" - child of both Diabetes and Kidney diseases in Foundation
  - Browser: [Foundation polyhierarchy example](https://icd.who.int/browse/2025-01/foundation/en)
- [ ] Explore "gray children" (foundationChildElsewhere)
  - These are children that exist in Foundation but are placed elsewhere in MMS
  - Look for `foundationChildElsewhere` property in MMS entity responses
### Phase 3: Postcoordination
- [ ] Find entities with postcoordinationScale
  - Try breast cancer (2C6Y) - has histopathology, laterality axes
  - `p 2C6Y` in REPL to see postcoordination spec
- [ ] Understand which axes are required vs optional
  - Look for `requiredPostcoordination` property
  - Paper: [[mabon-2022-postcoordination]]
- [ ] Explore Chapter X extension codes and how they relate to stem codes
  - Extension codes root: `f 1920852714`
  - Paper: [[drosler-2021-extension-codes]]
### Phase 4: Search and Discovery
- [ ] Use the search endpoint to find entities
  - `s <term>` in REPL
  - [Search API docs](https://icd.who.int/icdapi/docs2/ICDAPI-Search/)
- [ ] Understand code lookup vs entity lookup
  - Code lookup: `/icd/release/11/2024-01/mms/codeinfo/<code>`
  - Entity lookup: `/icd/entity/<id>` (Foundation) or `/icd/release/11/2024-01/mms/<id>` (MMS)
- [ ] Try the ECT components (Coding Tool and Browser)
  - [ECT Documentation](https://icd.who.int/icdapi/docs2/SupportedClassifications/)
  - Will be embedded in React app

## Questions

### [sg] questions
- **Understanding ICD-11 nomenclature**
	- [ ] What does "*Exclusions from above levels*" mean?
		- e.g., [Foundation browser --> breast cancer](https://icd.who.int/browse/2025-01/foundation/en#1047754165) ![[Pasted image 20251219085834.png]]
### API & Data Model
- [ ] How does the `source` property work when an MMS entity maps to multiple Foundation entities?
  - Explore: Find an MMS residual category (e.g., "Other specified...") and check its `source`
- [ ] What's the difference between `foundationChildElsewhere` and regular `child` relationships?
  - `child` = direct children in this linearization
  - `foundationChildElsewhere` = Foundation children that appear elsewhere in MMS hierarchy
- [ ] How are "gray children" determined in the MMS linearization?
  - Paper: [[chute-celik-2022-architecture]] discusses linearization rules

### Postcoordination
- [ ] Which postcoordination axes are mandatory vs optional for different entity types?
  - Check `requiredPostcoordination` in entity response
  - Paper: [[mabon-2022-postcoordination]]
- [ ] How do extension codes (Chapter X) differ from regular codes in the API response?
  - Compare structure of a stem code vs extension code
  - Paper: [[drosler-2021-extension-codes]]
- [ ] What determines `AllowedExceptFromSameBlock` vs `AllowAlways` for `allowMultipleValues`?
  - Relates to semantic conflicts when combining multiple values on same axis

### Architecture
- [ ] How do linearizations other than MMS (e.g., mortality, morbidity) differ?
  - [Linearization docs](https://icd.who.int/icdapi/docs2/ICDAPI-Linearizations/)
  - Try: `/icd/release/11/2024-01/` to list available linearizations
- [ ] What's the relationship between the Coding Tool and raw API?
  - ECT embeds are pre-built UIs that call the same API underneath
- [ ] How is a linearization (like MMS) actually developed/created from the Foundation?
  - Paper: [[chute-celik-2022-architecture]] - describes linearization process
  - WHO committees select which Foundation entities to include and where to place them

### Change Requests (Future)
- [ ] What information do authors need when making change requests?
- [ ] How can we surface "similar existing structures" to guide proposals?

## Reference: Key Concepts

- **Postcoordination**: Stem codes + Extension codes (Chapter X) = clusters. Some postcoordination is mandatory ("code also").
- **Content Model Properties**: `title`, `definition`, `synonym`, `parent`/`child`, `postcoordinationScale`, `foundationChildElsewhere`
