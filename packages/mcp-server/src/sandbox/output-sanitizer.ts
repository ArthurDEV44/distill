/**
 * Sandbox Output Sanitizer (US-002)
 *
 * `code_execute` returns guest-produced stdout / return values straight back
 * into the model's context. Without neutralization a guest could emit text the
 * LLM parses as control structure (`<system>…`, "ignore previous
 * instructions") — the MCP prompt-injection-via-tool-result vector
 * (OWASP MCP Top 10, CVE-2025-54136 class).
 *
 * Two non-destructive layers, applied at the single output boundary:
 *   1. defang known control tokens by inserting a zero-width space (U+200B)
 *      after their leading character, breaking token contiguity so they cannot
 *      be parsed as directives. Reversible (strip U+200B) — never deleted, so
 *      legitimate content is preserved verbatim to a human reader and survives
 *      downstream LLM summarization intact.
 *   2. wrap the whole body in a clearly-labeled untrusted envelope so the model
 *      treats it as data. Delimiting is the durable mitigation; defang alone is
 *      not enough.
 *
 * Layering rationale: the defang (layer 1) is BEST-EFFORT against the obvious
 * control-token forms — it deliberately does not chase Unicode `<` lookalikes,
 * markdown fences, or attribute-context `"role":"system"`, because exhaustively
 * matching every variant is an unwinnable arms race that also risks corrupting
 * legitimate output. The untrusted envelope (layer 2) is the actual contract:
 * everything between the delimiters is data, whatever its surface form.
 */

const ZERO_WIDTH_SPACE = "\u200B";

export const UNTRUSTED_OUTPUT_OPEN = "--- sandbox output (untrusted) ---";
export const UNTRUSTED_OUTPUT_CLOSE = "--- end sandbox output (untrusted) ---";

/**
 * Break any literal envelope delimiter the guest smuggled into its own output,
 * by inserting a zero-width space after the leading `-`. Without this a guest
 * could print `--- end sandbox output (untrusted) ---` mid-stream to forge an
 * early boundary, making the text after it read as if it were OUTSIDE the
 * untrusted envelope (the same boundary-forging vector US-003 closes for the
 * `[DISTILL:COMPRESSED]` marker). Non-destructive and reversible (strip U+200B).
 */
function defangEnvelopeDelimiters(text: string): string {
  let out = text;
  for (const delim of [UNTRUSTED_OUTPUT_OPEN, UNTRUSTED_OUTPUT_CLOSE]) {
    if (out.includes(delim)) {
      out = out.split(delim).join(`-${ZERO_WIDTH_SPACE}${delim.slice(1)}`);
    }
  }
  return out;
}

/**
 * LLM control-ish tags an injection would use to escalate privilege. Matched
 * case-insensitively at a tag boundary (`\b`). Over-matching benign code that
 * happens to contain these tags is harmless: the defang is an invisible,
 * non-destructive zero-width insertion, not a deletion.
 */
const CONTROL_TAG = /<(\/?)(system|instructions?|important|assistant|user|tool)\b/gi;

/**
 * Plain-text imperative used to override prior instructions
 * ("ignore previous instructions", "disregard all prior", …).
 */
const INJECTION_PHRASE =
  /\b(ignore|disregard|forget|override)(\s+(?:all\s+)?(?:previous|prior|above|earlier))/gi;

/**
 * Defang injection control tokens by inserting a zero-width space that breaks
 * their contiguity. Reversible and non-destructive.
 */
export function defangControlTokens(text: string): string {
  return text
    .replace(
      CONTROL_TAG,
      (_m, slash: string, name: string) => `<${slash}${ZERO_WIDTH_SPACE}${name}`
    )
    .replace(
      INJECTION_PHRASE,
      (_m, verb: string, rest: string) => `${verb}${ZERO_WIDTH_SPACE}${rest}`
    );
}

/**
 * Defang control tokens in `rawOutput` and wrap the result in the untrusted
 * envelope. This is the single boundary all `code_execute` model-visible
 * output passes through.
 */
export function wrapUntrustedSandboxOutput(rawOutput: string): string {
  // Defang injection control tokens AND any forged envelope delimiter the guest
  // embedded in its own output, so the only real boundaries in the result are
  // the open/close this function emits.
  const defanged = defangEnvelopeDelimiters(defangControlTokens(rawOutput));
  return `${UNTRUSTED_OUTPUT_OPEN}\n${defanged}\n${UNTRUSTED_OUTPUT_CLOSE}`;
}
