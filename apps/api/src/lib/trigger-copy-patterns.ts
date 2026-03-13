// ──────────────────────────────────────────────────────────────
// Growth OS — Trigger Copy Patterns
// Maps each PsychTrigger to concrete copywriting instructions
// derived from the Psychology Layer document.
// Used by generatePsychDrivenCopy() to build trigger-specific
// system prompts for AI copy generation.
// ──────────────────────────────────────────────────────────────

import type { PsychTrigger } from '@growth-os/etl';

export interface TriggerCopyPattern {
  /** The cognitive/emotional mechanism being activated. */
  readonly mechanism: string;
  /** Concrete implementation instruction for copywriter/AI. */
  readonly doThis: string;
  /** Anti-patterns — what fails or backfires. */
  readonly avoidThis: string;
  /** Example hook framework or structure. */
  readonly exampleFramework: string;
  /** Suggested CTA style. */
  readonly ctaStyle: string;
  /** Best awareness levels for this trigger. */
  readonly bestAt: readonly string[];
}

export const TRIGGER_COPY_PATTERNS: Record<PsychTrigger, TriggerCopyPattern> = {
  LOSS_AVERSION: {
    mechanism: 'Losses feel 2-2.5x more painful than equivalent gains. Frame outcomes as losses avoided, not gains achieved.',
    doThis: 'Reframe the benefit as avoiding a cost. Make the cost of inaction concrete and specific with numbers. Use "stop losing" / "don\'t miss" / "every day you wait" language.',
    avoidThis: 'Never add loss framing to an already anxious/overwhelmed audience — it amplifies paralysis. Never use fake deadlines.',
    exampleFramework: 'Hook: "[Specific cost] you\'re losing every [time period]" → Body: Name the invisible cost → CTA: "Stop the leak"',
    ctaStyle: 'Action-oriented, cost-stopping: "Stop Losing X" / "Fix This Now"',
    bestAt: ['PAIN_AWARE', 'PRODUCT_AWARE'],
  },
  SOCIAL_PROOF_SPECIFICITY: {
    mechanism: 'Specific numbers break through the "thousands of customers" noise filter. The brain cannot dismiss an unexpected, precise number.',
    doThis: 'Use specific numbers (847, not "hundreds"). Cite specific outcomes with percentages. Name real contexts or use-cases.',
    avoidThis: 'Never fabricate specific numbers. Unverifiable specificity increases skepticism. Round numbers feel generic.',
    exampleFramework: 'Hook: "[Exact number] [people/businesses] already [specific outcome]" → Body: One concrete example → CTA: "Join them"',
    ctaStyle: 'Community/belonging: "Join X Others" / "See Why X Chose This"',
    bestAt: ['SOLUTION_AWARE', 'PRODUCT_AWARE'],
  },
  SOCIAL_PROOF_AUTHORITY: {
    mechanism: 'When people lack expertise to evaluate a claim, they delegate evaluation to perceived experts. Authority proof is expertise transfer, not popularity.',
    doThis: 'Use credentials the target audience recognizes as meaningful. Cite third-party data, press mentions in publications they read. Show expert endorsements.',
    avoidThis: 'Authority the audience doesn\'t recognize triggers reactance. A Michelin star means nothing to a fast food operator. Don\'t use generic "as seen in" without recognizable sources.',
    exampleFramework: 'Hook: "[Recognized authority] recommends/uses/validates" → Body: Why this expert matters → CTA: "Trust the experts"',
    ctaStyle: 'Expert-endorsed: "Recommended By X" / "Expert-Approved"',
    bestAt: ['SOLUTION_AWARE', 'PRODUCT_AWARE'],
  },
  IDENTITY_TRIBAL: {
    mechanism: 'People buy to signal membership in groups they belong to or aspire to. The purchase is a statement about identity, not just function.',
    doThis: 'Name the tribe explicitly ("for chefs who don\'t settle"). Show the tribe in creative — audience should see themselves. Use the tribe\'s own language, not marketing speak.',
    avoidThis: 'Too narrow = audience opts out. Too broad = means nothing. Never use aspirational language that makes the current state feel inadequate.',
    exampleFramework: 'Hook: "If you\'re the kind of [person] who [specific behavior]..." → Body: "This is made for people like you" → CTA: "Claim Your Spot"',
    ctaStyle: 'Belonging: "This Is For You" / "Join Your People"',
    bestAt: ['UNAWARE', 'PAIN_AWARE', 'MOST_AWARE'],
  },
  IDENTITY_ASPIRATIONAL: {
    mechanism: 'The gap between current self and ideal self is a persistent motivator. The product becomes the bridge to who they\'re becoming.',
    doThis: 'Use future-state framing: "Imagine running your business where..." Before/after focused on identity change, not feature benefit. Treat the purchase as consistent with who they\'re becoming.',
    avoidThis: 'If the aspiration feels too distant or unrealistic, it creates distance. A struggling small business doesn\'t respond to enterprise aspirational content.',
    exampleFramework: 'Hook: "Imagine [future identity state]" → Body: "The [product] that gets you there" → CTA: "Start Becoming"',
    ctaStyle: 'Transformation: "Start Your Journey" / "Become [Aspiration]"',
    bestAt: ['UNAWARE', 'PAIN_AWARE', 'SOLUTION_AWARE'],
  },
  COGNITIVE_EASE: {
    mechanism: 'The brain uses processing ease as a proxy for truth and quality. Simple = credible. Complex = doubt.',
    doThis: 'One idea per ad — never two. Concrete language over abstract ("save 2 hours" not "increase efficiency"). Visual hierarchy that guides the eye. CTA tells exactly what happens next.',
    avoidThis: 'Over-simplification can patronize a sophisticated audience. B2B/professional verticals need enough complexity to signal understanding of their world.',
    exampleFramework: 'Hook: "[One clear benefit in 6 words or fewer]" → Body: "[How] in one sentence" → CTA: "[Exact next step]"',
    ctaStyle: 'Crystal clear: "Get Started in 2 Minutes" / "See How It Works"',
    bestAt: ['UNAWARE', 'PAIN_AWARE'],
  },
  CURIOSITY_GAP: {
    mechanism: 'Partial information creates an intrinsically motivated drive to close the gap. The discomfort of incomplete knowledge is stronger than the neutral state.',
    doThis: 'Headlines that imply a counterintuitive insight. Open loops that the landing page closes. Information the audience didn\'t know they were missing.',
    avoidThis: 'Clickbait that doesn\'t deliver destroys trust permanently. One bad curiosity gap execution poisons the well for future campaigns.',
    exampleFramework: 'Hook: "The [thing they track/do] that actually [counterintuitive result]" → Body: Hint at the answer without revealing → CTA: "Find Out Why"',
    ctaStyle: 'Discovery: "See What You\'re Missing" / "Learn the Truth"',
    bestAt: ['UNAWARE', 'PAIN_AWARE'],
  },
  ENDOWMENT_EFFECT: {
    mechanism: 'People value things they already possess (or feel they possess) more than equivalent things they don\'t. Make non-purchase feel like a loss.',
    doThis: 'Use ownership language before purchase: "your dashboard" / "your results." Free trial framing as "yours to try." Personalization that makes it feel configured for them.',
    avoidThis: 'Works primarily at BOFU/Product Aware. Applied at awareness stages, it confuses people who haven\'t decided the product is relevant.',
    exampleFramework: 'Hook: "Your [product/result] is waiting" → Body: "Already configured for [their situation]" → CTA: "Claim Yours"',
    ctaStyle: 'Ownership: "Claim Your [X]" / "Your [X] Is Ready"',
    bestAt: ['PRODUCT_AWARE', 'MOST_AWARE'],
  },
  REACTANCE: {
    mechanism: 'When people feel their freedom of choice is threatened, they want the restricted option more. Pressure tactics often REDUCE purchase intent.',
    doThis: 'Use as ANTI-PATTERN guide: grant explicit control. "You decide" / "No commitment required" / "Cancel any time." Reduce defensive response by removing pressure.',
    avoidThis: 'Never use this trigger as the primary sales mechanism. Hard sells, countdown timers, and "last chance" language create resistance at MOFU.',
    exampleFramework: 'Hook: "No pressure. No tricks." → Body: "Take your time. We\'re here when you\'re ready." → CTA: "Explore at Your Pace"',
    ctaStyle: 'Low-pressure: "No Commitment" / "Try Risk-Free"',
    bestAt: ['SOLUTION_AWARE', 'PRODUCT_AWARE'],
  },
  RECIPROCITY: {
    mechanism: 'When someone gives us something of value, we feel psychological obligation to reciprocate. The give must feel genuine and unprompted.',
    doThis: 'Lead magnet that is actually useful, not a thinly veiled pitch. Content that solves the problem partially before asking. Free audit/diagnosis/tool with real value.',
    avoidThis: 'When the "gift" is perceived as manipulation, reciprocity inverts — audience feels resentment. The quality of the free value is the entire bet.',
    exampleFramework: 'Hook: "Free [genuinely useful thing] — no email required" → Body: Deliver real value upfront → CTA: "Get Your Free [X]"',
    ctaStyle: 'Gift: "Get Your Free [X]" / "Download Now — It\'s Yours"',
    bestAt: ['PAIN_AWARE', 'SOLUTION_AWARE'],
  },
  CONTRAST_EFFECT: {
    mechanism: 'The brain evaluates options relative to reference points, not in absolute terms. By controlling the comparison, you control the evaluation.',
    doThis: 'Anchor to a more expensive alternative before presenting your price. Show cost of the problem before cost of the solution. Premium tier makes middle tier feel like a deal.',
    avoidThis: 'If the anchor isn\'t credible or the comparison invalid, the frame collapses. Comparing a $50 product to $500 only works if the audience considers both.',
    exampleFramework: 'Hook: "Most [category] costs [high anchor]. This one doesn\'t." → Body: Why you get more for less → CTA: "See the Difference"',
    ctaStyle: 'Value comparison: "Compare Now" / "See Why This Wins"',
    bestAt: ['SOLUTION_AWARE', 'PRODUCT_AWARE'],
  },
  PEAK_END_RULE: {
    mechanism: 'People remember experiences based on peak emotional moment + ending. The hook is the peak; the CTA is the ending.',
    doThis: 'Hook must land within 3 seconds (video) or first line (static) — this is the peak. CTA must close the emotional arc opened by the hook. Post-purchase email continues the arc.',
    avoidThis: 'Weak hook = no peak to anchor memory. Disconnected CTA = broken arc. The combination of opening and closing must form a complete emotional unit.',
    exampleFramework: 'Hook: [Strongest emotional moment — surprise, delight, recognition] → Body: Build on that emotion → CTA: [Resolve the emotion with a clear action]',
    ctaStyle: 'Arc-closing: ties back to the hook emotionally',
    bestAt: ['PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE'],
  },
  SCARCITY: {
    mechanism: 'Perceived scarcity increases desire. What is rare is valued more, independent of absolute quality. ONLY real scarcity works long-term.',
    doThis: 'Real scarcity only: limited inventory, limited time, limited access. Specific quantities ("12 left") not vague urgency. Time-bound only if the deadline is enforced.',
    avoidThis: 'Fake countdown timers and fabricated "only 3 left" messages work once and destroy trust permanently. In a world of repeated ad exposure, artificial scarcity is a one-use weapon.',
    exampleFramework: 'Hook: "[Specific number] left / [Real deadline]" → Body: Why this is genuinely scarce → CTA: "Secure Yours Before [Deadline]"',
    ctaStyle: 'Urgency: "Get It Before It\'s Gone" / "Only X Left"',
    bestAt: ['PRODUCT_AWARE', 'MOST_AWARE'],
  },
  COMMITMENT_CONSISTENCY: {
    mechanism: 'Once committed to a position, people feel pressure to behave consistently. Small yeses lead to larger yeses.',
    doThis: 'Quiz or assessment that leads to a personalized recommendation. Low-friction micro-conversion before the main ask. Reference prior actions: "Since you downloaded the guide..."',
    avoidThis: 'Doesn\'t work on cold audiences with no prior commitment to build on. Only effective in retargeting/nurture sequences.',
    exampleFramework: 'Hook: "You already [prior action] — here\'s the next step" → Body: Build on their prior commitment → CTA: "Continue Your Journey"',
    ctaStyle: 'Continuation: "Take the Next Step" / "Keep Going"',
    bestAt: ['MOST_AWARE'],
  },
};

/**
 * Returns the copy pattern for a given trigger.
 */
export function getTriggerCopyPattern(trigger: PsychTrigger): TriggerCopyPattern {
  return TRIGGER_COPY_PATTERNS[trigger];
}

/**
 * Build a trigger-specific system prompt section for AI copy generation.
 */
export function buildTriggerPromptSection(
  primaryTrigger: PsychTrigger,
  secondaryTrigger: PsychTrigger | undefined,
  awarenessLevel: string,
  emotionalState: string,
  primaryObjection: string,
): string {
  const primary = TRIGGER_COPY_PATTERNS[primaryTrigger];
  const secondary = secondaryTrigger ? TRIGGER_COPY_PATTERNS[secondaryTrigger] : null;

  let prompt = `
## PSYCHOLOGICAL TRIGGER INSTRUCTIONS

### Primary Trigger: ${primaryTrigger}
**Mechanism**: ${primary.mechanism}
**DO THIS**: ${primary.doThis}
**AVOID THIS**: ${primary.avoidThis}
**Framework**: ${primary.exampleFramework}
**CTA Style**: ${primary.ctaStyle}
`;

  if (secondary) {
    prompt += `
### Secondary Trigger: ${secondaryTrigger}
**Mechanism**: ${secondary.mechanism}
**DO THIS**: ${secondary.doThis}
**Framework**: ${secondary.exampleFramework}
`;
  }

  prompt += `
### Audience State
- **Awareness Level**: ${awarenessLevel}
- **Emotional State**: ${emotionalState}
- **Primary Objection**: "${primaryObjection}"

### Copy Requirements
1. Generate 3 ad copy variants.
2. Variants 1-2: Use ONLY the primary trigger (${primaryTrigger}) as the core mechanism.
3. Variant 3: Combine primary (${primaryTrigger}) + secondary (${secondaryTrigger ?? 'none'}) triggers.
4. EVERY variant must directly address the objection: "${primaryObjection}"
5. Calibrate complexity to awareness level:
   - ${awarenessLevel === 'UNAWARE' ? 'UNAWARE: Longer hooks with pattern-interrupts. Don\'t mention the product category. Focus on the emotional state.' : awarenessLevel === 'PAIN_AWARE' ? 'PAIN_AWARE: Name the pain precisely. They should feel seen. Don\'t pitch yet.' : awarenessLevel === 'SOLUTION_AWARE' ? 'SOLUTION_AWARE: Show proof and differentiation. They\'re comparing options.' : awarenessLevel === 'PRODUCT_AWARE' ? 'PRODUCT_AWARE: Address the specific objection. They already know you exist.' : 'MOST_AWARE: Direct CTA. They\'re ready. Give them a reason to act now.'}
`;

  return prompt;
}
