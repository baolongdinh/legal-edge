---
description: Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts.
handoffs: 
  - label: Analyze For Consistency
    agent: speckit.analyze
    prompt: Run a project analysis for consistency
    send: true
  - label: Implement Project
    agent: speckit.implement
    prompt: Start the implementation in phases
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before tasks generation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_tasks` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    
    Wait for the result of the hook command before proceeding to the Outline.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

### Phase 0: Task Intelligence Assessment
**MCPs Used**: `memory`, `gitnexus` *(Lightweight assessment)*

**Steps**:
1. **Task Complexity Check**: Use `memory` MCP to:
   - Assess existing task patterns and conventions
   - Check for established task organization methods
   - Evaluate project task management maturity

2. **Implementation Complexity Scan**: Use `gitnexus` MCP to:
   - Analyze codebase complexity for task breakdown
   - Identify component dependencies and integration points
   - Assess technical constraints and requirements

3. **Task Level Decision**:
   - **Basic**: Simple implementation, standard task breakdown
   - **Enhanced**: Moderate complexity, some integration tasks
   - **Comprehensive**: Complex architecture, many dependencies

4. **Task Strategy Planning**: Determine task breakdown approach

**Output**: Task complexity level with breakdown strategy

### Phase 1: Adaptive Task Analysis & Planning
**MCPs Used**: `memory`, `gitnexus`, `context7` *(Task-adaptive)*

**Steps**:
1. **Task-Driven Analysis**: Based on Phase 0 assessment:
   - **Basic Tasks**: Standard task breakdown with minimal MCP usage
   - **Enhanced Tasks**: Add pattern-based task organization
   - **Comprehensive Tasks**: Full intelligence-assisted task planning

2. **Mode-Specific MCP Usage**:
   - **Basic**: Use `memory` MCP for established task patterns only
   - **Enhanced**: Add `gitnexus` MCP for dependency analysis
   - **Comprehensive**: Full analysis with all MCPs

3. **Smart Task Planning**:
   - **Basic**: Standard task organization and sequencing
   - **Enhanced**: Add project-specific task conventions
   - **Comprehensive**: Full dependency analysis and optimization

**Output**: Task-appropriate breakdown and planning strategy

### Phase 2: Intelligent Task Generation
**MCPs Used**: `sequential-thinking`, `superpower`, `memory`

**Steps**:
1. **Task Breakdown**: Use `sequential-thinking` MCP to:
   - Break down implementation into logical phases (Setup, Tests, Core, Integration, Polish)
   - Establish task dependencies and sequencing
   - Identify parallel execution opportunities
   - Create detailed task descriptions with acceptance criteria

2. **Pattern Application**: Use `superpower` MCP to:
   - Discover proven task patterns for the technology stack
   - Find best practices for task organization
   - Get guidance on task granularity and scope
   - Apply industry-standard task management patterns

3. **Convention Consistency**: Use `memory` MCP to:
   - Apply project-specific task conventions
   - Ensure consistency with previous task breakdowns
   - Follow established naming and organization patterns
   - Maintain alignment with team standards

4. **Dependency Optimization**: Use task dependency analysis to:
   - Create optimal execution sequence
   - Identify critical path and parallel opportunities
   - Plan resource allocation and timing
   - Design risk mitigation strategies

**Output**: Complete, dependency-ordered tasks.md file

1. **Load design documents**: Read from FEATURE_DIR:
   - **Required**: plan.md (tech stack, libraries, structure), spec.md (user stories with priorities)
   - **Optional**: data-model.md (entities), contracts/ (interface contracts), research.md (decisions), quickstart.md (test scenarios)
   - Note: Not all projects have all documents. Generate tasks based on what's available.

2. **Generate tasks.md**: Use `.specify/templates/tasks-template.md` as structure, fill with:
3. **Execute task generation workflow**:
   - Load plan.md and extract tech stack, libraries, project structure
   - Load spec.md and extract user stories with their priorities (P1, P2, P3, etc.)
   - If data-model.md exists: Extract entities and map to user stories
   - If contracts/ exists: Map interface contracts to user stories
   - If research.md exists: Extract decisions for setup tasks
   - Generate tasks organized by user story (see Task Generation Rules below)
   - Generate dependency graph showing user story completion order
   - Create parallel execution examples per user story
   - Validate task completeness (each user story has all needed tasks, independently testable)

4. **Generate tasks.md**: Use `.specify/templates/tasks-template.md` as structure, fill with:
   - Correct feature name from plan.md
   - Phase 1: Setup tasks (project initialization)
   - Phase 2: Foundational tasks (blocking prerequisites for all user stories)
   - Phase 3+: One phase per user story (in priority order from spec.md)
   - Each phase includes: story goal, independent test criteria, tests (if requested), implementation tasks
   - Final Phase: Polish & cross-cutting concerns
   - All tasks must follow the strict checklist format (see Task Generation Rules below)
   - Clear file paths for each task
   - Dependencies section showing story completion order
   - Parallel execution examples per story
   - Implementation strategy section (MVP first, incremental delivery)

5. **Report**: Output path to generated tasks.md and summary:
   - Total task count
   - Task count per user story
   - Parallel opportunities identified
   - Independent test criteria for each story
   - Suggested MVP scope (typically just User Story 1)
   - Format validation: Confirm ALL tasks follow the checklist format (checkbox, ID, labels, file paths)

6. **Check for extension hooks**: After tasks.md is generated, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_tasks` key
   - If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
   - Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
   - For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
     - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
     - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
   - For each executable hook, output the following based on its `optional` flag:
     - **Optional hook** (`optional: true`):
       ```
       ## Extension Hooks

       **Optional Hook**: {extension}
       Command: `/{command}`
       Description: {description}

       Prompt: {prompt}
       To execute: `/{command}`
       ```
     - **Mandatory hook** (`optional: false`):
       ```
       ## Extension Hooks

       **Automatic Hook**: {extension}
       Executing: `/{command}`
       EXECUTE_COMMAND: {command}
       ```
   - If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

Context for task generation: $ARGUMENTS

The tasks.md should be immediately executable - each task must be specific enough that an LLM can complete it without additional context.

## Task Generation Rules

**CRITICAL**: Tasks MUST be organized by user story to enable independent implementation and testing.

**Tests are OPTIONAL**: Only generate test tasks if explicitly requested in the feature specification or if user requests TDD approach.

### Checklist Format (REQUIRED)

Every task MUST strictly follow this format:

```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

**Format Components**:

1. **Checkbox**: ALWAYS start with `- [ ]` (markdown checkbox)
2. **Task ID**: Sequential number (T001, T002, T003...) in execution order
3. **[P] marker**: Include ONLY if task is parallelizable (different files, no dependencies on incomplete tasks)
4. **[Story] label**: REQUIRED for user story phase tasks only
   - Format: [US1], [US2], [US3], etc. (maps to user stories from spec.md)
   - Setup phase: NO story label
   - Foundational phase: NO story label  
   - User Story phases: MUST have story label
   - Polish phase: NO story label
5. **Description**: Clear action with exact file path

**Examples**:

- ✅ CORRECT: `- [ ] T001 Create project structure per implementation plan`
- ✅ CORRECT: `- [ ] T005 [P] Implement authentication middleware in src/middleware/auth.py`
- ✅ CORRECT: `- [ ] T012 [P] [US1] Create User model in src/models/user.py`
- ✅ CORRECT: `- [ ] T014 [US1] Implement UserService in src/services/user_service.py`
- ❌ WRONG: `- [ ] Create User model` (missing ID and Story label)
- ❌ WRONG: `T001 [US1] Create model` (missing checkbox)
- ❌ WRONG: `- [ ] [US1] Create User model` (missing Task ID)
- ❌ WRONG: `- [ ] T001 [US1] Create model` (missing file path)

### Task Organization

1. **From User Stories (spec.md)** - PRIMARY ORGANIZATION:
   - Each user story (P1, P2, P3...) gets its own phase
   - Map all related components to their story:
     - Models needed for that story
     - Services needed for that story
     - Interfaces/UI needed for that story
     - If tests requested: Tests specific to that story
   - Mark story dependencies (most stories should be independent)

2. **From Contracts**:
   - Map each interface contract → to the user story it serves
   - If tests requested: Each interface contract → contract test task [P] before implementation in that story's phase

3. **From Data Model**:
   - Map each entity to the user story(ies) that need it
   - If entity serves multiple stories: Put in earliest story or Setup phase
   - Relationships → service layer tasks in appropriate story phase

4. **From Setup/Infrastructure**:
   - Shared infrastructure → Setup phase (Phase 1)
   - Foundational/blocking tasks → Foundational phase (Phase 2)
   - Story-specific setup → within that story's phase

### Phase Structure

- **Phase 1**: Setup (project initialization)
- **Phase 2**: Foundational (blocking prerequisites - MUST complete before user stories)
- **Phase 3+**: User Stories in priority order (P1, P2, P3...)
  - Within each story: Tests (if requested) → Models → Services → Endpoints → Integration
  - Each phase should be a complete, independently testable increment
- **Final Phase**: Polish & Cross-Cutting Concerns

### Core AI Legal Citation Tasks

If the feature includes AI legal advisory, legal Q&A, contract review, risk analysis, RAG, or any requirement to cite laws/regulations/case references, task generation MUST include an explicit core-logic task set for citation accuracy and source verification. Do not treat this as optional polish.

Required task themes:

1. **Source policy & allowlist**
   - Add tasks to define authoritative legal-source tiers and allowed domains.
   - Tier 1 should prefer official sources (`moj.gov.vn`, `chinhphu.vn`, official government/legal portals).
   - Tier 2 may include reputable legal aggregators (`thuvienphapluat.vn`, `luatvietnam.vn`, `lawnet.vn`) only as fallback or cross-check sources.

2. **Citation contract**
   - Add tasks to formalize a citation schema in API/contracts/data model.
   - Each AI legal claim that cites law must carry structured fields such as:
     - `citation_text`
     - `citation_url`
     - `source_domain`
     - `source_title`
     - `source_excerpt`
     - `source_type`
     - `verification_status`
     - `retrieved_at`
   - Tasks must cover both backend response shape and frontend rendering rules.

3. **Retrieval-first answer pipeline**
   - Add tasks so the implementation retrieves legal sources before synthesis whenever the answer contains legal interpretation, legal obligation, penalties, time limits, procedures, or article references.
   - Task breakdown should separate:
     - retrieval/query rewrite
     - source filtering/ranking
     - evidence extraction
     - answer synthesis from evidence only

4. **Claim-to-evidence grounding**
   - Add tasks to force the model to answer from retrieved evidence, not from parametric memory.
   - Include tasks for sentence-level or bullet-level mapping from answer claims to supporting citations.
   - If no reliable source exists, tasks must require the system to abstain or explicitly mark the answer as unverified.

5. **Citation verification & anti-hallucination guardrails**
   - Add tasks for post-generation validation:
     - reject non-allowlisted domains
     - reject dead or malformed URLs
     - verify cited article text/title appears in retrieved evidence
     - drop or downgrade unsupported claims
   - If the feature already uses Exa or web search, tasks must include a verification layer beyond simple search result insertion.

6. **Caching & cost control**
   - Add tasks for exact-match and semantic caching of verified legal evidence/results.
   - Cache the retrieval/evidence layer separately from final prose where possible.
   - Prefer cheap models for routing, query rewrite, classification, and verification; reserve expensive models for final synthesis only when needed.

7. **Observability & QA**
   - Add tasks for logging citation coverage, verification failures, unsupported-claim rate, cache hit rate, and per-answer tool cost.
   - Add evaluation tasks using a gold-set of legal questions with expected citation URLs.

8. **UX fallback behavior**
   - Add tasks to render citations clearly in the UI and show verification state.
   - Add explicit fallback tasks for:
     - no authoritative source found
     - conflicting sources found
     - source found but article text not matched
   - The UI should prefer “không đủ căn cứ để khẳng định” over confident uncited advice.

When generating tasks for these features, include at least:
- one foundational task for source policy / citation schema
- one backend core-logic task for retrieval and verification
- one task for cache/cost optimization
- one integration task for frontend citation rendering
- one evaluation/QA task for legal-answer correctness

Example task patterns:
- [ ] T0XX Define legal source allowlist and citation verification contract in `docs/...` and `supabase/functions/shared/...`
- [ ] T0XX [US1] Implement retrieval-first legal evidence pipeline in `supabase/functions/legal-chat/index.ts`
- [ ] T0XX [P] [US1] Add citation verification and unsupported-claim filtering in `supabase/functions/shared/types.ts`
- [ ] T0XX [US1] Persist verified evidence/cache for repeated legal queries in `supabase/...`
- [ ] T0XX [US1] Render citation links and verification badges in `legalshield-web/src/pages/...`
- [ ] T0XX [US1] Add evaluation fixtures for citation accuracy and abstention behavior in `tests/...`
