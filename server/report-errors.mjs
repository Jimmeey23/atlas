/** A 429 may require billing action rather than another identical request. */
export function reportProviderError(error) {
 const code=String(error.code ?? error.error?.code ?? error.type ?? error.error?.type ?? '');
 const quota=/(insufficient_quota|billing|usage_limit|quota_exceeded)/i.test(code) || /exceeded your current quota|run out of credits|billing quota|no balance/i.test(String(error.message ?? ''));
 if(error.status!==429)return {};
 const retryAfter=error.headers?.get?.('retry-after') ?? error.headers?.['retry-after'];
 const ms=Number(retryAfter)*1000;
 return {code:quota?'api_quota_exhausted':'provider_rate_limited',retryable:!quota,
   ...(Number.isFinite(ms)&&ms>0?{retryAfterMs:ms}:{}),
   error:quota?'OpenAI API quota or billing limit is exhausted. Review API billing and usage limits; retrying the report cannot resolve this.':'OpenAI is temporarily throttling report generation. Completed chapters and figures are preserved.'};
}
