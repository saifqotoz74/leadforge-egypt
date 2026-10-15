import { prisma } from './db';
import { createInAppNotification } from './notifications';
import { sendMatchingLeadsAlertEmailSafe } from './email-templates';
import { cleanArabicText } from './programmatic';

export interface LeadAlertPayload {
  id: string;
  businessName: string;
  category: string;
  city: string;
  governorate?: string | null;
}

export interface NotifyDevelopersOptions {
  forceInTest?: boolean;
}

/**
 * Evaluates active developers matching the new lead's criteria (city and category),
 * creates in-app notifications, and dispatches email alerts via Resend.
 */
export async function notifyDevelopersOfNewLead(
  lead: LeadAlertPayload,
  options?: NotifyDevelopersOptions
): Promise<{
  notifiedCount: number;
  developerIds: string[];
}> {
  if (!options?.forceInTest && (process.env.NODE_ENV === 'test' || process.env.VITEST)) {
    return { notifiedCount: 0, developerIds: [] };
  }
  try {
    const activeDevelopers = await prisma.developerProfile.findMany({
      where: {
        isActive: true,
        isAcceptingLeads: true,
        user: {
          status: 'ACTIVE',
          subscription: {
            status: 'ACTIVE',
            plan: {
              slug: { in: ['pro', 'business', 'agency'] },
            },
          },
        },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    const notifiedDevIds: string[] = [];

    const leadCityClean = cleanArabicText(lead.city);
    const leadGovClean = lead.governorate ? cleanArabicText(lead.governorate) : '';
    const leadCatClean = cleanArabicText(lead.category);

    const matchingDevs = activeDevelopers.filter((dev) => {
      if (!dev.user?.email) return false;

      // 1. Location Matching
      const locMatch =
        dev.allLocationsMode ||
        dev.locations.length === 0 ||
        dev.locations.some((loc) => {
          const l = loc.trim().toLowerCase();
          const lClean = cleanArabicText(loc);
          return (
            l === lead.city.toLowerCase() ||
            lClean === leadCityClean ||
            (lead.governorate && (l === lead.governorate.toLowerCase() || lClean === leadGovClean)) ||
            lead.city.toLowerCase().includes(l) ||
            leadCityClean.includes(lClean) ||
            (lead.governorate && lead.governorate.toLowerCase().includes(l))
          );
        });

      if (!locMatch) return false;

      // 2. Niche Matching
      const nicheMatch =
        dev.allNichesMode ||
        dev.niches.length === 0 ||
        dev.niches.some((n) => {
          const nClean = cleanArabicText(n);
          return (
            n.trim().toLowerCase() === lead.category.trim().toLowerCase() ||
            nClean === leadCatClean ||
            leadCatClean.includes(nClean)
          );
        });

      return nicheMatch;
    });

    await Promise.all(
      matchingDevs.map(async (dev) => {
        notifiedDevIds.push(dev.userId);

        // In-App Notification (Idempotent per lead + developer)
        await createInAppNotification({
          userId: dev.userId,
          title: '🎯 فرصة جديدة متوافقة مع تخصصك!',
          message: `تم رصد فرصة جديدة "${lead.businessName}" في ${lead.city} بتصنيف (${lead.category}) تتوافق مع معاييرك.`,
          type: 'MATCHED_LEADS',
          link: `/leads/${lead.id}`,
          idempotencyKey: `lead-alert:${lead.id}:${dev.userId}`,
        }).catch((err) => {
          console.error('[InApp Notification Error]:', err);
        });

        // Transactional Email via Resend
        await sendMatchingLeadsAlertEmailSafe({
          email: dev.user.email,
          name: dev.user.name || 'مطور LeadForge',
          count: 1,
          city: lead.city,
          businessName: lead.businessName,
          category: lead.category,
          leadId: lead.id,
        }).catch((err) => {
          console.error('[Email Dispatch Error]:', err);
        });
      })
    );

    return {
      notifiedCount: notifiedDevIds.length,
      developerIds: notifiedDevIds,
    };
  } catch (err) {
    console.error('[notifyDevelopersOfNewLead Error]:', err);
    return { notifiedCount: 0, developerIds: [] };
  }
}
