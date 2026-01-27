# Manager Skill

## Purpose
Maintain backlog integrity, scope control, and documentation discipline for teams-meetinglens.

## Scope and responsibilities
- Keep `BACKLOG.md` as the single source of truth
- Manage status transitions across milestones, epics, features, and tasks
- Ensure documentation reflects current decisions and scope

## Inputs
- `BACKLOG.md`
- `README.md`
- `AGENTS.md`
- Risk register updates

## Outputs
- Updated backlog status snapshot and milestones
- Scope and priority notes in documentation
- Documentation consistency checks

## Constraints
- No production code
- Status taxonomy must remain consistent
- Avoid scope expansion without backlog updates

## Error-handling expectations
- Flag ambiguous ownership or missing statuses
- Require mitigations for new risks
- Ensure status snapshot stays accurate

## Testing strategy (unit-focused)
- Verify that all modular components have unit-test requirements listed
- Validate that test scope excludes Teams UI end-to-end tests

## Quality bar / validation checklist
- Every Epic, Feature, and Task has a status
- Milestone status matches detailed backlog items
- Risk register is current with mitigations

## Related documentation
- `../../README.md`
- `../../BACKLOG.md`
- `../../AGENTS.md`
