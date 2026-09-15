import { complete, providerName } from '../provider.js';
import { resolvePrompt, renderPrompt } from '../prompts.js';
import { validate } from '../../core/validate.js';
import { insert } from '../../db/repo.js';
import { log } from '../../core/logger.js';
import { AppError } from '../../core/errors.js';

/**
 * Agent framework (§39).
 *
 * The system deliberately has no single all-purpose agent. Each agent declares:
 *   - one responsibility
 *   - an input schema and an output schema (both enforced)
 *   - the prompt key it reads from prompt management (versioned)
 *   - the tools it may use
 *
 * Every run is logged to `agent_runs` with its prompt version, model, duration
 * and outcome, so behaviour is reproducible and debuggable.
 *
 * Model output is untrusted: it is schema-validated before any caller sees it,
 * and a schema failure is an agent failure, not something to paper over.
 */
export class Agent {
  /** @type {string} */ static name_ = 'agent';
  /** @type {string} */ static responsibility = '';
  /** @type {string} */ static promptKey = '';
  /** @type {string} */ static task = '';
  /** Tool permissions — what this agent is allowed to reach. */
  /** @type {string[]} */ static tools = [];
  /** @type {Record<string, any>} */ static inputSchema = {};
  /** @type {Record<string, any>} */ static outputSchema = {};
  /** Use the larger model for reasoning-heavy work. */
  static heavy = false;

  get name() { return /** @type {any} */ (this.constructor).name_; }

  /**
   * @param {{agencyId?:string|null, clientId?:string|null, platform?:string|null, actorId?:string|null}} ctx
   * @param {Record<string, any>} input
   */
  async run(ctx, input) {
    const Cls = /** @type {any} */ (this.constructor);
    const started = Date.now();
    const clean = validate(input, Cls.inputSchema);

    let promptRow = null;
    try {
      promptRow = resolvePrompt({
        key: Cls.promptKey, agencyId: ctx.agencyId, clientId: ctx.clientId, platform: ctx.platform,
      });
    } catch (err) {
      // A missing prompt is a deployment problem, not a runtime one to hide.
      log.error('prompt_missing', { agent: Cls.name_, key: Cls.promptKey });
      throw err;
    }

    try {
      const result = await complete({
        system: SYSTEM_PREAMBLE,
        prompt: renderPrompt(promptRow.template, clean),
        task: Cls.task,
        input: clean,
        heavy: Cls.heavy,
      });

      if (result.json === null || typeof result.json !== 'object') {
        throw new AppError(502, 'agent_output_unparseable',
          `${Cls.name_} returned output that is not JSON`);
      }

      const output = Object.keys(Cls.outputSchema).length
        ? validate(result.json, Cls.outputSchema)
        : result.json;

      this.#record(ctx, promptRow, clean, output, result, started, null);
      return { output, promptVersionId: promptRow.id, model: result.model };
    } catch (err) {
      this.#record(ctx, promptRow, clean, null, null, started, err);
      throw err;
    }
  }

  #record(ctx, promptRow, input, output, result, started, err) {
    try {
      insert('agent_runs', {
        agency_id: ctx.agencyId ?? null,
        client_id: ctx.clientId ?? null,
        agent: /** @type {any} */ (this.constructor).name_,
        prompt_version_id: promptRow?.id ?? null,
        model: result?.model ?? providerName(),
        input: JSON.stringify(input).slice(0, 8000),
        output: output ? JSON.stringify(output).slice(0, 12000) : null,
        tokens_in: result?.tokensIn ?? 0,
        tokens_out: result?.tokensOut ?? 0,
        duration_ms: Date.now() - started,
        error: err ? String(err.message ?? err).slice(0, 1000) : null,
        status: err ? 'failed' : 'succeeded',
      });
    } catch (recordErr) {
      log.error('agent_run_record_failed', { agent: this.name, err: String(recordErr) });
    }
  }
}

/**
 * Shared system preamble. These constraints apply to every agent, in every
 * prompt, and are not overridable by prompt management.
 */
export const SYSTEM_PREAMBLE = `You are one specialised agent inside a social media operating system used by a marketing agency on behalf of real clients.

Hard rules, in priority order:
1. Platform compliance. Never suggest anything that circumvents a platform's rules, rate limits, authentication or enforcement.
2. Authenticity. Never write anything deceptive: no fake testimonials, no pretending to be a customer or an unaffiliated person, no invented statistics, no claims about results that were not provided to you.
3. Human oversight. You produce drafts and assessments. A person decides what gets published.
4. Accuracy. If you do not have the information, say so. Do not fill gaps with plausible-sounding detail.
5. Brand safety. Respect the client's stated voice, vocabulary and compliance constraints.

Always reply with a single JSON object and nothing else — no prose before or after it.`;
