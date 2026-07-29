import { attributionChannelLabel, type AttributionChannel } from "./attribution";

export type CampaignFunnelInput = {
  intakeId: string;
  receivedAt: string;
  duplicateState: string;
  attributionChannel: AttributionChannel;
  source: string;
  medium: string | null;
  campaign: string | null;
  isTest: boolean;
  journeyRunId: string | null;
  recordSource: string;
  hasLineage: boolean;
  placementMethod: string | null;
  placedAt: string | null;
  enrollmentStarted: boolean;
  trialCompleted: boolean;
  activeSubscription: boolean;
  payments: Array<{
    currency: string;
    amountCents: number;
    refundedCents: number;
    chargebackCents: number;
    status: string;
    paidOn: string | null;
  }>;
};

export type CampaignFunnelRow = {
  key: string;
  channel: AttributionChannel;
  channelLabel: string;
  source: string;
  medium: string;
  campaign: string;
  intakes: number;
  trials: number;
  placements: number;
  started: number;
  activeSubscriptions: number;
  payingLeads: number;
  placementConversion: number;
  subscriptionConversion: number;
  netReceivedByCurrency: Record<string, number>;
  confidence: "high" | "medium" | "low";
  confidenceReasons: string[];
};

export function buildCampaignRevenueReport(input: {
  rows: CampaignFunnelInput[];
  from: string;
  to: string;
}) {
  const eligible = input.rows.filter((row) =>
    row.receivedAt >= `${input.from}T00:00:00` &&
    row.receivedAt <= `${input.to}T23:59:59.999` &&
    row.duplicateState !== "confirmed_duplicate" &&
    !row.isTest &&
    row.journeyRunId === null &&
    row.recordSource !== "journey_simulation_bot"
  );
  const grouped = new Map<string, CampaignFunnelRow>();
  let orphanConvertedEvidence = 0;

  for (const row of eligible) {
    const medium = row.medium || "none";
    const campaign = row.campaign || "geen campagne";
    const key = [row.attributionChannel, row.source, medium, campaign].join("|");
    const current = grouped.get(key) ?? {
      key,
      channel: row.attributionChannel,
      channelLabel: attributionChannelLabel(row.attributionChannel),
      source: row.source,
      medium,
      campaign,
      intakes: 0,
      trials: 0,
      placements: 0,
      started: 0,
      activeSubscriptions: 0,
      payingLeads: 0,
      placementConversion: 0,
      subscriptionConversion: 0,
      netReceivedByCurrency: {},
      confidence: attributionConfidence(row),
      confidenceReasons: attributionConfidenceReasons(row)
    } satisfies CampaignFunnelRow;

    current.intakes += 1;
    if (row.trialCompleted) current.trials += 1;
    if (row.hasLineage) current.placements += 1;
    if (row.hasLineage && row.enrollmentStarted) current.started += 1;
    if (row.hasLineage && row.activeSubscription) current.activeSubscriptions += 1;
    const netPayments = row.hasLineage ? row.payments.filter((payment) =>
      payment.paidOn !== null &&
      ["paid", "refunded", "chargeback"].includes(payment.status)
    ) : [];
    if (netPayments.some((payment) => netReceived(payment) > 0)) current.payingLeads += 1;
    for (const payment of netPayments) {
      current.netReceivedByCurrency[payment.currency] =
        (current.netReceivedByCurrency[payment.currency] ?? 0) + netReceived(payment);
    }
    grouped.set(key, current);
    if (!row.hasLineage && (row.placementMethod || row.placedAt)) orphanConvertedEvidence += 1;
  }

  const campaigns = [...grouped.values()]
    .map((row) => ({
      ...row,
      placementConversion: percentage(row.placements, row.intakes),
      subscriptionConversion: percentage(row.activeSubscriptions, row.intakes)
    }))
    .sort((left, right) => right.intakes - left.intakes || right.placements - left.placements || left.key.localeCompare(right.key));

  return {
    cohort: { from: input.from, to: input.to },
    visitors: null,
    visitorsExplanation: "Bezoekers niet beschikbaar — NXTTRACK maakt zonder toestemming geen bezoekersprofielen.",
    totalIntakes: eligible.length,
    totalTrials: campaigns.reduce((sum, row) => sum + row.trials, 0),
    totalPlacements: campaigns.reduce((sum, row) => sum + row.placements, 0),
    totalActiveSubscriptions: campaigns.reduce((sum, row) => sum + row.activeSubscriptions, 0),
    netReceivedByCurrency: mergeMoney(campaigns.map((row) => row.netReceivedByCurrency)),
    orphanConvertedEvidence,
    campaigns
  };
}

function attributionConfidence(row: CampaignFunnelInput): "high" | "medium" | "low" {
  if (row.campaign && row.source !== "direct") return "high";
  if (row.attributionChannel === "referral" || row.attributionChannel === "organic_search") return "medium";
  return "low";
}

function attributionConfidenceReasons(row: CampaignFunnelInput) {
  if (row.campaign && row.source !== "direct") return ["Expliciete first-party campagneparameters bij verzonden intake."];
  if (row.attributionChannel === "referral" || row.attributionChannel === "organic_search") return ["Bron is afgeleid uit een privacy-veilige referrer-host."];
  return ["Geen expliciete campagneparameter; bron is direct of onbekend."];
}

function netReceived(payment: CampaignFunnelInput["payments"][number]) {
  return Math.max(0, payment.amountCents - payment.refundedCents - payment.chargebackCents);
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function mergeMoney(rows: Record<string, number>[]) {
  return rows.reduce<Record<string, number>>((result, row) => {
    for (const [currency, cents] of Object.entries(row)) result[currency] = (result[currency] ?? 0) + cents;
    return result;
  }, {});
}
