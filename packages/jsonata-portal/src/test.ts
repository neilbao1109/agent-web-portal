/**
 * Local Test Script for JSONata Portal
 *
 * Run with: bun run test
 */

import type { APIGatewayProxyEvent, LambdaContext } from "@agent-web-portal/aws-lambda";
import { handler } from "./handler.ts";

// Mock Lambda context
const mockContext: LambdaContext = {
  functionName: "jsonata-portal",
  functionVersion: "1",
  invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789:function:jsonata-portal",
  memoryLimitInMB: "128",
  awsRequestId: "test-request-id",
  logGroupName: "/aws/lambda/jsonata-portal",
  logStreamName: "2024/01/01/[$LATEST]test",
  getRemainingTimeInMillis: () => 30000,
};

// Helper to create mock API Gateway event
function createEvent(method: string, body: unknown): APIGatewayProxyEvent {
  return {
    httpMethod: "POST",
    path: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
  };
}

// Helper to make JSON-RPC request
async function jsonRpc(method: string, params?: unknown) {
  const event = createEvent("/mcp", {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  });

  const response = await handler(event, mockContext);
  return JSON.parse(response.body);
}

// =============================================================================
// Tests
// =============================================================================

console.log("🧪 JSONata Portal - Local Tests\n");

// Test 1: Initialize
console.log("1. Initialize");
const initResult = await jsonRpc("initialize");
console.log("   Result:", JSON.stringify(initResult.result, null, 2));
console.log();

// Test 2: List Tools
console.log("2. List Tools");
const toolsResult = await jsonRpc("tools/list");
console.log(
  "   Tools:",
  toolsResult.result.tools.map((t: { name: string }) => t.name)
);
console.log();

// Test 3: List Skills
console.log("3. List Skills");
const skillsResult = await jsonRpc("skills/list");
console.log("   Skills:", Object.keys(skillsResult.result));
console.log();

// Test 4: Simple JSONata evaluation
console.log("4. Simple JSONata Evaluation");
const simpleResult = await jsonRpc("tools/call", {
  name: "jsonata_eval",
  arguments: {
    expression: "1 + 2 + 3",
    input: {},
  },
});
console.log("   Expression: 1 + 2 + 3");
console.log("   Result:", JSON.parse(simpleResult.result.content[0].text));
console.log();

// Test 5: Sum aggregation
console.log("5. Sum Aggregation");
const sumResult = await jsonRpc("tools/call", {
  name: "jsonata_eval",
  arguments: {
    expression: "$sum(orders.amount)",
    input: {
      orders: [{ amount: 100 }, { amount: 200 }, { amount: 300 }],
    },
  },
});
console.log("   Expression: $sum(orders.amount)");
console.log("   Input: orders with amounts [100, 200, 300]");
console.log("   Result:", JSON.parse(sumResult.result.content[0].text));
console.log();

// Test 6: Automata state transition
console.log("6. Automata State Transition");
const automatonResult = await jsonRpc("tools/call", {
  name: "jsonata_eval",
  arguments: {
    expression: "$lookup($lookup(transitions, current_state), input_symbol)",
    input: {
      current_state: "q0",
      input_symbol: "a",
      transitions: {
        q0: { a: "q1", b: "q0" },
        q1: { a: "q1", b: "q2" },
        q2: { a: "q1", b: "q0" },
      },
    },
  },
});
console.log("   Current State: q0, Input: 'a'");
console.log("   Result:", JSON.parse(automatonResult.result.content[0].text));
console.log();

// Test 7: Statistics - multiple aggregations
console.log("7. Multiple Aggregations");
const statsResult = await jsonRpc("tools/call", {
  name: "jsonata_eval",
  arguments: {
    expression:
      "{ 'sum': $sum(values), 'avg': $average(values), 'min': $min(values), 'max': $max(values), 'count': $count(values) }",
    input: {
      values: [10, 20, 30, 40, 50],
    },
  },
});
console.log("   Input: [10, 20, 30, 40, 50]");
console.log("   Result:", JSON.parse(statsResult.result.content[0].text));
console.log();

// Test 8: Error handling
console.log("8. Error Handling (invalid expression)");
const errorResult = await jsonRpc("tools/call", {
  name: "jsonata_eval",
  arguments: {
    expression: "$invalid_function()",
    input: {},
  },
});
console.log("   Expression: $invalid_function()");
console.log("   Result:", JSON.parse(errorResult.result.content[0].text));
console.log();

// Test 9: Complete automaton simulation
console.log("9. Complete Automaton Simulation");
const fullAutomatonResult = await jsonRpc("tools/call", {
  name: "jsonata_eval",
  arguments: {
    expression: `(
      $final := $reduce(inputs, function($state, $sym) {
        $lookup($lookup(transitions, $state), $sym)
      }, initial_state);
      {
        'final_state': $final,
        'accepted': $final in accepting_states
      }
    )`,
    input: {
      initial_state: "q0",
      inputs: ["a", "b"],
      accepting_states: ["q2"],
      transitions: {
        q0: { a: "q1", b: "q0" },
        q1: { a: "q1", b: "q2" },
        q2: { a: "q1", b: "q0" },
      },
    },
  },
});
console.log("   Initial: q0, Inputs: ['a', 'b'], Accepting: ['q2']");
console.log("   Result:", JSON.parse(fullAutomatonResult.result.content[0].text));
console.log();

console.log("✅ All tests completed!");
