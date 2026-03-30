---
description: Create or update the feature specification from a natural language feature description.
---

---
description: Create or update the feature specification from a natural language feature description.
handoffs: 
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
  - label: Clarify Spec Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before specification)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_specify` key
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

### Phase 0: Proactive Intelligence Assessment
**MCPs Used**: `memory`, `gitnexus` *(Lightweight assessment)*

**Steps**:
1. **Project Maturity Check**: Use `memory` MCP to:
   - Count existing specifications (>10 = mature)
   - Check for established patterns
   - Assess project-specific conventions

2. **Codebase Complexity Scan**: Use `gitnexus` MCP to:
   - Count files and components involved
   - Identify integration complexity
   - Assess existing architecture patterns

3. **Intelligence Level Decision**:
   - **Basic**: <5 files, standard tech, internal tool
   - **Enhanced**: 5-15 files, some integrations, user-facing
   - **Comprehensive**: >15 files, multiple integrations, critical system

4. **Workflow Adaptation**: Set MCP usage level for remaining phases

**Output**: Intelligence level (Basic/Enhanced/Comprehensive) with MCP usage plan

### Phase 1: Adaptive Context Intelligence & Research
**MCPs Used**: `memory`, `context7`, `exa`, `deepwiki` *(Intelligence-adaptive)*

**Steps**:
1. **Intelligence-Driven Research**: Based on Phase 0 assessment:
   - **Basic Mode**: Memory only for patterns
   - **Enhanced Mode**: Memory + Context7 for domain knowledge
   - **Comprehensive Mode**: All research MCPs for full analysis

2. **Mode-Specific Execution**:
   - **Basic**: Use `memory` MCP **ONLY IF** project has established patterns
   - **Enhanced**: Add `context7` MCP for domain-specific knowledge
   - **Comprehensive**: Add `exa` + `deepwiki` MCPs for external research

3. **Smart Skip Logic**:
   - Basic mode: Skip external research entirely
   - Enhanced mode: Targeted research only for unfamiliar domains
   - Comprehensive mode: Full research for new technologies

**Output**: Context-appropriate research findings

The text the user typed after `/speckit.specify` in the triggering message **is** the feature description. Assume you always have it available in this conversation even if `$ARGUMENTS` appears literally below. Do not ask the user to repeat it unless they provided an empty command.

Given that feature description, do this:

### Phase 2: Intelligence-Adaptive Specification Generation
**MCPs Used**: `memory`, `gitnexus` *(Mode-adaptive)*

**Steps**:
1. **Mode-Driven Generation**: Based on Phase 0 intelligence level:
   - **Basic Mode**: Direct specification with minimal MCP usage
   - **Enhanced Mode**: Add pattern-based enhancement
   - **Comprehensive Mode**: Full intelligence-assisted generation

2. **Mode-Specific MCP Usage**:
   - **Basic**: Direct specification using feature description only
   - **Enhanced**: Use `memory` MCP for established patterns
   - **Comprehensive**: Add `gitnexus` MCP for integration analysis

3. **Intelligent Enhancement**:
   - **Basic**: Standard specification patterns
   - **Enhanced**: Apply project-specific conventions from memory
   - **Comprehensive**: Add architecture consistency validation

**Output**: Intelligence-level appropriate specification

### Phase 3: Branch Setup & Template Processing
**Steps**:
1. **Generate Branch Short Name**: Create 2-4 word short name from feature description
   - Use action-noun format when possible
   - Preserve technical terms and acronyms
   - Examples: "user-auth", "oauth2-api-integration", "analytics-dashboard"

2. **Create Feature Branch**: Run branch creation script with short name
   - Use JSON flag for reliable parsing
   - Handle timestamp vs sequential numbering based on project settings
   - Parse output for BRANCH_NAME and SPEC_FILE paths

3. **Load Template**: Read `.specify/templates/spec-template.md` for structure requirements

4. **Write Specification**: Fill template using research and analysis from Phase 1-2
   - Replace placeholders with concrete details
   - Ensure all mandatory sections are completed
   - Apply discovered patterns and best practices

### Phase 4: Multi-MCP Quality Validation
**MCPs Used**: `memory`, `context7` *(Intelligence-adaptive)*

**Steps**:
1. **Mode-Driven Validation**: Based on Phase 0 intelligence level:
   - **Basic Mode**: Standard validation only
   - **Enhanced Mode**: Add pattern-based validation
   - **Comprehensive Mode**: Full multi-MCP validation

2. **Mode-Specific Validation**:
   - **Basic**: Basic completeness and clarity checks
   - **Enhanced**: Add `memory` MCP for pattern consistency
   - **Comprehensive**: Add `context7` MCP for industry standards

3. **Quality Gate Enhancement**:
   - **Basic**: Mandatory sections validation
   - **Enhanced**: Project convention validation
   - **Comprehensive**: Industry compliance validation

**Output**: Intelligence-level appropriate quality validation

5. Write the specification to SPEC_FILE using the template structure, replacing placeholders with concrete details derived from the feature description (arguments) while preserving section order and headings.

6. **Specification Quality Validation**: After writing the initial spec, validate it against quality criteria:

   a. **Create Spec Quality Checklist**: Generate a checklist file at `FEATURE_DIR/checklists/requirements.md` using the checklist template structure with these validation items:

      ```markdown
      # Specification Quality Checklist: [FEATURE NAME]
      
      **Purpose**: Validate specification completeness and quality before proceeding to planning
      **Created**: [DATE]
      **Feature**: [Link to spec.md]
      
      ## Content Quality
      
      - [ ] No implementation details (languages, frameworks, APIs)
      - [ ] Focused on user value and business needs
      - [ ] Written for non-technical stakeholders
      - [ ] All mandatory sections completed
      
      ## Requirement Completeness
      
      - [ ] No [NEEDS CLARIFICATION] markers remain
      - [ ] Requirements are testable and unambiguous
      - [ ] Success criteria are measurable
      - [ ] Success criteria are technology-agnostic (no implementation details)
      - [ ] All acceptance scenarios are defined
      - [ ] Edge cases are identified
      - [ ] Scope is clearly bounded
      - [ ] Dependencies and assumptions identified
      
      ## Feature Readiness
      
      - [ ] All functional requirements have clear acceptance criteria
      - [ ] User scenarios cover primary flows
      - [ ] Feature meets measurable outcomes defined in Success Criteria
      - [ ] No implementation details leak into specification
      
      ## Notes
      
      - Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`
      ```

   b. **Run Validation Check**: Review the spec against each checklist item:
      - For each item, determine if it passes or fails
      - Document specific issues found (quote relevant spec sections)

   c. **Handle Validation Results**:

      - **If all items pass**: Mark checklist complete and proceed to step 7

      - **If items fail (excluding [NEEDS CLARIFICATION])**:
        1. List the failing items and specific issues
        2. Update the spec to address each issue
        3. Re-run validation until all items pass (max 3 iterations)
        4. If still failing after 3 iterations, document remaining issues in checklist notes and warn user

      - **If [NEEDS CLARIFICATION] markers remain**:
        1. Extract all [NEEDS CLARIFICATION: ...] markers from the spec
        2. **LIMIT CHECK**: If more than 3 markers exist, keep only the 3 most critical (by scope/security/UX impact) and make informed guesses for the rest
        3. For each clarification needed (max 3), present options to user in this format:

           ```markdown
           ## Question [N]: [Topic]
           
           **Context**: [Quote relevant spec section]
           
           **What we need to know**: [Specific question from NEEDS CLARIFICATION marker]
           
           **Suggested Answers**:
           
           | Option | Answer | Implications |
           |--------|--------|--------------|
           | A      | [First suggested answer] | [What this means for the feature] |
           | B      | [Second suggested answer] | [What this means for the feature] |
           | C      | [Third suggested answer] | [What this means for the feature] |
           | Custom | Provide your own answer | [Explain how to provide custom input] |
           
           **Your choice**: _[Wait for user response]_
           ```

        4. **CRITICAL - Table Formatting**: Ensure markdown tables are properly formatted:
           - Use consistent spacing with pipes aligned
           - Each cell should have spaces around content: `| Content |` not `|Content|`
           - Header separator must have at least 3 dashes: `|--------|`
           - Test that the table renders correctly in markdown preview
        5. Number questions sequentially (Q1, Q2, Q3 - max 3 total)
        6. Present all questions together before waiting for responses
        7. Wait for user to respond with their choices for all questions (e.g., "Q1: A, Q2: Custom - [details], Q3: B")
        8. Update the spec by replacing each [NEEDS CLARIFICATION] marker with the user's selected or provided answer
        9. Re-run validation after all clarifications are resolved

   d. **Update Checklist**: After each validation iteration, update the checklist file with current pass/fail status

7. Report completion with branch name, spec file path, checklist results, and readiness for the next phase (`/speckit.clarify` or `/speckit.plan`).

8. **Check for extension hooks**: After reporting completion, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_specify` key
   - If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
   - Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
   - For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
     - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
   