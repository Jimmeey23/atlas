/** Creation verbs alone are not authorization to save an analytical element. */
export function agentIntent(message: string, selected: "ask" | "build" = "ask"): "ask" | "build" {
  if (/\b(?:do not|don't|dont|without|never)\s+(?:create|build|generate|make|add|save|plot|draw)\b/i.test(message)) return "ask";
  if (/^\s*(?:how\s+(?:do|can|would|should)\s+(?:i|we|you)|explain\s+how|what\s+is)\b/i.test(message)) return "ask";
  const creates = /\b(create|build|generate|make|add|save|plot|draw)\b/i.test(message);
  const artifact = /\b(charts?|tables?|graphs?|elements?|views?|insights?|lists?|dashboards?|pivots?|heat\s?maps?|kpis?|scorecards?|scatter|donuts?|combo)\b/i.test(message);
  return creates && artifact ? "build" : selected;
}
