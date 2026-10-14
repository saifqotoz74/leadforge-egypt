import { prisma } from './db';
import { createInAppNotification } from './notifications';
import { sendMatchingLeadsAlertEmailSafe } from './email-templates';

export interface LeadAlertPayload {
  id: string;
  businessName: string;
  category: string;
  city: string;
  governorate?: string | null;
}

/**
 * Evaluates active developers matching the new lead's criteria (city and category),
 * creates in-app notifications, and dispatches email alerts via Resend.
 */
export async function notifyDevelopersOfNewLead(lead: LeadAlertPayload): Promise<{
  notifiedCount: number;
  developerIds: string[];
}> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return { notifiedCount: 0, developerIds: [] };
  }
  try {
    const activeDevelopers = await prisma.developerProfile.findMany({
      where: {
        isActive: true,
        isAcceptingLeads: true,
        user: { status: 'ACTIVE' },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    const notifiedDevIds: string[] = [];

    for (const dev of activeDevelopers) {
      if (!dev.user?.email) continue;

      // 1. Location Matching
      const locMatch =
        dev.allLocationsMode ||
        dev.locations.length === 0 ||
        dev.locations.some((loc) => {
          const l = loc.trim().toLowerCase();
          return (
            l === lead.city.toLowerCase() ||
            (lead.governorate && l === lead.governorate.toLowerCase()) ||
            lead.city.toLowerCase().includes(l) ||
            (lead.governorate && lead.governorate.toLowerCase().includes(l))
          );
        });

      if (!locMatch) continue;

      // 2. Niche Matching
      const nicheMatch =
        dev.allNichesMode ||
        dev.niches.length === 0 ||
        dev.niches.some((n) => n.trim().toLowerCase() === lead.category.trim().toLowerCase());

      if (!nicheMatch) continue;

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
    }

    return {
      notifiedCount: notifiedDevIds.length,
      developerIds: notifiedDevIds,
    };
  } catch (err) {
    console.error('[notifyDevelopersOfNewLead Error]:', err);
    return { notifiedCount: 0, developerIds: [] };
  }
}
