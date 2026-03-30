---
description: Execute the implementation plan by processing and executing all tasks defined in tasks.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before implementation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_implement` key
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

### Phase 0: Implementation Intelligence Assessment
**MCPs Used**: `memory`, `gitnexus` *(Lightweight assessment)*

**Steps**:
1. **Implementation Complexity Check**: Use `memory` MCP to:
   - Assess existing implementation patterns
   - Check for established coding conventions
   - Evaluate team technical capabilities

2. **Code Impact Analysis**: Use `gitnexus` MCP to:
   - Analyze impact on existing codebase
   - Identify integration complexity
   - Assess dependency requirements

3. **Implementation Level Decision**:
   - **Basic**: Standard implementation, minimal integrations
   - **Enhanced**: Some new patterns, moderate complexity
   - **Comprehensive**: Complex integrations, new architecture

4. **Resource Planning**: Determine MCP usage strategy

**Output**: Implementation complexity level with execution strategy

### Phase 1: Adaptive Implementation Analysis
**MCPs Used**: `gitnexus`, `context7`, `memory` *(Implementation-adaptive)*

**Steps**:
1. **Implementation-Driven Analysis**: Based on Phase 0 assessment:
   - **Basic Implementation**: Skip analysis, proceed directly to coding
   - **Enhanced Implementation**: Targeted analysis for new patterns
   - **Comprehensive Implementation**: Full analysis with all MCPs

2. **Mode-Specific MCP Usage**:
   - **Basic**: Skip Phase 1 entirely for straightforward tasks
   - **Enhanced**: Use `memory` MCP for pattern retrieval only
   - **Comprehensive**: Full analysis with `gitnexus` + `context7` + `memory`

3. **Smart Execution Decision**:
   - **Basic**: Direct implementation with basic testing
   - **Enhanced**: Add pattern-based guidance
   - **Comprehensive**: Full intelligence-assisted implementation

**Output**: Implementation-appropriate analysis and strategy

### Phase 2: Smart Code Generation & Implementation
**MCPs Used**: `context7`, `superpower`, `memory`, `gitnexus` *(For guidance only)*

**Steps**:
1. **Direct Implementation**: Generate code using:
   - Task requirements and specifications
   - Standard coding patterns
   - Basic framework knowledge

2. **Context7 MCP** **ONLY IF**:
   - Framework-specific syntax is needed
   - API usage examples are required
   - New library integration is involved

3. **Superpower MCP** **ONLY IF**:
   - Complex patterns need to be discovered
   - Best practices for specific requirements
   - Optimization strategies are needed

4. **Memory MCP** **ONLY IF**:
   - Project coding conventions must be followed
   - Similar implementations exist for reference
   - Team standards are documented

5. **GitNexus MCP** **ONLY IF**:
   - Integration validation is required
   - Existing patterns must be consistent
   - Dependency management is complex

**Skip Criteria**: For standard implementations, use direct coding approach

### Phase 3: Automated Testing & Quality Assurance
**MCPs Used**: `superpower`, `puppeteer`, `sequential-thinking`, `memory` *(For testing strategy)*

**Steps**:
1. **Basic Testing**: Create tests using:
   - Standard testing patterns
   - Task requirements and specifications
   - Basic framework testing knowledge

2. **Superpower MCP** **ONLY IF**:
   - Complex testing patterns are needed
   - Technology-specific testing strategies
   - Advanced testing frameworks are involved

3. **Puppeteer MCP** **ONLY IF**:
   - Web UI testing is required
   - End-to-end scenarios exist
   - Browser automation is needed

4. **Sequential-Thinking MCP** **ONLY IF**:
   - Complex test strategy is needed
   - Risk-based testing approach
   - Complex dependency testing

5. **Memory MCP** **ONLY IF**:
   - Project testing conventions exist
   - Similar test patterns can be reused
   - Team testing standards are documented

**Skip Criteria**: For standard unit tests, use basic testing approach

### Phase 4: Documentation & Knowledge Bridge
**MCPs Used**: `mermaid`, `memory` *(Documentation + Learning)*

**Steps**:
1. **Implementation-Driven Documentation**: Based on Phase 0 assessment:
   - **Basic**: Standard documentation only
   - **Enhanced**: Add project-specific documentation patterns
   - **Comprehensive**: Full documentation with visualizations

2. **Mode-Specific Documentation**:
   - **Basic**: Basic implementation documentation
   - **Enhanced**: Add `memory` MCP for pattern documentation
   - **Comprehensive**: Add `mermaid` MCP for architecture diagrams

3. **Cross-Workflow Knowledge Bridge**:
   - **Memory Storage**: Store implementation patterns for future workflows
   - **Lessons Learned**: Document successes and challenges
   - **Pattern Library**: Build reusable implementation knowledge

4. **Future Workflow Enhancement**:
   - Store implementation decisions in memory
   - Document best practices discovered
   - Create knowledge base for similar future features

**Output**: Complete documentation with enhanced future workflow intelligence

4. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the following command succeeds to determine if the repository is a git repo (create/verify .gitignore if so):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Check if Dockerfile* exists or Docker in plan.md → create/verify .dockerignore
   - Check if .eslintrc* exists → create/verify .eslintignore
   - Check if eslint.config.* exists → ensure the config's `ignores` entries cover required patterns
   - Check if .prettierrc* exists → create/verify .prettierignore
   - Check if .npmrc or package.json exists → create/verify .npmignore (if publishing)
   - Check if terraform files (*.tf) exist → create/verify .terraformignore
   - Check if .helmignore needed (helm charts present) → create/verify .helmignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **Common Patterns by Technology** (from plan.md tech stack):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `*.dll`, `autom4te.cache/`, `config.status`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Tool-Specific Patterns**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

5. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Tests, Core, Integration, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Execution flow**: Order and dependency requirements

6. Execute implementation following the task plan:
   - **Phase-by-phase execution**: Complete each phase before moving to the next
   - **Respect dependencies**: Run sequential tasks in order, parallel tasks [P] can run together  
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Validation checkpoints**: Verify each phase completion before proceeding

7. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code**: If you need to write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement models, services, CLI commands, endpoints
   - **Integration work**: Database connections, middleware, logging, external services
   - **Polish and validation**: Unit tests, performance optimization, documentation

8. Progress tracking and error handling:
   - Report progress after each completed task
   - Halt execution if any non-parallel task fails
   - For parallel tasks [P], continue with successful tasks, report failed ones
   - Provide clear error messages with context for debugging
   - Suggest next steps if implementation cannot proceed
   - **IMPORTANT** For completed tasks, make sure to mark the task off as [X] in the tasks file.

9. Completion validation:
   - Verify all required tasks are completed
   - Check that implemented features match the original specification
   - Validate that tests pass and coverage meets requirements
   - Confirm the implementation follows the technical plan
   - Report final status with summary of completed work

Note: This command assumes a complete task breakdown exists in tasks.md. If tasks are incomplete or missing, suggest running `/speckit.tasks` first to regenerate the task list.

10. **Check for extension hooks**: After completion validation, check if `.specify/extensions.yml` exists in the project root.
    - If it exists, read it and look for entries under the `hooks.after_implement` key
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
