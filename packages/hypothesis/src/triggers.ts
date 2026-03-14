export interface TriggerDefinition {
  readonly id: string;
  readonly name: string;
  readonly mechanism: string;
  readonly howToImplement: readonly string[];
  readonly bestFor: {
    readonly awarenessLevels: readonly string[];
    readonly funnelStages: readonly string[];
    readonly verticals: readonly string[];
  };
  readonly antiPatterns: readonly string[];
  readonly failureMode: string;
}

export const TRIGGER_LIBRARY: Record<string, TriggerDefinition> = {
  LOSS_AVERSION: {
    id: 'LOSS_AVERSION',
    name: 'Loss Aversion',
    mechanism:
      'People feel losses ~2x more intensely than equivalent gains (Kahneman & Tversky). Framing an offer around what the prospect will miss out on creates stronger motivation than framing it around what they will gain.',
    howToImplement: [
      'Frame the headline around what they lose by not acting: "Stop losing $X/month to..."',
      'Show a "before vs after" where "before" emphasizes the pain state they stay in without the product',
      'Use countdown timers on offers to trigger fear of missing out on the deal itself',
      'Include testimonials that reference what life was like before — the cost of inaction',
      'Add a "cost of waiting" calculator that quantifies daily/weekly losses',
    ],
    bestFor: {
      awarenessLevels: ['PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['ECOMMERCE_DTC', 'SAAS', 'FITNESS', 'HOME'],
    },
    antiPatterns: [
      'Using with UNAWARE audiences who do not yet feel the pain',
      'Over-relying on negative framing to the point the brand feels fear-mongering',
      'Combining with fake urgency — loss framing must be truthful to build trust',
    ],
    failureMode:
      'If the audience does not yet believe they have a problem, loss framing falls flat or feels manipulative. High CTR but low CVR signals the hook worked but the landing page did not sustain the emotional frame.',
  },

  SOCIAL_PROOF_SPECIFICITY: {
    id: 'SOCIAL_PROOF_SPECIFICITY',
    name: 'Social Proof (Specificity)',
    mechanism:
      'Specific numbers and details in social proof are more persuasive than vague claims. "12,847 customers" beats "thousands of customers" because specificity signals truth and reduces skepticism.',
    howToImplement: [
      'Use exact customer counts or order numbers: "Join 12,847 customers who switched"',
      'Show real-time purchase notifications: "Sarah from Austin bought 3 minutes ago"',
      'Display granular review stats: "4.8 stars from 2,341 verified reviews"',
      'Include specific outcome metrics from customers: "Average 23% improvement in 14 days"',
      'Reference specific time frames: "847 orders in the last 48 hours"',
    ],
    bestFor: {
      awarenessLevels: ['SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['ECOMMERCE_DTC', 'FOOD_BEVERAGE', 'BEAUTY', 'FITNESS', 'PETS'],
    },
    antiPatterns: [
      'Using round numbers that feel fabricated ("10,000 happy customers")',
      'Showing social proof before establishing the problem — proof of what?',
      'Faking specificity with made-up numbers — audiences detect inauthenticity quickly',
    ],
    failureMode:
      'If the numbers are too small, specificity backfires ("17 people bought this" signals low demand). Also fails when the audience does not identify with the reference group.',
  },

  SOCIAL_PROOF_AUTHORITY: {
    id: 'SOCIAL_PROOF_AUTHORITY',
    name: 'Social Proof (Authority)',
    mechanism:
      'People defer to recognized experts, institutions, and high-status individuals when making decisions under uncertainty. Authority endorsements transfer trust from a known entity to an unknown product.',
    howToImplement: [
      'Feature endorsements from recognized experts or industry figures with name + credential',
      'Display media logos ("As seen in Forbes, TechCrunch, NYT") prominently above the fold',
      'Include certifications, awards, or clinical study references with specific details',
      'Show partnerships with respected brands or institutions',
      'Use expert-authored content or quotes with photo + title for authenticity',
    ],
    bestFor: {
      awarenessLevels: ['SOLUTION_AWARE', 'PRODUCT_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['SAAS', 'BEAUTY', 'FITNESS', 'FOOD_BEVERAGE'],
    },
    antiPatterns: [
      'Citing obscure authorities nobody recognizes — that is just a testimonial, not authority',
      'Placing authority proof after the CTA where visitors have already bounced',
      'Using authority from an unrelated domain (celebrity endorsing B2B software)',
    ],
    failureMode:
      'Fails when the authority is not respected by the specific target audience. A doctor endorsing a supplement works for health-conscious buyers but not for taste-driven food shoppers.',
  },

  IDENTITY_TRIBAL: {
    id: 'IDENTITY_TRIBAL',
    name: 'Identity (Tribal)',
    mechanism:
      'People make purchasing decisions to signal belonging to their in-group. When a product is positioned as "for people like us," it activates tribal identity and creates purchase motivation through social belonging rather than product features.',
    howToImplement: [
      'Use identity-based headlines: "Built for [specific tribe]" or "The [tribe] choice"',
      'Show UGC and community content that reflects the target tribe authentically',
      'Create exclusive language, rituals, or references that insiders recognize',
      'Position the product against an out-group: "Not for everyone — made for [tribe]"',
      'Build community elements into the funnel: member counts, community previews, shared values',
    ],
    bestFor: {
      awarenessLevels: ['PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE'],
      funnelStages: ['TOFU', 'MOFU'],
      verticals: ['FITNESS', 'FOOD_BEVERAGE', 'PETS', 'BEAUTY'],
    },
    antiPatterns: [
      'Being too broad with tribal identity — "for everyone" is the opposite of tribal',
      'Misunderstanding the tribe and using cringe language that insiders reject',
      'Excluding potential customers unnecessarily by making the tribe too narrow',
    ],
    failureMode:
      'Backfires catastrophically when the brand misreads the tribe culture. Signals inauthenticity and triggers rejection. High bounce rate + negative sentiment in comments.',
  },

  IDENTITY_ASPIRATIONAL: {
    id: 'IDENTITY_ASPIRATIONAL',
    name: 'Identity (Aspirational)',
    mechanism:
      'People buy products that represent who they want to become, not just who they are. Aspirational identity positioning taps into the "future self" and makes the product a bridge between current state and desired identity.',
    howToImplement: [
      'Show the aspirational outcome state in hero imagery — the life after the product',
      'Use "become" language: "Become the person who..." or "Step into your..."',
      'Feature transformation stories with before/after that focus on identity shift, not just results',
      'Position the product as a tool of the aspirational identity: "The daily ritual of top performers"',
      'Create status signaling through packaging, branding, or exclusive tiers',
    ],
    bestFor: {
      awarenessLevels: ['PAIN_AWARE', 'SOLUTION_AWARE'],
      funnelStages: ['TOFU', 'MOFU'],
      verticals: ['FITNESS', 'BEAUTY', 'FOOD_BEVERAGE', 'ECOMMERCE_DTC'],
    },
    antiPatterns: [
      'Making the aspiration so unrealistic it triggers disbelief instead of motivation',
      'Shaming the current state — aspirational should inspire, not make people feel bad',
      'Using aspirational messaging for utilitarian products where function matters more',
    ],
    failureMode:
      'If the gap between current identity and aspirational identity is too large, it triggers avoidance instead of approach motivation. The prospect thinks "that is not for someone like me."',
  },

  COGNITIVE_EASE: {
    id: 'COGNITIVE_EASE',
    name: 'Cognitive Ease',
    mechanism:
      'When information is easy to process, people evaluate it more favorably and are more likely to act. Reducing cognitive load at every step increases conversion because the brain interprets fluency as a signal of truth and safety.',
    howToImplement: [
      'Simplify the headline to one clear idea — cut every unnecessary word',
      'Use visual hierarchy to guide the eye: one focal point, clear CTA, minimal competing elements',
      'Reduce form fields to the absolute minimum and use smart defaults',
      'Show the product in use rather than abstract lifestyle shots — make the value instantly obvious',
      'Use familiar patterns and layouts that match what the audience expects from the category',
    ],
    bestFor: {
      awarenessLevels: ['UNAWARE', 'PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['TOFU', 'MOFU', 'BOFU'],
      verticals: ['ECOMMERCE_DTC', 'FOOD_BEVERAGE', 'SAAS', 'FITNESS', 'BEAUTY', 'HOME', 'PETS', 'OTHER'],
    },
    antiPatterns: [
      'Oversimplifying to the point of losing meaning — clarity is not dumbing down',
      'Removing important trust signals in pursuit of minimalism',
      'Making things look too simple for premium/luxury positioning where complexity signals value',
    ],
    failureMode:
      'Rarely fails outright but can lead to generic, forgettable creative. High impressions but low recall. Works best as a multiplier combined with another primary trigger.',
  },

  CURIOSITY_GAP: {
    id: 'CURIOSITY_GAP',
    name: 'Curiosity Gap',
    mechanism:
      'When people perceive a gap between what they know and what they want to know, they experience an irresistible urge to close that gap. Opening a curiosity loop in the ad drives clicks; the landing page must close the loop to convert.',
    howToImplement: [
      'Open with a surprising or counterintuitive claim: "The #1 mistake 90% of [audience] make"',
      'Use "hidden" or "secret" framing: "The ingredient dermatologists do not want you to know about"',
      'Ask a question the reader cannot answer without clicking: "What happens when you..."',
      'Tease a specific result without revealing the method: "How she grew revenue 340% (not what you think)"',
      'Use numbered lists that imply valuable knowledge: "7 signals your [problem] is about to get worse"',
    ],
    bestFor: {
      awarenessLevels: ['UNAWARE', 'PAIN_AWARE'],
      funnelStages: ['TOFU'],
      verticals: ['ECOMMERCE_DTC', 'BEAUTY', 'FITNESS', 'FOOD_BEVERAGE', 'SAAS'],
    },
    antiPatterns: [
      'Clickbait that the landing page does not deliver on — kills trust and tanks CVR',
      'Using curiosity gap for BOFU retargeting where the audience already knows the product',
      'Opening too many loops without closing any — creates confusion, not curiosity',
    ],
    failureMode:
      'High CTR but terrible CVR is the classic failure mode. The gap was opened but the landing page did not satisfy it, or the revealed answer was underwhelming. Also fails with MOST_AWARE audiences who already know the answer.',
  },

  ENDOWMENT_EFFECT: {
    id: 'ENDOWMENT_EFFECT',
    name: 'Endowment Effect',
    mechanism:
      'People value things more once they feel ownership over them. By creating a sense of psychological ownership before purchase — through trials, customization, or visualization — you increase the perceived switching cost of not buying.',
    howToImplement: [
      'Offer free trials or samples that let the customer experience ownership before committing',
      'Use product customization or configurators that invest the user in "their" version',
      'Show the product in the customer context: "Your personalized plan" or AR try-on experiences',
      'Use possessive language in copy: "Your [product]", "Claim your...", "Keep your..."',
      'Send follow-up messaging after trial that references what they will lose: "Your plan expires in 24h"',
    ],
    bestFor: {
      awarenessLevels: ['PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['BOFU', 'RETENTION'],
      verticals: ['SAAS', 'BEAUTY', 'ECOMMERCE_DTC', 'FITNESS'],
    },
    antiPatterns: [
      'Trying to create ownership before establishing desire — the prospect must want it first',
      'Making trials or samples too generous, removing urgency to convert',
      'Using possessive language without actual personalization — feels hollow',
    ],
    failureMode:
      'Fails when the trial or sample experience is poor — you create ownership of a bad experience. Also fails for low-consideration impulse purchases where the buyer does not need to feel ownership.',
  },

  REACTANCE: {
    id: 'REACTANCE',
    name: 'Reactance',
    mechanism:
      'When people feel their freedom of choice is threatened, they become motivated to restore it by doing the opposite of what is asked. In marketing, strategic reactance means using reverse psychology or acknowledging the pressure to sell, which paradoxically builds trust.',
    howToImplement: [
      'Use "anti-sell" copy: "This product is not for everyone" or "Do not buy this if..."',
      'Acknowledge the sales context honestly: "Yes, this is an ad. Here is why we think you should care anyway"',
      'Give the audience explicit permission NOT to buy: "If this does not resonate, we respect that"',
      'Challenge the audience: "Most people will ignore this. The 3% who act will..."',
      'Frame the product as forbidden or exclusive: "We almost did not release this publicly"',
    ],
    bestFor: {
      awarenessLevels: ['SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['ECOMMERCE_DTC', 'FOOD_BEVERAGE', 'BEAUTY', 'FITNESS'],
    },
    antiPatterns: [
      'Being so anti-sell that you actually convince people not to buy',
      'Using reactance with UNAWARE audiences who have no baseline desire to push against',
      'Combining with aggressive urgency — the anti-sell tone contradicts "BUY NOW" pressure',
    ],
    failureMode:
      'Backfires when the audience takes the "do not buy" message literally. Also fails in high-trust categories where direct, straightforward selling is expected (B2B, enterprise).',
  },

  RECIPROCITY: {
    id: 'RECIPROCITY',
    name: 'Reciprocity',
    mechanism:
      'When someone gives us something of value, we feel an obligation to give back. Providing genuine value upfront — free content, tools, samples — creates a psychological debt that increases conversion and willingness to pay.',
    howToImplement: [
      'Lead with a genuinely valuable free resource: guide, tool, quiz, or calculator',
      'Offer unexpected bonuses or gifts with purchase that feel generous, not transactional',
      'Provide free personalized advice or consultations before asking for the sale',
      'Share proprietary data, research, or insights the audience cannot get elsewhere',
      'Create a "give first" email sequence: 3 value emails before any pitch',
    ],
    bestFor: {
      awarenessLevels: ['PAIN_AWARE', 'SOLUTION_AWARE'],
      funnelStages: ['TOFU', 'MOFU'],
      verticals: ['SAAS', 'FITNESS', 'BEAUTY', 'ECOMMERCE_DTC', 'HOME'],
    },
    antiPatterns: [
      'Gating mediocre content and calling it a "free gift" — the value must be real',
      'Immediately following the gift with aggressive hard-sell that breaks the reciprocity frame',
      'Offering discounts as reciprocity — this is just a price reduction, not a gift',
    ],
    failureMode:
      'Fails when the free value is perceived as low quality or a bait-and-switch. Also fails if the ask comes too quickly after the gift — reciprocity needs a moment to develop.',
  },

  CONTRAST_EFFECT: {
    id: 'CONTRAST_EFFECT',
    name: 'Contrast Effect',
    mechanism:
      'People evaluate options not in absolute terms but relative to adjacent alternatives. By controlling what the product is compared against, you can make its value proposition dramatically more compelling. Anchoring, decoy pricing, and before/after all leverage contrast.',
    howToImplement: [
      'Use price anchoring: show the higher-priced option first, then the target option feels like a deal',
      'Create a decoy option: a slightly worse product at nearly the same price makes the target option obvious',
      'Show before/after comparisons with the same person or scenario for maximum contrast',
      'Compare total cost vs. alternatives: "Less than your daily coffee" or "$3/day vs $200/month gym"',
      'Position against the competitor explicitly: feature comparison tables with strategic column ordering',
    ],
    bestFor: {
      awarenessLevels: ['SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['SAAS', 'ECOMMERCE_DTC', 'FITNESS', 'HOME'],
    },
    antiPatterns: [
      'Making the decoy too obviously a decoy — sophisticated buyers see through it',
      'Comparing against a straw man that nobody actually considers — it must be a real alternative',
      'Using competitor comparisons that invite legal issues or brand backlash',
    ],
    failureMode:
      'Fails when the comparison anchor is not credible. If the audience does not believe the higher price is real, the contrast effect collapses. Also fails in categories with well-known price points.',
  },

  PEAK_END_RULE: {
    id: 'PEAK_END_RULE',
    name: 'Peak-End Rule',
    mechanism:
      'People judge an experience based primarily on the peak (most intense moment) and the end, not the average. Designing the most memorable and final moments of the customer experience disproportionately shapes perception and repeat purchase behavior.',
    howToImplement: [
      'Design an "unboxing moment" that creates a peak emotional experience on delivery',
      'Send a personalized, unexpected follow-up after purchase: handwritten note, bonus sample, or thank-you video',
      'Make the final step of checkout delightful: animated confirmation, surprise discount on next order',
      'Create a memorable first-use experience: guided onboarding with an early "aha" moment',
      'End email sequences on a high note: exclusive content, community invitation, or recognition',
    ],
    bestFor: {
      awarenessLevels: ['PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['BOFU', 'RETENTION'],
      verticals: ['ECOMMERCE_DTC', 'FOOD_BEVERAGE', 'BEAUTY', 'PETS'],
    },
    antiPatterns: [
      'Investing in peak moments but having a terrible return/support experience that becomes the "end"',
      'Creating an amazing unboxing but a mediocre product — the peak must be authentic',
      'Ignoring the end: final emails, shipping notifications, post-purchase silence',
    ],
    failureMode:
      'Fails when the operational experience contradicts the marketing promise. A beautiful ad and terrible shipping experience means the "end" is negative, which dominates memory.',
  },

  SCARCITY: {
    id: 'SCARCITY',
    name: 'Scarcity (General)',
    mechanism:
      'When availability is limited, perceived value increases. Scarcity triggers urgency and FOMO, accelerating the decision timeline. Works because humans weight potential losses more heavily than potential gains.',
    howToImplement: [
      'Show real inventory levels: "Only 12 left in stock" with live counter',
      'Use batch or drop-based releases: "Batch #4 — limited to 500 units"',
      'Display "selling fast" indicators based on actual purchase velocity',
      'Create seasonal or limited-edition variants that are genuinely temporary',
      'Show social proof of scarcity: "847 people viewing this right now"',
    ],
    bestFor: {
      awarenessLevels: ['PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['BOFU'],
      verticals: ['ECOMMERCE_DTC', 'FOOD_BEVERAGE', 'BEAUTY', 'HOME'],
    },
    antiPatterns: [
      'Fake scarcity that resets ("Only 2 left!" every day) — destroys trust permanently',
      'Using scarcity too early in the funnel before desire is established',
      'Combining every type of scarcity at once — feels desperate, not exclusive',
    ],
    failureMode:
      'Audiences are increasingly scarcity-immune due to overuse. Fails when the scarcity is obviously manufactured. Also backfires with UNAWARE audiences who have no desire yet — urgency without desire is just pressure.',
  },

  COMMITMENT_CONSISTENCY: {
    id: 'COMMITMENT_CONSISTENCY',
    name: 'Commitment & Consistency',
    mechanism:
      'Once people make a small commitment (even a micro-action), they become psychologically motivated to behave consistently with that commitment. The "foot in the door" technique leverages this: start with a small ask, then escalate.',
    howToImplement: [
      'Start with a micro-commitment: quiz, calculator, free sample request, or email opt-in',
      'Use progressive profiling: ask one question at a time rather than a long form',
      'Get public commitments: reviews, social shares, or community introductions',
      'Reference past behavior: "Since you already [action], you might also want..."',
      'Create identity-reinforcing milestones: "You are 67% of the way to [goal]"',
    ],
    bestFor: {
      awarenessLevels: ['PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE'],
      funnelStages: ['TOFU', 'MOFU', 'BOFU'],
      verticals: ['SAAS', 'FITNESS', 'ECOMMERCE_DTC', 'BEAUTY'],
    },
    antiPatterns: [
      'Making the initial commitment too large — defeats the purpose of foot-in-the-door',
      'Not connecting the small commitment to the larger ask — consistency needs a logical bridge',
      'Being manipulative about the escalation — if it feels like a trap, trust is gone',
    ],
    failureMode:
      'Fails when the gap between the micro-commitment and the ask is too large or too obvious. Also fails if the initial commitment was made under pressure rather than freely — forced commitments do not create consistency pressure.',
  },

  AUTONOMY_BIAS: {
    id: 'AUTONOMY_BIAS',
    name: 'Autonomy Bias',
    mechanism:
      'People are more motivated and satisfied when they feel they are making their own choices rather than being told what to do. Offering structured choices and control increases engagement and reduces resistance to the sale.',
    howToImplement: [
      'Offer 2-3 clear options: "Choose your plan" or "Pick your bundle" rather than one take-it-or-leave-it offer',
      'Use "build your own" or customization features that give control to the buyer',
      'Frame recommendations as suggestions, not directives: "You might like..." not "You need..."',
      'Let customers control the pace: self-guided demos, skip-able onboarding, adjustable subscriptions',
      'Provide transparent comparison tools that let the customer reach their own conclusion',
    ],
    bestFor: {
      awarenessLevels: ['SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['SAAS', 'ECOMMERCE_DTC', 'FITNESS', 'HOME', 'BEAUTY'],
    },
    antiPatterns: [
      'Offering too many choices, triggering decision paralysis (the paradox of choice)',
      'Making the "autonomous" choice obvious to the point it feels patronizing',
      'Removing all guidance — some curation is helpful, especially for new categories',
    ],
    failureMode:
      'Fails when too many options are presented and the buyer freezes. The optimal is 2-3 options with a clear recommended choice. Also fails for impulse purchases where quick, decisive framing works better.',
  },

  SCARCITY_REAL: {
    id: 'SCARCITY_REAL',
    name: 'Scarcity (Real / Inventory)',
    mechanism:
      'Real, verifiable scarcity based on actual inventory constraints or production limits. Unlike manufactured urgency, real scarcity is sustainable and builds brand credibility because the constraint is genuine and visible.',
    howToImplement: [
      'Show actual inventory counts synced from your warehouse system',
      'Use batch numbering: "Batch #7 of 12 — 23 remaining"',
      'Explain the genuine constraint: small-batch production, seasonal ingredient, artisan-made',
      'Send "back in stock" notifications that prove the scarcity was real',
      'Display waitlist counts when sold out to validate demand',
    ],
    bestFor: {
      awarenessLevels: ['PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['BOFU'],
      verticals: ['FOOD_BEVERAGE', 'BEAUTY', 'ECOMMERCE_DTC', 'HOME'],
    },
    antiPatterns: [
      'Claiming real scarcity when inventory is plentiful — one exposure destroys credibility',
      'Not actually restocking or having a waitlist — real scarcity needs real follow-through',
      'Using real scarcity for commodity products where the audience can easily substitute',
    ],
    failureMode:
      'Fails if customers discover the scarcity is not real. Also fails for products where the audience does not care about exclusivity — they just want the product available when they need it.',
  },

  SCARCITY_URGENCY: {
    id: 'SCARCITY_URGENCY',
    name: 'Scarcity (Time Urgency)',
    mechanism:
      'Time-limited offers create a deadline that compresses the decision timeline. Works because the cost of missing out increases as the deadline approaches, overcoming the default human tendency to procrastinate.',
    howToImplement: [
      'Use countdown timers tied to real deadlines: sale end dates, shipping cutoffs, seasonal events',
      'Create genuine time-limited bundles: "Holiday bundle available until Dec 20"',
      'Tie urgency to an external event: "Order by Friday for Mother s Day delivery"',
      'Use escalating pricing: "Price increases $10 every 24 hours"',
      'Send deadline reminder sequences: 48h, 24h, 6h, 1h before expiration',
    ],
    bestFor: {
      awarenessLevels: ['PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['BOFU'],
      verticals: ['ECOMMERCE_DTC', 'FOOD_BEVERAGE', 'BEAUTY', 'HOME', 'PETS'],
    },
    antiPatterns: [
      'Evergreen countdown timers that reset per visitor — the most common trust-killer in DTC',
      'Setting deadlines so far out they create no urgency (30-day sale = no urgency)',
      'Running "urgent" sales every week — audience learns to wait for the next one',
    ],
    failureMode:
      'Audiences are highly trained to detect fake urgency. If your timer resets or your "last chance" sale repeats monthly, you train the audience to ignore urgency signals entirely. Credibility damage is permanent.',
  },

  SOCIAL_PROOF_SPECIFIC: {
    id: 'SOCIAL_PROOF_SPECIFIC',
    name: 'Social Proof (Specific Outcomes)',
    mechanism:
      'Testimonials and case studies that cite specific, measurable outcomes are more persuasive than generic praise. Specificity adds credibility and allows the prospect to mentally project similar results onto their own situation.',
    howToImplement: [
      'Feature customer stories with exact metrics: "Increased revenue 47% in 3 months"',
      'Use video testimonials where customers share specific before/after numbers',
      'Create detailed case studies with timeline, metrics, and methodology',
      'Show aggregated outcome data: "Our average customer sees X result in Y timeframe"',
      'Include the customer demographic details so the prospect can self-identify: "As a busy mom of 3..."',
    ],
    bestFor: {
      awarenessLevels: ['SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'],
      funnelStages: ['MOFU', 'BOFU'],
      verticals: ['SAAS', 'FITNESS', 'BEAUTY', 'ECOMMERCE_DTC', 'FOOD_BEVERAGE'],
    },
    antiPatterns: [
      'Cherry-picking outlier results that typical customers cannot replicate',
      'Using stock photos with testimonials — real photos are essential for credibility',
      'Showing results without context: "Lost 30 lbs" means nothing without timeframe and starting point',
    ],
    failureMode:
      'Fails when the cited outcomes feel too good to be true, triggering skepticism instead of belief. Also fails when the testimonial subject does not match the target audience demographic — the prospect cannot see themselves in the story.',
  },
};
