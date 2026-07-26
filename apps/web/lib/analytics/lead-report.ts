import { attributionChannelLabel, type AttributionChannel } from "./attribution";

export type LeadAttributionInput = {
  analytics_consent: string;
  attribution_campaign: string | null;
  attribution_channel: AttributionChannel;
  attribution_source: string;
  is_test: boolean;
  status: string;
};

export type LeadSourceSummary = {
  key: string;
  channel: AttributionChannel;
  channelLabel: string;
  source: string;
  leads: number;
  converted: number;
  conversionRate: number;
};

export function buildLeadAttributionReport(rows: LeadAttributionInput[]) {
  const leads = rows.filter((row) => !row.is_test);
  const sourceMap = new Map<string, LeadSourceSummary>();
  const campaignMap = new Map<string, { campaign: string; source: string; leads: number; converted: number }>();

  for (const lead of leads) {
    const sourceKey = `${lead.attribution_channel}|${lead.attribution_source}`;
    const source = sourceMap.get(sourceKey) ?? {
      key: sourceKey,
      channel: lead.attribution_channel,
      channelLabel: attributionChannelLabel(lead.attribution_channel),
      source: lead.attribution_source,
      leads: 0,
      converted: 0,
      conversionRate: 0
    };

    source.leads += 1;
    if (lead.status === "converted") source.converted += 1;
    sourceMap.set(sourceKey, source);

    if (lead.attribution_campaign) {
      const campaignKey = `${lead.attribution_source}|${lead.attribution_campaign}`;
      const campaign = campaignMap.get(campaignKey) ?? {
        campaign: lead.attribution_campaign,
        source: lead.attribution_source,
        leads: 0,
        converted: 0
      };

      campaign.leads += 1;
      if (lead.status === "converted") campaign.converted += 1;
      campaignMap.set(campaignKey, campaign);
    }
  }

  const sources = [...sourceMap.values()]
    .map((source) => ({
      ...source,
      conversionRate: percentage(source.converted, source.leads)
    }))
    .sort((left, right) => right.leads - left.leads || left.source.localeCompare(right.source));
  const campaigns = [...campaignMap.values()]
    .map((campaign) => ({
      ...campaign,
      conversionRate: percentage(campaign.converted, campaign.leads)
    }))
    .sort((left, right) => right.leads - left.leads || left.campaign.localeCompare(right.campaign))
    .slice(0, 10);
  const converted = leads.filter((lead) => lead.status === "converted").length;

  return {
    totalLeads: leads.length,
    converted,
    conversionRate: percentage(converted, leads.length),
    attributedLeads: leads.filter((lead) => lead.attribution_channel !== "direct").length,
    analyticsConsentRate: percentage(leads.filter((lead) => lead.analytics_consent === "granted").length, leads.length),
    sources,
    campaigns
  };
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
