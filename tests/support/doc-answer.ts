/** A minimal v4 chapter answer: a lede, a verdict and a one-section document. */
export function docAnswer(summary = 'Recorded evidence.', verdict: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    summary,
    verdict: { headline: 'Recorded movement', meaning: 'Conditional analysis.', lens: 'driver', priority: 'medium', impact: '', metrics: [], confidence: 'medium', ...verdict },
    document: {
      sections: [{ title: 'Start here', sub: 'The month moved on recorded evidence.', lens: 'driver', priority: 'high', paragraphs: ['Recorded figures, read against the previous month.'], callout: null, exhibits: [], evidence: null }],
      recommendations: [{ title: 'Review capacity', owner: 'Studio operations', horizon: 'Next 30 days', reasoning: 'Supplied figures.', impact: 'Indicative.' }],
      method: ['Read from the frozen figures.'],
    },
    questions: [],
    ...extra,
  };
}
