---
name: Automata State Transition
description: Compute finite automaton state transitions using JSONata expressions
version: 1.0.0
allowed-tools:
  - jsonata_eval
---

# Automata State Transition Skill

This skill uses the `jsonata_eval` tool to compute state transitions for finite automata (DFA/NFA).

## Overview

A finite automaton is defined by:
- A set of states
- An initial state
- A set of accepting states
- A transition function: (current_state, input_symbol) → next_state

## Usage Examples

### Example 1: Simple Traffic Light Automaton

States: `red`, `yellow`, `green`
Transitions: `red` → `green` → `yellow` → `red`

```json
{
  "expression": "$lookup(transitions, current_state)",
  "input": {
    "current_state": "red",
    "transitions": {
      "red": "green",
      "green": "yellow", 
      "yellow": "red"
    }
  }
}
```

**Result:** `"green"`

### Example 2: DFA with Input Symbol

A DFA that accepts strings ending with "ab":

```json
{
  "expression": "$lookup($lookup(transitions, current_state), input_symbol)",
  "input": {
    "current_state": "q0",
    "input_symbol": "a",
    "transitions": {
      "q0": { "a": "q1", "b": "q0" },
      "q1": { "a": "q1", "b": "q2" },
      "q2": { "a": "q1", "b": "q0" }
    }
  }
}
```

**Result:** `"q1"`

### Example 3: Process Multiple Inputs

Process a sequence of inputs and return all intermediate states:

```json
{
  "expression": "$reduce(inputs, function($acc, $sym) { $append($acc, [$lookup($lookup(transitions, $acc[-1]), $sym)]) }, [initial_state])",
  "input": {
    "initial_state": "q0",
    "inputs": ["a", "b", "a", "b"],
    "transitions": {
      "q0": { "a": "q1", "b": "q0" },
      "q1": { "a": "q1", "b": "q2" },
      "q2": { "a": "q1", "b": "q0" }
    }
  }
}
```

**Result:** `["q0", "q1", "q2", "q1", "q2"]`

### Example 4: Check if Final State is Accepting

```json
{
  "expression": "final_state in accepting_states",
  "input": {
    "final_state": "q2",
    "accepting_states": ["q2"]
  }
}
```

**Result:** `true`

### Example 5: Complete Automaton Simulation

Run a complete automaton simulation with acceptance check:

```json
{
  "expression": "( $final := $reduce(inputs, function($state, $sym) { $lookup($lookup(transitions, $state), $sym) }, initial_state); { 'final_state': $final, 'accepted': $final in accepting_states, 'path': $reduce(inputs, function($acc, $sym) { $append($acc, [$lookup($lookup(transitions, $acc[-1]), $sym)]) }, [initial_state]) } )",
  "input": {
    "initial_state": "q0",
    "inputs": ["a", "b"],
    "accepting_states": ["q2"],
    "transitions": {
      "q0": { "a": "q1", "b": "q0" },
      "q1": { "a": "q1", "b": "q2" },
      "q2": { "a": "q1", "b": "q0" }
    }
  }
}
```

**Result:**
```json
{
  "final_state": "q2",
  "accepted": true,
  "path": ["q0", "q1", "q2"]
}
```

## Common JSONata Patterns for Automata

| Pattern | Expression |
|---------|------------|
| Single transition | `$lookup($lookup(transitions, state), symbol)` |
| Check accepting | `state in accepting_states` |
| Process sequence | `$reduce(inputs, fn, initial_state)` |
| Get all states | `$keys(transitions)` |
| Get symbols for state | `$keys(transitions.state_name)` |

## Tips

1. Use `$lookup()` for safe property access that returns `undefined` for missing keys
2. Use `$reduce()` to process input sequences
3. Combine with `$append()` to track state history
4. Use object construction `{ ... }` to return rich results
