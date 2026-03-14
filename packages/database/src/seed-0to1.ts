// ──────────────────────────────────────────────────────────────
// 0to1 — Seed demo data for hedge fund marketing OS
// Seeds 1 demo client + 6 hypotheses (3 WIN, 2 LOSS, 1 LIVE)
// ──────────────────────────────────────────────────────────────

import { prisma } from './client';

async function seed0to1(): Promise<void> {
  console.log('🌱 Seeding 0to1 demo data...');

  // Ensure we have an organization (use first one, or create demo)
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: '0to1 Demo Agency' },
    });
  }

  // Upsert demo client: Meat N' Bone
  const client = await prisma.client.upsert({
    where: { id: 'demo-client-mnb' },
    update: {},
    create: {
      id: 'demo-client-mnb',
      organizationId: org.id,
      name: "Meat N' Bone",
      vertical: 'FOOD_BEVERAGE',
      baselineROAS: 2.5,
      targetROAS: 4.0,
      monthlyAdSpend: 25000,
      metaAccountId: 'act_demo_mnb',
      feeStructure: {
        baseRetainer: 5000,
        perfFeePercent: 15,
        benchmarkROAS: 2.5,
      },
    },
  });

  console.log(`  ✓ Client: ${client.name} (${client.id})`);

  // 6 hypotheses: 3 WINNER, 2 LOSER, 1 LIVE
  const hypotheses = [
    // ── WINNER 1: Loss Aversion on subscription churn ──
    {
      id: 'demo-hyp-001',
      clientId: client.id,
      title: 'Loss-framed subscription retention for lapsed members',
      trigger: 'LOSS_AVERSION' as const,
      triggerMechanism: 'Lapsed subscribers are PAIN_AWARE — they know they miss the convenience. Framing the cost of NOT resubscribing (ordering individual cuts at 40% higher prices) activates loss aversion more strongly than gain-framing the subscription discount.',
      awarenessLevel: 'PAIN_AWARE' as const,
      audience: 'Lapsed subscribers (3-6 months inactive), previously ordered 3+ times, AOV > $120',
      funnelStage: 'RETENTION' as const,
      creativeAngle: 'Show the price difference between subscription and one-off orders for their most-purchased items',
      copyHook: "You're paying 40% more for the same cuts you used to get on auto-ship.",
      primaryEmotion: 'frustrated',
      primaryObjection: 'I forgot about it / it was inconvenient to manage',
      conviction: 4,
      budgetUSD: 3500,
      durationDays: 14,
      falsificationCondition: 'We declare this wrong if ROAS < 3.0 after 7 days with at least $1000 spent',
      expectedROAS: 4.5,
      expectedCTR: 2.8,
      expectedCVR: 4.2,
      status: 'WINNER' as const,
      metaCampaignId: 'camp_demo_001',
      launchedAt: new Date('2026-01-15'),
      closedAt: new Date('2026-01-29'),
      actualROAS: 5.2,
      actualCTR: 3.1,
      actualCVR: 4.8,
      actualSpend: 3200,
      actualRevenue: 16640,
      delta: 0.7,
      verdict: 'WIN' as const,
      lesson: 'Loss framing on subscription re-activation outperformed gain framing by 45%. The key was specificity — showing THEIR most-purchased items with real price deltas, not generic "save 40%" messaging. The audience already valued the product; they needed a reason to re-engage NOW.',
      triggerEffective: true,
    },
    // ── WINNER 2: Social Proof specificity on premium cuts ──
    {
      id: 'demo-hyp-002',
      clientId: client.id,
      title: 'Chef endorsement social proof for A5 Wagyu collection',
      trigger: 'SOCIAL_PROOF_AUTHORITY' as const,
      triggerMechanism: 'PRODUCT_AWARE buyers comparing premium meat suppliers need authority validation to justify the price premium. Chef endorsements create borrowed credibility — "if Michelin chefs choose this, the quality is real."',
      awarenessLevel: 'PRODUCT_AWARE' as const,
      audience: 'High-intent visitors who viewed A5 Wagyu PDP 2+ times without purchasing, household income $150K+',
      funnelStage: 'BOFU' as const,
      creativeAngle: 'Video testimonial from Chef Maria Rodriguez, 2-star Michelin, explaining why she sources from MNB for her restaurant',
      copyHook: "The same A5 Wagyu that Chef Rodriguez serves at Marisol — now delivered to your door.",
      primaryEmotion: 'skeptical',
      primaryObjection: "Is this actually restaurant-quality or just marketing?",
      conviction: 5,
      budgetUSD: 5000,
      durationDays: 10,
      falsificationCondition: 'We declare this wrong if ROAS < 5.0 after 5 days or CTR < 2.0%',
      expectedROAS: 6.0,
      expectedCTR: 2.5,
      expectedCVR: 5.0,
      status: 'WINNER' as const,
      metaCampaignId: 'camp_demo_002',
      launchedAt: new Date('2026-02-01'),
      closedAt: new Date('2026-02-11'),
      actualROAS: 7.8,
      actualCTR: 3.4,
      actualCVR: 6.1,
      actualSpend: 4800,
      actualRevenue: 37440,
      delta: 1.8,
      verdict: 'WIN' as const,
      lesson: 'Authority social proof massively over-performed on the premium tier. The chef video had 4x the engagement of static ads. Key insight: the audience was skeptical, not price-sensitive. They WANTED to buy but needed permission from someone they respected. Authority > discount for this segment.',
      triggerEffective: true,
    },
    // ── WINNER 3: Curiosity Gap for new product launch ──
    {
      id: 'demo-hyp-003',
      clientId: client.id,
      title: 'Curiosity gap teaser for dry-aged program launch',
      trigger: 'CURIOSITY_GAP' as const,
      triggerMechanism: 'SOLUTION_AWARE audience knows dry-aging exists but hasn\'t tried at-home options. Opening an information gap ("What happens to a ribeye after 45 days in our aging room?") creates psychological tension that can only be resolved by clicking through.',
      awarenessLevel: 'SOLUTION_AWARE' as const,
      audience: 'Food enthusiasts who follow steak/BBQ content, 25-55, purchased beef online before',
      funnelStage: 'TOFU' as const,
      creativeAngle: 'Time-lapse video of the dry-aging process with a question overlay, reveal at the end',
      copyHook: "We left a $200 ribeye in a room for 45 days. Here's what happened.",
      primaryEmotion: 'curious',
      primaryObjection: 'Can you really dry-age at home quality?',
      conviction: 3,
      budgetUSD: 2000,
      durationDays: 7,
      falsificationCondition: 'We declare this wrong if CTR < 1.5% after 3 days or ROAS < 2.0 after 7 days',
      expectedROAS: 3.0,
      expectedCTR: 3.5,
      expectedCVR: 2.0,
      status: 'WINNER' as const,
      metaCampaignId: 'camp_demo_003',
      launchedAt: new Date('2026-02-15'),
      closedAt: new Date('2026-02-22'),
      actualROAS: 3.8,
      actualCTR: 4.2,
      actualCVR: 2.3,
      actualSpend: 2000,
      actualRevenue: 7600,
      delta: 0.8,
      verdict: 'WIN' as const,
      lesson: 'Curiosity gap works exceptionally well for TOFU on a novel product category. The time-lapse format was the star — 4.2% CTR is our highest ever for cold traffic. The question hook outperformed the statement hook by 2.1x. For future product launches, lead with process curiosity, not product features.',
      triggerEffective: true,
    },
    // ── LOSER 1: Scarcity on commodity product ──
    {
      id: 'demo-hyp-004',
      clientId: client.id,
      title: 'Scarcity countdown on weekly box (commodity SKU)',
      trigger: 'SCARCITY' as const,
      triggerMechanism: 'PRODUCT_AWARE audience who abandoned cart should respond to scarcity. Theory: "Only 12 boxes left this week" creates urgency to complete purchase before the option disappears.',
      awarenessLevel: 'PRODUCT_AWARE' as const,
      audience: 'Cart abandoners from last 7 days, weekly box product, any purchase history',
      funnelStage: 'BOFU' as const,
      creativeAngle: 'Countdown timer with remaining inventory count, dynamic creative',
      copyHook: "Only 12 Weekly Boxes left — your cart expires tonight.",
      primaryEmotion: 'anxious',
      primaryObjection: "I'll order later / not sure I need it this week",
      conviction: 2,
      budgetUSD: 1500,
      durationDays: 7,
      falsificationCondition: 'We declare this wrong if ROAS < 3.0 after 4 days or if unsubscribe rate exceeds 2%',
      expectedROAS: 4.0,
      expectedCTR: 2.0,
      expectedCVR: 3.5,
      status: 'LOSER' as const,
      metaCampaignId: 'camp_demo_004',
      launchedAt: new Date('2026-02-25'),
      closedAt: new Date('2026-03-04'),
      actualROAS: 1.8,
      actualCTR: 1.2,
      actualCVR: 1.5,
      actualSpend: 1500,
      actualRevenue: 2700,
      delta: -2.2,
      verdict: 'LOSS' as const,
      lesson: 'Scarcity on a commodity product backfired. The weekly box is ALWAYS available — customers know this. Fake scarcity eroded trust and CTR tanked. Key learning: scarcity only works when the audience believes the constraint is real. For recurring/commodity products, use commitment/consistency ("lock in your weekly order") instead of artificial urgency. Never use scarcity on products with predictable restock.',
      triggerEffective: false,
    },
    // ── LOSER 2: Identity tribal on wrong audience ──
    {
      id: 'demo-hyp-005',
      clientId: client.id,
      title: 'Tribal identity "carnivore lifestyle" for health-conscious segment',
      trigger: 'IDENTITY_TRIBAL' as const,
      triggerMechanism: 'PAIN_AWARE health-conscious audience is looking for dietary solutions. Theory: positioning MNB as the brand for "serious carnivores" creates tribal belonging and converts diet-curious visitors into brand loyalists.',
      awarenessLevel: 'PAIN_AWARE' as const,
      audience: 'Health & wellness interest targeting, 30-50, interested in keto/paleo/carnivore diets',
      funnelStage: 'MOFU' as const,
      creativeAngle: 'Lifestyle imagery of the "carnivore community" with identity language',
      copyHook: "Join 50,000 carnivores who've transformed their health with quality protein.",
      primaryEmotion: 'aspirational',
      primaryObjection: "I'm not sure I'm 'carnivore' enough for this brand",
      conviction: 3,
      budgetUSD: 2500,
      durationDays: 10,
      falsificationCondition: 'We declare this wrong if ROAS < 2.5 after 5 days or CTR < 1.5%',
      expectedROAS: 3.5,
      expectedCTR: 2.0,
      expectedCVR: 2.5,
      status: 'LOSER' as const,
      metaCampaignId: 'camp_demo_005',
      launchedAt: new Date('2026-03-01'),
      closedAt: new Date('2026-03-11'),
      actualROAS: 1.4,
      actualCTR: 0.9,
      actualCVR: 1.0,
      actualSpend: 2300,
      actualRevenue: 3220,
      delta: -2.1,
      verdict: 'LOSS' as const,
      lesson: 'Tribal identity was the wrong trigger for this audience. The health-conscious segment is PAIN_AWARE, not identity-seeking. They want solutions, not tribal membership. The "carnivore" label actually created REACTANCE — it felt exclusionary to people still exploring dietary options. Should have used COGNITIVE_EASE (simple meal plans with quality protein) or RECIPROCITY (free guide on protein-forward eating). Never assume a diet-curious audience is ready for tribal identity framing.',
      triggerEffective: false,
    },
    // ── LIVE: Currently running ──
    {
      id: 'demo-hyp-006',
      clientId: client.id,
      title: 'Endowment effect via free sample offer for first-time buyers',
      trigger: 'ENDOWMENT_EFFECT' as const,
      triggerMechanism: 'SOLUTION_AWARE audience knows premium meat exists but hasn\'t tried MNB specifically. A free sample with first order lets them "own" the experience before committing to full price. Once they taste the difference, the endowment effect makes it psychologically harder to go back to grocery store meat.',
      awarenessLevel: 'SOLUTION_AWARE' as const,
      audience: 'Cold prospects from lookalike audiences based on top 10% LTV customers, no prior purchase',
      funnelStage: 'MOFU' as const,
      creativeAngle: 'UGC-style unboxing showing the free sample alongside their first order',
      copyHook: "Your first order comes with a free 8oz New York Strip — on us. Try the difference.",
      primaryEmotion: 'curious',
      primaryObjection: "Is it worth paying more than my local butcher/grocery?",
      conviction: 4,
      budgetUSD: 4000,
      durationDays: 14,
      falsificationCondition: 'We declare this wrong if ROAS < 2.0 after 7 days or new customer CAC > $80',
      expectedROAS: 3.5,
      expectedCTR: 2.2,
      expectedCVR: 3.0,
      status: 'LIVE' as const,
      metaCampaignId: 'camp_demo_006',
      launchedAt: new Date('2026-03-10'),
      closedAt: null,
      actualROAS: null,
      actualCTR: null,
      actualCVR: null,
      actualSpend: null,
      actualRevenue: null,
      delta: null,
      verdict: null,
      lesson: null,
      triggerEffective: null,
    },
  ];

  for (const h of hypotheses) {
    await prisma.campaignHypothesis.upsert({
      where: { id: h.id },
      update: {},
      create: h,
    });
  }

  console.log(`  ✓ ${hypotheses.length} hypotheses seeded`);

  // Seed TriggerScores from closed hypotheses
  const triggerScoreData = [
    { trigger: 'LOSS_AVERSION' as const, vertical: 'FOOD_BEVERAGE' as const, awarenessLevel: 'PAIN_AWARE' as const, sampleSize: 8, wins: 5, losses: 3, winRate: 0.625, avgROASDelta: 0.4, confidenceLevel: 'LOW' },
    { trigger: 'SOCIAL_PROOF_AUTHORITY' as const, vertical: 'FOOD_BEVERAGE' as const, awarenessLevel: 'PRODUCT_AWARE' as const, sampleSize: 12, wins: 9, losses: 3, winRate: 0.75, avgROASDelta: 1.2, confidenceLevel: 'MEDIUM' },
    { trigger: 'CURIOSITY_GAP' as const, vertical: 'FOOD_BEVERAGE' as const, awarenessLevel: 'SOLUTION_AWARE' as const, sampleSize: 6, wins: 4, losses: 2, winRate: 0.667, avgROASDelta: 0.6, confidenceLevel: 'LOW' },
    { trigger: 'SCARCITY' as const, vertical: 'FOOD_BEVERAGE' as const, awarenessLevel: 'PRODUCT_AWARE' as const, sampleSize: 5, wins: 1, losses: 4, winRate: 0.2, avgROASDelta: -1.5, confidenceLevel: 'LOW' },
    { trigger: 'IDENTITY_TRIBAL' as const, vertical: 'FOOD_BEVERAGE' as const, awarenessLevel: 'PAIN_AWARE' as const, sampleSize: 4, wins: 1, losses: 3, winRate: 0.25, avgROASDelta: -1.8, confidenceLevel: 'LOW' },
    { trigger: 'ENDOWMENT_EFFECT' as const, vertical: 'FOOD_BEVERAGE' as const, awarenessLevel: 'SOLUTION_AWARE' as const, sampleSize: 3, wins: 2, losses: 1, winRate: 0.667, avgROASDelta: 0.3, confidenceLevel: 'LOW' },
  ];

  for (const ts of triggerScoreData) {
    await prisma.triggerScore.upsert({
      where: {
        trigger_vertical_awarenessLevel: {
          trigger: ts.trigger,
          vertical: ts.vertical,
          awarenessLevel: ts.awarenessLevel,
        },
      },
      update: ts,
      create: ts,
    });
  }

  console.log(`  ✓ ${triggerScoreData.length} trigger scores seeded`);

  // Seed a TrackRecord
  await prisma.trackRecord.upsert({
    where: { id: 'demo-track-mnb' },
    update: {},
    create: {
      id: 'demo-track-mnb',
      clientId: client.id,
      period: 'all-time',
      totalHypotheses: 5,
      wins: 3,
      losses: 2,
      inconclusive: 0,
      winRate: 0.6,
      avgWinROAS: 5.6,
      avgLossROAS: 1.6,
      avgExpectedROAS: 4.2,
      expectedValue: 1.76,
      sharpeEquivalent: 0.85,
      alpha: 1.26,
      totalSpend: 13800,
      totalRevenue: 67600,
    },
  });

  console.log('  ✓ Track record seeded');
  console.log('✅ 0to1 seed complete');
}

seed0to1()
  .catch((e) => {
    console.error('0to1 seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
