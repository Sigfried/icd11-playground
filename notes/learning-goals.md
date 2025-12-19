# Learning Goals

The goal is to understand ICD-11 well enough to build tools that help authors understand existing structures when making change requests.

## Core Concepts to Learn

1. **Foundation vs Linearization (MMS)**
   - Foundation: ~85k entities, polyhierarchy (multiple parents), no codes
   - MMS: ~17k codes, single parent, mutually exclusive categories
   - The `source` property links MMS entities back to Foundation

2. **Postcoordination**
   - Stem codes: standalone diagnoses
   - Extension codes (Chapter X): add detail (severity, laterality, histopathology)
   - Clusters: stem + extensions linked together
   - Some postcoordination is mandatory ("code also")

3. **Content Model Properties**
   - `title`, `definition`, `synonym`
   - `parent`/`child` relationships
   - `postcoordinationScale` - what axes are available
   - `foundationChildElsewhere` - "gray children" that live elsewhere in MMS

## Suggested Learning Path

### Phase 1: API Familiarity

- [ ] Fetch a few entities (Cholera: 257068234, Breast cancer: 254546711)
- [ ] Compare Foundation vs MMS representations of the same concept
- [ ] Understand what properties are available and how they're structured

### Phase 2: Hierarchy Understanding

- [ ] Navigate parent/child relationships
- [ ] Find an entity with multiple Foundation parents, see how it linearizes to one MMS parent
- [ ] Explore "gray children" (foundationChildElsewhere)

### Phase 3: Postcoordination

- [ ] Find entities with postcoordinationScale
- [ ] Understand which axes are required vs optional
- [ ] Explore Chapter X extension codes and how they relate to stem codes

### Phase 4: Search and Discovery

- [ ] Use the search endpoint to find entities
- [ ] Understand code lookup vs entity lookup
- [ ] Try the ECT components (Coding Tool and Browser)
