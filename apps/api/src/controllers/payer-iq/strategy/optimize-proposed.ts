import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { ollama } from '../../../services/ollama';

type Tier = 'aggressive' | 'moderate' | 'conservative';

interface InputRow {
  cpt: string;
  currentAllowed: number;
  avgPaid: number;
  underpaidDollars: number;
  volume: number;
}

export class OptimizeProposed {
  public post = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { rows, payerName } = req.body ?? {};

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: 'rows must be a non-empty array' });
      }
      if (typeof payerName !== 'string' || payerName.trim() === '') {
        return res.status(400).json({ message: 'payerName is required' });
      }

      // Server-side pre-analysis - payment ratio and tier are computed from real data,
      // not delegated to the model, so they are always accurate.
      const enrichedRows = (rows as InputRow[]).map(r => {
        const current = Number(r.currentAllowed) || 0;
        const paid = Number(r.avgPaid) || 0;
        const ratio = current > 0 ? paid / current : 0;
        const tier: Tier =
          ratio < 0.80 ? 'aggressive' :
          ratio < 0.95 ? 'moderate'   : 'conservative';
        return {
          cpt:             String(r.cpt ?? ''),
          currentAllowed:  current,
          avgPaid:         paid,
          underpaidDollars: Number(r.underpaidDollars) || 0,
          volume:          Number(r.volume) || 0,
          paymentRatio:    Math.round(ratio * 1000) / 1000,
          tier,
        };
      });

      const prompt = `You are a dental revenue cycle analyst helping a practice negotiate a payer fee schedule.

Payer: ${payerName.trim()}

For each CPT code below, suggest a proposedAllowed (whole dollars, rounded to nearest dollar) and write ONE specific sentence of reasoning for that code explaining why that amount was chosen.

RULES for proposedAllowed:
- paymentRatio < 0.80  (aggressive tier):  multiply currentAllowed by 1.10 to 1.20
- paymentRatio 0.80-0.95 (moderate tier):  multiply currentAllowed by 1.05 to 1.10
- paymentRatio >= 0.95  (conservative tier): multiply currentAllowed by 1.03 to 1.05
- Within each tier, weight larger multipliers toward codes with higher volume AND higher underpaidDollars
- proposedAllowed must always be >= currentAllowed

Also write a 1 to 2 sentence overall rationale summarizing the negotiation strategy.

IMPORTANT: You MUST include one entry for EVERY code listed in the data. Do not use "..." or any shorthand \u2014 output every code explicitly.

Data:
${JSON.stringify(enrichedRows)}

Respond with a JSON object in exactly this format \u2014 no other text, no markdown:
{
  "suggestions": [
    {"cpt": "D1234", "proposedAllowed": 123, "reasoning": "One sentence explaining the chosen amount."}
  ],
  "rationale": "1-2 sentence overall negotiation strategy."
}`;

      let raw: string;
      try {
        raw = await ollama.generate(prompt, {
          temperature: 0.2,
          maxTokens: 4096,
          timeoutMs: 120_000,
          noCache: true,
          format: 'json',
        });
      } catch (err: any) {
        logger.warn('[OptimizeProposed] Ollama unavailable', err?.message);
        return res.status(503).json({ message: 'AI service is currently unavailable \u2014 please try again later' });
      }

      // Extract the outermost JSON object from the response.
      // Smaller models often add prose before/after the JSON despite instructions.
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      const cleaned =
        firstBrace !== -1 && lastBrace > firstBrace
          ? raw.slice(firstBrace, lastBrace + 1)
          : raw.trim();

      let parsed: {
        suggestions: { cpt: string; proposedAllowed: number; reasoning: string }[];
        rationale: string;
      };

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        logger.warn('[OptimizeProposed] Failed to parse Ollama JSON response', { snippet: raw.slice(0, 800) });
        return res.status(502).json({
          message: 'AI returned an unparseable response \u2014 please try again',
          rawResponse: raw,
          promptSent: prompt,
          inputRows: enrichedRows,
        });
      }

      if (!Array.isArray(parsed?.suggestions)) {
        return res.status(502).json({ message: 'AI returned an unexpected response format \u2014 please try again' });
      }

      // Merge server-computed ratios/tiers - never trust model values for these
      const ratioMap = new Map(enrichedRows.map(r => [r.cpt, r]));

      const suggestions = parsed.suggestions.map(s => {
        const computed = ratioMap.get(String(s.cpt));
        return {
          cpt:            String(s.cpt),
          proposedAllowed: Math.round(Number(s.proposedAllowed) || 0),
          reasoning:       String(s.reasoning ?? ''),
          paymentRatio:    computed?.paymentRatio ?? 0,
          tier:            (computed?.tier ?? 'moderate') as Tier,
          currentAllowed:  computed?.currentAllowed ?? 0,
        };
      });

      return res.status(200).json({
        suggestions,
        rationale: String(parsed.rationale ?? ''),
        meta: {
          model:          process.env.OLLAMA_MODEL ?? 'thewindmom/llama3-med42-8b:latest',
          analyzedAt:     new Date().toISOString(),
          codesAnalyzed:  suggestions.length,
          payerName:      payerName.trim(),
        },
        rawResponse: raw,
        promptSent: prompt,
        inputRows: enrichedRows,
      });
    } catch (error: unknown) {
      logger.error('[OptimizeProposed] Unexpected error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
