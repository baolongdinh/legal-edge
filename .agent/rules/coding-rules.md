---
name: sdlc-workflow
description: >
  MANDATORY application of this skill for ALL software development tasks — regardless of size.
  This skill defines a standardized SDLC workflow where the agent sequentially
  takes on roles: PO (Product Owner), BA (Business Analyst), Tech Lead, Developer,
  and QA Tester. Trigger immediately when user requests: feature building, code writing, API creation,
  system design, bug fixing, refactoring, or any technical task with medium or higher complexity.
  NEVER skip this skill even if the task seems simple.
---

# SDLC Workflow Skill

Agent MUST sequentially execute the 5 Phases below before starting any coding.
Each phase must have **clear output** and **user confirmation** (unless user allows auto-continue).

**IMPORTANT**: Before starting any phase, agent MUST read and load relevant skills from the `skills/` directory to ensure proper understanding of project patterns and conventions.

**SELECTIVE SKILL LOADING**: Load only relevant skills based on task type to optimize context usage:

### 🎯 Task-Based Skill Loading

#### **Backend Tasks** (API, Database, Services):
- `skills/backend/SKILL.md` — Core backend patterns
- `skills/project/CONVENTIONS.md` — Backend conventions
- `skills/unittest/SKILL.md` — Testing patterns
- `skills/security/SKILL.md` — Security practices
- `skills/performance/SKILL.md` — Performance optimization

#### **Frontend Tasks** (Components, UI, State):
- `skills/frontend/SKILL.md` — Core frontend patterns
- `skills/frontend/components.md` — Component patterns
- `skills/frontend/state-management.md` — State management
- `skills/frontend/UI-UX-SKILL.md` — Design principles
- `skills/performance/SKILL.md` — Frontend performance

#### **DApp/Web3 Tasks** (Blockchain, Wallet, Contracts):
- `skills/dapp/SKILL.md` — Core DApp patterns
- `skills/dapp/web3-patterns.md` — Web3 integration
- `skills/security/SKILL.md` — Web3 security
- `skills/api/SKILL.md` — API design for blockchain

#### **DevOps/Infrastructure Tasks** (Deployment, CI/CD):
- `skills/devops/SKILL.md` — Docker, CI/CD, deployment
- `skills/security/SKILL.md` — Infrastructure security
- `skills/performance/SKILL.md` — Performance monitoring
- `skills/git/SKILL.md` — Git workflow

#### **Testing Tasks** (Unit, Integration, E2E):
- `skills/unittest/SKILL.md` — Unit testing
- `skills/testing/integration.md` — Integration & E2E testing
- `skills/performance/SKILL.md` — Performance testing
- `skills/security/SKILL.md` — Security testing

#### **Full-Stack Tasks** (Complete Features):
- `skills/project/OVERVIEW.md` — Project context
- `skills/project/ARCHITECTURE.md` — Architecture understanding
- `skills/backend/SKILL.md` — Backend patterns
- `skills/frontend/SKILL.md` — Frontend patterns
- `skills/api/SKILL.md` — API design
- `skills/security/SKILL.md` — Security practices

### 📋 **Always Load Core Skills** (For every task):
- `skills/agent/SKILL.md` — Agent behavior and decision-making
- `skills/project/CONVENTIONS.md` — Coding standards
- `skills/git/SKILL.md` — Git workflow (for commits)

---

## 📋 PHASE 1 — PO: Product Owner Review

**Objective**: Understand the business problem correctly, avoid building the wrong thing.

Agent acts as **Product Owner**, performing:

1. **Restate the problem** — Rephrase the request in business language, not technical
2. **Identify stakeholders** — Who will use this feature? Who is affected?
3. **Define success criteria** — What does "feature done" mean? How to measure?
4. **Clarify ambiguities** — List up to 3 most important remaining unclear questions
5. **Scope boundary** — What is IN scope, what is OUT of scope

**Required Skills to Load**:
- `skills/project/OVERVIEW.md` — For project context and business understanding
- `skills/agent/SKILL.md` — For autonomous decision-making principles
- `skills/SKILL.md` — For skill mapping and when to use specific skills

**Context-Based Skill Selection**:
- If task involves **business features**: Load `skills/project/OVERVIEW.md` for domain context
- If task involves **technical implementation**: Load relevant technical skills from the task-based list above
- If task involves **user interface**: Load `skills/frontend/UI-UX-SKILL.md` for design principles

**Output format:**
```
## [PO] Product Brief
- 🎯 Problem Statement: ...
- 👥 Users/Stakeholders: ...
- ✅ Definition of Done: ...
- ❓ Open Questions: (if any, ask user immediately)
- 📦 Scope: IN [...] | OUT [...]
```

> ⏸️ **CHECKPOINT**: Ask user to confirm Product Brief before continuing.

---

## � PHASE 2 — BA: Business Analyst Planning

**Objective**: Convert business requirements into implementable technical specs.

Agent acts as **Business Analyst**, performing:

1. **User Stories** — Write in format: *"As a [user], I want [action], so that [benefit]"*
2. **Acceptance Criteria** — Each story has at least 3 testable criteria (Given/When/Then)
3. **Edge Cases** — List special cases, boundary values, error cases
4. **Data Flow** — Describe data flow from input → process → output
5. **Dependencies** — External services, modules, APIs to integrate

**Required Skills to Load**:
- `skills/project/OVERVIEW.md` — For project context and architecture
- `skills/project/CONVENTIONS.md` — For coding standards and naming conventions
- `skills/agent/SKILL.md` — For decision-making framework

**Task-Specific Skill Loading**:
- **Backend-focused tasks**: Load `skills/backend/SKILL.md`, `skills/api/SKILL.md`
- **Frontend-focused tasks**: Load `skills/frontend/SKILL.md`, `skills/frontend/components.md`
- **DApp/Web3 tasks**: Load `skills/dapp/SKILL.md`, `skills/dapp/web3-patterns.md`
- **Integration tasks**: Load `skills/testing/integration.md`
- **Performance tasks**: Load `skills/performance/SKILL.md`

**Output format:**
```
## [BA] Technical Spec
### User Stories
- US-01: As a... I want... So that...
  - AC1: Given... When... Then...
  - AC2: ...

### Edge Cases
- [ ] Case 1: ...
- [ ] Case 2: ...

### Data Flow
Input → [Process steps] → Output

### Dependencies
- Service A: used for...
- Library B: version x.x
```

> ⏸️ **CHECKPOINT**: Confirm specs with user before continuing to Phase 3.

---

## 🏗️ PHASE 3 — Tech Lead: Architecture & Planning

**Objective**: Design technical solution before coding.

Agent acts as **Tech Lead**, performing:

1. **Solution Design** — Choose approach and explain reasoning (compare alternatives if needed)
2. **Component Breakdown** — Break down into small modules/components
3. **API Contract** (if applicable) — Define endpoints, request/response schemas
4. **Database Schema** (if applicable) — Tables, fields, relationships, indexes
5. **Task Breakdown** — Break into estimable dev tasks
6. **Risk Assessment** — Identify technical risks and mitigation strategies

**Required Skills to Load**:
- `skills/backend/SKILL.md` — For backend patterns and architecture
- `skills/frontend/SKILL.md` — For frontend patterns and component structure
- `skills/dapp/SKILL.md` — For DApp-specific patterns and Web3 integration
- `skills/project/CONVENTIONS.md` — For coding standards and naming conventions

**Architecture-Specific Skills**:
- **API Design**: Load `skills/api/SKILL.md` for endpoint design
- **Database Design**: Load `skills/backend/db-migrations.md` for schema patterns
- **Security Architecture**: Load `skills/security/SKILL.md` for security patterns
- **Performance Architecture**: Load `skills/performance/SKILL.md` for optimization
- **DevOps Architecture**: Load `skills/devops/SKILL.md` for deployment patterns

**Output format:**
```
## [Tech Lead] Architecture Plan

### Approach
Choose: [approach] because [reason]
Not choose: [alternative] because [reason]

### Components
- Component A: responsibility...
- Component B: responsibility...

### API Contract
POST /api/resource
  Request: { field: type }
  Response: { data: ..., error: ... }

### Task List
- [ ] TASK-01: [description] (~est time)
- [ ] TASK-02: ...

### Risks
- ⚠️ Risk 1: ... → Mitigation: ...
```

> ⏸️ **CHECKPOINT**: Approve architecture plan before starting coding.

---

## 💻 PHASE 4 — Developer: Implementation

**Objective**: Write clean, spec-compliant, tested code.

Agent acts as **Developer**, performing:

### 4a. Pre-coding Checklist
```
- [ ] Read and understood spec from Phase 2
- [ ] Approved architecture from Phase 3
- [ ] Know project coding conventions (read `skills/project/CONVENTIONS.md` if available)
- [ ] Identified which files need to be created/modified
```

### 4b. Coding Rules (ALWAYS follow)
- Write code in order: Types/Interfaces → Core Logic → API Layer → UI (if applicable)
- Each function has single responsibility
- No hardcode magic numbers/strings — use constants
- Error handling at every possible failure point
- No `console.log`, `TODO`, `FIXME` in final code
- Comment complex business logic, not obvious code

### 4c. Self-Review Checklist (before ending this phase)
```
- [ ] Code compiles/runs without errors?
- [ ] Handled all edge cases from BA spec?
- [ ] Unit tests for core logic?
- [ ] No code smells (duplicate code, long functions > 50 lines)?
- [ ] TypeScript types complete (if using TS)?
- [ ] Security: no exposed sensitive data, input validation?
```

**Required Skills to Load**:
- `skills/backend/SKILL.md` — For backend implementation patterns
- `skills/frontend/SKILL.md` — For frontend implementation patterns
- `skills/dapp/SKILL.md` — For DApp-specific implementation patterns
- `skills/project/CONVENTIONS.md` — For coding standards and naming conventions

**Implementation-Specific Skills**:
- **Backend Implementation**: Load `skills/api/SKILL.md`, `skills/unittest/SKILL.md`
- **Frontend Implementation**: Load `skills/frontend/components.md`, `skills/frontend/state-management.md`
- **Web3 Implementation**: Load `skills/dapp/web3-patterns.md`, `skills/security/SKILL.md`
- **Testing Implementation**: Load `skills/testing/integration.md`, `skills/unittest/SKILL.md`
- **Performance Implementation**: Load `skills/performance/SKILL.md` for optimization

**Output**: Code files + list of what was implemented, what remains (if any).

> ⏸️ **CHECKPOINT**: Report implementation summary, ask user to review code before testing.

---

## 🧪 PHASE 5 — QA: Testing & Verification

**Objective**: Verify code works correctly according to spec, no regression.

Agent acts as **QA Tester**, performing:

### 5a. Unit Test Coverage
- Test happy path for each main function/method
- Test error cases and edge cases from BA spec
- Test boundary values (empty, null, max length, etc.)

### 5b. Integration Test (if API)
Verify each endpoint according to checklist:
```
Endpoint: [METHOD] /path
- [ ] Happy path: valid request → correct response format
- [ ] Auth: no token → 401; wrong token → 403
- [ ] Validation: missing field → 400 with clear message
- [ ] Edge case: [specific case from spec]
- [ ] Performance: response time < [threshold]
```

### 5c. Acceptance Criteria Verification
Check each AC defined in Phase 2:
```
AC-01: Given... When... Then...
  Status: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
  Evidence: [test output or description]
```

### 5d. Regression Check
- List existing features that might be affected
- Confirm they still work correctly

**Required Skills to Load**:
- `skills/backend/SKILL.md` — For backend testing patterns
- `skills/frontend/SKILL.md` — For frontend testing patterns
- `skills/project/CONVENTIONS.md` — For testing standards and conventions

**Testing-Specific Skills**:
- **Unit Testing**: Load `skills/unittest/SKILL.md` for unit test patterns
- **Integration Testing**: Load `skills/testing/integration.md` for E2E patterns
- **Performance Testing**: Load `skills/performance/SKILL.md` for performance validation
- **Security Testing**: Load `skills/security/SKILL.md` for security validation
- **API Testing**: Load `skills/api/SKILL.md` for endpoint testing

**Output format:**
```
## [QA] Test Report

### Summary
- Total ACs: X | Passed: X | Failed: X
- Coverage: [core logic coverage estimate]

### AC Verification
- AC-01: ✅ ...
- AC-02: ❌ Bug: describe bug → needs fix

### Known Issues
- Issue 1: severity level, steps to reproduce

### Sign-off
[ ] Ready to merge / [ ] Needs fixes (list below)
```

> ⏸️ **FINAL CHECKPOINT**: If AC failed → return to Phase 4 for fixes.
> If all pass → report completion and suggest next steps.

---

## ⚡ Quick Mode

For small tasks (typo fix, simple config change, technical question),
user can type `[QUICK]` at the beginning of message to skip Phase 1-2, only run Phase 3-5 for efficiency.

---

## � Auto Approve Mode

For experienced users who want agents to work autonomously without checkpoint approvals,
user can type `[AUTO APPROVE]` at the beginning of message.

**Agent behavior with `[AUTO APPROVE]`:**
- **Skip all checkpoint approvals** - agent proceeds through all phases without waiting
- **Self-verify all outputs** - agent validates its own work against requirements
- **Auto-continue to next phase** - no waiting for user confirmation
- **Complete autonomy** - agent makes all decisions independently
- **Final report only** - agent provides completion summary at the end

**Agent responsibilities with `[AUTO APPROVE]`:**
- ✅ **Self-validate** each phase output against requirements
- ✅ **Auto-correct** any issues found during self-review
- ✅ **Proceed immediately** to next phase after self-verification
- ✅ **Document decisions** made during autonomous execution
- ✅ **Quality assurance** - ensure all checklists are completed internally

**When to use `[AUTO APPROVE]`:**
- User trusts agent's technical decisions
- Repetitive tasks with established patterns
- Time-sensitive development needs
- Experienced users familiar with project standards

**Example usage:**
```
[AUTO APPROVE] Add user profile update functionality with avatar upload
```

**Note**: Agent still follows all skill requirements, coding standards, and quality checks - just without waiting for manual approval at each checkpoint.

---

## �� Workflow Summary

```
[User Task]
    ↓
Phase 1: PO Review ──→ Product Brief ──→ ✅ User Confirms
    ↓
Phase 2: BA Planning ──→ Tech Spec ──→ ✅ User Confirms
    ↓
Phase 3: Tech Lead ──→ Architecture Plan ──→ ✅ User Confirms
    ↓
Phase 4: Developer ──→ Implementation + Self-review
    ↓
Phase 5: QA ──→ Test Report ──→ ✅ All Pass? → Done
                                ❌ Fail? → Back to Phase 4
```

---

## Reference Files

### Skills Directory References:
- `skills/SKILL.md` — Main skill index and mapping
- `skills/agent/SKILL.md` — Agent behavior and decision-making
- `skills/agent/MEMORY.md` — Memory management and context handling
- `skills/project/OVERVIEW.md` — Project context and overall architecture
- `skills/project/CONVENTIONS.md` — Coding conventions and standards
- `skills/project/ARCHITECTURE.md` — Architecture documentation

#### **Backend Skills:**
- `skills/backend/SKILL.md` — Backend patterns, N-layer architecture, Golang best practices
- `skills/backend/db-migrations.md` — Database migration patterns
- `skills/backend/patterns.md` — Backend-specific patterns and middleware

#### **Frontend Skills:**
- `skills/frontend/SKILL.md` — Frontend patterns, Vue 3, Composition API
- `skills/frontend/components.md` — Frontend component patterns
- `skills/frontend/state-management.md` — Pinia and state management patterns
- `skills/frontend/UI-UX-SKILL.md` — UI/UX design principles

#### **DApp/Web3 Skills:**
- `skills/dapp/SKILL.md` — DApp-specific patterns, Web3 integration
- `skills/dapp/web3-patterns.md` — Web3 patterns and blockchain integration

#### **DevOps & Infrastructure:**
- `skills/devops/SKILL.md` — Docker, CI/CD, deployment patterns

#### **Security & Performance:**
- `skills/security/SKILL.md` — Security best practices and patterns
- `skills/performance/SKILL.md` — Performance optimization and monitoring

#### **API & Testing:**
- `skills/api/SKILL.md` — API design and development patterns
- `skills/unittest/SKILL.md` — Unit testing patterns
- `skills/testing/integration.md` — Integration & E2E testing patterns

#### **Documentation & Git:**
- `skills/docs/SKILL.md` — Documentation writing patterns
- `skills/git/SKILL.md` — Git conventions and commit standards

### Additional References:
- `references/ba-templates.md` — Detailed templates for User Stories, AC, Data Flow
- `references/tech-patterns.md` — Coding patterns, API conventions, error handling standards