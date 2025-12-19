# Open Questions

Questions that arise during exploration of ICD-11.
## [sg] questions
- **Understanding ICD-11 nomenclature**
	- [ ] What does "*Exclusions from above levels*" mean?
		- [ ] e.g., [Foundation browser --> breast cancer](https://icd.who.int/browse/2025-01/foundation/en#1047754165) ![[Pasted image 20251219085834.png]]

## claude questions
### API & Data Model
- [ ] How does the `source` property work when an MMS entity maps to multiple Foundation entities?
- [ ] What's the difference between `foundationChildElsewhere` and regular `child` relationships?
- [ ] How are "gray children" determined in the MMS linearization?
### Postcoordination
- [ ] Which postcoordination axes are mandatory vs optional for different entity types?
- [ ] How do extension codes (Chapter X) differ from regular codes in the API response?
- [ ] What determines `AllowedExceptFromSameBlock` vs `AllowAlways` for `allowMultipleValues`?
### Architecture
- [ ] How do linearizations other than MMS (e.g., mortality, morbidity) differ?
- [ ] What's the relationship between the Coding Tool and raw API?
### Change Requests (Future)
- [ ] What information do authors need when making change requests?
- [ ] How can we surface "similar existing structures" to guide proposals?
