/** A 429 may require billing action rather than another identical request. */
/** True when a 429 is an empty or capped account rather than throttling; retrying cannot help. */
export function isQuotaError(error) {
 const codes=[error.code,error.type,error.error?.code,error.error?.type].map(v=>String(v ?? '')).join(' ');
 return /(insufficient_quota|credit_balance_exhausted|billing|usage_limit|quota_exceeded)/i.test(codes) || /exceeded your current quota|run out of credits|no credits remaining|billing quota|no balance/i.test(String(error.message ?? ''));
}
export function reportProviderError(error) {
 const quota=isQuotaError(error);
 if(error.status!==429)return {};
 const retryAfter=error.headers?.get?.('retry-after') ?? error.headers?.['retry-after'];
 const ms=Number(retryAfter)*1000;
 return {code:quota?'api_quota_exhausted':'provider_rate_limited',retryable:!quota,
   ...(Number.isFinite(ms)&&ms>0?{retryAfterMs:ms}:{}),
   error:quota?'The OpenAI account behind the configured API key has no credits left. Add credits in OpenAI billing (platform.openai.com) or replace the key in Agent settings; retrying cannot resolve this.':'OpenAI is temporarily throttling report generation. Completed chapters and figures are preserved.'};
}
