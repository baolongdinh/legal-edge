---
name: mcp-auto-detection
description: Smart auto-detection system for MCP workflow integration based on complexity, keywords, and user preferences
---

# MCP Auto-Detection System

## Overview
Intelligent system that automatically determines when to trigger MCP-integrated workflow vs direct execution based on multiple factors.

## Detection Algorithm

### 1. Complexity Scoring System

#### File Impact Score
```yaml
file_impact:
  1-2 files: 1 point (simple)
  3-5 files: 3 points (medium)
  6-10 files: 5 points (complex)
  10+ files: 10 points (very complex)
```

#### Dependency Complexity
```yaml
dependency_score:
  no dependencies: 0 points
  1-2 dependencies: 2 points
  3-5 dependencies: 5 points
  6+ dependencies: 8 points
```

#### Integration Scope
```yaml
integration_score:
  single module: 1 point
  cross-module: 3 points
  cross-service: 5 points
  external APIs: 7 points
```

#### Testing Requirements
```yaml
testing_score:
  no tests needed: 0 points
  unit tests: 2 points
  integration tests: 4 points
  e2e tests: 6 points
  performance tests: 8 points
```

### 2. Keyword Classification

#### Feature Development Keywords (Weight: 8 points)
```yaml
feature_keywords:
  primary: ["build", "implement", "create", "develop", "design", "architecture"]
  secondary: ["feature", "module", "service", "component", "system"]
  tertiary: ["new", "add", "extend", "enhance"]
```

#### Bug Fix Keywords (Weight: 6 points)
```yaml
bug_keywords:
  primary: ["fix", "debug", "resolve", "issue", "error", "crash"]
  secondary: ["broken", "failing", "incorrect", "wrong", "problem"]
  tertiary: ["regression", "inconsistency", "unexpected"]
```

#### Research Keywords (Weight: 7 points)
```yaml
research_keywords:
  primary: ["research", "analyze", "investigate", "explore", "study"]
  secondary: ["evaluation", "comparison", "benchmark", "assessment"]
  tertiary: ["best practices", "patterns", "approaches", "solutions"]
```

#### Architecture Keywords (Weight: 9 points)
```yaml
architecture_keywords:
  primary: ["architecture", "design system", "structure", "pattern"]
  secondary: ["refactor", "restructure", "reorganize", "optimize"]
  tertiary: ["scalability", "performance", "maintainability"]
```

### 3. User Preference Settings

#### Default Thresholds
```yaml
thresholds:
  mcp_workflow_trigger: 15 points
  comprehensive_research: 20 points
  full_analysis: 25 points
```

#### User Customizable Preferences
```yaml
user_preferences:
  auto_mcp_threshold: "medium" # low: 10, medium: 15, high: 20
  research_depth: "standard" # quick: 5, standard: 10, deep: 15
  parallel_execution: true
  memory_persistence: true
  puppeteer_integration: true
```

## Detection Logic

### Scoring Algorithm
```python
def calculate_complexity_score(request):
    score = 0
    
    # File impact (0-10 points)
    score += file_impact_score(request.files_affected)
    
    # Dependencies (0-8 points)
    score += dependency_score(request.dependencies)
    
    # Integration scope (0-7 points)
    score += integration_score(request.integration_scope)
    
    # Testing requirements (0-8 points)
    score += testing_score(request.testing_needs)
    
    # Keyword detection (0-9 points)
    score += keyword_weight(request.content)
    
    # Context factors (0-5 points)
    score += context_score(request.context)
    
    return score
```

### Decision Matrix
```yaml
decision_matrix:
  0-10 points: 
    action: "direct_execution"
    reasoning: "Simple task, no MCP needed"
    
  11-15 points:
    action: "light_mcp_integration"
    mcp_used: ["memory", "context7"]
    reasoning: "Medium complexity, basic MCP support"
    
  16-20 points:
    action: "standard_mcp_workflow"
    mcp_used: ["memory", "context7", "exa", "gitnexus", "sequential-thinking"]
    reasoning: "Complex task, full MCP workflow"
    
  21+ points:
    action: "comprehensive_mcp_workflow"
    mcp_used: ["all_active_mcps"]
    special_features: ["parallel_execution", "puppeteer", "deep_analysis"]
    reasoning: "Very complex task, maximum MCP utilization"
```

## Implementation Commands

### Auto-Detection Command
```bash
# Auto-detect and execute appropriate workflow
/mcp-auto-detect

# With custom threshold
/mcp-auto-detect --threshold=20

# Force analysis only (no execution)
/mcp-auto-detect --analyze-only
```

### Manual Override Options
```bash
# Force MCP workflow regardless of score
/mcp-force-comprehensive

# Skip MCP workflow regardless of score
/mcp-skip

# Use specific MCP set
/mcp-custom --mcps="exa,gitnexus,sequential-thinking"
```

## Context Analysis Factors

### Project Context
```yaml
project_context:
  project_size: "small|medium|large"
  team_size: "individual|small|large"
  complexity_level: "simple|moderate|complex"
  documentation_quality: "minimal|standard|comprehensive"
```

### Historical Patterns
```yaml
historical_analysis:
  similar_tasks_completed: 0-5 points
  user_expertise_level: 0-3 points
  success_rate_with_mcp: 0-2 points
```

### Time Sensitivity
```yaml
time_factors:
  urgency_level: "low|medium|high"
  available_time: "abundant|sufficient|limited"
  deadline_pressure: 0-3 points
```

## Configuration Files

### User Preferences File
```yaml
# ~/.windsurf/mcp-preferences.yaml
auto_detection:
  enabled: true
  threshold: 15
  learn_from_usage: true
  
workflow_preferences:
  parallel_execution: true
  memory_persistence: true
  puppeteer_integration: true
  research_depth: "standard"
  
notification_settings:
  show_detection_reasoning: true
  allow_manual_override: true
  log_decisions: true
```

### Project-Specific Config
```yaml
# .windsurf/mcp-config.yaml
project_type: "ecommerce-microservice"
complexity_multiplier: 1.2
required_mcps: ["gitnexus", "memory", "context7"]
optional_mcps: ["puppeteer", "stitch"]
workflow_overrides:
  architecture_tasks: "always_use_mcp"
  bug_fixes: "use_if_score>12"
  research_tasks: "always_use_comprehensive"
```

## Learning System

### Pattern Recognition
```yaml
learning_features:
  track_user_decisions: true
  learn_from_overrides: true
  adjust_thresholds: true
  optimize_mcp_selection: true
```

### Feedback Loop
```yaml
feedback_system:
  success_tracking: true
  efficiency_metrics: true
  user_satisfaction: true
  automatic_optimization: true
```

## Usage Examples

### Example 1: Simple Task
```
Request: "Fix typo in README.md"
Score: 2 (1 file, no dependencies)
Action: Direct execution
```

### Example 2: Medium Complexity
```
Request: "Add user authentication to API"
Score: 18 (multiple files, security, dependencies)
Action: Standard MCP workflow
```

### Example 3: High Complexity
```
Request: "Design microservice architecture for new payment system"
Score: 27 (architecture, multiple services, external APIs)
Action: Comprehensive MCP workflow with all MCPs
```

## Integration with Existing Workflows

### Speckit Integration
```yaml
speckit_integration:
  pre_specify: "/mcp-auto-detect" → enhance requirements gathering
  pre_plan: "/mcp-auto-detect" → inform architecture decisions  
  pre_implement: "/mcp-auto-detect" → optimize implementation approach
```

### Workflow Chaining
```yaml
workflow_chains:
  research_heavy: "/mcp-auto-detect → /speckit.specify → /mcp-comprehensive → /speckit.implement"
  feature_development: "/speckit.specify → /mcp-auto-detect → /speckit.plan → /speckit.implement"
  bug_investigation: "/mcp-auto-detect → /speckit.analyze → /speckit.implement"
```

## Monitoring & Analytics

### Decision Tracking
```yaml
analytics:
  track_detection_accuracy: true
  monitor_efficiency_gains: true
  measure_user_satisfaction: true
  optimize_thresholds: true
```

### Performance Metrics
```yaml
metrics:
  decision_accuracy: "percentage of correct auto-detections"
  efficiency_gain: "time saved vs manual selection"
  user_satisfaction: "user feedback scores"
  workflow_success_rate: "successful completion rates"
```

---

## Quick Start

1. **Enable auto-detection** in user preferences
2. **Set initial thresholds** based on project complexity
3. **Test with sample requests** to calibrate
4. **Monitor and adjust** based on usage patterns
5. **Fine-tune** for optimal performance

This system ensures MCP workflows are used when they provide maximum value while avoiding unnecessary overhead for simple tasks.
