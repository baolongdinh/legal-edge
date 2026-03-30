---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
handoffs: 
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
  - label: Create Checklist
    agent: speckit.checklist
    prompt: Create a checklist for the following domain...
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
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

### Phase 0: Planning Intelligence Assessment
**MCPs Used**: `memory`, `gitnexus` *(Lightweight assessment)*

**Steps**:
1. **Plan Complexity Check**: Use `memory` MCP to:
   - Assess existing technical decisions
   - Check for established architecture patterns
   - Evaluate project technical maturity

2. **Implementation Complexity Scan**: Use `gitnexus` MCP to:
   - Analyze current architecture complexity
   - Identify integration requirements
   - Assess technical debt and constraints

3. **Planning Level Decision**:
   - **Basic**: Standard tech, straightforward implementation
   - **Enhanced**: Some new technologies, moderate complexity
   - **Comprehensive**: New architecture, multiple integrations

4. **Research Need Assessment**: Determine external research requirements

**Output**: Planning complexity level with research strategy

### Phase 1: Adaptive Technical Context Analysis
**MCPs Used**: `context7`, `memory`, `gitnexus` *(Planning-adaptive)*

**Steps**:
1. **Planning-Driven Analysis**: Based on Phase 0 assessment:
   - **Basic Planning**: Skip technical context analysis for known technologies
   - **Enhanced Planning**: Targeted analysis for new components
   - **Comprehensive Planning**: Full technical context analysis

2. **Mode-Specific MCP Usage**:
   - **Basic**: Skip Phase 1 entirely for standard implementations
   - **Enhanced**: Use `context7` MCP for unfamiliar technologies only
   - **Comprehensive**: Full analysis with all MCPs

3. **Smart Research Decision**:
   - **Basic**: Proceed directly to Phase 2
   - **Enhanced**: Selective research for new elements
   - **Comprehensive**: Full research and analysis

**Output**: Planning-appropriate technical context

1. **Setup**: Run `.specify/scripts/powershell/setup-plan.ps1 -Json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Phase 1: Update agent context by running the agent script
   - Re-evaluate Constitution Check post-design

4. **Stop and report**: Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts.

5. **Check for extension hooks**: After reporting, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_plan` key
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

## Phases

### Phase 1: Research & Decision Making
**MCPs Used**: `exa`, `deepwiki`, `sequential-thinking` *(For complex decisions only)*

**Steps**:
1. **Assess Research Needs**: Determine if external research is required:
   - Standard implementations: Skip external research
   - New patterns: Use targeted research
   - Critical decisions: Full analysis

2. **Exa MCP** **ONLY IF**:
   - Technology is new or rapidly evolving
   - Performance benchmarks are needed
   - Security considerations are critical

3. **DeepWiki MCP** **ONLY IF**:
   - Community solutions would benefit implementation
   - Open-source alternatives exist
   - Best practices need validation

4. **Sequential-Thinking MCP** **ONLY IF**:
   - Complex trade-offs need analysis
   - Multiple viable options exist
   - Risk assessment is required

**Skip Criteria**: For straightforward technical choices, proceed directly to Phase 2

### Phase 2: Architecture Design & Contracts
**MCPs Used**: `sequential-thinking`, `gitnexus`, `mermaid`, `superpower`

**Steps**:
1. **Data Model Design**: Use `sequential-thinking` MCP to:
   - Extract entities from feature specification
   - Design relationships and validation rules
   - Plan state transitions and business logic
   - Create comprehensive data-model.md

2. **Architecture Analysis**: Use `gitnexus` MCP to:
   - Analyze how new design fits existing architecture
   - Identify integration points and dependencies
   - Map component relationships and data flow
   - Ensure consistency with current patterns

3. **Pattern Discovery**: Use `superpower` MCP to:
   - Find relevant architectural patterns
   - Discover best practices for the domain
   - Identify proven design solutions
   - Get implementation guidance

4. **Visualization**: Use `mermaid` MCP to:
   - Create architecture diagrams
   - Design data flow charts
   - Visualize component relationships
   - Document integration patterns

5. **Interface Contracts**: Define contracts/ directory with:
   - API specifications (for web services)
   - Command schemas (for CLI tools)
   - Component interfaces (for libraries)
   - UI contracts (for applications)

**Output**: data-model.md, contracts/, architecture diagrams, and design documentation

### Phase 3: Implementation Strategy & Agent Context
**MCPs Used**: `sequential-thinking`, `memory`, `context7`

**Steps**:
1. **Implementation Planning**: Use `sequential-thinking` MCP to:
   - Break down architecture into implementable tasks
   - Establish dependencies and sequencing
   - Plan integration and testing strategies
   - Create quickstart.md with integration scenarios

2. **Pattern Application**: Use `memory` MCP to:
   - Apply successful implementation patterns
   - Follow project-specific conventions
   - Ensure consistency with previous implementations
   - Store new patterns for future use

3. **Framework Guidance**: Use `context7` MCP to:
   - Get framework-specific implementation guidance
   - Understand best practices for chosen technologies
   - Validate implementation approach
   - Ensure compliance with standards

4. **Agent Context Update**: Update agent-specific context:
   - Run agent context update script
   - Add new technologies and patterns
   - Preserve manual customizations
   - Ensure agent has latest context

**Output**: Complete implementation plan, quickstart.md, updated agent context
